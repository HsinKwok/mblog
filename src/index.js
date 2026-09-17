/**
 * MBlog · 仿微博主题博客（Cloudflare Workers）
 * 前台：复刻 Typecho「Weibo」主题；后台：/admin 全量管理
 */
import {
  html,
  redirect,
  field,
  intField,
  intParam,
  backMsg,
  backErr,
  withNotice,
  readForm,
  now,
  all,
  first,
  run,
  getOptions,
  createSession,
  clearSession,
  getSession,
  slugify,
  slugForEdit,
  insertPost,
  reviewRequired,
  groupReviewPerms,
  saveTags,
  stripTags,
  escapeHtml as e,
  isDue,
  pageInfo,
  WEIBO_TITLE_MAX_LENGTH,
  parseTagNames,
  tagNamesOf,
  POST_STATUS_LABEL,
  normalizeStatement,
  TITLE_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  deletePostCascade,
  readCookie,
  toggleLike,
  toggleFollow,
  avatarFor,
  getGroups,
  getLevels,
  badgeOf,
  sameOrigin,
  forbidden,
  optionOn,
  optionRequired,
  hashPassword,
  attemptLogin,
  LOGIN_THROTTLE_MESSAGE,
  saveProfile,
  normalizeSchedule,
  normalizeVisibility,
  topicNamesIn,
  hasContent,
  frontUrl,
  decodeSlug,
  slugHref,
  numericKey,
  placeholders,
  NOW_SQL,
  noticeOf,
  errorOf,
  validateTitleContent,
  validateComment,
  validateWeibo,
  validateScreenname,
  screennameTaken,
  validateMail,
  likePattern,
  POST_COUNT_COLUMNS,
  totalPagesOf,
  validCategoryId,
} from './lib.js';
import { listPage, singlePage, repostPage, authPage, messagePage, writePage, myPostsPage, settingsPage, reviewPage, sitePage, linkItems } from './theme.js';
import { adminRouter } from './admin.js';

/* ---------------- 公共数据 ---------------- */

async function commonData(env, session = null, preloadedGroups = null) {
  const [options, categories, links, nav, hotComments, topics, levels, groups] = await Promise.all([
    getOptions(env),
    all(env, 'SELECT * FROM category ORDER BY ordernum, cid'),
    all(env, 'SELECT * FROM link ORDER BY ordernum, lid'),
    // 前台顶栏导航：后台「导航管理」维护；为空时前台回退内置默认导航
    all(env, 'SELECT * FROM nav ORDER BY ordernum, nid'),
    all(
      env,
      `SELECT cm.coid, cm.pid, cm.author, cm.mail, cm.content, p.is_page, p.slug
       FROM comment cm JOIN post p ON p.pid = cm.pid
       WHERE cm.status = 'approved' AND p.status = 'publish'
         AND p.is_page = 0 AND p.created <= ${NOW_SQL}
       ORDER BY cm.coid DESC LIMIT 6`
    ),
    // 热门话题（复用标签，统计已发布文章数量）
    all(
      env,
      `SELECT t.name, t.slug, COUNT(DISTINCT pt.pid) c
       FROM tag t
       JOIN post_tag pt ON pt.tid = t.tid
       JOIN post p ON p.pid = pt.pid AND p.status = 'publish' AND p.is_page = 0
         AND p.created <= ${NOW_SQL}
       GROUP BY t.tid, t.name, t.slug
       ORDER BY c DESC, t.tid LIMIT 10`
    ),
    // 微博等级（后台「等级管理」维护）：用户徽章据此解析
    getLevels(env),
    // 用户组（后台「用户组管理」维护）：决定等级徽章使用哪一套图标；调用方已查过时直接复用，避免同一次请求重复查库
    preloadedGroups ? Promise.resolve(preloadedGroups) : getGroups(env),
  ]);
  const profile = await profileData(env, session, options, levels, groups);
  return { options, categories, links, nav, hotComments, topics, profile, levels, groups };
}

/**
 * 前台页面上下文：会话与公共数据一次取回，返回 { session, ...公共数据 }。
 * 各页面按需解构自己用得到的字段，省去每处重复的「取会话 → 查公共数据」；
 * 需要先做登录校验的入口可自行取会话后再传入（传 null 表示已确认未登录，不再重复查库）；
 * preloadedGroups 供上游已查过用户组的场景复用，省一次查询。
 */
async function pageCtx(request, env, session, preloadedGroups = null) {
  const current = session === undefined ? await getSession(env, request) : session;
  return { session: current, ...(await commonData(env, current, preloadedGroups)) };
}

/**
 * 左栏个人卡数据：未登录展示后台「站点设置 → 头部资料卡」的昵称 / 简介 / 头像，
 * 未填写时回退「站点设置」的站点名称与简介；
 * 卡片上的站点地址与资料卡按钮、菜单由视图层直接读取 options 渲染；
 * 登录后展示当前登录用户自己的资料与互动数据。
 */
async function profileData(env, session, options, levels = [], groups = []) {
  if (!session) {
    return {
      mode: 'site',
      name: options.yourNickname || options.title,
      avatar: options.headImgUrl || options.faviconUrl || '',
      desc: options.yourDescription || options.description,
    };
  }
  const uid = session.userid;
  const [postRow, followingRow, followersRow] = await Promise.all([
    first(
      env,
      `SELECT COUNT(*) c FROM post WHERE author_id = ? AND is_page = 0 AND status = 'publish' AND created <= ${NOW_SQL}`,
      [uid]
    ),
    first(env, 'SELECT COUNT(*) c FROM follow WHERE userid = ?', [uid]),
    first(env, 'SELECT COUNT(*) c FROM follow WHERE target_id = ?', [uid]),
  ]);
  return {
    mode: 'user',
    name: session.screenname || session.username,
    avatar: avatarFor(session, 120),
    desc: session.url || `@${session.username}`,
    isAdmin: session.role === 'administrator',
    // 审核权限：由用户组决定，前台据此显示「审核中心」入口（管理员始终具备）
    ...groupReviewPerms(groups, session),
    // 等级徽章：图标集由用户组决定（只占一个图标位），等级后台手动指定优先，否则按已发布微博数自动匹配
    badge: badgeOf(levels, groups, { levelId: session.level_id, postCount: postRow?.c || 0, groupId: session.group_id }),
    // 荣誉图标：用户上存的图标名，前台自动匹配 .png / .gif
    honor: session.honor || '',
    stats: [
      { label: '微博', value: postRow?.c || 0, href: '/write/mine' },
      { label: '关注', value: followingRow?.c || 0 },
      { label: '粉丝', value: followersRow?.c || 0 },
    ],
  };
}

/**
 * 解析各行作者的等级徽章文件名（写入 row.author_badge）。
 * 依赖查询里附带的 author_level_id（手动指定等级，0 为自动）、author_posts（已发布微博数）
 * 与 author_group_id（所属用户组，决定图标集）；row.author_honor 为作者上存的荣誉图标名。
 */
