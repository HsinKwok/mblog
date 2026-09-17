/**
 * 基础工具层：会话、站点设置、数据访问、主题工具函数
 */
import { md5 } from './md5.js';

export { md5 };

/* ---------------- 请求响应工具 ---------------- */

export const html = (body, status = 200, headers = {}) =>
  new Response(body, {
    status,
    headers: { 'content-type': 'text/html; charset=utf-8', ...headers },
  });

/**
 * HTTP 头的值是 ByteString：只要出现非 ASCII 字符（例如中文页面别名），
 * Response 构造就会直接抛异常，把一次正常跳转变成 500。
 * 这里只对非 ASCII / 控制字符做百分号编码，已有的 %xx 原样保留，避免二次编码。
 */
const headerValue = (value) => String(value ?? '').replace(/[^\x20-\x7e]/g, (ch) => encodeURIComponent(ch));

export const redirect = (location, headers = {}) =>
  new Response(null, { status: 302, headers: { location: headerValue(location), ...headers } });

/** 拼接提示查询串（path 自带查询串时用 & 连接），消息统一 URL 编码 */
export const withNotice = (path, key, message) =>
  redirect(`${path}${path.includes('?') ? '&' : '?'}${key}=${encodeURIComponent(message)}`);

/** 302 回跳并提示成功 */
export const backMsg = (path, message) => withNotice(path, 'msg', message);

/** 302 回跳并提示错误 */
export const backErr = (path, message) => withNotice(path, 'err', message);

/** 读取回跳的成功提示（与 backMsg 写入端配对） */
export const noticeOf = (url) => url.searchParams.get('msg') || '';

/** 读取回跳的错误提示（与 backErr 写入端配对） */
export const errorOf = (url) => url.searchParams.get('err') || '';

/**
 * 后退/前进恢复（bfcache 或 HTTP 缓存）时的无闪烁同步。
 * 原理：浏览器恢复页面时不会重新请求 HTML，可能显示旧状态（如文章置顶标识）。
 * 这里在恢复时就地重新拉取当前页面，只替换带 data-soft 标记的内容区域，
 * 既保证状态与数据库一致，又避免 location.reload() 的白屏闪烁与滚动位置丢失。
 * 请求使用 cache:'no-store' 绕过缓存取值，不影响页面本身对浏览器缓存的复用。
 */
export const SOFT_SYNC = `<script>(function(){
var sync=function(){
  var regions=document.querySelectorAll('[data-soft]');
  if(!regions.length)return;
  fetch(location.href,{credentials:'same-origin',cache:'no-store'}).then(function(res){
    return res.ok&&!res.redirected?res.text():null;
  }).then(function(html){
    if(!html)return;
    var doc=new DOMParser().parseFromString(html,'text/html');
    for(var i=0;i<regions.length;i++){
      var name=regions[i].getAttribute('data-soft');
      var fresh=doc.querySelector('[data-soft="'+name+'"]');
      if(fresh)regions[i].innerHTML=fresh.innerHTML;
    }
  }).catch(function(){});
};
window.addEventListener('pageshow',function(ev){
  var nav=performance.getEntriesByType('navigation')[0];
  if(ev.persisted||(nav&&nav.type==='back_forward'))sync();
});
})();</script>`;

export function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * 放进 href/src 的地址白名单：只放行 http/https 与站内相对地址（/ ./ ../ # ?），
 * 其余（javascript:、data: 等伪协议）一律返回空串。
 * escapeHtml 只保证内容安全地落在属性里，不拦伪协议，所以用户可填的地址要走这里。
 */
