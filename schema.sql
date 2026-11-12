-- MBlog · 仿微博博客（Cloudflare Workers + D1）
-- 前台三栏布局复刻 weibo.com，内容模型为博客：文章 / 分类 / 标签 / 评论 / 友链 / 独立页面
-- 微博式互动：点赞 / 转发 / 关注 / 话题（话题复用标签）
-- 所有前台可见内容（站点设置、资料卡、导航、菜单、开关、自定义代码）与互动数据均由后台管理

DROP TABLE IF EXISTS options;
DROP TABLE IF EXISTS user_level;
DROP TABLE IF EXISTS user_group;
DROP TABLE IF EXISTS user;
DROP TABLE IF EXISTS category;
DROP TABLE IF EXISTS tag;
DROP TABLE IF EXISTS post;
DROP TABLE IF EXISTS post_tag;
DROP TABLE IF EXISTS comment;
DROP TABLE IF EXISTS link;
DROP TABLE IF EXISTS nav;
DROP TABLE IF EXISTS post_like;
DROP TABLE IF EXISTS follow;
DROP TABLE IF EXISTS login_attempt;

-- 站点设置：后台「站点设置」写入，前台主题读取（缺省值在 src/lib.js 的 DEFAULT_OPTIONS 中）
CREATE TABLE options (
  name  TEXT PRIMARY KEY,
  value TEXT NOT NULL DEFAULT ''
);

-- 微博等级：后台「等级管理」维护
-- badge 为徽章类型（通常为数字序号），前台按用户所属用户组的命名模板展开成图片文件名
CREATE TABLE user_level (
  lid       INTEGER PRIMARY KEY AUTOINCREMENT,
  name      TEXT NOT NULL,
  min_posts INTEGER NOT NULL DEFAULT 0, -- 达到该等级所需的已发布微博数（自动升级依据）
  badge     TEXT NOT NULL DEFAULT '',
  ordernum  INTEGER NOT NULL DEFAULT 0
);

-- 用户组：后台「用户组管理」维护
-- 等级徽章只占一个图标位，同一等级在不同用户组使用不同的图标集
-- badge_tpl 为图标命名模板，{badge} 会被 user_level.badge 替换
-- 例：'LV{badge}' 展开为 LV1，渲染 /images/badge/LV1.png；'TY{badge}' 展开为 TY1，渲染 /images/badge/TY1.png
-- 组级权限（后台「组别管理 → 权限设置」维护）：
-- skip_review 1 = 该组用户的前台投稿与评论免审核，直接发布（见 lib.js 的 skipsReview）
-- can_review  1 = 该组用户可进入前台审核中心，处理待审核的投稿与评论
-- can_edit    1 = 该组用户可在审核时修改待审内容后再通过（需同时具备 can_review）
-- admin_menus 为该组管理员可见的后台菜单（后台「组别管理 → 后台菜单」维护）：
--   逗号分隔的菜单 key，取值见 admin.js 的 MENUS（dashboard / posts / pages / comments / likes /
--   follows / categories / tags / links / users / groups / levels / profile / features / nav / options）；
--   '*' 或空串表示全部可见。未勾选的菜单不会出现在后台左栏，其下所有增删改路由也会被拦截
CREATE TABLE user_group (
  gid         INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL,
  badge_tpl   TEXT NOT NULL DEFAULT '{badge}',
  ordernum    INTEGER NOT NULL DEFAULT 0,
  skip_review INTEGER NOT NULL DEFAULT 0,
  can_review  INTEGER NOT NULL DEFAULT 0,
  can_edit    INTEGER NOT NULL DEFAULT 0,
  admin_menus TEXT NOT NULL DEFAULT '*'
);

-- 用户：administrator 可进入后台，visitor 仅用于前台评论
-- level_id 为手动指定的等级（user_level.lid），0 表示按已发布微博数自动判定
-- group_id 为所属用户组（user_group.gid），决定等级徽章使用哪一套图标
-- honor 为荣誉图标文件名（不含扩展名时前台自动匹配 .png / .gif），空串表示不显示
-- must_change 1 = 该账号仍在使用初始口令，登录后台后强制跳转「初始化账号」页修改用户名与口令
-- status 为账号状态：active 正常 / pending 待审核（前台注册后等待管理员通过，通过前不能登录）
CREATE TABLE user (
  userid      INTEGER PRIMARY KEY AUTOINCREMENT,
  username    TEXT NOT NULL UNIQUE,
  screenname  TEXT NOT NULL DEFAULT '',
  md5password TEXT NOT NULL,
  mail        TEXT NOT NULL DEFAULT '',
  url         TEXT NOT NULL DEFAULT '',
  headpic     TEXT NOT NULL DEFAULT '',
  role        TEXT NOT NULL DEFAULT 'visitor',
  status      TEXT NOT NULL DEFAULT 'active',
  level_id    INTEGER NOT NULL DEFAULT 0,
  group_id    INTEGER NOT NULL DEFAULT 1,
  honor       TEXT NOT NULL DEFAULT '',
  created     TEXT NOT NULL DEFAULT '',
  must_change INTEGER NOT NULL DEFAULT 0
);

