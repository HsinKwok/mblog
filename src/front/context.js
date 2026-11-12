/**
 * 前台公共上下文：公共数据、页面上下文、列表 / 详情渲染与登录、提示页
 */
import {
  html,
  getOptions,
  getSession,
  getGroups,
  badgeOf,
  avatarFor,
  groupReviewPerms,
  all,
  first,
  run,
  batchAll,
  pageParam,
  totalPagesOf,
  clampPage,
  NOW_SQL,
  POST_COUNT_COLUMNS,
  placeholders,
  decodeSlug,
  optionOn,
  optionRequired,
  errorOf,
  noticeOf,
  POST_STATUS_LABEL,
  isDue,
  numericKey,
  readCookie,
  backErr,
} from '../lib.js';
import { listPage, messagePage, authPage, singlePage } from '../theme.js';
import { COMMENT_NOTICES } from './comment.js';

/* ---------------- 公共数据 ---------------- */

// 侧栏热门话题的实例内缓存（60 秒）：三表 JOIN + GROUP BY，是公共查询里最重的一条
const TOPICS_TTL_MS = 60000;
let cachedTopics = null;
let cachedTopicsAt = 0;

/**
 * 公共查询批量执行：列表 / 顶栏 / 侧栏 / 资料卡计数合并为一次 D1 batch 往返。
 * batch 失败时退回逐条查询并容忍缺表，旧库尚未升级时仍能渲染。
 */
async function batchCommon(env, queries) {
  try {
    return await batchAll(env, queries);
  } catch {
    return await Promise.all(queries.map(({ sql, params = [] }) => all(env, sql, params).catch(() => [])));
  }
}

/** 未登录时的站点资料卡 */
function siteProfile(options) {
  return {
    mode: 'site',
    name: options.yourNickname || options.title,
    avatar: options.headImgUrl || options.faviconUrl || '',
    desc: options.yourDescription || options.description,
  };
}

/** 登录用户的资料卡（计数由首屏 batch 一次性取回，不再串行三次查询） */
function userProfile(session, levels, groups, postCount, followingCount, followersCount) {
  return {
    mode: 'user',
    name: session.screenname || session.username,
    avatar: avatarFor(session, 120),
    desc: session.url || `@${session.username}`,
    isAdmin: session.role === 'administrator',
    // 审核权限：由用户组决定，前台据此显示「审核中心」入口（管理员始终具备）
    ...groupReviewPerms(groups, session),
    // 等级徽章：图标集由用户组决定（只占一个图标位），等级后台手动指定优先，否则按已发布微博数自动匹配
    badge: badgeOf(levels, groups, { levelId: session.level_id, postCount, groupId: session.group_id }),
    // 荣誉图标：用户上存的图标名，前台自动匹配 .png / .gif
    honor: session.honor || '',
    stats: [
      { label: '微博', value: postCount, href: '/write/mine' },
      { label: '关注', value: followingCount },
      { label: '粉丝', value: followersCount },
    ],
  };
}

/**
 * 公共查询清单。单独拆出来是因为列表页要把这几条与 COUNT / 列表合并进同一个 batch，
 * 把原本「取会话 → 公共数据 → 列表」的三次串行往返压成一次。
 */
