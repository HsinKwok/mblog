import { md5 } from '../md5.js';
import { first, run } from './db.js';

/* ---------------- 会话（HMAC 签名 Cookie） ---------------- */

const COOKIE = 'mblog_session';
const encoder = new TextEncoder();

function b64url(bytes) {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromB64url(str) {
  const padded = str.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((str.length + 3) % 4);
  const bin = atob(padded);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

async function sign(value, secret) {
  // 缺失时立即失败，避免用 "undefined" 当密钥悄悄签发出可预测的会话
  if (!secret) {
    throw new Error('缺少 SESSION_SECRET：本地请在 .dev.vars 中配置，线上请执行 wrangler secret put SESSION_SECRET');
  }
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(value));
  return b64url(new Uint8Array(sig));
}

/** 常量时间比较：逐字节异或累加，不因首个不同字符提前返回 */
export function timingSafeEqual(a, b) {
  const x = String(a ?? '');
  const y = String(b ?? '');
  if (x.length !== y.length) return false;
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x.charCodeAt(i) ^ y.charCodeAt(i);
  return diff === 0;
}

/* ---------------- 口令哈希（PBKDF2-SHA256） ---------------- */

/** 迭代次数：兼顾 Workers 单次请求耗时与离线爆破成本 */
const PBKDF2_ITERATIONS = 100000;
const PBKDF2_PREFIX = 'pbkdf2$';

/**
 * 结构合法（迭代次数 / 16 字节盐 / 32 字节摘要）但永不匹配的占位哈希。
 * 用于账号不存在时仍执行一次等价耗时的校验，避免通过响应时间枚举用户名。
 */
const DUMMY_PASSWORD_HASH = `${PBKDF2_PREFIX}${PBKDF2_ITERATIONS}$${'A'.repeat(22)}$${'A'.repeat(43)}`;

async function pbkdf2(password, salt, iterations) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations, hash: 'SHA-256' }, key, 256);
  return new Uint8Array(bits);
}

/** 生成 `pbkdf2$迭代次数$盐$摘要` 形式的口令哈希（每次调用使用新随机盐） */
export async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await pbkdf2(password, salt, PBKDF2_ITERATIONS);
  return `${PBKDF2_PREFIX}${PBKDF2_ITERATIONS}$${b64url(salt)}$${b64url(hash)}`;
}

/**
 * 校验口令。
 * 返回 { ok, legacy }：legacy 为 true 表示命中的是历史的无盐 MD5 记录，
 * 调用方应在登录成功时就地把它升级成 PBKDF2（见 upgradePassword）。
 */
export async function verifyPassword(password, stored) {
  const value = String(stored ?? '');
  if (!value) return { ok: false, legacy: false };
  if (value.startsWith(PBKDF2_PREFIX)) {
    const [iterations, salt, hash] = value.slice(PBKDF2_PREFIX.length).split('$');
    const rounds = parseInt(iterations, 10);
    if (!rounds || !salt || !hash) return { ok: false, legacy: false };
    let saltBytes;
    try {
      // 库里的盐可能被手工改坏：非法 base64 会让 atob 抛异常，这里按「校验失败」处理
      saltBytes = fromB64url(salt);
    } catch {
      return { ok: false, legacy: false };
    }
    const expect = await pbkdf2(password, saltBytes, rounds);
    return { ok: timingSafeEqual(b64url(expect), hash), legacy: false };
  }
  return { ok: timingSafeEqual(md5(password), value.toLowerCase()), legacy: true };
}

/**
 * 把历史 MD5 口令就地升级为 PBKDF2（仅在口令已校验通过后调用）。
 * 返回新的哈希：调用方签发会话时必须用它，否则会话里的口令指纹仍是旧 MD5 的，
 * 下一跳 getSession 会因指纹不符把刚登录的 Cookie 判为失效。写库失败时返回空串，调用方沿用旧值。
 */
export async function upgradePassword(env, userid, password) {
  const hash = await hashPassword(password);
  try {
    await run(env, 'UPDATE user SET md5password = ? WHERE userid = ?', [hash, userid]);
    return hash;
  } catch (err) {
    // 升级失败不影响本次登录
    console.error('口令哈希升级失败：', err && err.message);
    return '';
  }
}

/** 昵称长度上限（前台注册、我的资料、后台用户表单共用同一口径） */
export const SCREENNAME_MAX_LENGTH = 40;

/** 口令最短长度（注册、改密、初始化账号、后台新建用户共用同一口径） */
export const PASSWORD_MIN_LENGTH = 6;

