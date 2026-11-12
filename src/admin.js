/**
 * 后台管理：站点设置、文章、独立页面、分类、标签、评论、友链、用户
 * 前台所有可见内容均由这里维护
 */
import {
  html,
  redirect,
  backMsg,
  backErr,
  errorOf,
  escapeHtml as e,
  safeUrl,
  field,
  listField,
  intField,
  intParam,
  readForm,
  pageInfo,
  statusFilter,
  pager,
  now,
  fmtDate,
  slugify,
  uniqueSlug,
  slugForEdit,
  slugHref,
  changed,
  forbidden,
  sameOrigin,
  likePattern,
  excerpt,
  all,
  first,
  countOf,
  run,
  getOptions,
  createSession,
  refreshSession,
  clearSession,
  getSession,
  isAdmin,
  hashPassword,
  attemptLogin,
  LOGIN_THROTTLE_MESSAGE,
  saveProfile,
  initAccount,
  POST_STATUSES,
  statusPill,
  normalizeStatement,
  validateTitleContent,
  validateScreenname,
  screennameTaken,
  validateMail,
  PASSWORD_MIN_LENGTH,
  CONTENT_MAX_LENGTH,
  SCREENNAME_MAX_LENGTH,
  normalizePostStatus,
  normalizeCreated,
  parseTagNames,
  tagNamesOf,
  frontUrl,
  deletePostCascade,
  saveTags,
  getGroups,
  getLevels,
  resolveGroup,
  badgeFile,
  iconImageTag,
  BADGE_DIR,
  NOW_SQL,
  insertPost,
  validCategoryId,
  UNCATEGORIZED_NAME,
  POST_COUNT_COLUMNS,
  clearLoginFailuresOf,
} from './lib.js';
import {
  MENUS,
  MENU_KEYS,
  menuOfPath,
  visibleMenuKeys,
  pageFrame,
  adminPage,
  emptyRow,
  missingPage,
  deleteForm,
  statusToggle,
  bulkButton,
  bulkCheckAll,
  bulkCheck,
  bulkDelete,
  listShell,
  safeNext,
  editForm,
  deleteOne,
  saveRow,
} from './admin/layout.js';
import {
  SETTING_GROUPS,
  FEATURE_GROUPS,
  optionsPage,
  saveSettings,
  optionsReset,
  featuresPage,
  featuresBackup,
} from './admin/settings.js';
import { pubBody, PUB_SCRIPT } from './theme.js';

async function loginPage(env, session, error = '', next = '') {
  const options = await getOptions(env);
  const body = `<div class="wb-login">
  <div class="wb-card wb-form wb-login-box">
    <h1>后台登录</h1>
    ${error ? `<div class="wb-notice err">${e(error)}</div>` : ''}
    <form method="post" action="/admin/login">
      ${next ? `<input type="hidden" name="next" value="${e(next)}">` : ''}
      <div class="field"><label>用户名</label><input type="text" name="userName" autocomplete="off" required></div>
      <div class="field"><label>密码</label><input type="password" name="password" required></div>
      <button class="wb-btn p" style="width:100%;" type="submit">登录</button>
    </form>
    <p style="margin-top:8px;"><a href="/">← 返回前台</a></p>
  </div>
</div>`;
  return pageFrame(options, session, '后台登录', body);
}

/* ---------------- 初始化账号（内置 admin / admin123 首次登录后台时的强制页） ---------------- */

const INIT_PATH = '/admin/init';

async function initPage(env, user, url) {
  const body = `
  <form class="wb-card wb-form wb-form-wide" method="post" action="${INIT_PATH}">
    <h1>初始化账号</h1>
    <div class="tip">当前账号仍在使用部署时内置的初始口令（admin / admin123），任何人都可以凭它登录后台。请先设置自己的用户名与新密码，保存后方可使用后台。</div>
    <div class="cols">
      <div class="field"><label>当前用户名</label><input type="text" value="${e(user.username)}" disabled></div>
      <div class="field"><label>新用户名</label><input type="text" name="username" value="${e(user.username)}" required></div>
    </div>
    <div class="cols">
      <div class="field"><label>新密码</label><input type="password" name="password" autocomplete="new-password" placeholder="至少 ${PASSWORD_MIN_LENGTH} 位" required></div>
      <div class="field"><label>确认新密码</label><input type="password" name="password2" autocomplete="new-password" required></div>
    </div>
    <div class="inline" style="margin-top:16px"><button class="wb-btn p" type="submit">保存并进入后台</button><a class="wb-btn" href="/admin/logout">退出登录</a></div>
  </form>`;
  return adminPage(env, user, INIT_PATH, '初始化账号', body, url);
}

async function initSave(env, request, currentUser) {
  const form = await readForm(request);
  const me = await first(env, 'SELECT * FROM user WHERE userid = ?', [currentUser.userid]);
  if (!me) return redirect('/admin/login');
  const error = await initAccount(env, me, {
    username: field(form, 'username'),
    password: field(form, 'password'),
    confirm: field(form, 'password2'),
  });
  if (error) return backErr(INIT_PATH, error);
  // 初始化会同时改用户名与口令，旧 Cookie 的指纹已失效：重签后台会话，直接进入后台
  return backMsg('/admin', '账号已初始化，请牢记新的用户名与密码', await refreshSession(env, currentUser.userid, { admin: true }));
}

/* ---------------- 仪表盘 ---------------- */

async function dashboard(env, user, url) {
  // 11 个计数互不依赖，并发查询避免串行往返；取值口径统一走 countOf
  const countSqls = {
    posts: `SELECT COUNT(*) c FROM post WHERE is_page = 0 AND status = 'publish' AND created <= ${NOW_SQL}`,
    // 与「已发布文章」同口径：草稿 / 私密页面不在前台展示，不该计入「独立页面」总数
    pages: "SELECT COUNT(*) c FROM post WHERE is_page = 1 AND status = 'publish'",
    drafts: "SELECT COUNT(*) c FROM post WHERE is_page = 0 AND status = 'draft'",
    privatePosts: "SELECT COUNT(*) c FROM post WHERE is_page = 0 AND status = 'private'",
    pendingPosts: "SELECT COUNT(*) c FROM post WHERE is_page = 0 AND status = 'pending'",
    comments: 'SELECT COUNT(*) c FROM comment',
    pending: "SELECT COUNT(*) c FROM comment WHERE status = 'pending'",
    categories: 'SELECT COUNT(*) c FROM category',
    tags: 'SELECT COUNT(*) c FROM tag',
    links: 'SELECT COUNT(*) c FROM link',
    users: 'SELECT COUNT(*) c FROM user',
  };
  const stats = Object.fromEntries(
    await Promise.all(Object.entries(countSqls).map(async ([key, sql]) => [key, await countOf(env, sql)]))
  );
  const hot = await all(
    env,
    `SELECT pid, title, views FROM post WHERE is_page = 0 AND status = 'publish' AND created <= ${NOW_SQL} ORDER BY views DESC LIMIT 5`
  );
  const recent = await all(
    env,
    "SELECT coid, author, content, created, status FROM comment ORDER BY coid DESC LIMIT 5"
  );
  const body = `
  <div class="wb-card wb-card-pad"><h3>快捷操作</h3>
    <div class="inline">
      <a class="wb-btn p" href="/admin/posts/new">写文章</a>
      <a class="wb-btn" href="/admin/posts?status=pending">审核文章 (${stats.pendingPosts})</a>
      <a class="wb-btn" href="/admin/options">站点设置</a>
      <a class="wb-btn" href="/admin/comments?status=pending">审核评论 (${stats.pending})</a>
      <a class="wb-btn" href="/admin/links">管理友链</a>
    </div>
  </div>
  <div class="wb-stats">
    <div class="wb-card wb-stat"><b>${stats.posts}</b><span>已发布文章</span></div>
    <div class="wb-card wb-stat"><b>${stats.pendingPosts}</b><span>待审文章</span></div>
    <div class="wb-card wb-stat"><b>${stats.drafts}</b><span>草稿</span></div>
    <div class="wb-card wb-stat"><b>${stats.privatePosts}</b><span>私密文章</span></div>
    <div class="wb-card wb-stat"><b>${stats.pages}</b><span>独立页面</span></div>
    <div class="wb-card wb-stat"><b>${stats.comments}</b><span>评论总数</span></div>
    <div class="wb-card wb-stat"><b>${stats.pending}</b><span>待审核评论</span></div>
    <div class="wb-card wb-stat"><b>${stats.categories}</b><span>分类</span></div>
    <div class="wb-card wb-stat"><b>${stats.tags}</b><span>标签</span></div>
    <div class="wb-card wb-stat"><b>${stats.links}</b><span>友情链接</span></div>
    <div class="wb-card wb-stat"><b>${stats.users}</b><span>用户</span></div>
  </div>
  <div class="cols">
    <div class="wb-card wb-card-pad"><h3>浏览最多</h3>
      <table class="wb-table"><tbody>
      ${hot.length ? hot.map((p) => `<tr><td><a href="/archives/${p.pid}" target="_blank">${e(p.title)}</a></td><td style="width:70px;text-align:right">${p.views}</td></tr>`).join('') : emptyRow(2, '暂无已发布文章')}
      </tbody></table>
    </div>
    <div class="wb-card wb-card-pad"><h3>最新评论</h3>
      <table class="wb-table"><tbody>
      ${
        recent.length
          ? recent
              .map(
                (c) =>
                  `<tr><td>${e(excerpt(c.content, 40))}<div class="muted">${e(c.author)} · ${fmtDate(c.created)} ${
                    c.status === 'pending' ? '<span class="wb-pill pending">待审核</span>' : ''
                  }</div></td></tr>`
              )
              .join('')
          : emptyRow(1, '暂无评论')
      }
      </tbody></table>
    </div>
  </div>`;
  return adminPage(env, user, '/admin', '仪表盘', body, url);
}

/* ---------------- 文章 / 独立页面 ---------------- */

