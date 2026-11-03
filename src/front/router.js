/**
 * 前台路由分发
 */
import {
  html,
  redirect,
  forbidden,
  field,
  intField,
  intParam,
  backMsg,
  backErr,
  readForm,
  now,
  first,
  run,
  getOptions,
  createSession,
  clearSession,
  getSession,
  slugify,
  insertPost,
  frontUrl,
  reviewRequired,
  saveTags,
  escapeHtml as e,
  tagNamesOf,
  TITLE_MAX_LENGTH,
  toggleLike,
  toggleFollow,
  sameOrigin,
  optionOn,
  optionRequired,
  hashPassword,
  attemptLogin,
  LOGIN_THROTTLE_MESSAGE,
  decodeSlug,
  slugHref,
  likePattern,
  errorOf,
  validateWeibo,
  validateScreenname,
  validateMail,
  screennameTaken,
  NOW_SQL,
  PASSWORD_MIN_LENGTH,
} from '../lib.js';
import { linkItems, singlePage, sitePage, repostPage } from '../theme.js';
import {
  PUBLISHED,
  renderList,
  pageCtx,
  notFoundPage,
  POST_DETAIL_COLUMNS,
  POST_DETAIL_FROM,
  visiblePost,
  renderSingle,
  countView,
  authPageFor,
  toggleGate,
  backTo,
  renderMessage,
  REPOST_CLOSED,
} from './context.js';
import { publishPost } from './publish.js';
import { writeRouter } from './write.js';
import { reviewRouter } from './review.js';
import { settingsRouter } from './settings.js';
import { submitComment } from './comment.js';

export async function frontRouter(request, env, url, ctx = null) {
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
    const viewCookie = found.published ? await countView(request, env, post, ctx) : '';
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
