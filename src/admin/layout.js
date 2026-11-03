/**
 * 后台布局骨架与各页面共用的列表 / 表单组件
 */
import {
  html,
  backMsg,
  backErr,
  noticeOf,
  errorOf,
  escapeHtml as e,
  intField,
  intParam,
  readForm,
  toInt,
  changed,
  all,
  run,
  getOptions,
  getGroups,
  groupById,
} from '../lib.js';
import { head, topbar, footer } from '../theme.js';

/**
 * 后台左栏菜单。
 * key 同时是「组别管理 → 后台菜单」的取值（user_group.admin_menus，逗号分隔）与路由鉴权的依据；
 * path 为该菜单负责的路由前缀（含其下的新增 / 保存 / 删除 / 批量删除等子路由），
 * dashboard 用 exact 精确匹配，否则 '/admin' 会前缀命中所有后台路径。
 * 数组顺序即左栏显示顺序，新增菜单时同步更新 schema.sql 中 admin_menus 的取值说明。
 */
export const MENUS = [
  { key: 'dashboard', href: '/admin', label: '仪表盘', path: '/admin', exact: true },
  { key: 'posts', href: '/admin/posts', label: '文章管理', path: '/admin/posts' },
  { key: 'pages', href: '/admin/pages', label: '独立页面', path: '/admin/pages' },
  { key: 'comments', href: '/admin/comments', label: '评论管理', path: '/admin/comments' },
  { key: 'likes', href: '/admin/likes', label: '点赞管理', path: '/admin/likes' },
  { key: 'follows', href: '/admin/follows', label: '关注管理', path: '/admin/follows' },
  { key: 'categories', href: '/admin/categories', label: '分类管理', path: '/admin/categories' },
  { key: 'tags', href: '/admin/tags', label: '标签管理', path: '/admin/tags' },
  { key: 'links', href: '/admin/links', label: '友链管理', path: '/admin/links' },
  { key: 'users', href: '/admin/users', label: '用户管理', path: '/admin/users' },
  { key: 'groups', href: '/admin/groups', label: '组别管理', path: '/admin/groups' },
  { key: 'levels', href: '/admin/levels', label: '等级管理', path: '/admin/levels' },
  { key: 'profile', href: '/admin/profile', label: '我的资料', path: '/admin/profile' },
  { key: 'features', href: '/admin/features', label: '功能管理', path: '/admin/features' },
  { key: 'nav', href: '/admin/nav', label: '导航管理', path: '/admin/nav' },
  { key: 'options', href: '/admin/options', label: '站点设置', path: '/admin/options' },
];

export const MENU_KEYS = MENUS.map((m) => m.key);

/** 路径所属的菜单；不属于任何菜单（如 /admin/init）时返回 null */
export function menuOfPath(path) {
  return (
    MENUS.find((m) => (m.exact ? path === m.path || path === `${m.path}/` : path === m.path || path.startsWith(`${m.path}/`))) ||
    null
  );
}

/**
 * 当前管理员可见的后台菜单 key 集合，依据其所属用户组（user_group.admin_menus）。
 * 返回 null 表示全部可见：'*' / 空串是「全部」的写法，组被删或读组失败时也按全部处理
 * （能进后台的账号 role 必为 administrator，此处不是权限边界，而是入口的组织方式，故失败时放开而非锁死）。
 */
export async function visibleMenuKeys(env, user) {
  const group = groupById(await getGroups(env), user.group_id);
  const raw = String((group && group.admin_menus) || '').trim();
  if (!raw || raw === '*') return null;
  const allowed = new Set(MENU_KEYS);
  const keys = raw
    .split(',')
    .map((k) => k.trim())
    .filter((k) => allowed.has(k));
  // 勾选项全是无效 key（只可能来自直连数据库的脏数据）时按「全部可见」处理，
  // 与 '*' / 组被删同一口径，避免左栏空白且每个菜单都 403 的死局
  if (!keys.length) return null;
  return new Set(keys);
}

/* ---------------- 布局（复用前台 head / topbar / footer 与 .wb-* 组件） ---------------- */

/** 后台专用样式，仅补充两栏骨架等，其余组件全部复用前台 weibo.css */
export const ADMIN_CSS = '<link rel="stylesheet" href="/style/admin.css" type="text/css">';

/**
 * 批量删除脚本（各列表页共用）。
 * 勾选框与提交按钮通过 form 属性关联到批量表单，避免与行内删除表单嵌套。
 */
