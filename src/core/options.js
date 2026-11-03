import { all } from './db.js';

export const DEFAULT_OPTIONS = {
  // 基础信息
  title: '我的微博客',
  description: '一个基于 Cloudflare Workers 的轻量微博客',
  keywords: '博客,微博,Typecho,Cloudflare Workers',
  siteUrl: '',
  pageSize: '10',
  // 头部资料卡
  yourNickname: '站长',
  yourDescription: '在这里写一句自我介绍',
  yourPlace: '',
  yourBirthday: '',
  headImgUrl: '',
  faviconUrl: '',
  bgUrl: '',
  cardBgUrl: '',
  // 首页大图
  ROWINGBOHE: '1',
  randomNum: '5',
  ROWINGBOHEUrl: '',
  // 菜单
  yourMenuContent: '<li><a href="/">主页</a></li>',
  // 功能开关（0 是 / 1 否，与主题一致）
  searchOpen: '0',
  loginButtonOpen: '0',
  registerOpen: '0',
  friendLinkOpen: '0',
  // 注册审核（与 commentReview 同极性：0 免审核 / 1 需审核）：
  // 需审核时新注册账号先落为 user.status = 'pending'，管理员在后台「用户管理」通过后才能登录
  registerReview: '1',
  // 评论审核反转：0 免审核 / 1 需审核（与上述开关极性相反）
  commentReview: '0',
  // 前台投稿（0 是 / 1 否，与主题一致）
  frontPublish: '0',
  frontPublishReview: '0',
  // 发布框高级控件（0 显示 / 1 隐藏）
  frontPublishTimer: '1',
  frontPublishScope: '1',
  frontPublishStatement: '0',
  // 微博式互动（0 是 / 1 否，与主题一致）
  likeOpen: '0',
  repostOpen: '0',
  followOpen: '0',
  topicOpen: '0',
  // 资料卡按钮
  profileText1: '留言',
  profileLink1: '',
  profileText2: '关于我',
  // 默认指向站点信息页：/page/about 需要先有一篇别名为 about 的独立页面才存在，
  // 新站未建该页时点「关于我」会直接 404，故默认落到始终可用的 /site
  profileLink2: '/site',
  // 评论框
  commentCustom1: '还不赶快说些什么呀',
  commentCustom2: '发送',
  // 自定义代码与页脚
  optionHeader: '',
  optionFooter: '',
  myFooter: '',
};

/** 设置备份行不是设置项，合并选项时跳过，避免备份自引用膨胀 */
const OPTIONS_BACKUP_KEY = 'options_backup';

/** 把 options 表的行合并到默认值上（batch 与单表读取共用同一口径） */
export function mergeOptions(rows = []) {
  const options = { ...DEFAULT_OPTIONS };
  for (const row of rows || []) {
    if (row.name === OPTIONS_BACKUP_KEY) continue;
    // 空串是「管理员显式清空」的有效取值，不能当成未设置回落默认值；
    // 只有整行缺失（或值为 NULL）时才使用 DEFAULT_OPTIONS。
    if (row.value !== null && row.value !== undefined) options[row.name] = row.value;
  }
  return options;
}

// 站点设置几乎每个请求都要用，且读取频率远高于修改频率：
// 单实例内做 15 秒短缓存，后台保存设置时立即失效，跨实例最多延迟一个 TTL。
const OPTIONS_CACHE_MS = 15000;
let cachedOptions = null;
let cachedAt = 0;

/** 清空设置缓存（保存设置后调用） */
export function clearOptionsCache() {
  cachedOptions = null;
  cachedAt = 0;
}

export async function getOptions(env) {
  if (cachedOptions && Date.now() - cachedAt < OPTIONS_CACHE_MS) return cachedOptions;
  let options;
  try {
    options = mergeOptions(await all(env, 'SELECT name, value FROM options'));
  } catch (err) {
    // 数据表尚未初始化时使用默认值（其余异常同样降级，但留下日志便于排查）
    console.error('读取站点设置失败，使用默认值：', err && err.message);
    options = { ...DEFAULT_OPTIONS };
  }
  cachedOptions = options;
  cachedAt = Date.now();
  return options;
}

/**
 * 开关型站点设置的取值口径（与主题保持一致）：'0' 表示开启，'1' 表示关闭；
 * 审核类开关（registerReview / commentReview / frontPublishReview）则相反，'1' 表示需要审核。
 * 直接写 options.xxx === '0' 容易读反，统一走这两个函数。
 */
export function optionOn(options, name) {
  return options[name] === '0';
}

/** 审核类开关是否开启（'1' 表示需要审核） */
export function optionRequired(options, name) {
  return options[name] === '1';
}

export async function saveOptions(env, data) {
  clearOptionsCache();
  const names = Object.keys(data);
  if (!names.length) return;
  await env.DB.batch(
    names.map((name) =>
      env.DB.prepare(
        'INSERT INTO options (name, value) VALUES (?, ?) ON CONFLICT(name) DO UPDATE SET value = excluded.value'
      ).bind(name, String(data[name] ?? ''))
    )
  );
}
