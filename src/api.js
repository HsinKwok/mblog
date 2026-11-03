/**
 * 前台 AJAX 接口：信息流翻页、点赞 / 关注、评论提交。
 * 所有接口返回 JSON；表单类请求仍走原路由，脚本不可用时不影响正常使用。
 */
import {
  json,
  readForm,
  intField,
  field,
  getSession,
  getOptions,
  getLevels,
  getGroups,
  optionOn,
  first,
  run,
  now,
  isDue,
  validateComment,
  reviewRequired,
  toggleLike,
  toggleFollow,
  pager,
  likePattern,
  slugHref,
  NOW_SQL,
} from './lib.js';
import { postCards, commentItem } from './theme.js';
import { fetchPosts, PUBLISHED } from './front/context.js';

/* ---------------- 信息流翻页 ---------------- */

async function feedApi(request, env, url) {
  const kind = url.searchParams.get('kind') || 'home';
  let where = PUBLISHED;
  let params = [];
  let baseUrl = '/';

  if (kind === 'category') {
    const slug = url.searchParams.get('slug') || '';
    const category = slug ? await first(env, 'SELECT * FROM category WHERE slug = ?', [slug]) : null;
    if (!category) return json({ ok: false, message: '分类不存在' }, 404);
    where = `${PUBLISHED} AND p.category_id = ?`;
    params = [category.cid];
    // 别名可能含中文等非 ASCII 字符，翻页地址同样要编码后再拼
    baseUrl = slugHref('/category', slug);
  } else if (kind === 'tag') {
    const slug = url.searchParams.get('slug') || '';
    const tag = slug ? await first(env, 'SELECT * FROM tag WHERE slug = ?', [slug]) : null;
    if (!tag) return json({ ok: false, message: '标签不存在' }, 404);
    where = `${PUBLISHED} AND p.pid IN (SELECT pid FROM post_tag WHERE tid = ?)`;
    params = [tag.tid];
    baseUrl = slugHref('/tag', slug);
  } else if (kind === 'search') {
    const keyword = (url.searchParams.get('q') || '').trim();
    if (!keyword) return json({ ok: false, message: '请输入搜索关键词' }, 400);
    const like = likePattern(keyword);
    where = `${PUBLISHED} AND (p.title LIKE ? ESCAPE '\\' OR p.content LIKE ? ESCAPE '\\')`;
    params = [like, like];
    baseUrl = `/search?s=${encodeURIComponent(keyword)}`;
  } else if (kind !== 'home') {
    return json({ ok: false, message: '不支持的列表类型' }, 400);
  }

  const session = await getSession(env, request);
  const [options, levels, groups] = await Promise.all([
    getOptions(env),
    getLevels(env),
    getGroups(env),
  ]);
  const data = await fetchPosts(env, url, {
    where,
    params,
    size: parseInt(options.pageSize, 10) || 10,
    session,
    levels,
    groups,
  });
  return json({
    ok: true,
    html: postCards(data.rows, options, session),
    pager: pager({ base: baseUrl, page: data.page, totalPages: data.totalPages }),
    page: data.page,
    totalPages: data.totalPages,
    total: data.total,
  });
}

/* ---------------- 点赞 / 关注 ---------------- */

async function likeApi(request, env) {
  const session = await getSession(env, request);
  if (!session) return json({ ok: false, login: true, message: '请先登录后再点赞' }, 401);
  const options = await getOptions(env);
  if (!optionOn(options, 'likeOpen')) return json({ ok: false, message: '点赞功能已关闭' }, 403);
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
  if (!target) return json({ ok: false, message: '无法点赞该内容' }, 404);
  const result = await toggleLike(env, pid, session.userid);
  return json({ ok: true, ...result });
}

async function followApi(request, env) {
  const session = await getSession(env, request);
  if (!session) return json({ ok: false, login: true, message: '请先登录后再关注' }, 401);
  const options = await getOptions(env);
  if (!optionOn(options, 'followOpen')) return json({ ok: false, message: '关注功能已关闭' }, 403);
  const form = await readForm(request);
  const targetId = intField(form, 'target_id');
  // 目标必须是真实存在的用户，避免给任意 uid 建立关注关系、污染粉丝数
  const exists = targetId ? await first(env, 'SELECT userid FROM user WHERE userid = ?', [targetId]) : null;
  if (!exists) return json({ ok: false, message: '无法关注该用户' }, 404);
  const result = await toggleFollow(env, session.userid, targetId);
  return json({ ok: true, ...result });
}

/* ---------------- 评论 ---------------- */

async function commentApi(request, env) {
  const form = await readForm(request);
  const pid = intField(form, 'pid');
  const content = field(form, 'text').trim();
  const post = await first(env, 'SELECT pid, slug, is_page, allow_comment, status, created FROM post WHERE pid = ?', [
    pid,
  ]);
  if (!post || post.status !== 'publish' || !isDue(post.created) || !post.allow_comment) {
    return json({ ok: false, message: '无法对该内容发表评论' }, 400);
  }
  // 与前台 textarea 的 maxlength 同一口径：前端限制可被绕过，服务端必须再校验一次
  const badComment = validateComment(content);
  if (badComment) return json({ ok: false, message: badComment }, 400);

  const session = await getSession(env, request);
  const options = await getOptions(env);
  const author = session ? session.screenname || session.username : field(form, 'author').trim() || '匿名';
  const mail = session ? session.mail : field(form, 'mail').trim();
  const website = session ? session.url : field(form, 'url').trim();
  // 后台开启「评论需审核」时仅未登录访客与普通组走待审，免审核用户组（如特邀用户）直接通过
  const status = (await reviewRequired(env, options, session, 'commentReview')) ? 'pending' : 'approved';
  const created = now();

  await run(
    env,
    'INSERT INTO comment (pid, userid, author, mail, url, content, created, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [pid, session ? session.userid : 0, author, mail, website, content, created, status]
  );
  if (status === 'pending') {
    return json({ ok: true, status, message: '评论已提交，等待管理员审核后显示。', html: '' });
  }
  // 序号由前端带入，仅用于展示 #n，取不到时从 1 开始，不影响数据
  const index = Math.max(0, intField(form, 'count', 0));
  return json({
    ok: true,
    status,
    message: '评论已发布。',
    html: commentItem({ author, mail, url: website, content, created }, index),
  });
}

/* ---------------- 分发 ---------------- */

export async function apiRouter(request, env, url) {
  const path = url.pathname;
  const method = request.method;
  if (path === '/api/feed' && method === 'GET') return feedApi(request, env, url);
  if (path === '/api/like' && method === 'POST') return likeApi(request, env);
  if (path === '/api/follow' && method === 'POST') return followApi(request, env);
  if (path === '/api/comment' && method === 'POST') return commentApi(request, env);
  return json({ ok: false, message: '接口不存在' }, 404);
}
