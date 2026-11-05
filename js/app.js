import { hasSettings, getSettings, saveSettings, store } from './storage.js';
import {
  parseImport, summarize, fmt1, describeLoad, describeAmount, paceUnit,
} from './schema.js';
import {
  snapshot, checkDuplicate, commitImport, readFile, monthPaths, resetClient, client,
} from './repo.js';

const $ = (sel) => document.querySelector(sel);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const WEEK = ['日', '一', '二', '三', '四', '五', '六'];
const weekday = (d) => `周${WEEK[new Date(`${d}T12:00:00`).getDay()]}`;
const chal = (c) => (c ? `<span class="chal-${esc(c)}">${esc(c)}</span>` : '');

function msg(el, kind, html) {
  el.innerHTML = html ? `<div class="msg ${kind}">${html}</div>` : '';
}
function loading(el, text) {
  el.innerHTML = `<div class="msg"><span class="spinner"></span>${esc(text)}</div>`;
}
function errorHtml(e) {
  const detail = e?.detail ? `<details><summary>技术细节</summary>${esc(e.detail)}</details>` : '';
  return `${esc(e?.message || String(e))}${detail}`;
}

// ---------------- 导航 ----------------

function show(view) {
  for (const v of ['input', 'history', 'settings']) $(`#view-${v}`).hidden = v !== view;
  document.querySelectorAll('.tabbar button').forEach((b) => b.classList.toggle('on', b.dataset.view === view));
  if (view === 'history') loadHistory();
  window.scrollTo(0, 0);
}
document.querySelectorAll('.tabbar button').forEach((b) => b.addEventListener('click', () => show(b.dataset.view)));

// ---------------- 录入 ----------------

let pending = null; // { raw, data, snap, duplicate }

async function readClipboard() {
  if (!navigator.clipboard?.readText) throw new Error('此浏览器不支持读取剪贴板');
  return navigator.clipboard.readText();
}

$('#btn-paste').addEventListener('click', async () => {
  if (!requireSettings()) return;
  let text;
  try {
    text = await readClipboard();
  } catch (e) {
    $('#manual').open = true;
    $('#manual-text').focus();
    msg($('#input-status'), 'warn', '读不到剪贴板（可能是没点“粘贴”或浏览器不允许）。请长按下面的输入框 → 粘贴。');
    return;
  }
  $('#manual-text').value = text;
  preview(text);
});
$('#btn-manual-preview').addEventListener('click', () => requireSettings() && preview($('#manual-text').value));
$('#manual-text').addEventListener('paste', () => {
  // 粘贴后自动预览，省一次点击
  setTimeout(() => requireSettings() && preview($('#manual-text').value), 0);
});

function requireSettings() {
  if (hasSettings()) return true;
  msg($('#input-status'), 'warn', '还没有设置 GitHub token 和数据仓库。');
  show('settings');
  return false;
}

async function preview(raw, note = '') {
  pending = null;
  $('#preview').innerHTML = '';
  loading($('#input-status'), '读取数据仓库…');
  let snap;
  try {
    snap = await snapshot();
  } catch (e) {
    msg($('#input-status'), 'err', errorHtml(e));
    return;
  }
  const res = parseImport(raw, snap.library);
  if (!res.ok) {
    msg($('#input-status'), 'err', `校验失败，什么都没有写入：<ul>${res.errors.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>`);
    return;
  }
  let duplicate = null;
  try {
    duplicate = await checkDuplicate(snap, res.data);
  } catch (e) {
    msg($('#input-status'), 'err', errorHtml(e));
    return;
  }
  pending = { raw, data: res.data, snap, duplicate };
  msg($('#input-status'), note ? 'warn' : '', note ? esc(note) : '');
  renderPreview(res, duplicate, snap.library);
}

