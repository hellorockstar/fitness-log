// 数据层：把 GitHub 仓库当成一个小数据库。
import { GitHubRepo } from './github.js';
import { getSettings } from './storage.js';
import {
  SCHEMA_VERSION, EXERCISES_PATH, META_PATH, planImport, monthOf, workoutPath, mealPath, newBatchId, localIso,
} from './schema.js';

let gh = null;
let snapPromise = null;
let snapAt = 0;
const SNAP_MAX_AGE_MS = 60_000; // 快照最多复用 60 秒，避免 App 挂在后台很久后用旧数据判重

export function client() {
  const s = getSettings();
  if (!gh || gh.token !== s.token || gh.owner !== s.owner || gh.repo !== s.repo) {
    gh = new GitHubRepo(s);
    snapPromise = null;
  }
  return gh;
}

export function resetClient() {
  gh = null;
  snapPromise = null;
}

function metaObj() {
  return { app: 'fitness-log', schema_version: SCHEMA_VERSION, created_at: localIso() };
}

/**
 * 快照：某一时刻的分支头 + 文件列表 + 动作库。预览和写入都基于同一个快照，
 * 写入时若分支头已变，GitHub 拒绝更新（见 github.js），从而避免覆盖别人的修改。
 */
async function loadSnapshot() {
  const g = client();
  let head = await g.head();
  if (!head) {
    await g.initEmpty(metaObj());
    head = await g.head();
  }
  const paths = await g.listTree(head.treeSha);
  const exercisesFile = paths.has(EXERCISES_PATH) ? await g.readJsonBlob(paths.get(EXERCISES_PATH)) : null;
  return { head, paths, exercisesFile, library: exercisesFile?.exercises ?? [] };
}

export function snapshot({ fresh = false } = {}) {
  client();
  if (fresh || !snapPromise || Date.now() - snapAt > SNAP_MAX_AGE_MS) {
    snapAt = Date.now();
    snapPromise = loadSnapshot();
    snapPromise.catch(() => { snapPromise = null; });
  }
  return snapPromise;
}

export async function readFile(snap, path) {
  if (!snap.paths.has(path)) return null;
  return client().readJsonBlob(snap.paths.get(path));
}

export function monthFilePath(data) {
  return data.kind === 'workout' ? workoutPath(monthOf(data.workout.date)) : mealPath(monthOf(data.meal.date));
}

/** 预览阶段：检查是否重复 */
export async function checkDuplicate(snap, data) {
  const mf = await readFile(snap, monthFilePath(data));
  if (!mf) return null;
  if (data.kind === 'workout') return mf.workouts.find((w) => w.id === data.workout.id) ?? null;
  return mf.meals.find((m) => m.id === data.meal.id) ?? null;
}

/** 写入：基于预览时的快照，一个原子 commit */
export async function commitImport(snap, data, raw, mode) {
  const monthFile = await readFile(snap, monthFilePath(data));
  const batchId = newBatchId();
  const { files, summary } = planImport({
    data, raw, exercisesFile: snap.exercisesFile, monthFile, mode, batchId, nowIso: localIso(),
  });
  if (!snap.paths.has(META_PATH)) files[META_PATH] = metaObj();
  await client().commitFiles(snap.head, files, `fitlog 导入 ${batchId}：${summary}`);
  snapPromise = null; // 下次使用时重新读取
  return { batchId, summary };
}

/** 某类月文件的列表（新→旧） */
export function monthPaths(snap, dir) {
  return [...snap.paths.keys()]
    .filter((p) => new RegExp(`^${dir}/\\d{4}-\\d{2}\\.json$`).test(p))
    .sort()
    .reverse();
}
