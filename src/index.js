/**
 * MBlog · 仿微博主题博客（Cloudflare Workers）
 * 前台：复刻 Typecho「Weibo」主题；后台：/admin 全量管理
 */
import { html, sameOrigin, forbidden } from './lib.js';
import { adminRouter } from './admin.js';
import { apiRouter } from './api.js';
import { frontRouter } from './front/router.js';

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

      // AJAX 接口：详情页互动与列表无刷新翻页
      if (path === '/api' || path.startsWith('/api/')) {
        return await apiRouter(request, env, url);
      }

      // 后台也放进 try：否则后台异常不会写日志，线上只能看到 Cloudflare 的通用错误页
      if (path === '/admin' || path.startsWith('/admin/')) {
        return await adminRouter(request, env, url);
      }
      return await frontRouter(request, env, url, ctx);
    } catch (err) {
      // 不把异常细节回显给访客（可能泄露 SQL / 表名 / 路径等信息），只写日志。
      console.error('请求处理失败：', err && err.stack ? err.stack : err);
      return html('<meta charset="utf-8"><h1>服务器错误</h1><p>服务器内部错误，请稍后再试。</p>', 500);
    }
  },
};