export const BULK_SCRIPT = `<script>
(function () {
  function boxes(id) {
    return Array.prototype.slice.call(document.querySelectorAll('input[name="ids"][form="' + id + '"]'));
  }
  document.addEventListener('change', function (ev) {
    var box = ev.target;
    // data-bulk 是无值属性，dataset.bulk 会得到空串（假值），必须用 hasAttribute 判断
    if (box.type !== 'checkbox' || !box.form || !box.form.hasAttribute('data-bulk')) return;
    var id = box.form.id;
    if (box.hasAttribute('data-check-all')) {
      boxes(id).forEach(function (b) { b.checked = box.checked; });
      return;
    }
    if (box.name !== 'ids') return;
    var all = document.querySelector('[data-check-all][form="' + id + '"]');
    if (!all) return;
    var list = boxes(id);
    all.checked = list.length > 0 && list.every(function (b) { return b.checked; });
  });
  document.addEventListener('submit', function (ev) {
    var form = ev.target;
    if (!form.hasAttribute || !form.hasAttribute('data-bulk')) return;
    var checked = boxes(form.id).filter(function (b) { return b.checked; });
    if (!checked.length) {
      ev.preventDefault();
      alert('请先勾选要删除的记录');
      return;
    }
    if (!confirm('确定删除选中的 ' + checked.length + ' 条记录吗？此操作不可恢复。')) ev.preventDefault();
  });
})();
</script>`;

/** 后台页面外框：head（含后台样式）+ 顶栏 + 主体 + 页脚，登录页与后台各页共用 */
export function pageFrame(options, user, title, content, navRows = []) {
  return `${head(options, `${title} · 后台`, ADMIN_CSS, '', false)}
${topbar(options, user, '', navRows)}
${content}
${footer(options)}`;
}

export function layout(options, user, active, title, body, notice = '', navRows = [], menus = null) {
  const nav = MENUS.filter((m) => !menus || menus.has(m.key))
    .map((m) => `<a href="${m.href}" class="${active === m.href ? 'on' : ''}">${m.label}</a>`)
    .join('\n      ');
  const content = `<div class="wb-container wb-container-admin">
  <aside class="wb-left">
    <div class="wb-card wb-nav wb-nav-admin">
      <div class="wb-nav-title">后台管理</div>
      ${nav}
    </div>
  </aside>
  <main class="wb-center" data-soft="admin">
    ${notice}
    ${body}
  </main>
</div>
${BULK_SCRIPT}`;
  return pageFrame(options, user, title, content, navRows);
}

export function noticeFrom(url) {
  const msg = noticeOf(url);
  const err = errorOf(url);
  if (msg) return `<div class="wb-notice ok">${e(msg)}</div>`;
  if (err) return `<div class="wb-notice err">${e(err)}</div>`;
  return '';
}

/** 渲染后台页面；传入 url 时自动带出 msg/err 提示 */
export async function adminPage(env, user, active, title, body, url = null, status = 200) {
  const [options, navRows, menus] = await Promise.all([
    getOptions(env),
    all(env, 'SELECT * FROM nav ORDER BY ordernum, nid'),
    visibleMenuKeys(env, user),
  ]);
  return html(layout(options, user, active, title, body, url ? noticeFrom(url) : '', navRows, menus), status);
}

/** 列表空态行（各列表页共用）：避免无数据时渲染出一个只有表头的空表格 */
export function emptyRow(colspan, text) {
  return `<tr><td colspan="${colspan}" class="muted">${text}</td></tr>`;
}

/** 查不到目标（记录 / 后台页面）时的 404 提示页（各编辑表单与后台路由共用） */
export function missingPage(env, user, back, title, label, backText = '返回列表') {
  return adminPage(
    env,
    user,
    back,
    title,
    `<div class="wb-card wb-card-pad">${label}不存在。<p style="margin-top:12px"><a class="wb-btn" href="${back}">${backText}</a></p></div>`,
    null,
    404
  );
}

/** 列表行内的删除表单（各列表页共用）；confirmText 为删除前的确认文案 */
export function deleteForm(action, key, value, confirmText) {
  return `<form method="post" action="${action}" onsubmit="return confirm('${confirmText}');" style="display:inline">
          <input type="hidden" name="${key}" value="${e(value)}"><button class="wb-btn d sm" type="submit">删除</button></form>`;
}