function renderPreview(res, duplicate, library) {
  const { data } = res;
  // 按钮放在摘要下方、详情上方：不用滚动就能确认
  let html = `<div class="card"><div class="summary">${esc(summarize(data))}</div>`;
  if (res.warnings.length) html += `<div class="msg warn">注意：<ul>${res.warnings.map((w) => `<li>${esc(w)}</li>`).join('')}</ul></div>`;
  if (duplicate) {
    const label = data.kind === 'workout' ? `${duplicate.date} ${duplicate.start_time} 已有一条记录` : `${duplicate.date} ${duplicate.meal} 已有记录`;
    const what = data.kind === 'workout'
      ? `（${esc(duplicate.type)}${duplicate.course ? ` · ${esc(duplicate.course)}` : ''} · ${fmt1(duplicate.duration_min)} 分钟 · ${fmt1(duplicate.calories)} 千卡 · ${duplicate.sets?.length ?? 0} 组）`
      : `（${duplicate.items.map((i) => esc(i.food)).join('、')}）`;
    const hint = data.kind === 'workout' ? '覆盖 = 用这次粘贴的内容整条替换旧记录（含所有组）。' : '覆盖 = 整餐替换；追加 = 把这次的食物加到已有记录里。';
    html += `<div class="msg warn">${esc(label)}${what}。\n${hint}</div><div class="row">`;
    if (data.kind === 'meal') html += '<button class="secondary" data-act="append">追加</button>';
    html += '<button class="danger" data-act="overwrite">覆盖</button><button class="secondary" data-act="cancel">取消</button></div>';
  } else {
    html += '<div class="row"><button class="primary big" data-act="new">确认写入</button></div>';
  }
  html += '<hr>';
  if (data.kind === 'workout') html += workoutDetail(data.workout, [...library, ...data.newExercises], new Set(data.newExercises.map((e) => e.name)));
  else html += mealDetail(data.meal);
  if (!duplicate) html += '<div class="row"><button class="secondary" data-act="cancel">取消</button></div>';
  html += '</div>';
  $('#preview').innerHTML = html;
  $('#preview').querySelectorAll('button[data-act]').forEach((b) => b.addEventListener('click', () => onAction(b.dataset.act)));
}

async function onAction(act) {
  if (act === 'cancel') {
    pending = null;
    $('#preview').innerHTML = '';
    msg($('#input-status'), '', '');
    return;
  }
  if (!pending) return;
  const { raw, data, snap } = pending;
  $('#preview').querySelectorAll('button').forEach((b) => { b.disabled = true; });
  loading($('#input-status'), '正在写入…');
  try {
    const { summary, batchId } = await commitImport(snap, data, raw, act);
    pending = null;
    $('#preview').innerHTML = '';
    $('#manual-text').value = '';
    $('#manual').open = false;
    historyCache = null;
    msg($('#input-status'), 'ok', `✅ 已写入：${esc(summary)}\n批次 ${esc(batchId)}`);
  } catch (e) {
    if (e.code === 'CONFLICT') {
      // 基于新数据重新预览，用户再确认一次（期间的数据可能已改变判重结果）
      await snapshot({ fresh: true }).catch(() => {});
      await preview(raw, `${e.message}\n已按最新数据重新生成预览。`);
      return;
    }
    $('#preview').querySelectorAll('button').forEach((b) => { b.disabled = false; });
    if (e.code === 'NETWORK') {
      // 请求可能已到达 GitHub 但响应丢失。写入是单个 commit，不会出现写一半；再点确认即可自检：
      // 若其实已写入，会因分支已变而触发冲突 → 重新预览 → 显示「已有记录」。
      msg($('#input-status'), 'err', `❌ 网络中断，无法确认是否写入成功（不会出现写了一半的数据）。\n联网后再点一次按钮：如果其实已写入，会提示「已有记录」，点取消即可。\n${errorHtml(e)}`);
    } else {
      msg($('#input-status'), 'err', `❌ 写入失败，没有写入任何内容。\n${errorHtml(e)}`);
    }
  }
}

// ---------------- 详情渲染 ----------------