async function postList(env, user, url, isPage) {
  const size = 15;
  const q = (url.searchParams.get('q') || '').trim();
  // 独立页面不提供状态筛选（只有发布 / 草稿），传空值即回落「全部」
  const { status, where: statusWhere, params: statusParams } = statusFilter(
    isPage ? '' : url.searchParams.get('status'),
    POST_STATUSES,
    'p.status'
  );
  const filters = ['p.is_page = ?'];
  const params = [isPage ? 1 : 0];
  if (q) {
    // 关键词里的 % _ 必须先转义，否则会被 LIKE 当成通配符（搜 % 等于列出全部内容）
    filters.push("(p.title LIKE ? ESCAPE '\\' OR p.content LIKE ? ESCAPE '\\')");
    const like = likePattern(q);
    params.push(like, like);
  }
  filters.push(statusWhere);
  params.push(...statusParams);
  const where = filters.join(' AND ');
  const { page, total, totalPages } = await pageInfo(env, url, size, `SELECT COUNT(*) c FROM post p WHERE ${where}`, params);
  const pendingCount = isPage
    ? 0
    : await countOf(env, "SELECT COUNT(*) c FROM post WHERE is_page = 0 AND status = 'pending'");
  const rows = await all(
    env,
    `SELECT p.*, c.name AS category_name,
            ${POST_COUNT_COLUMNS}
     FROM post p LEFT JOIN category c ON c.cid = p.category_id
     WHERE ${where}
     ORDER BY p.is_top DESC, p.pid DESC LIMIT ? OFFSET ?`,
    [...params, size, (page - 1) * size]
  );

  const title = isPage ? '独立页面' : '文章管理';
  const base = isPage ? '/admin/pages' : '/admin/posts';
  const query = new URLSearchParams();
  if (q) query.set('q', q);
  if (status !== 'all') query.set('status', status);
  const tabs = isPage
    ? ''
    : `<div class="inline">
      <a class="wb-btn ${status === 'all' ? 'p' : ''}" href="${base}">全部</a>
      <a class="wb-btn ${status === 'publish' ? 'p' : ''}" href="${base}?status=publish">已发布</a>
      <a class="wb-btn ${status === 'pending' ? 'p' : ''}" href="${base}?status=pending">待审核 (${pendingCount})</a>
      <a class="wb-btn ${status === 'draft' ? 'p' : ''}" href="${base}?status=draft">草稿</a>
      <a class="wb-btn ${status === 'private' ? 'p' : ''}" href="${base}?status=private">私密</a>
      </div>`;
  const bulkId = isPage ? 'bulk-pages' : 'bulk-posts';
  // 独立页面列表顶部的系统内置页面（不落库、不可编辑删除）：站点信息页由「站点设置」动态渲染
  const systemRows = isPage
    ? `<tr>
      <td></td>
      <td><a href="/site" target="_blank">站点信息</a>
        <div class="muted">/site</div></td>
      <td>—</td>
      <td>—</td>
      <td>—</td>
      <td>—</td>
      <td><span class="wb-pill">系统</span></td>
      <td class="row-actions"><a class="wb-btn sm" href="/site" target="_blank">前台查看</a></td>
    </tr>`
    : '';
  const body = listShell({
    bulkId,
    bulkAction: `${base}/bulk-delete`,
    tools: `${tabs}
    <div class="inline">
      <form class="inline" method="get" action="${base}">
        ${status !== 'all' ? `<input type="hidden" name="status" value="${e(status)}">` : ''}
        <input type="text" name="q" value="${e(q)}" placeholder="搜索标题或正文">
        <button class="wb-btn" type="submit">搜索</button>
      </form>
      ${bulkButton(bulkId)}
      <a class="wb-btn p" href="${base}/new">${isPage ? '新建页面' : '写文章'}</a>
    </div>`,
    head: `${bulkCheckAll(bulkId)}<th>标题</th><th style="width:11%">分类</th><th style="width:7%">评论</th><th style="width:7%">浏览</th><th style="width:16%">时间</th><th style="width:8%">状态</th><th style="width:20%">操作</th>`,
    prepend: systemRows,
    rows: rows.map(
      (p) => `<tr>
      ${bulkCheck(bulkId, p.pid)}
      <td><a href="${e(frontUrl(p))}" target="_blank">${e(p.title)}</a>${p.is_top ? ' <span class="wb-pill">置顶</span>' : ''}${p.repost_pid ? ' <span class="wb-pill">转发</span>' : ''}
        <div class="muted">${isPage ? '/page/' : '/archives/'}${e(p.slug || String(p.pid))}</div></td>
      <td>${e(p.category_name || UNCATEGORIZED_NAME)}</td>
      <td>${p.comments_num}</td>
      <td>${p.views}</td>
      <td>${fmtDate(p.created)}</td>
      <td>${statusPill(p.status)}</td>
      <td class="row-actions">
        ${statusToggle({
          action: `${base}/status`,
          name: 'pid',
          value: p.pid,
          status: p.status,
          active: 'publish',
          // 保留当前筛选状态，审核后跳回同一列表位置
          extra: { from: status },
          idleText: '',
          reject: { status: 'draft', label: '驳回' },
        })}
        <a class="wb-btn sm" href="${base}/edit?id=${p.pid}">编辑</a>
        <form method="post" action="${base}/delete" data-title="${e(p.title)}" onsubmit="return confirm('确定删除《' + this.dataset.title + '》吗？');" style="display:inline">
          <input type="hidden" name="pid" value="${p.pid}">
          <button class="wb-btn d sm" type="submit">删除</button>
        </form>
      </td></tr>`
    ),
    colspan: 8,
    emptyText: isPage ? '暂无自定义页面' : '暂无内容',
    foot: pager({ base, page, totalPages, total, query: query.toString(), variant: 'admin' }),
  });
  return adminPage(env, user, isPage ? '/admin/pages' : '/admin/posts', title, body, url);
}

async function postForm(env, user, url, isPage) {
  const id = intParam(url, 'id');
  const base = isPage ? '/admin/pages' : '/admin/posts';
  const title = `${id ? '编辑' : '新建'}${isPage ? '页面' : '文章'}`;
  // is_page 参与匹配：打开 /admin/pages/edit?id=<文章id> 时按「页面不存在」处理，避免串改另一类内容
  const post = id ? await first(env, 'SELECT * FROM post WHERE pid = ? AND is_page = ?', [id, isPage ? 1 : 0]) : null;
  if (id && !post) return missingPage(env, user, base, title, isPage ? '页面' : '文章');
  const categories = await all(env, 'SELECT * FROM category ORDER BY ordernum, cid');
  const tags = post ? (await tagNamesOf(env, id)).join(',') : '';
  const authors = await all(env, 'SELECT userid, screenname, username, role FROM user ORDER BY userid');
  const currentAuthor = post ? post.author_id : user.userid;
  const body = `
  <form class="wb-card wb-form wb-form-wide" method="post" action="${base}/save" data-pub>
    <input type="hidden" name="pid" value="${post ? post.pid : 0}">
    <div class="field"><label>标题</label><input type="text" name="title" value="${e(post ? post.title : '')}" required></div>
    <div class="field"><label>别名（URL，可留空自动生成）</label><input type="text" name="slug" value="${e(post ? post.slug : '')}" placeholder="my-first-post"></div>
    <div class="cols">
      <div class="field"><label>分类</label>
        <select name="category_id">
          <option value="0">${UNCATEGORIZED_NAME}</option>
          ${categories
            .map(
              (c) =>
                `<option value="${c.cid}" ${post && post.category_id === c.cid ? 'selected' : ''}>${e(c.name)}</option>`
            )
            .join('')}
        </select>
      </div>
      <div class="field"><label>标签（英文逗号分隔）</label><input type="text" name="tags" value="${e(tags)}" placeholder="世界杯,梅西"></div>
    </div>
    <div class="field wb-pub-block">
      <label>正文（支持 HTML）</label>
      ${pubBody({
        statement: true,
        showWriteLink: false,
        value: post ? post.content : '',
        placeholder: '正文（支持 HTML）',
        maxlength: CONTENT_MAX_LENGTH,
      })}
      <input type="hidden" name="statement" value="${e(post && post.statement ? post.statement : '')}" data-statement>
      <div class="wb-pub-panel" data-panel hidden></div>
    </div>
    <div class="cols">
      <div class="field"><label>状态</label>
        <select name="status">
          <option value="publish" ${!post || post.status === 'publish' ? 'selected' : ''}>发布</option>
          ${isPage ? '' : `<option value="pending" ${post && post.status === 'pending' ? 'selected' : ''}>待审核</option>`}
          <option value="draft" ${post && post.status === 'draft' ? 'selected' : ''}>草稿</option>
          ${isPage ? '' : `<option value="private" ${post && post.status === 'private' ? 'selected' : ''}>私密</option>`}
        </select>
      </div>
      <div class="field"><label>作者</label>
        <select name="author_id">
          ${authors
            .map(
              (a) =>
                `<option value="${a.userid}" ${currentAuthor === a.userid ? 'selected' : ''}>${e(a.screenname || a.username)}${a.role === 'administrator' ? '（管理员）' : ''}</option>`
            )
            .join('')}
        </select>
      </div>
      <div class="field"><label>发布时间</label>${isPage ? '<div class="hint">页面不支持定时发布：发布时间由系统维护（创建时确定，编辑不改动）。</div>' : `<input type="text" name="created" value="${e(post ? post.created : now())}" placeholder="YYYY-MM-DD HH:mm:ss">`}</div>
    </div>
    <div class="inline" style="gap:20px">
      <label class="inline" style="margin:0"><input type="checkbox" name="allow_comment" value="1" ${!post || post.allow_comment ? 'checked' : ''} style="width:auto"> 允许评论</label>
      ${isPage ? '' : `<label class="inline" style="margin:0"><input type="checkbox" name="is_top" value="1" ${post && post.is_top ? 'checked' : ''} style="width:auto"> 置顶</label>`}
    </div>
    <div class="inline" style="margin-top:16px">
      <button class="wb-btn p" type="submit">保存</button>
      <a class="wb-btn" href="${base}">返回列表</a>
      ${post ? `<a class="wb-btn" href="${e(frontUrl(post))}" target="_blank">前台查看</a>` : ''}
    </div>
  </form>
  ${PUB_SCRIPT}`;
  return adminPage(env, user, base, title, body, url);
}

async function postSave(env, request, user, isPage) {
  const form = await readForm(request);
  const base = isPage ? '/admin/pages' : '/admin/posts';
  const pid = intField(form, 'pid');
  const title = field(form, 'title').trim();
  const content = field(form, 'content');
  // 与前台投稿、审核编辑同一口径（标题 / 正文非空与长度上限）
  const invalid = validateTitleContent(title, content);
  if (invalid) return backErr(base, invalid);
  // 手填别名优先，留空按标题生成；与前台投稿共用 normalizeStatement 的声明白名单口径
  const rawSlug = field(form, 'slug').trim();
  const slugBase = rawSlug || slugify(title, 'post');
  const statement = normalizeStatement(field(form, 'statement'));
  // 分类必须是真实存在的，否则会产出查不到归属的悬空归档（post 表无外键约束，数据库不会拦）
  const categoryId = await validCategoryId(env, intField(form, 'category_id'));
  // 作者必须是真实存在的用户，否则会产出「作者不存在」的孤儿文章
  const rawAuthorId = intField(form, 'author_id');
  const authorRow = rawAuthorId ? await first(env, 'SELECT userid FROM user WHERE userid = ?', [rawAuthorId]) : null;
  const authorId = authorRow ? rawAuthorId : user.userid;
  // 页面只有「发布 / 草稿」两种状态（表单也不提供待审核 / 私密），不接受构造请求写入其它状态
  const rawStatus = field(form, 'status', 'publish');
  const status = isPage ? (rawStatus === 'draft' ? 'draft' : 'publish') : normalizePostStatus(rawStatus);
  const allowComment = field(form, 'allow_comment', '') ? 1 : 0;
  const isTop = field(form, 'is_top', '') ? 1 : 0;
  const rawCreated = field(form, 'created').trim();
  // 只接受有效的 'YYYY-MM-DD HH:mm(:ss)'，非法值（如 9999-99-99 99:99）回退当前时间，
  // 避免脏时间让文章永远不满足 created <= now() 而在前台永久不可见
  const created = normalizeCreated(rawCreated) || now();
  // 页面不支持定时发布：created 仅用于展示，编辑时保持原值、新建时取当前时间
  const finalCreated = isPage
    ? pid
      ? (await first(env, 'SELECT created FROM post WHERE pid = ?', [pid]))?.created || now()
      : now()
    : created;
  const tagNames = parseTagNames(field(form, 'tags'));

  let id = pid;
  if (pid) {
    // 手填别名优先（编辑时排除自己当前的别名，避免与自身冲突而反复追加 -2/-3）；
    // 留空则沿用现有别名：短微博的 weibo- 前缀是前台卡片样式的判定依据，
    // 必须原样保留而不能按新标题重新生成（与前台投稿编辑同一口径）
    let slug;
    if (rawSlug) {
      slug = await uniqueSlug(env, rawSlug, pid);
    } else {
      const stored = await first(env, 'SELECT slug FROM post WHERE pid = ? AND is_page = ?', [pid, isPage ? 1 : 0]);
      slug = await slugForEdit(env, stored ? stored.slug : '', title, pid);
    }
    // is_page 参与匹配：避免用 /admin/pages/save 构造请求改到同 id 的文章（反之亦然）
    const bad = await saveRow(env, base, {
      id: pid,
      update: [
        `UPDATE post SET title=?, slug=?, content=?, statement=?, category_id=?, author_id=?, status=?, allow_comment=?, is_top=?, created=?, modified=? WHERE is_page=? AND pid=?`,
        [title, slug, content, statement, categoryId, authorId, status, allowComment, isTop, finalCreated, now(), isPage ? 1 : 0],
      ],
      // 别名有唯一索引，撞车时给出提示而不是抛成 500
      uniqueErr: '该别名已被其它内容占用，请换一个',
      missingErr: isPage ? '页面不存在' : '文章不存在',
    });
    if (bad) return bad;
  } else {
    // 与前台发布 / 投稿共用同一个 INSERT 入口（含 slug 唯一索引冲突重试）
    const res = await insertPost(env, {
      title,
      content,
      slugBase,
      categoryId,
      authorId,
      created: finalCreated,
      status,
      allowComment,
      isPage: isPage ? 1 : 0,
      isTop,
      statement,
    });
    id = res.meta.last_row_id;
  }

  await saveTags(env, id, tagNames);

  return backMsg(base, pid ? '已保存修改' : '已创建');
}

