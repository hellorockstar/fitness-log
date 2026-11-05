// 纯函数模块：常量、导入 JSON 校验、写入计划。不访问网络和 localStorage，可在 Node 中测试。

export const SCHEMA_VERSION = 1;

export const WORKOUT_TYPES = ['跑步', '力量', '游泳', '骑行', '走路', 'Zumba', '划船机', '其他'];
export const CHALLENGES = ['轻松', '适中', '有挑战'];
export const EQUIPMENTS = ['杠铃', '哑铃', '杠铃片', '壶铃', '自重', '器械'];
export const MEASURES = ['次数', '秒'];
export const MEALS = ['早餐', '午餐', '晚餐', '早加餐', '午加餐', '晚加餐', '其他'];
export const DEFAULT_BAR_KG = 2.64;

const WORKOUT_FIELDS = {
  date: 'required', start_time: 'required', type: 'required', duration_min: 'required',
  calories: 'required', challenge: 'required', avg_hr: 'optional', course: 'optional',
  distance_km: 'optional', steps: 'optional', pace: 'optional', stroke_rate: 'optional',
  performance: 'optional', mood: 'optional',
};
const SET_FIELDS = ['exercise', 'set', 'bar_kg', 'load_kg', 'reps', 'seconds', 'challenge', 'note'];
const NEW_EX_FIELDS = ['name', 'base', 'equipment', 'measure'];
const MEAL_ITEM_FIELDS = ['food', 'grams', 'note'];

// ---------- 小工具 ----------

export function stripFences(text) {
  // Gem 有时会把 JSON 包在 ```json ... ``` 里；只剥掉外层围栏，原文另行存档。
  let t = String(text ?? '').trim();
  const m = t.match(/^```[a-zA-Z]*\s*\n?([\s\S]*?)\n?```$/);
  if (m) t = m[1].trim();
  return t;
}

export function isValidDate(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, mo, d] = s.split('-').map(Number);
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

export function isValidTime(s) {
  return typeof s === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(s);
}

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const isInt = (v) => Number.isInteger(v);
const isBlank = (v) => v === undefined || v === null || v === '';

export function fmt1(n) {
  // 显示用：最多 1 位小数，去掉无意义的 .0
  if (!isNum(n)) return '';
  const r = Math.round(n * 10) / 10;
  return Number.isInteger(r) ? String(r) : r.toFixed(1);
}

export const monthOf = (date) => date.slice(0, 7);
export const workoutId = (date, start) => `${date}T${start}`;
export const workoutPath = (month) => `workouts/${month}.json`;
export const mealPath = (month) => `meals/${month}.json`;
export const EXERCISES_PATH = 'exercises.json';
export const META_PATH = 'meta.json';

export function paceUnit(type) {
  if (type === '跑步') return '/km';
  if (type === '划船机') return '/500m';
  return null;
}

// 总重：只在显示时计算，不存储
export function totalWeight(set, equipment) {
  if (!isNum(set.load_kg)) return null;
  if (equipment === '杠铃') return (isNum(set.bar_kg) ? set.bar_kg : DEFAULT_BAR_KG) + set.load_kg * 2;
  return set.load_kg;
}

export function describeLoad(set, equipment) {
  if (equipment === '自重' && !isNum(set.load_kg)) return '自重';
  if (!isNum(set.load_kg)) return '—';
  const l = fmt1(set.load_kg);
  switch (equipment) {
    case '杠铃': {
      const bar = isNum(set.bar_kg) ? set.bar_kg : DEFAULT_BAR_KG;
      const barNote = bar === DEFAULT_BAR_KG ? '' : `，杆 ${fmt1(bar)}`;
      return `每边 ${l} kg（总 ${fmt1(totalWeight(set, equipment))}${barNote}）`;
    }
    case '哑铃': return `单只 ${l} kg`;
    case '自重': return `自重 + ${l} kg`;
    default: return `${l} kg`;
  }
}

export function describeAmount(set) {
  if (isNum(set.reps)) return `${set.reps} 次`;
  if (isNum(set.seconds)) return `${fmt1(set.seconds)} 秒`;
  return '—';
}

// ---------- 校验 ----------

function checkUnknown(obj, allowed, path, errors) {
  for (const k of Object.keys(obj)) {
    if (!allowed.includes(k)) errors.push(`${path}.${k}：未知字段（拼写错误？允许的字段：${allowed.join(', ')}）`);
  }
}

/**
 * 解析并校验粘贴文本。
 * @param {string} text 粘贴的原文
 * @param {Array} library 现有动作库（exercises.json 中的 exercises 数组）
 * @returns {{ok:boolean, errors:string[], warnings:string[], data?:object}}
 */