/** 昵称校验（前台注册、我的资料、后台用户表单共用），合法返回空串 */
export function validateScreenname(name) {
  const value = String(name ?? '').trim();
  if (!value) return '昵称不能为空';
  if (value.length > SCREENNAME_MAX_LENGTH) return `昵称不能超过 ${SCREENNAME_MAX_LENGTH} 个字符`;
  return '';
}

/**
 * 昵称查重：昵称与用户名同为前台标识，须全站唯一（库层由 idx_user_screenname 兜底）。
 * exceptUserId 用于「我的资料」与后台编辑：排除自己，否则只是保存未改动的昵称也会被判为占用。
 * 返回占用者的 userid，未被占用返回 0。
 */
export async function screennameTaken(env, name, exceptUserId = 0) {
  const row = await first(env, 'SELECT userid FROM user WHERE screenname = ? AND userid <> ?', [
    String(name ?? '').trim(),
    Number(exceptUserId) || 0,
  ]);
  return row ? row.userid : 0;
}

/** 邮箱格式校验（注册、我的资料、后台用户表单共用）；留空视为合法，合法返回空串 */
export function validateMail(mail) {
  const value = String(mail ?? '').trim();
  if (!value) return '';
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) ? '' : '邮箱格式不正确';
}

/**
 * 修改口令（前台 /settings 与后台「我的资料」共用）。
 * 三个字段全空表示本次不改密码，直接返回空串；否则返回首个校验错误文案，成功后写库并返回空串。
 */
export async function changePassword(env, user, { oldPassword = '', password = '', confirm = '' } = {}) {
  if (!oldPassword && !password && !confirm) return '';
  const check = await verifyPassword(oldPassword, user.md5password);
  if (!check.ok) return '当前密码不正确';
  if (String(password).length < PASSWORD_MIN_LENGTH) return `新密码至少 ${PASSWORD_MIN_LENGTH} 位`;
  if (password !== confirm) return '两次输入的新密码不一致';
  await run(env, 'UPDATE user SET md5password = ? WHERE userid = ?', [await hashPassword(password), user.userid]);
  return '';
}

/** 保存个人资料（昵称 / 邮箱校验 + 可选改密 + 写库），返回错误文案，成功返回空串 */
export async function saveProfile(
  env,
  user,
  { screenname = '', mail = '', url = '', headpic = '', oldPassword = '', password = '', confirm = '' } = {}
) {
  const name = String(screenname).trim();
  const badName = validateScreenname(name);
  if (badName) return badName;
  const badMail = validateMail(mail);
  if (badMail) return badMail;
  // 昵称须唯一（与用户名同口径）：排除自己，否则不改昵称也会被判为占用
  if (await screennameTaken(env, name, user.userid)) return '该昵称已被使用';
  const error = await changePassword(env, user, { oldPassword, password, confirm });
  if (error) return error;
  try {
    await run(env, 'UPDATE user SET screenname = ?, mail = ?, url = ?, headpic = ? WHERE userid = ?', [
      name,
      String(mail).trim(),
      String(url).trim(),
      String(headpic).trim(),
      user.userid,
    ]);
  } catch (err) {
    // 上面的查重与写入之间存在并发窗口：同名请求可能同时通过查重，
    // 由 user.screenname 的唯一索引兜底，命中时按“已被使用”提示，而不是抛成 500
    if (/UNIQUE/i.test(String(err && err.message))) return '该昵称已被使用';
    throw err;
  }
  return '';
}

/**
 * 初始化账号（部署内置的 admin / admin123 首次登录后台时强制调用）：
 * 同时修改用户名与口令，并把 must_change 清 0 以放行后台。
 * 返回首个校验错误文案，成功后返回空串。
 */
export async function initAccount(env, user, { username = '', password = '', confirm = '' } = {}) {
  const name = String(username).trim();
  if (!name) return '用户名不能为空';
  if (String(password).length < PASSWORD_MIN_LENGTH) return `新密码至少 ${PASSWORD_MIN_LENGTH} 位`;
  if (password !== confirm) return '两次输入的新密码不一致';
  if (name !== user.username) {
    const exists = await first(env, 'SELECT userid FROM user WHERE username = ?', [name]);
    if (exists) return '该用户名已被占用';
  }
  try {
    await run(env, 'UPDATE user SET username = ?, md5password = ?, must_change = 0 WHERE userid = ?', [
      name,
      await hashPassword(password),
      user.userid,
    ]);
  } catch (err) {
    // 上面的查重与这里的写入之间存在并发窗口，由 user.username 的唯一约束兜底
    if (/UNIQUE/i.test(String(err && err.message))) return '该用户名已被占用';
    throw err;
  }
  return '';
}

/* ---------------- 登录限流 ---------------- */

