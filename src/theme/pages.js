import { escapeHtml as e, fmtDate, excerpt, avatarFor, safeUrl, frontUrl, slugHref, pager, badgeHtml, honorHtml, TITLE_MAX_LENGTH, CONTENT_MAX_LENGTH, SCREENNAME_MAX_LENGTH, PASSWORD_MIN_LENGTH, statusPill, optionOn, UNCATEGORIZED_NAME } from '../lib.js';
import { shell, profileCard } from './layout.js';
import { postCards, postActions, commentBlock, bodyOf, topicLinks } from './feed.js';
import { pubBody, PUB_SCRIPT, pubIcon } from './editor.js';

/**
 * 徽章区（两个图标位）：位 1 为等级徽章，图标集随用户所属用户组切换，同一时刻只占一个图标位；
 * 位 2 为荣誉图标（Gif / Png）。任一为空则不渲染该位。
 */
const badgeSlots = (badge, honor) => `${badgeHtml(badge)}${honorHtml(honor)}`;

/**
 * 分类链接（左栏导航与列表页分类 Tab 共用）：activeSlug 命中时高亮，
 * prefix 供左栏导航加「#」前缀，indent 由调用方决定缩进。
 */
function categoryLinks(categories = [], activeSlug = '', indent = '\n    ', prefix = '') {
  return (categories || [])
    .map((c) => `<a href="${e(slugHref('/category', c.slug))}"${activeSlug === c.slug ? ' class="on"' : ''}>${prefix}${e(c.name)}</a>`)
    .join(indent);
}

/* ---------------- 列表页（首页 / 分类 / 标签 / 搜索） ---------------- */

function categoryTabs(categories, activeSlug) {
  return `<a href="/"${activeSlug ? '' : ' class="on"'}>全部</a>
        ${categoryLinks(categories, activeSlug, '\n        ')}`;
}

export function listPage({
  options,
  session,
  pageTitle,
  posts,
  categories,
  hotComments,
  links,
  nav = [],
  topics = [],
  profile = {},
  page,
  totalPages,
  baseUrl,
  feedEndpoint = '',
  activeSlug,
  breadcrumb,
  headingTitle,
  active = 'home',
  notice = '',
  noticeType = 'ok',
}) {
  // 微博式发布框：可输入 + 真实投稿（结构与样式对齐 weibo.com 首页 ._box_vkpry_2）
  const pubTimer =
    optionOn(options, 'frontPublishTimer')
      ? `<button type="button" class="wb-pub-timer" data-act="timer" title="定时微博">${pubIcon('timer')}</button>`
      : '';
  const pubScope =
    optionOn(options, 'frontPublishScope')
      ? `<button type="button" class="wb-pub-limits" data-act="scope" title="可见范围"><span class="wb-pub-open">公开</span><i class="wb-pub-caret"></i></button>`
      : '';
  const publishBox =
    session && optionOn(options, 'frontPublish')
      ? `<form class="wb-card wb-publish" method="post" action="/publish" data-pub>
    ${pubBody({
      statement: optionOn(options, 'frontPublishStatement'),
      showWriteLink: true,
      required: true,
      barExtra: `${pubTimer}
      ${pubScope}
      <button type="submit" class="wb-pub-send">发送</button>`,
    })}
    <input type="hidden" name="visibility" value="public" data-visibility>
    <input type="hidden" name="scheduled_at" value="" data-scheduled>
    <input type="hidden" name="statement" value="" data-statement>
    <div class="wb-pub-panel" data-panel hidden></div>
  </form>
  ${PUB_SCRIPT}`
      : '';
  const headingBar = `<div class="wb-card wb-heading">
    <div class="tabs">${headingTitle ? `<a class="on">${e(headingTitle)}</a>` : categoryTabs(categories, activeSlug)}</div>
  </div>`;
  const crumb = breadcrumb ? `<div class="wb-card wb-breadcrumb">${breadcrumb}</div>` : '';
  const noticeBar = notice ? `<div class="wb-card wb-notice ${noticeType === 'err' ? 'err' : 'ok'}">${e(notice)}</div>` : '';
  // data-feed 指向 AJAX 翻页接口；链接本身仍是普通分页地址，脚本不可用时照常整页跳转
  const feedBlock = `<div class="wb-feed-block"${feedEndpoint ? ` data-feed="${e(feedEndpoint)}"` : ''}>
  <div class="wb-feed" data-soft="feed">${postCards(posts, options, session)}</div>
  ${pager({ base: baseUrl, page, totalPages })}
  </div>`;

  const center = `${publishBox}
  ${noticeBar}
  ${crumb}
  ${headingBar}
  ${feedBlock}`;

  return shell({
    options,
    session,
    pageTitle,
    active,
    center,
    categories,
    profile,
    topics,
    hotComments,
    links,
    nav,
    activeSlug,
  });
}