function commonSpecs(session = null, preloadedGroups = null) {
  const specs = [
    { key: 'categories', sql: 'SELECT * FROM category ORDER BY ordernum, cid' },
    { key: 'links', sql: 'SELECT * FROM link ORDER BY ordernum, lid' },
    // 前台顶栏导航：后台「导航管理」维护；为空时前台回退内置默认导航
    { key: 'nav', sql: 'SELECT * FROM nav ORDER BY ordernum, nid' },
    {
      key: 'hotComments',
      sql: `SELECT cm.coid, cm.pid, cm.author, cm.mail, cm.content, p.is_page, p.slug
       FROM comment cm JOIN post p ON p.pid = cm.pid
       WHERE cm.status = 'approved' AND p.status = 'publish'
         AND p.is_page = 0 AND p.created <= ${NOW_SQL}
       ORDER BY cm.coid DESC LIMIT 6`,
    },
    // 微博等级（后台「等级管理」维护）：用户徽章据此解析
    { key: 'levels', sql: 'SELECT * FROM user_level ORDER BY ordernum, min_posts, lid' },
  ];
  // 热门话题要对 tag / post_tag / post 三表做 JOIN + GROUP BY，是公共查询里最重的一条：
  // 侧栏数据不要求实时，单实例内缓存 60 秒，避免每次请求都重算
  const topicsFresh = cachedTopics && Date.now() - cachedTopicsAt < TOPICS_TTL_MS;
  if (!topicsFresh) {
    specs.push({
      key: 'topics',
      sql: `SELECT t.name, t.slug, COUNT(DISTINCT pt.pid) c
       FROM tag t
       JOIN post_tag pt ON pt.tid = t.tid
       JOIN post p ON p.pid = pt.pid AND p.status = 'publish' AND p.is_page = 0
         AND p.created <= ${NOW_SQL}
       GROUP BY t.tid, t.name, t.slug
       ORDER BY c DESC, t.tid LIMIT 10`,
    });
  }
  // 用户组（后台「用户组管理」维护）：决定等级徽章使用哪一套图标；调用方已查过时直接复用
  if (!preloadedGroups) {
    specs.push({ key: 'groups', sql: 'SELECT * FROM user_group ORDER BY ordernum, gid' });
  }
  // 登录用户的微博 / 关注 / 粉丝计数与公共查询同批返回，省去资料卡的串行查询
  if (session) {
    specs.push(
      {
        key: 'myPosts',
        sql: `SELECT COUNT(*) c FROM post WHERE author_id = ? AND is_page = 0 AND status = 'publish' AND created <= ${NOW_SQL}`,
        params: [session.userid],
      },
      { key: 'myFollowing', sql: 'SELECT COUNT(*) c FROM follow WHERE userid = ?', params: [session.userid] },
      { key: 'myFollowers', sql: 'SELECT COUNT(*) c FROM follow WHERE target_id = ?', params: [session.userid] }
    );
  }
  return { specs, topicsFresh };
}

/** 把公共查询结果整理成页面上下文数据（与 commonSpecs 配对，rows 可含其它语句的返回值） */
function assembleCommon(specs, rows, { options, session, preloadedGroups, topicsFresh }) {
  const data = Object.fromEntries(specs.map((spec, i) => [spec.key, rows[i] || []]));
  // 命中缓存时沿用上次结果，未命中则把本次查询结果写入缓存
  if (topicsFresh) data.topics = cachedTopics;
  else {
    cachedTopics = data.topics;
    cachedTopicsAt = Date.now();
  }
  const levels = data.levels;
  const groups = preloadedGroups || data.groups || [];
  const profile = session
    ? userProfile(
        session,
        levels,
        groups,
        data.myPosts?.[0]?.c || 0,
        data.myFollowing?.[0]?.c || 0,
        data.myFollowers?.[0]?.c || 0
      )
    : siteProfile(options);
  return {
    options,
    categories: data.categories,
    links: data.links,
    nav: data.nav,
    hotComments: data.hotComments,
    topics: data.topics,
    profile,
    levels,
    groups,
  };
}

export async function commonData(env, session = null, preloadedGroups = null) {
  const { specs, topicsFresh } = commonSpecs(session, preloadedGroups);
  const [options, rows] = await Promise.all([getOptions(env), batchCommon(env, specs)]);
  return assembleCommon(specs, rows, { options, session, preloadedGroups, topicsFresh });
}

/**
 * 前台页面上下文：会话与公共数据一次取回，返回 { session, ...公共数据 }。
 * 各页面按需解构自己用得到的字段，省去每处重复的「取会话 → 查公共数据」；
 * 需要先做登录校验的入口可自行取会话后再传入（传 null 表示已确认未登录，不再重复查库）；
 * preloadedGroups 供上游已查过用户组的场景复用，省一次查询。
 */
export async function pageCtx(request, env, session, preloadedGroups = null) {
  const current = session === undefined ? await getSession(env, request) : session;
  return { session: current, ...(await commonData(env, current, preloadedGroups)) };
}

/**
 * 提示页 / 登录页 / 404 只需要站点设置与顶部导航，
 * 不必为它们跑分类、友链、热门评论、热门话题、等级、用户组与资料卡计数整套查询。
 */
export async function minimalData(env) {
  const [options, navRows] = await Promise.all([
    getOptions(env),
    all(env, 'SELECT * FROM nav ORDER BY ordernum, nid').catch(() => []),
  ]);
  return { options, nav: navRows };
}