function attachAuthorBadges(rows, levels = [], groups = []) {
  for (const row of rows) {
    row.author_badge = badgeOf(levels, groups, {
      levelId: row.author_level_id,
      postCount: row.author_posts,
      groupId: row.author_group_id,
    });
  }
  return rows;
}

async function fetchPosts(env, url, { where, params = [], size = 10, session = null, levels = [], groups = [] }) {
  // 分页口径（COUNT → 总页数 → 夹页）直接复用后台列表同款 pageInfo，避免前后台各写一遍
  const { page: current, total, totalPages } = await pageInfo(
    env,
    url,
    size,
    `SELECT COUNT(*) c FROM post p WHERE ${where}`,
    params
  );
  const rows = await all(
    env,
    `SELECT p.*, c.name AS category_name, c.slug AS category_slug,
            u.screenname, u.headpic AS author_headpic, u.mail AS author_mail, u.level_id AS author_level_id,
            u.group_id AS author_group_id, u.honor AS author_honor,
            (SELECT COUNT(*) FROM post ap WHERE ap.author_id = p.author_id AND ap.is_page = 0 AND ap.status = 'publish' AND ap.created <= ${NOW_SQL}) AS author_posts,
            ${POST_COUNT_COLUMNS}
     FROM post p
     LEFT JOIN category c ON c.cid = p.category_id
     LEFT JOIN user u ON u.userid = p.author_id
     WHERE ${where}
     ORDER BY p.is_top DESC, p.created DESC, p.pid DESC
     LIMIT ? OFFSET ?`,
    [...params, size, (current - 1) * size]
  );
  attachAuthorBadges(rows, levels, groups);
  await decoratePosts(env, rows, session);
  return { rows, total, totalPages, page: current };
}

/** 补充信息流卡片所需数据：标签、当前用户点赞状态、转发源文章 */
async function decoratePosts(env, rows, session) {
  if (!rows.length) return rows;
  const ids = rows.map((r) => r.pid);
  const holders = placeholders(ids.length);

  const tagRows = await all(
    env,
    `SELECT pt.pid, t.name, t.slug FROM post_tag pt JOIN tag t ON t.tid = pt.tid WHERE pt.pid IN (${holders})`,
    ids
  );
  for (const row of rows) row.tags = tagRows.filter((t) => t.pid === row.pid);

  if (session) {
    const likedRows = await all(
      env,
      `SELECT pid FROM post_like WHERE userid = ? AND pid IN (${holders})`,
      [session.userid, ...ids]
    );
    const likedIds = new Set(likedRows.map((r) => r.pid));
    for (const row of rows) row.liked = likedIds.has(row.pid);

    const authorIds = [...new Set(rows.map((r) => r.author_id).filter((v) => v && v !== session.userid))];
    let followedIds = new Set();
    if (authorIds.length) {
      const followRows = await all(
        env,
        `SELECT target_id FROM follow WHERE userid = ? AND target_id IN (${placeholders(authorIds.length)})`,
        [session.userid, ...authorIds]
      );
      followedIds = new Set(followRows.map((r) => r.target_id));
    }
    for (const row of rows) row.followed = followedIds.has(row.author_id);
  } else {
    for (const row of rows) {
      row.liked = false;
      row.followed = false;
    }
  }

  const repostIds = [...new Set(rows.filter((r) => r.repost_pid).map((r) => r.repost_pid))];
  if (repostIds.length) {
    const srcRows = await all(
      env,
      `SELECT p.pid, p.title, p.content, u.screenname
       FROM post p LEFT JOIN user u ON u.userid = p.author_id
       WHERE p.pid IN (${placeholders(repostIds.length)}) AND p.status = 'publish'
         AND p.is_page = 0 AND p.created <= ${NOW_SQL}`,
      repostIds
    );
    const map = new Map(srcRows.map((r) => [r.pid, r]));
    for (const row of rows) row.repost_source = row.repost_pid ? map.get(row.repost_pid) || null : null;
  } else {
    for (const row of rows) row.repost_source = null;
  }
  return rows;
}

/* ---------------- 页面构建 ---------------- */

async function renderList(
  request,
  env,
  url,
  { where, params, baseUrl, pageTitle, activeSlug, headingTitle, breadcrumb, notice, noticeType, active = 'home' }
) {
  const { session, options, categories, links, nav, hotComments, topics, profile, levels, groups } = await pageCtx(request, env);
  // 回跳提示：默认读取本次地址上的 ?err= / ?msg=（backErr / backMsg 写入），
  // 未传 notice 时所有列表页（首页 / 分类 / 标签 / 搜索）都能显示提示，显式传入时以调用方为准。
  const err = errorOf(url);
  const finalNotice = notice !== undefined ? notice : err || noticeOf(url);
  const finalNoticeType = noticeType !== undefined ? noticeType : err ? 'err' : 'ok';
  const { rows, totalPages, page: current } = await fetchPosts(env, url, {
    where,
    params,
    size: parseInt(options.pageSize, 10) || 10,
    session,
    levels,
    groups,
  });
  return html(
    listPage({
      options,
      session,
      pageTitle,
      posts: rows,
      categories,
      hotComments,
      links,
      nav,
      topics,
      profile,
      page: current,
      totalPages,
      baseUrl,
      activeSlug,
      headingTitle,
      breadcrumb,
      active,
      notice: finalNotice,
      noticeType: finalNoticeType,
    })
  );
}

// 已发布内容：排除独立页面、私密，以及尚未到达定时时间的短微博
const PUBLISHED = `p.status = 'publish' AND p.is_page = 0 AND p.created <= ${NOW_SQL}`;

/**
 * 详情页共用的字段与关联：文章与独立页面只差一个 is_page 条件，
 * 作者徽章所需的等级 / 用户组 / 荣誉与已发布微博数一并取出；
 * 互动计数（评论 / 点赞 / 转发）与信息流共用同一列定义，避免详情页少列导致计数恒为 0。
 */
const POST_DETAIL_COLUMNS = `p.*, c.name AS category_name, c.slug AS category_slug,
              u.screenname, u.headpic AS author_headpic, u.mail AS author_mail, u.role AS author_role,
              u.level_id AS author_level_id, u.group_id AS author_group_id, u.honor AS author_honor,
              (SELECT COUNT(*) FROM post ap WHERE ap.author_id = p.author_id AND ap.is_page = 0 AND ap.status = 'publish' AND ap.created <= ${NOW_SQL}) AS author_posts,
              ${POST_COUNT_COLUMNS}`;
const POST_DETAIL_FROM = `FROM post p
       LEFT JOIN category c ON c.cid = p.category_id
       LEFT JOIN user u ON u.userid = p.author_id`;

/**
 * 详情页（独立页面 / 文章）共用的可见性判定：按 pid 优先、slug 兜底命中一行，
 * 未发布与未到定时时间的内容仅作者本人、管理员与具备审核权限的用户组可见。
 * 命中并可见时返回渲染所需上下文（未发布时同时透传用户组，供 renderSingle 复用），
 * 否则返回 null，由调用方给出各自的 404 文案。
 */