/* ---------------- 文章详情 ---------------- */

export function singlePage({ options, session, pageTitle, post, comments, categories, hotComments, links, nav = [], topics = [], profile = {}, breadcrumb, notice = '', noticeType = 'ok', active = 'archives' }) {
  const topicsHtml = topicLinks(post.tags);
  const category = post.category_name
    ? `<a href="${e(slugHref('/category', post.category_slug))}">${e(post.category_name)}</a>`
    : UNCATEGORIZED_NAME;
  // 友情链接等由服务端即时拼出的伪页面没有 pid，不渲染作者 / 分类 / 评论数 / 浏览量等真实文章才有的元信息
  const meta = post.pid
    ? `<div class="wb-article-meta">
      <span>${e(post.screenname || options.yourNickname)}${badgeSlots(post.author_badge, post.author_honor)}</span>
      <span>发布于 ${fmtDate(post.created)}</span>
      <span>${category}</span>
      <span>${comments.length} 条评论</span>
      <span>${post.views || 0} 次浏览</span>
    </div>`
    : '';
  const center = `<div class="wb-card wb-breadcrumb">${breadcrumb || `<a href="/">首页</a>`}</div>
  <article class="wb-card wb-article" data-soft="article">
    <h1>${e(post.title)}${post.is_top ? '<span class="wb-top-tag">置顶</span>' : ''}</h1>
    ${meta}
    ${notice ? `<div class="wb-form ${noticeType === 'err' ? 'err' : 'ok'}">${e(notice)}</div>` : ''}
    <div class="entry-content">${bodyOf(post)}</div>
    ${topicsHtml ? `<div class="wb-topics" style="margin-top:14px;">${topicsHtml}</div>` : ''}
    ${post.pid ? postActions(post, options, session) : ''}
  </article>
  ${post.allow_comment || comments.length ? commentBlock(comments, post, options, session) : ''}`;

  return shell({
    options,
    session,
    pageTitle,
    active,
    center,
    categories,
    profile,
    topics,
    hotComments,
    links,
    nav,
  });
}

/* ---------------- 转发页 ---------------- */

