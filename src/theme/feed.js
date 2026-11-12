import { escapeHtml as e, fmtDate, excerpt, firstImage, avatarFor, safeUrl, stripTags, frontUrl, slugHref, badgeHtml, honorHtml, COMMENT_MAX_LENGTH, optionOn } from '../lib.js';

/**
 * 徽章区（两个图标位）：位 1 为等级徽章，图标集随用户所属用户组切换，同一时刻只占一个图标位；
 * 位 2 为荣誉图标（Gif / Png）。任一为空则不渲染该位。
 */
const badgeSlots = (badge, honor) => `${badgeHtml(badge)}${honorHtml(honor)}`;

/* ---------------- 互动按钮 ---------------- */

/** 未登录时的互动入口：跳登录页并带回对应提示 */
const guestAct = (message, inner) =>
  `<a class="wb-act" href="/login.html?err=${encodeURIComponent(message)}">${inner}</a>`;

/** 点赞按钮：仅当开关开启时渲染 */
function likeAction(post, options, session) {
  if (!optionOn(options, 'likeOpen')) return '';
  const count = post.likes_num || 0;
  if (!session) {
    return guestAct('请先登录后再点赞', `👍 赞 ${count}`);
  }
  return `<form class="wb-act-form" method="post" action="/like">
        <input type="hidden" name="pid" value="${post.pid}">
        <button type="submit" class="wb-act${post.liked ? ' on' : ''}">👍 ${post.liked ? '已赞' : '赞'} ${count}</button>
      </form>`;
}

/** 转发按钮：仅当开关开启时渲染 */
function repostAction(post, options, session) {
  if (!optionOn(options, 'repostOpen')) return '';
  const count = post.reposts_num || 0;
  if (!session) {
    return guestAct('请先登录后再转发', `🔄 转发 ${count}`);
  }
  return `<a class="wb-act" href="/repost.html?pid=${post.pid}">🔄 转发 ${count}</a>`;
}

/** 关注按钮：仅当开关开启时渲染；本人文章不显示 */
function followAction(post, options, session) {
  if (!optionOn(options, 'followOpen')) return '';
  if (!post.author_id || (session && session.userid === post.author_id)) return '';
  if (!session) {
    return guestAct('请先登录后再关注', '+ 关注');
  }
  return `<form class="wb-act-form" method="post" action="/follow">
        <input type="hidden" name="target_id" value="${post.author_id}">
        <button type="submit" class="wb-act${post.followed ? ' on' : ''}">${post.followed ? '已关注' : '+ 关注'}</button>
      </form>`;
}

export function postActions(post, options, session) {
  // 独立页面走 /page/{slug}，文章走 /archives/{pid}；slug 由作者填写，拼入 href 前必须转义
  const permalink = e(frontUrl(post));
  return `<div class="wb-post-actions">
      ${post.is_page ? '' : followAction(post, options, session)}
      ${post.is_page ? '' : repostAction(post, options, session)}
      <a class="wb-act" href="${permalink}">💬 评论 ${post.comments_num || 0}</a>
      ${likeAction(post, options, session)}
    </div>`;
}

/* ---------------- 信息流卡片 ---------------- */

/**
 * 还原 escapeHtml 产生的实体。单趟匹配（而非逐个 replace）：
 * 逐个替换时 &amp;lt; 会先被还原成 &lt; 再被当成标签实体二次解码，结果与原文不符。
 */