async function visiblePost(env, request, { isPage, key }) {
  // 纯数字 key 优先按 pid 命中，slug 只作兜底：两者混在同一条件里时，
  // 若某条内容的 slug 恰好是纯数字，就可能把链接指到别人的内容上。
  const pidKey = numericKey(key);
  const session = await getSession(env, request);
  const post = await first(
    env,
    `SELECT ${POST_DETAIL_COLUMNS} ${POST_DETAIL_FROM}
     WHERE p.is_page = ${isPage ? 1 : 0} AND (p.pid = ? OR p.slug = ?)
     ORDER BY (p.pid = ?) DESC LIMIT 1`,
    [pidKey, key, pidKey]
  );
  if (!post) return null;
  const canPreview = session && (session.userid === post.author_id || session.role === 'administrator');
  const published = post.status === 'publish' && isDue(post.created);
  // 具备审核权限的用户组也要能预览待审内容；但私密内容只对作者本人与管理员开放，
  // 与下方提示文案口径一致，故 private 不参与审核预览
  let groups = null;
  let canReviewPreview = false;
  if (!published && !canPreview && session && post.status !== 'private') {
    groups = await getGroups(env);
    canReviewPreview = groupReviewPerms(groups, session).canReview;
  }
  if (!published && !canPreview && !canReviewPreview) return null;
  const subject = isPage ? '本页面' : '本文';
  const preview = published
    ? ''
    : post.status === 'publish'
      ? `${subject}为定时发布内容，尚未到发布时间，仅作者本人与管理员可见。`
      : `${subject}当前为${POST_STATUS_LABEL[post.status] || '草稿'}状态，仅作者本人与管理员可见。`;
  return { post, session, published, preview, groups };
}

/** 前台提示页：自动加载公共数据与会话 */
async function renderMessage(request, env, { pageTitle, message, status = 200 }) {
  const { session, options, nav } = await pageCtx(request, env);
  return html(
    messagePage({ options, session, pageTitle, message, nav }),
    status
  );
}

/** 登录 / 注册页：两者只差模式与标题，注册页在开关关闭时直接给提示 */
async function authPageFor(request, env, url, mode) {
  const { session, options, nav } = await pageCtx(request, env);
  const isRegister = mode === 'register';
  if (isRegister && !optionOn(options, 'registerOpen')) {
    return renderMessage(request, env, { pageTitle: '注册已关闭', message: '本站暂未开放注册。' });
  }
  return html(
    authPage({
      options,
      session,
      pageTitle: isRegister ? '注册' : '登录',
      mode,
      error: errorOf(url),
      notice: noticeOf(url),
      review: optionRequired(options, 'registerReview'),
      nav,
    })
  );
}

/** 从 Referer 取回跳转路径，避免开放重定向 */
function backTo(request, fallback = '/') {
  try {
    const u = new URL(request.headers.get('referer') || '');
    return u.pathname + u.search;
  } catch {
    return fallback;
  }
}

/** 转发功能未开放时的统一提示页（转发确认页与提交转发共用） */
const REPOST_CLOSED = { pageTitle: '转发未开放', message: '本站暂未开放转发功能。' };

/**
 * 互动开关（点赞 / 关注 / 转发）的统一校验：未登录回登录页，
 * 开关关闭时给出提示。通过时返回 { session, options }，否则返回 { blocked: Response }。
 * closed 用于需要整页提示而非回跳的入口（如转发），省略则回来源页提示。
 */
async function toggleGate(request, env, { flag, loginTip, closedTip, closed = null }) {
  const session = await getSession(env, request);
  if (!session) return { blocked: backErr('/login.html', loginTip) };
  const options = await getOptions(env);
  if (!optionOn(options, flag)) {
    return { blocked: closed ? closed(request, env) : backErr(backTo(request, '/'), closedTip) };
  }
  return { session, options };
}

/* ---------------- 前台路由 ---------------- */