/* ---------------- 匿名访问的边缘缓存 ---------------- */

const EDGE_TTL = 60; // 内容新鲜期
const EDGE_STALE = 300; // 过期后仍可继续返回的时长（手工实现 stale-while-revalidate）

/** 对外响应：去掉内部时间戳，并按新鲜期给浏览器一个较短的缓存时间 */
function edgeServe(entry, ttl) {
  const headers = new Headers(entry.headers);
  headers.delete('x-render-at');
  headers.set('cache-control', `public, max-age=${ttl}`);
  return new Response(entry.body, { status: entry.status, headers });
}

/** 写入边缘缓存：剥掉 Set-Cookie（Cache API 会拒绝存储带 Set-Cookie 的响应） */
function edgeStore(cache, key, res, ttl, stale) {
  const headers = new Headers(res.headers);
  headers.delete('set-cookie');
  // 明确按 Cookie 区分，避免任何中间缓存把它发给已登录访客
  headers.set('vary', 'Cookie');
  // 存储期要覆盖「新鲜期 + 陈旧期」，否则后台刷新还没写完条目就过期了
  headers.set('cache-control', `public, max-age=${ttl + stale}`);
  headers.set('x-render-at', String(Date.now()));
  const out = new Response(res.body, { status: 200, headers });
  return { out, write: cache.put(key, out.clone()).catch(() => {}) };
}

/**
 * 列表页 / 详情页 / 静态信息页的边缘缓存：只对「没有会话 Cookie」的 GET 请求生效。
 * 这类页面的内容与访客身份无关（左栏是站点资料卡，卡片上没有点赞 / 关注状态），
 * 可以整页缓存；带会话的请求直接透传，保证登录态与后台改动即时可见。
 *
 * 过期后不阻塞访客：先返回旧内容，再在 waitUntil 里重新渲染并写回。
 * Cache API 本身不支持 stale-while-revalidate，这里按 x-render-at 时间戳手工实现。
 */
export async function edgeCached(request, ctx, render, options = {}) {
  const ttl = options.ttl ?? EDGE_TTL;
  const stale = options.stale ?? EDGE_STALE;
  if (request.method !== 'GET' || readCookie(request, 'mblog_session')) return render();
  if (typeof caches === 'undefined' || !caches.default) return render();
  const key = new Request(new URL(request.url).toString(), { method: 'GET' });
  const cache = caches.default;
  const hit = await cache.match(key);
  if (hit) {
    const age = (Date.now() - (Number(hit.headers.get('x-render-at')) || 0)) / 1000;
    if (age < ttl) return edgeServe(hit, ttl);
    if (age < ttl + stale) {
      const refresh = (async () => {
        try {
          const res = await render();
          if (res.status !== 200) return;
          await edgeStore(cache, key, res, ttl, stale).write;
        } catch {
          // 后台刷新失败就继续用旧内容，等下一次请求再试
        }
      })();
      if (ctx && typeof ctx.waitUntil === 'function') ctx.waitUntil(refresh);
      return edgeServe(hit, ttl);
    }
  }
  const res = await render();
  if (res.status !== 200) return res;
  const { out, write } = edgeStore(cache, key, res, ttl, stale);
  if (ctx && typeof ctx.waitUntil === 'function') ctx.waitUntil(write);
  else await write;
  return edgeServe(out, ttl);
}

/**
 * 左栏个人卡数据：未登录展示后台「站点设置 → 头部资料卡」的昵称 / 简介 / 头像，
 * 未填写时回退「站点设置」的站点名称与简介；
 * 卡片上的站点地址与资料卡按钮、菜单由视图层直接读取 options 渲染；
 * 登录后展示当前登录用户自己的资料与互动数据。
 */
export async function profileData(env, session, options, levels = [], groups = []) {
  if (!session) return siteProfile(options);
  const uid = session.userid;
  const [postRow, followingRow, followersRow] = await Promise.all([
    first(
      env,
      `SELECT COUNT(*) c FROM post WHERE author_id = ? AND is_page = 0 AND status = 'publish' AND created <= ${NOW_SQL}`,
      [uid]
    ),
    first(env, 'SELECT COUNT(*) c FROM follow WHERE userid = ?', [uid]),
    first(env, 'SELECT COUNT(*) c FROM follow WHERE target_id = ?', [uid]),
  ]);
  return userProfile(session, levels, groups, postRow?.c || 0, followingRow?.c || 0, followersRow?.c || 0);
}