// isPage 参与匹配：避免用 /admin/posts/delete 构造请求删掉同 id 的独立页面（反之亦然）
const postDelete = (env, request, isPage) =>
  deleteOne(request, isPage ? '/admin/pages' : '/admin/posts', 'pid', (id) =>
    deletePostCascade(env, id, { isPage })
  );

/* ---------------- 分类 / 标签 ---------------- */

async function categoryList(env, user, url) {
  const rows = await all(
    env,
    `SELECT c.*, (SELECT COUNT(*) FROM post p WHERE p.category_id = c.cid) AS post_num
     FROM category c ORDER BY c.ordernum, c.cid`
  );
  const bulkId = 'bulk-categories';
  // 内置伪分类（category_id = 0）不是 category 表里的一行：它由 post.category_id 默认 0 表达
  //（见 lib.validCategoryId，分类被删或未选分类都会落到 0），但所有分类下拉与文章列表都会显示它，
  // 不在此列出就成了分类管理里看不到、也统计不到的归档。
  // 与「独立页面」列表顶部的系统内置页同口径：固定一行只读项，标「系统」。
  // 计数口径与下方各分类的「文章数」子查询保持一致（同样不排除独立页面）。
  const uncategorized = await countOf(env, 'SELECT COUNT(*) FROM post WHERE category_id = 0');
  const systemRow = `<tr>
    <td></td>
    <td>0</td>
    <td>${UNCATEGORIZED_NAME} <span class="wb-pill">系统</span></td>
    <td><span class="muted">—</span></td>
    <td><span class="muted">—</span></td>
    <td>${uncategorized}</td>
    <td class="row-actions"></td>
  </tr>`;
  const body = listShell({
    bulkId,
    bulkAction: '/admin/categories/bulk-delete',
    toolsStyle: 'justify-content:flex-end',
    tools: `${bulkButton(bulkId)}
    <a class="wb-btn p" href="/admin/categories/new">新建分类</a>`,
    head: `${bulkCheckAll(bulkId)}<th style="width:6%">ID</th><th>名称</th><th>别名</th><th style="width:7%">排序</th><th style="width:8%">文章数</th><th style="width:14%">操作</th>`,
    prepend: systemRow,
    rows: rows.map(
      (c) => `<tr>
      ${bulkCheck(bulkId, c.cid)}
      <td>${c.cid}</td><td>${e(c.name)}</td><td>${e(slugHref('/category', c.slug))}</td><td>${c.ordernum}</td><td>${c.post_num}</td>
      <td class="row-actions">
        <a class="wb-btn sm" href="/admin/categories/edit?id=${c.cid}">编辑</a>
        ${deleteForm('/admin/categories/delete', 'cid', c.cid, `确定删除该分类？其下文章将变为${UNCATEGORIZED_NAME}`)}
      </td></tr>`
    ),
    colspan: 7,
    emptyText: '暂无分类',
  });
  return adminPage(env, user, '/admin/categories', '分类管理', body, url);
}

const categoryForm = (env, user, url) =>
  editForm({
    env,
    user,
    url,
    back: '/admin/categories',
    key: 'cid',
    label: '分类',
    fetchRow: (id) => first(env, 'SELECT * FROM category WHERE cid = ?', [id]),
    fields: (row) => `
    <div class="field"><label>名称</label><input type="text" name="name" value="${e(row ? row.name : '')}" required></div>
    <div class="field"><label>别名（URL）</label><input type="text" name="slug" value="${e(row ? row.slug : '')}" placeholder="留空自动生成"></div>
    <div class="field"><label>排序（数字越小越靠前）</label><input type="number" name="ordernum" value="${row ? row.ordernum : 0}"></div>`,
  });

async function categorySave(env, request) {
  const form = await readForm(request);
  const cid = intField(form, 'cid');
  const name = field(form, 'name').trim();
  if (!name) return backErr('/admin/categories', '名称不能为空');
  const slug = field(form, 'slug').trim() || slugify(name, 'cat');
  const data = [name, slug, intField(form, 'ordernum')];
  // category.slug 有唯一约束：手填的别名撞车时给提示，而不是抛成 500
  const bad = await saveRow(env, '/admin/categories', {
    id: cid,
    update: ['UPDATE category SET name=?, slug=?, ordernum=? WHERE cid=?', data],
    insert: ['INSERT INTO category (name, slug, ordernum) VALUES (?, ?, ?)', data],
    uniqueErr: '该别名已被占用，请更换',
  });
  return bad || backMsg('/admin/categories', '已保存');
}

/** 删除分类：先把其下文章的分类置空，再删除分类本身 */
async function deleteCategory(env, cid) {
  await run(env, 'UPDATE post SET category_id = 0 WHERE category_id = ?', [cid]);
  return run(env, 'DELETE FROM category WHERE cid = ?', [cid]);
}

const categoryDelete = (env, request) =>
  deleteOne(request, '/admin/categories', 'cid', (id) => deleteCategory(env, id));

async function tagList(env, user, url) {
  const rows = await all(
    env,
    `SELECT t.*, (SELECT COUNT(*) FROM post_tag pt WHERE pt.tid = t.tid) AS post_num FROM tag t ORDER BY t.tid`
  );
  const bulkId = 'bulk-tags';
  const body = listShell({
    bulkId,
    bulkAction: '/admin/tags/bulk-delete',
    toolsStyle: 'justify-content:flex-end',
    tools: `${bulkButton(bulkId)}
    <a class="wb-btn p" href="/admin/tags/new">新建标签</a>`,
    head: `${bulkCheckAll(bulkId)}<th style="width:6%">ID</th><th>名称</th><th>别名</th><th style="width:8%">文章数</th><th style="width:14%">操作</th>`,
    rows: rows.map(
      (t) => `<tr>
      ${bulkCheck(bulkId, t.tid)}
      <td>${t.tid}</td><td>${e(t.name)}</td><td>${e(slugHref('/tag', t.slug))}</td><td>${t.post_num}</td>
      <td class="row-actions">
        <a class="wb-btn sm" href="/admin/tags/edit?id=${t.tid}">编辑</a>
        ${deleteForm('/admin/tags/delete', 'tid', t.tid, '确定删除该标签？')}
      </td></tr>`
    ),
    colspan: 6,
    emptyText: '暂无标签',
  });
  return adminPage(env, user, '/admin/tags', '标签管理', body, url);
}

const tagForm = (env, user, url) =>
  editForm({
    env,
    user,
    url,
    back: '/admin/tags',
    key: 'tid',
    label: '标签',
    fetchRow: (id) => first(env, 'SELECT * FROM tag WHERE tid = ?', [id]),
    fields: (row) => `
    <div class="field"><label>名称</label><input type="text" name="name" value="${e(row ? row.name : '')}" required></div>
    <div class="field"><label>别名（URL）</label><input type="text" name="slug" value="${e(row ? row.slug : '')}" placeholder="留空自动生成"></div>`,
  });

async function tagSave(env, request) {
  const form = await readForm(request);
  const tid = intField(form, 'tid');
  const name = field(form, 'name').trim();
  if (!name) return backErr('/admin/tags', '名称不能为空');
  const slug = field(form, 'slug').trim() || slugify(name, 'tag');
  const data = [name, slug];
  // tag.name / tag.slug 均有唯一约束：撞车时给提示，而不是抛成 500
  const bad = await saveRow(env, '/admin/tags', {
    id: tid,
    update: ['UPDATE tag SET name=?, slug=? WHERE tid=?', data],
    insert: ['INSERT INTO tag (name, slug) VALUES (?, ?)', data],
    uniqueErr: '标签名称或别名已被占用，请更换',
  });
  return bad || backMsg('/admin/tags', '已保存');
}

/** 删除标签：一并清理文章标签关联 */
async function deleteTag(env, tid) {
  await run(env, 'DELETE FROM post_tag WHERE tid = ?', [tid]);
  return run(env, 'DELETE FROM tag WHERE tid = ?', [tid]);
}

const tagDelete = (env, request) => deleteOne(request, '/admin/tags', 'tid', (id) => deleteTag(env, id));

/* ---------------- 评论 ---------------- */

/** 删除评论：单条与批量共用同一条语句 */
const deleteComment = (env, coid) => run(env, 'DELETE FROM comment WHERE coid = ?', [coid]);

async function commentList(env, user, url) {
  const size = 20;
  const { status, where, params } = statusFilter(url.searchParams.get('status'), ['pending', 'approved'], 'cm.status');
  const { page, total, totalPages } = await pageInfo(env, url, size, `SELECT COUNT(*) c FROM comment cm WHERE ${where}`, params);
  const rows = await all(
    env,
    `SELECT cm.*, p.title, p.slug, p.is_page FROM comment cm LEFT JOIN post p ON p.pid = cm.pid
     WHERE ${where}
     ORDER BY cm.coid DESC LIMIT ? OFFSET ?`,
    [...params, size, (page - 1) * size]
  );
  const bulkId = 'bulk-comments';
  const body = listShell({
    bulkId,
    bulkAction: '/admin/comments/bulk-delete',
    tools: `<div class="inline">
    <a class="wb-btn ${status === 'all' ? 'p' : ''}" href="/admin/comments">全部</a>
    <a class="wb-btn ${status === 'pending' ? 'p' : ''}" href="/admin/comments?status=pending">待审核</a>
    <a class="wb-btn ${status === 'approved' ? 'p' : ''}" href="/admin/comments?status=approved">已通过</a>
    </div>
    ${bulkButton(bulkId)}`,
    head: `${bulkCheckAll(bulkId)}<th>内容</th><th style="width:11%">评论者</th><th style="width:14%">所属文章</th><th style="width:12%">时间</th><th style="width:14%">操作</th>`,
    rows: rows.map(
      (c) => `<tr>
      ${bulkCheck(bulkId, c.coid)}
      <td>${e(excerpt(c.content, 80))} ${c.status === 'pending' ? '<span class="wb-pill pending">待审核</span>' : '<span class="wb-pill publish">已通过</span>'}</td>
      <td>${e(c.author)}<div class="muted">${e(c.mail || '未填邮箱')}</div>${safeUrl(c.url) ? `<div class="muted"><a href="${e(safeUrl(c.url))}" target="_blank" rel="noopener">${e(c.url)}</a></div>` : ''}</td>
      <td>${c.title ? `<a href="${e(frontUrl(c))}" target="_blank">${e(excerpt(c.title, 20))}</a>` : '<span class="muted">文章已删除</span>'}</td>
      <td>${fmtDate(c.created)}</td>
      <td class="row-actions">
        ${statusToggle({ action: '/admin/comments/status', name: 'coid', value: c.coid, status: c.status, active: 'approved' })}
        ${deleteForm('/admin/comments/delete', 'coid', c.coid, '确定删除该评论？')}
      </td></tr>`
    ),
    colspan: 6,
    emptyText: '暂无评论',
    foot: pager({
      base: '/admin/comments',
      page,
      totalPages,
      total,
      query: status === 'all' ? '' : `status=${status}`,
      variant: 'admin',
    }),
  });
  return adminPage(env, user, '/admin/comments', '评论管理', body, url);
}

/* ---------------- 点赞 / 关注（微博式互动） ---------------- */

/** 删除点赞记录：单条与批量共用同一条语句 */
const deleteLike = (env, lid) => run(env, 'DELETE FROM post_like WHERE lid = ?', [lid]);

/** 删除关注记录：单条与批量共用同一条语句 */
const deleteFollow = (env, fid) => run(env, 'DELETE FROM follow WHERE fid = ?', [fid]);

