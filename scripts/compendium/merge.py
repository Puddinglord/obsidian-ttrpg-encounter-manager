#!/usr/bin/env python3
"""Merge the transcriptions in raw/ into src/systems/nimble/data/compendium.json.

Run from the repo root:  python3 -I scripts/compendium/merge.py

Policy:
- Collections from every raw file are concatenated (classes, ancestries,
  backgrounds, motivations, items, properties, spells, boons).
- Every spell ends up in the top-level `spells` list once. Class books that
  reprint Core spells (the Mage, the Stormshifter) keep the Core entry; the
  class gets the spell's name in `spellList` instead. Spells only printed in a
  class book stay there too, tagged with `class`.
- `draft` set on a class carries to its subclasses and spells.
- `rules` gathers the Core sheet rules plus the magic and equipment rules.
- The transcribers' `notes` arrays are left out of the bundle (they stay in raw/).
"""
import glob, json, os, re, sys

ROOT = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(ROOT, '..', '..', 'src', 'systems', 'nimble', 'data', 'compendium.json')
LISTS = ['classes', 'ancestries', 'backgrounds', 'motivations', 'items', 'properties', 'spells', 'boons']

def key(name):
    return re.sub(r'[^a-z0-9]+', ' ', name.lower().replace('’', "'")).strip()

def norm(text):
    return re.sub(r'\W+', '', (text or '').lower())

def strip_empty(v):
    if isinstance(v, dict):
        return {k: strip_empty(x) for k, x in v.items() if x not in (None, '', [], {})}
    if isinstance(v, list):
        return [strip_empty(x) for x in v]
    return v

def main():
    out = {k: [] for k in LISTS}
    rules = {}
    for path in sorted(glob.glob(os.path.join(ROOT, 'raw', '*.json'))):
        data = json.load(open(path))
        if not isinstance(data, dict):  # resources.json is the class-resource audit, not bundled
            continue
        for k in LISTS:
            out[k].extend(data.get(k, []))
        if isinstance(data.get('rules'), dict):
            rules.update(data['rules'])
        for extra in ('magicRules', 'equipmentRules'):
            if data.get(extra):
                rules[extra] = data[extra]

    core = {key(s['name']): s for s in out['spells']}
    for s in out['spells']:
        if s.get('source') == 'GMG':
            s['secret'] = True

    warnings = []
    for c in out['classes']:
        draft = bool(c.get('draft'))
        for sc in c.get('subclasses', []):
            sc.setdefault('draft', draft)
        own, listed = [], []
        for s in c.pop('spells', []) or []:
            s.setdefault('draft', draft)
            s.setdefault('source', c['source'])
            hit = core.get(key(s['name']))
            if hit and hit is not s and hit.get('source') == 'Core':
                listed.append(hit['name'])
                if norm(hit.get('text')) != norm(s.get('text')):
                    warnings.append(f"{c['name']}: {s['name']} differs from the Core printing (Core kept)")
                continue
            s['class'] = c['name']
            own.append(s)
            listed.append(s['name'])
        if listed:
            c['spellList'] = listed
        out['spells'].extend(own)

    # Same name twice in one collection: report it, keep both (the UI shows the source).
    for k in LISTS:
        seen = {}
        for e in out[k]:
            n = key(e['name'])
            if n in seen and k != 'spells':
                warnings.append(f"{k}: '{e['name']}' appears in {seen[n]} and {e.get('source')}")
            seen[n] = e.get('source')

    out['rules'] = rules
    out['attribution'] = (
        'Nimble TTRPG content © Nimble Co., included under the Nimble 3rd Party Creator License. '
        'Support the game by buying the books at nimbleRPG.com.'
    )
    out = strip_empty(out)
    with open(OUT, 'w') as f:
        json.dump(out, f, ensure_ascii=False, separators=(',', ':'))
    counts = ', '.join(f"{k} {len(out.get(k, []))}" for k in LISTS)
    print(f'Wrote {os.path.relpath(OUT)}: {counts} ({os.path.getsize(OUT) // 1024} KB)')
    for w in warnings:
        print('  note:', w, file=sys.stderr)

if __name__ == '__main__':
    main()