function workoutDetail(w, library, newNames = new Set()) {
  const exMap = new Map(library.map((e) => [e.name, e]));
  const rows = [
    ['日期', `${w.date} ${weekday(w.date)} ${w.start_time}`],
    ['类型', w.type],
    ['课程', w.course],
    ['时长', `${fmt1(w.duration_min)} 分钟`],
    ['消耗', `${fmt1(w.calories)} 千卡`],
    ['平均心率', w.avg_hr != null ? `${fmt1(w.avg_hr)}` : null],
    ['距离', w.distance_km != null ? `${fmt1(w.distance_km)} km` : null],
    ['步数', w.steps != null ? `${w.steps}` : null],
    ['配速', w.pace ? `${w.pace} ${w.pace_unit || paceUnit(w.type) || ''}` : null],
    ['桨频', w.stroke_rate != null ? `${fmt1(w.stroke_rate)} 桨/分` : null],
  ].filter(([, v]) => v != null && v !== '');
  let html = `<dl class="kv">${rows.map(([k, v]) => `<dt>${k}</dt><dd>${esc(v)}</dd>`).join('')}<dt>挑战感</dt><dd>${chal(w.challenge)}</dd>`;
  if (w.performance) html += `<dt>表现</dt><dd>${esc(w.performance)}</dd>`;
  if (w.mood) html += `<dt>想法心情</dt><dd>${esc(w.mood)}</dd>`;
  html += '</dl>';
  if (w.sets?.length) {
    const groups = new Map();
    for (const s of w.sets) {
      if (!groups.has(s.exercise)) groups.set(s.exercise, []);
      groups.get(s.exercise).push(s);
    }
    for (const [name, sets] of groups) {
      const ex = exMap.get(name);
      html += `<h3>${esc(name)}${newNames.has(name) ? '<span class="badge new">新动作</span>' : ''}${ex ? ` <span class="muted small">${esc(ex.equipment)}</span>` : ''}</h3>`;
      html += `<ul class="sets">${sets.map((s) => setLine(s, ex)).join('')}</ul>`;
    }
  }
  return html;
}

function setLine(s, ex) {
  return `<li>第 ${s.set} 组 · ${esc(describeLoad(s, ex?.equipment))} × ${esc(describeAmount(s))}${s.challenge ? ` · ${chal(s.challenge)}` : ''}${s.note ? ` <span class="muted">· ${esc(s.note)}</span>` : ''}</li>`;
}

function mealDetail(m) {
  let html = `<ul class="sets">${m.items.map((it) => `<li>${esc(it.food)} · ${it.grams != null ? `${fmt1(it.grams)} g` : '<span class="muted">克数未知</span>'}${it.note ? ` <span class="muted">· ${esc(it.note)}</span>` : ''}</li>`).join('')}</ul>`;
  if (m.note) html += `<p class="muted">${esc(m.note)}</p>`;
  return html;
}

// ---------------- 记录（输出页） ----------------

let historyCache = null; // { snap, workoutMonths, mealMonths, loadedWorkouts, loadedMeals, wIdx, mIdx }
let currentSub = 'recent';

document.querySelectorAll('.segmented button').forEach((b) => b.addEventListener('click', () => {
  currentSub = b.dataset.sub;
  document.querySelectorAll('.segmented button').forEach((x) => x.classList.toggle('on', x === b));
  for (const s of ['recent', 'exercise', 'meals']) $(`#sub-${s}`).hidden = s !== currentSub;
  renderSub();
}));

async function loadHistory() {
  if (!hasSettings()) {
    msg($('#history-status'), 'warn', '请先到「设置」里填写 token 和数据仓库。');
    return;
  }
  if (historyCache && Date.now() - historyCache.at < 120_000) { renderSub(); return; }
  loading($('#history-status'), '读取数据仓库…');
  try {
    const snap = await snapshot();
    historyCache = {
      at: Date.now(),
      snap,
      workoutMonths: monthPaths(snap, 'workouts'),
      mealMonths: monthPaths(snap, 'meals'),
      workouts: [], meals: [], wIdx: 0, mIdx: 0,
    };
    msg($('#history-status'), '', '');
    fillExerciseSelect(snap.library);
    renderSub();
  } catch (e) {
    msg($('#history-status'), 'err', errorHtml(e));
  }
}

