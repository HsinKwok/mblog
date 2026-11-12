/**
 * 前台个人设置
 */
import {
  getSession,
  backErr,
  backMsg,
  withNotice,
  first,
  redirect,
  readForm,
  field,
  saveProfile,
  refreshSession,
  html,
  errorOf,
  noticeOf,
} from '../lib.js';
import { settingsPage } from '../theme.js';
import { pageCtx } from './context.js';

/**
 * 个人设置：登录用户只能读写自己那一行（userid 取自会话，不接受表单传入），
 * 用户名与角色不可修改（属管理员权限），改密需校验当前密码。
 */
export async function settingsRouter(request, env, url) {
  const session = await getSession(env, request);
  if (!session) return backErr('/login.html', '请先登录后再修改资料');

  const back = (key, message) => withNotice('/settings', key, message);
  const me = await first(env, 'SELECT * FROM user WHERE userid = ?', [session.userid]);
  if (!me) return redirect('/logout');

  if (request.method === 'POST') {
    const form = await readForm(request);
    const screenname = field(form, 'screenname').trim();
    const mail = field(form, 'mail').trim();
    const homepage = field(form, 'url').trim();
    const headpic = field(form, 'headpic').trim();
    const oldPassword = field(form, 'oldpassword');
    const password = field(form, 'password');
    const confirm = field(form, 'password2');

    const error = await saveProfile(env, me, {
      screenname,
      mail,
      url: homepage,
      headpic,
      oldPassword,
      password,
      confirm,
    });
    if (error) return back('err', error);
    // 改密会让会话里的口令指纹失效：用最新用户行重签当前会话，避免保存后被自己登出
    return backMsg('/settings', '个人资料已保存', await refreshSession(env, session.userid));
  }

  const { options, categories, links, nav, hotComments, topics, profile } = await pageCtx(request, env, session);
  return html(
    settingsPage({
      options,
      session: { ...session, screenname: me.screenname, mail: me.mail, url: me.url, headpic: me.headpic },
      pageTitle: '个人设置',
      error: errorOf(url),
      notice: noticeOf(url),
      categories,
      hotComments,
      links,
      nav,
      topics,
      profile,
    })
  );
}