export function repostPage({ options, session, pageTitle, post, source, error = '', categories = [], hotComments, links, nav = [], topics = [], profile = {} }) {
  const src = source || {};
  const center = `<div class="wb-card wb-breadcrumb" data-soft="repost-crumb"><a href="/">首页</a> &raquo; <a href="${e(frontUrl(post))}">${e(post.title)}</a>${post.is_top ? '<span class="wb-top-tag">置顶</span>' : ''} &raquo; 转发</div>
  <div class="wb-card wb-form wb-form-wide" data-soft="repost">
    <h1>转发微博</h1>
    <div class="tip">转发 @${e(src.screenname || options.yourNickname)} 的微博</div>
    ${error ? `<div class="err">${e(error)}</div>` : ''}
    <form method="post" action="/repost">
      <input type="hidden" name="pid" value="${post.pid}">
      <div class="field">
        <textarea name="content" placeholder="说点什么吧…（选填）" style="min-height:90px"></textarea>
      </div>
      <div class="wb-card" style="padding:12px;background:#f7f7f7;">
        <div style="font-size:13px;color:#eb7350;font-weight:600;">@${e(src.screenname || options.yourNickname)}${src.is_top ? '<span class="wb-top-tag">置顶</span>' : ''}</div>
        <div style="font-size:13px;color:#808080;margin-top:4px;">${e(excerpt(src.content, 100))}</div>
      </div>
      <div class="submit" style="display:flex;justify-content:flex-end;gap:10px;margin-top:14px;">
        <a class="wb-btn plain" href="${e(frontUrl(post))}">取消</a>
        <button type="submit" class="wb-btn p">转发</button>
      </div>
    </form>
  </div>`;
  return shell({ options, session, pageTitle, active: 'archives', center, categories, profile, topics, hotComments, links, nav });
}

/* ---------------- 登录 / 注册 / 提示页 ---------------- */

export function authPage({ options, session, pageTitle, mode, error = '', notice = '', review = false, nav = [] }) {
  const isRegister = mode === 'register';
  const tip = isRegister
    ? review
      ? '提交后需管理员审核，通过后才能登录'
      : '注册后即可参与评论与互动'
    : '登录后可使用评论、点赞、转发与投稿功能';
  const center = `<div class="wb-login">
  <div class="wb-card wb-form wb-login-box">
    <h1>${isRegister ? '注册账号' : '登录'}</h1>
    <div class="tip">${tip}</div>
    ${notice ? `<div class="wb-notice ok">${e(notice)}</div>` : ''}
    ${error ? `<div class="err">${e(error)}</div>` : ''}
    <form method="post" action="${isRegister ? '/register' : '/login'}">
      <div class="field"><input type="text" name="userName" placeholder="用户名" autocomplete="off" required></div>
      ${isRegister ? `<div class="field"><input type="text" name="screenname" maxlength="${SCREENNAME_MAX_LENGTH}" placeholder="昵称（选填，不可与他人重复）"></div>` : ''}
      <div class="field"><input type="password" name="password" placeholder="密码" required></div>
      ${isRegister ? `<div class="field"><input type="email" name="mail" placeholder="邮箱（选填，用于头像）"></div>` : ''}
      <button type="submit" class="wb-btn p" style="width:100%;padding:9px;">${isRegister ? '注册' : '登录'}</button>
    </form>
    <p style="margin-top:14px;font-size:13px;">
      <a href="${isRegister ? '/login.html' : '/register.html'}">${isRegister ? '已有账号？去登录' : '没有账号？去注册'}</a>
      <span style="color:#ddd;"> | </span><a href="/">返回首页</a>
    </p>
  </div>
</div>`;
  return shell({ options, session, pageTitle, active: 'auth', center, nav, focus: true });
}

export function messagePage({ options, session, pageTitle, message, nav = [] }) {
  const center = `<div class="wb-login">
  <div class="wb-card wb-form wb-login-box">
    <h1>${e(pageTitle)}</h1>
    <div class="tip">${e(message)}</div>
    <a class="wb-btn p" href="/">返回首页</a>
  </div>
</div>`;
  return shell({ options, session, pageTitle, active: 'message', center, nav, focus: true });
}

/* ---------------- 前台投稿：写文章 / 我的文章 ---------------- */