async function likeList(env, user, url) {
  const size = 20;
  const { page, total, totalPages } = await pageInfo(env, url, size, 'SELECT COUNT(*) c FROM post_like');
  const rows = await all(
    env,
    `SELECT pl.lid, pl.pid, pl.created, p.title, p.slug, p.is_page,
            u.screenname, u.username, u.mail
     FROM post_like pl
     LEFT JOIN post p ON p.pid = pl.pid
     LEFT JOIN user u ON u.userid = pl.userid
     ORDER BY pl.lid DESC LIMIT ? OFFSET ?`,
    [size, (page - 1) * size]
  );
  const bulkId = 'bulk-likes';
  const body = listShell({
    bulkId,
    bulkAction: '/admin/likes/bulk-delete',
    tools: `<div class="muted">前台「点赞」按钮产生的记录，可在此查看与删除。开关见「功能管理 → 功能开关」。</div>
    ${bulkButton(bulkId)}`,
    head: `${bulkCheckAll(bulkId)}<th>文章</th><th style="width:18%">点赞用户</th><th style="width:14%">时间</th><th style="width:10%">操作</th>`,
    rows: rows.map(
      (r) => `<tr>
      ${bulkCheck(bulkId, r.lid)}
      <td>${r.title ? `<a href="${e(frontUrl(r))}" target="_blank">${e(excerpt(r.title, 30))}</a>` : '<span class="muted">文章已删除</span>'}</td>
      <td>${e(r.screenname || r.username || '未知用户')}<div class="muted">${e(r.mail || '')}</div></td>
      <td>${fmtDate(r.created)}</td>
      <td class="row-actions">
        ${deleteForm('/admin/likes/delete', 'lid', r.lid, '确定删除该点赞记录？')}
      </td></tr>`
    ),
    colspan: 5,
    emptyText: '暂无点赞记录',
    foot: pager({ base: '/admin/likes', page, totalPages, total, variant: 'admin' }),
  });
  return adminPage(env, user, '/admin/likes', '点赞管理', body, url);
}

async function followList(env, user, url) {
  const size = 20;
  const { page, total, totalPages } = await pageInfo(env, url, size, 'SELECT COUNT(*) c FROM follow');
  const rows = await all(
    env,
    `SELECT f.fid, f.created,
            u.screenname AS user_name, u.username AS user_account,
            t.screenname AS target_name, t.username AS target_account
     FROM follow f
     LEFT JOIN user u ON u.userid = f.userid
     LEFT JOIN user t ON t.userid = f.target_id
     ORDER BY f.fid DESC LIMIT ? OFFSET ?`,
    [size, (page - 1) * size]
  );
  const bulkId = 'bulk-follows';
  const body = listShell({
    bulkId,
    bulkAction: '/admin/follows/bulk-delete',
    tools: `<div class="muted">前台「关注」按钮产生的记录，可在此查看与删除。开关见「功能管理 → 功能开关」。</div>
    ${bulkButton(bulkId)}`,
    head: `${bulkCheckAll(bulkId)}<th>关注者</th><th>被关注者</th><th style="width:14%">时间</th><th style="width:10%">操作</th>`,
    rows: rows.map(
      (r) => `<tr>
      ${bulkCheck(bulkId, r.fid)}
      <td>${e(r.user_name || r.user_account || '未知用户')}</td>
      <td>${e(r.target_name || r.target_account || '未知用户')}</td>
      <td>${fmtDate(r.created)}</td>
      <td class="row-actions">
        ${deleteForm('/admin/follows/delete', 'fid', r.fid, '确定删除该关注记录？')}
      </td></tr>`
    ),
    colspan: 5,
    emptyText: '暂无关注记录',
    foot: pager({ base: '/admin/follows', page, totalPages, total, variant: 'admin' }),
  });
  return adminPage(env, user, '/admin/follows', '关注管理', body, url);
}

/* ---------------- 友链 ---------------- */

/** 删除友链：单条与批量共用同一条语句 */
const deleteLink = (env, lid) => run(env, 'DELETE FROM link WHERE lid = ?', [lid]);

async function linkList(env, user, url) {
  const rows = await all(env, 'SELECT * FROM link ORDER BY ordernum, lid');
  const bulkId = 'bulk-links';
  const body = listShell({
    bulkId,
    bulkAction: '/admin/links/bulk-delete',
    toolsStyle: 'justify-content:flex-end',
    tools: `${bulkButton(bulkId)}
    <a class="wb-btn p" href="/admin/links/new">新建友链</a>`,
    head: `${bulkCheckAll(bulkId)}<th style="width:8%">图标</th><th style="width:14%">名称</th><th style="width:26%">地址</th><th>描述</th><th style="width:7%">排序</th><th style="width:15%">操作</th>`,
    rows: rows.map(
      (l) => `<tr>
      ${bulkCheck(bulkId, l.lid)}
      <td>${safeUrl(l.image) ? `<img src="${e(safeUrl(l.image))}" style="display:block;width:48px;height:48px;padding:4px;object-fit:contain;border-radius:6px;background:#f5f5f5">` : '<span class="muted">无</span>'}</td>
      <td>${e(l.name)}</td><td><a href="${e(safeUrl(l.url))}" target="_blank">${e(l.url)}</a></td>
      <td>${e(l.description)}</td><td>${l.ordernum}</td>
      <td class="row-actions">
        <a class="wb-btn sm" href="/admin/links/edit?id=${l.lid}">编辑</a>
        ${deleteForm('/admin/links/delete', 'lid', l.lid, '确定删除该友链？')}
      </td></tr>`
    ),
    colspan: 7,
    emptyText: '暂无友链',
  });
  return adminPage(env, user, '/admin/links', '友链管理', body, url);
}

const linkForm = (env, user, url) =>
  editForm({
    env,
    user,
    url,
    back: '/admin/links',
    key: 'lid',
    label: '友链',
    fetchRow: (id) => first(env, 'SELECT * FROM link WHERE lid = ?', [id]),
    fields: (row) => `
    <div class="field"><label>名称</label><input type="text" name="name" value="${e(row ? row.name : '')}" required></div>
    <div class="field"><label>链接地址</label><input type="text" name="url" value="${e(row ? row.url : '')}" required></div>
    <div class="field"><label>图标地址</label><input type="text" name="image" value="${e(row ? row.image : '')}" placeholder="/images/random/1.jpg"><div class="hint">前台侧边栏「左邻右舍」显示的缩略图</div></div>
    <div class="field"><label>描述</label><input type="text" name="description" value="${e(row ? row.description : '')}"></div>
    <div class="field"><label>排序</label><input type="number" name="ordernum" value="${row ? row.ordernum : 0}"></div>`,
  });

async function linkSave(env, request) {
  const form = await readForm(request);
  const lid = intField(form, 'lid');
  const name = field(form, 'name').trim();
  // 地址与图标只放行 http/https 与站内相对地址，拦住 javascript: 等伪协议
  const url = safeUrl(field(form, 'url').trim());
  const image = safeUrl(field(form, 'image').trim());
  const data = [name, url, image, field(form, 'description').trim(), intField(form, 'ordernum')];
  if (!name) return backErr('/admin/links', '名称不能为空');
  if (!url) return backErr('/admin/links', '链接地址不能为空，且需以 http(s):// 或 / 开头');
  const bad = await saveRow(env, '/admin/links', {
    id: lid,
    update: ['UPDATE link SET name=?, url=?, image=?, description=?, ordernum=? WHERE lid=?', data],
    insert: ['INSERT INTO link (name, url, image, description, ordernum) VALUES (?, ?, ?, ?, ?)', data],
  });
  return bad || backMsg('/admin/links', '已保存');
}

const linkDelete = (env, request) => deleteOne(request, '/admin/links', 'lid', (id) => deleteLink(env, id));

/* ---------------- 导航（前台顶栏） ---------------- */

/** 删除某条导航时一并删除它的下拉子项 */
async function deleteNav(env, nid) {
  await run(env, 'DELETE FROM nav WHERE parent_id = ?', [nid]);
  return run(env, 'DELETE FROM nav WHERE nid = ?', [nid]);
}

async function navList(env, user, url) {
  const rows = await all(env, 'SELECT * FROM nav ORDER BY ordernum, nid');
  const tops = rows.filter((n) => !n.parent_id);
  const childrenOf = (id) => rows.filter((n) => n.parent_id === id);
  const nameOf = (id) => (rows.find((n) => n.nid === id) || {}).name || '（已删除）';
  const bulkId = 'bulk-nav';
  const rowHtml = (n, isSub) => `<tr>
      ${bulkCheck(bulkId, n.nid)}
      <td>${isSub ? '<span class="muted">└ </span>' : ''}${e(n.name)}</td>
      <td>${n.url ? `<a href="${e(safeUrl(n.url))}" target="_blank">${e(n.url)}</a>` : '<span class="muted">未填写</span>'}</td>
      <td>${isSub ? `下拉子项 · ${e(nameOf(n.parent_id))}` : childrenOf(n.nid).length ? '下拉菜单' : '顶级导航'}</td>
      <td>${n.login_only ? '仅登录后显示' : '所有人可见'}</td>
      <td>${n.blank ? '新窗口打开' : '当前窗口'}</td>
      <td>${n.ordernum}</td>
      <td class="row-actions">
        <a class="wb-btn sm" href="/admin/nav/edit?id=${n.nid}">编辑</a>
        ${deleteForm('/admin/nav/delete', 'nid', n.nid, '确定删除该导航？若为下拉菜单，其子项会一并删除。')}
      </td></tr>`;
  const parts = [];
  const rendered = new Set();
  for (const top of tops) {
    parts.push(rowHtml(top, false));
    rendered.add(top.nid);
    for (const child of childrenOf(top.nid)) {
      parts.push(rowHtml(child, true));
      rendered.add(child.nid);
    }
  }
  // 兜底：上级已不存在的子项仍列出来，避免被隐藏
  for (const n of rows) if (!rendered.has(n.nid)) parts.push(rowHtml(n, false));
  const body = listShell({
    bulkId,
    bulkAction: '/admin/nav/bulk-delete',
    toolsStyle: 'justify-content:flex-end',
    tools: `${bulkButton(bulkId)}
    <a class="wb-btn p" href="/admin/nav/new">新建导航</a>`,
    head: `${bulkCheckAll(bulkId)}<th>名称</th><th style="width:20%">链接</th><th style="width:16%">类型</th><th style="width:12%">可见性</th><th style="width:12%">打开方式</th><th style="width:7%">排序</th><th style="width:15%">操作</th>`,
    rows: parts,
    colspan: 8,
    emptyText: '暂无自定义导航，前台顶栏显示内置默认导航。',
    hint: '<p class="muted" style="margin-top:12px">说明：不添加任何导航时，前台顶栏使用内置默认导航；一旦添加，则完全按这里的配置显示。把「上级导航」设为某个顶级导航，即可把它作为该导航的下拉子项。</p>',
  });
  return adminPage(env, user, '/admin/nav', '导航管理', body, url);
}

const navForm = (env, user, url) =>
  editForm({
    env,
    user,
    url,
    back: '/admin/nav',
    key: 'nid',
    label: '导航',
    fetchRow: (id) => first(env, 'SELECT * FROM nav WHERE nid = ?', [id]),
    fields: async (row) => {
      // 上级候选：仅顶级导航，且排除自身，保证最多两级
      const parents = await all(env, 'SELECT * FROM nav WHERE parent_id = 0 AND nid <> ? ORDER BY ordernum, nid', [
        row ? row.nid : 0,
      ]);
      return `
    <div class="field"><label>导航名称</label><input type="text" name="name" value="${e(row ? row.name : '')}" required></div>
    <div class="field"><label>链接地址</label><input type="text" name="url" value="${e(row ? row.url : '')}" placeholder="/ 或 /links.html 或 https://example.com"><div class="hint">支持站内路径与完整网址；留空则仅作为下拉菜单的父级（点击不跳转）。</div></div>
    <div class="field"><label>上级导航</label>
      <select name="parent_id">
        <option value="0">顶级导航</option>
        ${parents.map((p) => `<option value="${p.nid}" ${row && row.parent_id === p.nid ? 'selected' : ''}>${e(p.name)}</option>`).join('')}
      </select>
      <div class="hint">选择某个顶级导航后，本项会作为它的下拉子项显示。</div>
    </div>
    <div class="field"><label>排序</label><input type="number" name="ordernum" value="${row ? row.ordernum : 0}"></div>
    <div class="cols">
      <div class="field"><label class="inline" style="margin:0"><input type="checkbox" name="login_only" value="1" ${row && row.login_only ? 'checked' : ''} style="width:auto"> 仅登录后显示</label><div class="hint">勾选后，未登录访客看不到该导航。</div></div>
      <div class="field"><label class="inline" style="margin:0"><input type="checkbox" name="blank" value="1" ${row && row.blank ? 'checked' : ''} style="width:auto"> 在新窗口打开</label><div class="hint">勾选后，前台点击该导航会在新窗口（新标签页）中打开链接。</div></div>
    </div>`;
    },
  });