-- 昵称须全站唯一（与 username 同口径）：前台文章 / 评论到处以昵称标识作者，
-- 重名会导致无法分辨是谁。空串放行的部分唯一索引用于兼容历史行与「昵称留空回落用户名」的写入路径
CREATE UNIQUE INDEX idx_user_screenname ON user (screenname) WHERE screenname <> '';

-- 分类：对应前台首页「全部 / 分类」页签
CREATE TABLE category (
  cid      INTEGER PRIMARY KEY AUTOINCREMENT,
  name     TEXT NOT NULL,
  slug     TEXT NOT NULL UNIQUE,
  ordernum INTEGER NOT NULL DEFAULT 0
);

-- 标签
CREATE TABLE tag (
  tid  INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  slug TEXT NOT NULL UNIQUE
);

-- 文章 / 独立页面
CREATE TABLE post (
  pid           INTEGER PRIMARY KEY AUTOINCREMENT,
  title         TEXT NOT NULL,
  slug          TEXT NOT NULL DEFAULT '',
  content       TEXT NOT NULL DEFAULT '',
  category_id   INTEGER NOT NULL DEFAULT 0,
  author_id     INTEGER NOT NULL DEFAULT 0,
  created       TEXT NOT NULL DEFAULT '',
  modified      TEXT NOT NULL DEFAULT '',
  views         INTEGER NOT NULL DEFAULT 0,
  status        TEXT NOT NULL DEFAULT 'publish', -- publish 已发布 / pending 待审核 / draft 草稿 / private 私密
  allow_comment INTEGER NOT NULL DEFAULT 1,
  is_page       INTEGER NOT NULL DEFAULT 0,
  is_top        INTEGER NOT NULL DEFAULT 0,
  statement     TEXT NOT NULL DEFAULT '', -- 内容声明（空串表示「无」）
  repost_pid    INTEGER NOT NULL DEFAULT 0 -- 转发源文章 pid，0 表示原创
);

-- 文章别名（slug）唯一：详情页同时按 pid / slug 匹配，重名会把链接指向别的文章。
-- 空串表示「未设置别名」，允许多篇共存，故用部分唯一索引放行空串。
CREATE UNIQUE INDEX idx_post_slug ON post (slug) WHERE slug <> '';

CREATE TABLE post_tag (
  pid INTEGER NOT NULL,
  tid INTEGER NOT NULL,
  PRIMARY KEY (pid, tid)
);

-- 评论：后台可审核（approved / pending）
CREATE TABLE comment (
  coid    INTEGER PRIMARY KEY AUTOINCREMENT,
  pid     INTEGER NOT NULL,
  userid  INTEGER NOT NULL DEFAULT 0,
  author  TEXT NOT NULL DEFAULT '',
  mail    TEXT NOT NULL DEFAULT '',
  url     TEXT NOT NULL DEFAULT '',
  content TEXT NOT NULL DEFAULT '',
  created TEXT NOT NULL DEFAULT '',
  status  TEXT NOT NULL DEFAULT 'approved'
);

-- 友情链接：前台侧边栏「左邻右舍」与友链页面
CREATE TABLE link (
  lid         INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL,
  url         TEXT NOT NULL,
  image       TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  ordernum    INTEGER NOT NULL DEFAULT 0
);

-- 导航：前台顶栏导航，后台「导航管理」维护；表中无记录时前台回退到内置默认导航
-- parent_id = 0 为顶级导航，非 0 时作为该顶级导航的下拉子项；login_only = 1 表示仅登录后显示
-- blank = 1 表示前台点击该导航时在新窗口打开
CREATE TABLE nav (
  nid        INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL,
  url        TEXT NOT NULL DEFAULT '',
  parent_id  INTEGER NOT NULL DEFAULT 0,
  login_only INTEGER NOT NULL DEFAULT 0,
  blank      INTEGER NOT NULL DEFAULT 0,
  ordernum   INTEGER NOT NULL DEFAULT 0
);

