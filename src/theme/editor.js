import { escapeHtml as e, PUBLISH_STATEMENTS, WEIBO_MAX_LENGTH } from '../lib.js';

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

export const pubIcon = (name) =>
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