async function navSave(env, request) {
  const form = await readForm(request);
  const nid = intField(form, 'nid');
  const name = field(form, 'name').trim();
  // 导航地址只放行 http/https 与站内相对地址，拦住 javascript: 等伪协议
  const rawUrl = field(form, 'url').trim();
  const navUrl = safeUrl(rawUrl);
  const parentId = intField(form, 'parent_id');
  const loginOnly = field(form, 'login_only') ? 1 : 0;
  const blank = field(form, 'blank') ? 1 : 0;
  const ordernum = intField(form, 'ordernum');
  const fail = (message) => backErr('/admin/nav', message);
  if (!name) return fail('导航名称不能为空');
  if (rawUrl && !navUrl) return fail('导航地址需以 http(s):// 或 / 开头');
  if (nid && parentId === nid) return fail('不能把导航的上级设为它自己');
  if (parentId) {
    const parent = await first(env, 'SELECT nid FROM nav WHERE nid = ? AND parent_id = 0', [parentId]);
    if (!parent) return fail('上级导航不存在或本身已是子项，最多支持两级');
    if (nid) {
      const kids = await first(env, 'SELECT COUNT(*) c FROM nav WHERE parent_id = ?', [nid]);
      if ((kids ? kids.c : 0) > 0) return fail('该导航下已有子项，不能再设为下拉子项');
    }
  }
  const data = [name, navUrl, parentId, loginOnly, blank, ordernum];
  const bad = await saveRow(env, '/admin/nav', {
    id: nid,
    update: ['UPDATE nav SET name=?, url=?, parent_id=?, login_only=?, blank=?, ordernum=? WHERE nid=?', data],
    insert: ['INSERT INTO nav (name, url, parent_id, login_only, blank, ordernum) VALUES (?, ?, ?, ?, ?, ?)', data],
  });
  return bad || backMsg('/admin/nav', '已保存');
}

const navDelete = (env, request) => deleteOne(request, '/admin/nav', 'nid', (id) => deleteNav(env, id));

/* ---------------- 用户组（决定等级徽章使用哪一套图标） ---------------- */

/** 按用户组模板展开出一个等级在该组下的徽章预览 */
const badgeByGroup = (groups, badge) =>
  badge
    ? groups.map((g) => `<span class="muted">${e(g.name)}：</span>${iconPreview(badgeFile([g], g.gid, badge))}`).join('<br>')
    : '<span class="muted">无</span>';

/** 组别管理的「权限」列：免审核 / 可审核 / 可编辑 与后台菜单数量的组合标签，均为空时显示「需审核」 */
function groupPermTags(g) {
  const tags = [];
  if (g.skip_review) tags.push('<span class="wb-pill">免审核</span>');
  if (g.can_review) tags.push('<span class="wb-pill">可审核</span>');
  if (g.can_review && g.can_edit) tags.push('<span class="wb-pill">可编辑</span>');
  if (!tags.length) tags.push('<span class="muted">需审核</span>');
  // 后台菜单：'*' 或空串表示该组管理员可见全部后台入口（见 visibleMenuKeys）
  const raw = String(g.admin_menus || '').trim();
  const count = !raw || raw === '*' ? MENU_KEYS.length : raw.split(',').filter((k) => MENU_KEYS.includes(k)).length;
  tags.push(`<span class="wb-pill">后台 ${count === MENU_KEYS.length ? '全部' : `${count} 项`}</span>`);
  return tags.join(' ');
}

async function groupList(env, user, url) {
  const rows = await getGroups(env);
  const bulkId = 'bulk-groups';
  const body = listShell({
    bulkId,
    bulkAction: '/admin/groups/bulk-delete',
    toolsStyle: 'justify-content:flex-end',
    tools: `${bulkButton(bulkId)}
    <a class="wb-btn p" href="/admin/groups/new">新建用户组</a>`,
    head: `${bulkCheckAll(bulkId)}<th style="width:6%">ID</th><th>组名</th><th style="width:18%">图标命名模板</th><th style="width:19%">预览</th><th style="width:18%">权限</th><th style="width:7%">排序</th><th style="width:14%">操作</th>`,
    rows: rows.map(
      (g) => `<tr>
      ${bulkCheck(bulkId, g.gid)}
      <td>${g.gid}</td><td>${e(g.name)}</td><td><code>${e(g.badge_tpl || '{badge}')}</code></td>
      <td>${iconPreview(badgeFile([g], g.gid, '1'))}</td>
      <td>${groupPermTags(g)}</td>
      <td>${g.ordernum}</td>
      <td class="row-actions">
        <a class="wb-btn sm" href="/admin/groups/edit?id=${g.gid}">编辑</a>
        ${deleteForm('/admin/groups/delete', 'gid', g.gid, '确定删除该用户组？组内用户将回退到第一个用户组。')}
      </td></tr>`
    ),
    colspan: 8,
    emptyText: '暂无用户组',
    hint: `<div class="hint" style="margin-top:12px">用户组决定等级徽章使用哪一套图标：模板中的 <code>{badge}</code> 会被「等级管理」里该等级的徽章值替换，再拼接 ${BADGE_DIR} 读取图片，不带扩展名时自动按 .png → .gif 匹配。例：普通用户组模板 <code>LV{badge}</code> 读 LV1.png，特邀用户组模板 <code>TY{badge}</code> 读 TY1.png，而 <code>VIP{badge}</code> 读 VIP1.gif。<br>「权限」列：<b>免审核</b> = 前台投稿与评论直接发布，不进入待审核；<b>可审核</b> = 可进入前台「审核中心」处理待审内容；<b>可编辑</b> = 审核通过前可修改待审内容（需同时具备可审核）。点「编辑」查看每项权限的完整说明。<br><b>后台 N 项 / 后台 全部</b> = 该组管理员在后台左栏可见的菜单数量，在编辑页的「后台菜单」里勾选。</div>`,
  });
  return adminPage(env, user, '/admin/groups', '组别管理', body, url);
}

const groupForm = (env, user, url) =>
  editForm({
    env,
    user,
    url,
    back: '/admin/groups',
    key: 'gid',
    label: '用户组',
    fetchRow: (id) => first(env, 'SELECT * FROM user_group WHERE gid = ?', [id]),
    fields: (row) => `
    <div class="field"><label>组名</label><input type="text" name="name" value="${e(row ? row.name : '')}" placeholder="普通用户" required></div>
    <div class="cols">
      <div class="field"><label>图标命名模板</label><input type="text" name="badge_tpl" value="${e(row ? row.badge_tpl : '{badge}')}" placeholder="LV{badge}">
        <div class="hint"><code>{badge}</code> 会被等级的徽章值替换，再拼接 ${BADGE_DIR} 读取图片（不带扩展名时自动按 .png → .gif 匹配，如 <code>VIP{badge}</code> 读 VIP1.gif）。留空按 <code>{badge}</code> 处理</div>
      </div>
      <div class="field"><label>排序</label><input type="number" name="ordernum" value="${row ? row.ordernum : 0}"></div>
    </div>
    <div class="wb-card-pad" style="border:1px solid var(--wb-line);border-radius:8px;margin-top:16px">
      <div class="field"><label style="font-weight:600">权限设置</label></div>
      <label class="inline" style="margin:0"><input type="checkbox" name="skip_review" value="1" ${row && row.skip_review ? 'checked' : ''} style="width:auto"> 前台投稿与评论免审核</label>
      <label class="inline" style="margin:0"><input type="checkbox" name="can_review" value="1" ${row && row.can_review ? 'checked' : ''} style="width:auto"> 可进入审核中心（审核待审投稿与评论）</label>
      <label class="inline" style="margin:0"><input type="checkbox" name="can_edit" value="1" ${row && row.can_edit ? 'checked' : ''} style="width:auto"> 可在审核时编辑待审内容（需勾选上一项）</label>
      <div class="hint" style="line-height:1.9">
        <div><b>前台投稿与评论免审核</b>：该组用户在前台投稿（写文章 / 发布微博）与发表评论时不进入待审核，直接发布；不勾选则按「站点设置」中的「投稿需审核 / 评论需审核」开关处理。</div>
        <div><b>可进入审核中心</b>：该组用户在前台左栏「个人设置」旁会多出「审核中心」入口，可在其中通过 / 驳回 / 删除待审核的投稿与评论，并可预览未发布的待审正文。</div>
        <div><b>可在审核时编辑</b>：通过前可修改待审投稿的标题、正文与评论内容；未勾选则只能通过 / 驳回 / 删除。该权限依赖「可进入审核中心」，单独勾选无效。</div>
        <div style="margin-top:6px">管理员始终免审核，并始终具备审核与编辑权限。以上三项互不影响，可自由组合。</div>
      </div>
    </div>
    <div class="wb-card-pad" style="border:1px solid var(--wb-line);border-radius:8px;margin-top:16px">
      <div class="field"><label style="font-weight:600">后台菜单</label></div>
      <div class="cols">
      ${MENUS.map(
        (m) =>
          `<label class="inline" style="margin:0"><input type="checkbox" name="menus" value="${m.key}" ${groupHasMenu(row, m.key) ? 'checked' : ''} style="width:auto"> ${m.label}</label>`
      ).join('\n      ')}
      </div>
      <div class="hint" style="line-height:1.9">
        <div>该组管理员在后台左栏可见的入口：未勾选的菜单不显示，其下的新增 / 保存 / 删除 / 批量删除路由也会被拦截，直接敲地址同样进不去。</div>
        <div style="margin-top:6px">仅对<b>管理员</b>生效：后台本身只允许 role = administrator 的账号进入，用户组的其余权限（免审核 / 可审核 / 可编辑）作用在前台。组内没有管理员时此项不影响任何可见内容。至少勾选一项，否则该组管理员无法进入后台任何页面。</div>
      </div>
    </div>`,
  });

/** 用户组表单里某一行后台菜单是否勾选：'*' 或空串（历史行）表示全部可见 */
function groupHasMenu(row, key) {
  const raw = String((row && row.admin_menus) || '*').trim() || '*';
  return raw === '*' || raw.split(',').includes(key);
}

async function groupSave(env, request, user) {
  const form = await readForm(request);
  const gid = intField(form, 'gid');
  const name = field(form, 'name').trim();
  if (!name) return backErr('/admin/groups', '组名不能为空');
  // 后台菜单：只收已知 key（去掉构造请求里的脏值）；
  // 一项都不勾会让该组管理员进不去任何后台页面，直接拦下而不是保存出一个「看不见的后台」
  const menus = Array.from(new Set(listField(form, 'menus'))).filter((k) => MENU_KEYS.includes(k));
  if (!menus.length) return backErr('/admin/groups', '请至少勾选一个后台菜单');
  // 自锁保护：本页是修改后台菜单的唯一入口，取消当前登录账号所在用户组的「组别管理」后
  // 本人将再也进不来（只能直连数据库改回来），因此保存前直接拦下
  if (gid > 0 && Number(gid) === Number(user.group_id) && !menus.includes('groups')) {
    return backErr('/admin/groups', '不能取消当前登录账号所在用户组的「组别管理」，否则你将无法再进入本页');
  }
  const data = [
    name,
    field(form, 'badge_tpl').trim() || '{badge}',
    intField(form, 'ordernum'),
    field(form, 'skip_review') ? 1 : 0,
    field(form, 'can_review') ? 1 : 0,
    field(form, 'can_edit') ? 1 : 0,
    menus.join(','),
  ];
  const bad = await saveRow(env, '/admin/groups', {
    id: gid,
    update: ['UPDATE user_group SET name=?, badge_tpl=?, ordernum=?, skip_review=?, can_review=?, can_edit=?, admin_menus=? WHERE gid=?', data],
    insert: ['INSERT INTO user_group (name, badge_tpl, ordernum, skip_review, can_review, can_edit, admin_menus) VALUES (?, ?, ?, ?, ?, ?, ?)', data],
  });
  return bad || backMsg('/admin/groups', '已保存');
}

