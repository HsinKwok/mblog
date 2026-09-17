/**
 * 前台主题模板：复刻 weibo.com 三栏布局
 * 顶栏（logo / 导航 / 搜索 / 发布）+ 左栏（个人卡 / 导航）+ 中栏（信息流）+ 右栏（话题 / 评论 / 友链）
 * 样式资源来自 /style/weibo.css
 */
import { escapeHtml as e, fmtDate, excerpt, firstImage, avatarFor, safeUrl, stripTags, frontUrl, slugHref, pager, SOFT_SYNC, badgeHtml, honorHtml, PUBLISH_STATEMENTS, COMMENT_MAX_LENGTH, WEIBO_MAX_LENGTH, TITLE_MAX_LENGTH, CONTENT_MAX_LENGTH, SCREENNAME_MAX_LENGTH, PASSWORD_MIN_LENGTH, statusPill, optionOn, UNCATEGORIZED_NAME } from './lib.js';

/**
 * 徽章区（两个图标位）：位 1 为等级徽章，图标集随用户所属用户组切换，同一时刻只占一个图标位；
 * 位 2 为荣誉图标（Gif / Png）。任一为空则不渲染该位。
 */
const badgeSlots = (badge, honor) => `${badgeHtml(badge)}${honorHtml(honor)}`;

/* ---------------- 发布框图标（路径取自 weibo.com #woo_svg_nav_*） ---------------- */

