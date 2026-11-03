/**
 * 前台审核中心
 */
import {
  getSession,
  backErr,
  groupReviewPerms,
  withNotice,
  readForm,
  intField,
  field,
  first,
  deletePostCascade,
  run,
  now,
  validateTitleContent,
  slugForEdit,
  validateComment,
  totalPagesOf,
  intParam,
  all,
  html,
  noticeOf,
  errorOf,
} from '../lib.js';
import { reviewPage } from '../theme.js';
import { pageCtx, renderMessage, notFoundPage } from './context.js';

/** 审核中心两个待审列表的每页条数 */
export const REVIEW_PAGE_SIZE = 20;

/**
 * 前台审核中心：集中处理待审核的前台投稿（post.status = 'pending'）与评论（comment.status = 'pending'）。
 * 入口与能力由用户组权限控制（后台「组别管理 → 权限设置」）：
 * can_review = 可进入并审核；can_edit = 可在通过前修改待审内容。管理员始终具备两项权限。
 */
export async function reviewRouter(request, env, url) {
  const path = url.pathname;
  const method = request.method;
  const session = await getSession(env, request);
  if (!session) return backErr('/login.html', '请先登录后再审核');
  const { options, categories, links, nav, hotComments, topics, profile, groups } = await pageCtx(request, env, session);
  const { canReview, canEdit } = groupReviewPerms(groups, session);
  if (!canReview) {
    return renderMessage(request, env, { pageTitle: '无权访问', message: '你没有审核权限。', status: 403 });
  }
  const back = (key, message) => withNotice('/review', key, message);

  // 待审投稿：通过 / 编辑后通过（需 can_edit）/ 驳回（退回作者草稿）/ 删除
  if (path === '/review/post' && method === 'POST') {
    const form = await readForm(request);
    const pid = intField(form, 'pid');
    const action = field(form, 'action');
    const post = pid
      ? await first(env, "SELECT pid, slug FROM post WHERE pid = ? AND is_page = 0 AND status = 'pending'", [pid])
      : null;
    if (!post) return back('err', '该投稿不在待审核状态');

    if (action === 'delete') {
      await deletePostCascade(env, pid, { isPage: false });
      return back('msg', '已删除该投稿');
    }
    if (action === 'reject') {
      // 带上 status 条件：否则并发的另一次审核（如已通过）会被这次驳回改回草稿
      await run(env, "UPDATE post SET status = 'draft', modified = ? WHERE pid = ? AND status = 'pending'", [now(), pid]);
      return back('msg', '已驳回，退回作者草稿');
    }
    if (action === 'save' && canEdit) {
      const title = field(form, 'title').trim();
      const content = field(form, 'content');
      // 与前台投稿、后台编辑同一口径（含正文长度上限）
      const bad = validateTitleContent(title, content);
      if (bad) return back('err', bad);
      // 与前台投稿保存同一口径：短微博别名保持 weibo- 前缀，其余按新标题重新生成
      const slug = await slugForEdit(env, post.slug, title, pid);
      await run(env, "UPDATE post SET title = ?, slug = ?, content = ?, status = ?, modified = ? WHERE pid = ? AND status = 'pending'", [
        title,
        slug,
        content,
        'publish',
        now(),
        pid,
      ]);
      return back('msg', '已修改并通过，文章已发布');
    }
    if (action === 'approve') {
      await run(env, "UPDATE post SET status = 'publish', modified = ? WHERE pid = ? AND status = 'pending'", [now(), pid]);
      return back('msg', '投稿已通过并发布');
    }
    // 表单允许提交「编辑后通过」但当前用户组无 can_edit：给出明确原因，不要落回「未知操作」
    if (action === 'save') return back('err', '你没有修改待审内容的权限');
    return back('err', '未知操作');
  }

  // 待审评论：通过 / 编辑后通过（需 can_edit）/ 删除
  if (path === '/review/comment' && method === 'POST') {
    const form = await readForm(request);
    const coid = intField(form, 'coid');
    const action = field(form, 'action');
    const comment = coid
      ? await first(env, "SELECT coid FROM comment WHERE coid = ? AND status = 'pending'", [coid])
      : null;
    if (!comment) return back('err', '该评论不在待审核状态');

    if (action === 'delete') {
      await run(env, 'DELETE FROM comment WHERE coid = ?', [coid]);
      return back('msg', '已删除该评论');
    }
    if (action === 'save' && canEdit) {
      const content = field(form, 'content').trim();
      // 与前台提交评论共用同一套校验口径
      const badComment = validateComment(content);
      if (badComment) return back('err', badComment);
      await run(env, "UPDATE comment SET content = ?, status = 'approved' WHERE coid = ? AND status = 'pending'", [content, coid]);
      return back('msg', '已修改并通过');
    }
    if (action === 'approve') {
      await run(env, "UPDATE comment SET status = 'approved' WHERE coid = ? AND status = 'pending'", [coid]);
      return back('msg', '评论已通过');
    }
    if (action === 'save') return back('err', '你没有修改待审内容的权限');
    return back('err', '未知操作');
  }

  if (path === '/review' && method === 'GET') {
    // 两个列表各自分页（pp / cp）：原先固定 LIMIT 100，超过 100 条的待审内容永远翻不到
    const per = REVIEW_PAGE_SIZE;
    const [postRow, commentRow] = await Promise.all([
      first(env, "SELECT COUNT(*) AS n FROM post WHERE status = 'pending' AND is_page = 0"),
      first(env, "SELECT COUNT(*) AS n FROM comment WHERE status = 'pending'"),
    ]);
    const postTotal = Number(postRow?.n || 0);
    const commentTotal = Number(commentRow?.n || 0);
    const postPages = totalPagesOf(postTotal, per);
    const commentPages = totalPagesOf(commentTotal, per);
    // 页码越界时回退到最后一页，避免删完当前页后停在空白页
    const pp = Math.min(Math.max(1, intParam(url, 'pp', 1)), postPages);
    const cp = Math.min(Math.max(1, intParam(url, 'cp', 1)), commentPages);
    const [posts, comments] = await Promise.all([
      all(
        env,
        `SELECT p.pid, p.title, p.content, p.created, u.screenname, u.username
         FROM post p LEFT JOIN user u ON u.userid = p.author_id
         WHERE p.status = 'pending' AND p.is_page = 0
         ORDER BY p.pid DESC LIMIT ? OFFSET ?`,
        [per, (pp - 1) * per]
      ),
      all(
        env,
        `SELECT cm.coid, cm.pid, cm.author, cm.content, cm.created, p.title AS post_title, p.is_page, p.slug
         FROM comment cm LEFT JOIN post p ON p.pid = cm.pid
         WHERE cm.status = 'pending'
         ORDER BY cm.coid DESC LIMIT ? OFFSET ?`,
        [per, (cp - 1) * per]
      ),
    ]);
    return html(
      reviewPage({
        options,
        session,
        pageTitle: '审核中心',
        posts,
        comments,
        postPage: pp,
        postPages,
        postTotal,
        commentPage: cp,
        commentPages,
        commentTotal,
        canEdit,
        categories,
        hotComments,
        links,
        nav,
        topics,
        profile,
        notice: noticeOf(url),
        error: errorOf(url),
      })
    );
  }

  return notFoundPage(request, env, '没有找到该审核页面。');
}
