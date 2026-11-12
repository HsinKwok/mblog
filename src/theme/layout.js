import { escapeHtml as e, excerpt, avatarFor, safeUrl, frontUrl, slugHref, SOFT_SYNC, badgeHtml, honorHtml, optionOn } from '../lib.js';
// 主题样式表由 Wrangler 作为文本模块打进 Worker，直接内联进 <head>：
// 首屏少一次渲染阻塞的 CSS 往返（24 KB，br 压缩后约 7 KB）
import weiboCss from '../../public/style/weibo.css';

/**
 * 徽章区（两个图标位）：位 1 为等级徽章，图标集随用户所属用户组切换，同一时刻只占一个图标位；
 * 位 2 为荣誉图标（Gif / Png）。任一为空则不渲染该位。
 */
const badgeSlots = (badge, honor) => `${badgeHtml(badge)}${honorHtml(honor)}`;

/* ---------------- 头部 ---------------- */

/**
 * 行内样式里的图片地址：先过 safeUrl 白名单，再把括号 / 引号 / 空白等字符百分号编码，
 * 避免后台填写的地址提前闭合 url() 并把后续内容当成新的 CSS 声明注入。
 */
function styleUrl(raw, fallback = '') {
  const url = safeUrl(raw) || fallback;
  // 注意：encodeURIComponent 不会转义 ( ) ' ! * ~，所以这里要自己按码位转成 %XX
  return url.replace(/["'()\s\\]/g, (ch) => `%${ch.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0')}`);
}

/**
 * 页面背景：取后台「站点设置 → 头部资料卡」的背景图片链接，未配置时沿用样式表默认底色。
 * 以 body 行内样式下发，仅前台骨架使用，后台页面不传该参数。
 */
function bodyStyleOf(options) {
  const bg = styleUrl(options.bgUrl);
  if (!bg) return '';
  // url() 里不能再套一对双引号：整段样式要塞进 <body style="…">，多余的 " 会提前闭合属性；
  // styleUrl 已把引号 / 括号 / 空白编码成 %XX，这里直接用不带引号的形式即可
  return `background: url(${e(bg)}) no-repeat top center; background-attachment: fixed; background-size: cover;`;
}

/**
 * 首屏外链图片的预连接：资料卡头像由后台填写（常见是 qlogo.cn 之类的图床），
 * 不提前建连就要等 HTML 解析到 <img> 才开始 DNS + TLS，直接拖慢 LCP。
 * 相对地址 / 非法地址返回空串。
 */
function originOf(raw) {
  const url = safeUrl(raw);
  if (!url.startsWith('http')) return '';
  try {
    return new URL(url).origin;
  } catch {
    return '';
  }
}

export function head(options, pageTitle, extraHead = '', bodyStyle = '', frontScript = true, publisherCss = false) {
  const favicon = options.faviconUrl || '/favicon.ico';
  // 文章头像走 cravatar，资料卡头像走后台填写的图床，两处都提前建连（同一域名只留一份）
  const preconnects = [...new Set(['https://cravatar.com', originOf(options.headImgUrl)])].filter(Boolean);
  const preconnectTags = preconnects
    .map((o) => `<link rel="preconnect" href="${e(o)}" crossorigin>\n<link rel="dns-prefetch" href="${e(o)}">`)
    .join('\n');
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="applicable-device" content="pc,mobile">
<meta name="renderer" content="webkit">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${e(pageTitle)} - ${e(options.title)}</title>
<link rel="shortcut icon" type="image/ico" href="${e(favicon)}">
<link rel="icon" sizes="192x192" href="${e(favicon)}">
<link rel="apple-touch-icon" href="${e(favicon)}">
${preconnectTags}
<meta name="description" content="${e(options.description)}">
<meta name="keywords" content="${e(options.keywords)}">
<style>${weiboCss}</style>
${publisherCss ? '<link rel="stylesheet" href="/style/publisher.css" type="text/css">' : ''}
${frontScript ? '<script src="/js/app.js" defer></script>' : ''}
${extraHead}${SOFT_SYNC}
${options.optionHeader || ''}
</head>
<body${bodyStyle ? ` style="${bodyStyle}"` : ''}>`;
}

/**
 * 自定义导航（后台「导航管理」）的当前页高亮：按当前页面类型匹配导航地址。
 * 导航地址由管理员自由填写，这里只对内置页面做常规路径匹配。
 */
function navOn(navUrl, active) {
  const u = String(navUrl || '');
  const hit =
    (active === 'home' && (u === '/' || u === '/index.html')) ||
    (active === 'links' && u.startsWith('/links')) ||
    (active === 'mine' && u === '/write/mine') ||
    (active === 'write' && u === '/write') ||
    (active === 'archives' && u.startsWith('/archives')) ||
    (active === 'review' && u.startsWith('/review')) ||
    (active === 'site' && (u === '/site' || u === '/site.html')) ||
    (active === 'settings' && u.startsWith('/settings'));
  return hit ? ' class="on"' : '';
}

export function topbar(options, session, active, navRows = []) {
  const on = (key) => (active === key ? ' class="on"' : '');
  const nav = [];
  // 后台「导航管理」配置的导航；未配置任何一项时回退到内置默认导航
  const visible = (navRows || []).filter((n) => !n.login_only || session);
  const tops = visible.filter((n) => !n.parent_id);
  // 兜底：上级被隐藏（父级设了「仅登录后显示」而当前未登录）或已删除的子项，仍按顶级渲染，
  // 与后台「导航管理」列表同一口径，避免子项在后台显示可见、前台却被静默丢弃
  const topIds = new Set(tops.map((n) => n.nid));
  const items = [...tops, ...visible.filter((n) => n.parent_id && !topIds.has(n.parent_id))];
  // 后台「导航管理」勾选「在新窗口打开」时，前台链接加 target="_blank"（无链接的父级菜单不处理）
  const blankAttr = (n) => (n.blank && n.url ? ' target="_blank" rel="noopener"' : '');
  if (items.length) {
    for (const top of items) {
      const subs = visible.filter((n) => n.parent_id === top.nid);
      const href = safeUrl(top.url) || '#';
      if (subs.length) {
        nav.push(`<div class="wb-nav-item">
      <a href="${e(href)}"${navOn(top.url, active)}${blankAttr(top)}>${e(top.name)}<i class="wb-nav-caret"></i></a>
      <div class="wb-nav-sub">
        ${subs.map((s) => `<a href="${e(safeUrl(s.url) || '#')}"${blankAttr(s)}>${e(s.name)}</a>`).join('\n        ')}
      </div>
    </div>`);
      } else {
        nav.push(`<a href="${e(href)}"${navOn(top.url, active)}${blankAttr(top)}>${e(top.name)}</a>`);
      }
    }
  } else {
    nav.push(`<a href="/"${on('home')}>首页</a>`);
    // 「我的文章」是管理入口（编辑 / 删除自己已发的文章），关闭前台投稿时也应可达；
    // 「写文章」才是投稿入口，随前台投稿开关一起隐藏
    if (session) {
      nav.push(`<a href="/write/mine"${on('mine')}>我的文章</a>`);
      if (optionOn(options, 'frontPublish')) nav.push(`<a href="/write"${on('write')}>写文章</a>`);
    }
    nav.push(`<a href="/links.html"${on('links')}>友情链接</a>`);
  }

  let search = '';
  if (optionOn(options, 'searchOpen')) {
    search = `<form class="wb-search" method="get" action="/search" role="search">
        <input type="text" name="s" placeholder="搜索微博 / 文章" autocomplete="off">
        <button type="submit" aria-label="搜索">🔍</button>
      </form>`;
  }

  let right = '';
  if (optionOn(options, 'loginButtonOpen')) {
    if (session) {
      right = `<div class="wb-user">
          <img src="${e(avatarFor(session, 60))}" alt="${e(session.screenname || session.username)}">
          <span>${e(session.screenname || session.username)}</span>
        </div>`;
      if (session.role === 'administrator') {
        right += `<a class="wb-btn plain" href="/admin">后台</a>`;
      }
      right += `<a class="wb-btn plain" href="/logout">退出</a>`;
    } else {
      right = `${optionOn(options, 'registerOpen') ? `<a class="wb-btn plain" href="/register.html">注册</a>` : ''}
        <a class="wb-btn p" href="/login.html">登录</a>`;
    }
  }

  return `<header class="wb-topbar">
  <div class="wb-topbar-inner">
    <a class="wb-logo" href="/">
      <span class="wb-logo-mark">微</span>
      <span class="wb-logo-txt">${e(options.title)}</span>
    </a>
    <nav class="wb-topnav">
      ${nav.join('\n      ')}
    </nav>
    ${search}
    <div class="wb-topright">${right}</div>
  </div>
</header>`;
}

/* ---------------- 左栏：个人卡 + 导航 ---------------- */

/**
 * 左栏个人卡：
 * - 未登录（profile.mode === 'site'）展示后台「站点设置」的站点地址与资料卡按钮/菜单；
 * - 登录后（profile.mode === 'user'）展示当前登录用户自己的资料与互动数据。
 * - hideMeta 为真时隐藏昵称、简介、居住地/生日与「关于本站」（站点信息页的中心卡使用）。
 * - extraHtml 为追加到卡片最末尾的附加区块（站点信息页把「站点信息」明细块并入卡片）。
 */

/** 未登录资料卡：站点地址（站点设置 → 基础信息 → 站点地址） */
function siteUrlLink(options) {
  const site = safeUrl(options.siteUrl);
  if (!site) return '';
  return `<a class="wb-profile-site" href="${e(site)}" target="_blank" rel="noopener noreferrer">${e(site)}</a>`;
}

/** 未登录资料卡：资料卡按钮与菜单（站点设置 → 头部资料卡），二维码弹层向上展开 */
function siteContact(options) {
  const items = [];
  if (options.profileText1) {
    // 二维码地址由「站点设置」填 profileLink1，未配置时只展示文字，不内置任何二维码图片
    const popLink = safeUrl(options.profileLink1);
    items.push(popLink
      ? `<div class="wb-profile-item">${e(options.profileText1)}
      <div class="wb-profile-pop"><img src="${e(popLink)}" alt="二维码" loading="lazy" decoding="async"></div>
    </div>`
      : `<div class="wb-profile-item">${e(options.profileText1)}</div>`);
  }
  if (options.profileText2) {
    const link = safeUrl(options.profileLink2);
    // 链接被清空但文字保留时渲染成 div（与上面的二维码项同结构），
    // 否则会产出点击无反应的 href="#"（与关注 / 粉丝统计同一类问题）
    items.push(
      link
        ? `<a class="wb-profile-item" href="${e(link)}">${e(options.profileText2)}</a>`
        : `<div class="wb-profile-item">${e(options.profileText2)}</div>`
    );
  }
  if (options.yourMenuContent) {
    items.push(`<div class="wb-profile-item wb-profile-menu"><ul>${options.yourMenuContent}</ul></div>`);
  }
  return items.length ? `<div class="wb-profile-contact">${items.join('\n    ')}</div>` : '';
}

/** 未登录资料卡：居住地与生日（站点设置 → 头部资料卡） */
function siteItems(options) {
  const items = [];
  if (options.yourPlace) items.push(`<li>居住地：${e(options.yourPlace)}</li>`);
  if (options.yourBirthday) items.push(`<li>生日：${e(options.yourBirthday)}</li>`);
  if (!items.length) return '';
  return `<ul class="wb-profile-items">
      ${items.join('\n      ')}
    </ul>`;
}

/** 未登录资料卡：「关于本站」链接（固定指向「关于本站」独立页面 /page/about） */
function siteReadMore() {
  return '<a class="wb-profile-more" href="/page/about">关于本站 ›</a>';
}

export function profileCard(options, profile = {}, session, hideMeta = false, extraHtml = '') {
  const isUser = profile.mode === 'user';
  const name = profile.name || options.title;
  const avatar = profile.avatar || options.headImgUrl || '';
  const desc = profile.desc || '';
  const cardBg = styleUrl(options.cardBgUrl, '/images/cardBg.webp');

  const stats = (profile.stats || [])
    .map((s) => {
      const inner = `<b>${s.value || 0}</b><span>${e(s.label)}</span>`;
      // 没有跳转目标的统计项（关注 / 粉丝）渲染成 span，避免产出点击无反应的 href="#"
      const href = safeUrl(s.href);
      return href ? `<a href="${e(href)}">${inner}</a>` : `<span class="wb-profile-stat">${inner}</span>`;
    })
    .join('\n      ');

  let act = '';
  if (isUser) {
    act = `<div class="inline" style="justify-content:center">
        <a class="wb-btn p sm" href="/settings">个人设置</a>
        ${profile.canReview ? '<a class="wb-btn plain sm" href="/review">审核中心</a>' : ''}
        ${session && session.role === 'administrator' ? '<a class="wb-btn plain sm" href="/admin">后台</a>' : ''}
        <a class="wb-btn plain sm" href="/logout">退出</a>
      </div>`;
  }

  return `<div class="wb-card wb-profile">
    <div class="wb-profile-cover" style="background-image:url(${e(cardBg)})"></div>
    <a class="wb-profile-avatar" href="${isUser ? '/write/mine' : '/'}">${avatar ? `<img src="${e(avatar)}" alt="${e(name)}" width="72" height="72" fetchpriority="high" decoding="async">` : ''}</a>
    ${hideMeta ? '' : `<a class="wb-profile-name" href="${isUser ? '/write/mine' : '/'}">${e(name)}${isUser ? badgeSlots(profile.badge, profile.honor) : ''}</a>`}
    ${desc && !hideMeta ? `<div class="wb-profile-desc">${e(desc)}</div>` : ''}
    ${isUser || hideMeta ? '' : siteItems(options)}
    ${isUser ? '' : siteUrlLink(options)}
    ${isUser || hideMeta ? '' : siteReadMore()}
    ${isUser ? `<div class="wb-profile-stats">
      ${stats}
    </div>` : ''}
    ${act ? `<div class="wb-profile-act">${act}</div>` : ''}
    ${isUser ? '' : siteContact(options)}
    ${extraHtml}
  </div>`;
}

/**
 * 分类链接（左栏导航与列表页分类 Tab 共用）：activeSlug 命中时高亮，
 * prefix 供左栏导航加「#」前缀，indent 由调用方决定缩进。
 */
function categoryLinks(categories = [], activeSlug = '', indent = '\n    ', prefix = '') {
  return (categories || [])
    .map((c) => `<a href="${e(slugHref('/category', c.slug))}"${activeSlug === c.slug ? ' class="on"' : ''}>${prefix}${e(c.name)}</a>`)
    .join(indent);
}

function navCard(options, session, categories = [], activeSlug = '', active = '') {
  // 首页只在当前确实是首页时点亮（active === 'home'）：原先用「未处于某个分类页」反推，
  // 会让详情页 / 标签页 / 搜索页（这些页面 activeSlug 恒为空）全部误点亮「首页」，与顶栏判定矛盾
  const items = [`<a href="/"${active === 'home' ? ' class="on"' : ''}>🏠 首页</a>`];
  if (session) {
    items.push(`<a href="/write/mine">📝 我的文章</a>`);
  }
  const cats = categoryLinks(categories, activeSlug, '\n    ', '# ');
  return `<div class="wb-card wb-nav">
    ${items.join('\n    ')}
    ${cats ? `<div class="wb-nav-title">我的分类</div>\n    ${cats}` : ''}
  </div>`;
}

/* ---------------- 右栏：话题 / 评论 / 友链 ---------------- */

/**
 * 友链条目条目（右栏「左邻右舍」与 /links 页面共用，避免两处各写一遍 HTML）。
 * 地址经 safeUrl 白名单、文本经 escapeHtml，与其它前台输出保持同一安全口径。
 */
export function linkItems(links = [], indent = '\n    ') {
  return (links || [])
    .map((l) => {
      const url = safeUrl(l.url);
      const image = safeUrl(l.image);
      // 地址为空时不生成 <a href="">（点击会回到当前页），图片为空时也不渲染 <img src="">（会多请求一次当前页）
      const link = (inner) => (url ? `<a href="${e(url)}" target="_blank" rel="noopener noreferrer">${inner}</a>` : inner);
      return `<div class="wb-link-item">
      ${image ? link(`<img src="${e(image)}" alt="${e(l.name)}" loading="lazy" decoding="async">`) : ''}
      <div>
        <div class="ln">${link(e(l.name))}</div>
        <div class="ld">${e(l.description)}</div>
      </div>
    </div>`;
    })
    .join(indent);
}

function rightColumn(options, links = [], hotComments = [], topics = []) {
  const topicHtml =
    optionOn(options, 'topicOpen') && topics.length
      ? `<div class="wb-card wb-widget">
    <div class="wb-widget-title">热门话题<span class="more">话题榜</span></div>
    <div class="wb-topic-list">
      ${topics
        .map(
          (t) => `<a href="${e(slugHref('/tag', t.slug))}"><span>#${e(t.name)}#</span><span class="n">${t.c}</span></a>`
        )
        .join('\n      ')}
    </div>
  </div>`
      : '';

  const commentHtml = hotComments.length
    ? `<div class="wb-card wb-widget">
    <div class="wb-widget-title">他们抢着跟我说这些</div>
    ${hotComments
      .map(
        (c) => `<div class="wb-cmt">
      <img src="${e(avatarFor({ mail: c.mail }, 60))}" alt="${e(c.author)}" loading="lazy" decoding="async">
      <div>
        <div class="cn">${e(c.author)}</div>
        <div class="ct"><a href="${e(frontUrl(c))}">${e(excerpt(c.content, 24))}</a></div>
      </div>
    </div>`
      )
      .join('\n    ')}
  </div>`
    : '';

  const linkHtml =
    optionOn(options, 'friendLinkOpen') && links.length
      ? `<div class="wb-card wb-widget">
    <div class="wb-widget-title">左邻右舍</div>
    ${linkItems(links)}
  </div>`
      : '';

  return `<aside class="wb-right">
    ${topicHtml}
    ${commentHtml}
    ${linkHtml}
  </aside>`;
}

/* ---------------- 页脚 ---------------- */

export function footer(options) {
  const year = new Date().getFullYear();
  return `<footer class="wb-footer">
  Copyright &copy; ${year} ${e(options.title)}. Powered by
  <a href="https://workers.cloudflare.com" target="_blank" rel="noopener noreferrer">Cloudflare Workers</a>.
  Theme By <a href="https://weibo.com" target="_blank" rel="noopener noreferrer">Weibo</a>. ${options.myFooter || ''}
</footer>
${options.optionFooter || ''}
</body>
</html>`;
}

/** 页面骨架：顶栏 + 三栏 + 页脚 */
export function shell({ options, session, pageTitle, active = '', center, categories = [], profile = {}, topics = [], hotComments = [], links = [], nav = [], activeSlug = '', focus = false, publisher = false }) {
  const bodyStyle = bodyStyleOf(options);
  if (focus) {
    return `${head(options, pageTitle, '', bodyStyle, true, publisher)}
${topbar(options, session, active, nav)}
<div class="wb-container wb-container-focus">
  <main class="wb-center">
    ${center}
  </main>
</div>
${footer(options)}`;
  }
  return `${head(options, pageTitle, '', bodyStyle, true, publisher)}
${topbar(options, session, active, nav)}
<div class="wb-container">
  <aside class="wb-left">
    ${profileCard(options, profile, session)}
    ${navCard(options, session, categories, activeSlug, active)}
  </aside>
  <main class="wb-center">
    ${center}
  </main>
  ${rightColumn(options, links, hotComments, topics)}
</div>
${footer(options)}`;
}