const PUB_ICON = {
  emoticon:
    'M511.608 53.301c253.332 0 458.699 205.367 458.699 458.699S764.941 970.699 511.608 970.699 52.909 765.332 52.909 512 258.276 53.301 511.608 53.301zm0 70.569c-214.358 0-388.13 173.772-388.13 388.13s173.772 388.13 388.13 388.13S899.738 726.358 899.738 512s-173.772-388.13-388.13-388.13zM728.8 611.126c17.589 10.026 23.293 31.699 12.739 48.409-55.945 88.579-133.694 134.742-229.932 134.742S337.62 748.114 281.675 659.535c-10.553-16.71-4.85-38.383 12.739-48.409 17.589-10.026 40.403-4.607 50.956 12.102 43.097 68.237 97.404 100.481 166.236 100.481s123.139-32.244 166.236-100.481c10.556-16.71 33.369-22.128 50.958-12.102zM382.232 347.339c32.478 0 58.807 26.329 58.807 58.808 0 32.478-26.329 58.808-58.807 58.808s-58.808-26.329-58.808-58.808 26.329-58.808 58.808-58.808zm235.23 0c32.478 0 58.808 26.329 58.808 58.808 0 32.478-26.329 58.808-58.808 58.808-32.478 0-58.807-26.329-58.807-58.808-.001-32.479 26.328-58.808 58.807-58.808z',
  image:
    'M864.845 88.586c51.966 0 94.092 42.127 94.092 94.092v658.644c0 51.966-42.126 94.092-94.092 94.092h-705.69c-51.966 0-94.092-42.126-94.092-94.092V182.678c0-51.966 42.126-94.092 94.092-94.092h705.69zM330.92 597.153 139.912 788.222a35.635 35.635 0 0 1-4.231 3.618l-.049 49.482c0 12.991 10.532 23.523 23.523 23.523h439.457L330.92 597.153zm329.322-126.271L482.361 648.81l208.814 208.799a35.324 35.324 0 0 1 5.579 7.242l168.091-.006c12.991 0 23.523-10.532 23.523-23.523l.034-150.325a35.124 35.124 0 0 1-17.605-9.566L660.242 470.882zm204.603-311.727h-705.69c-12.991 0-23.523 10.532-23.523 23.523v509.979L306.245 522.09c13.779-13.779 36.12-13.779 49.9 0a35.173 35.173 0 0 1 7.89 12.019c4.003 1.649 7.802 4.162 11.108 7.468l57.302 57.317 203.122-203.082c13.779-13.779 36.12-13.779 49.9 0a35.17 35.17 0 0 1 7.893 12.027c4 1.641 7.799 4.154 11.105 7.46l183.903 183.877V182.678c0-12.992-10.531-23.523-23.523-23.523zM370.862 276.77c38.974 0 70.569 31.595 70.569 70.569s-31.595 70.569-70.569 70.569c-38.974 0-70.569-31.595-70.569-70.569s31.595-70.569 70.569-70.569z',
  video:
    'M864.845 88.586c51.966 0 94.092 42.127 94.092 94.092v658.644c0 51.966-42.126 94.092-94.092 94.092h-705.69c-51.966 0-94.092-42.126-94.092-94.092V182.678c0-51.966 42.126-94.092 94.092-94.092h705.69zm23.523 288.157H135.632v464.579c0 12.991 10.532 23.523 23.523 23.523h705.69c12.991 0 23.523-10.532 23.523-23.523V376.743zM446.071 500.238c4.837 0 9.591 1.372 13.807 3.985l139.695 86.581c13.556 8.402 18.364 27.322 10.739 42.259-2.529 4.953-6.244 9.046-10.739 11.833l-139.695 86.581c-13.556 8.402-30.728 3.104-38.353-11.833-2.371-4.645-3.617-9.884-3.617-15.213V531.269c0-17.138 12.609-31.031 28.163-31.031zm418.774-341.083h-94.139l-58.807 147.019h176.47V182.678c-.001-12.992-10.532-23.523-23.524-23.523zm-585.77 0h-119.92c-12.991 0-23.523 10.532-23.523 23.523v123.496h84.636l58.807-147.019zm205.826 0H349.644l-58.807 147.019h135.257l58.807-147.019zm215.236 0H555.471l-58.807 147.019 144.985.035a24.05 24.05 0 0 1 1.071-3.392l57.417-143.662z',
  hash:
    'M370.862 900.13c0 19.487-15.797 35.284-35.285 35.284-17.863 0-32.626-13.274-34.962-30.497l-.322-4.788V723.707H123.87c-19.487 0-35.285-15.797-35.285-35.285 0-17.863 13.274-32.626 30.496-34.962l4.788-.322h176.423V347.339H123.87c-19.487 0-35.285-15.797-35.285-35.285 0-17.863 13.274-32.626 30.496-34.962l4.788-.322h176.423v-152.9c0-19.487 15.797-35.285 35.284-35.285 17.863 0 32.626 13.274 34.962 30.497l.322 4.788v152.9h305.799v-152.9c0-19.487 15.797-35.285 35.285-35.285 17.863 0 32.626 13.274 34.963 30.497l.322 4.788v152.9h152.9c19.487 0 35.284 15.797 35.284 35.284 0 17.863-13.274 32.626-30.497 34.962l-4.788.322h-152.9v305.799h152.9c19.487 0 35.284 15.797 35.284 35.284 0 17.863-13.274 32.626-30.497 34.962l-4.788.322h-152.9V900.13c0 19.487-15.797 35.284-35.285 35.284-17.863 0-32.626-13.274-34.963-30.497l-.322-4.788V723.707H370.862V900.13zm0-246.992h305.799V347.339H370.862v305.799z',
  article:
    'M740.316 51.648 218.85 425.366c-36.959 26.487-45.448 77.92-18.961 114.879l4.649 5.898a82.362 82.362 0 0 0 16.853 14.812l131.052 86.662L209.404 895.12c-16.255 28.118-6.638 64.09 21.48 80.345 20.2 11.678 45.393 10.308 64.209-3.49L805.88 597.398c36.667-26.889 44.594-78.412 17.705-115.079l-5.261-6.461a82.307 82.307 0 0 0-19.256-15.737L685.106 392.77l141.384-265.7c15.255-28.673 4.377-64.284-24.296-79.538a58.806 58.806 0 0 0-61.878 4.116zM259.957 482.725l480.568-344.429-133.561 251.152c-8.865 16.663-3.047 37.352 13.204 46.952l143.006 84.48a11.773 11.773 0 0 1 3.503 3.171l1.51 2.77c1.84 4.824.326 10.469-4.039 13.67L298.575 881.859l131.612-227.654c9.34-16.157 4.483-36.794-11.083-47.089L260.32 502.095a11.764 11.764 0 0 1-3.072-2.959c-3.783-5.279-2.57-12.627 2.709-16.411z',
  timer:
    'M594.814 88.586c19.22 0 34.801 15.581 34.801 34.801s-15.581 34.801-34.801 34.801l-47.529-.021.037 36.436c187.47 17.21 335.036 170.033 340.868 358.037l.179 11.562c0 205.015-168.506 371.212-376.368 371.212S135.632 769.217 135.632 564.202c0-193.283 149.772-352.064 341.094-369.604l-.011-36.431-47.529.021c-19.22 0-34.801-15.581-34.801-34.801s15.581-34.801 34.801-34.801h165.628zM512 262.592c-168.888 0-305.799 135.036-305.799 301.61S343.112 865.812 512 865.812s305.799-135.035 305.799-301.61S680.888 262.592 512 262.592zm0 139.204c19.487 0 35.285 15.797 35.285 35.284v138.714l82.814.008c19.22 0 34.801 15.581 34.801 34.801s-15.581 34.801-34.801 34.801H511.517c-19.22 0-34.801-15.581-34.801-34.801 0-2.052.177-4.063.518-6.017a35.461 35.461 0 0 1-.518-6.066V437.081c-.001-19.487 15.797-35.285 35.284-35.285z',
};

