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

/**
 * COUNT 查询的统一取值口径：COUNT(*) 必返回一行，取不到时按 0 处理。
 * 统计与分页都不再各写一遍 `.c` / `?.c || 0`，避免两种写法并存。
 */
export async function countOf(env, sql, params = []) {
  return (await first(env, sql, params))?.c || 0;
}

/** 生成 count 个 SQL 占位符，供 IN (...) 拼接动态列表 */
export function placeholders(count) {
  return new Array(count).fill('?').join(', ');
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

/**
 * UPDATE / DELETE 是否命中目标行。
 * 命中 0 行说明目标不存在（被并发删除，或构造请求伪造了 id），调用方应提示而不是静默成功。
 */
export const changed = (res) => !res || !res.meta || res.meta.changes > 0;

/**
 * 一次 D1 batch 往返执行多条语句，按入参顺序返回每条语句的 results（无结果集时为空数组）。
 * 首屏渲染原本要串行十余次 D1 往返，合并成一次可显著降低 Workers 上的等待时间。
 */
export async function batchAll(env, queries) {
  const statements = queries.map(({ sql, params = [] }) => env.DB.prepare(sql).bind(...params));
  const res = await env.DB.batch(statements);
  return (res || []).map((row) => (row && row.results) || []);
}