/** 删除用户组：组内用户回退到第一个用户组（group_id = 0 时前台按第一个组解析） */
async function deleteGroup(env, gid) {
  await run(env, 'UPDATE user SET group_id = 0 WHERE group_id = ?', [gid]);
  return run(env, 'DELETE FROM user_group WHERE gid = ?', [gid]);
}

const groupDelete = (env, request) => deleteOne(request, '/admin/groups', 'gid', (id) => deleteGroup(env, id));

/* ---------------- 等级（微博等级，前台佩戴徽章） ---------------- */

/**
 * 徽章目录（BADGE_DIR）与图标地址口径统一由 lib.js 提供，这里只保留后台列表用的预览样式。
 * 徽章值结合用户组的命名模板展开为文件名：
 * 等级徽章填 3，普通用户组模板 LV{badge} 读 /images/badge/LV3.png，特邀用户组模板 TY{badge} 读 /images/badge/TY3.png，
 * 而 VIP 套图标只有 .gif，因此不带扩展名时统一按 .png → .gif 回退。
 */
const PREVIEW_ICON_STYLE = 'width:20px;height:20px;object-fit:contain;vertical-align:-4px;margin-right:6px';

/**
 * 图标预览（等级徽章与荣誉图标共用，与前台 badgeHtml / honorHtml 完全同源）：
 * 图标地址、.png → .gif 回退与 onerror 脚本直接复用 lib 的 iconImageTag，
 * 避免后台预览与前台展示各写一份而走样；值为空时显示占位提示，图片缺失时隐藏避免裂图。
 */
const iconPreview = (name) => {
  const t = String(name ?? '').trim();
  if (!t) return '<span class="muted">无</span>';
  const img = iconImageTag(t, { style: PREVIEW_ICON_STYLE, hideOnError: "this.style.display='none'" });
  return `${img}${e(t)}`;
};

async function levelList(env, user, url) {
  const rows = await getLevels(env);
  const groups = await getGroups(env);
  const bulkId = 'bulk-levels';
  const body = listShell({
    bulkId,
    bulkAction: '/admin/levels/bulk-delete',
    toolsStyle: 'justify-content:flex-end',
    tools: `${bulkButton(bulkId)}
    <a class="wb-btn p" href="/admin/levels/new">新建等级</a>`,
    head: `${bulkCheckAll(bulkId)}<th style="width:6%">ID</th><th>等级名称</th><th style="width:13%">所需微博数</th><th style="width:24%">徽章（按用户组预览）</th><th style="width:7%">排序</th><th style="width:14%">操作</th>`,
    rows: rows.map(
      (l) => `<tr>
      ${bulkCheck(bulkId, l.lid)}
      <td>${l.lid}</td><td>${e(l.name)}</td><td>${l.min_posts}</td>
      <td>${groups.length ? badgeByGroup(groups, l.badge) : iconPreview(l.badge)}</td><td>${l.ordernum}</td>
      <td class="row-actions">
        <a class="wb-btn sm" href="/admin/levels/edit?id=${l.lid}">编辑</a>
        ${deleteForm('/admin/levels/delete', 'lid', l.lid, '确定删除该等级？')}
      </td></tr>`
    ),
    colspan: 7,
    emptyText: '暂无等级',
    hint: `<div class="hint" style="margin-top:12px">徽章值为静态图片的名称片段：需结合用户组的命名模板展开成文件名。例：徽章填 3，普通用户组读 ${BADGE_DIR}LV3.png，特邀用户组读 ${BADGE_DIR}TY3.png（图片放在 public/images/badge/ 目录，不带扩展名时自动按 .png → .gif 匹配）；留空表示该等级不佩戴徽章。</div>`,
  });
  return adminPage(env, user, '/admin/levels', '等级管理', body, url);
}

const levelForm = (env, user, url) =>
  editForm({
    env,
    user,
    url,
    back: '/admin/levels',
    key: 'lid',
    label: '等级',
    fetchRow: (id) => first(env, 'SELECT * FROM user_level WHERE lid = ?', [id]),
    fields: (row) => `
    <div class="field"><label>等级名称</label><input type="text" name="name" value="${e(row ? row.name : '')}" required></div>
    <div class="cols">
      <div class="field"><label>所需微博数</label><input type="number" name="min_posts" value="${row ? row.min_posts : 0}" min="0"><div class="hint">用户未手动指定等级时，已发布微博数达到该值即自动升到本级</div></div>
      <div class="field"><label>排序</label><input type="number" name="ordernum" value="${row ? row.ordernum : 0}"></div>
    </div>
    <div class="field"><label>徽章值</label><input type="text" name="badge" value="${e(row ? row.badge : '')}" placeholder="3"><div class="hint">与用户组的命名模板组合成文件名：填 3，普通用户组读 ${BADGE_DIR}LV3.png，特邀用户组读 ${BADGE_DIR}TY3.png（不带扩展名时自动按 .png → .gif 匹配）；留空表示该等级不佩戴徽章</div></div>`,
  });

async function levelSave(env, request) {
  const form = await readForm(request);
  const lid = intField(form, 'lid');
  const name = field(form, 'name').trim();
  if (!name) return backErr('/admin/levels', '等级名称不能为空');
  const data = [
    name,
    Math.max(0, intField(form, 'min_posts')),
    field(form, 'badge').trim(),
    intField(form, 'ordernum'),
  ];
  const bad = await saveRow(env, '/admin/levels', {
    id: lid,
    update: ['UPDATE user_level SET name=?, min_posts=?, badge=?, ordernum=? WHERE lid=?', data],
    insert: ['INSERT INTO user_level (name, min_posts, badge, ordernum) VALUES (?, ?, ?, ?)', data],
  });
  return bad || backMsg('/admin/levels', '已保存');
}

/** 删除等级：等级被删后用户不能再指向它（level_id = 0 时前台按已发布微博数自动匹配） */
async function deleteLevel(env, lid) {
  await run(env, 'UPDATE user SET level_id = 0 WHERE level_id = ?', [lid]);
  return run(env, 'DELETE FROM user_level WHERE lid = ?', [lid]);
}

const levelDelete = (env, request) => deleteOne(request, '/admin/levels', 'lid', (id) => deleteLevel(env, id));

/* ---------------- 用户 ---------------- */

/** 管理员总数：只计可正常登录的管理员（待审核账号不算），「最后一名管理员不可降级 / 删除」的校验以此为准 */
const adminCount = (env) => countOf(env, "SELECT COUNT(*) c FROM user WHERE role = 'administrator' AND status = 'active'");

async function userList(env, user, url) {
  const size = 20;
  // 注册审核：status 缺省按 active 处理，兼容新增列之前的旧数据；
  // 筛选下推到 SQL，与其余列表共用 statusFilter + pageInfo，避免全表读取后在内存里过滤分页
  const { status, where, params } = statusFilter(
    url.searchParams.get('status'),
    ['active', 'pending'],
    "CASE WHEN u.status = 'pending' THEN 'pending' ELSE 'active' END"
  );
  const { page, total, totalPages } = await pageInfo(env, url, size, `SELECT COUNT(*) c FROM user u WHERE ${where}`, params);
  const rows = await all(
    env,
    `SELECT u.* FROM user u WHERE ${where} ORDER BY u.userid LIMIT ? OFFSET ?`,
    [...params, size, (page - 1) * size]
  );
  const groups = await getGroups(env);
  const groupName = (gid) => e((resolveGroup(groups, gid) || {}).name) || '<span class="muted">未分组</span>';
  const adminTotal = await adminCount(env);
  const userStatus = (u) => (u.status === 'pending' ? 'pending' : 'active');
  const pendingCount = await countOf(env, "SELECT COUNT(*) c FROM user u WHERE u.status = 'pending'");
  const bulkId = 'bulk-users';
  // 当前登录账号与最后一名管理员不可删除，对应的勾选框也不渲染
  const protectedUser = (u) => u.userid === user.userid || (u.role === 'administrator' && adminTotal <= 1);
  const body = listShell({
    bulkId,
    bulkAction: '/admin/users/bulk-delete',
    tools: `<div class="inline">
    <a class="wb-btn ${status === 'all' ? 'p' : ''}" href="/admin/users">全部</a>
    <a class="wb-btn ${status === 'pending' ? 'p' : ''}" href="/admin/users?status=pending">待审核${pendingCount ? ` (${pendingCount})` : ''}</a>
    <a class="wb-btn ${status === 'active' ? 'p' : ''}" href="/admin/users?status=active">正常</a>
    </div>
    <div class="inline">
    ${bulkButton(bulkId)}
    <a class="wb-btn p" href="/admin/users/new">新建用户</a>
    </div>`,
    head: `${bulkCheckAll(bulkId)}<th style="width:6%">ID</th><th>用户名</th><th>昵称</th><th style="width:15%">邮箱</th><th style="width:9%">用户组</th><th style="width:8%">荣誉图标</th><th style="width:8%">角色</th><th style="width:8%">状态</th><th style="width:18%">操作</th>`,
    rows: rows.map(
      (u) => `<tr>
      ${protectedUser(u) ? '<td class="wb-check"></td>' : bulkCheck(bulkId, u.userid)}
      <td>${u.userid}</td><td>${e(u.username)}</td><td>${e(u.screenname)}</td><td>${e(u.mail)}</td>
      <td>${groupName(u.group_id)}</td>
      <td>${iconPreview(u.honor)}</td>
      <td>${u.role === 'administrator' ? '<span class="wb-pill publish">管理员</span>' : '<span class="wb-pill">访客</span>'}</td>
      <td>${userStatus(u) === 'pending' ? '<span class="wb-pill pending">待审核</span>' : '<span class="wb-pill publish">正常</span>'}</td>
      <td class="row-actions">
        ${u.userid === user.userid ? '' : statusToggle({ action: '/admin/users/status', name: 'userid', value: u.userid, status: u.status, active: 'active' })}
        <a class="wb-btn sm" href="/admin/users/edit?id=${u.userid}">编辑</a>
        ${
          u.userid === user.userid
            ? '<span class="muted">当前登录</span>'
            : u.role === 'administrator' && adminTotal <= 1
              ? '<span class="muted">最后一名管理员</span>'
              : deleteForm('/admin/users/delete', 'userid', u.userid, '确定删除该用户？')
        }
      </td></tr>`
    ),
    colspan: 10,
    emptyText: '暂无用户',
    foot: pager({
      base: '/admin/users',
      page,
      totalPages,
      total,
      query: status === 'all' ? '' : `status=${status}`,
      variant: 'admin',
    }),
  });
  return adminPage(env, user, '/admin/users', '用户管理', body, url);
}

