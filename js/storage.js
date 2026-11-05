// localStorage 访问的唯一入口。所有 key 强制加 fitlog_ 前缀：
// 同一 github.io 域名下还有另一个 App（gh_token、prismaVocab 等），绝不能读写或清除它们的数据。
const PREFIX = 'fitlog_';

function k(name) {
  if (!/^[a-z_]+$/.test(name)) throw new Error(`非法的存储名：${name}`);
  return PREFIX + name;
}

export const store = {
  get(name) {
    try { return localStorage.getItem(k(name)); } catch { return null; }
  },
  set(name, value) {
    localStorage.setItem(k(name), value);
  },
  remove(name) {
    // 只删除单个带前缀的 key；本 App 不提供、也不调用任何批量清除。
    localStorage.removeItem(k(name));
  },
};

export function getSettings() {
  return {
    token: store.get('token') || '',
    owner: store.get('owner') || '',
    repo: store.get('repo') || '',
  };
}

export function saveSettings({ token, owner, repo }) {
  store.set('token', token.trim());
  store.set('owner', owner.trim());
  store.set('repo', repo.trim());
}

export function hasSettings() {
  const s = getSettings();
  return Boolean(s.token && s.owner && s.repo);
}