async function frontRouter(request, env, url) {
  const path = url.pathname;
  const method = request.method;

  // 首页
  if (path === '/' || path === '/index.html') {
    return renderList(request, env, url, {
      where: PUBLISHED,
      baseUrl: '/',
      pageTitle: '首页',
    });
  }

  // 分类归档
  const catMatch = /^\/category\/([^/]+?)(?:\.html)?$/.exec(path);
  if (catMatch) {
    const slug = decodeSlug(catMatch[1]);
    const category = await first(env, 'SELECT * FROM category WHERE slug = ?', [slug]);
    if (!category) return notFoundPage(request, env, '分类不存在');
    return renderList(request, env, url, {
      where: `${PUBLISHED} AND p.category_id = ?`,
      params: [category.cid],
      // 别名可能含中文等非 ASCII 字符，翻页地址同样要编码后再拼
      baseUrl: slugHref('/category', slug),
      pageTitle: `分类 ${category.name}`,
      activeSlug: slug,
      // 分类归档不属于任何导航项，不点亮顶栏，避免误高亮「首页」
      active: '',
      breadcrumb: `<a href="/">首页</a> &raquo; 分类：${e(category.name)}`,
    });
  }

  // 标签归档
  const tagMatch = /^\/tag\/([^/]+?)(?:\.html)?$/.exec(path);
  if (tagMatch) {
    const slug = decodeSlug(tagMatch[1]);
    const tag = await first(env, 'SELECT * FROM tag WHERE slug = ?', [slug]);
    if (!tag) return notFoundPage(request, env, '标签不存在');
    return renderList(request, env, url, {
      where: `${PUBLISHED} AND p.pid IN (SELECT pid FROM post_tag WHERE tid = ?)`,
      params: [tag.tid],
      // 别名可能含中文等非 ASCII 字符，翻页地址同样要编码后再拼
      baseUrl: slugHref('/tag', slug),
      pageTitle: `标签 ${tag.name}`,
      headingTitle: `标签：${tag.name}`,
      // 标签归档不属于任何导航项，不点亮顶栏
      active: '',
      breadcrumb: `<a href="/">首页</a> &raquo; 标签：${e(tag.name)}`,
    });
  }

  // 搜索
  if (path === '/search' || path === '/search.html') {
    const keyword = (url.searchParams.get('s') || url.searchParams.get('q') || '').trim();
    if (!keyword) return notFoundPage(request, env, '请输入搜索关键词');
    // 关键词里的 % _ 必须先转义，否则会被 LIKE 当成通配符（搜 % 就等于全站检索）
    const like = likePattern(keyword);
    return renderList(request, env, url, {
      where: `${PUBLISHED} AND (p.title LIKE ? ESCAPE '\\' OR p.content LIKE ? ESCAPE '\\')`,
      params: [like, like],
      baseUrl: `/search?s=${encodeURIComponent(keyword)}`,
      pageTitle: `搜索 ${keyword}`,
      headingTitle: `搜索：${keyword}`,
      // 搜索结果页不属于任何导航项，不点亮顶栏
      active: '',
      breadcrumb: `<a href="/">首页</a> &raquo; 搜索：${e(keyword)}`,
    });
  }

  // 友链页面
  if (path === '/links.html' || path === '/links') {
    const { session, options, categories, links, nav, hotComments, topics, profile } = await pageCtx(request, env);
    const listHtml = links.length
      ? linkItems(links, '\n      ')
      : '<div class="wb-empty">还没有添加友情链接。</div>';
    const post = {
      pid: 0,
      title: '友情链接',
      created: now(),
      views: 0,
      allow_comment: 0,
      category_name: '',
      // 正文由服务端按友链数据生成，标记为管理员内容以走可信 HTML 分支（否则会被转义展示）
      author_role: 'administrator',
      content: `<p>本站的左邻右舍（由后台「友链管理」维护）：</p>${listHtml}`,
    };
    return html(
      singlePage({
        options,
        session,
        pageTitle: '友情链接',
        post,
        comments: [],
        categories,
        hotComments,
        links,
        nav,
        topics,
        profile,
        breadcrumb: '<a href="/">首页</a> &raquo; 友情链接',
        active: 'links',
      })
    );
  }

  // 站点信息页（无内置入口，如需访问请在后台「导航管理」自行添加指向 /site 的链接）
  if (path === '/site' || path === '/site.html') {
    const { session, options, categories, links, nav, hotComments, topics, profile } = await pageCtx(request, env);
    return html(
      sitePage({
        options,
        session,
        pageTitle: '站点信息',
        categories,
        hotComments,
        links,
        nav,
        topics,
        profile,
      })
    );
  }

  // 点赞（登录用户）
  if (path === '/like' && method === 'POST') {
    const { blocked, session } = await toggleGate(request, env, {
      flag: 'likeOpen',
      loginTip: '请先登录后再点赞',
      closedTip: '点赞功能已关闭',
    });
    if (blocked) return blocked;
    const back = backTo(request, '/');
    const form = await readForm(request);
    const pid = intField(form, 'pid');
    // 只允许点赞「已发布且已到发布时间」的文章：否则可以对草稿 / 私密 / 定时未到的文章刷赞
    const target = pid
      ? await first(
          env,
          `SELECT pid FROM post WHERE pid = ? AND is_page = 0 AND status = 'publish' AND created <= ${NOW_SQL}`,
          [pid]
        )
      : null;
    if (target) await toggleLike(env, pid, session.userid);
    return redirect(back);
  }

  // 关注 / 取消关注（登录用户）
  if (path === '/follow' && method === 'POST') {
    const { blocked, session } = await toggleGate(request, env, {
      flag: 'followOpen',
      loginTip: '请先登录后再关注',
      closedTip: '关注功能已关闭',
    });
    if (blocked) return blocked;
    const back = backTo(request, '/');
    const form = await readForm(request);
    const targetId = intField(form, 'target_id');
    // 目标必须是真实存在的用户，避免给任意 uid 建立关注关系、污染粉丝数
    const exists = targetId ? await first(env, 'SELECT userid FROM user WHERE userid = ?', [targetId]) : null;
    if (exists) await toggleFollow(env, session.userid, targetId);
    return redirect(back);
  }

  // 转发确认页
  if (path === '/repost.html') {
    const session = await getSession(env, request);
    if (!session) return backErr('/login.html', '请先登录后再转发');
    const data = await pageCtx(request, env, session);
    if (!optionOn(data.options, 'repostOpen')) {
      return renderMessage(request, env, REPOST_CLOSED);
    }
    const pid = intParam(url, 'pid');
    // 与文章详情页共用同一套字段与关联，避免两处各写一遍 SELECT 导致字段漂移
    const post = await first(
      env,
      `SELECT ${POST_DETAIL_COLUMNS} ${POST_DETAIL_FROM}
       WHERE p.pid = ? AND p.is_page = 0 AND p.status = 'publish'
         AND p.created <= ${NOW_SQL}`,
      [pid]
    );
    if (!post) return notFoundPage(request, env, '文章不存在或未发布');
    return html(
      repostPage({
        options: data.options,
        session,
        pageTitle: '转发微博',
        post,
        source: post,
        error: errorOf(url),
        categories: data.categories,
        hotComments: data.hotComments,
        links: data.links,
        nav: data.nav,
        topics: data.topics,
        profile: data.profile,
      })
    );
  }

  // 提交转发
  if (path === '/repost' && method === 'POST') {
    const { blocked, session, options } = await toggleGate(request, env, {
      flag: 'repostOpen',
      loginTip: '请先登录后再转发',
      closed: (req, e) => renderMessage(req, e, REPOST_CLOSED),
    });
    if (blocked) return blocked;
    const form = await readForm(request);
    const pid = intField(form, 'pid');
    const content = field(form, 'content').trim() || '转发微博';
    // 与首页发布框同一口径的长度上限：前台传参不可信，服务端必须再校验一次
    const badContent = validateWeibo(content);
    if (badContent) return backErr(pid ? `/archives/${pid}` : '/', badContent);
    const source = await first(
      env,
      `SELECT * FROM post WHERE pid = ? AND is_page = 0 AND status = 'publish' AND created <= ${NOW_SQL}`,
      [pid]
    );
    if (!source) return notFoundPage(request, env, '文章不存在或未发布');
    // 源标题最长 100，加上「转发：」前缀会超出标题上限，导致该文在后台无法保存，这里按同一上限截断
    const title = `转发：${source.title}`.slice(0, TITLE_MAX_LENGTH);
    // 转发同样要走投稿审核：否则开启审核后仍可用转发绕过审核直接发布
    const status = (await reviewRequired(env, options, session, 'frontPublishReview')) ? 'pending' : 'publish';
    const res = await insertPost(env, {
      title,
      content,
      slugBase: slugify(title, 'repost'),
      categoryId: source.category_id,
      authorId: session.userid,
      repostPid: pid,
      status,
    });
    // 同步源文章标签，便于话题聚合
    await saveTags(env, res.meta.last_row_id, await tagNamesOf(env, pid));
    return backMsg(frontUrl(source), status === 'pending' ? '转发已提交，等待管理员审核' : '转发成功');
  }

  // 独立页面：/page/{slug}
  const pageMatch = /^\/page\/([^/]+?)(?:\.html)?$/.exec(path);
  if (pageMatch) {
    const found = await visiblePost(env, request, { isPage: true, key: decodeSlug(pageMatch[1]) });
    if (!found) return notFoundPage(request, env, '页面不存在');
    return renderSingle(request, env, found.post, `<a href="/">首页</a> &raquo; ${e(found.post.title)}`, {
      session: found.session,
      notice: found.preview,
      groups: found.groups,
    });
  }

  // 文章详情
  const postMatch = /^\/archives\/([^/]+?)(?:\.html)?$/.exec(path);
  if (postMatch) {
    const found = await visiblePost(env, request, { isPage: false, key: decodeSlug(postMatch[1]) });
    if (!found) return notFoundPage(request, env, '文章不存在或未发布');
    const post = found.post;
    const viewCookie = found.published ? await countView(request, env, post) : '';
    const breadcrumb = post.category_name
      ? `<a href="/">首页</a> &raquo; <a href="${e(slugHref('/category', post.category_slug))}">${e(post.category_name)}</a> &raquo; ${e(post.title)}`
      : `<a href="/">首页</a> &raquo; ${e(post.title)}`;
    return renderSingle(request, env, post, breadcrumb, {
      session: found.session,
      notice: found.preview,
      headers: viewCookie ? { 'set-cookie': viewCookie } : {},
      groups: found.groups,
    });
  }

  // 评论提交
  if (path === '/comment' && method === 'POST') {
    return submitComment(request, env);
  }

  // 前台登录 / 注册 / 退出
  if (path === '/login.html') return authPageFor(request, env, url, 'login');
  if (path === '/register.html') return authPageFor(request, env, url, 'register');
  if (path === '/login' && method === 'POST') {
    const form = await readForm(request);
    const result = await attemptLogin(env, request, {
      username: field(form, 'userName').trim(),
      password: field(form, 'password'),
    });
    if (!result.ok) {
      const message = result.throttled
        ? LOGIN_THROTTLE_MESSAGE
        : result.pending
          ? '账号正在审核中，通过后方可登录'
          : '用户名或密码错误';
      return backErr('/login.html', message);
    }
    return redirect('/', { 'set-cookie': await createSession(env, result.user) });
  }
  if (path === '/register' && method === 'POST') {
    const options = await getOptions(env);
    if (!optionOn(options, 'registerOpen')) {
      return renderMessage(request, env, {
        pageTitle: '注册已关闭',
        message: '本站暂未开放注册。',
      });
    }
    const form = await readForm(request);
    const username = field(form, 'userName').trim();
    const password = field(form, 'password');
    const screenname = field(form, 'screenname').trim() || username;
    const mail = field(form, 'mail').trim();
    if (!username || !password) {
      return backErr('/register.html', '用户名和密码不能为空');
    }
    if (password.length < PASSWORD_MIN_LENGTH) {
      return backErr('/register.html', `密码至少 ${PASSWORD_MIN_LENGTH} 位`);
    }
    // 昵称与邮箱复用「我的资料」/「后台用户表单」的同一套校验口径（昵称已回落到用户名，不会为空）
    const badScreenname = validateScreenname(screenname);
    if (badScreenname) return backErr('/register.html', badScreenname);
    const badMail = validateMail(mail);
    if (badMail) return backErr('/register.html', badMail);
    const exists = await first(env, 'SELECT userid FROM user WHERE username = ?', [username]);
    if (exists) {
      return backErr('/register.html', '该用户名已被注册');
    }
    // 昵称与用户名同为前台标识，同样要求唯一（库层由 idx_user_screenname 兜底）
    if (await screennameTaken(env, screenname)) {
      return backErr('/register.html', '该昵称已被使用');
    }
    // 注册审核：开启时新账号先落为待审核，通过前不能登录（也不下发会话）
    const needReview = optionRequired(options, 'registerReview');
    let res;
    try {
      res = await run(
        env,
        'INSERT INTO user (username, screenname, md5password, mail, url, headpic, role, status, created) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [username, screenname, await hashPassword(password), mail, '', '', 'visitor', needReview ? 'pending' : 'active', now()]
      );
    } catch (err) {
      // 上面的查重与这里的写入之间存在并发窗口：同名请求可能同时通过查重。
      // 由 user 的唯一约束兜底，命中时按“已存在”提示，而不是抛成 500。
      // 冲突列可能是 username 也可能是 screenname，误报会让人改错字段，故分开提示
      const message = String(err && err.message);
      if (/UNIQUE/i.test(message)) {
        return backErr('/register.html', /screenname/i.test(message) ? '该昵称已被使用' : '该用户名已被注册');
      }
      throw err;
    }
    if (needReview) return backMsg('/login.html', '注册成功，需管理员审核通过后方可登录');
    const user = await first(env, 'SELECT * FROM user WHERE userid = ?', [res.meta.last_row_id]);
    const cookie = await createSession(env, user);
    return redirect('/', { 'set-cookie': cookie });
  }
  // 退出必须是同源页面上的主动跳转：否则第三方页面用 <img src="/logout"> 就能把访客强制登出
  if (path === '/logout') {
    if (method !== 'GET' || !sameOrigin(request, url)) return forbidden();
    return redirect('/', { 'set-cookie': clearSession() });
  }

  // 前台个人设置（仅能修改本人资料）
  if (path === '/settings') {
    return settingsRouter(request, env, url);
  }

  // 发布微博式短内容（首页发布框）
  if (path === '/publish' && method === 'POST') {
    return publishPost(request, env, url);
  }

  // 前台投稿（登录用户）
  if (path === '/write' || path.startsWith('/write/')) {
    return writeRouter(request, env, url);
  }

  // 前台审核中心（按用户组权限开放，见后台「组别管理 → 权限设置」）
  if (path === '/review' || path.startsWith('/review/')) {
    return reviewRouter(request, env, url);
  }

  return notFoundPage(request, env, '页面不存在');
}

