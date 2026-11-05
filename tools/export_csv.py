#!/usr/bin/env python3
"""把数据仓库（fitness-log-data 的本地 clone）导出为 CSV，方便迁移到 Excel/Numbers。

用法：
    git clone https://github.com/<你>/fitness-log-data.git
    python3 export_csv.py fitness-log-data  out/

输出：workouts.csv（每次运动一行）、sets.csv（每组一行，含计算出的总重）、exercises.csv、meals.csv（每种食物一行）。
编码 UTF-8 带 BOM，Excel 直接打开不乱码。
"""
import csv, glob, json, os, sys

DEFAULT_BAR_KG = 2.64

def load(pattern, key):
    rows = []
    for f in sorted(glob.glob(pattern)):
        with open(f, encoding='utf-8') as fh:
            rows += json.load(fh).get(key, [])
    return rows

def write(path, rows, fields):
    with open(path, 'w', encoding='utf-8-sig', newline='') as fh:
        w = csv.DictWriter(fh, fieldnames=fields, extrasaction='ignore')
        w.writeheader()
        w.writerows(rows)

def main(src, out):
    os.makedirs(out, exist_ok=True)
    ex_path = os.path.join(src, 'exercises.json')
    exercises = json.load(open(ex_path, encoding='utf-8'))['exercises'] if os.path.exists(ex_path) else []
    equip = {e['name']: e['equipment'] for e in exercises}
    workouts = load(os.path.join(src, 'workouts', '*.json'), 'workouts')
    sets = []
    for w in workouts:
        for s in w.get('sets', []):
            total = None
            if s.get('load_kg') is not None:
                total = (s.get('bar_kg') or DEFAULT_BAR_KG) + s['load_kg'] * 2 if equip.get(s['exercise']) == '杠铃' else s['load_kg']
            sets.append({'workout_id': w['id'], 'date': w['date'], 'course': w.get('course'), **s,
                         'equipment': equip.get(s['exercise']), 'total_kg': None if total is None else round(total, 1)})
    wf = ['id', 'date', 'start_time', 'type', 'duration_min', 'calories', 'avg_hr', 'course', 'distance_km', 'steps',
          'pace', 'pace_unit', 'stroke_rate', 'challenge', 'performance', 'mood', 'import_id', 'updated_at']
    write(os.path.join(out, 'workouts.csv'), workouts, wf)
    write(os.path.join(out, 'sets.csv'), sets, ['workout_id', 'date', 'course', 'exercise', 'set', 'equipment', 'bar_kg',
                                                'load_kg', 'total_kg', 'reps', 'seconds', 'challenge', 'note'])
    write(os.path.join(out, 'exercises.csv'), exercises, ['name', 'base', 'equipment', 'measure', 'created_at', 'import_id'])
    meals = [{'meal_id': m['id'], 'date': m['date'], 'meal': m['meal'], 'meal_note': m.get('note'), **it}
             for m in load(os.path.join(src, 'meals', '*.json'), 'meals') for it in m['items']]
    write(os.path.join(out, 'meals.csv'), meals, ['meal_id', 'date', 'meal', 'food', 'grams', 'note', 'meal_note'])
    print(f'导出完成：{len(workouts)} 次运动，{len(sets)} 组，{len(exercises)} 个动作，{len(meals)} 条食物 → {out}')

if __name__ == '__main__':
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    main(sys.argv[1], sys.argv[2])
