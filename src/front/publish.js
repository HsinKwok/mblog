/**
 * 首页发布框：发布短微博
 */
import {
  getSession,
  backErr,
  getOptions,
  optionOn,
  readForm,
  field,
  hasContent,
  validateWeibo,
  normalizeVisibility,
  normalizeSchedule,
  normalizeStatement,
  reviewRequired,
  stripTags,
  WEIBO_TITLE_MAX_LENGTH,
  insertPost,
  now,
  saveTags,
  topicNamesIn,
  backMsg,
} from '../lib.js';
import { renderList, PUBLISHED } from './context.js';

export async function publishPost(request, env, url) {
  const session = await getSession(env, request);
  if (!session) return backErr('/login.html', '请先登录后再发布');
  const options = await getOptions(env);
  const fail = (message) =>
    renderList(request, env, new URL('/', url.origin), {
      where: PUBLISHED,
      baseUrl: '/',
      pageTitle: '首页',
      notice: message,
      noticeType: 'err',
    });
  if (!optionOn(options, 'frontPublish')) return fail('本站暂未开放前台发布。');

  const form = await readForm(request);
  const content = field(form, 'content').trim();
  // 只有话题 #...# 与空白时视为空内容
  if (!hasContent(content)) return fail('请输入要发布的内容');
  // 与首页发布框的 maxlength 同一口径（前端限制可被绕过，服务端必须再校验一次）
  const badContent = validateWeibo(content);
  if (badContent) return fail(badContent);

  const visibility =
    optionOn(options, 'frontPublishScope') && normalizeVisibility(field(form, 'visibility')) === 'private'
      ? 'private'
      : 'public';
  const scheduled = optionOn(options, 'frontPublishTimer') ? normalizeSchedule(field(form, 'scheduled_at')) : '';
  const statement = normalizeStatement(field(form, 'statement'), optionOn(options, 'frontPublishStatement'));
  // 私密无需审核；其余按后台「投稿需审核」开关决定是否待审，免审核用户组（如特邀用户）直接发布
  const needReview = await reviewRequired(env, options, session, 'frontPublishReview');
  const status = visibility === 'private' ? 'private' : needReview ? 'pending' : 'publish';
  const title = stripTags(content).slice(0, WEIBO_TITLE_MAX_LENGTH) || '微博';
  // 纯时间戳在同一毫秒内可能重复，insertPost 内部走 uniqueSlug 保证别名不撞车
  const res = await insertPost(env, {
    title,
    content,
    slugBase: 'weibo-' + Date.now().toString(36),
    authorId: session.userid,
    created: scheduled || now(),
    status,
    statement,
  });
  // 正文中的 #话题# 同步落库为标签，便于话题聚合
  const topicNames = topicNamesIn(content);
  if (topicNames.length) await saveTags(env, res.meta.last_row_id, topicNames);

  const message =
    status === 'private'
      ? '已发布，私密可见'
      : status === 'pending'
        ? '已提交，等待管理员审核'
        : scheduled
          ? `已加入定时发布：${scheduled}`
          : '发布成功';
  return backMsg('/', message);
}