export function writePage({ options, session, pageTitle, mode, post, categories, tags = [], error = '', review = false, hotComments, links, nav = [], topics = [], profile = {} }) {
  const isEdit = mode === 'edit';
  // 是否需审核由路由用 reviewRequired 判定后传入；渲染侧不再自行回退，
  // 否则既会漏掉 skip_review 用户组，也会与保存时的判定产生口径漂移
  const needReview = !!review;
  const center = `<div class="wb-card wb-breadcrumb"><a href="/">首页</a> &raquo; <a href="/write/mine">我的文章</a> &raquo; ${isEdit ? '编辑文章' : '写文章'}</div>
  <div class="wb-card wb-form wb-form-wide">
    <h1>${isEdit ? '编辑文章' : '写文章'}</h1>
    <div class="tip">${needReview ? '提交后需管理员审核，通过后才会显示在首页。' : '提交后将直接发布到首页。'}</div>
    ${error ? `<div class="err">${e(error)}</div>` : ''}
    <form method="post" action="/write/save" data-pub>
      <input type="hidden" name="pid" value="${post ? post.pid : 0}">
      <div class="field"><input type="text" name="title" maxlength="${TITLE_MAX_LENGTH}" placeholder="标题" required value="${e(post ? post.title : '')}"></div>
      <div class="field" style="display:flex;gap:10px;flex-wrap:wrap;">
        <select name="category_id" style="flex:1;min-width:150px;">
          <option value="0">${UNCATEGORIZED_NAME}</option>
          ${categories
            .map(
              (c) => `<option value="${c.cid}" ${post && post.category_id === c.cid ? 'selected' : ''}>${e(c.name)}</option>`
            )
            .join('')}
        </select>
        <input type="text" name="tags" placeholder="话题 / 标签（英文逗号分隔）" value="${e(tags.join(','))}" style="flex:2;min-width:200px;">
      </div>
      ${
        optionOn(options, 'frontPublishScope')
          ? `<div class="field"><label>可见范围</label>
        <select name="visibility">
          <option value="public" ${post && post.status === 'private' ? '' : 'selected'}>公开（所有人可见）</option>
          <option value="private" ${post && post.status === 'private' ? 'selected' : ''}>私密（仅自己可见）</option>
        </select>
      </div>`
          : ''
      }
      <div class="field wb-pub-block">
        ${pubBody({
          statement: optionOn(options, 'frontPublishStatement'),
          showWriteLink: false,
          value: post ? post.content : '',
          placeholder: '正文（支持 HTML）',
          maxlength: CONTENT_MAX_LENGTH,
          required: true,
        })}
        <input type="hidden" name="statement" value="${e(post && post.statement ? post.statement : '')}" data-statement>
        <div class="wb-pub-panel" data-panel hidden></div>
      </div>
      <div style="display:flex;gap:10px;">
        <button type="submit" class="wb-btn p">${needReview ? '提交审核' : '发布'}</button>
        <a class="wb-btn plain" href="/write/mine">返回我的文章</a>
      </div>
    </form>
    ${PUB_SCRIPT}
  </div>`;
  return shell({ options, session, pageTitle, active: 'write', center, categories, profile, topics, hotComments, links, nav });
}

export function myPostsPage({ options, session, pageTitle, posts, categories = [], hotComments, links, nav = [], topics = [], profile = {}, notice = '' }) {
  const rows = posts.length
    ? posts
        .map(
          (p) => `<tr>
        <td><a href="${e(frontUrl(p))}">${e(p.title)}</a>${p.is_top ? '<span class="wb-top-tag">置顶</span>' : ''}
          <div style="color:#9aa1ab;font-size:12px;">${fmtDate(p.created)} · ${e(p.category_name || UNCATEGORIZED_NAME)} · ${p.comments_num} 评论 · ${p.views || 0} 浏览</div></td>
        <td style="width:80px;">${statusPill(p.status)}</td>
        <td style="width:130px;white-space:nowrap;">
          <a href="/write/edit?id=${p.pid}">编辑</a>
          <form method="post" action="/write/delete" data-title="${e(p.title)}" style="display:inline;margin-left:8px;" onsubmit="return confirm('确定删除《' + this.dataset.title + '》吗？');">
            <input type="hidden" name="pid" value="${p.pid}">
            <button type="submit" style="border:0;background:none;color:#d93025;cursor:pointer;padding:0;font:inherit;">删除</button>
          </form>
        </td>
      </tr>`
        )
        .join('\n      ')
    : `<tr><td colspan="3" style="color:#9aa1ab;">你还没有发表过文章。</td></tr>`;
  const center = `<div class="wb-card wb-breadcrumb"><a href="/">首页</a> &raquo; 我的文章</div>
  <div class="wb-card wb-form wb-form-wide" data-soft="mine">
    <h1>我的文章</h1>
    <div class="tip">共 ${posts.length} 篇 · <a href="/write">写文章</a></div>
    ${notice ? `<div class="ok">${e(notice)}</div>` : ''}
    <table class="wb-table"><tbody>${rows}</tbody></table>
  </div>`;
  return shell({ options, session, pageTitle, active: 'mine', center, categories, profile, topics, hotComments, links, nav });
}