export function parseImport(text, library = []) {
  const errors = [];
  const warnings = [];
  const body = stripFences(text);
  if (!body) return { ok: false, errors: ['内容为空：剪贴板里没有文字'], warnings };
  let obj;
  try {
    obj = JSON.parse(body);
  } catch (e) {
    return { ok: false, errors: [`不是合法 JSON：${e.message}`], warnings };
  }
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
    return { ok: false, errors: ['顶层必须是一个 JSON 对象 { ... }'], warnings };
  }
  if (obj.schema_version !== SCHEMA_VERSION) {
    errors.push(`schema_version：必须是 ${SCHEMA_VERSION}（当前：${JSON.stringify(obj.schema_version)}）`);
  }
  if (obj.kind === 'workout') return validateWorkout(obj, library, errors, warnings);
  if (obj.kind === 'meal') return validateMeal(obj, errors, warnings);
  errors.push(`kind：必须是 "workout" 或 "meal"（当前：${JSON.stringify(obj.kind)}）`);
  return { ok: false, errors, warnings };
}

function validateWorkout(obj, library, errors, warnings) {
  checkUnknown(obj, ['schema_version', 'kind', 'workout', 'sets', 'new_exercises'], '顶层', errors);
  const w = obj.workout;
  if (!w || typeof w !== 'object' || Array.isArray(w)) {
    errors.push('workout：缺失或不是对象');
    return { ok: false, errors, warnings };
  }
  checkUnknown(w, Object.keys(WORKOUT_FIELDS), 'workout', errors);
  for (const [k, req] of Object.entries(WORKOUT_FIELDS)) {
    if (req === 'required' && isBlank(w[k])) errors.push(`workout.${k}：必填，缺失`);
  }
  if (!isBlank(w.date) && !isValidDate(w.date)) errors.push(`workout.date：格式应为 YYYY-MM-DD 且是真实日期（当前：${JSON.stringify(w.date)}）`);
  if (!isBlank(w.start_time) && !isValidTime(w.start_time)) errors.push(`workout.start_time：格式应为 24 小时制 HH:MM（当前：${JSON.stringify(w.start_time)}）`);
  if (!isBlank(w.type) && !WORKOUT_TYPES.includes(w.type)) errors.push(`workout.type：必须是 ${WORKOUT_TYPES.join('/')} 之一（当前：${JSON.stringify(w.type)}）`);
  if (!isBlank(w.challenge) && !CHALLENGES.includes(w.challenge)) errors.push(`workout.challenge：必须是 ${CHALLENGES.join('/')} 之一（当前：${JSON.stringify(w.challenge)}）`);
  const numChecks = [
    ['duration_min', (v) => isNum(v) && v > 0, '正数（分钟）'],
    ['calories', (v) => isNum(v) && v >= 0, '非负数（千卡）'],
    ['avg_hr', (v) => isNum(v) && v > 0 && v < 260, '30–260 之间的数字'],
    ['distance_km', (v) => isNum(v) && v >= 0, '非负数（公里）'],
    ['steps', (v) => isInt(v) && v >= 0, '非负整数'],
    ['stroke_rate', (v) => isNum(v) && v > 0, '正数（桨/分钟）'],
  ];
  for (const [k, ok, desc] of numChecks) {
    if (!isBlank(w[k]) && !ok(w[k])) errors.push(`workout.${k}：应为${desc}（当前：${JSON.stringify(w[k])}）`);
  }
  if (!isBlank(w.pace) && !(typeof w.pace === 'string' && /^\d{1,2}:[0-5]\d$/.test(w.pace))) {
    errors.push(`workout.pace：应为 "分:秒" 字符串，如 "5:30"（当前：${JSON.stringify(w.pace)}）`);
  }
  for (const k of ['course', 'performance', 'mood']) {
    if (!isBlank(w[k]) && typeof w[k] !== 'string') errors.push(`workout.${k}：应为文字`);
  }
  if (!isBlank(w.pace) && !paceUnit(w.type)) warnings.push(`配速只对跑步（每公里）和划船机（每 500m）有意义，类型「${w.type}」也会照常保存`);
  if (!isBlank(w.stroke_rate) && w.type !== '划船机') warnings.push('桨频一般只用于划船机，仍会照常保存');

  // 新动作
  const libByName = new Map(library.map((e) => [e.name, e]));
  const newEx = [];
  const newExIn = obj.new_exercises ?? [];
  if (!Array.isArray(newExIn)) errors.push('new_exercises：应为数组');
  else {
    const seen = new Set();
    newExIn.forEach((e, i) => {
      const p = `new_exercises[${i}]`;
      if (!e || typeof e !== 'object' || Array.isArray(e)) { errors.push(`${p}：应为对象`); return; }
      checkUnknown(e, NEW_EX_FIELDS, p, errors);
      if (isBlank(e.name) || typeof e.name !== 'string') { errors.push(`${p}.name：必填`); return; }
      const name = e.name.trim();
      if (seen.has(name)) errors.push(`${p}.name：「${name}」重复`);
      seen.add(name);
      if (isBlank(e.base) || typeof e.base !== 'string') errors.push(`${p}.base：必填（基础动作，如「硬拉」）`);
      if (!EQUIPMENTS.includes(e.equipment)) errors.push(`${p}.equipment：必须是 ${EQUIPMENTS.join('/')} 之一（当前：${JSON.stringify(e.equipment)}）`);
      if (!MEASURES.includes(e.measure)) errors.push(`${p}.measure：必须是 ${MEASURES.join('/')} 之一（当前：${JSON.stringify(e.measure)}）`);
      const existing = libByName.get(name);
      if (existing) {
        const diff = ['base', 'equipment', 'measure'].filter((k) => existing[k] !== e[k]);
        warnings.push(`「${name}」已在动作库中，不按新动作处理${diff.length ? `（以动作库为准，忽略不同的字段：${diff.join(', ')}）` : ''}`);
        return;
      }
      newEx.push({ name, base: String(e.base ?? '').trim(), equipment: e.equipment, measure: e.measure });
    });
  }
  const exByName = new Map([...libByName, ...newEx.map((e) => [e.name, e])]);

  // 组
  const sets = [];
  const setsIn = obj.sets ?? [];
  if (!Array.isArray(setsIn)) errors.push('sets：应为数组');
  else {
    const seenSet = new Set();
    setsIn.forEach((s, i) => {
      const p = `sets[${i}]`;
      if (!s || typeof s !== 'object' || Array.isArray(s)) { errors.push(`${p}：应为对象`); return; }
      checkUnknown(s, SET_FIELDS, p, errors);
      const name = typeof s.exercise === 'string' ? s.exercise.trim() : '';
      if (!name) { errors.push(`${p}.exercise：必填`); return; }
      const ex = exByName.get(name);
      if (!ex) errors.push(`${p}.exercise：「${name}」不在动作库里，也没有出现在 new_exercises 中`);
      if (!isInt(s.set) || s.set < 1) errors.push(`${p}.set：应为从 1 开始的整数（当前：${JSON.stringify(s.set)}）`);
      const key = `${name}#${s.set}`;
      if (seenSet.has(key)) errors.push(`${p}：「${name}」第 ${s.set} 组重复出现`);
      seenSet.add(key);
      if (!isBlank(s.load_kg) && !(isNum(s.load_kg) && s.load_kg >= 0)) errors.push(`${p}.load_kg：应为非负数（当前：${JSON.stringify(s.load_kg)}）`);
      if (!isBlank(s.bar_kg) && !(isNum(s.bar_kg) && s.bar_kg >= 0)) errors.push(`${p}.bar_kg：应为非负数（当前：${JSON.stringify(s.bar_kg)}）`);
      if (!isBlank(s.reps) && !(isInt(s.reps) && s.reps >= 0)) errors.push(`${p}.reps：应为非负整数（当前：${JSON.stringify(s.reps)}）`);
      if (!isBlank(s.seconds) && !(isNum(s.seconds) && s.seconds >= 0)) errors.push(`${p}.seconds：应为非负数（当前：${JSON.stringify(s.seconds)}）`);
      if (!isBlank(s.challenge) && !CHALLENGES.includes(s.challenge)) errors.push(`${p}.challenge：必须是 ${CHALLENGES.join('/')} 之一（当前：${JSON.stringify(s.challenge)}）`);
      if (!isBlank(s.note) && typeof s.note !== 'string') errors.push(`${p}.note：应为文字`);
      if (ex) {
        if (ex.measure === '秒' && isBlank(s.seconds)) errors.push(`${p}.seconds：「${name}」按秒计量，必须填 seconds`);
        if (ex.measure === '次数' && isBlank(s.reps)) errors.push(`${p}.reps：「${name}」按次数计量，必须填 reps`);
        if (ex.equipment !== '自重' && isBlank(s.load_kg)) errors.push(`${p}.load_kg：器械为「${ex.equipment}」，必须填负重`);
        if (ex.equipment !== '杠铃' && !isBlank(s.bar_kg)) warnings.push(`${p}：「${name}」不是杠铃动作，bar_kg 将被忽略`);
      }
      const isBarbell = ex?.equipment === '杠铃';
      sets.push({
        exercise: name,
        set: s.set,
        bar_kg: isBarbell ? (isBlank(s.bar_kg) ? DEFAULT_BAR_KG : s.bar_kg) : null,
        load_kg: isBlank(s.load_kg) ? null : s.load_kg,
        reps: isBlank(s.reps) ? null : s.reps,
        seconds: isBlank(s.seconds) ? null : s.seconds,
        challenge: isBlank(s.challenge) ? null : s.challenge,
        note: isBlank(s.note) ? null : s.note,
      });
    });
  }
  const unused = newEx.filter((e) => !sets.some((s) => s.exercise === e.name));
  if (unused.length) warnings.push(`新动作 ${unused.map((e) => `「${e.name}」`).join('、')} 没有出现在任何一组中，仍会加入动作库`);
  if (w.type === '力量' && sets.length === 0) warnings.push('力量训练没有任何组数据');

  if (errors.length) return { ok: false, errors, warnings };

  const workout = {
    id: workoutId(w.date, w.start_time),
    date: w.date,
    start_time: w.start_time,
    type: w.type,
    duration_min: w.duration_min,
    calories: w.calories,
    avg_hr: w.avg_hr ?? null,
    course: isBlank(w.course) ? null : w.course,
    distance_km: w.distance_km ?? null,
    steps: w.steps ?? null,
    pace: isBlank(w.pace) ? null : w.pace,
    pace_unit: isBlank(w.pace) ? null : (paceUnit(w.type) ?? '/km'),
    stroke_rate: w.stroke_rate ?? null,
    challenge: w.challenge,
    performance: isBlank(w.performance) ? null : w.performance,
    mood: isBlank(w.mood) ? null : w.mood,
    sets, // 保持 Gem 输出的顺序
  };
  return { ok: true, errors, warnings, data: { kind: 'workout', workout, newExercises: newEx } };
}