/* ---------------- 首页发布框：发布短微博 ---------------- */

async function publishPost(request, env, url) {
  const session = await getSession(env, request);
  if (!session) return backErr('/login.html', '请先登录后再发布');
  const options = await getOptions(env);
  const fail = (message) =>
    renderList(request, env, new URL('/', url.origin), {
      where: PUBLISHED,
      baseUrl: '/',
      pageTitle: '首页',
      notice: message,
      noticeType: 'err',
    });
  if (!optionOn(options, 'frontPublish')) return fail('本站暂未开放前台发布。');

  const form = await readForm(request);
  const content = field(form, 'content').trim();
  // 只有话题 #...# 与空白时视为空内容
  if (!hasContent(content)) return fail('请输入要发布的内容');
  // 与首页发布框的 maxlength 同一口径（前端限制可被绕过，服务端必须再校验一次）
  const badContent = validateWeibo(content);
  if (badContent) return fail(badContent);

  const visibility =
    optionOn(options, 'frontPublishScope') && normalizeVisibility(field(form, 'visibility')) === 'private'
      ? 'private'
      : 'public';
  const scheduled = optionOn(options, 'frontPublishTimer') ? normalizeSchedule(field(form, 'scheduled_at')) : '';
  const statement = normalizeStatement(field(form, 'statement'), optionOn(options, 'frontPublishStatement'));
  // 私密无需审核；其余按后台「投稿需审核」开关决定是否待审，免审核用户组（如特邀用户）直接发布
  const needReview = await reviewRequired(env, options, session, 'frontPublishReview');
  const status = visibility === 'private' ? 'private' : needReview ? 'pending' : 'publish';
  const title = stripTags(content).slice(0, WEIBO_TITLE_MAX_LENGTH) || '微博';
  // 纯时间戳在同一毫秒内可能重复，insertPost 内部走 uniqueSlug 保证别名不撞车
  const res = await insertPost(env, {
    title,
    content,
    slugBase: 'weibo-' + Date.now().toString(36),
    authorId: session.userid,
    created: scheduled || now(),
    status,
    statement,
  });
  // 正文中的 #话题# 同步落库为标签，便于话题聚合
  const topicNames = topicNamesIn(content);
  if (topicNames.length) await saveTags(env, res.meta.last_row_id, topicNames);

  const message =
    status === 'private'
      ? '已发布，私密可见'
      : status === 'pending'
        ? '已提交，等待管理员审核'
        : scheduled
          ? `已加入定时发布：${scheduled}`
          : '发布成功';
  return backMsg('/', message);
}