/**
 * 解析各行作者的等级徽章文件名（写入 row.author_badge）。
 * 依赖查询里附带的 author_level_id（手动指定等级，0 为自动）、author_posts（已发布微博数）
 * 与 author_group_id（所属用户组，决定图标集）；row.author_honor 为作者上存的荣誉图标名。
 */
export function attachAuthorBadges(rows, levels = [], groups = []) {
  for (const row of rows) {
    row.author_badge = badgeOf(levels, groups, {
      levelId: row.author_level_id,
      postCount: row.author_posts,
      groupId: row.author_group_id,
    });
  }
  return rows;
}

/**
 * 列表页的 COUNT / 列表 SQL。单独拆出是因为列表页要把这两条与公共数据合并进同一个 batch：
 * 「取会话 → 公共数据 → 列表」原来的三次串行往返，合并后只需一次。
 * 标签用 json_group_array 聚合进列表行，省掉后续 decoratePosts 的那一轮往返。
 */
function feedQueries(url, { where, params = [], size = 10, session = null }) {
  const per = Math.floor(Number(size)) > 0 ? Math.floor(Number(size)) : 1;
  const requested = pageParam(url);
  const countSql = `SELECT COUNT(*) c FROM post p WHERE ${where}`;
  // 登录用户的点赞 / 关注状态用相关子查询一并取回：都有对应索引，代价远小于再跑一趟 D1 往返
  const mine = session
    ? `,
            (SELECT 1 FROM post_like pl WHERE pl.pid = p.pid AND pl.userid = ?) AS liked,
            (SELECT 1 FROM follow f2 WHERE f2.userid = ? AND f2.target_id = p.author_id) AS followed`
    : '';
  const mineParams = session ? [session.userid, session.userid] : [];
  const listSql = `SELECT p.*, c.name AS category_name, c.slug AS category_slug,
            u.screenname, u.headpic AS author_headpic, u.mail AS author_mail, u.level_id AS author_level_id,
            u.group_id AS author_group_id, u.honor AS author_honor,
            (SELECT COUNT(*) FROM post ap WHERE ap.author_id = p.author_id AND ap.is_page = 0 AND ap.status = 'publish' AND ap.created <= ${NOW_SQL}) AS author_posts,
            (SELECT COALESCE(json_group_array(json_object('name', t2.name, 'slug', t2.slug)), '[]')
               FROM post_tag pt2 JOIN tag t2 ON t2.tid = pt2.tid WHERE pt2.pid = p.pid) AS tag_json,
            (SELECT json_object('pid', sp.pid, 'title', sp.title, 'content', sp.content, 'screenname', su.screenname)
               FROM post sp LEFT JOIN user su ON su.userid = sp.author_id
               WHERE sp.pid = p.repost_pid AND sp.status = 'publish'
                 AND sp.is_page = 0 AND sp.created <= ${NOW_SQL}) AS repost_json${mine},
            ${POST_COUNT_COLUMNS}
     FROM post p
     LEFT JOIN category c ON c.cid = p.category_id
     LEFT JOIN user u ON u.userid = p.author_id
     WHERE ${where}
     ORDER BY p.is_top DESC, p.created DESC, p.pid DESC
     LIMIT ? OFFSET ?`;
  return {
    per,
    requested,
    params,
    mineParams,
    countSql,
    listSql,
    countParams: params,
    listParams: [...mineParams, ...params, per, (requested - 1) * per],
  };
}

/** 收尾：按 COUNT 结果夹页（越界才补一次查询），补作者徽章与卡片附加数据 */
async function finishFeed(env, q, countRows, firstRows, session, levels, groups) {
  const total = countRows[0]?.c || 0;
  const totalPages = totalPagesOf(total, q.per);
  const current = clampPage(q.requested, totalPages);
  const rows =
    current === q.requested
      ? firstRows
      : await all(env, q.listSql, [...q.mineParams, ...q.params, q.per, (current - 1) * q.per]);
  attachAuthorBadges(rows, levels, groups);
  await decoratePosts(env, rows, session);
  return { rows, total, totalPages, page: current };
}