function validateMeal(obj, errors, warnings) {
  checkUnknown(obj, ['schema_version', 'kind', 'meal'], '顶层', errors);
  const m = obj.meal;
  if (!m || typeof m !== 'object' || Array.isArray(m)) {
    errors.push('meal：缺失或不是对象');
    return { ok: false, errors, warnings };
  }
  checkUnknown(m, ['date', 'meal', 'items', 'note'], 'meal', errors);
  if (!isValidDate(m.date)) errors.push(`meal.date：必填，格式 YYYY-MM-DD（当前：${JSON.stringify(m.date)}）`);
  if (!MEALS.includes(m.meal)) errors.push(`meal.meal：必须是 ${MEALS.join('/')} 之一（当前：${JSON.stringify(m.meal)}）`);
  if (!isBlank(m.note) && typeof m.note !== 'string') errors.push('meal.note：应为文字');
  const items = [];
  if (!Array.isArray(m.items) || m.items.length === 0) errors.push('meal.items：必填，至少一种食物');
  else {
    m.items.forEach((it, i) => {
      const p = `meal.items[${i}]`;
      if (!it || typeof it !== 'object' || Array.isArray(it)) { errors.push(`${p}：应为对象`); return; }
      checkUnknown(it, MEAL_ITEM_FIELDS, p, errors);
      if (isBlank(it.food) || typeof it.food !== 'string') errors.push(`${p}.food：必填`);
      if (!isBlank(it.grams) && !(isNum(it.grams) && it.grams >= 0)) errors.push(`${p}.grams：应为非负数（当前：${JSON.stringify(it.grams)}）`);
      if (isBlank(it.grams)) warnings.push(`${p}：「${it.food}」没有克数`);
      if (!isBlank(it.note) && typeof it.note !== 'string') errors.push(`${p}.note：应为文字`);
      items.push({ food: String(it.food ?? '').trim(), grams: it.grams ?? null, note: isBlank(it.note) ? null : it.note });
    });
  }
  if (errors.length) return { ok: false, errors, warnings };
  return {
    ok: true, errors, warnings,
    data: { kind: 'meal', meal: { id: `${m.date}#${m.meal}`, date: m.date, meal: m.meal, note: isBlank(m.note) ? null : m.note, items } },
  };
}

