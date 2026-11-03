/**
 * 前台评论提交
 */
import {
  readForm,
  intField,
  field,
  first,
  frontUrl,
  isDue,
  backErr,
  validateComment,
  getSession,
  getOptions,
  reviewRequired,
  run,
  now,
  backMsg,
} from '../lib.js';

/** 详情页评论提交后的提示文案（与 submitComment 回跳的 msg 一一对应） */
export const COMMENT_NOTICES = {
  pending: '评论已提交，等待管理员审核后显示。',
  ok: '评论已发布。',
};

export async function submitComment(request, env) {
  const form = await readForm(request);
  const pid = intField(form, 'pid');
  const content = field(form, 'text').trim();
  const post = await first(env, 'SELECT pid, slug, is_page, allow_comment, status, created FROM post WHERE pid = ?', [pid]);
  // 独立页面回 /page/{slug}，文章回 /archives/{pid}；拿不到文章时只能回首页
  const back = post ? frontUrl(post) : '/';
  if (!post || post.status !== 'publish' || !isDue(post.created) || !post.allow_comment) {
    return backErr(back, '无法对该内容发表评论');
  }
  // 与前台 textarea 的 maxlength 同一口径：前端限制可被绕过，服务端必须再校验一次
  const badComment = validateComment(content);
  if (badComment) return backErr(back, badComment);

  const session = await getSession(env, request);
  const options = await getOptions(env);
  const author = session ? session.screenname || session.username : field(form, 'author').trim() || '匿名';
  const mail = session ? session.mail : field(form, 'mail').trim();
  const website = session ? session.url : field(form, 'url').trim();
  // 后台开启「评论需审核」时仅未登录访客与普通组走待审，免审核用户组（如特邀用户）直接通过
  const status = (await reviewRequired(env, options, session, 'commentReview')) ? 'pending' : 'approved';

  await run(
    env,
    'INSERT INTO comment (pid, userid, author, mail, url, content, created, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [pid, session ? session.userid : 0, author, mail, website, content, now(), status]
  );
  return backMsg(back, status === 'pending' ? 'pending' : 'ok');
}