function unescapeHtml(str) {
  const map = { amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'" };
  return String(str ?? '').replace(/&(amp|lt|gt|quot|#39);/g, (_m, name) => map[name]);
}

/**
 * 短微博正文：默认转义，仅放行发布框生成的 img / video 标签。
 * 还原出来的地址再过一遍 safeUrl：非 http(s) / 站内的地址（javascript:、data: 等）直接丢掉整个标签。
 */
function shortBody(content) {
  const media = (tag, attr) => (_m, raw) => {
    // raw 取自 e() 之后的字符串（& 已变成 &amp;），必须先还原实体再进白名单，
    // 否则出口的 e(src) 会把 & 二次转义成 &amp;amp;，含参数的图片 / 视频地址全部失效
    const src = safeUrl(unescapeHtml(raw));
    return src ? `<${tag} src="${e(src)}"${attr}>` : '';
  };
  return e(String(content || ''))
    .replace(/&lt;img src=&quot;(.*?)&quot; alt=&quot;&quot;&gt;/g, media('img', ' alt=""'))
    .replace(/&lt;video src=&quot;(.*?)&quot; controls&gt;&lt;\/video&gt;/g, media('video', ' controls'))
    .replace(/\n/g, '<br>');
}

/** 正文里的媒体标签：与 shortBody 的放行范围一致，只认发布框生成的 img / video */
const MEDIA_TAG_RE = /<img\s[^>]*>|<video\s[^>]*>[^<]*<\/video>/gi;
const MEDIA_SLOT = '\u0001';

/**
 * 短微博卡片正文截断：按可见文字截到 len 字，但正文里的 img / video 按原位置保留，
 * 避免超过 len 字的微博在卡片上丢掉配图（与不足 len 字时直接用原文的分支保持一致）。
 * 媒体先换成单字符占位再统一剥标签，因此截断点若落在某个媒体上，该媒体随之丢弃。
 */
function truncateKeepingMedia(content, len) {
  const media = [];
  const masked = String(content ?? '').replace(MEDIA_TAG_RE, (tag) => {
    media.push(tag);
    return MEDIA_SLOT;
  });
  const text = stripTags(masked);
  if (text.length <= len) return content;
  let i = 0;
  return text.slice(0, len).replaceAll(MEDIA_SLOT, () => media[i++]);
}

/**
 * 详情页正文：管理员文章按后台约定支持 HTML，直接输出；
 * 普通用户投稿视为不可信内容，与信息流卡片一致地转义，仅放行 img / video，避免存储型 XSS。
 */
export function bodyOf(post) {
  return post && post.author_role === 'administrator' ? post.content : shortBody(post && post.content);
}

/** 文章标签渲染成 #话题# 链接（信息流卡片与详情页共用，避免两处各写一遍） */
export function topicLinks(tags = []) {
  return (tags || []).map((t) => `<a href="${e(slugHref('/tag', t.slug))}">#${e(t.name)}#</a>`).join('');
}

export function postCard(post, options, session, priority = false) {
  const isRepost = !!post.repost_pid;
  const isShort = /^weibo-/.test(post.slug || ''); // 发布框快速发布的微博式短内容
  const src = post.repost_source || null;
  // 详情页地址统一走 frontUrl（独立页面 /page/{slug}，文章 /archives/{pid}），拼进 href 前转义
  const permalink = e(frontUrl(post));
  // 「首页大图」对每条卡片都出图（与原主题 index.php 一致）：微博式短文若正文自带配图，
  // 正文里已经展示过，不再叠加封面；纯文字短文与普通文章一样按设置出随机图 / 指定图
  const cover = isShort && firstImage(post.content) ? '' : coverFor(post, options);
  // 首屏第一张封面通常是 LCP 元素：去掉 lazy 并提高优先级，其余图片继续保持懒加载
  const coverHtml = cover
    ? `<a href="${permalink}"><img class="cover" src="${e(cover)}" alt="${e(post.title)}" width="640" height="360" ${priority ? 'fetchpriority="high"' : 'loading="lazy"'} decoding="async"></a>`
    : '';
  const topics = topicLinks(post.tags);
  const editLink =
    session && session.role === 'administrator'
      ? ` <a href="/admin/posts/edit?id=${post.pid}">编辑</a>`
      : '';

  // 正文按 200 字截断，超出时补「阅读更多」指向文章地址（普通文章卡片与微博式短内容同一规则）；
  // 短微博的截断要连同配图一起保留，所以走 truncateKeepingMedia 而不是剥掉标签的正文文本
  const contentText = stripTags(post.content);
  const hasMore = contentText.length > 200;
  const readMore = hasMore ? ` <a class="wb-readmore" href="${permalink}">阅读更多</a>` : '';
  const mainText = isRepost
    ? `<p>${e(post.content || '转发微博')}</p>`
    : isShort
      ? `<div class="wb-post-body">${shortBody(hasMore ? truncateKeepingMedia(post.content, 200) : post.content)}${readMore}</div>`
      : `<h3 class="wb-post-title">
          <a href="${permalink}">${e(post.title)}</a>
        </h3>
        <a href="${permalink}">${e(excerpt(contentText, 200))}</a>${readMore}`;

  const repostBox = src
    ? `<div class="wb-repost">
        <a class="src-name" href="${e(frontUrl(src))}">@${e(src.screenname || options.yourNickname)}</a>：
        <a href="${e(frontUrl(src))}">${e(src.title)}</a>
        <div class="src-text">${e(excerpt(src.content, 100))}</div>
      </div>`
    : '';
  const statementTag = post.statement ? `<div class="wb-statement">${e(post.statement)}</div>` : '';

  return `<article class="wb-card wb-post">
    <div class="wb-post-row">
      <a class="wb-post-avatar" href="/"><img src="${e(avatarFor({ headpic: post.author_headpic, mail: post.author_mail }, 100))}" alt="${e(post.screenname || options.yourNickname)}" loading="lazy" decoding="async"></a>
      <div class="wb-post-main">
        <div class="wb-post-head">
          <a class="wb-post-name" href="/">${e(post.screenname || options.yourNickname)}</a>
          ${badgeSlots(post.author_badge, post.author_honor)}
          <span class="sep">·</span>
          <time datetime="${e(post.created)}">${fmtDate(post.created)}</time>
          <span class="sep">·</span>
          <span>来自 <a href="/">${e(options.title)}</a>${editLink}</span>
          ${post.is_top ? '<span class="wb-top-tag">置顶</span>' : ''}
        </div>
        <div class="wb-post-text">
          ${mainText}
          ${statementTag}
          ${coverHtml}
        </div>
        ${repostBox}
        ${topics ? `<div class="wb-topics">${topics}</div>` : ''}
      </div>
    </div>
    ${postActions(post, options, session)}
  </article>`;
}

export function commentItem(c, index = 0) {
  // 评论者可填个人主页，只放行 http/https 与站内相对地址，避免 javascript: 之类的伪协议
  const homepage = safeUrl(c.url);
  const author = homepage
    ? `<a href="${e(homepage)}" target="_blank" rel="noopener noreferrer">${e(c.author)}</a>`
    : `${e(c.author)}`;
  return `<div class="wb-comment-item">
    <img src="${e(avatarFor({ mail: c.mail }, 80))}" alt="${e(c.author)}" loading="lazy" decoding="async">
    <div>
      <div class="cc">${e(c.content)}</div>
      <div class="cm">
        ${author}
        <time>${fmtDate(c.created)}</time> #${index + 1}
      </div>
    </div>
  </div>`;
}

export function commentBlock(comments, post, options, session) {
  const rows = comments.map(commentItem).join('\n    ');
  const form = post.allow_comment
    ? `<form class="wb-comment-form" method="post" action="/comment">
      <input type="hidden" name="pid" value="${post.pid}">
      <textarea name="text" maxlength="${COMMENT_MAX_LENGTH}" required placeholder="${e(options.commentCustom1)}"></textarea>
      ${
        session
          ? `<div class="row"><span>已登录 <strong>${e(session.screenname || session.username)}</strong> · <a href="/logout">退出</a></span></div>`
          : `<div class="row">
        <input class="text" type="text" name="author" required placeholder="昵称">
        <input class="text" type="text" name="mail" placeholder="邮箱（选填）">
        <input class="text" type="text" name="url" placeholder="个人主页（选填）">
      </div>`
      }
      <div class="submit"><button type="submit" class="wb-btn p">${e(options.commentCustom2)}</button></div>
    </form>`
    : '';
  return `<div class="wb-card wb-article" style="margin-top:12px;">
    <h3 style="font-size:16px;padding-bottom:10px;border-bottom:1px solid var(--wb-line);margin-bottom:10px;">评论 <span data-comment-count>${comments.length}</span> 条</h3>
    <div data-comment-list>${rows || '<div class="wb-empty" data-comment-empty style="padding:20px 0;">还没有评论，来抢沙发吧～</div>'}</div>
    ${form}
  </div>`;
}

/**
 * 信息流卡片列表：服务端首屏与 AJAX 翻页接口共用同一渲染，避免两处拼 HTML 导致样式分叉。
 */
export function postCards(posts, options, session) {
  return posts.length
    ? posts.map((p, i) => postCard(p, options, session, i === 0)).join('\n  ')
    : '<div class="wb-card wb-empty">还没有内容，去后台或前台写一篇吧～</div>';
}

/* ---------------- 封面图策略（对应主题的首页大图设置） ---------------- */

function coverFor(post, options) {
  const mode = options.ROWINGBOHE ?? '1';
  const random = randomCover(post, options);
  if (mode === '4') return '';
  if (mode === '1') return random;
  // 正文首图与后台填写的指定图都可被正文内容影响，统一过地址白名单后再输出：
  // 否则正文里写 <img src="//evil.example.com/x.png"> 就能让首页卡片对所有访客外联第三方
  const inline = safeUrl(firstImage(post.content));
  const custom = safeUrl(options.ROWINGBOHEUrl);
  if (mode === '3') return custom;
  if (mode === '0') return inline || random;
  if (mode === '2') return inline || custom;
  return random;
}

/**
 * 随机封面改为「按 pid 取模」的稳定选择：同一篇文章每次渲染都用同一张图，
 * 浏览器缓存与边缘缓存才能命中；原来的 Math.random() 会导致每次刷新都换图、
 * 缓存全部失效，冷启动要重新下载整批原图。地址指向 640×360 的 WebP 缩略图。
 */
function randomCover(post, options) {
  const total = Math.max(1, parseInt(options.randomNum, 10) || 5);
  const index = ((Number(post.pid) || 0) % total) + 1;
  return `/images/random/s/${index}.webp`;
}