export async function fetchPosts(env, url, { where, params = [], size = 10, session = null, levels = [], groups = [] }) {
  const q = feedQueries(url, { where, params, size, session });
  // COUNT 与当前页数据合并为一次 batch 往返；越界页码才补一次查询，
  // 正常翻页（含最常见的第 1 页）只需一次 D1 往返。
  let countRows;
  let firstRows;
  try {
    const [countRes, rowsRes] = await batchAll(env, [
      { sql: q.countSql, params: q.countParams },
      { sql: q.listSql, params: q.listParams },
    ]);
    countRows = countRes;
    firstRows = rowsRes;
  } catch {
    const [countRow, rows] = await Promise.all([
      first(env, q.countSql, q.countParams),
      all(env, q.listSql, q.listParams),
    ]);
    countRows = countRow ? [countRow] : [];
    firstRows = rows;
  }
  return finishFeed(env, q, countRows, firstRows, session, levels, groups);
}

/** 补充信息流卡片所需数据：标签、当前用户点赞/关注状态、转发源文章（合并为一次 batch） */
export async function decoratePosts(env, rows, session) {
  if (!rows.length) return rows;
  const ids = rows.map((r) => r.pid);
  // 列表 SQL 已把标签 / 转发源 / 点赞关注状态一并带回时，这里不会再发任何查询（0 次往返）
  const preTagged = typeof rows[0].tag_json === 'string';
  const preDecorated = preTagged && 'liked' in rows[0];
  const queries = [];
  if (!preTagged) {
    queries.push({
      key: 'tags',
      sql: `SELECT pt.pid, t.name, t.slug FROM post_tag pt JOIN tag t ON t.tid = pt.tid WHERE pt.pid IN (${placeholders(ids.length)})`,
      params: ids,
    });
  }
  if (session && !preDecorated) {
    queries.push({
      key: 'liked',
      sql: `SELECT pid FROM post_like WHERE userid = ? AND pid IN (${placeholders(ids.length)})`,
      params: [session.userid, ...ids],
    });
    const authorIds = [...new Set(rows.map((r) => r.author_id).filter((v) => v && v !== session.userid))];
    if (authorIds.length) {
      queries.push({
        key: 'followed',
        sql: `SELECT target_id FROM follow WHERE userid = ? AND target_id IN (${placeholders(authorIds.length)})`,
        params: [session.userid, ...authorIds],
      });
    }
  }
  const repostIds = [...new Set(rows.filter((r) => r.repost_pid).map((r) => r.repost_pid))];
  if (!preTagged && repostIds.length) {
    queries.push({
      key: 'sources',
      sql: `SELECT p.pid, p.title, p.content, u.screenname
       FROM post p LEFT JOIN user u ON u.userid = p.author_id
       WHERE p.pid IN (${placeholders(repostIds.length)}) AND p.status = 'publish'
         AND p.is_page = 0 AND p.created <= ${NOW_SQL}`,
      params: repostIds,
    });
  }

  let results;
  try {
    results = queries.length ? await batchAll(env, queries) : [];
  } catch {
    results = await Promise.all(queries.map((q) => all(env, q.sql, q.params)));
  }
  const data = Object.fromEntries(queries.map((q, i) => [q.key, results[i] || []]));

  if (preTagged) {
    for (const row of rows) {
      let tags = [];
      try {
        tags = JSON.parse(row.tag_json) || [];
      } catch {
        tags = [];
      }
      row.tags = tags.filter((t) => t && t.name);
      // 聚合用的中间字段不留在行对象上，避免混进模板
      delete row.tag_json;
    }
  } else {
    const tagRows = data.tags || [];
    for (const row of rows) row.tags = tagRows.filter((t) => t.pid === row.pid);
  }

  if (session) {
    if (preDecorated) {
      for (const row of rows) {
        row.liked = !!row.liked;
        row.followed = !!row.followed;
      }
    } else {
      const likedIds = new Set((data.liked || []).map((r) => r.pid));
      const followedIds = new Set((data.followed || []).map((r) => r.target_id));
      for (const row of rows) {
        row.liked = likedIds.has(row.pid);
        row.followed = followedIds.has(row.author_id);
      }
    }
  } else {
    for (const row of rows) {
      row.liked = false;
      row.followed = false;
    }
  }

  if (preDecorated) {
    for (const row of rows) {
      let src = null;
      if (row.repost_json) {
        try {
          src = JSON.parse(row.repost_json);
        } catch {
          src = null;
        }
      }
      row.repost_source = src;
      delete row.repost_json;
    }
  } else {
    const map = new Map((data.sources || []).map((r) => [r.pid, r]));
    for (const row of rows) row.repost_source = row.repost_pid ? map.get(row.repost_pid) || null : null;
  }
  return rows;
}