/**
 * 列表行内的审核二态表单（文章审核、评论与用户共用）。
 * - 待审（status === 'pending'）时渲染「通过」，目标状态为 active；
 *   传 reject 时在「通过」后再渲染一个「驳回」表单（文章审核用，目标状态由 reject.status 指定）。
 * - 非待审时渲染「转为待审」；idleText 传空串表示不渲染任何按钮（文章列表只在待审行给出审核按钮）。
 * - extra 为随表单一起提交的额外隐藏字段（文章列表用它保留当前筛选状态，便于审核后跳回原位）。
 */
export function statusToggle({ action, name, value, status, active, extra = {}, idleText = '转为待审', reject = null }) {
  const hidden =
    `<input type="hidden" name="${name}" value="${e(value)}">` +
    Object.entries(extra)
      .map(([k, v]) => `<input type="hidden" name="${e(k)}" value="${e(v)}">`)
      .join('');
  const button = (to, label, cls) =>
    `<form method="post" action="${action}" style="display:inline">${hidden}<input type="hidden" name="status" value="${e(to)}"><button class="wb-btn${cls ? ` ${cls}` : ''} sm" type="submit">${e(label)}</button></form>`;
  if (status === 'pending') {
    return `${button(active, '通过', 'p')}${reject ? button(reject.status, reject.label, '') : ''}`;
  }
  return idleText ? button('pending', idleText, '') : '';
}

/* ---------------- 批量删除（各列表页共用） ---------------- */

/** 批量表单容器：勾选框与按钮用 form 属性关联，避免与行内表单嵌套 */
export function bulkForm(id, action) {
  return `<form id="${id}" method="post" action="${action}" data-bulk></form>`;
}

/** 批量删除按钮 */
export function bulkButton(id) {
  return `<button class="wb-btn d" type="submit" form="${id}">批量删除</button>`;
}

/** 表头全选框 */
export function bulkCheckAll(id) {
  return `<th class="wb-check"><input type="checkbox" data-check-all form="${id}" title="全选"></th>`;
}

/** 行勾选框 */
export function bulkCheck(id, value) {
  return `<td class="wb-check"><input type="checkbox" name="ids" value="${e(value)}" form="${id}" title="选择"></td>`;
}

/** 解析勾选的 ID（同名多值，兼容 JSON 数组），过滤非法值 */
export function bulkIds(form) {
  const raw = typeof form.getAll === 'function' ? form.getAll('ids') : [].concat(form.get('ids') ?? []);
  return raw.map((v) => toInt(v, 0)).filter((n) => n > 0);
}

/**
 * 批量删除：逐个执行 done，然后回跳列表；未勾选时给出提示。
 * done 返回 false 表示该条被保护规则跳过（如不能删除当前登录账号）；
 * 返回 D1 结果且一行未命中时同样不计入成功，避免把「已不存在」的 id 也算成删除成功。
 */
export async function bulkDelete(request, back, done) {
  const ids = bulkIds(await readForm(request));
  if (!ids.length) return backErr(back, '请先勾选要删除的记录');
  let count = 0;
  for (const id of ids) {
    const res = await done(id);
    if (res !== false && changed(res)) count += 1;
  }
  if (!count) return backErr(back, '没有可删除的记录（可能受保护规则限制或已被删除）');
  const skipped = ids.length - count;
  const msg = skipped ? `已删除 ${count} 条记录，跳过 ${skipped} 条（受保护或已不存在）` : `已删除 ${count} 条记录`;
  return backMsg(back, msg);
}

/**
 * 后台列表页骨架：批量表单 + 工具条 + 表格（含空态、表尾说明）+ 分页条。
 * 各列表页只负责查询、工具条、表头与行渲染，避免 11 处重复同一段结构。
 * rows 为已渲染的行 HTML 数组；prepend 为不受空态影响的固定行（如系统内置页面）。
 */
export function listShell({ bulkId, bulkAction, tools = '', toolsStyle = '', head, rows = [], prepend = '', colspan, emptyText, hint = '', foot = '' }) {
  const tableRows = rows.length ? rows.join('') : emptyRow(colspan, emptyText);
  return `
  ${bulkForm(bulkId, bulkAction)}
  <div class="wb-card wb-admin-tools"${toolsStyle ? ` style="${toolsStyle}"` : ''}>
    ${tools}
  </div>
  <div class="wb-card wb-card-pad">
  <table class="wb-table wb-table-list">
    <thead><tr>${head}</tr></thead>
    <tbody>
    ${prepend}${tableRows}
    </tbody>
  </table>
  ${hint}
  </div>
  ${foot}`;
}

