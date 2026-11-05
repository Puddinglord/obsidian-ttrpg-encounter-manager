#!/usr/bin/env python3
"""Merge the per-page-range extractions in raw/ into src/data/bestiary.json.

Run from the repo root:  python3 -I scripts/bestiary/merge.py

Policy:
- Same book + same name + same level: exact reprints are dropped. For GM Guide
  variants the bestiary-section entry (PDF pages 15-19) wins; otherwise the first.
- Same book + same name, different levels: each becomes "Name (lvl X)".
- The same monster in both books: Monsters & More keeps the plain name; the GM
  Guide one becomes "Name (GM Guide)", or is dropped if identical.
"""
import glob, json, os, re, sys

ROOT = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(ROOT, '..', '..', 'src', 'data', 'bestiary.json')
KEEP = ['name', 'book', 'page', 'group', 'habitat', 'levelText', 'level', 'size', 'kind', 'role', 'armor', 'hp',
        'hpPerHero', 'hpText', 'speed', 'fly', 'swim', 'climb', 'burrow', 'movementText', 'saves', 'resist', 'vuln',
        'immune', 'minionDie', 'traits', 'groupTraits', 'actionsIntro', 'actions', 'bloodied', 'lastStand', 'flavor', 'tactics']

def slug(s):
    return re.sub(r'[^a-z0-9]+', '-', s.lower()).strip('-')

def sig(e):
    t = lambda xs: [((x.get('name') or '').strip().lower(), re.sub(r'\W+', '', (x.get('text') or '').lower())) for x in (xs or [])]
    return json.dumps([e.get('levelText'), e.get('hp'), e.get('hpPerHero'), e.get('armor'), e.get('speed'), (e.get('saves') or '').replace(' ', ''),
                       t(e.get('traits')), t(e.get('actions'))])

def clean(e):
    out = {k: e.get(k) for k in KEEP}
    for k in ('resist', 'vuln', 'immune', 'traits', 'groupTraits', 'actions'):
        out[k] = [x for x in (out.get(k) or []) if x]
    for k, v in list(out.items()):
        if v in (None, '', [], {}):
            del out[k]
    if out.get('role') not in ('regular', 'minion', 'legendary', 'solo'):
        out['role'] = 'regular'
    if out.get('armor') not in ('none', 'M', 'H'):
        out['armor'] = 'none'
    return out

entries = []
for f in sorted(glob.glob(os.path.join(ROOT, 'raw', 'part-T*.json'))):
    entries += json.load(open(f))

# 1. same book, same name, same level
by_key = {}
order = []
dropped = []
for e in entries:
    k = (e['book'], e['name'].strip().lower(), str(e.get('levelText') or ''))
    if k not in by_key:
        by_key[k] = e; order.append(k); continue
    cur = by_key[k]
    if e['book'] == 'GMG' and 15 <= (e.get('pdfPage') or 0) <= 19 and not (15 <= (cur.get('pdfPage') or 0) <= 19):
        by_key[k] = e
        dropped.append((cur['name'], cur['book'], cur.get('pdfPage'), 'replaced by bestiary entry'))
    else:
        dropped.append((e['name'], e['book'], e.get('pdfPage'), 'reprint' if sig(e) == sig(cur) else 'variant layout'))
kept = [by_key[k] for k in order]

# 2. same book, same name, different levels
counts = {}
for e in kept:
    counts.setdefault((e['book'], e['name'].strip().lower()), []).append(e)
for group in counts.values():
    if len(group) > 1:
        for e in group:
            lvl = e.get('levelText') or 'minion'
            e['name'] = f"{e['name'].strip()} (lvl {lvl})"

# 3. across books
mm_names = {e['name'].strip().lower(): e for e in kept if e['book'] == 'M&M'}
final = []
for e in kept:
    if e['book'] == 'GMG' and e['name'].strip().lower() in mm_names:
        if sig(e) == sig(mm_names[e['name'].strip().lower()]):
            dropped.append((e['name'], 'GMG', e.get('pdfPage'), 'identical to M&M'))
            continue
        e['name'] = f"{e['name'].strip()} (GM Guide)"
    final.append(e)

result, ids = [], set()
for e in sorted(final, key=lambda x: (x['name'].lower(), x['book'])):
    c = clean(e)
    c['name'] = c['name'].strip()
    i = slug(c['name'])
    while i in ids:
        i += '-b'
    ids.add(i)
    result.append({'id': i, **c})

json.dump(result, open(OUT, 'w'), ensure_ascii=False, separators=(',', ':'))
print(f'{len(entries)} extracted, {len(dropped)} dropped, {len(result)} written to {os.path.relpath(OUT)}')
for d in dropped:
    print('  dropped:', *d)