const pubIcon = (name) =>
  `<svg viewBox="0 0 1024 1024" class="wb-pub-svg" aria-hidden="true"><path d="${PUB_ICON[name]}"></path></svg>`;

/* ---------------- 正文编辑器（首页发布框 / 「写文章」页 / 后台文章编辑共用） ---------------- */

const pubIconBtn = (key, label, act) =>
  `<button type="button" class="wb-pub-icon" data-act="${act}">${pubIcon(key)}<span class="wb-pub-label">${label}</span></button>`;

/** 图标工具栏：showWriteLink=false 时隐藏「写长文」入口（写文章页本身即该页面） */
const pubIconBar = (showWriteLink = true) =>
  pubIconBtn('emoticon', '表情', 'emoticon') +
  pubIconBtn('image', '图片', 'image') +
  pubIconBtn('video', '视频', 'video') +
  pubIconBtn('hash', '话题', 'topic') +
  (showWriteLink
    ? `<a class="wb-pub-icon" href="/write">${pubIcon('article')}<span class="wb-pub-label">写长文</span></a>`
    : '');

/**
 * 正文编辑区：textarea + 字数统计 + 内容声明 + 图标工具栏（对齐 weibo.com ._box_vkpry_2）
 * barExtra 用于追加发布框专有控件（定时 / 可见范围 / 发送）
 */
export function pubBody({
  statement = true,
  showWriteLink = true,
  value = '',
  placeholder = '有什么新鲜事想分享给大家？',
  maxlength = WEIBO_MAX_LENGTH,
  required = false,
  barExtra = '',
} = {}) {
  const statementBtn = statement
    ? `<button type="button" class="wb-pub-statement" data-act="statement" title="内容声明">内容声明</button>`
    : '';
  return `<div class="wb-pub-form">
      <textarea class="wb-pub-input" name="content" maxlength="${maxlength}" placeholder="${e(placeholder)}"${required ? ' required' : ''}>${e(value)}</textarea>
      <div class="wb-pub-toolbar">
        <span class="wb-pub-count" data-count>0/${maxlength}</span>
        ${statementBtn}
      </div>
    </div>
    <div class="wb-pub-bar">
      <div class="wb-pub-icons">${pubIconBar(showWriteLink)}</div>
      <span class="wb-pub-line"></span>
      ${barExtra}
    </div>`;
}

/* ---------------- 发布框交互脚本（原生 JS，随编辑器一起渲染，根节点需带 data-pub） ---------------- */