-- 点赞：登录用户对文章的点赞，UNIQUE 保证同一用户对同一文章只有一条
CREATE TABLE post_like (
  lid     INTEGER PRIMARY KEY AUTOINCREMENT,
  pid     INTEGER NOT NULL,
  userid  INTEGER NOT NULL,
  created TEXT NOT NULL DEFAULT '',
  UNIQUE (pid, userid)
);

-- 关注：登录用户关注（作者）用户，UNIQUE 保证不会重复关注
CREATE TABLE follow (
  fid       INTEGER PRIMARY KEY AUTOINCREMENT,
  userid    INTEGER NOT NULL,
  target_id INTEGER NOT NULL,
  created   TEXT NOT NULL DEFAULT '',
  UNIQUE (userid, target_id)
);

-- 登录失败计数：按「来源 IP + 用户名」维度限流，到期自动失效（见 lib.js 的 loginAllowed）
CREATE TABLE login_attempt (
  attempt_key TEXT PRIMARY KEY,
  count       INTEGER NOT NULL DEFAULT 0,
  first       INTEGER NOT NULL DEFAULT 0,
  last        INTEGER NOT NULL DEFAULT 0
);

-- ============ 热路径索引 ============
-- 列表分页的 WHERE + ORDER BY：status / is_page 过滤后按 is_top、created 倒序
CREATE INDEX idx_post_published ON post (is_page, status, is_top DESC, created DESC);
-- 作者主页 / 资料卡的已发布微博计数
CREATE INDEX idx_post_author ON post (author_id, is_page, status);
-- 分类归档
CREATE INDEX idx_post_category ON post (category_id);
-- 转发源回查（0 表示原创，用部分索引排除掉绝大多数行）
CREATE INDEX idx_post_repost ON post (repost_pid) WHERE repost_pid <> 0;
-- 详情页评论列表：按 pid + 审核状态取，coid 保证顺序
CREATE INDEX idx_comment_post ON comment (pid, status, coid);
-- 侧栏「最新评论」
CREATE INDEX idx_comment_recent ON comment (status, coid DESC);
-- 粉丝计数与关注校验：UNIQUE(userid, target_id) 只覆盖按 userid 前缀查询
CREATE INDEX idx_follow_target ON follow (target_id);
-- 标签归档：post_tag 主键是 (pid, tid)，按 tid 反查需要单独索引
CREATE INDEX idx_post_tag_tid ON post_tag (tid);
-- 「我赞过的」列表：UNIQUE(pid, userid) 只覆盖按 pid 前缀查询
CREATE INDEX idx_post_like_user ON post_like (userid);

-- ============ 种子数据 ============
-- 用户组：等级徽章图标集，普通用户读 LV*.png，特邀用户读 TY*.png
-- 特邀用户组默认免审核，其前台投稿与评论直接发布；审核权限各组默认关闭，按需在后台勾选
INSERT INTO user_group (gid, name, badge_tpl, ordernum, skip_review, can_review, can_edit) VALUES
  (1, '普通用户', 'LV{badge}', 1, 0, 0, 0),
  (2, '特邀用户', 'TY{badge}', 2, 1, 0, 0);

-- 等级：按已发布微博数自动升级；badge 结合所在用户组的模板展开为 public/images/badge/ 下的文件名
INSERT INTO user_level (lid, name, min_posts, badge, ordernum) VALUES
  (1, '初来乍到', 0, '1', 1),
  (2, '崭露头角', 3, '2', 2),
  (3, '小有名气', 8, '3', 3),
  (4, '声名远扬', 20, '4', 4),
  (5, '一代宗师', 50, '5', 5);

-- 种子账号：仅内置一个初始管理员 admin / admin123，must_change = 1。
-- 该口令是公开的弱口令，首次登录后台会被强制跳转到「初始化账号」页，
-- 必须修改用户名与新口令后方可使用后台（见 src/admin.js 的 mustChange 门禁）。
INSERT INTO user (userid, username, screenname, md5password, mail, url, headpic, role, level_id, group_id, honor, created, must_change) VALUES
  (1, 'admin', '管理员', 'pbkdf2$100000$jVaoMfwzue5m8zAwnZUZog$pl7H5JT_wYS5Nu6lQ0fCg7ZqypW4Xu_iPlFtxoI1lvM', 'admin@example.com', '', '', 'administrator', 0, 2, 'RY1', '2026-08-01 10:00:00', 1);

-- 站点设置、分类、标签、文章、评论、友链、导航与互动数据均不预置，
-- 部署后在后台「站点设置」等处按需录入；前台无记录时回退到内置默认值。