/** 同一「IP + 用户名」在窗口内的最大失败次数 */
export const LOGIN_MAX_FAILURES = 10;
export const LOGIN_WINDOW_MS = 15 * 60 * 1000;

/** 客户端 IP：Cloudflare 注入的 cf-connecting-ip */
export function clientIp(request) {
  return (request.headers.get('cf-connecting-ip') || '').trim() || 'unknown';
}

/**
 * 登录限流键：同时绑定来源 IP 与用户名，避免一个账号被全网锁死。
 * 用户名保持原样（只去首尾空白），与 user.username 的大小写敏感比较保持一致，
 * 否则大小写不同的两个账号会共用同一个限流桶，互相把对方锁死。
 */
export function loginThrottleKey(request, username) {
  return `${clientIp(request)}:${String(username || '').trim()}`;
}

/**
 * 是否仍在限流窗口内（返回 true 表示允许继续尝试）。
 * 计数表异常时按放行处理：限流是加固手段，不应因它本身出错把登录彻底锁死。
 */
export async function loginAllowed(env, key) {
  try {
    const row = await first(env, 'SELECT count, first FROM login_attempt WHERE attempt_key = ?', [key]);
    if (!row) return true;
    if (Date.now() - Number(row.first) > LOGIN_WINDOW_MS) return true;
    return Number(row.count) < LOGIN_MAX_FAILURES;
  } catch (err) {
    console.error('登录限流查询失败，按放行处理：', err && err.message);
    return true;
  }
}

/** 记一次登录失败；窗口过期或首次失败时重新开始计数 */
export async function recordLoginFailure(env, key) {
  const ts = Date.now();
  try {
    const row = await first(env, 'SELECT count, first FROM login_attempt WHERE attempt_key = ?', [key]);
    if (!row || ts - Number(row.first) > LOGIN_WINDOW_MS) {
      await run(
        env,
        'INSERT INTO login_attempt (attempt_key, count, first, last) VALUES (?, 1, ?, ?) ON CONFLICT(attempt_key) DO UPDATE SET count = 1, first = ?, last = ?',
        [key, ts, ts, ts, ts]
      );
    } else {
      await run(env, 'UPDATE login_attempt SET count = count + 1, last = ? WHERE attempt_key = ?', [ts, key]);
    }
  } catch (err) {
    console.error('登录失败计数写入失败：', err && err.message);
  }
}

/** 登录成功后清空该键的失败计数 */
export async function clearLoginFailures(env, key) {
  try {
    await run(env, 'DELETE FROM login_attempt WHERE attempt_key = ?', [key]);
  } catch (err) {
    console.error('登录失败计数清理失败：', err && err.message);
  }
}

/**
 * 按用户名清空其所有来源 IP 的失败计数（删除用户时调用，避免留下孤儿限流行）。
 * 限流键形如 `<ip>:<用户名原样>`，故按「以 `:用户名` 结尾」匹配；
 * 用户名里的 % 与 _ 需转义，否则会把其他用户的记录一并删掉。
 */
export async function clearLoginFailuresOf(env, username) {
  const suffix = `:${String(username ?? '').trim()}`.replace(/[\\%_]/g, (ch) => `\\${ch}`);
  try {
    await run(env, "DELETE FROM login_attempt WHERE attempt_key LIKE ? ESCAPE '\\'", [`%${suffix}`]);
  } catch (err) {
    console.error('登录失败计数清理失败：', err && err.message);
  }
}

/** 命中限流阈值时的统一提示（前后台登录共用） */
export const LOGIN_THROTTLE_MESSAGE = `登录失败次数过多，请 15 分钟后再试（上限 ${LOGIN_MAX_FAILURES} 次）`;

/**
 * 登录校验（前台 /login 与后台 /admin/login 共用）：
 * 限流 → 查用户 → 校验口令 → 失败计数 / 成功清计数 + 历史 MD5 透明升级。
 * requireAdmin 为 true 时额外要求 role === 'administrator'（后台登录）。
 * 口令正确但账号仍待审核（user.status = 'pending'）时返回 pending，
 * 且不计失败次数——这不是撞库，锁死没有意义。
 * 只返回结果，错误文案与会话附加项（admin 标记）由调用方决定。
 */