const userForm = (env, user, url) =>
  editForm({
    env,
    user,
    url,
    back: '/admin/users',
    key: 'userid',
    label: '用户',
    fetchRow: (id) => first(env, 'SELECT * FROM user WHERE userid = ?', [id]),
    fields: async (u) => {
      // 最后一名管理员不允许被降级（权限兜底，与 userSave 的服务端校验保持一致）
      const isLastAdmin = u && u.role === 'administrator' && (await adminCount(env)) <= 1;
      // 也不允许把自己降级：提交后会立即失去后台权限，再也改不回来
      const isSelf = u && u.userid === user.userid;
      const lockRole = isLastAdmin || isSelf;
      const levels = await getLevels(env);
      const groups = await getGroups(env);
      const levelId = u ? Number(u.level_id) || 0 : 0;
      const groupId = u ? Number(u.group_id) || 0 : 0;
      // group_id = 0 在前台按「第一个用户组」解析（lib.resolveGroup），
      // 这里直接显示该组的真实组名，与用户列表列 groupName() 的口径一致，
      // 避免下拉里出现「组别管理」中并不存在的「第一个用户组」这个说法
      const defaultGroup = resolveGroup(groups, 0);
      return `
    <div class="cols">
      <div class="field"><label>用户名</label><input type="text" name="username" value="${e(u ? u.username : '')}" required></div>
      <div class="field"><label>昵称</label><input type="text" name="screenname" value="${e(u ? u.screenname : '')}"></div>
    </div>
    <div class="field"><label>密码${u ? '（留空则不修改）' : ''}</label><input type="password" name="password" autocomplete="new-password"${u ? '' : ' required'}></div>
    <div class="cols">
      <div class="field"><label>邮箱（用于头像）</label><input type="email" name="mail" value="${e(u ? u.mail : '')}"></div>
      <div class="field"><label>个人主页</label><input type="text" name="url" value="${e(u ? u.url : '')}"></div>
    </div>
    <div class="cols">
      <div class="field"><label>头像地址（留空使用邮箱头像）</label><input type="text" name="headpic" value="${e(u ? u.headpic : '')}"></div>
      <div class="field"><label>角色</label>
        <select name="role">
          <option value="visitor" ${!u || u.role !== 'administrator' ? 'selected' : ''}${lockRole ? ' disabled' : ''}>访客（仅前台评论）</option>
          <option value="administrator" ${u && u.role === 'administrator' ? 'selected' : ''}>管理员（可进后台）</option>
        </select>
        ${lockRole ? `<div class="hint">${isSelf ? '不能把当前登录账号降级为访客' : '最后一名管理员不可降级为访客'}</div>` : ''}
      </div>
    </div>
    <div class="field"><label>微博等级</label>
      <select name="level_id">
        <option value="0" ${levelId === 0 ? 'selected' : ''}>自动（按已发布微博数）</option>
        ${levels
          .map(
            (l) =>
              `<option value="${l.lid}" ${levelId === Number(l.lid) ? 'selected' : ''}>${e(l.name)}（≥${l.min_posts} 条）</option>`
          )
          .join('')}
      </select>
      <div class="hint">「自动」按该用户已发布微博数匹配等级；手动指定后固定佩戴所选等级的徽章。等级在「等级管理」中维护。</div>
    </div>
    <div class="cols">
      <div class="field"><label>用户组</label>
        <select name="group_id">
          <option value="0" ${groupId === 0 ? 'selected' : ''}>默认（${e(defaultGroup ? defaultGroup.name : '未分组')}）</option>
          ${groups
            .map((g) => `<option value="${g.gid}" ${groupId === Number(g.gid) ? 'selected' : ''}>${e(g.name)}</option>`)
            .join('')}
        </select>
        <div class="hint">用户组决定等级徽章使用哪一套图标（只占一个图标位），在「组别管理」中维护。</div>
      </div>
      <div class="field"><label>荣誉图标</label>
        <input type="text" name="honor" value="${e(u ? u.honor : '')}" placeholder="RY1">
        <div class="hint">填 public/images/badge/ 下的图标名：荣誉图标为 VIP*.gif 与 RY*.png，可不带扩展名（自动匹配 .png / .gif，如「RY1」「VIP1」），也可写全名（如「VIP1.gif」）；留空不显示。</div>
      </div>
    </div>`;
    },
  });

async function userSave(env, request, currentUser) {
  const form = await readForm(request);
  const userid = intField(form, 'userid');
  const username = field(form, 'username').trim();
  const screenname = field(form, 'screenname').trim() || username;
  const password = field(form, 'password');
  const mail = field(form, 'mail').trim();
  const url = field(form, 'url').trim();
  const headpic = field(form, 'headpic').trim();
  const role = field(form, 'role', 'visitor') === 'administrator' ? 'administrator' : 'visitor';
  const levelId = Math.max(0, intField(form, 'level_id'));
  const groupId = Math.max(0, intField(form, 'group_id'));
  const honor = field(form, 'honor').trim();
  if (!username) return backErr('/admin/users', '用户名不能为空');
  // 昵称 / 邮箱 / 口令下限复用「我的资料」与前台注册的同一套校验口径，避免各写一遍规则
  const badScreenname = validateScreenname(screenname);
  if (badScreenname) return backErr('/admin/users', badScreenname);
  const badMail = validateMail(mail);
  if (badMail) return backErr('/admin/users', badMail);
  // 昵称须全站唯一（与用户名同口径，库层由 idx_user_screenname 兜底）。
  // 排除自己：编辑时沿用原昵称不应被判为占用
  if (await screennameTaken(env, screenname, userid)) {
    return backErr('/admin/users', '该昵称已被使用');
  }
  if (password && password.length < PASSWORD_MIN_LENGTH) {
    return backErr('/admin/users', `密码至少 ${PASSWORD_MIN_LENGTH} 位`);
  }
  // 等级 / 用户组必须是真实存在的行，否则会把用户指向悬空 id（0 表示未指定）
  const levelRow = levelId ? await first(env, 'SELECT lid FROM user_level WHERE lid = ?', [levelId]) : null;
  const groupRow = groupId ? await first(env, 'SELECT gid FROM user_group WHERE gid = ?', [groupId]) : null;
  const safeLevelId = levelRow ? levelId : 0;
  const safeGroupId = groupRow ? groupId : 0;
  if (userid) {
    const target = await first(env, 'SELECT * FROM user WHERE userid = ?', [userid]);
    if (!target) return backErr('/admin/users', '用户不存在');
    if (target.role === 'administrator' && role !== 'administrator') {
      // 降级自己会立即失去后台权限，属于不可逆的自我夺权，必须拦住
      if (userid === currentUser.userid) return backErr('/admin/users', '不能把当前登录账号降级为访客');
      if ((await adminCount(env)) <= 1) {
        return backErr('/admin/users', '至少需保留一名管理员，无法降级最后一名管理员');
      }
    }
  }
  if (!userid && !password) return backErr('/admin/users', '新建用户必须设置初始密码');
  // 唯一约束已由 saveRow 转成友好提示；其余异常（如列缺失）直接上抛交入口记日志，
  // 与前台注册 / 其余保存路径口径一致，避免被误报成「请检查输入」而无从排查
  // 口令只在有值时重算：编辑时留空表示「不改密码」
  const hashed = password ? await hashPassword(password) : '';
  const bad = await saveRow(env, '/admin/users', {
    id: userid,
    update: [
      'UPDATE user SET username=?, screenname=?, mail=?, url=?, headpic=?, role=?, level_id=?, group_id=?, honor=? WHERE userid=?',
      [username, screenname, mail, url, headpic, role, safeLevelId, safeGroupId, honor],
    ],
    insert: [
      'INSERT INTO user (username, screenname, md5password, mail, url, headpic, role, level_id, group_id, honor, created) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [username, screenname, hashed, mail, url, headpic, role, safeLevelId, safeGroupId, honor, now()],
    ],
    uniqueErr: '保存失败：用户名或昵称已被占用',
  });
  if (bad) return bad;
  if (userid && hashed) {
    await run(env, 'UPDATE user SET md5password=? WHERE userid=?', [hashed, userid]);
  }
  return backMsg('/admin/users', '已保存');
}

/**
 * 删除用户并级联清理其内容与互动数据，返回失败原因（成功时返回空串）。
 * 单条删除与批量删除共用，保证两者的保护规则与清理范围完全一致。
 */
async function deleteUserCascade(env, id, currentUser) {
  if (!id) return '参数错误';
  if (id === currentUser.userid) return '不能删除当前登录的账号';
  const target = await first(env, 'SELECT * FROM user WHERE userid = ?', [id]);
  if (!target) return '用户不存在';
  if (target.role === 'administrator' && (await adminCount(env)) <= 1) {
    return '至少需保留一名管理员，无法删除最后一名管理员';
  }
  // 连同该用户的内容与互动数据一并清理，避免留下作者/点赞人已不存在的孤儿数据
  const ownPosts = await all(env, 'SELECT pid FROM post WHERE author_id = ?', [id]);
  for (const p of ownPosts) {
    await deletePostCascade(env, p.pid);
  }
  await run(env, 'DELETE FROM comment WHERE userid = ?', [id]);
  await run(env, 'DELETE FROM post_like WHERE userid = ?', [id]);
  await run(env, 'DELETE FROM follow WHERE userid = ? OR target_id = ?', [id, id]);
  // 该用户已不存在，其登录失败计数也一并清掉，避免留下永远用不上的限流记录
  await clearLoginFailuresOf(env, target.username);
  await run(env, 'DELETE FROM user WHERE userid = ?', [id]);
  return '';
}

async function userDelete(env, request, currentUser) {
  const form = await readForm(request);
  const userid = intField(form, 'userid');
  const reason = await deleteUserCascade(env, userid, currentUser);
  if (reason) return backErr('/admin/users', reason);
  return backMsg('/admin/users', '已删除');
}

/* ---------------- 我的资料（当前登录管理员本人） ---------------- */

async function profilePage(env, user, url) {
  const body = `
  <form class="wb-card wb-form wb-form-wide" method="post" action="/admin/profile/save">
    <h1>我的资料</h1>
    <div class="tip">这里只修改当前登录账号（${e(user.username)}）的个人资料与密码；角色与用户名的调整请前往<a href="/admin/users">用户管理</a>。</div>
    <div class="cols">
      <div class="field"><label>用户名</label><input type="text" value="${e(user.username)}" disabled></div>
      <div class="field"><label>昵称</label><input type="text" name="screenname" maxlength="${SCREENNAME_MAX_LENGTH}" value="${e(user.screenname || '')}" required></div>
    </div>
    <div class="cols">
      <div class="field"><label>邮箱（用于在 <a href="https://cravatar.com/" target="_blank" rel="noopener noreferrer">cravatar.com</a> 生成头像）</label><input type="email" name="mail" value="${e(user.mail || '')}"></div>
      <div class="field"><label>个人主页</label><input type="text" name="url" value="${e(user.url || '')}"></div>
    </div>
    <div class="field"><label>头像地址（留空使用邮箱头像）</label><input type="text" name="headpic" value="${e(user.headpic || '')}"></div>
    <h2>修改密码</h2>
    <div class="cols">
      <div class="field"><label>当前密码</label><input type="password" name="oldpassword" autocomplete="current-password" placeholder="不修改密码可留空"></div>
      <div class="field"><label>新密码</label><input type="password" name="password" autocomplete="new-password" placeholder="至少 ${PASSWORD_MIN_LENGTH} 位"></div>
    </div>
    <div class="field"><label>确认新密码</label><input type="password" name="password2" autocomplete="new-password"></div>
    <div class="inline" style="margin-top:16px"><button class="wb-btn p" type="submit">保存</button><a class="wb-btn" href="/admin">返回仪表盘</a></div>
  </form>`;
  return adminPage(env, user, '/admin/profile', '我的资料', body, url);
}

async function profileSave(env, request, currentUser) {
  const form = await readForm(request);
  const fail = (message) => backErr('/admin/profile', message);
  const me = await first(env, 'SELECT * FROM user WHERE userid = ?', [currentUser.userid]);
  if (!me) return redirect('/admin/login');
  const error = await saveProfile(env, me, {
    screenname: field(form, 'screenname'),
    mail: field(form, 'mail'),
    url: field(form, 'url'),
    headpic: field(form, 'headpic'),
    oldPassword: field(form, 'oldpassword'),
    password: field(form, 'password'),
    confirm: field(form, 'password2'),
  });
  if (error) return fail(error);
  // 后台改密同样会让口令指纹失效：重签后台会话（保留 admin 标记），当前浏览器继续可用
  return backMsg('/admin/profile', '资料已保存', await refreshSession(env, currentUser.userid, { admin: true }));
}

/* ---------------- 路由 ---------------- */