/* ---------------- 页面构建 ---------------- */

/** 列表页对应的 AJAX 翻页接口地址（按 URL 反推类型，供 data-feed 使用） */
function feedEndpointFor(url) {
  const path = url.pathname;
  if (path === '/' || path === '/index.html') return '/api/feed?kind=home&';
  const cat = /^\/category\/([^/]+?)(?:\.html)?$/.exec(path);
  if (cat) return `/api/feed?kind=category&slug=${encodeURIComponent(decodeSlug(cat[1]))}&`;
  const tag = /^\/tag\/([^/]+?)(?:\.html)?$/.exec(path);
  if (tag) return `/api/feed?kind=tag&slug=${encodeURIComponent(decodeSlug(tag[1]))}&`;
  if (path === '/search' || path === '/search.html') {
    const keyword = (url.searchParams.get('s') || url.searchParams.get('q') || '').trim();
    return keyword ? `/api/feed?kind=search&q=${encodeURIComponent(keyword)}&` : '';
  }
  return '';
}

export async function renderList(
  request,
  env,
  url,
  { where, params, baseUrl, pageTitle, activeSlug, headingTitle, breadcrumb, notice, noticeType, active = 'home' }
) {
  // 顺序：会话 → 站点设置 → （公共数据 + COUNT + 列表）一次 batch。
  // 未登录访客没有会话 Cookie，getSession 不产生查询；合并后冷启动从三次串行往返降到两次。
  // 会话与站点设置互不依赖，并行发出（设置命中实例内 15 秒缓存时不产生查询）；
  // 之后公共数据 / COUNT / 列表合并成一次 batch，登录用户也只需两次往返。
  const [session, options] = await Promise.all([getSession(env, request), getOptions(env)]);
  const q = feedQueries(url, { where, params, size: parseInt(options.pageSize, 10) || 10, session });
  const { specs, topicsFresh } = commonSpecs(session, null);
  let data;
  let feed;
  try {
    // GET 请求的公共数据与 COUNT / 列表互不依赖，合并成一趟 D1 batch
    const results = await batchAll(env, [
      ...specs,
      { sql: q.countSql, params: q.countParams },
      { sql: q.listSql, params: q.listParams },
    ]);
    data = assembleCommon(specs, results, { options, session, preloadedGroups: null, topicsFresh });
    const base = specs.length;
    feed = await finishFeed(env, q, results[base], results[base + 1], session, data.levels, data.groups);
  } catch {
    // 旧库缺表等情况退回逐条查询，行为与合并前一致
    data = await commonData(env, session);
    feed = await fetchPosts(env, url, {
      where,
      params,
      size: parseInt(options.pageSize, 10) || 10,
      session,
      levels: data.levels,
      groups: data.groups,
    });
  }
  const { rows, totalPages, page: current } = feed;
  // 回跳提示：默认读取本次地址上的 ?err= / ?msg=（backErr / backMsg 写入），
  // 未传 notice 时所有列表页（首页 / 分类 / 标签 / 搜索）都能显示提示，显式传入时以调用方为准。
  const err = errorOf(url);
  const finalNotice = notice !== undefined ? notice : err || noticeOf(url);
  const finalNoticeType = noticeType !== undefined ? noticeType : err ? 'err' : 'ok';
  return html(
    listPage({
      options: data.options,
      session,
      pageTitle,
      posts: rows,
      categories: data.categories,
      hotComments: data.hotComments,
      links: data.links,
      nav: data.nav,
      topics: data.topics,
      profile: data.profile,
      page: current,
      totalPages,
      baseUrl,
      feedEndpoint: feedEndpointFor(url),
      activeSlug,
      headingTitle,
      breadcrumb,
      active,
      notice: finalNotice,
      noticeType: finalNoticeType,
    })
  );
}