export async function attemptLogin(env, request, { username, password, requireAdmin = false }) {
  const throttleKey = loginThrottleKey(request, username);
  if (!(await loginAllowed(env, throttleKey))) return { ok: false, throttled: true, user: null };
  const user = await first(env, 'SELECT * FROM user WHERE username = ?', [username]);
  // 用户不存在时也走一次等价的 PBKDF2 校验（用结构合法的占位哈希），
  // 否则「账号不存在」会明显更快返回，账号列表可被耗时枚举出来
  const check = await verifyPassword(password, user ? user.md5password : DUMMY_PASSWORD_HASH);
  if (!user || !check.ok || (requireAdmin && user.role !== 'administrator')) {
    await recordLoginFailure(env, throttleKey);
    return { ok: false, throttled: false, user: null };
  }
  if (user.status === 'pending') return { ok: false, throttled: false, pending: true, user: null };
  await clearLoginFailures(env, throttleKey);
  if (check.legacy) {
    // 库里已换成 PBKDF2，返回给调用方的 user 也要同步换掉，
    // 否则 createSession 会用旧 MD5 算口令指纹，签出的 Cookie 下次请求即失效
    const upgraded = await upgradePassword(env, user.userid, password);
    if (upgraded) user.md5password = upgraded;
  }
  return { ok: true, throttled: false, user };
}

export function readCookie(request, name) {
  const cookie = request.headers.get('cookie') || '';
  for (const part of cookie.split(';')) {
    const [k, ...rest] = part.trim().split('=');
    if (k !== name) continue;
    const raw = rest.join('=');
    // 客户端可以塞进任意字节：解码失败（如裸 %）不能让整个请求崩掉，
    // 按原样返回交由签名校验判定失败即可。
    try {
      return decodeURIComponent(raw);
    } catch {
      return raw;
    }
  }
  return '';
}

/**
 * 口令指纹：把当前口令哈希掺进会话签名。
 * 改密后指纹随之变化，浏览器里已经存在的旧 Cookie 会立即失效（无需服务端会话表）。
 */
async function passwordStamp(env, hash) {
  return (await sign(`pw:${hash || ''}`, env.SESSION_SECRET)).slice(0, 22);
}

export async function createSession(env, user, extra = {}) {
  const payload = { uid: user.userid, exp: Date.now() + 7 * 24 * 3600 * 1000, ...extra };
  if (user.md5password) payload.pw = await passwordStamp(env, user.md5password);
  const data = b64url(encoder.encode(JSON.stringify(payload)));
  const sig = await sign(data, env.SESSION_SECRET);
  return `${COOKIE}=${data}.${sig}; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=604800`;
}

export function clearSession() {
  return `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=0`;
}

/**
 * 口令变更后刷新「当前浏览器」的会话，返回可直接拼进响应头的 headers。
 * 口令指纹里掺着哈希，改密会让当前设备手里的旧 Cookie 也一并失效：
 * 其他设备被登出是预期行为，但操作改密的这台设备不该把自己踢下线，
 * 故按库里最新的用户行重签一次。
 */
export async function refreshSession(env, userid, extra = {}) {
  const user = await first(env, 'SELECT * FROM user WHERE userid = ?', [userid]);
  return user ? { 'set-cookie': await createSession(env, user, extra) } : {};
}

export async function getSession(env, request) {
  const raw = readCookie(request, COOKIE);
  if (!raw || !raw.includes('.')) return null;
  const [data, sig] = raw.split('.');
  let expect;
  try {
    expect = await sign(data, env.SESSION_SECRET);
  } catch (err) {
    // SESSION_SECRET 缺失属于部署配置问题：会话一律视为未登录（并留下日志），
    // 而不是把签名异常抛到调用方，让整个站点的每个请求都 500。
    console.error('会话签名不可用：', err && err.message);
    return null;
  }
  if (!timingSafeEqual(expect, sig)) return null;
  let payload;
  try {
    payload = JSON.parse(new TextDecoder().decode(fromB64url(data)));
  } catch {
    return null;
  }
  if (!payload.exp || payload.exp < Date.now()) return null;

  const user = await first(
    env,
    'SELECT userid, username, screenname, mail, url, headpic, role, level_id, group_id, honor, must_change, status, md5password FROM user WHERE userid = ?',
    [payload.uid]
  );
  // 账号被删除、或被后台「转为待审」后，旧 Cookie 必须立即失效：
  // 否则封禁 / 审核只是摆设，已登录的浏览器能一直用下去
  if (!user || user.status === 'pending') return null;
  // 指纹对不上说明期间改过密码（含后台重置），旧 Cookie 同样作废
  if (payload.pw && payload.pw !== (await passwordStamp(env, user.md5password))) return null;
  // 口令哈希不对外暴露（调用方需要时自行查询该列）
  delete user.md5password;
  // 后台登录态与前台登录态分离（admin 标记）
  user.isAdminSession = !!payload.admin;
  return user;
}

export async function isAdmin(env, request) {
  const user = await getSession(env, request);
  return user && user.role === 'administrator' && user.isAdminSession ? user : null;
}