/* ---------------- 前台投稿 ---------------- */

async function writeRouter(request, env, url) {
  const path = url.pathname;
  const method = request.method;
  const session = await getSession(env, request);
  // 未登录直接回登录页：投稿页全部需要登录态，没必要先跑 pageCtx 的一堆查询
  if (!session) return backErr('/login.html', '请先登录后再投稿');
  const { options, categories, links, nav, hotComments, topics, profile } = await pageCtx(request, env, session);

  // 我的文章
  // 注意：该分支必须在「前台投稿开关」判定之前——开关关闭只应禁止新投稿，
  // 不能连自己已发文章的列表都看不到。
  if (path === '/write/mine' && method === 'GET') {
    const posts = await all(
      env,
      `SELECT p.pid, p.title, p.status, p.is_top, p.created, p.views, c.name AS category_name,
              ${POST_COUNT_COLUMNS}
       FROM post p LEFT JOIN category c ON c.cid = p.category_id
       WHERE p.author_id = ? AND p.is_page = 0
       ORDER BY p.pid DESC`,
      [session.userid]
    );
    return html(
      myPostsPage({
        options,
        session,
        pageTitle: '我的文章',
        posts,
        categories,
        hotComments,
        links,
        nav,
        topics,
        profile,
        notice: noticeOf(url),
      })
    );
  }

  // 与首页发布框 /publish 保持同一口径：开关关闭时「新投稿」对所有人生效（含管理员），
  // 但 /write/edit、/write/delete 属于「管理自己已发文章」的入口，不受该开关影响；
  // /write/save 的新建与编辑要按表单里的 pid 区分，放到该分支内部再判定。
  const publishOpen = optionOn(options, 'frontPublish');
  const editingOwn = path === '/write/edit' && intParam(url, 'id') > 0;
  if (!publishOpen && !editingOwn && path !== '/write/save' && path !== '/write/delete') {
    return renderMessage(request, env, { pageTitle: '投稿未开放', message: '本站暂未开放前台投稿。' });
  }

  // 写文章 / 编辑
  if ((path === '/write' || path === '/write/edit') && method === 'GET') {
    const id = intParam(url, 'id');
    let post = null;
    let tags = [];
    if (id) {
      post = await first(env, 'SELECT * FROM post WHERE pid = ? AND author_id = ? AND is_page = 0', [
        id,
        session.userid,
      ]);
      if (!post) {
        return renderMessage(request, env, {
          pageTitle: '无法编辑',
          message: '文章不存在或不属于你。',
          status: 404,
        });
      }
      tags = await tagNamesOf(env, id);
    }
    return html(
      writePage({
        options,
        session,
        pageTitle: id ? '编辑文章' : '写文章',
        mode: id ? 'edit' : 'create',
        post,
        categories,
        tags,
        error: errorOf(url),
        // 提示文案与保存时的判定口径保持一致（管理员与免审核用户组不走审核）
        review: await reviewRequired(env, options, session, 'frontPublishReview'),
        hotComments,
        links,
        nav,
        topics,
        profile,
      })
    );
  }

  // 保存投稿
  if (path === '/write/save' && method === 'POST') {
    const form = await readForm(request);
    let pid = intField(form, 'pid');
    const title = field(form, 'title').trim();
    const content = field(form, 'content');
    // 分类必须是真实存在的，否则会产出查不到归属的悬空归档（post 表无外键约束，数据库不会拦）
    const categoryId = await validCategoryId(env, intField(form, 'category_id'));
    const statement = normalizeStatement(field(form, 'statement'), optionOn(options, 'frontPublishStatement'));
    const tagNames = parseTagNames(field(form, 'tags'));
    const back = pid ? `/write/edit?id=${pid}` : '/write';
    const fail = (message) => backErr(back, message);

    // 前台投稿开关只约束「新建」；带 pid 的保存是编辑自己已发的文章，开关关闭时仍要放行
    if (!pid && !publishOpen) return fail('本站暂未开放前台投稿。');

    const bad = validateTitleContent(title, content);
    if (bad) return fail(bad);

    // 免审核用户组（如特邀用户）的前台投稿直接发布
    const needReview = await reviewRequired(env, options, session, 'frontPublishReview');
    // 仅当后台开启「前台可见范围」时，写文章页才渲染可见范围选择；
    // 白名单归一化，避免伪造 visibility=x 让私密文章在编辑后被静默转公开
    const visibility = optionOn(options, 'frontPublishScope') ? normalizeVisibility(field(form, 'visibility')) : '';
    let isEdit = false;
    let status;

    if (pid) {
      const own = await first(env, 'SELECT pid, slug, status FROM post WHERE pid = ? AND author_id = ? AND is_page = 0', [
        pid,
        session.userid,
      ]);
      if (!own) return fail('文章不存在或不属于你');
      // slug 建有唯一索引，而详情页按「pid 或 slug」匹配，重名会让链接指错文章，
      // 故写入前排除自己当前别名后再去重（短微博别名由 slugForEdit 原样保留）
      const slug = await slugForEdit(env, own.slug, title, pid);
      // 显式选择优先；未提供时保留原文的私密属性，避免编辑后误公开
      const isPrivate = visibility ? visibility === 'private' : own.status === 'private';
      // 被后台驳回的草稿：开启审核时重新进入待审核；未开启审核时保持草稿状态，
      // 不能因为作者保存一次编辑就静默重新发布。
      status = isPrivate ? 'private' : needReview ? 'pending' : own.status === 'draft' ? 'draft' : 'publish';
      await run(
        env,
        'UPDATE post SET title=?, slug=?, content=?, category_id=?, status=?, statement=?, modified=? WHERE pid=?',
        [title, slug, content, categoryId, status, statement, now(), pid]
      );
      isEdit = true;
    } else {
      status = visibility === 'private' ? 'private' : needReview ? 'pending' : 'publish';
      const res = await insertPost(env, {
        title,
        content,
        slugBase: slugify(title, 'post'),
        categoryId,
        authorId: session.userid,
        status,
        statement,
      });
      pid = res.meta.last_row_id;
    }

    await saveTags(env, pid, tagNames);
    const message =
      status === 'private'
        ? '已保存为私密'
        : needReview
          ? '投稿已提交，等待管理员审核'
          : isEdit
            ? '文章已更新'
            : '文章已发布';
    return backMsg('/write/mine', message);
  }

  // 删除自己的文章
  if (path === '/write/delete' && method === 'POST') {
    const form = await readForm(request);
    const pid = intField(form, 'pid');
    if (pid) {
      const own = await first(env, 'SELECT pid FROM post WHERE pid = ? AND author_id = ? AND is_page = 0', [
        pid,
        session.userid,
      ]);
      if (own) await deletePostCascade(env, pid, { isPage: false });
    }
    return backMsg('/write/mine', '已删除');
  }

  return notFoundPage(request, env, '没有找到该投稿页面。');
}

