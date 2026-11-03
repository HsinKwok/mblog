import { all, changed, first, placeholders, run } from './db.js';
import { slugify, uniqueSlug } from './text.js';
import { now, NOW_SQL } from './time.js';

/**
 * 信息流、详情页与后台列表共用的互动计数列：已通过评论数 / 点赞数 / 已发布转发数。
 * 依赖 post 表的别名必须为 p；与 POST_DETAIL_COLUMNS 一并使用，避免详情页缺列导致计数恒为 0。
 */
export const POST_COUNT_COLUMNS = `(SELECT COUNT(*) FROM comment cm WHERE cm.pid = p.pid AND cm.status = 'approved') AS comments_num,
            (SELECT COUNT(*) FROM post_like pl WHERE pl.pid = p.pid) AS likes_num,
            (SELECT COUNT(*) FROM post rp WHERE rp.repost_pid = p.pid AND rp.status = 'publish' AND rp.created <= ${NOW_SQL}) AS reposts_num`;

/**
 * 分类 id 归一化：post 表没有外键约束，非法 id 会被静默写进 category_id，
 * 产出前台查不到归属、后台分类列表也统计不到的悬空归档。
 * 故写入前统一校验存在性，不存在（含未提交 / 非数字）时回退 0（UNCATEGORIZED_NAME）。
 */
export async function validCategoryId(env, raw) {
  const id = Number.parseInt(raw, 10) || 0;
  if (!id) return 0;
  const row = await first(env, 'SELECT cid FROM category WHERE cid = ?', [id]);
  return row ? id : 0;
}

/**
 * 文章 / 独立页的统一新增入口（前台发布、前台投稿、转发、后台文章与页面共用）。
 * slug 冲突兜底：uniqueSlug 的查重与本次插入之间存在并发窗口，一旦命中
 * post.slug 的部分唯一索引就换一个别名重试一次，避免把并发冲突暴露成 500。
 * created 允许传入定时发布时间；status / is_page 等缺省值与各调用处的旧实现保持一致。
 */
