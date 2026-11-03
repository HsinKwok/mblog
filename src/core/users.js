import { md5 } from '../md5.js';
import { all } from './db.js';
import { escapeHtml, safeUrl } from './text.js';

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

/** 头像：优先用户头像，其次邮箱对应的 cravatar，最后默认图 */
export function avatarFor({ headpic = '', mail = '' } = {}, size = 100) {
  const pic = safeUrl(headpic);
  if (pic) return pic;
  if (mail) return `https://cravatar.com/avatar/${md5(mail.trim().toLowerCase())}?s=${size}`;
  return `https://cravatar.com/avatar/${md5('default')}?s=${size}&d=mp`;
}