/* ---------------- 前台个人设置（登录用户，仅可修改本人资料） ---------------- */

export function settingsPage({
  options,
  session,
  pageTitle,
  error = '',
  notice = '',
  categories = [],
  hotComments,
  links,
  nav = [],
  topics = [],
  profile = {},
}) {
  const center = `<div class="wb-card wb-breadcrumb"><a href="/">首页</a> &raquo; 个人设置</div>
  <div class="wb-card wb-form wb-form-wide">
    <h1>个人设置</h1>
    <div class="tip">修改你的昵称、头像、个人主页与登录密码；用户名与角色由管理员统一管理。</div>
    ${notice ? `<div class="ok">${e(notice)}</div>` : ''}
    ${error ? `<div class="err">${e(error)}</div>` : ''}
    <form method="post" action="/settings">
      <div class="cols">
        <div class="field"><label>用户名</label><input type="text" value="${e(session.username)}" disabled><div class="hint">用户名不可修改</div></div>
        <div class="field"><label>昵称</label><input type="text" name="screenname" maxlength="${SCREENNAME_MAX_LENGTH}" value="${e(session.screenname || '')}" required></div>
      </div>
      <div class="cols">
        <div class="field"><label>邮箱（用于在 <a href="https://cravatar.com/" target="_blank" rel="noopener noreferrer">cravatar.com</a> 生成头像）</label><input type="email" name="mail" value="${e(session.mail || '')}"></div>
        <div class="field"><label>个人主页</label><input type="text" name="url" value="${e(session.url || '')}"></div>
      </div>
      <div class="field"><label>头像地址（留空则使用邮箱头像）</label><input type="text" name="headpic" value="${e(session.headpic || '')}"></div>
      <div class="wb-set-preview">
        <img src="${e(avatarFor(session, 100))}" alt="当前头像" loading="lazy" decoding="async">
        <span class="muted">当前头像</span>
      </div>
      <h2>修改密码</h2>
      <div class="cols">
        <div class="field"><label>当前密码</label><input type="password" name="oldpassword" autocomplete="current-password" placeholder="不修改密码可留空"></div>
        <div class="field"><label>新密码</label><input type="password" name="password" autocomplete="new-password" placeholder="至少 ${PASSWORD_MIN_LENGTH} 位"></div>
      </div>
      <div class="field"><label>确认新密码</label><input type="password" name="password2" autocomplete="new-password"></div>
      <div class="inline" style="margin-top:16px">
        <button class="wb-btn p" type="submit">保存</button>
        <a class="wb-btn plain" href="/">返回首页</a>
        ${session.role === 'administrator' ? '<a class="wb-btn plain" href="/admin">进入后台</a>' : ''}
      </div>
    </form>
  </div>`;
  return shell({ options, session, pageTitle, active: 'settings', center, categories, profile, topics, hotComments, links, nav });
}

/* ---------------- 站点信息页（无内置入口，如需访问请在后台「导航管理」添加链接） ---------------- */

