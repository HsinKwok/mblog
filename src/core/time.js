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
