import { first } from './db.js';

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
 * 内置伪分类（category_id = 0）的显示名：category 表里没有对应的行，
 * 前台文章元信息、后台文章列表与各分类下拉统一按这个名字展示。
 * 集中在此定义，避免各处各写一份文案后漂移。
 */
export const UNCATEGORIZED_NAME = '微言';

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
 * 构造 LIKE 的模糊匹配串：转义 % _ 与转义符本身，需配合 `LIKE ? ESCAPE '\'` 使用。
 * 否则搜索词里的 % 会变成通配符，让「搜索 %」返回全站内容。
 */
export function likePattern(keyword) {
  return `%${String(keyword ?? '').replace(/[\\%_]/g, (ch) => `\\${ch}`)}%`;
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

/** 解析逗号分隔的标签串（中英文逗号均可） */
export function parseTagNames(str) {
  return String(str ?? '')
    .split(/[,，]/)
    .map((t) => t.trim())
    .filter(Boolean);
}