// 已发布内容：排除独立页面、私密，以及尚未到达定时时间的短微博
export const PUBLISHED = `p.status = 'publish' AND p.is_page = 0 AND p.created <= ${NOW_SQL}`;

/**
 * 详情页共用的字段与关联：文章与独立页面只差一个 is_page 条件，
 * 作者徽章所需的等级 / 用户组 / 荣誉与已发布微博数一并取出；
 * 互动计数（评论 / 点赞 / 转发）与信息流共用同一列定义，避免详情页少列导致计数恒为 0。
 */
export const POST_DETAIL_COLUMNS = `p.*, c.name AS category_name, c.slug AS category_slug,
              u.screenname, u.headpic AS author_headpic, u.mail AS author_mail, u.role AS author_role,
              u.level_id AS author_level_id, u.group_id AS author_group_id, u.honor AS author_honor,
              (SELECT COUNT(*) FROM post ap WHERE ap.author_id = p.author_id AND ap.is_page = 0 AND ap.status = 'publish' AND ap.created <= ${NOW_SQL}) AS author_posts,
              ${POST_COUNT_COLUMNS}`;
export const POST_DETAIL_FROM = `FROM post p
       LEFT JOIN category c ON c.cid = p.category_id
       LEFT JOIN user u ON u.userid = p.author_id`;

/**
 * 详情页（独立页面 / 文章）共用的可见性判定：按 pid 优先、slug 兜底命中一行，
 * 未发布与未到定时时间的内容仅作者本人、管理员与具备审核权限的用户组可见。
 * 命中并可见时返回渲染所需上下文（未发布时同时透传用户组，供 renderSingle 复用），
 * 否则返回 null，由调用方给出各自的 404 文案。
 */
export async function visiblePost(env, request, { isPage, key }) {
  // 纯数字 key 优先按 pid 命中，slug 只作兜底：两者混在同一条件里时，
  // 若某条内容的 slug 恰好是纯数字，就可能把链接指到别人的内容上。
  const pidKey = numericKey(key);
  const session = await getSession(env, request);
  const post = await first(
    env,
    `SELECT ${POST_DETAIL_COLUMNS} ${POST_DETAIL_FROM}
     WHERE p.is_page = ${isPage ? 1 : 0} AND (p.pid = ? OR p.slug = ?)
     ORDER BY (p.pid = ?) DESC LIMIT 1`,
    [pidKey, key, pidKey]
  );
  if (!post) return null;
  const canPreview = session && (session.userid === post.author_id || session.role === 'administrator');
  const published = post.status === 'publish' && isDue(post.created);
  // 具备审核权限的用户组也要能预览待审内容；但私密内容只对作者本人与管理员开放，
  // 与下方提示文案口径一致，故 private 不参与审核预览
  let groups = null;
  let canReviewPreview = false;
  if (!published && !canPreview && session && post.status !== 'private') {
    groups = await getGroups(env);
    canReviewPreview = groupReviewPerms(groups, session).canReview;
  }
  if (!published && !canPreview && !canReviewPreview) return null;
  const subject = isPage ? '本页面' : '本文';
  const preview = published
    ? ''
    : post.status === 'publish'
      ? `${subject}为定时发布内容，尚未到发布时间，仅作者本人与管理员可见。`
      : `${subject}当前为${POST_STATUS_LABEL[post.status] || '草稿'}状态，仅作者本人与管理员可见。`;
  return { post, session, published, preview, groups };
}

/** 前台提示页：只需要站点设置与顶部导航，不跑整套公共查询 */
export async function renderMessage(request, env, { pageTitle, message, status = 200 }) {
  const session = await getSession(env, request);
  const { options, nav } = await minimalData(env);
  return html(messagePage({ options, session, pageTitle, message, nav }), status);
}

/** 登录 / 注册页：两者只差模式与标题，注册页在开关关闭时直接给提示 */
export async function authPageFor(request, env, url, mode) {
  const session = await getSession(env, request);
  const { options, nav } = await minimalData(env);
  const isRegister = mode === 'register';
  if (isRegister && !optionOn(options, 'registerOpen')) {
    return renderMessage(request, env, { pageTitle: '注册已关闭', message: '本站暂未开放注册。' });
  }
  return html(
    authPage({
      options,
      session,
      pageTitle: isRegister ? '注册' : '登录',
      mode,
      error: errorOf(url),
      notice: noticeOf(url),
      review: optionRequired(options, 'registerReview'),
      nav,
    })
  );
}