export function safeUrl(raw) {
  const url = String(raw ?? '').trim();
  if (!url) return '';
  if (/^https?:\/\//i.test(url)) return url;
  // 协议相对地址（//evil.com、/\evil.com）会被浏览器按当前协议补全成跨站地址，一并拒绝
  if (/^[\\/]{2}/.test(url)) return '';
  if (/^(\/|\.\/|\.\.\/|#|\?)/.test(url)) return url;
  return '';
}

/**
 * CSRF 纵深防御：判断写请求是否来自同源页面。
 * 浏览器发起跨站请求时会带上 Origin（或至少 Referer），与当前站点不一致即拒绝；
 * 两者都缺失时无法判定（curl / 服务端调用 / 旧客户端），交由 Cookie 的 SameSite=Lax 兜底，放行。
 */
export function sameOrigin(request, url) {
  const source = request.headers.get('origin') || request.headers.get('referer') || '';
  if (!source) return true;
  try {
    return new URL(source).host === url.host;
  } catch {
    return false;
  }
}

/**
 * UPDATE / DELETE 是否命中目标行。
 * 命中 0 行说明目标不存在（被并发删除，或构造请求伪造了 id），调用方应提示而不是静默成功。
 */
export const changed = (res) => !res || !res.meta || res.meta.changes > 0;

/** 同源校验失败（CSRF 纵深防御）的统一响应：前台与后台共用 */
export const forbidden = () =>
  html('<meta charset="utf-8"><h1>403 Forbidden</h1><p>请求来源校验失败，请刷新页面后重试。</p>', 403);

/** 取表单字段 */
export function field(form, name, fallback = '') {
  const v = form.get(name);
  return v === null ? fallback : String(v);
}

/**
 * 取表单中的多值字段（复选框组，如用户组的后台菜单）。
 * FormData 走 getAll；JSON 提交路径没有 getAll，按 bulkIds 的同一口径取单值后兼容数组，
 * 否则 JSON 形式提交复选框组会被当成「一项都没勾」。
 */
export function listField(form, name) {
  const raw = typeof form.getAll === 'function' ? form.getAll(name) : [].concat(form.get(name) ?? []);
  return raw.filter((v) => v !== null && v !== undefined).map(String);
}

/** 宽松取整：缺失或非法时返回 fallback */
export const toInt = (raw, fallback) => {
  const n = parseInt(raw ?? '', 10);
  return Number.isFinite(n) ? n : fallback;
};

/** 取表单中的整数（缺失或非法时返回 fallback） */
export const intField = (form, name, fallback = 0) => toInt(field(form, name), fallback);

/** 取 URL 查询参数中的整数（缺失或非法时返回 fallback） */
export const intParam = (url, name, fallback = 0) => toInt(url.searchParams.get(name), fallback);

export async function readForm(request) {
  const type = request.headers.get('content-type') || '';
  if (type.includes('application/json')) {
    // 合法但非对象的 JSON（"x" / 123 / null / true）不能直接进 `k in data`，否则整站 POST 500
    const parsed = await request.json().catch(() => null);
    const data = parsed && typeof parsed === 'object' ? parsed : {};
    return { get: (k) => (k in data ? data[k] : null), _json: data };
  }
  return await request.formData();
}

/** 取 URL 中的页码参数（最小为 1） */
export function pageParam(url) {
  return Math.max(1, parseInt(url.searchParams.get('p') || '1', 10) || 1);
}

/** 计算总页数（至少 1 页）；size 非法（0 / 负数 / 非数字）时按每页 1 条处理，避免 LIMIT 被写成负数而拉全表 */
export function totalPagesOf(total, size) {
  const per = Math.floor(Number(size));
  return Math.max(1, Math.ceil(Number(total) / (per > 0 ? per : 1)));
}

/**
 * 把页码夹到 [1, totalPages]：p 非法 / 越界时取最近的有效页，避免 OFFSET 越界拉出空页。
 * 前后台列表共用，页数已由 totalPagesOf 算出。
 */
export function clampPage(page, totalPages) {
  return Math.min(Math.max(1, parseInt(page, 10) || 1), totalPages);
}

/**
 * COUNT 查询的统一取值口径：COUNT(*) 必返回一行，取不到时按 0 处理。
 * 统计与分页都不再各写一遍 `.c` / `?.c || 0`，避免两种写法并存。
 */
export async function countOf(env, sql, params = []) {
  return (await first(env, sql, params))?.c || 0;
}

/**
 * 列表页分页的统一口径：先按 COUNT 结果算出总页数，再把页码夹到 [1, totalPages]。
 * 前后台列表共用。
 */
export async function pageInfo(env, url, size, countSql, params = []) {
  const total = await countOf(env, countSql, params);
  const totalPages = totalPagesOf(total, size);
  return { page: clampPage(pageParam(url), totalPages), total, totalPages };
}

/**
 * 列表页状态筛选的统一口径：白名单外的取值一律回落「全部」，
 * 并给出可直接拼进 WHERE 的条件（'1=1' 表示不过滤）与参数，避免各处各写一遍白名单。
 */
export function statusFilter(raw, allowed, column) {
  const status = allowed.includes(raw) ? raw : 'all';
  return status === 'all'
    ? { status, where: '1=1', params: [] }
    : { status, where: `${column} = ?`, params: [status] };
}

/* ---------------- 时间与文本 ---------------- */

export function now() {
  const d = new Date(Date.now() + 8 * 3600 * 1000); // 东八区
  return d.toISOString().slice(0, 19).replace('T', ' ');
}

/**
 * SQL 端的东八区当前时间，与 now() 同一口径。
 * 「定时发布是否已到点」「今日数据统计」等比较统一引用这里，避免时区偏移散落各处。
 */
export const NOW_SQL = "datetime('now','+8 hours')";

/**
 * 定时发布是否已到时间：created 与 now() 同为东八区 'YYYY-MM-DD HH:mm:ss'，
 * 可直接按字符串比较（与 SQL 端 NOW_SQL 口径一致）。
 */
export function isDue(created) {
  return !created || String(created) <= now();
}

export function fmtDate(value, pattern = 'Y-m-d H:i') {
  if (!value) return '';
  // 兼容 'YYYY-MM-DD HH:mm:ss' 与 ISO 字符串
  const [datePart, timePart = '00:00:00'] = String(value).replace('T', ' ').split(' ');
  const [Y, M, D] = datePart.split('-');
  const [h, m] = timePart.split(':');
  return pattern
    .replace('Y', Y)
    .replace('m', M)
    .replace('d', D)
    .replace('H', h)
    .replace('i', m);
}

export function stripTags(str) {
  return String(str ?? '')
    .replace(/<[^>]*>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function excerpt(str, len = 140) {
  const text = stripTags(str);
  return text.length > len ? `${text.slice(0, len)}...` : text;
}

export function slugify(str, fallback = 'item') {
  const s = String(str ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^\w\u4e00-\u9fa5-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return s || `${fallback}-${Date.now().toString(36)}`;
}

/**
 * 生成不与现有文章冲突的 slug（base 按原样使用，不做 slugify，便于后台保留手填别名）。
 * post.slug 建有部分唯一索引（idx_post_slug，slug <> ''），且详情页按「pid 或 slug」匹配，
 * 重名会让链接指错文章，因此写入前统一查重：冲突时依次追加 -2 / -3…，超过上限则补时间戳兜底。
 * excludePid 用于编辑场景，避免把「自己当前的 slug」当成冲突。
 * 查重与写入之间仍有并发窗口，真正插入撞上唯一索引时由 insertPost 重新生成别名重试。
 */
export async function uniqueSlug(env, base, excludePid = 0) {
  const root = String(base ?? '').trim() || `post-${Date.now().toString(36)}`;
  for (let i = 1; i <= 50; i += 1) {
    const candidate = i === 1 ? root : `${root}-${i}`;
    const hit = await first(env, 'SELECT pid FROM post WHERE slug = ? AND pid <> ?', [candidate, excludePid]);
    if (!hit) return candidate;
  }
  return `${root}-${Date.now().toString(36)}`;
}

/**
 * 编辑已有内容时的别名解析（前台投稿保存、审核中心「编辑后通过」共用）。
 * 短微博的别名是 weibo-<时间戳>，前台按此前缀判定微博卡片样式，改名后必须原样保留；
 * 其余情况按新标题重新生成并去重（排除自身 pid）。
 */
export async function slugForEdit(env, slug, title, pid = 0) {
  const current = String(slug || '');
  if (/^weibo-/.test(current)) return current;
  return uniqueSlug(env, slugify(title, 'post'), pid);
}

/**
 * 文章 / 独立页的统一新增入口（前台发布、前台投稿、转发、后台文章与页面共用）。
 * slug 冲突兜底：uniqueSlug 的查重与本次插入之间存在并发窗口，一旦命中
 * post.slug 的部分唯一索引就换一个别名重试一次，避免把并发冲突暴露成 500。
 * created 允许传入定时发布时间；status / is_page 等缺省值与各调用处的旧实现保持一致。
 */
export async function insertPost(
  env,
  {
    title,
    content,
    slugBase,
    categoryId = 0,
    authorId,
    created = now(),
    status = 'publish',
    allowComment = 1,
    isPage = 0,
    isTop = 0,
    statement = '',
    repostPid = 0,
  } = {}
) {
  const sql = `INSERT INTO post (title, slug, content, statement, category_id, author_id, created, modified, status, allow_comment, is_page, is_top, repost_pid)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
  let slug = await uniqueSlug(env, slugBase);
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await run(env, sql, [
        title,
        slug,
        content,
        statement,
        categoryId,
        authorId,
        created,
        now(),
        status,
        allowComment,
        isPage,
        isTop,
        repostPid,
      ]);
    } catch (err) {
      if (attempt < 3 && /UNIQUE/i.test(String(err && err.message))) {
        slug = `${slug}-${Date.now().toString(36)}`;
        continue;
      }
      throw err;
    }
  }
}

/**
 * 内置伪分类（category_id = 0）的显示名：category 表里没有对应的行，
 * 前台文章元信息、后台文章列表与各分类下拉统一按这个名字展示。
 * 集中在此定义，避免各处各写一份文案后漂移。
 */
export const UNCATEGORIZED_NAME = '微言';

/**
 * 分类 id 归一化：post 表没有外键约束，非法 id 会被静默写进 category_id，
 * 产出前台查不到归属、后台分类列表也统计不到的悬空归档。
 * 故写入前统一校验存在性，不存在（含未提交 / 非数字）时回退 0（UNCATEGORIZED_NAME）。
 */
export async function validCategoryId(env, raw) {
  const id = Number.parseInt(raw, 10) || 0;
  if (!id) return 0;
  const row = await first(env, 'SELECT cid FROM category WHERE cid = ?', [id]);
  return row ? id : 0;
}

/**
 * 信息流、详情页与后台列表共用的互动计数列：已通过评论数 / 点赞数 / 已发布转发数。
 * 依赖 post 表的别名必须为 p；与 POST_DETAIL_COLUMNS 一并使用，避免详情页缺列导致计数恒为 0。
 */
export const POST_COUNT_COLUMNS = `(SELECT COUNT(*) FROM comment cm WHERE cm.pid = p.pid AND cm.status = 'approved') AS comments_num,
            (SELECT COUNT(*) FROM post_like pl WHERE pl.pid = p.pid) AS likes_num,
            (SELECT COUNT(*) FROM post rp WHERE rp.repost_pid = p.pid AND rp.status = 'publish' AND rp.created <= ${NOW_SQL}) AS reposts_num`;

/**
 * 文章 / 独立页的前台地址：独立页走 /page/{slug}，文章走 /archives/{pid}。
 * slug 是可写库的任意文本（含中文与 ? # 等保留字符），必须先编码再拼进地址，
 * 否则既会被浏览器截断，也可能让 Location 头因非 ASCII 字符直接抛异常。
 * 取出后拼进 href 前仍需 escapeHtml。
 */
export function frontUrl(row) {
  if (!row) return '/';
  return Number(row.is_page) === 1
    ? `/page/${encodeURIComponent(row.slug || row.pid)}`
    : `/archives/${row.pid}`;
}

/**
 * 解码地址中的路径片段（分类 / 标签 / 页面 / 文章别名）。
 * 非法百分号编码（如 /category/%zz）会让 decodeURIComponent 抛异常，
 * 这里统一回退为空串，由调用方按「未命中」处理成 404，而不是 500。
 */
export function decodeSlug(raw) {
  try {
    return decodeURIComponent(raw);
  } catch {
    return '';
  }
}

/**
 * 分类 / 标签归档地址：别名由管理员自由填写，可能是中文或含 ? # 等保留字符，
 * 必须逐段编码后才能拼进 href（路由侧统一用 decodeSlug 还原），否则链接与命中规则对不上。
 * 链接、翻页地址（baseUrl）与面包屑共用此口径，取出后拼进 href 前仍需 escapeHtml。
 */
export function slugHref(prefix, slug) {
  return `${prefix}/${encodeURIComponent(String(slug ?? ''))}`;
}

/** 路径 key 是纯数字时按 pid 命中（详情页 pid 优先于 slug），否则返回 0 */
export function numericKey(key) {
  return /^\d+$/.test(key) ? Number(key) : 0;
}

/**
 * 分页条（前台列表页与后台列表页共用）。
 * base 为目标地址（可自带查询串），query 为附加查询串（不含 ? 与 p）；
 * 给出 total 时在左侧显示总条数；variant='admin' 换成后台的按钮与文字样式，
 * 且只有一页时也照常渲染（前台列表页则省略，避免占位）。
 */
export function pager({ base, page, totalPages, total = null, query = '', variant = 'front' }) {
  const admin = variant === 'admin';
  if (!admin && totalPages <= 1) return '';
  const url = escapeHtml(base);
  const joiner = base.includes('?') ? '&' : '?';
  const href = (p) => `${url}${joiner}${query ? `${escapeHtml(query)}&` : ''}p=${p}`;
  const cls = admin ? 'wb-btn plain sm' : 'wb-btn';
  const span = (text) => (admin ? `<span class="muted">${text}</span>` : `<span>${text}</span>`);
  const parts = [];
  if (total !== null) parts.push(span(`共 ${total} 条`));
  if (page > 1) parts.push(`<a class="${cls}" href="${href(page - 1)}">上一页</a>`);
  parts.push(span(`第 ${page} / ${totalPages} 页`));
  if (page < totalPages) parts.push(`<a class="${cls}" href="${href(page + 1)}">下一页</a>`);
  return `<div class="wb-card wb-pager">\n    ${parts.join('\n    ')}\n  </div>`;
}

/** 正文中第一张图片（兼容 src 不带引号的写法） */
export function firstImage(content) {
  const m = /<img[^>]+src\s*=\s*["']?([^"'\s>]+)/i.exec(String(content ?? ''));
  return m ? m[1] : '';
}

/** 头像：优先用户头像，其次邮箱对应的 cravatar，最后默认图 */
export function avatarFor({ headpic = '', mail = '' } = {}, size = 100) {
  const pic = safeUrl(headpic);
  if (pic) return pic;
  if (mail) return `https://cravatar.com/avatar/${md5(mail.trim().toLowerCase())}?s=${size}`;
  return `https://cravatar.com/avatar/${md5('default')}?s=${size}&d=mp`;
}

/* ---------------- 用户组、微博等级与徽章 ---------------- */

/** 徽章 / 荣誉图片所在目录（public/images/badge/） */
export const BADGE_DIR = '/images/badge/';

/**
 * 读取全部用户组（后台「用户组管理」维护）。
 * 数据表尚未初始化时返回空数组，前台回退到内置默认组。
 */
export async function getGroups(env) {
  try {
    return await all(env, 'SELECT * FROM user_group ORDER BY ordernum, gid');
  } catch {
    return [];
  }
}

/**
 * 读取全部等级（后台「等级管理」维护）。
 * 数据表尚未初始化时返回空数组，前台不显示徽章。
 */
export async function getLevels(env) {
  try {
    return await all(env, 'SELECT * FROM user_level ORDER BY ordernum, min_posts, lid');
  } catch {
    return [];
  }
}

/**
 * 解析用户等级：level_id 非 0 时优先取后台手动指定的等级，
 * 否则按已发布微博数取「所需微博数」不超过它的最高等级。
 * 未匹配到任何等级时返回 null。
 */
export function resolveLevel(levels = [], { levelId = 0, postCount = 0 } = {}) {
  const list = (levels || []).filter(Boolean);
  if (!list.length) return null;
  const manual = Number(levelId) > 0 ? list.find((l) => Number(l.lid) === Number(levelId)) : null;
  if (manual) return manual;
  return (
    list
      .filter((l) => Number(postCount) >= (Number(l.min_posts) || 0))
      .sort((a, b) => (Number(a.min_posts) || 0) - (Number(b.min_posts) || 0))
      .pop() || null
  );
}

/** 解析用户组：未匹配到（含 group_id = 0）时回退到第一个用户组，无分组时返回 null */
export function resolveGroup(groups = [], groupId = 0) {
  const list = (groups || []).filter(Boolean);
  const hit = list.find((g) => Number(g.gid) === Number(groupId));
  return hit || list[0] || null;
}

/**
 * 按 gid 精确匹配用户组，不做「回退到第一个组」的容错。
 * 权限判定必须用它：否则 group_id = 0 或被删组的用户会被动继承第一个组的权限（如 skip_review）。
 */
export function groupById(groups = [], groupId = 0) {
  return (groups || []).filter(Boolean).find((g) => Number(g.gid) === Number(groupId)) || null;
}

/**
 * 用户是否「免审核」：管理员始终免审核，其余按用户组 skip_review = 1 判断。
 * 由后台「组别管理」按组配置，用于让特邀用户等特定组的前台投稿 / 评论直通。
 * 取不到组时按需审核处理（精确匹配，不继承第一个组的权限）。
 * 投稿与评论共用此口径，避免两处判断不一致（管理员发微博直通、发评论却待审）。
 */
export async function skipsReview(env, user) {
  if (!user) return false;
  if (user.role === 'administrator') return true;
  const group = groupById(await getGroups(env), user.group_id);
  return !!(group && Number(group.skip_review) === 1);
}

/**
 * 某类内容是否需要进入待审核：对应开关要求审核（'1'）且当前用户免审核权限不成立。
 * 投稿（frontPublishReview）与评论（commentReview）共用此判定，
 * 避免两处各写一遍 `=== '1' && !skipsReview` 而产生口径漂移。
 */
export async function reviewRequired(env, options, session, switchName) {
  return options[switchName] === '1' && !(await skipsReview(env, session));
}

/**
 * 用户组的审核权限（后台「组别管理 → 权限设置」按组配置）：
 * can_review = 可进入前台审核中心，处理待审核的投稿与评论；
 * can_edit = 可在审核时修改待审内容后再通过，必须同时具备 can_review。
 * 管理员在后台已有完整审核能力，前台审核中心同样放行。
 * 传入 groups（getGroups 结果）可避免重复查询；未传时按无权限处理。
 */
export function groupReviewPerms(groups = [], user) {
  if (!user) return { canReview: false, canEdit: false };
  if (user.role === 'administrator') return { canReview: true, canEdit: true };
  const group = groupById(groups, user.group_id);
  const canReview = !!(group && Number(group.can_review) === 1);
  return { canReview, canEdit: canReview && !!(group && Number(group.can_edit) === 1) };
}

/**
 * 徽章图标文件名（不含扩展名）：按用户组的命名模板展开，{badge} 替换为等级配置的 badge。
 * 例：普通组模板 'LV{badge}' + badge '3' → 'LV3'；特邀组模板 'TY{badge}' + badge '3' → 'TY3'。
 */
export function badgeFile(groups = [], groupId = 0, badge = '') {
  const b = String(badge ?? '').trim();
  if (!b) return '';
  const tpl = String((resolveGroup(groups, groupId) || {}).badge_tpl || '{badge}') || '{badge}';
  return tpl.includes('{badge}') ? tpl.split('{badge}').join(b) : tpl + b;
}

/**
 * 取用户的等级徽章文件名，供前台渲染；无等级或等级未配置徽章类型时返回空串。
 * 同一等级在不同用户组会展开成不同文件名，因此只占一个图标位。
 */
export function badgeOf(levels = [], groups = [], { levelId = 0, postCount = 0, groupId = 0 } = {}) {
  const badge = (resolveLevel(levels, { levelId, postCount }) || {}).badge || '';
  return badgeFile(groups, groupId, badge);
}

/**
 * 徽章 / 荣誉图标的地址规则（两者共用，文件都在 public/images/badge/ 下）：
 * 带扩展名时按原样返回，不带扩展名时依次尝试 .png → .gif（fallback）。
 * 目录里 LV* / TY* / RY* 为 .png，而 VIP* 只有 .gif，固定拼 .png 会让徽章 404，
 * 因此徽章与荣誉图标统一走这里，前台展示与后台预览也共用同一规则。
 */
export function honorImage(name) {
  const t = String(name ?? '').trim();
  if (!t) return { src: '', fallback: '' };
  const base = BADGE_DIR + encodeURIComponent(t);
  if (/\.(png|gif|jpe?g|webp|svg)$/i.test(t)) return { src: base, fallback: '' };
  return { src: `${base}.png`, fallback: `${base}.gif` };
}

/**
 * 徽章 / 荣誉图标的 <img> 生成：地址与 .png → .gif 回退规则统一走 honorImage，
 * onerror 的差异只有「加载失败时隐藏谁」，由 hideOnError 传入；
 * 前台展示（iconHtml）与后台预览（admin.js iconPreview）共用，避免两处各写一份回退脚本导致走样。
 */
export function iconImageTag(name, { style = '', alt, hideOnError = "this.parentNode.style.display='none'" } = {}) {
  const { src, fallback } = honorImage(name);
  if (!src) return '';
  const styleAttr = style ? ` style="${escapeHtml(style)}"` : '';
  const label = escapeHtml(alt ?? String(name ?? '').trim());
  return fallback
    ? `<img src="${escapeHtml(src)}" alt="${label}" data-fallback="${escapeHtml(fallback)}"${styleAttr} onerror="if(this.dataset.fallback){this.src=this.dataset.fallback;this.removeAttribute('data-fallback')}else{${hideOnError}}">`
    : `<img src="${escapeHtml(src)}" alt="${label}"${styleAttr} onerror="${hideOnError}">`;
}

/**
 * 徽章 / 荣誉图标的统一渲染：两者的地址规则完全一致，只有 class 与 alt 不同。
 * 不带扩展名时先试 .png，浏览器加载失败再切 .gif，都缺失则整体隐藏避免裂图。
 */
function iconHtml(name, { extraClass = '', alt }) {
  const cls = extraClass ? `wb-vip wb-vip-img ${extraClass}` : 'wb-vip wb-vip-img';
  const img = iconImageTag(name, { alt });
  return img ? `<i class="${cls}">${img}</i>` : '';
}

/** 等级徽章元素（前台的 .wb-vip）；等级未配置徽章类型时不输出 */
export function badgeHtml(name) {
  return iconHtml(name, { alt: '等级徽章' });
}

/** 荣誉图标元素：用户上存的图标名，与等级徽章共用地址与回退规则 */
export function honorHtml(honor) {
  return iconHtml(honor, { extraClass: 'wb-honor', alt: '荣誉图标' });
}

/* ---------------- 站点设置 ---------------- */

export const DEFAULT_OPTIONS = {
  // 基础信息
  title: '我的微博客',
  description: '一个基于 Cloudflare Workers 的轻量微博客',
  keywords: '博客,微博,Typecho,Cloudflare Workers',
  siteUrl: '',
  pageSize: '10',
  // 头部资料卡
  yourNickname: '站长',
  yourDescription: '在这里写一句自我介绍',
  yourPlace: '',
  yourBirthday: '',
  headImgUrl: '',
  faviconUrl: '',
  bgUrl: '',
  cardBgUrl: '',
  // 首页大图
  ROWINGBOHE: '1',
  randomNum: '5',
  ROWINGBOHEUrl: '',
  // 菜单
  yourMenuContent: '<li><a href="/">主页</a></li>',
  // 功能开关（0 是 / 1 否，与主题一致）
  searchOpen: '0',
  loginButtonOpen: '0',
  registerOpen: '0',
  friendLinkOpen: '0',
  // 注册审核（与 commentReview 同极性：0 免审核 / 1 需审核）：
  // 需审核时新注册账号先落为 user.status = 'pending'，管理员在后台「用户管理」通过后才能登录
  registerReview: '1',
  // 评论审核反转：0 免审核 / 1 需审核（与上述开关极性相反）
  commentReview: '0',
  // 前台投稿（0 是 / 1 否，与主题一致）
  frontPublish: '0',
  frontPublishReview: '0',
  // 发布框高级控件（0 显示 / 1 隐藏）
  frontPublishTimer: '1',
  frontPublishScope: '1',
  frontPublishStatement: '0',
  // 微博式互动（0 是 / 1 否，与主题一致）
  likeOpen: '0',
  repostOpen: '0',
  followOpen: '0',
  topicOpen: '0',
  // 资料卡按钮
  profileText1: '留言',
  profileLink1: '',
  profileText2: '关于我',
  // 默认指向站点信息页：/page/about 需要先有一篇别名为 about 的独立页面才存在，
  // 新站未建该页时点「关于我」会直接 404，故默认落到始终可用的 /site
  profileLink2: '/site',
  // 评论框
  commentCustom1: '还不赶快说些什么呀',
  commentCustom2: '发送',
  // 自定义代码与页脚
  optionHeader: '',
  optionFooter: '',
  myFooter: '',
};

/** 设置备份行不是设置项，合并选项时跳过，避免备份自引用膨胀 */
const OPTIONS_BACKUP_KEY = 'options_backup';

export async function getOptions(env) {
  const options = { ...DEFAULT_OPTIONS };
  try {
    const rows = await all(env, 'SELECT name, value FROM options');
    for (const row of rows) {
      if (row.name === OPTIONS_BACKUP_KEY) continue;
      // 空串是「管理员显式清空」的有效取值，不能当成未设置回落默认值；
      // 只有整行缺失（或值为 NULL）时才使用 DEFAULT_OPTIONS。
      if (row.value !== null && row.value !== undefined) options[row.name] = row.value;
    }
  } catch (err) {
    // 数据表尚未初始化时使用默认值（其余异常同样降级，但留下日志便于排查）
    console.error('读取站点设置失败，使用默认值：', err && err.message);
  }
  return options;
}

/**
 * 开关型站点设置的取值口径（与主题保持一致）：'0' 表示开启，'1' 表示关闭；
 * 审核类开关（registerReview / commentReview / frontPublishReview）则相反，'1' 表示需要审核。
 * 直接写 options.xxx === '0' 容易读反，统一走这两个函数。
 */
export function optionOn(options, name) {
  return options[name] === '0';
}

/** 审核类开关是否开启（'1' 表示需要审核） */
export function optionRequired(options, name) {
  return options[name] === '1';
}

export async function saveOptions(env, data) {
  const names = Object.keys(data);
  if (!names.length) return;
  await env.DB.batch(
    names.map((name) =>
      env.DB.prepare(
        'INSERT INTO options (name, value) VALUES (?, ?) ON CONFLICT(name) DO UPDATE SET value = excluded.value'
      ).bind(name, String(data[name] ?? ''))
    )
  );
}

/* ---------------- 数据访问 ---------------- */

export async function all(env, sql, params = []) {
  const res = await env.DB.prepare(sql).bind(...params).all();
  return res.results || [];
}

export async function first(env, sql, params = []) {
  return await env.DB.prepare(sql).bind(...params).first();
}

export async function run(env, sql, params = []) {
  return await env.DB.prepare(sql).bind(...params).run();
}

/** 生成 count 个 SQL 占位符，供 IN (...) 拼接动态列表 */
export function placeholders(count) {
  return new Array(count).fill('?').join(', ');
}

/**
 * 构造 LIKE 的模糊匹配串：转义 % _ 与转义符本身，需配合 `LIKE ? ESCAPE '\'` 使用。
 * 否则搜索词里的 % 会变成通配符，让「搜索 %」返回全站内容。
 */
export function likePattern(keyword) {
  return `%${String(keyword ?? '').replace(/[\\%_]/g, (ch) => `\\${ch}`)}%`;
}

/** 文章状态：publish 已发布 / pending 待审核 / draft 草稿 / private 私密 */
export const POST_STATUSES = ['publish', 'pending', 'draft', 'private'];
export const POST_STATUS_LABEL = {
  publish: '已发布',
  pending: '待审核',
  draft: '草稿',
  private: '私密',
};

/** 校验并归一化文章状态，非法值回落到 fallback */
export function normalizePostStatus(raw, fallback = 'publish') {
  return POST_STATUSES.includes(raw) ? raw : fallback;
}

/** 文章状态徽章（前台「我的文章」与后台列表共用）；状态先归一化再转义，避免把非法值带进 class */
export function statusPill(status) {
  const value = normalizePostStatus(status);
  return `<span class="wb-pill ${value}">${POST_STATUS_LABEL[value]}</span>`;
}

/** 内容声明可选项（前台发布框与后台文章编辑共用，空串表示「无」） */
export const PUBLISH_STATEMENTS = ['内容为自主创作', '内容为转载', '内容由AI生成', '内容为虚构演绎'];

/**
 * 规范化内容声明：只接受 PUBLISH_STATEMENTS 白名单内的取值，其余一律回退为「无声明」。
 * 前台发布框、前台投稿与后台文章表单共用一个口径；enabled 对应后台的「允许声明」开关。
 */
export function normalizeStatement(raw, enabled = true) {
  if (!enabled) return '';
  const value = String(raw ?? '');
  return PUBLISH_STATEMENTS.includes(value) ? value : '';
}

/** 可见范围白名单（前台发布框与投稿页共用）：仅接受 private / public，其余值（空、伪造）视为「未指定」 */
export function normalizeVisibility(raw) {
  const value = String(raw ?? '');
  return value === 'private' || value === 'public' ? value : '';
}

/** 评论正文长度上限（前台 textarea 的 maxlength 与服务端校验共用同一口径） */
export const COMMENT_MAX_LENGTH = 2000;

/** 短微博 / 转发正文长度上限（首页发布框、转发框的 maxlength 与服务端校验共用同一口径） */
export const WEIBO_MAX_LENGTH = 2000;

/** 短微博没有标题，发布时取正文去标签后的前 N 字作为标题（与正文长度上限一样抽成常量，避免各处写魔数） */
export const WEIBO_TITLE_MAX_LENGTH = 50;

/** 文章标题长度上限（文章表单校验与「转发」自动生成的标题共用同一口径） */
export const TITLE_MAX_LENGTH = 100;

/** 文章正文长度上限（前台 / 后台正文输入框的 maxlength 与服务端校验共用同一口径） */
export const CONTENT_MAX_LENGTH = 20000;

/**
 * 长文标题 / 正文的通用校验（前台投稿、审核时修改、后台文章表单共用同一口径）。
 * 合法时返回空串，否则返回可直接提示给用户的文案。
 */
export function validateTitleContent(title, content) {
  if (!title) return '标题不能为空';
  if (title.length > TITLE_MAX_LENGTH) return `标题不能超过 ${TITLE_MAX_LENGTH} 个字符`;
  if (!content.trim()) return '正文不能为空';
  if (content.length > CONTENT_MAX_LENGTH) return '正文过长，请控制在 2 万字符以内';
  return '';
}

/**
 * 评论正文校验（前台提交与前台审核「编辑后通过」共用同一口径）。
 * 合法时返回空串，否则返回可直接提示给用户的文案。
 */
export function validateComment(content) {
  const text = String(content ?? '').trim();
  if (!text) return '评论内容不能为空';
  if (text.length > COMMENT_MAX_LENGTH) return `评论内容过长，请控制在 ${COMMENT_MAX_LENGTH} 字符以内`;
  return '';
}

/**
 * 短微博 / 转发正文校验（首页发布框与转发共用同一文案口径）。
 * 合法时返回空串，否则返回可直接提示给用户的文案。
 */
export function validateWeibo(content) {
  return String(content ?? '').length > WEIBO_MAX_LENGTH
    ? `内容过长，请控制在 ${WEIBO_MAX_LENGTH} 字符以内`
    : '';
}

/** 正文话题标记 #话题#（不含换行）；客户端发布框沿用同一口径，改动时需同步 theme.js 的 PUB_SCRIPT */
const TOPIC_RE = /#([^#\n]+)#/g;

/** 取出正文中的 #话题# 名称列表（空白话题忽略） */
export function topicNamesIn(content) {
  const names = [];
  for (const m of String(content ?? '').matchAll(TOPIC_RE)) {
    const name = m[1].trim();
    if (name) names.push(name);
  }
  return names;
}

/** 内容是否为空：只剩 #话题# 与空白时视为空（图片 / 视频等标签算内容） */
export function hasContent(content) {
  return !!String(content ?? '')
    .replace(TOPIC_RE, '')
    .trim();
}

/**
 * 把 datetime-local 值（YYYY-MM-DDTHH:mm）归一化为 'YYYY-MM-DD HH:mm:ss'，非未来时间返回空串。
 * 除格式外还要校验日历有效性：仅靠正则会让 9999-99-99 99:99 入库，文章将永远不满足 created <= now()。
 */
export function normalizeSchedule(raw) {
  const value = normalizeCreated(raw);
  return value && value > now() ? value : '';
}

/**
 * 把 'YYYY-MM-DD HH:mm(:ss)' 归一化为 'YYYY-MM-DD HH:mm:ss'，格式或日历无效时返回空串。
 * 与 normalizeSchedule 的唯一区别是不要求落在未来：后台编辑历史文章需要写入过去时间。
 */
export function normalizeCreated(raw) {
  const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?$/.exec(String(raw || '').trim());
  if (!m) return '';
  const [, ys, mos, ds, hs, mis, ss = '00'] = m;
  if (!isValidDateTime(ys, mos, ds, hs, mis, ss)) return '';
  return `${ys}-${mos}-${ds} ${hs}:${mis}:${ss}`;
}

/** 年月日时分秒是否构成真实存在的时刻（复用来拦住 2 月 30 日、99 月这类越界取值） */
function isValidDateTime(y, mo, d, h, mi, s) {
  const n = [y, mo, d, h, mi, s].map(Number);
  if (n.some((v) => !Number.isInteger(v))) return false;
  const [, month, day, hour, minute, second] = n;
  if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59 || second > 59) return false;
  // 不用 Date.UTC 构造：它会把 0-99 的年份当成 1900+year（0000-0099 会被误判为非法），
  // 改用 setUTCFullYear 按字面量设置，再靠回读比对拦住 2 月 30 日这类越界日期
  const dt = new Date(0);
  dt.setUTCFullYear(n[0], month - 1, day);
  dt.setUTCHours(hour, minute, second, 0);
  return dt.getUTCFullYear() === n[0] && dt.getUTCMonth() === month - 1 && dt.getUTCDate() === day;
}

/** 解析逗号分隔的标签串（中英文逗号均可） */
export function parseTagNames(str) {
  return String(str ?? '')
    .split(/[,，]/)
    .map((t) => t.trim())
    .filter(Boolean);
}

/** 读取某篇文章已绑定的标签名 */
export async function tagNamesOf(env, pid) {
  const rows = await all(
    env,
    'SELECT t.name FROM post_tag pt JOIN tag t ON t.tid = pt.tid WHERE pt.pid = ?',
    [pid]
  );
  return rows.map((t) => t.name);
}

/**
 * 删除文章 / 独立页面并清理其标签、评论、点赞关联；他人对该文的转发则解除引用，避免孤儿转发。
 * isPage 非 null 时按内容类型限定删除范围：否则构造请求拿文章 id 就能删掉同号的独立页面。
 * 目标行不存在（或类型不匹配）时直接返回，不再清理关联数据。
 */
export async function deletePostCascade(env, pid, { isPage = null } = {}) {
  const scope = isPage === null ? '' : ' AND is_page = ?';
  const res = await run(env, `DELETE FROM post WHERE pid = ?${scope}`, isPage === null ? [pid] : [pid, isPage ? 1 : 0]);
  if (!changed(res)) return res;
  await run(env, 'DELETE FROM post_tag WHERE pid = ?', [pid]);
  await run(env, 'DELETE FROM comment WHERE pid = ?', [pid]);
  await run(env, 'DELETE FROM post_like WHERE pid = ?', [pid]);
  // 转发源已不存在，把转发降级为普通微博（repost_pid = 0），保留他人内容
  await run(env, 'UPDATE post SET repost_pid = 0 WHERE repost_pid = ?', [pid]);
  return res;
}

/** 解析标签名到 tid：不存在则按别名创建；并发命中唯一约束时回查已存在的那条 */
async function resolveTagId(env, name) {
  const byName = await first(env, 'SELECT tid FROM tag WHERE name = ?', [name]);
  if (byName) return byName.tid;
  const slug = slugify(name, 'tag');
  const bySlug = await first(env, 'SELECT tid FROM tag WHERE slug = ?', [slug]);
  if (bySlug) return bySlug.tid;
  try {
    const res = await run(env, 'INSERT INTO tag (name, slug) VALUES (?, ?)', [name, slug]);
    return res.meta.last_row_id;
  } catch (err) {
    // 上面的查重与这里的写入之间存在并发窗口，由 tag.name / tag.slug 的唯一约束兜底
    if (!/UNIQUE/i.test(String(err && err.message))) throw err;
    const existing = await first(env, 'SELECT tid FROM tag WHERE name = ? OR slug = ?', [name, slug]);
    if (!existing) throw err;
    return existing.tid;
  }
}

/**
 * 写入文章标签（整体替换该文章的标签关联）。
 * 先把全部标签解析/创建完成，再动 post_tag：中途失败时原有标签仍然保留，不会被清空。
 */
export async function saveTags(env, pid, names) {
  const tids = [];
  for (const name of names) {
    const tid = await resolveTagId(env, name);
    if (tid && !tids.includes(tid)) tids.push(tid);
  }
  if (!tids.length) {
    await run(env, 'DELETE FROM post_tag WHERE pid = ?', [pid]);
    return;
  }
  const marks = placeholders(tids.length);
  await run(env, `DELETE FROM post_tag WHERE pid = ? AND tid NOT IN (${marks})`, [pid, ...tids]);
  for (const tid of tids) {
    await run(env, 'INSERT OR IGNORE INTO post_tag (pid, tid) VALUES (?, ?)', [pid, tid]);
  }
}

/** 点赞 / 取消点赞，返回最新点赞数与是否已赞 */
export async function toggleLike(env, pid, userid) {
  const exist = await first(env, 'SELECT lid FROM post_like WHERE pid = ? AND userid = ?', [pid, userid]);
  if (exist) {
    await run(env, 'DELETE FROM post_like WHERE lid = ?', [exist.lid]);
  } else {
    // 读后写之间存在并发窗口（同一用户连点两次）：交给 UNIQUE(pid, userid) 兜底，
    // 冲突时仍按「已点赞」返回，而不是把唯一约束异常抛成 500
    await run(env, 'INSERT OR IGNORE INTO post_like (pid, userid, created) VALUES (?, ?, ?)', [pid, userid, now()]);
  }
  const row = await first(env, 'SELECT COUNT(*) c FROM post_like WHERE pid = ?', [pid]);
  return { liked: !exist, count: row?.c || 0 };
}

/** 关注 / 取消关注，返回最新粉丝数与是否已关注 */
export async function toggleFollow(env, userid, targetId) {
  if (!targetId || userid === targetId) return { following: false, count: 0, skipped: true };
  const exist = await first(env, 'SELECT fid FROM follow WHERE userid = ? AND target_id = ?', [userid, targetId]);
  if (exist) {
    await run(env, 'DELETE FROM follow WHERE fid = ?', [exist.fid]);
  } else {
    // 与 toggleLike 同理：并发重复关注由 UNIQUE(userid, target_id) 兜底
    await run(env, 'INSERT OR IGNORE INTO follow (userid, target_id, created) VALUES (?, ?, ?)', [userid, targetId, now()]);
  }
  const row = await first(env, 'SELECT COUNT(*) c FROM follow WHERE target_id = ?', [targetId]);
  return { following: !exist, count: row?.c || 0 };
}

/* ---------------- 会话（HMAC 签名 Cookie） ---------------- */

const COOKIE = 'mblog_session';
const encoder = new TextEncoder();

function b64url(bytes) {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromB64url(str) {
  const padded = str.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((str.length + 3) % 4);
  const bin = atob(padded);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

async function sign(value, secret) {
  // 缺失时立即失败，避免用 "undefined" 当密钥悄悄签发出可预测的会话
  if (!secret) {
    throw new Error('缺少 SESSION_SECRET：本地请在 .dev.vars 中配置，线上请执行 wrangler secret put SESSION_SECRET');
  }
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(value));
  return b64url(new Uint8Array(sig));
}

/** 常量时间比较：逐字节异或累加，不因首个不同字符提前返回 */
export function timingSafeEqual(a, b) {
  const x = String(a ?? '');
  const y = String(b ?? '');
  if (x.length !== y.length) return false;
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x.charCodeAt(i) ^ y.charCodeAt(i);
  return diff === 0;
}

/* ---------------- 口令哈希（PBKDF2-SHA256） ---------------- */

/** 迭代次数：兼顾 Workers 单次请求耗时与离线爆破成本 */
const PBKDF2_ITERATIONS = 100000;
const PBKDF2_PREFIX = 'pbkdf2$';

/**
 * 结构合法（迭代次数 / 16 字节盐 / 32 字节摘要）但永不匹配的占位哈希。
 * 用于账号不存在时仍执行一次等价耗时的校验，避免通过响应时间枚举用户名。
 */
const DUMMY_PASSWORD_HASH = `${PBKDF2_PREFIX}${PBKDF2_ITERATIONS}$${'A'.repeat(22)}$${'A'.repeat(43)}`;

async function pbkdf2(password, salt, iterations) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations, hash: 'SHA-256' }, key, 256);
  return new Uint8Array(bits);
}

/** 生成 `pbkdf2$迭代次数$盐$摘要` 形式的口令哈希（每次调用使用新随机盐） */
export async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await pbkdf2(password, salt, PBKDF2_ITERATIONS);
  return `${PBKDF2_PREFIX}${PBKDF2_ITERATIONS}$${b64url(salt)}$${b64url(hash)}`;
}

/**
 * 校验口令。
 * 返回 { ok, legacy }：legacy 为 true 表示命中的是历史的无盐 MD5 记录，
 * 调用方应在登录成功时就地把它升级成 PBKDF2（见 upgradePassword）。
 */
export async function verifyPassword(password, stored) {
  const value = String(stored ?? '');
  if (!value) return { ok: false, legacy: false };
  if (value.startsWith(PBKDF2_PREFIX)) {
    const [iterations, salt, hash] = value.slice(PBKDF2_PREFIX.length).split('$');
    const rounds = parseInt(iterations, 10);
    if (!rounds || !salt || !hash) return { ok: false, legacy: false };
    let saltBytes;
    try {
      // 库里的盐可能被手工改坏：非法 base64 会让 atob 抛异常，这里按「校验失败」处理
      saltBytes = fromB64url(salt);
    } catch {
      return { ok: false, legacy: false };
    }
    const expect = await pbkdf2(password, saltBytes, rounds);
    return { ok: timingSafeEqual(b64url(expect), hash), legacy: false };
  }
  return { ok: timingSafeEqual(md5(password), value.toLowerCase()), legacy: true };
}

/** 把历史 MD5 口令就地升级为 PBKDF2（仅在口令已校验通过后调用） */
export async function upgradePassword(env, userid, password) {
  try {
    await run(env, 'UPDATE user SET md5password = ? WHERE userid = ?', [await hashPassword(password), userid]);
  } catch (err) {
    // 升级失败不影响本次登录
    console.error('口令哈希升级失败：', err && err.message);
  }
}

/** 昵称长度上限（前台注册、我的资料、后台用户表单共用同一口径） */
export const SCREENNAME_MAX_LENGTH = 40;

/** 口令最短长度（注册、改密、初始化账号、后台新建用户共用同一口径） */
export const PASSWORD_MIN_LENGTH = 6;

/** 昵称校验（前台注册、我的资料、后台用户表单共用），合法返回空串 */
export function validateScreenname(name) {
  const value = String(name ?? '').trim();
  if (!value) return '昵称不能为空';
  if (value.length > SCREENNAME_MAX_LENGTH) return `昵称不能超过 ${SCREENNAME_MAX_LENGTH} 个字符`;
  return '';
}

/**
 * 昵称查重：昵称与用户名同为前台标识，须全站唯一（库层由 idx_user_screenname 兜底）。
 * exceptUserId 用于「我的资料」与后台编辑：排除自己，否则只是保存未改动的昵称也会被判为占用。
 * 返回占用者的 userid，未被占用返回 0。
 */
export async function screennameTaken(env, name, exceptUserId = 0) {
  const row = await first(env, 'SELECT userid FROM user WHERE screenname = ? AND userid <> ?', [
    String(name ?? '').trim(),
    Number(exceptUserId) || 0,
  ]);
  return row ? row.userid : 0;
}

/** 邮箱格式校验（注册、我的资料、后台用户表单共用）；留空视为合法，合法返回空串 */
export function validateMail(mail) {
  const value = String(mail ?? '').trim();
  if (!value) return '';
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) ? '' : '邮箱格式不正确';
}

/**
 * 修改口令（前台 /settings 与后台「我的资料」共用）。
 * 三个字段全空表示本次不改密码，直接返回空串；否则返回首个校验错误文案，成功后写库并返回空串。
 */
export async function changePassword(env, user, { oldPassword = '', password = '', confirm = '' } = {}) {
  if (!oldPassword && !password && !confirm) return '';
  const check = await verifyPassword(oldPassword, user.md5password);
  if (!check.ok) return '当前密码不正确';
  if (String(password).length < PASSWORD_MIN_LENGTH) return `新密码至少 ${PASSWORD_MIN_LENGTH} 位`;
  if (password !== confirm) return '两次输入的新密码不一致';
  await run(env, 'UPDATE user SET md5password = ? WHERE userid = ?', [await hashPassword(password), user.userid]);
  return '';
}

/** 保存个人资料（昵称 / 邮箱校验 + 可选改密 + 写库），返回错误文案，成功返回空串 */
export async function saveProfile(
  env,
  user,
  { screenname = '', mail = '', url = '', headpic = '', oldPassword = '', password = '', confirm = '' } = {}
) {
  const name = String(screenname).trim();
  const badName = validateScreenname(name);
  if (badName) return badName;
  const badMail = validateMail(mail);
  if (badMail) return badMail;
  // 昵称须唯一（与用户名同口径）：排除自己，否则不改昵称也会被判为占用
  if (await screennameTaken(env, name, user.userid)) return '该昵称已被使用';
  const error = await changePassword(env, user, { oldPassword, password, confirm });
  if (error) return error;
  try {
    await run(env, 'UPDATE user SET screenname = ?, mail = ?, url = ?, headpic = ? WHERE userid = ?', [
      name,
      String(mail).trim(),
      String(url).trim(),
      String(headpic).trim(),
      user.userid,
    ]);
  } catch (err) {
    // 上面的查重与写入之间存在并发窗口：同名请求可能同时通过查重，
    // 由 user.screenname 的唯一索引兜底，命中时按“已被使用”提示，而不是抛成 500
    if (/UNIQUE/i.test(String(err && err.message))) return '该昵称已被使用';
    throw err;
  }
  return '';
}

/**
 * 初始化账号（部署内置的 admin / admin123 首次登录后台时强制调用）：
 * 同时修改用户名与口令，并把 must_change 清 0 以放行后台。
 * 返回首个校验错误文案，成功后返回空串。
 */
export async function initAccount(env, user, { username = '', password = '', confirm = '' } = {}) {
  const name = String(username).trim();
  if (!name) return '用户名不能为空';
  if (String(password).length < PASSWORD_MIN_LENGTH) return `新密码至少 ${PASSWORD_MIN_LENGTH} 位`;
  if (password !== confirm) return '两次输入的新密码不一致';
  if (name !== user.username) {
    const exists = await first(env, 'SELECT userid FROM user WHERE username = ?', [name]);
    if (exists) return '该用户名已被占用';
  }
  try {
    await run(env, 'UPDATE user SET username = ?, md5password = ?, must_change = 0 WHERE userid = ?', [
      name,
      await hashPassword(password),
      user.userid,
    ]);
  } catch (err) {
    // 上面的查重与这里的写入之间存在并发窗口，由 user.username 的唯一约束兜底
    if (/UNIQUE/i.test(String(err && err.message))) return '该用户名已被占用';
    throw err;
  }
  return '';
}

/* ---------------- 登录限流 ---------------- */

/** 同一「IP + 用户名」在窗口内的最大失败次数 */
export const LOGIN_MAX_FAILURES = 10;
export const LOGIN_WINDOW_MS = 15 * 60 * 1000;

/** 客户端 IP：Cloudflare 注入的 cf-connecting-ip */
export function clientIp(request) {
  return (request.headers.get('cf-connecting-ip') || '').trim() || 'unknown';
}

/**
 * 登录限流键：同时绑定来源 IP 与用户名，避免一个账号被全网锁死。
 * 用户名保持原样（只去首尾空白），与 user.username 的大小写敏感比较保持一致，
 * 否则大小写不同的两个账号会共用同一个限流桶，互相把对方锁死。
 */
export function loginThrottleKey(request, username) {
  return `${clientIp(request)}:${String(username || '').trim()}`;
}

/**
 * 是否仍在限流窗口内（返回 true 表示允许继续尝试）。
 * 计数表异常时按放行处理：限流是加固手段，不应因它本身出错把登录彻底锁死。
 */
export async function loginAllowed(env, key) {
  try {
    const row = await first(env, 'SELECT count, first FROM login_attempt WHERE attempt_key = ?', [key]);
    if (!row) return true;
    if (Date.now() - Number(row.first) > LOGIN_WINDOW_MS) return true;
    return Number(row.count) < LOGIN_MAX_FAILURES;
  } catch (err) {
    console.error('登录限流查询失败，按放行处理：', err && err.message);
    return true;
  }
}

/** 记一次登录失败；窗口过期或首次失败时重新开始计数 */
export async function recordLoginFailure(env, key) {
  const ts = Date.now();
  try {
    const row = await first(env, 'SELECT count, first FROM login_attempt WHERE attempt_key = ?', [key]);
    if (!row || ts - Number(row.first) > LOGIN_WINDOW_MS) {
      await run(
        env,
        'INSERT INTO login_attempt (attempt_key, count, first, last) VALUES (?, 1, ?, ?) ON CONFLICT(attempt_key) DO UPDATE SET count = 1, first = ?, last = ?',
        [key, ts, ts, ts, ts]
      );
    } else {
      await run(env, 'UPDATE login_attempt SET count = count + 1, last = ? WHERE attempt_key = ?', [ts, key]);
    }
  } catch (err) {
    console.error('登录失败计数写入失败：', err && err.message);
  }
}

/** 登录成功后清空该键的失败计数 */
export async function clearLoginFailures(env, key) {
  try {
    await run(env, 'DELETE FROM login_attempt WHERE attempt_key = ?', [key]);
  } catch (err) {
    console.error('登录失败计数清理失败：', err && err.message);
  }
}

/**
 * 按用户名清空其所有来源 IP 的失败计数（删除用户时调用，避免留下孤儿限流行）。
 * 限流键形如 `<ip>:<用户名原样>`，故按「以 `:用户名` 结尾」匹配；
 * 用户名里的 % 与 _ 需转义，否则会把其他用户的记录一并删掉。
 */
export async function clearLoginFailuresOf(env, username) {
  const suffix = `:${String(username ?? '').trim()}`.replace(/[\\%_]/g, (ch) => `\\${ch}`);
  try {
    await run(env, "DELETE FROM login_attempt WHERE attempt_key LIKE ? ESCAPE '\\'", [`%${suffix}`]);
  } catch (err) {
    console.error('登录失败计数清理失败：', err && err.message);
  }
}

/** 命中限流阈值时的统一提示（前后台登录共用） */
export const LOGIN_THROTTLE_MESSAGE = `登录失败次数过多，请 15 分钟后再试（上限 ${LOGIN_MAX_FAILURES} 次）`;

/**
 * 登录校验（前台 /login 与后台 /admin/login 共用）：
 * 限流 → 查用户 → 校验口令 → 失败计数 / 成功清计数 + 历史 MD5 透明升级。
 * requireAdmin 为 true 时额外要求 role === 'administrator'（后台登录）。
 * 口令正确但账号仍待审核（user.status = 'pending'）时返回 pending，
 * 且不计失败次数——这不是撞库，锁死没有意义。
 * 只返回结果，错误文案与会话附加项（admin 标记）由调用方决定。
 */
export async function attemptLogin(env, request, { username, password, requireAdmin = false }) {
  const throttleKey = loginThrottleKey(request, username);
  if (!(await loginAllowed(env, throttleKey))) return { ok: false, throttled: true, user: null };
  const user = await first(env, 'SELECT * FROM user WHERE username = ?', [username]);
  // 用户不存在时也走一次等价的 PBKDF2 校验（用结构合法的占位哈希），
  // 否则「账号不存在」会明显更快返回，账号列表可被耗时枚举出来
  const check = await verifyPassword(password, user ? user.md5password : DUMMY_PASSWORD_HASH);
  if (!user || !check.ok || (requireAdmin && user.role !== 'administrator')) {
    await recordLoginFailure(env, throttleKey);
    return { ok: false, throttled: false, user: null };
  }
  if (user.status === 'pending') return { ok: false, throttled: false, pending: true, user: null };
  await clearLoginFailures(env, throttleKey);
  if (check.legacy) await upgradePassword(env, user.userid, password);
  return { ok: true, throttled: false, user };
}

export function readCookie(request, name) {
  const cookie = request.headers.get('cookie') || '';
  for (const part of cookie.split(';')) {
    const [k, ...rest] = part.trim().split('=');
    if (k !== name) continue;
    const raw = rest.join('=');
    // 客户端可以塞进任意字节：解码失败（如裸 %）不能让整个请求崩掉，
    // 按原样返回交由签名校验判定失败即可。
    try {
      return decodeURIComponent(raw);
    } catch {
      return raw;
    }
  }
  return '';
}

/**
 * 口令指纹：把当前口令哈希掺进会话签名。
 * 改密后指纹随之变化，浏览器里已经存在的旧 Cookie 会立即失效（无需服务端会话表）。
 */
async function passwordStamp(env, hash) {
  return (await sign(`pw:${hash || ''}`, env.SESSION_SECRET)).slice(0, 22);
}

export async function createSession(env, user, extra = {}) {
  const payload = { uid: user.userid, exp: Date.now() + 7 * 24 * 3600 * 1000, ...extra };
  if (user.md5password) payload.pw = await passwordStamp(env, user.md5password);
  const data = b64url(encoder.encode(JSON.stringify(payload)));
  const sig = await sign(data, env.SESSION_SECRET);
  return `${COOKIE}=${data}.${sig}; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=604800`;
}

export function clearSession() {
  return `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=0`;
}

export async function getSession(env, request) {
  const raw = readCookie(request, COOKIE);
  if (!raw || !raw.includes('.')) return null;
  const [data, sig] = raw.split('.');
  let expect;
  try {
    expect = await sign(data, env.SESSION_SECRET);
  } catch (err) {
    // SESSION_SECRET 缺失属于部署配置问题：会话一律视为未登录（并留下日志），
    // 而不是把签名异常抛到调用方，让整个站点的每个请求都 500。
    console.error('会话签名不可用：', err && err.message);
    return null;
  }
  if (!timingSafeEqual(expect, sig)) return null;
  let payload;
  try {
    payload = JSON.parse(new TextDecoder().decode(fromB64url(data)));
  } catch {
    return null;
  }
  if (!payload.exp || payload.exp < Date.now()) return null;

  const user = await first(
    env,
    'SELECT userid, username, screenname, mail, url, headpic, role, level_id, group_id, honor, must_change, status, md5password FROM user WHERE userid = ?',
    [payload.uid]
  );
  // 账号被删除、或被后台「转为待审」后，旧 Cookie 必须立即失效：
  // 否则封禁 / 审核只是摆设，已登录的浏览器能一直用下去
  if (!user || user.status === 'pending') return null;
  // 指纹对不上说明期间改过密码（含后台重置），旧 Cookie 同样作废
  if (payload.pw && payload.pw !== (await passwordStamp(env, user.md5password))) return null;
  // 口令哈希不对外暴露（调用方需要时自行查询该列）
  delete user.md5password;
  // 后台登录态与前台登录态分离（admin 标记）
  user.isAdminSession = !!payload.admin;
  return user;
}

export async function isAdmin(env, request) {
  const user = await getSession(env, request);
  return user && user.role === 'administrator' && user.isAdminSession ? user : null;
}