// 按月份从新到旧，再读一个月
async function loadMoreWorkouts() {
  const h = historyCache;
  if (h.wIdx >= h.workoutMonths.length) return false;
  const f = await readFile(h.snap, h.workoutMonths[h.wIdx++]);
  h.workouts.push(...(f?.workouts ?? []));
  h.workouts.sort((a, b) => b.id.localeCompare(a.id));
  return true;
}
async function loadMoreMeals() {
  const h = historyCache;
  if (h.mIdx >= h.mealMonths.length) return false;
  const f = await readFile(h.snap, h.mealMonths[h.mIdx++]);
  h.meals.push(...(f?.meals ?? []));
  h.meals.sort((a, b) => b.id.localeCompare(a.id));
  return true;
}

async function renderSub() {
  if (!historyCache) return;
  try {
    if (currentSub === 'recent') await renderRecent();
    else if (currentSub === 'exercise') await renderExerciseHistory();
    else await renderMeals();
  } catch (e) {
    msg($('#history-status'), 'err', errorHtml(e));
  }
}

async function renderRecent() {
  const h = historyCache;
  const el = $('#sub-recent');
  if (h.wIdx === 0) {
    loading(el, '加载中…');
    while (h.workouts.length < 10 && await loadMoreWorkouts());
  }
  if (!h.workouts.length) { el.innerHTML = '<p class="muted">还没有运动记录。去「录入」粘贴第一条吧。</p>'; return; }
  const lib = h.snap.library;
  el.innerHTML = h.workouts.map((w) => `
    <div class="list-item">
      <div class="top"><span>${esc(w.date.slice(5))} ${weekday(w.date)} ${esc(w.start_time)} · ${esc(w.type)}</span>${chal(w.challenge)}</div>
      <div class="sub2">${w.course ? `${esc(w.course)} · ` : ''}${fmt1(w.duration_min)} 分钟 · ${fmt1(w.calories)} 千卡${w.sets?.length ? ` · ${w.sets.length} 组` : ''}</div>
      <details><summary>详情</summary>${workoutDetail(w, lib)}</details>
    </div>`).join('')
    + (h.wIdx < h.workoutMonths.length ? '<button class="secondary" id="btn-more-w" style="width:100%">加载更早一个月</button>' : '<p class="muted small">已全部加载</p>');
  $('#btn-more-w')?.addEventListener('click', async (ev) => { ev.target.disabled = true; await loadMoreWorkouts(); renderRecent(); });
}

function fillExerciseSelect(library) {
  const sel = $('#exercise-select');
  const keep = sel.value || store.get('last_exercise') || '';
  const byBase = new Map();
  for (const e of library) {
    const b = e.base || '其他';
    if (!byBase.has(b)) byBase.set(b, []);
    byBase.get(b).push(e);
  }
  sel.innerHTML = '<option value="">选择动作…</option>' + [...byBase.entries()]
    .sort(([a], [b]) => a.localeCompare(b, 'zh'))
    .map(([b, list]) => `<optgroup label="${esc(b)}">${list.map((e) => `<option value="${esc(e.name)}">${esc(e.name)}（${esc(e.equipment)}）</option>`).join('')}</optgroup>`)
    .join('');
  if (library.some((e) => e.name === keep)) sel.value = keep;
}
$('#exercise-select').addEventListener('change', () => {
  try { store.set('last_exercise', $('#exercise-select').value); } catch { /* 忽略 */ }
  renderExerciseHistory();
});