export async function adminRouter(request, env, url) {
  const path = url.pathname;
  const method = request.method;

  // 登录
  if (path === '/admin/login') {
    const session = await getSession(env, request);
    const adminSession = session && session.role === 'administrator' && session.isAdminSession;
    const next = safeNext(url.searchParams.get('next'));
    // 已持有后台登录态：直接回到目标页，不再渲染登录表单
    if (method === 'GET') {
      return adminSession
        ? redirect(next || '/admin')
        : html(await loginPage(env, session, errorOf(url), next));
    }
    const form = await readForm(request);
    const password = field(form, 'password');
    const back = safeNext(field(form, 'next')) || next;
    const deny = (message) =>
      redirect('/admin/login?err=' + encodeURIComponent(message) + (back ? '&next=' + encodeURIComponent(back) : ''));
    const result = await attemptLogin(env, request, {
      username: field(form, 'userName').trim(),
      password,
      requireAdmin: true,
    });
    if (!result.ok) {
      // pending 是「口令正确但账号待审核」，与撞库无关，提示要与前台 /login 保持一致，
      // 否则管理员会误以为自己输错了口令（走 requireAdmin 时该分支同样按待审处理）
      return deny(
        result.throttled
          ? LOGIN_THROTTLE_MESSAGE
          : result.pending
            ? '账号正在审核中，通过后方可登录'
            : '用户名或密码错误，或该账号无后台权限'
      );
    }
    return redirect(back || '/admin', { 'set-cookie': await createSession(env, result.user, { admin: true }) });
  }

  // 退出必须是同源页面上的主动跳转：否则第三方页面用 <img src="/admin/logout"> 就能把已登录的后台会话强制踢掉
  if (path === '/admin/logout') {
    if (method !== 'GET' || !sameOrigin(request, url)) return forbidden();
    return redirect('/admin/login', { 'set-cookie': clearSession() });
  }

  // 鉴权：未登录时带上原地址，登录后跳回
  const user = await isAdmin(env, request);
  if (!user) return redirect('/admin/login?next=' + encodeURIComponent(path + (url.search || '')));

  // 初始口令未更换：除「初始化账号」页外一律拦回该页，避免公开的初始口令被长期使用
  if (user.must_change) {
    if (path !== INIT_PATH) return redirect(INIT_PATH);
    return method === 'POST' ? initSave(env, request, user) : initPage(env, user, url);
  }

  // 菜单权限：取决于所属用户组勾选的后台菜单（user_group.admin_menus），未勾选的菜单连同其下的
  // 新增 / 保存 / 删除 / 批量删除路由一并拦截，避免直接敲地址绕过左栏；menus 为 null 表示可见全部
  const menus = await visibleMenuKeys(env, user);
  const menu = menuOfPath(path);
  if (menus && menu && !menus.has(menu.key)) {
    const home = MENUS.find((m) => menus.has(m.key)) || MENUS[0];
    return adminPage(
      env,
      user,
      '',
      '无权访问',
      `<div class="wb-card wb-card-pad">你的用户组没有「${menu.label}」权限。<p style="margin-top:12px"><a class="wb-btn" href="${home.href}">返回${home.label}</a></p></div>`,
      null,
      403
    );
  }

  if (path === '/admin' || path === '/admin/') return dashboard(env, user, url);

  // 文章
  if (path === '/admin/posts') return postList(env, user, url, false);
  if (path === '/admin/posts/new') return postForm(env, user, url, false);
  if (path === '/admin/posts/edit') return postForm(env, user, url, false);
  if (path === '/admin/posts/save' && method === 'POST') return postSave(env, request, user, false);
  if (path === '/admin/posts/delete' && method === 'POST') return postDelete(env, request, false);
  if (path === '/admin/posts/bulk-delete' && method === 'POST')
    return bulkDelete(request, '/admin/posts', (id) => deletePostCascade(env, id, { isPage: false }));
  if (path === '/admin/posts/status' && method === 'POST') {
    const form = await readForm(request);
    const pid = intField(form, 'pid');
    const raw = field(form, 'status', '');
    const from = field(form, 'from', '');
    const back = POST_STATUSES.includes(from) ? `?status=${from}&` : '?';
    // 非法状态直接拒绝，避免把构造请求里的脏值静默当成「发布」
    if (!pid || !POST_STATUSES.includes(raw)) return redirect(`/admin/posts${back}err=${encodeURIComponent('参数错误')}`);
    // 仅供文章审核流使用：页面只有发布/草稿两种状态，请在页面编辑表单里修改
    const res = await run(env, 'UPDATE post SET status = ?, modified = ? WHERE pid = ? AND is_page = 0', [raw, now(), pid]);
    if (!changed(res)) return redirect(`/admin/posts${back}err=${encodeURIComponent('文章不存在')}`);
    const label =
      raw === 'publish'
        ? '已通过并发布'
        : raw === 'draft'
          ? '已驳回为草稿'
          : raw === 'private'
            ? '已转为私密'
            : '已转为待审核';
    return redirect(`/admin/posts${back}msg=${encodeURIComponent(label)}`);
  }

  // 独立页面
  if (path === '/admin/pages') return postList(env, user, url, true);
  if (path === '/admin/pages/new') return postForm(env, user, url, true);
  if (path === '/admin/pages/edit') return postForm(env, user, url, true);
  if (path === '/admin/pages/save' && method === 'POST') return postSave(env, request, user, true);
  if (path === '/admin/pages/delete' && method === 'POST') return postDelete(env, request, true);
  if (path === '/admin/pages/bulk-delete' && method === 'POST')
    return bulkDelete(request, '/admin/pages', (id) => deletePostCascade(env, id, { isPage: true }));

  // 分类
  if (path === '/admin/categories') return categoryList(env, user, url);
  if (path === '/admin/categories/new' || path === '/admin/categories/edit') return categoryForm(env, user, url);
  if (path === '/admin/categories/save' && method === 'POST') return categorySave(env, request);
  if (path === '/admin/categories/delete' && method === 'POST') return categoryDelete(env, request);
  if (path === '/admin/categories/bulk-delete' && method === 'POST')
    return bulkDelete(request, '/admin/categories', (id) => deleteCategory(env, id));

  // 标签
  if (path === '/admin/tags') return tagList(env, user, url);
  if (path === '/admin/tags/new' || path === '/admin/tags/edit') return tagForm(env, user, url);
  if (path === '/admin/tags/save' && method === 'POST') return tagSave(env, request);
  if (path === '/admin/tags/delete' && method === 'POST') return tagDelete(env, request);
  if (path === '/admin/tags/bulk-delete' && method === 'POST')
    return bulkDelete(request, '/admin/tags', (id) => deleteTag(env, id));

  // 评论
  if (path === '/admin/comments') return commentList(env, user, url);
  if (path === '/admin/comments/status' && method === 'POST') {
    const form = await readForm(request);
    const res = await run(env, 'UPDATE comment SET status = ? WHERE coid = ?', [
      field(form, 'status', 'approved') === 'pending' ? 'pending' : 'approved',
      intField(form, 'coid'),
    ]);
    if (!changed(res)) return backErr('/admin/comments', '评论不存在');
    return backMsg('/admin/comments', '已更新评论状态');
  }
  if (path === '/admin/comments/delete' && method === 'POST')
    return deleteOne(request, '/admin/comments', 'coid', (id) => deleteComment(env, id), '已删除评论');
  if (path === '/admin/comments/bulk-delete' && method === 'POST')
    return bulkDelete(request, '/admin/comments', (id) => deleteComment(env, id));

  // 点赞 / 关注
  if (path === '/admin/likes') return likeList(env, user, url);
  if (path === '/admin/likes/delete' && method === 'POST')
    return deleteOne(request, '/admin/likes', 'lid', (id) => deleteLike(env, id), '已删除点赞记录');
  if (path === '/admin/likes/bulk-delete' && method === 'POST')
    return bulkDelete(request, '/admin/likes', (id) => deleteLike(env, id));
  if (path === '/admin/follows') return followList(env, user, url);
  if (path === '/admin/follows/delete' && method === 'POST')
    return deleteOne(request, '/admin/follows', 'fid', (id) => deleteFollow(env, id), '已删除关注记录');
  if (path === '/admin/follows/bulk-delete' && method === 'POST')
    return bulkDelete(request, '/admin/follows', (id) => deleteFollow(env, id));

  // 友链
  if (path === '/admin/links') return linkList(env, user, url);
  if (path === '/admin/links/new' || path === '/admin/links/edit') return linkForm(env, user, url);
  if (path === '/admin/links/save' && method === 'POST') return linkSave(env, request);
  if (path === '/admin/links/delete' && method === 'POST') return linkDelete(env, request);
  if (path === '/admin/links/bulk-delete' && method === 'POST')
    return bulkDelete(request, '/admin/links', (id) => deleteLink(env, id));

  // 导航
  if (path === '/admin/nav') return navList(env, user, url);
  if (path === '/admin/nav/new' || path === '/admin/nav/edit') return navForm(env, user, url);
  if (path === '/admin/nav/save' && method === 'POST') return navSave(env, request);
  if (path === '/admin/nav/delete' && method === 'POST') return navDelete(env, request);
  if (path === '/admin/nav/bulk-delete' && method === 'POST')
    return bulkDelete(request, '/admin/nav', (id) => deleteNav(env, id));

  // 用户
  if (path === '/admin/users') return userList(env, user, url);
  if (path === '/admin/users/new' || path === '/admin/users/edit') return userForm(env, user, url);
  if (path === '/admin/users/save' && method === 'POST') return userSave(env, request, user);
  if (path === '/admin/users/status' && method === 'POST') {
    const form = await readForm(request);
    const target = intField(form, 'userid');
    // 把自己改成待审核会当场失去登录能力，直接拦掉
    if (target === user.userid) return backErr('/admin/users', '不能修改当前登录账号的状态');
    const res = await run(env, 'UPDATE user SET status = ? WHERE userid = ?', [
      field(form, 'status', 'active') === 'pending' ? 'pending' : 'active',
      target,
    ]);
    if (!changed(res)) return backErr('/admin/users', '用户不存在');
    return backMsg('/admin/users', '已更新用户状态');
  }
  if (path === '/admin/users/delete' && method === 'POST') return userDelete(env, request, user);
  if (path === '/admin/users/bulk-delete' && method === 'POST')
    return bulkDelete(request, '/admin/users', async (id) => {
      // 与单条删除共用同一套「保护规则 + 级联清理」，避免批量删除留下孤儿数据
      const reason = await deleteUserCascade(env, id, user);
      return !reason;
    });

  // 等级
  if (path === '/admin/levels') return levelList(env, user, url);
  if (path === '/admin/levels/new' || path === '/admin/levels/edit') return levelForm(env, user, url);
  if (path === '/admin/levels/save' && method === 'POST') return levelSave(env, request);
  if (path === '/admin/levels/delete' && method === 'POST') return levelDelete(env, request);
  if (path === '/admin/levels/bulk-delete' && method === 'POST')
    return bulkDelete(request, '/admin/levels', (id) => deleteLevel(env, id));

  // 用户组
  if (path === '/admin/groups') return groupList(env, user, url);
  if (path === '/admin/groups/new' || path === '/admin/groups/edit') return groupForm(env, user, url);
  if (path === '/admin/groups/save' && method === 'POST') return groupSave(env, request, user);
  if (path === '/admin/groups/delete' && method === 'POST') return groupDelete(env, request);
  if (path === '/admin/groups/bulk-delete' && method === 'POST')
    return bulkDelete(request, '/admin/groups', (id) => deleteGroup(env, id));

  // 我的资料（仅本人）
  if (path === '/admin/profile') return profilePage(env, user, url);
  if (path === '/admin/profile/save' && method === 'POST') return profileSave(env, request, user);

  // 站点设置
  if (path === '/admin/options' && method === 'GET') return optionsPage(env, user, url);
  if (path === '/admin/options' && method === 'POST')
    return saveSettings(env, request, SETTING_GROUPS, '/admin/options');
  if (path === '/admin/options/reset' && method === 'POST') return optionsReset(env);

  // 功能管理（敏感入口；进入本路由前 isAdmin 已确保是 administrator 会话）
  if (path === '/admin/features' || path.startsWith('/admin/features/')) {
    if (path === '/admin/features' && method === 'GET') return featuresPage(env, user, url);
    if (path === '/admin/features' && method === 'POST')
      return saveSettings(env, request, FEATURE_GROUPS, '/admin/features');
    if (path === '/admin/features/backup' && method === 'POST') return featuresBackup(env, 'backup');
    if (path === '/admin/features/restore' && method === 'POST') return featuresBackup(env, 'restore');
    if (path === '/admin/features/unbackup' && method === 'POST') return featuresBackup(env, 'delete');
  }

  return missingPage(env, user, '/admin', '页面不存在', '该后台页面', '返回仪表盘');
}