/** 从 Referer 取回跳转路径，避免开放重定向 */
export function backTo(request, fallback = '/') {
  try {
    const u = new URL(request.headers.get('referer') || '');
    return u.pathname + u.search;
  } catch {
    return fallback;
  }
}

/** 转发功能未开放时的统一提示页（转发确认页与提交转发共用） */
export const REPOST_CLOSED = { pageTitle: '转发未开放', message: '本站暂未开放转发功能。' };

/**
 * 互动开关（点赞 / 关注 / 转发）的统一校验：未登录回登录页，
 * 开关关闭时给出提示。通过时返回 { session, options }，否则返回 { blocked: Response }。
 * closed 用于需要整页提示而非回跳的入口（如转发），省略则回来源页提示。
 */
export async function toggleGate(request, env, { flag, loginTip, closedTip, closed = null }) {
  const session = await getSession(env, request);
  if (!session) return { blocked: backErr('/login.html', loginTip) };
  const options = await getOptions(env);
  if (!optionOn(options, flag)) {
    return { blocked: closed ? closed(request, env) : backErr(backTo(request, '/'), closedTip) };
  }
  return { session, options };
}

/**
 * 浏览量 +1（同一访客对同一文章仅计一次，通过 Cookie 去重）。
 * Cookie 有 4KB 上限，去重表只能保留最近若干篇；取 200 条（约 2KB）覆盖正常浏览深度，
 * 超出后最早看过的那篇会被挤出、重新计入——这是长度受限带来的折中，不是逻辑缺口。
 */
const VIEWED_COOKIE_MAX = 200;

export async function countView(request, env, post, ctx) {
  const list = readCookie(request, 'contents_viewed').split(',').filter(Boolean);
  if (list.includes(String(post.pid))) return '';
  // 阅读数只是统计值，不阻塞详情页渲染：先本地 +1，写入交给 waitUntil 后台完成
  post.views = (post.views || 0) + 1;
  const write = run(env, 'UPDATE post SET views = views + 1 WHERE pid = ?', [post.pid]).catch(() => {});
  if (ctx && typeof ctx.waitUntil === 'function') ctx.waitUntil(write);
  else await write;
  const next = [...list, String(post.pid)].slice(-VIEWED_COOKIE_MAX).join(',');
  // 该 Cookie 只有服务端读取，加 HttpOnly 防止被脚本读取；Secure 保证不在明文连接上传输
  return `contents_viewed=${next}; Path=/; Max-Age=2592000; SameSite=Lax; HttpOnly; Secure`;
}

export async function renderSingle(request, env, post, breadcrumb, extra = {}) {
  const { session, options, categories, links, nav, hotComments, topics, profile, levels, groups } = await pageCtx(
    request,
    env,
    extra.session,
    extra.groups || null
  );
  attachAuthorBadges([post], levels, groups);
  // 评论列表与卡片装饰互不依赖，并行查询，避免详情页多等一轮
  const [, comments] = await Promise.all([
    // 标签 / 点赞状态 / 转发源 / 点赞数与转发数
    decoratePosts(env, [post], session),
    all(env, "SELECT * FROM comment WHERE pid = ? AND status = 'approved' ORDER BY coid ASC", [post.pid]),
  ]);
  const url = new URL(request.url);
  const err = errorOf(url);
  const msg = noticeOf(url);
  // 用 hasOwn 判定，避免 ?msg=constructor 之类命中原型链上的属性
  const notice = err || (Object.hasOwn(COMMENT_NOTICES, msg) ? COMMENT_NOTICES[msg] : '');
  const page = singlePage({
    options,
    session,
    pageTitle: post.title,
    post,
    comments,
    categories,
    hotComments,
    links,
    nav,
    topics,
    profile,
    breadcrumb,
    // 独立页面不属于「文章」导航项，不点亮顶栏
    active: Number(post.is_page) === 1 ? '' : 'archives',
    notice: notice || extra.notice || '',
    noticeType: err ? 'err' : 'ok',
  });
  return html(page, 200, extra.headers || {});
}

export async function notFoundPage(request, env, message) {
  return renderMessage(request, env, { pageTitle: '页面不存在', message, status: 404 });
}
