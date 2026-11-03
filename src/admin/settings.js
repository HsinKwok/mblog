/**
 * 后台站点设置与功能管理
 */
import { escapeHtml as e, field, readForm, first, run, changed, getOptions, saveOptions, DEFAULT_OPTIONS, backMsg, backErr } from '../lib.js';
import { adminPage } from './layout.js';

/* ---------------- 站点设置 ---------------- */

export const SETTING_GROUPS = [
  {
    title: '基础信息',
    fields: [
      ['title', '站点名称', 'text'],
      ['description', '站点简介', 'text'],
      ['keywords', '关键词（英文逗号分隔）', 'text'],
      ['siteUrl', '站点地址（左侧资料卡展示）', 'text'],
      ['pageSize', '每页文章数', 'text'],
    ],
  },
  {
    title: '首页大图',
    fields: [
      [
        'ROWINGBOHE',
        '大图样式：0 首图+随机 / 1 仅随机图 / 2 首图+指定图 / 3 指定图 / 4 关闭',
        'text',
        '与主题一致：数字越大越省流量，选 0/2 会读取正文首图',
      ],
      ['randomNum', '随机图数量（/images/random 下 1..N.jpg）', 'text'],
      ['ROWINGBOHEUrl', '指定大图链接', 'text'],
    ],
  },
  /**
   * 头部资料卡：前台资料卡展示的信息，属站点级配置（存于 options 表），未登录访客同样可见。
   * 字段顺序按前台引用顺序排列：head 图标 → 页面背景 → 资料卡封面、头像、昵称、简介、
   * 居住地、生日 → 资料卡按钮与菜单。
   */
  {
    title: '头部资料卡',
    tip: '前台资料卡展示的信息，未登录访客同样可见；未填写时前台按默认值展示。',
    fields: [
      ['faviconUrl', 'favicon 图标链接', 'text'],
      ['bgUrl', '背景图片链接', 'text'],
      ['cardBgUrl', '顶部卡片背景图片链接', 'text'],
      ['headImgUrl', '头像地址', 'text'],
      ['yourNickname', '昵称', 'text'],
      ['yourDescription', '简介', 'text'],
      ['yourPlace', '居住地', 'text'],
      ['yourBirthday', '生日', 'text'],
      ['profileText1', '第一个按钮文字（悬停显示二维码）', 'text'],
      ['profileLink1', '第一个按钮悬停图片链接', 'text'],
      ['profileText2', '第二个按钮文字', 'text'],
      ['profileLink2', '第二个按钮链接', 'text'],
      ['yourMenuContent', '资料卡菜单（HTML，直接显示为链接）', 'textarea'],
    ],
  },
  {
    title: '评论框',
    fields: [
      ['commentCustom1', '评论框提示内容', 'text'],
      ['commentCustom2', '发送按钮文字', 'text'],
    ],
  },
  {
    title: '自定义代码与页脚',
    fields: [
      ['optionHeader', '自定义 Header（插入 head 内）', 'textarea'],
      ['optionFooter', '自定义 Footer（插入页脚前）', 'textarea'],
      ['myFooter', '网站页脚内容（如备案号）', 'textarea'],
    ],
  },
];

/* ---------------- 设置项渲染与收集（站点设置、功能管理共用） ---------------- */

/**
 * 设置字段：[name, label, type, extra]
 * - type 'text' / 'textarea'：extra 为字段下方的提示文案
 * - type 'switch'：extra 为「开启」时写入的值，关闭时自动写入相反值；
 *   视图层统一为「勾选 = 开启」，与底层 0/1 的取值极性解耦（部分开关 0 表示开启）
 */
function renderSettingField([name, label, type = 'text', extra = ''], options) {
  if (type === 'switch') {
    const onValue = extra || '0';
    const on = String(options[name] ?? onValue) === onValue;
    return `<label class="wb-switch">
        <input type="checkbox" name="${name}" value="${onValue}"${on ? ' checked' : ''}>
        <span class="wb-switch-track" aria-hidden="true"></span>
        <span class="wb-switch-text">${label}</span>
      </label>`;
  }
  const value = e(options[name] ?? '');
  const control =
    type === 'textarea'
      ? `<textarea name="${name}" style="min-height:120px">${value}</textarea>`
      : `<input type="text" name="${name}" value="${value}">`;
  return `<div class="field"><label>${label}</label>${control}${extra ? `<div class="hint">${extra}</div>` : ''}</div>`;
}

/** 渲染设置分组卡片；layout 为 switch 时字段以开关网格排列 */
function renderSettingCard(group, options) {
  const fields = group.fields.map((f) => renderSettingField(f, options)).join('');
  return `
    <div class="wb-card wb-card-pad">
      <h3>${group.title}</h3>
      ${group.tip ? `<div class="tip">${group.tip}</div>` : ''}
      ${group.layout === 'switch' ? `<div class="wb-switch-grid">${fields}</div>` : fields}
    </div>`;
}

/** 渲染设置表单：分组卡片 + 提交按钮（extra 用于追加按钮，如「恢复默认」） */
function renderSettingForm({ action, groups, options, submitText, extra = '' }) {
  return `
  <form class="wb-form wb-form-wide wb-form-flat" method="post" action="${action}">
    ${groups.map((g) => renderSettingCard(g, options)).join('')}
    <div class="inline" style="margin-bottom:20px;">
      <button class="wb-btn p" type="submit">${submitText}</button>${extra}
    </div>
  </form>`;
}

