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

/** JSON 响应：AJAX 接口统一返回，禁止浏览器缓存，避免点赞等互动状态被复用 */
export const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers },
  });

/** 拼接提示查询串（path 自带查询串时用 & 连接），消息统一 URL 编码 */
export const withNotice = (path, key, message, headers = {}) =>
  redirect(`${path}${path.includes('?') ? '&' : '?'}${key}=${encodeURIComponent(message)}`, headers);

/** 302 回跳并提示成功 */
export const backMsg = (path, message, headers = {}) => withNotice(path, 'msg', message, headers);

/** 302 回跳并提示错误 */
export const backErr = (path, message, headers = {}) => withNotice(path, 'err', message, headers);

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
