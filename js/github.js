// GitHub REST API 客户端（只用到 repo 信息、Git Data API、Contents API 初始化）。
// 写入走 Git Data API：一次导入 = 一个 commit，多个文件要么全部写入，要么一个都不写。
// 并发保护：更新分支引用时不 force，若期间有别的写入，GitHub 返回 422，本次写入整体作废。

const API = 'https://api.github.com';

export class GitHubError extends Error {
  constructor(message, { status = 0, code = 'ERROR', detail = '' } = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.detail = detail;
  }
}

function b64ToUtf8(b64) {
  const bin = atob(b64.replace(/\s/g, ''));
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function utf8ToB64(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

export function toJsonText(obj) {
  return JSON.stringify(obj, null, 2) + '\n';
}

export class GitHubRepo {
  constructor({ token, owner, repo }) {
    this.token = token;
    this.owner = owner;
    this.repo = repo;
    this.branch = null;
    this.blobCache = new Map(); // blob sha 内容不可变，可永久缓存
  }

  get base() {
    return `${API}/repos/${encodeURIComponent(this.owner)}/${encodeURIComponent(this.repo)}`;
  }

  async req(method, path, body, { allow = [] } = {}) {
    let res;
    try {
      res = await fetch(path.startsWith('http') ? path : this.base + path, {
        method,
        cache: 'no-store',
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${this.token}`,
          'X-GitHub-Api-Version': '2022-11-28',
          ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch (e) {
      throw new GitHubError('网络错误：连不上 GitHub。请检查网络后重试。', { code: 'NETWORK', detail: String(e) });
    }
    if (res.ok || allow.includes(res.status)) {
      if (res.status === 204) return { status: res.status, json: null };
      const json = await res.json().catch(() => null);
      return { status: res.status, json };
    }
    let msg = '';
    try { msg = (await res.json()).message || ''; } catch { /* ignore */ }
    throw mapError(res.status, msg, method, path, res.headers);
  }

  async info() {
    const { json } = await this.req('GET', '');
    this.branch = json.default_branch;
    return json;
  }

  /** 返回分支头；仓库完全为空（没有任何 commit）时返回 null */
  async head() {
    if (!this.branch) await this.info();
    const r = await this.req('GET', `/git/ref/heads/${encodeURIComponent(this.branch)}`, null, { allow: [404, 409] });
    if (r.status === 404 || r.status === 409) return null;
    const commitSha = r.json.object.sha;
    const c = await this.req('GET', `/git/commits/${commitSha}`);
    return { commitSha, treeSha: c.json.tree.sha };
  }

  /** 完全空的仓库没法用 Git Data API，先用 Contents API 写一个 meta.json 作为第一个 commit */
  async initEmpty(metaObj) {
    await this.req('PUT', '/contents/meta.json', {
      message: 'fitlog: 初始化数据仓库',
      content: utf8ToB64(toJsonText(metaObj)),
      ...(this.branch ? { branch: this.branch } : {}),
    });
  }

  /** 递归列出整个仓库的文件：Map<path, blobSha> */
  async listTree(treeSha) {
    const { json } = await this.req('GET', `/git/trees/${treeSha}?recursive=1`);
    if (json.truncated) throw new GitHubError('数据仓库文件过多，目录列表被截断', { code: 'TRUNCATED' });
    const map = new Map();
    for (const e of json.tree) if (e.type === 'blob') map.set(e.path, e.sha);
    return map;
  }

  async readJsonBlob(sha) {
    if (this.blobCache.has(sha)) return structuredClone(this.blobCache.get(sha));
    const { json } = await this.req('GET', `/git/blobs/${sha}`);
    const text = json.encoding === 'base64' ? b64ToUtf8(json.content) : json.content;
    let obj;
    try { obj = JSON.parse(text); } catch (e) {
      throw new GitHubError(`数据仓库里的文件不是合法 JSON（blob ${sha.slice(0, 7)}）`, { code: 'BAD_DATA', detail: String(e) });
    }
    this.blobCache.set(sha, obj);
    return structuredClone(obj);
  }

  /**
   * 原子写入多个文件：一个 commit，非 force 更新分支。
   * @param {{commitSha:string, treeSha:string}} head 读数据时所基于的分支头
   * @param {Object<string, object>} files path -> JSON 对象
   */
  async commitFiles(head, files, message) {
    const tree = Object.entries(files).map(([path, obj]) => ({
      path, mode: '100644', type: 'blob', content: toJsonText(obj),
    }));
    const t = await this.req('POST', '/git/trees', { base_tree: head.treeSha, tree });
    const c = await this.req('POST', '/git/commits', { message, tree: t.json.sha, parents: [head.commitSha] });
    await this.req('PATCH', `/git/refs/heads/${encodeURIComponent(this.branch)}`, { sha: c.json.sha, force: false });
    return c.json.sha;
  }
}

function mapError(status, msg, method, path, headers) {
  const detail = `${method} ${path || '/'} → ${status} ${msg}`;
  if (status === 401) return new GitHubError('Token 无效或已过期，请到「设置」里更新 token。', { status, code: 'AUTH', detail });
  if (status === 403 || status === 429) {
    if (headers?.get('x-ratelimit-remaining') === '0') return new GitHubError('GitHub API 调用次数超限，请稍后再试。', { status, code: 'RATE', detail });
    return new GitHubError('权限不足：token 没有该仓库的 Contents 读写权限。', { status, code: 'FORBIDDEN', detail });
  }
  if (status === 404) return new GitHubError('找不到仓库：owner/仓库名写错了，或 token 没有授权这个仓库。', { status, code: 'NOT_FOUND', detail });
  if (status === 422 && /fast.?forward/i.test(msg)) {
    return new GitHubError('写入冲突：数据仓库刚被别处修改过（比如另一台设备）。本次没有写入任何内容，请重新确认。', { status, code: 'CONFLICT', detail });
  }
  if (status === 409) return new GitHubError('仓库状态冲突（可能是空仓库或正在被修改），请重试。', { status, code: 'CONFLICT', detail });
  return new GitHubError(`GitHub 返回错误 ${status}：${msg || '未知错误'}`, { status, code: 'HTTP', detail });
}