/** 从表单收集分组内的设置项；开关未勾选时浏览器不提交该字段，需按「关闭」写入相反值 */
function collectSettings(groups, form) {
  const data = {};
  for (const group of groups) {
    for (const [name, , type = 'text', extra = ''] of group.fields) {
      if (type === 'switch') {
        const onValue = extra || '0';
        data[name] = form.get(name) === null ? (onValue === '0' ? '1' : '0') : onValue;
      } else if (form.get(name) !== null) {
        data[name] = field(form, name);
      }
    }
  }
  return data;
}

/** 读取设置备份行（未备份时返回 null） */
function getOptionsBackup(env) {
  return first(env, "SELECT value FROM options WHERE name = 'options_backup'");
}

export async function optionsPage(env, user, url) {
  const options = await getOptions(env);
  const body = renderSettingForm({
    action: '/admin/options',
    groups: SETTING_GROUPS,
    options,
    submitText: '保存全部设置',
    extra:
      '<button class="wb-btn" type="submit" formaction="/admin/options/reset" formmethod="post" onclick="return confirm(\'恢复为默认设置？当前设置将被覆盖\');">恢复默认</button>',
  });
  return adminPage(env, user, '/admin/options', '站点设置', body, url);
}

/** 站点设置 / 功能开关共用的保存流程：按分组收集表单字段后落库 */
export async function saveSettings(env, request, groups, back) {
  await saveOptions(env, collectSettings(groups, await readForm(request)));
  return backMsg(back, '设置已保存');
}

export async function optionsReset(env) {
  // 「恢复默认设置」只重置配置项，保留 options_backup：备份行本身也存在 options 表里，
  // 若一并删掉，管理员就无法再通过「恢复备份」找回重置前的设置。
  await run(env, "DELETE FROM options WHERE name <> 'options_backup'");
  await saveOptions(env, DEFAULT_OPTIONS);
  return backMsg('/admin/options', '已恢复默认设置');
}

/* ---------------- 功能管理 ---------------- */

export const FEATURE_GROUPS = [
  {
    title: '功能开关',
    layout: 'switch',
    fields: [
      ['searchOpen', '显示搜索框', 'switch', '0'],
      ['loginButtonOpen', '显示登录按钮', 'switch', '0'],
      ['registerOpen', '显示注册按钮', 'switch', '0'],
      ['registerReview', '注册需审核', 'switch', '1'],
      ['likeOpen', '显示点赞按钮', 'switch', '0'],
      ['repostOpen', '显示转发按钮', 'switch', '0'],
      ['followOpen', '显示关注按钮', 'switch', '0'],
      ['topicOpen', '显示热门话题榜', 'switch', '0'],
      ['friendLinkOpen', '显示右栏友链', 'switch', '0'],
      ['frontPublish', '开放前台投稿', 'switch', '0'],
      ['frontPublishReview', '前台投稿需审核', 'switch', '1'],
      ['commentReview', '评论需审核', 'switch', '1'],
      ['frontPublishTimer', '发布框显示定时发布', 'switch', '0'],
      ['frontPublishScope', '发布框显示可见范围', 'switch', '0'],
      ['frontPublishStatement', '发布框显示内容声明', 'switch', '0'],
    ],
  },
];

export async function featuresPage(env, user, url) {
  const options = await getOptions(env);
  const backup = await getOptionsBackup(env);
  const body = `${renderSettingForm({ action: '/admin/features', groups: FEATURE_GROUPS, options, submitText: '保存设置' })}
  <div class="wb-card wb-card-pad">
    <h3>设置备份</h3>
    <p class="muted">${backup ? '已有备份数据' : '当前没有备份数据'}</p>
    <div class="inline">
      <form method="post" action="/admin/features/backup" style="display:inline"><button class="wb-btn" type="submit">备份设置数据</button></form>
      <form method="post" action="/admin/features/restore" style="display:inline"><button class="wb-btn" type="submit">还原设置数据</button></form>
      <form method="post" action="/admin/features/unbackup" style="display:inline"><button class="wb-btn d" type="submit">删除备份数据</button></form>
    </div>
  </div>`;
  return adminPage(env, user, '/admin/features', '功能管理', body, url);
}

export async function featuresBackup(env, mode) {
  if (mode === 'backup') {
    const options = await getOptions(env);
    await saveOptions(env, { options_backup: JSON.stringify(options) });
    return backMsg('/admin/features', '备份完成');
  }
  if (mode === 'restore') {
    const row = await getOptionsBackup(env);
    if (!row || !row.value) return backErr('/admin/features', '没有备份数据，无法还原');
    let data;
    try {
      data = JSON.parse(row.value);
    } catch {
      return backErr('/admin/features', '备份数据已损坏，无法还原');
    }
    if (!data || typeof data !== 'object') return backErr('/admin/features', '备份数据已损坏，无法还原');
    // 备份由 getOptions 生成，键必然落在 DEFAULT_OPTIONS 内；按白名单过滤，
    // 避免被篡改或旧版本的备份把任意键名写进 options（备份行自身不是设置项，同样排除）
    const restored = {};
    for (const name of Object.keys(DEFAULT_OPTIONS)) {
      if (name in data) restored[name] = data[name];
    }
    await saveOptions(env, restored);
    return backMsg('/admin/features', '已还原备份设置');
  }
  const res = await run(env, "DELETE FROM options WHERE name = 'options_backup'");
  if (!changed(res)) return backErr('/admin/features', '没有备份数据可删除');
  return backMsg('/admin/features', '已删除备份数据');
}