// ---------- 摘要 ----------

export function summarize(data) {
  if (data.kind === 'meal') {
    const m = data.meal;
    return `${m.date} ${m.meal}：${m.items.length} 种食物`;
  }
  const w = data.workout;
  let s = `1 次运动（${w.date} ${w.start_time} ${w.type}）`;
  if (w.sets.length) s += ` + ${w.sets.length} 组`;
  if (data.newExercises.length) s += `，新动作 ${data.newExercises.length} 个：${data.newExercises.map((e) => e.name).join('、')}`;
  return s;
}

// ---------- 写入计划（纯函数） ----------

export function emptyMonthFile(month, key) {
  return { schema_version: SCHEMA_VERSION, month, [key]: [] };
}
export function emptyExercisesFile() {
  return { schema_version: SCHEMA_VERSION, exercises: [] };
}

/**
 * 根据当前文件内容计算要写入的文件。
 * @param {object} p
 * @param {object} p.data parseImport 的 data
 * @param {string} p.raw 原始粘贴文本（原样存档）
 * @param {object|null} p.exercisesFile 当前 exercises.json（null = 不存在）
 * @param {object|null} p.monthFile 当前月文件（null = 不存在）
 * @param {'new'|'overwrite'|'append'} p.mode
 * @param {string} p.batchId
 * @param {string} p.nowIso
 * @returns {{files: Object<string, object>, summary: string, existed: boolean}}
 */
