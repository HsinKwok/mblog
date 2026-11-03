/**
 * 前台投稿
 */
import {
  getSession,
  backErr,
  all,
  POST_COUNT_COLUMNS,
  noticeOf,
  html,
  optionOn,
  intParam,
  first,
  tagNamesOf,
  errorOf,
  reviewRequired,
  readForm,
  intField,
  field,
  validCategoryId,
  normalizeStatement,
  normalizeVisibility,
  parseTagNames,
  validateTitleContent,
  slugForEdit,
  run,
  insertPost,
  slugify,
  now,
  saveTags,
  backMsg,
  deletePostCascade,
} from '../lib.js';
import { myPostsPage, writePage } from '../theme.js';
import { pageCtx, renderMessage, notFoundPage } from './context.js';

export async function writeRouter(request, env, url) {
  const path = url.pathname;
  const method = request.method;
  const session = await getSession(env, request);
  // 未登录直接回登录页：投稿页全部需要登录态，没必要先跑 pageCtx 的一堆查询
  if (!session) return backErr('/login.html', '请先登录后再投稿');
  const { options, categories, links, nav, hotComments, topics, profile } = await pageCtx(request, env, session);

  // 我的文章
  // 注意：该分支必须在「前台投稿开关」判定之前——开关关闭只应禁止新投稿，
  // 不能连自己已发文章的列表都看不到。
  if (path === '/write/mine' && method === 'GET') {
    const posts = await all(
      env,
      `SELECT p.pid, p.title, p.status, p.is_top, p.created, p.views, c.name AS category_name,
              ${POST_COUNT_COLUMNS}
       FROM post p LEFT JOIN category c ON c.cid = p.category_id
       WHERE p.author_id = ? AND p.is_page = 0
       ORDER BY p.pid DESC`,
      [session.userid]
    );
    return html(
      myPostsPage({
        options,
        session,
        pageTitle: '我的文章',
        posts,
        categories,
        hotComments,
        links,
        nav,
        topics,
        profile,
        notice: noticeOf(url),
      })
    );
  }

  // 与首页发布框 /publish 保持同一口径：开关关闭时「新投稿」对所有人生效（含管理员），
  // 但 /write/edit、/write/delete 属于「管理自己已发文章」的入口，不受该开关影响；
  // /write/save 的新建与编辑要按表单里的 pid 区分，放到该分支内部再判定。
  const publishOpen = optionOn(options, 'frontPublish');
  const editingOwn = path === '/write/edit' && intParam(url, 'id') > 0;
  if (!publishOpen && !editingOwn && path !== '/write/save' && path !== '/write/delete') {
    return renderMessage(request, env, { pageTitle: '投稿未开放', message: '本站暂未开放前台投稿。' });
  }

  // 写文章 / 编辑
  if ((path === '/write' || path === '/write/edit') && method === 'GET') {
    const id = intParam(url, 'id');
    let post = null;
    let tags = [];
    if (id) {
      post = await first(env, 'SELECT * FROM post WHERE pid = ? AND author_id = ? AND is_page = 0', [
        id,
        session.userid,
      ]);
      if (!post) {
        return renderMessage(request, env, {
          pageTitle: '无法编辑',
          message: '文章不存在或不属于你。',
          status: 404,
        });
      }
      tags = await tagNamesOf(env, id);
    }
    return html(
      writePage({
        options,
        session,
        pageTitle: id ? '编辑文章' : '写文章',
        mode: id ? 'edit' : 'create',
        post,
        categories,
        tags,
        error: errorOf(url),
        // 提示文案与保存时的判定口径保持一致（管理员与免审核用户组不走审核）
        review: await reviewRequired(env, options, session, 'frontPublishReview'),
        hotComments,
        links,
        nav,
        topics,
        profile,
      })
    );
  }

  // 保存投稿
  if (path === '/write/save' && method === 'POST') {
    const form = await readForm(request);
    let pid = intField(form, 'pid');
    const title = field(form, 'title').trim();
    const content = field(form, 'content');
    // 分类必须是真实存在的，否则会产出查不到归属的悬空归档（post 表无外键约束，数据库不会拦）
    const categoryId = await validCategoryId(env, intField(form, 'category_id'));
    const statement = normalizeStatement(field(form, 'statement'), optionOn(options, 'frontPublishStatement'));
    const tagNames = parseTagNames(field(form, 'tags'));
    const back = pid ? `/write/edit?id=${pid}` : '/write';
    const fail = (message) => backErr(back, message);

    // 前台投稿开关只约束「新建」；带 pid 的保存是编辑自己已发的文章，开关关闭时仍要放行
    if (!pid && !publishOpen) return fail('本站暂未开放前台投稿。');

    const bad = validateTitleContent(title, content);
    if (bad) return fail(bad);

    // 免审核用户组（如特邀用户）的前台投稿直接发布
    const needReview = await reviewRequired(env, options, session, 'frontPublishReview');
    // 仅当后台开启「前台可见范围」时，写文章页才渲染可见范围选择；
    // 白名单归一化，避免伪造 visibility=x 让私密文章在编辑后被静默转公开
    const visibility = optionOn(options, 'frontPublishScope') ? normalizeVisibility(field(form, 'visibility')) : '';
    let isEdit = false;
    let status;

    if (pid) {
      const own = await first(env, 'SELECT pid, slug, status FROM post WHERE pid = ? AND author_id = ? AND is_page = 0', [
        pid,
        session.userid,
      ]);
      if (!own) return fail('文章不存在或不属于你');
      // slug 建有唯一索引，而详情页按「pid 或 slug」匹配，重名会让链接指错文章，
      // 故写入前排除自己当前别名后再去重（短微博别名由 slugForEdit 原样保留）
      const slug = await slugForEdit(env, own.slug, title, pid);
      // 显式选择优先；未提供时保留原文的私密属性，避免编辑后误公开
      const isPrivate = visibility ? visibility === 'private' : own.status === 'private';
      // 被后台驳回的草稿：开启审核时重新进入待审核；未开启审核时保持草稿状态，
      // 不能因为作者保存一次编辑就静默重新发布。
      status = isPrivate ? 'private' : needReview ? 'pending' : own.status === 'draft' ? 'draft' : 'publish';
      await run(
        env,
        'UPDATE post SET title=?, slug=?, content=?, category_id=?, status=?, statement=?, modified=? WHERE pid=?',
        [title, slug, content, categoryId, status, statement, now(), pid]
      );
      isEdit = true;
    } else {
      status = visibility === 'private' ? 'private' : needReview ? 'pending' : 'publish';
      const res = await insertPost(env, {
        title,
        content,
        slugBase: slugify(title, 'post'),
        categoryId,
        authorId: session.userid,
        status,
        statement,
      });
      pid = res.meta.last_row_id;
    }

    await saveTags(env, pid, tagNames);
    const message =
      status === 'private'
        ? '已保存为私密'
        : needReview
          ? '投稿已提交，等待管理员审核'
          : isEdit
            ? '文章已更新'
            : '文章已发布';
    return backMsg('/write/mine', message);
  }

  // 删除自己的文章
  if (path === '/write/delete' && method === 'POST') {
    const form = await readForm(request);
    const pid = intField(form, 'pid');
    if (pid) {
      const own = await first(env, 'SELECT pid FROM post WHERE pid = ? AND author_id = ? AND is_page = 0', [
        pid,
        session.userid,
      ]);
      if (own) await deletePostCascade(env, pid, { isPage: false });
    }
    return backMsg('/write/mine', '已删除');
  }

  return notFoundPage(request, env, '没有找到该投稿页面。');
}