export async function insertPost(
  env,
  {
    title,
    content,
    slugBase,
    categoryId = 0,
    authorId,
    created = now(),
    status = 'publish',
    allowComment = 1,
    isPage = 0,
    isTop = 0,
    statement = '',
    repostPid = 0,
  } = {}
) {
  const sql = `INSERT INTO post (title, slug, content, statement, category_id, author_id, created, modified, status, allow_comment, is_page, is_top, repost_pid)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
  let slug = await uniqueSlug(env, slugBase);
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await run(env, sql, [
        title,
        slug,
        content,
        statement,
        categoryId,
        authorId,
        created,
        now(),
        status,
        allowComment,
        isPage,
        isTop,
        repostPid,
      ]);
    } catch (err) {
      if (attempt < 3 && /UNIQUE/i.test(String(err && err.message))) {
        slug = `${slug}-${Date.now().toString(36)}`;
        continue;
      }
      throw err;
    }
  }
}

/**
 * 删除文章 / 独立页面并清理其标签、评论、点赞关联；他人对该文的转发则解除引用，避免孤儿转发。
 * isPage 非 null 时按内容类型限定删除范围：否则构造请求拿文章 id 就能删掉同号的独立页面。
 * 目标行不存在（或类型不匹配）时直接返回，不再清理关联数据。
 */
export async function deletePostCascade(env, pid, { isPage = null } = {}) {
  const scope = isPage === null ? '' : ' AND is_page = ?';
  const res = await run(env, `DELETE FROM post WHERE pid = ?${scope}`, isPage === null ? [pid] : [pid, isPage ? 1 : 0]);
  if (!changed(res)) return res;
  await run(env, 'DELETE FROM post_tag WHERE pid = ?', [pid]);
  await run(env, 'DELETE FROM comment WHERE pid = ?', [pid]);
  await run(env, 'DELETE FROM post_like WHERE pid = ?', [pid]);
  // 转发源已不存在，把转发降级为普通微博（repost_pid = 0），保留他人内容
  await run(env, 'UPDATE post SET repost_pid = 0 WHERE repost_pid = ?', [pid]);
  return res;
}

/** 解析标签名到 tid：不存在则按别名创建；并发命中唯一约束时回查已存在的那条 */
async function resolveTagId(env, name) {
  const byName = await first(env, 'SELECT tid FROM tag WHERE name = ?', [name]);
  if (byName) return byName.tid;
  const slug = slugify(name, 'tag');
  const bySlug = await first(env, 'SELECT tid FROM tag WHERE slug = ?', [slug]);
  if (bySlug) return bySlug.tid;
  try {
    const res = await run(env, 'INSERT INTO tag (name, slug) VALUES (?, ?)', [name, slug]);
    return res.meta.last_row_id;
  } catch (err) {
    // 上面的查重与这里的写入之间存在并发窗口，由 tag.name / tag.slug 的唯一约束兜底
    if (!/UNIQUE/i.test(String(err && err.message))) throw err;
    const existing = await first(env, 'SELECT tid FROM tag WHERE name = ? OR slug = ?', [name, slug]);
    if (!existing) throw err;
    return existing.tid;
  }
}

/**
 * 写入文章标签（整体替换该文章的标签关联）。
 * 先把全部标签解析/创建完成，再动 post_tag：中途失败时原有标签仍然保留，不会被清空。
 */
export async function saveTags(env, pid, names) {
  const tids = [];
  for (const name of names) {
    const tid = await resolveTagId(env, name);
    if (tid && !tids.includes(tid)) tids.push(tid);
  }
  if (!tids.length) {
    await run(env, 'DELETE FROM post_tag WHERE pid = ?', [pid]);
    return;
  }
  const marks = placeholders(tids.length);
  await run(env, `DELETE FROM post_tag WHERE pid = ? AND tid NOT IN (${marks})`, [pid, ...tids]);
  for (const tid of tids) {
    await run(env, 'INSERT OR IGNORE INTO post_tag (pid, tid) VALUES (?, ?)', [pid, tid]);
  }
}

/** 读取某篇文章已绑定的标签名 */
export async function tagNamesOf(env, pid) {
  const rows = await all(
    env,
    'SELECT t.name FROM post_tag pt JOIN tag t ON t.tid = pt.tid WHERE pt.pid = ?',
    [pid]
  );
  return rows.map((t) => t.name);
}

/** 点赞 / 取消点赞，返回最新点赞数与是否已赞 */
export async function toggleLike(env, pid, userid) {
  const exist = await first(env, 'SELECT lid FROM post_like WHERE pid = ? AND userid = ?', [pid, userid]);
  if (exist) {
    await run(env, 'DELETE FROM post_like WHERE lid = ?', [exist.lid]);
  } else {
    // 读后写之间存在并发窗口（同一用户连点两次）：交给 UNIQUE(pid, userid) 兜底，
    // 冲突时仍按「已点赞」返回，而不是把唯一约束异常抛成 500
    await run(env, 'INSERT OR IGNORE INTO post_like (pid, userid, created) VALUES (?, ?, ?)', [pid, userid, now()]);
  }
  const row = await first(env, 'SELECT COUNT(*) c FROM post_like WHERE pid = ?', [pid]);
  return { liked: !exist, count: row?.c || 0 };
}

/** 关注 / 取消关注，返回最新粉丝数与是否已关注 */
export async function toggleFollow(env, userid, targetId) {
  if (!targetId || userid === targetId) return { following: false, count: 0, skipped: true };
  const exist = await first(env, 'SELECT fid FROM follow WHERE userid = ? AND target_id = ?', [userid, targetId]);
  if (exist) {
    await run(env, 'DELETE FROM follow WHERE fid = ?', [exist.fid]);
  } else {
    // 与 toggleLike 同理：并发重复关注由 UNIQUE(userid, target_id) 兜底
    await run(env, 'INSERT OR IGNORE INTO follow (userid, target_id, created) VALUES (?, ?, ?)', [userid, targetId, now()]);
  }
  const row = await first(env, 'SELECT COUNT(*) c FROM follow WHERE target_id = ?', [targetId]);
  return { following: !exist, count: row?.c || 0 };
}