/* ---------------- 前台审核中心 ---------------- */

/** 审核中心两个待审列表的每页条数 */
const REVIEW_PAGE_SIZE = 20;

/**
 * 前台审核中心：集中处理待审核的前台投稿（post.status = 'pending'）与评论（comment.status = 'pending'）。
 * 入口与能力由用户组权限控制（后台「组别管理 → 权限设置」）：
 * can_review = 可进入并审核；can_edit = 可在通过前修改待审内容。管理员始终具备两项权限。
 */
async function reviewRouter(request, env, url) {
  const path = url.pathname;
  const method = request.method;
  const session = await getSession(env, request);
  if (!session) return backErr('/login.html', '请先登录后再审核');
  const { options, categories, links, nav, hotComments, topics, profile, groups } = await pageCtx(request, env, session);
  const { canReview, canEdit } = groupReviewPerms(groups, session);
  if (!canReview) {
    return renderMessage(request, env, { pageTitle: '无权访问', message: '你没有审核权限。', status: 403 });
  }
  const back = (key, message) => withNotice('/review', key, message);

  // 待审投稿：通过 / 编辑后通过（需 can_edit）/ 驳回（退回作者草稿）/ 删除
  if (path === '/review/post' && method === 'POST') {
    const form = await readForm(request);
    const pid = intField(form, 'pid');
    const action = field(form, 'action');
    const post = pid
      ? await first(env, "SELECT pid, slug FROM post WHERE pid = ? AND is_page = 0 AND status = 'pending'", [pid])
      : null;
    if (!post) return back('err', '该投稿不在待审核状态');

    if (action === 'delete') {
      await deletePostCascade(env, pid, { isPage: false });
      return back('msg', '已删除该投稿');
    }
    if (action === 'reject') {
      // 带上 status 条件：否则并发的另一次审核（如已通过）会被这次驳回改回草稿
      await run(env, "UPDATE post SET status = 'draft', modified = ? WHERE pid = ? AND status = 'pending'", [now(), pid]);
      return back('msg', '已驳回，退回作者草稿');
    }
    if (action === 'save' && canEdit) {
      const title = field(form, 'title').trim();
      const content = field(form, 'content');
      // 与前台投稿、后台编辑同一口径（含正文长度上限）
      const bad = validateTitleContent(title, content);
      if (bad) return back('err', bad);
      // 与前台投稿保存同一口径：短微博别名保持 weibo- 前缀，其余按新标题重新生成
      const slug = await slugForEdit(env, post.slug, title, pid);
      await run(env, "UPDATE post SET title = ?, slug = ?, content = ?, status = ?, modified = ? WHERE pid = ? AND status = 'pending'", [
        title,
        slug,
        content,
        'publish',
        now(),
        pid,
      ]);
      return back('msg', '已修改并通过，文章已发布');
    }
    if (action === 'approve') {
      await run(env, "UPDATE post SET status = 'publish', modified = ? WHERE pid = ? AND status = 'pending'", [now(), pid]);
      return back('msg', '投稿已通过并发布');
    }
    // 表单允许提交「编辑后通过」但当前用户组无 can_edit：给出明确原因，不要落回「未知操作」
    if (action === 'save') return back('err', '你没有修改待审内容的权限');
    return back('err', '未知操作');
  }

  // 待审评论：通过 / 编辑后通过（需 can_edit）/ 删除
  if (path === '/review/comment' && method === 'POST') {
    const form = await readForm(request);
    const coid = intField(form, 'coid');
    const action = field(form, 'action');
    const comment = coid
      ? await first(env, "SELECT coid FROM comment WHERE coid = ? AND status = 'pending'", [coid])
      : null;
    if (!comment) return back('err', '该评论不在待审核状态');

    if (action === 'delete') {
      await run(env, 'DELETE FROM comment WHERE coid = ?', [coid]);
      return back('msg', '已删除该评论');
    }
    if (action === 'save' && canEdit) {
      const content = field(form, 'content').trim();
      // 与前台提交评论共用同一套校验口径
      const badComment = validateComment(content);
      if (badComment) return back('err', badComment);
      await run(env, "UPDATE comment SET content = ?, status = 'approved' WHERE coid = ? AND status = 'pending'", [content, coid]);
      return back('msg', '已修改并通过');
    }
    if (action === 'approve') {
      await run(env, "UPDATE comment SET status = 'approved' WHERE coid = ? AND status = 'pending'", [coid]);
      return back('msg', '评论已通过');
    }
    if (action === 'save') return back('err', '你没有修改待审内容的权限');
    return back('err', '未知操作');
  }

  if (path === '/review' && method === 'GET') {
    // 两个列表各自分页（pp / cp）：原先固定 LIMIT 100，超过 100 条的待审内容永远翻不到
    const per = REVIEW_PAGE_SIZE;
    const [postRow, commentRow] = await Promise.all([
      first(env, "SELECT COUNT(*) AS n FROM post WHERE status = 'pending' AND is_page = 0"),
      first(env, "SELECT COUNT(*) AS n FROM comment WHERE status = 'pending'"),
    ]);
    const postTotal = Number(postRow?.n || 0);
    const commentTotal = Number(commentRow?.n || 0);
    const postPages = totalPagesOf(postTotal, per);
    const commentPages = totalPagesOf(commentTotal, per);
    // 页码越界时回退到最后一页，避免删完当前页后停在空白页
    const pp = Math.min(Math.max(1, intParam(url, 'pp', 1)), postPages);
    const cp = Math.min(Math.max(1, intParam(url, 'cp', 1)), commentPages);
    const [posts, comments] = await Promise.all([
      all(
        env,
        `SELECT p.pid, p.title, p.content, p.created, u.screenname, u.username
         FROM post p LEFT JOIN user u ON u.userid = p.author_id
         WHERE p.status = 'pending' AND p.is_page = 0
         ORDER BY p.pid DESC LIMIT ? OFFSET ?`,
        [per, (pp - 1) * per]
      ),
      all(
        env,
        `SELECT cm.coid, cm.pid, cm.author, cm.content, cm.created, p.title AS post_title, p.is_page, p.slug
         FROM comment cm LEFT JOIN post p ON p.pid = cm.pid
         WHERE cm.status = 'pending'
         ORDER BY cm.coid DESC LIMIT ? OFFSET ?`,
        [per, (cp - 1) * per]
      ),
    ]);
    return html(
      reviewPage({
        options,
        session,
        pageTitle: '审核中心',
        posts,
        comments,
        postPage: pp,
        postPages,
        postTotal,
        commentPage: cp,
        commentPages,
        commentTotal,
        canEdit,
        categories,
        hotComments,
        links,
        nav,
        topics,
        profile,
        notice: noticeOf(url),
        error: errorOf(url),
      })
    );
  }

  return notFoundPage(request, env, '没有找到该审核页面。');
}

/* ---------------- 前台个人设置 ---------------- */

/**
 * 个人设置：登录用户只能读写自己那一行（userid 取自会话，不接受表单传入），
 * 用户名与角色不可修改（属管理员权限），改密需校验当前密码。
 */