/**
 * 站点信息页：复用左栏站点资料卡（封面 / 头像 / 站点地址 / 按钮菜单，隐藏昵称、简介等信息文字），
 * 并列出「站点设置 → 基础信息」的字段明细。
 */
export function sitePage({
  options,
  session,
  pageTitle,
  categories = [],
  hotComments,
  links,
  nav = [],
  topics = [],
  profile = {},
}) {
  // 站点资料卡：始终使用站点分支的数据（与未登录时的左栏卡片一致）
  const siteProfile = {
    mode: 'site',
    name: options.yourNickname || options.title,
    avatar: options.headImgUrl || options.faviconUrl || '',
    desc: options.yourDescription || options.description,
  };

  const site = safeUrl(options.siteUrl);
  const empty = '<span class="muted">未设置</span>';
  const rows = [
    ['站点名称', e(options.title) || empty],
    ['站点简介', e(options.description) || empty],
    ['关键词', e(options.keywords) || empty],
    ['站点地址', site ? `<a href="${e(site)}" target="_blank" rel="noopener noreferrer">${e(site)}</a>` : empty],
    ['每页文章数', e(options.pageSize) || empty],
  ]
    .map(([label, value]) => `<tr><td class="muted" style="width:110px">${label}</td><td>${value}</td></tr>`)
    .join('\n        ');

  // 「站点信息」明细块：并入资料卡内部（作为卡片最后一个子区块），故取消外边距并左对齐文字
  const infoBlock = `<div class="wb-card wb-widget">
      <div class="wb-widget-title">站点信息<span class="more">基础信息</span></div>
      <div style="padding:0 14px 14px">
        <table class="wb-table"><tbody>
          ${rows}
        </tbody></table>
      </div>
    </div>`;

  const center = `<div class="wb-card wb-breadcrumb"><a href="/">首页</a> &raquo; 站点信息</div>
  ${profileCard(options, siteProfile, session, true, infoBlock)}`;
  return shell({ options, session, pageTitle, active: 'site', center, categories, profile, topics, hotComments, links, nav });
}

/* ---------------- 前台审核中心（按用户组权限开放） ---------------- */

/**
 * 审核中心：列出待审核的前台投稿与评论。
 * canEdit（用户组勾选「可编辑」）为真时渲染可修改的标题 / 正文与「保存并通过」按钮；
 * 否则只展示内容摘要，仅能通过 / 驳回 / 删除。
 */