export const PUB_SCRIPT = `<script>
(function () {
  var root = document.querySelector('[data-pub]');
  if (!root) return;
  var input = root.querySelector('.wb-pub-input');
  if (!input) return;
  var count = root.querySelector('[data-count]');
  var panel = root.querySelector('[data-panel]');
  var vis = root.querySelector('[data-visibility]');
  var sched = root.querySelector('[data-scheduled]');
  var statement = root.querySelector('[data-statement]');
  var statementBtn = root.querySelector('[data-act="statement"]');
  var send = root.querySelector('.wb-pub-send');
  var openAct = '';
  var openBtn = null;
  var mediaType = '';
  var MAX = parseInt(input.getAttribute('maxlength'), 10) || ${WEIBO_MAX_LENGTH};
  var form = root.closest('form');
  var EMOJI = ['😀','😁','😂','🤣','😊','😍','😘','😎','🤔','😴','😭','😡','👍','👎','👏','🙏','💪','🎉','❤️','💔','🔥','⭐','🌈','☀️','🌙','⚽','🏆','🍺','☕','🎵'];
  var STATEMENTS = ${JSON.stringify(PUBLISH_STATEMENTS)};
  // 只有话题 #...# 与空白视为空，与后端 publishPost 校验保持一致（图片/视频标签算内容）
  function isEmpty() { return !input.value.replace(/#[^#\\n]+#/g, '').trim(); }
  function sync() {
    count.textContent = input.value.length + '/' + MAX;
    count.className = 'wb-pub-count' + (input.value.length >= MAX ? ' over' : '');
    // 内容为空时禁用发送（对齐 weibo.com 空文本禁用态）
    if (send) send.disabled = isEmpty();
  }
  function insert(text) {
    var s = input.selectionStart, t = input.selectionEnd;
    input.value = input.value.slice(0, s) + text + input.value.slice(t);
    input.selectionStart = input.selectionEnd = s + text.length;
    input.focus();
    sync();
  }
  function closePanel() {
    panel.hidden = true; panel.innerHTML = ''; panel.className = 'wb-pub-panel';
    openAct = ''; mediaType = '';
    if (openBtn) { openBtn.classList.remove('on'); openBtn = null; }
  }
  // 弹层定位：左上角对齐鼠标点击处（换算到定位上下文 .wb-publish / .wb-pub-block 的 padding box）；
  // 右侧或下方越出视口时就近收边（只移动刚好够用的距离），保证面板整块可见且始终紧贴点击点。
  // 不用「整块翻到点击点上方」：面板常有一两百像素高，翻上去会离点击点很远，看起来像没定位在点击处
  function placePanel(x, y) {
    var host = panel.offsetParent || root;
    var hr = host.getBoundingClientRect();
    var pr = panel.getBoundingClientRect();
    var vw = document.documentElement.clientWidth;
    var vh = document.documentElement.clientHeight;
    if (pr.width && x + pr.width > vw) x = vw - pr.width;
    if (pr.height && y + pr.height > vh) y = vh - pr.height;
    // 只按视口收边，不再夹到定位上下文的左/上缘：工具行有 -11.5px 负外边距，
    // 首个图标的点击点会落在这块之外（left 为负），夹 0 会让落点偏移 6.5px
    x = Math.max(0, x);
    y = Math.max(0, y);
    panel.style.left = (x - hr.left - host.clientLeft) + 'px';
    panel.style.top = (y - hr.top - host.clientTop) + 'px';
  }
  function openPanel(html, name, btn, ev) {
    if (name && name === openAct) { closePanel(); return; }
    panel.className = 'wb-pub-panel' + (name ? ' wb-pub-panel-' + name : '');
    panel.innerHTML = html;
    panel.hidden = false;
    if (ev) placePanel(ev.clientX, ev.clientY);
    openAct = name || '';
    // 触发按钮标记选中态（.wb-pub-icon.on → 主色）；换面板时摘掉上一个，closePanel 时统一摘除
    if (openBtn && openBtn !== btn) openBtn.classList.remove('on');
    openBtn = btn || null;
    if (openBtn) openBtn.classList.add('on');
    var field = panel.querySelector('input');
    if (field) field.focus();
  }
  function emojiPanel() {
    var items = '';
    for (var i = 0; i < EMOJI.length; i++) {
      items += '<button type="button" class="wb-pub-emoji" data-emoji="' + EMOJI[i] + '">' + EMOJI[i] + '</button>';
    }
    return '<div class="wb-pub-emojis">' + items + '</div>';
  }
  // 图片 / 视频：外链地址输入 + 实时预览（替代原生 prompt）
  function mediaPanel(type) {
    mediaType = type;
    var isVideo = type === 'video';
    var label = isVideo ? '视频' : '图片';
    return '<div class="wb-pub-media">' +
      '<label>' + label + '地址</label>' +
      '<input type="url" data-media-url placeholder="粘贴' + label + '地址（https://…）">' +
      '<div class="wb-pub-media-preview" data-media-preview hidden></div>' +
      '<div class="wb-pub-media-actions">' +
      '<button type="button" class="wb-pub-media-cancel" data-media-cancel>取消</button>' +
      '<button type="button" class="wb-pub-media-ok" data-media-ok>确定</button>' +
      '</div></div>';
  }
  // 媒体地址白名单：与后端 safeUrl 同口径，只放行 http(s) 与站内相对地址
  function mediaUrl(raw) {
    var url = String(raw || '').trim();
    if (!url) return '';
    if (/^https?:\\/\\//i.test(url)) return url;
    // 协议相对地址（//evil.com、/\\evil.com）会被浏览器按当前协议补全成跨站地址，
    // 后端 safeUrl 会整条丢弃，这里也必须拦下来，否则预览正常、发布后消失
    if (/^[\\\\/]{2}/.test(url)) return '';
    if (/^(\\/|\\.\\/|\\.\\.\\/|#|\\?)/.test(url)) return url;
    return '';
  }
  // 预览节点用 DOM 属性赋值生成，不拼 innerHTML：地址里的引号/尖括号不会被当成 HTML 执行
  function previewMedia(raw) {
    var box = panel.querySelector('[data-media-preview]');
    if (!box) return;
    box.innerHTML = '';
    var url = mediaUrl(raw);
    if (!url) { box.hidden = true; return; }
    var isVideo = mediaType === 'video';
    var el = document.createElement(isVideo ? 'video' : 'img');
    el.src = url;
    if (isVideo) el.controls = true;
    box.hidden = false;
    box.appendChild(el);
  }
  function confirmMedia() {
    var field = panel.querySelector('[data-media-url]');
    var url = mediaUrl(field ? field.value : '');
    if (!url) {
      alert('请输入' + (mediaType === 'video' ? '视频' : '图片') + '地址（以 http:// 或 https:// 开头）');
      if (field) field.focus();
      return;
    }
    insert(mediaType === 'video'
      ? '<video src="' + url + '" controls></video>'
      : '<img src="' + url + '" alt="">');
    closePanel();
  }
  // 内容声明：无 / 内容为自主创作 / 内容为转载 / 内容由AI生成 / 内容为虚构演绎（对齐 weibo.com）
  function statementPanel() {
    var cur = statement ? statement.value : '';
    var opts = [''].concat(STATEMENTS);
    var items = '';
    for (var i = 0; i < opts.length; i++) {
      var v = opts[i];
      items += '<button type="button" class="wb-pub-statement-opt' + (cur === v ? ' on' : '') +
        '" data-statement-opt="' + v + '">' + (v || '无') + '</button>';
    }
    return '<div class="wb-pub-statement-box">' +
      '<div class="wb-pub-statement-title">选择内容声明</div>' +
      '<div class="wb-pub-statement-divider"></div>' +
      '<div class="wb-pub-statement-list">' + items + '</div>' +
      '</div>';
  }
  function setStatement(value) {
    if (statement) statement.value = value;
    if (statementBtn) {
      statementBtn.textContent = value || '内容声明';
      statementBtn.className = 'wb-pub-statement' + (value ? ' on' : '');
    }
  }
  function scopePanel() {
    var cur = vis.value === 'private' ? 'private' : 'public';
    var opts = [['public', '公开'], ['private', '私密']];
    var items = '';
    for (var i = 0; i < opts.length; i++) {
      items += '<button type="button" data-scope="' + opts[i][0] + '"' +
        (cur === opts[i][0] ? ' class="on"' : '') + '>' + opts[i][1] + '</button>';
    }
    return '<div class="wb-pub-menu">' + items + '</div>';
  }
  function schedulePanel() {
    return '<div class="wb-pub-schedule"><label>定时发布时间</label>' +
      '<input type="datetime-local" data-schedule value="' + (sched.value || '') + '"></div>';
  }
  function topic() {
    var s = input.selectionStart, t = input.selectionEnd;
    if (s !== t) {
      var picked = input.value.slice(s, t);
      input.value = input.value.slice(0, s) + '#' + picked + '#' + input.value.slice(t);
      input.selectionStart = input.selectionEnd = s + picked.length + 2;
    } else {
      input.value = input.value.slice(0, s) + '##' + input.value.slice(t);
      input.selectionStart = input.selectionEnd = s + 1;
    }
    input.focus();
    sync();
  }
  root.addEventListener('input', function (ev) {
    var t = ev.target;
    if (t && t.getAttribute && t.getAttribute('data-media-url') !== null) previewMedia(t.value);
    sync();
  });
  sync();
  // 回填已有内容声明（编辑文章时）
  setStatement(statement ? statement.value : '');
  root.addEventListener('click', function (ev) {
    var el = ev.target;
    var emoji = el.closest ? el.closest('[data-emoji]') : null;
    if (emoji) { insert(emoji.getAttribute('data-emoji')); closePanel(); ev.preventDefault(); return; }
    var scope = el.closest ? el.closest('[data-scope]') : null;
    if (scope) {
      var value = scope.getAttribute('data-scope');
      vis.value = value;
      var open = root.querySelector('.wb-pub-open');
      if (open) open.textContent = value === 'private' ? '私密' : '公开';
      closePanel(); ev.preventDefault(); return;
    }
    var sop = el.closest ? el.closest('[data-statement-opt]') : null;
    if (sop) { setStatement(sop.getAttribute('data-statement-opt')); closePanel(); ev.preventDefault(); return; }
    if (el.closest && el.closest('[data-media-cancel]')) { closePanel(); ev.preventDefault(); return; }
    if (el.closest && el.closest('[data-media-ok]')) { confirmMedia(); ev.preventDefault(); return; }
    var act = el.closest ? el.closest('[data-act]') : null;
    if (act) {
      var name = act.getAttribute('data-act');
      // 仅图标按钮（表情 / 图片 / 视频）回写 .on 选中态：
      // 定时（.wb-pub-timer.on）与内容声明（.wb-pub-statement.on）由各自逻辑维护，不接管
      if (name === 'emoticon') { openPanel(emojiPanel(), 'emoticon', act, ev); }
      else if (name === 'scope') { openPanel(scopePanel(), 'scope', null, ev); }
      else if (name === 'timer') { openPanel(schedulePanel(), 'timer', null, ev); }
      else if (name === 'statement') { openPanel(statementPanel(), 'statement', null, ev); }
      else if (name === 'image') { openPanel(mediaPanel('image'), 'image', act, ev); }
      else if (name === 'video') { openPanel(mediaPanel('video'), 'video', act, ev); }
      else if (name === 'topic') { closePanel(); topic(); }
      ev.preventDefault(); return;
    }
    if (!el.closest('.wb-pub-panel')) closePanel();
  });
  root.addEventListener('keydown', function (ev) {
    if (ev.key === 'Escape') { closePanel(); return; }
    if (ev.key === 'Enter' && ev.target && ev.target.getAttribute && ev.target.getAttribute('data-media-url') !== null) {
      ev.preventDefault();
      confirmMedia();
    }
  });
  root.addEventListener('change', function (ev) {
    if (ev.target && ev.target.getAttribute && ev.target.getAttribute('data-schedule') !== null) {
      sched.value = ev.target.value;
      var btn = root.querySelector('[data-act="timer"]');
      if (btn) {
        btn.className = 'wb-pub-timer' + (ev.target.value ? ' on' : '');
        btn.title = ev.target.value ? '定时：' + ev.target.value : '定时微博';
      }
      closePanel();
    }
  });
  if (form) form.addEventListener('submit', function (ev) {
    // 仅发布框（有「发送」按钮）拦空内容；写文章页交给 required 与后端校验
    if (send && isEmpty()) {
      ev.preventDefault();
      alert('请输入要发布的内容');
      input.focus();
    }
  });
  document.addEventListener('click', function (ev) {
    if (!panel.hidden && !root.contains(ev.target)) closePanel();
  });
})();
</script>`;

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

