# MBlog · Cloudflare Workers 版微博客

一个部署在 Cloudflare Workers 上的轻量微博客系统，前台服务端渲染，后台自带管理面板。
数据存储使用 D1（SQLite），静态资源通过 Workers Assets 直出，无需服务器。

## 功能概览

**前台**

- 首页信息流、搜索、独立页面（`/page/:slug`）
- 微博式短内容发布与长文投稿（`/write`、`/write/mine`）
- 点赞、转发、关注、话题、评论（可在后台开关）
- 用户注册 / 登录（支持注册审核与评论审核）
- 资料卡、友链、站点信息页（`/site`）
- 写作区与审核区（按权限开放）

**后台**（`/admin`）

- 站点设置（标题、描述、资料卡、菜单、功能开关、自定义代码等）
- 文章 / 页面 / 分类 / 标签管理
- 评论审核、投稿审核、用户与用户组 / 等级管理
- 友链、导航管理
- 数据备份与恢复

## 技术栈

| 组件 | 用途 |
| --- | --- |
| Cloudflare Workers | 运行时（ES Module Worker） |
| Cloudflare D1 | 数据库（绑定名 `DB`） |
| Workers Assets | 静态资源（绑定名 `ASSETS`，目录 `./public`） |
| Wrangler | 本地开发与部署 CLI |

## 目录结构

```
.
├── public/                 # 静态资源（样式、图片、favicon）
│   ├── images/             # 等级徽章、随机配图等
│   └── style/              # 前台与后台样式
├── src/
│   ├── index.js            # Worker 入口 + 前台路由
│   ├── admin.js            # 后台路由
│   ├── lib.js              # 数据访问、鉴权、设置等公共逻辑
│   ├── theme.js            # 前台模板渲染
│   └── md5.js              # 兼容旧密码格式的 MD5 实现
├── schema.sql              # 建表脚本（含初始管理员）
├── wrangler.toml           # Wrangler 配置
└── package.json
```

## 部署步骤

### 0. 前置条件

- 已安装 Node.js 18+
- 已有 Cloudflare 账号，并已 `npx wrangler login` 完成授权

### 1. 安装依赖

```bash
npm install
```

### 2. 创建 D1 数据库

```bash
npx wrangler d1 create mblog
```

命令会输出 `database_id`，把它填到 [wrangler.toml](file:///d:/360%E6%9E%81%E9%80%9F%E6%B5%8F%E8%A7%88%E5%99%A8X%E4%B8%8B%E8%BD%BD/Github/Mblog/wrangler.toml) 的 `<YOUR_D1_DATABASE_ID>` 处。

### 3. 初始化数据库表结构

远程（线上）：

```bash
npm run db:init:remote
```

本地开发：

```bash
npm run db:init:local
```

> `schema.sql` 会创建全部数据表，并写入一个初始管理员账号（见下方「初始账号」）。

### 4. 配置会话签名密钥

`SESSION_SECRET` 用于签名登录 Cookie，**必须配置且不可泄露**。

- 本地开发：复制 `.dev.vars.example` 为 `.dev.vars`，填入随机字符串
- 线上部署：

```bash
npx wrangler secret put SESSION_SECRET
```

> 未配置该密钥时，登录相关功能会拒绝工作，不会使用任何内置默认值。

### 5. 部署

```bash
npm run deploy
```

如需绑定自定义域名，取消 [wrangler.toml](file:///d:/360%E6%9E%81%E9%80%9F%E6%B5%8F%E8%A7%88%E5%99%A8X%E4%B8%8B%E8%BD%BD/Github/Mblog/wrangler.toml) 中 `routes` 段的注释并改成自己的域名（该域名需已托管在同一 Cloudflare 账号下）。

## 初始账号（务必立即修改）

| 用户名 | 密码 |
| --- | --- |
| `admin` | `admin123` |

`schema.sql` 中该账号带有 `must_change = 1` 标记：**首次登录后台会被强制跳转到「初始化账号」页，必须修改用户名与新密码后才能使用后台**。

即便如此，仍建议在初始化数据库后立即登录并完成改密，切勿在公网长期保留默认口令。

## 本地开发

```bash
npm run dev
```

默认监听 `http://localhost:8787`。

## 可用脚本

| 命令 | 说明 |
| --- | --- |
| `npm run dev` | 启动本地开发服务器 |
| `npm run deploy` | 部署到 Cloudflare |
| `npm run db:init:local` | 在本地 D1 执行 `schema.sql` |
| `npm run db:init:remote` | 在远程 D1 执行 `schema.sql` |

## 安全说明

- 密码使用 PBKDF2-HMAC-SHA256（10 万次迭代 + 随机盐）存储，登录校验采用恒定时间比较
- 所有写请求校验同源（Origin / Referer），配合 Cookie 的 `SameSite` 做 CSRF 防护
- 服务端异常只写入日志，不向访客回显堆栈或 SQL 细节
- `.dev.vars`、`node_modules/`、`.wrangler/` 已加入 `.gitignore`，请勿提交

## 许可

本项目仅供学习与自建使用。