async function settingsRouter(request, env, url) {
  const session = await getSession(env, request);
  if (!session) return backErr('/login.html', '请先登录后再修改资料');

  const back = (key, message) => withNotice('/settings', key, message);
  const me = await first(env, 'SELECT * FROM user WHERE userid = ?', [session.userid]);
  if (!me) return redirect('/logout');

  if (request.method === 'POST') {
    const form = await readForm(request);
    const screenname = field(form, 'screenname').trim();
    const mail = field(form, 'mail').trim();
    const homepage = field(form, 'url').trim();
    const headpic = field(form, 'headpic').trim();
    const oldPassword = field(form, 'oldpassword');
    const password = field(form, 'password');
    const confirm = field(form, 'password2');

    const error = await saveProfile(env, me, {
      screenname,
      mail,
      url: homepage,
      headpic,
      oldPassword,
      password,
      confirm,
    });
    if (error) return back('err', error);
    return back('msg', '个人资料已保存');
  }

  const { options, categories, links, nav, hotComments, topics, profile } = await pageCtx(request, env, session);
  return html(
    settingsPage({
      options,
      session: { ...session, screenname: me.screenname, mail: me.mail, url: me.url, headpic: me.headpic },
      pageTitle: '个人设置',
      error: errorOf(url),
      notice: noticeOf(url),
      categories,
      hotComments,
      links,
      nav,
      topics,
      profile,
    })
  );
}

/**
 * 浏览量 +1（同一访客对同一文章仅计一次，通过 Cookie 去重）。
 * Cookie 有 4KB 上限，去重表只能保留最近若干篇；取 200 条（约 2KB）覆盖正常浏览深度，
 * 超出后最早看过的那篇会被挤出、重新计入——这是长度受限带来的折中，不是逻辑缺口。
 */
const VIEWED_COOKIE_MAX = 200;

async function countView(request, env, post) {
  const list = readCookie(request, 'contents_viewed').split(',').filter(Boolean);
  if (list.includes(String(post.pid))) return '';
  await run(env, 'UPDATE post SET views = views + 1 WHERE pid = ?', [post.pid]);
  post.views = (post.views || 0) + 1;
  const next = [...list, String(post.pid)].slice(-VIEWED_COOKIE_MAX).join(',');
  // 该 Cookie 只有服务端读取，加 HttpOnly 防止被脚本读取；Secure 保证不在明文连接上传输
  return `contents_viewed=${next}; Path=/; Max-Age=2592000; SameSite=Lax; HttpOnly; Secure`;
}

/** 详情页评论提交后的提示文案（与 submitComment 回跳的 msg 一一对应） */
const COMMENT_NOTICES = {
  pending: '评论已提交，等待管理员审核后显示。',
  ok: '评论已发布。',
};

async function renderSingle(request, env, post, breadcrumb, extra = {}) {
  const { session, options, categories, links, nav, hotComments, topics, profile, levels, groups } = await pageCtx(
    request,
    env,
    extra.session,
    extra.groups || null
  );
  attachAuthorBadges([post], levels, groups);
  const comments = await all(
    env,
    "SELECT * FROM comment WHERE pid = ? AND status = 'approved' ORDER BY coid ASC",
    [post.pid]
  );
  // 标签 / 点赞状态 / 转发源 / 点赞数与转发数
  await decoratePosts(env, [post], session);
  const url = new URL(request.url);
  const err = errorOf(url);
  const msg = noticeOf(url);
  // 用 hasOwn 判定，避免 ?msg=constructor 之类命中原型链上的属性
  const notice = err || (Object.hasOwn(COMMENT_NOTICES, msg) ? COMMENT_NOTICES[msg] : '');
  const page = singlePage({
    options,
    session,
    pageTitle: post.title,
    post,
    comments,
    categories,
    hotComments,
    links,
    nav,
    topics,
    profile,
    breadcrumb,
    // 独立页面不属于「文章」导航项，不点亮顶栏
    active: Number(post.is_page) === 1 ? '' : 'archives',
    notice: notice || extra.notice || '',
    noticeType: err ? 'err' : 'ok',
  });
  return html(page, 200, extra.headers || {});
}

async function submitComment(request, env) {
  const form = await readForm(request);
  const pid = intField(form, 'pid');
  const content = field(form, 'text').trim();
  const post = await first(env, 'SELECT pid, slug, is_page, allow_comment, status, created FROM post WHERE pid = ?', [pid]);
  // 独立页面回 /page/{slug}，文章回 /archives/{pid}；拿不到文章时只能回首页
  const back = post ? frontUrl(post) : '/';
  if (!post || post.status !== 'publish' || !isDue(post.created) || !post.allow_comment) {
    return backErr(back, '无法对该内容发表评论');
  }
  // 与前台 textarea 的 maxlength 同一口径：前端限制可被绕过，服务端必须再校验一次
  const badComment = validateComment(content);
  if (badComment) return backErr(back, badComment);

  const session = await getSession(env, request);
  const options = await getOptions(env);
  const author = session ? session.screenname || session.username : field(form, 'author').trim() || '匿名';
  const mail = session ? session.mail : field(form, 'mail').trim();
  const website = session ? session.url : field(form, 'url').trim();
  // 后台开启「评论需审核」时仅未登录访客与普通组走待审，免审核用户组（如特邀用户）直接通过
  const status = (await reviewRequired(env, options, session, 'commentReview')) ? 'pending' : 'approved';

  await run(
    env,
    'INSERT INTO comment (pid, userid, author, mail, url, content, created, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [pid, session ? session.userid : 0, author, mail, website, content, now(), status]
  );
  return backMsg(back, status === 'pending' ? 'pending' : 'ok');
}

async function notFoundPage(request, env, message) {
  return renderMessage(request, env, { pageTitle: '页面不存在', message, status: 404 });
}

/* ---------------- 入口 ---------------- */

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    // CSRF 纵深防御：所有写请求必须来自同源页面（Cookie 已设 SameSite=Lax，此处再补一层）
    if (request.method !== 'GET' && request.method !== 'HEAD' && !sameOrigin(request, url)) {
      return forbidden();
    }

    try {
      // 静态资源兜底（正常情况下由 assets 直出，不会走到这里）；放进 try 才能记录 ASSETS 异常
      if (/^\/(style|images)\//.test(path) || path === '/favicon.ico') {
        return await env.ASSETS.fetch(request);
      }

      // 后台也放进 try：否则后台异常不会写日志，线上只能看到 Cloudflare 的通用错误页
      if (path === '/admin' || path.startsWith('/admin/')) {
        return await adminRouter(request, env, url);
      }
      return await frontRouter(request, env, url);
    } catch (err) {
      // 不把异常细节回显给访客（可能泄露 SQL / 表名 / 路径等信息），只写日志。
      console.error('请求处理失败：', err && err.stack ? err.stack : err);
      return html('<meta charset="utf-8"><h1>服务器错误</h1><p>服务器内部错误，请稍后再试。</p>', 500);
    }
  },
};