export function head(options, pageTitle, extraHead = '', bodyStyle = '') {
  const favicon = options.faviconUrl || '/favicon.ico';
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
<meta name="description" content="${e(options.description)}">
<meta name="keywords" content="${e(options.keywords)}">
<link rel="stylesheet" href="/style/weibo.css" type="text/css">
<link rel="stylesheet" href="/style/publisher.css" type="text/css">
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
      <div class="wb-profile-pop"><img src="${e(popLink)}" alt="二维码"></div>
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

function profileCard(options, profile = {}, session, hideMeta = false, extraHtml = '') {
  const isUser = profile.mode === 'user';
  const name = profile.name || options.title;
  const avatar = profile.avatar || options.headImgUrl || '';
  const desc = profile.desc || '';
  const cardBg = styleUrl(options.cardBgUrl, '/images/cardBg.jpg');

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
    <a class="wb-profile-avatar" href="${isUser ? '/write/mine' : '/'}">${avatar ? `<img src="${e(avatar)}" alt="${e(name)}">` : ''}</a>
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
      ${image ? link(`<img src="${e(image)}" alt="${e(l.name)}">`) : ''}
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
      <img src="${e(avatarFor({ mail: c.mail }, 60))}" alt="${e(c.author)}">
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
function shell({ options, session, pageTitle, active = '', center, categories = [], profile = {}, topics = [], hotComments = [], links = [], nav = [], activeSlug = '', focus = false }) {
  const bodyStyle = bodyStyleOf(options);
  if (focus) {
    return `${head(options, pageTitle, '', bodyStyle)}
${topbar(options, session, active, nav)}
<div class="wb-container wb-container-focus">
  <main class="wb-center">
    ${center}
  </main>
</div>
${footer(options)}`;
  }
  return `${head(options, pageTitle, '', bodyStyle)}
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

function postActions(post, options, session) {
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
function bodyOf(post) {
  return post && post.author_role === 'administrator' ? post.content : shortBody(post && post.content);
}

/** 文章标签渲染成 #话题# 链接（信息流卡片与详情页共用，避免两处各写一遍） */
function topicLinks(tags = []) {
  return (tags || []).map((t) => `<a href="${e(slugHref('/tag', t.slug))}">#${e(t.name)}#</a>`).join('');
}

function postCard(post, options, session) {
  const isRepost = !!post.repost_pid;
  const isShort = /^weibo-/.test(post.slug || ''); // 发布框快速发布的微博式短内容
  const src = post.repost_source || null;
  // 详情页地址统一走 frontUrl（独立页面 /page/{slug}，文章 /archives/{pid}），拼进 href 前转义
  const permalink = e(frontUrl(post));
  // 「首页大图」对每条卡片都出图（与原主题 index.php 一致）：微博式短文若正文自带配图，
  // 正文里已经展示过，不再叠加封面；纯文字短文与普通文章一样按设置出随机图 / 指定图
  const cover = isShort && firstImage(post.content) ? '' : coverFor(post, options);
  const coverHtml = cover ? `<a href="${permalink}"><img class="cover" src="${e(cover)}" alt="${e(post.title)}"></a>` : '';
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
      <a class="wb-post-avatar" href="/"><img src="${e(avatarFor({ headpic: post.author_headpic, mail: post.author_mail }, 100))}" alt="${e(post.screenname || options.yourNickname)}"></a>
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
  const feed = `<div class="wb-feed" data-soft="feed">${
    posts.length
      ? posts.map((p) => postCard(p, options, session)).join('\n  ')
      : `<div class="wb-card wb-empty">还没有内容，去后台或前台写一篇吧～</div>`
  }</div>`;

  const center = `${publishBox}
  ${noticeBar}
  ${crumb}
  ${headingBar}
  ${feed}
  ${pager({ base: baseUrl, page, totalPages })}`;

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

function commentItem(c, index) {
  // 评论者可填个人主页，只放行 http/https 与站内相对地址，避免 javascript: 之类的伪协议
  const homepage = safeUrl(c.url);
  const author = homepage
    ? `<a href="${e(homepage)}" target="_blank" rel="noopener noreferrer">${e(c.author)}</a>`
    : `${e(c.author)}`;
  return `<div class="wb-comment-item">
    <img src="${e(avatarFor({ mail: c.mail }, 80))}" alt="${e(c.author)}">
    <div>
      <div class="cc">${e(c.content)}</div>
      <div class="cm">
        ${author}
        <time>${fmtDate(c.created)}</time> #${index + 1}
      </div>
    </div>
  </div>`;
}

function commentBlock(comments, post, options, session) {
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
    <h3 style="font-size:16px;padding-bottom:10px;border-bottom:1px solid var(--wb-line);margin-bottom:10px;">评论 ${comments.length} 条</h3>
    ${rows || '<div class="wb-empty" style="padding:20px 0;">还没有评论，来抢沙发吧～</div>'}
    ${form}
  </div>`;
}

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
        <img src="${e(avatarFor(session, 100))}" alt="当前头像">
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

/* ---------------- 封面图策略（对应主题的首页大图设置） ---------------- */

function coverFor(post, options) {
  const mode = options.ROWINGBOHE ?? '1';
  const random = randomCover(options);
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

function randomCover(options) {
  const total = Math.max(1, parseInt(options.randomNum, 10) || 5);
  return `/images/random/${Math.floor(Math.random() * total) + 1}.jpg`;
}