export function planImport({ data, raw, exercisesFile, monthFile, mode, batchId, nowIso }) {
  const files = {};
  let summary = summarize(data);
  if (data.kind === 'workout') {
    const w = { ...data.workout, import_id: batchId, updated_at: nowIso };
    const month = monthOf(w.date);
    const mf = monthFile ? structuredClone(monthFile) : emptyMonthFile(month, 'workouts');
    const idx = mf.workouts.findIndex((x) => x.id === w.id);
    if (idx >= 0 && mode !== 'overwrite') throw new Error(`DUPLICATE:${w.id}`);
    if (idx >= 0) { mf.workouts[idx] = w; summary = `覆盖 ${summary}`; }
    else mf.workouts.push(w);
    mf.workouts.sort((a, b) => a.id.localeCompare(b.id));
    files[workoutPath(month)] = mf;
    if (data.newExercises.length) {
      const ef = exercisesFile ? structuredClone(exercisesFile) : emptyExercisesFile();
      for (const e of data.newExercises) {
        if (!ef.exercises.some((x) => x.name === e.name)) ef.exercises.push({ ...e, created_at: nowIso, import_id: batchId });
      }
      ef.exercises.sort((a, b) => a.name.localeCompare(b.name, 'zh'));
      files[EXERCISES_PATH] = ef;
    }
  } else {
    const m = { ...data.meal, import_id: batchId, updated_at: nowIso };
    const month = monthOf(m.date);
    const mf = monthFile ? structuredClone(monthFile) : emptyMonthFile(month, 'meals');
    const idx = mf.meals.findIndex((x) => x.id === m.id);
    if (idx >= 0 && mode === 'new') throw new Error(`DUPLICATE:${m.id}`);
    if (idx >= 0 && mode === 'overwrite') { mf.meals[idx] = m; summary = `覆盖 ${summary}`; }
    else if (idx >= 0 && mode === 'append') {
      const old = mf.meals[idx];
      mf.meals[idx] = { ...m, items: [...old.items, ...m.items], note: [old.note, m.note].filter(Boolean).join('；') || null };
      summary = `追加到 ${summary}`;
    } else mf.meals.push(m);
    mf.meals.sort((a, b) => a.id.localeCompare(b.id));
    files[mealPath(month)] = mf;
  }
  const [d] = nowIso.split('T');
  files[`imports/${d.slice(0, 7)}/${batchId}.json`] = {
    schema_version: SCHEMA_VERSION,
    batch_id: batchId,
    imported_at: nowIso,
    kind: data.kind,
    mode,
    summary,
    raw,
  };
  return { files, summary };
}

export function newBatchId(now = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  const stamp = `${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}-${p(now.getHours())}${p(now.getMinutes())}${p(now.getSeconds())}`;
  const rand = Math.random().toString(16).slice(2, 6).padEnd(4, '0');
  return `imp-${stamp}-${rand}`;
}

// 本地时区的 ISO 字符串（带偏移），便于人读
export function localIso(now = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  const off = -now.getTimezoneOffset();
  const sign = off >= 0 ? '+' : '-';
  const ao = Math.abs(off);
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}T${p(now.getHours())}:${p(now.getMinutes())}:${p(now.getSeconds())}${sign}${p(Math.floor(ao / 60))}:${p(ao % 60)}`;
}