const SESSIONS_SHOWN = 5;
async function renderExerciseHistory() {
  const h = historyCache;
  const el = $('#exercise-history');
  const name = $('#exercise-select').value;
  if (!h.snap.library.length) { el.innerHTML = '<p class="muted">动作库还是空的。</p>'; return; }
  if (!name) { el.innerHTML = ''; return; }
  const ex = h.snap.library.find((e) => e.name === name);
  const hits = () => h.workouts.filter((w) => w.sets?.some((s) => s.exercise === name));
  loading(el, '查找中…');
  while (hits().length < SESSIONS_SHOWN && await loadMoreWorkouts());
  const sessions = hits().slice(0, SESSIONS_SHOWN);
  if (!sessions.length) { el.innerHTML = '<p class="muted">还没有这个动作的记录。</p>'; return; }
  el.innerHTML = `<p class="muted small">${esc(ex?.base || '')} · ${esc(ex?.equipment || '')} · 按${esc(ex?.measure || '')} · 最近 ${sessions.length} 次</p>`
    + sessions.map((w) => {
      const sets = w.sets.filter((s) => s.exercise === name).sort((a, b) => a.set - b.set);
      return `<div class="session">
        <div class="when">${esc(w.date)} ${weekday(w.date)} ${esc(w.start_time)}</div>
        <div class="sub2 muted small">${esc(w.course || w.type)} · 整体 ${chal(w.challenge)}</div>
        <ul class="sets">${sets.map((s) => setLine(s, ex)).join('')}</ul>
      </div>`;
    }).join('');
}

async function renderMeals() {
  const h = historyCache;
  const el = $('#sub-meals');
  if (h.mIdx === 0) {
    loading(el, '加载中…');
    while (h.meals.length < 10 && await loadMoreMeals());
  }
  if (!h.meals.length) { el.innerHTML = '<p class="muted">还没有饮食记录。</p>'; return; }
  el.innerHTML = h.meals.map((m) => `
    <div class="list-item">
      <div class="top"><span>${esc(m.date.slice(5))} ${weekday(m.date)} · ${esc(m.meal)}</span><span class="muted small">${m.items.length} 种</span></div>
      ${mealDetail(m)}
    </div>`).join('')
    + (h.mIdx < h.mealMonths.length ? '<button class="secondary" id="btn-more-m" style="width:100%">加载更早一个月</button>' : '');
  $('#btn-more-m')?.addEventListener('click', async (ev) => { ev.target.disabled = true; await loadMoreMeals(); renderMeals(); });
}

// ---------------- 设置 ----------------

function fillSettings() {
  const s = getSettings();
  $('#s-token').value = s.token;
  $('#s-owner').value = s.owner;
  $('#s-repo').value = s.repo || 'fitness-log-data';
}

$('#settings-form').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const token = $('#s-token').value.trim();
  const owner = $('#s-owner').value.trim();
  const repo = $('#s-repo').value.trim();
  if (!token || !owner || !repo) { msg($('#settings-status'), 'err', '三项都要填。'); return; }
  try {
    saveSettings({ token, owner, repo });
  } catch (e) {
    msg($('#settings-status'), 'err', `无法保存到本机存储：${esc(e.message)}`);
    return;
  }
  resetClient();
  historyCache = null;
  loading($('#settings-status'), '测试连接…');
  try {
    const info = await client().info();
    const warn = [];
    if (!info.private) warn.push('⚠️ 这个仓库是公开的！运动数据会被任何人看到。建议改成私有仓库。');
    if (info.permissions && !info.permissions.push) warn.push('⚠️ token 没有写权限，只能查看不能录入。请给 Contents 设为 Read and write。');
    const snap = await snapshot({ fresh: true });
    msg($('#settings-status'), warn.length ? 'warn' : 'ok',
      `✅ 连接成功：${esc(info.full_name)}（${info.private ? '私有' : '公开'}，分支 ${esc(info.default_branch)}），动作库 ${snap.library.length} 个动作。${warn.length ? `\n${warn.join('\n')}` : ''}`);
    $('#settings-intro').hidden = true;
  } catch (e) {
    msg($('#settings-status'), 'err', `设置已保存，但连接失败：\n${errorHtml(e)}`);
  }
});

$('#btn-forget').addEventListener('click', () => {
  if (!confirm('清除本机保存的 token、owner 和仓库名？')) return;
  for (const k of ['token', 'owner', 'repo', 'last_exercise']) store.remove(k);
  resetClient();
  historyCache = null;
  fillSettings();
  msg($('#settings-status'), 'ok', '已清除本 App 的设置。');
});

// ---------------- 启动 ----------------

fillSettings();
if (hasSettings()) {
  $('#settings-intro').hidden = true;
  snapshot().catch(() => {}); // 预先读取，粘贴后预览更快
} else {
  show('settings');
}