export function reviewPage({
  options,
  session,
  pageTitle,
  posts = [],
  comments = [],
  postPage = 1,
  postPages = 1,
  postTotal = null,
  commentPage = 1,
  commentPages = 1,
  commentTotal = null,
  canEdit = false,
  categories = [],
  hotComments,
  links,
  nav = [],
  topics = [],
  profile = {},
  notice = '',
  error = '',
}) {
  const boxStyle = 'border:1px solid var(--wb-line);border-radius:8px;padding:12px 14px;margin-bottom:12px';
  // 两个列表各自分页：翻投稿保留评论页码，翻评论保留投稿页码
  const pagerOf = (which, page, totalPages, total) => {
    if (totalPages <= 1) return '';
    const link = (p) =>
      e(`/review?pp=${which === 'post' ? p : postPage}&cp=${which === 'comment' ? p : commentPage}`);
    const parts = [`<span class="muted">共 ${total} 条</span>`];
    if (page > 1) parts.push(`<a class="wb-btn plain sm" href="${link(page - 1)}">上一页</a>`);
    parts.push(`<span class="muted">第 ${page} / ${totalPages} 页</span>`);
    if (page < totalPages) parts.push(`<a class="wb-btn plain sm" href="${link(page + 1)}">下一页</a>`);
    return `<div class="wb-pager" style="margin:10px 0">${parts.join(' ')}</div>`;
  };
  const preview = (text) =>
    `<div style="color:#5b6472;font-size:13px;margin:8px 0;white-space:pre-wrap;word-break:break-word">${e(excerpt(text, 200))}</div>`;

  const postItems = posts.length
    ? posts
        .map(
          (p) => `<form method="post" action="/review/post" style="${boxStyle}">
      <input type="hidden" name="pid" value="${p.pid}">
      <div class="inline" style="justify-content:space-between">
        <b>${e(p.title)}</b>
        <span class="muted">${e(p.screenname || p.username || '未知作者')} · ${fmtDate(p.created)}</span>
      </div>
      ${
        canEdit
          ? `<div class="field" style="margin-top:10px"><label>标题</label><input type="text" name="title" maxlength="${TITLE_MAX_LENGTH}" value="${e(p.title)}"></div>
      <div class="field"><label>正文</label><textarea name="content">${e(p.content)}</textarea></div>`
          : preview(p.content)
      }
      <div class="inline">
        <button class="wb-btn p sm" type="submit" name="action" value="approve">通过</button>
        ${canEdit ? '<button class="wb-btn sm" type="submit" name="action" value="save">保存并通过</button>' : ''}
        <button class="wb-btn plain sm" type="submit" name="action" value="reject">驳回</button>
        <button class="wb-btn d sm" type="submit" name="action" value="delete" onclick="return confirm('确定删除这篇投稿吗？');">删除</button>
        <a class="wb-btn plain sm" href="${e(frontUrl(p))}" target="_blank" rel="noopener">查看</a>
      </div>
    </form>`
        )
        .join('\n    ')
    : '<div class="muted">暂无待审核投稿。</div>';

  const commentItems = comments.length
    ? comments
        .map((c) => {
          const href = frontUrl(c);
          return `<form method="post" action="/review/comment" style="${boxStyle}">
      <input type="hidden" name="coid" value="${c.coid}">
      <div class="inline" style="justify-content:space-between">
        <b>${e(c.author)}</b>
        <span class="muted">${fmtDate(c.created)} · ${
          c.post_title ? `<a href="${e(href)}">${e(c.post_title)}</a>` : '内容已删除'
        }</span>
      </div>
      ${
        canEdit
          ? `<div class="field" style="margin-top:10px"><label>评论内容</label><textarea name="content" style="min-height:80px">${e(c.content)}</textarea></div>`
          : preview(c.content)
      }
      <div class="inline">
        <button class="wb-btn p sm" type="submit" name="action" value="approve">通过</button>
        ${canEdit ? '<button class="wb-btn sm" type="submit" name="action" value="save">保存并通过</button>' : ''}
        <button class="wb-btn d sm" type="submit" name="action" value="delete" onclick="return confirm('确定删除这条评论吗？');">删除</button>
      </div>
    </form>`;
        })
        .join('\n    ')
    : '<div class="muted">暂无待审核评论。</div>';

  const center = `<div class="wb-card wb-breadcrumb"><a href="/">首页</a> &raquo; 审核中心</div>
  <div class="wb-card wb-form wb-form-wide">
    <h1>审核中心</h1>
    <div class="tip">待审核投稿 ${postTotal ?? posts.length} 篇 · 待审核评论 ${commentTotal ?? comments.length} 条${canEdit ? ' · 你可以修改内容后再通过' : ''}</div>
    ${notice ? `<div class="ok">${e(notice)}</div>` : ''}
    ${error ? `<div class="err">${e(error)}</div>` : ''}
    <h2>待审核投稿</h2>
    ${postItems}
    ${pagerOf('post', postPage, postPages, postTotal ?? posts.length)}
    <h2>待审核评论</h2>
    ${commentItems}
    ${pagerOf('comment', commentPage, commentPages, commentTotal ?? comments.length)}
  </div>`;
  return shell({ options, session, pageTitle, active: 'review', center, categories, profile, topics, hotComments, links, nav });
}