/** 校验登录后回跳地址：仅允许站内后台页面，避免开放重定向与登录页自循环 */
export function safeNext(raw) {
  if (!raw || (raw !== '/admin' && !raw.startsWith('/admin/'))) return '';
  // 先解码再判断：%2e%2e、%5c 等编码变形同样能构造目录穿越，只看原始字面量会漏拦。
  // 最多还原 3 层（防多重编码绕过），解码失败说明地址本身非法，一律拒绝。
  let decoded = raw;
  for (let i = 0; i < 3; i += 1) {
    let next;
    try {
      next = decodeURIComponent(decoded);
    } catch {
      return '';
    }
    if (next === decoded) break;
    decoded = next;
  }
  // 只校验路径部分：地址已限定以 /admin 开头，不存在协议相对跳转，
  // 查询串里出现 // 或 ..（如 ?q=http://x）属正常内容，不应误伤
  const path = decoded.split(/[?#]/)[0];
  if (path.includes('\\') || path.includes('..')) return '';
  // 解码后仍须落在后台路径下，否则（如 /admin/..%2fescape）不再放行
  if (path !== '/admin' && !path.startsWith('/admin/')) return '';
  if (path === '/admin/login' || path.startsWith('/admin/logout')) return '';
  return raw;
}

/* ---------------- 编辑表单 / 单条删除（各模块共用） ---------------- */

/**
 * 编辑表单统一骨架：按 ?id= 取行 → 查不到给 404 → 包上表单外壳 → 渲染后台页。
 * fetchRow(id) 返回目标行或 null；fields(row) 返回表单内部字段（可为 async）。
 */
export async function editForm({ env, user, url, back, key, label, fetchRow, fields }) {
  const id = intParam(url, 'id');
  // 带了 ?id= 却不是正整数（0 / 负数 / 非法字符串）时按「记录不存在」处理：
  // 否则表单会带着 id=0 提交，落库时被当成新建，编辑请求凭空多出一条记录
  if (url.searchParams.has('id') && !id) return missingPage(env, user, back, `编辑${label}`, label);
  const row = id ? await fetchRow(id) : null;
  if (id && !row) return missingPage(env, user, back, `编辑${label}`, label);
  const body = `
  <form class="wb-card wb-form wb-form-wide" method="post" action="${back}/save">
    <input type="hidden" name="${key}" value="${row ? row[key] : 0}">
    ${await fields(row)}
    <div class="inline" style="margin-top:16px"><button class="wb-btn p" type="submit">保存</button><a class="wb-btn" href="${back}">返回列表</a></div>
  </form>`;
  // 带上 url 才能显示保存失败后回跳时的 ?err= 提示
  return adminPage(env, user, back, row ? `编辑${label}` : `新建${label}`, body, url);
}

/**
 * 单条删除表单的通用处理：取 key → 执行 done → 回跳列表。
 * done 返回 false 表示被保护规则跳过；返回 D1 结果且一行未命中（记录已被并发删除、
 * 或构造请求伪造了 id）时提示「不存在」，而不是静默提示「已删除」。
 */
export async function deleteOne(request, back, key, done, message = '已删除') {
  const form = await readForm(request);
  const id = intField(form, key);
  if (!id) return backErr(back, '参数不正确');
  const res = await done(id);
  if (res === false || !changed(res)) return backErr(back, '记录不存在，可能已被删除');
  return backMsg(back, message);
}

/**
 * 新增 / 更新的通用落库：id 非 0 走 UPDATE（自动把 id 追加为最后一个参数），否则走 INSERT。
 * - 更新命中 0 行说明目标已被删除，返回提示而不是静默「保存成功」；
 * - uniqueErr 非空时，唯一约束冲突按该文案提示，而不是抛成 500。
 * 成功返回 null，失败返回可直接 return 的提示响应。
 */
export async function saveRow(env, back, { id, update, insert, uniqueErr = '', missingErr = '记录不存在，可能已被删除' }) {
  try {
    if (id) {
      const res = await run(env, update[0], [...update[1], id]);
      if (!changed(res)) return backErr(back, missingErr);
    } else {
      await run(env, insert[0], insert[1]);
    }
  } catch (err) {
    if (uniqueErr && /UNIQUE/i.test(String(err && err.message))) return backErr(back, uniqueErr);
    throw err;
  }
  return null;
}
