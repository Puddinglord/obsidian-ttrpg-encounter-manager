#!/usr/bin/env python3
"""Build the plugin's 5e data (src/systems/dnd5e/data/) from the SRD JSON that
fetch.sh downloads. Usage: python3 -I scripts/dnd5e/build.py <raw dir>

Text is from the System Reference Document 5.1 and 5.2 by Wizards of the Coast
LLC, under CC-BY-4.0 (see NOTICE.md). Structured by 5e-bits/5e-database (MIT).
"""
import json, os, re, sys

RAW = sys.argv[1]
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'src', 'systems', 'dnd5e', 'data')
EDITIONS = ('2014', '2024')

def load(ed, name):
    p = os.path.join(RAW, ed, name + '.json')
    return json.load(open(p, encoding='utf-8')) if os.path.exists(p) else []

def text(x):
    """2014 data keeps paragraphs as lists; 2024 as one markdown string. No spaces at line ends."""
    if isinstance(x, list): x = '\n'.join(s.strip() for s in x if isinstance(s, str))
    return re.sub(r'[ \t]+\n', '\n', (x or '').strip())

def write(name, data):
    os.makedirs(OUT, exist_ok=True)
    with open(os.path.join(OUT, name), 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, separators=(',', ':'))
    print(f'{name}: {os.path.getsize(os.path.join(OUT, name)) // 1024} KB')

def conditions():
    out = {}
    for ed in EDITIONS:
        out[ed] = [{'name': c['name'], 'description': text(c.get('desc') or c.get('description'))} for c in load(ed, 'Conditions')]
    write('conditions.json', out)

ABIL = ['strength', 'dexterity', 'constitution', 'intelligence', 'wisdom', 'charisma']

def cr_text(cr):
    return {0.125: '1/8', 0.25: '1/4', 0.5: '1/2'}.get(cr, str(int(cr)) if float(cr).is_integer() else str(cr))

def usage_text(u, ed):
    if not u: return ''
    t = u.get('type')
    if t == 'per day':
        lair = u.get('times_in_lair')
        return f"{u.get('times')}/Day" + (f", or {lair}/Day in Lair" if lair else '')
    if t == 'recharge on roll':
        lo = u.get('min_value', 6)
        return 'Recharge 6' if lo >= 6 else f'Recharge {lo}–6'
    if t == 'recharge after rest':
        rests = u.get('rest_types') or []
        if ed == '2014':
            return 'Recharges after a ' + ' or '.join(r.title() for r in rests) + ' Rest' if rests else 'Recharges after a Rest'
        return 'Recharges after a ' + ' or '.join(r.title() for r in rests) + ' Rest' if rests else 'Recharges after a Rest'
    return ''

def spell_lines(sc, ed, native):
    """2024 data keeps the spell list out of the text: rebuild it, grouped by how often."""
    groups = {}
    for sp in sc.get('spells', []):
        u = sp.get('usage') or {}
        key = 'At Will' if u.get('type') == 'at will' else (f"{u.get('times')}/Day Each" if u.get('type') == 'per day' else '')
        name = sp['name']
        base = native.get(sp.get('index') or '')
        if base is not None and sp.get('level') not in (None, base) and sp.get('level', 0) > base:
            name += f" (level {sp['level']} version)"
        groups.setdefault(key, []).append(name)
    order = ['At Will'] + sorted((k for k in groups if k not in ('At Will', '')), key=lambda k: -int(k.split('/')[0]))
    return [f"- **{k}:** {', '.join(groups[k])}" for k in order if k in groups] + ([f"- {', '.join(groups[''])}"] if '' in groups else [])

def entry(a, ed, native):
    name = a['name']
    u = usage_text(a.get('usage'), ed)
    if u and '(' not in name: name = f'{name} ({u})'
    desc = text(a.get('desc'))
    sc = a.get('spellcasting')
    if sc and ed == '2024' and sc.get('spells') and not any(sp['name'].lower() in desc.lower() for sp in sc['spells']):
        desc = desc + '\n' + '\n'.join(spell_lines(sc, ed, native))
    return {'name': name, 'desc': desc}

def speed_text(sp):
    parts = []
    for k, v in sp.items():
        if k == 'hover': continue
        parts.append(v if k == 'walk' else f'{k.replace("_", " ").title() if ed_is_2024 else k} {v}')
    if sp.get('hover'): parts[-1] += ' (hover)'
    return ', '.join(parts)

def senses_text(se, ed):
    parts = []
    for k, v in se.items():
        if k == 'passive_perception': continue
        parts.append(f'{k.title() if ed == "2024" else k} {v}')
    pp = se.get('passive_perception')
    if pp is not None: parts.append(f'Passive Perception {pp}' if ed == '2024' else f'passive Perception {pp}')
    return ('; ' if ed == '2024' else ', ').join(parts)

def names(lst):
    return [x['name'] if isinstance(x, dict) else str(x) for x in lst or []]

ed_is_2024 = False

def monsters():
    global ed_is_2024
    for ed in EDITIONS:
        ed_is_2024 = ed == '2024'
        native = {sp['index']: sp.get('level') for sp in load(ed, 'Spells')}
        out = []
        for m in load(ed, 'Monsters'):
            ac0 = (m.get('armor_class') or [{}])[0]
            note = ac0.get('type') if ac0.get('type') not in (None, 'dex', 'natural') or ed == '2014' and ac0.get('type') == 'natural' else None
            if ac0.get('armor'): note = ', '.join(a['name'] for a in ac0['armor']).lower() if ed == '2014' else None
            if note == 'natural': note = 'natural armor'
            if note in ('dex',): note = None
            saves, skills = {}, {}
            for p in m.get('proficiencies', []):
                pn = p['proficiency']['name']
                if pn.startswith('Saving Throw: '): saves[pn.split(': ')[1].lower()] = p['value']
                elif pn.startswith('Skill: '): skills[pn.split(': ')[1]] = p['value']
            typ = m['type'] + (f" ({m['subtype']})" if m.get('subtype') else '')
            mon = {
                'name': m['name'], 'size': m['size'], 'type': typ, 'alignment': m.get('alignment', ''),
                'ac': ac0.get('value', 10),
                'hp': m['hit_points'], 'hpFormula': m.get('hit_points_roll') or m.get('hit_dice'),
                'speed': speed_text(m.get('speed') or {}),
                'abilities': [m[a] for a in ABIL],
                'cr': cr_text(m['challenge_rating']), 'xp': m.get('xp', 0), 'pb': m.get('proficiency_bonus', 2),
                'senses': senses_text(m.get('senses') or {}, ed),
            }
            if m.get('languages'): mon['languages'] = m['languages']
            if note: mon['acNote'] = note
            if saves: mon['saves'] = saves
            if skills: mon['skills'] = skills
            for key, src in (('vulnerabilities', 'damage_vulnerabilities'), ('resistances', 'damage_resistances'), ('immunities', 'damage_immunities')):
                if m.get(src): mon[key] = names(m[src])
            if m.get('condition_immunities'): mon['conditionImmunities'] = names(m['condition_immunities'])
            if m.get('xp_in_lair'): mon['xpLair'] = m['xp_in_lair']
            if m.get('gear'): mon['gear'] = m['gear']
            for key, src in (('traits', 'special_abilities'), ('actions', 'actions'), ('bonusActions', 'bonus_actions'), ('reactions', 'reactions'), ('legendaryActions', 'legendary_actions')):
                lst = [entry(a, ed, native) for a in m.get(src) or []]
                if lst: mon[key] = lst
            if mon.get('legendaryActions'):
                if ed == '2024':
                    uses = '3 (4 in Lair)' if m.get('xp_in_lair') else '3'
                    mon['legendaryIntro'] = f"Legendary Action Uses: {uses}. Immediately after another creature's turn, the {m['name'].lower()} can expend a use to take one of the following actions. The {m['name'].lower()} regains all expended uses at the start of each of its turns."
                else:
                    mon['legendaryIntro'] = f"The {m['name'].lower()} can take 3 legendary actions, choosing from the options below. Only one legendary action option can be used at a time and only at the end of another creature's turn. The {m['name'].lower()} regains spent legendary actions at the start of its turn."
            if m.get('desc'): mon['description'] = text(m['desc'])
            out.append(mon)
        out.sort(key=lambda x: x['name'])
        write(f'monsters-{ed}.json', out)

def components(sp):
    c = ', '.join(sp.get('components') or [])
    m = sp.get('material')
    return f'{c} ({m})' if m and 'M' in (sp.get('components') or []) else c

def spells(ed):
    out = []
    for sp in load(ed, 'Spells'):
        x = {
            'name': sp['name'], 'level': sp.get('level', 0), 'school': (sp.get('school') or {}).get('name', ''),
            'castingTime': sp.get('casting_time', ''), 'range': sp.get('range', ''), 'components': components(sp),
            'duration': sp.get('duration', ''), 'desc': text(sp.get('desc') or sp.get('description')),
            'classes': [c['name'] for c in sp.get('classes') or []],
        }
        if sp.get('concentration'): x['concentration'] = True
        if sp.get('ritual'): x['ritual'] = True
        hl = text(sp.get('higher_level'))
        if hl: x['higherLevel'] = hl
        out.append(x)
    return sorted(out, key=lambda x: x['name'])

def magic_items(ed):
    out = []
    for it in load(ed, 'Magic-Items'):
        if it.get('variant'): continue
        d = text(it.get('desc'))
        first, _, rest = d.partition('\n')
        x = {'name': it['name'], 'rarity': (it.get('rarity') or {}).get('name', ''), 'type': (it.get('equipment_category') or {}).get('name', ''), 'desc': rest.strip() if rest else d}
        if first and rest: x['line'] = first.strip()
        att = it.get('attunement')
        if att is True or 'requires attunement' in first.lower(): x['attunement'] = True
        out.append(x)
    return sorted(out, key=lambda x: x['name'])

def equipment(ed):
    props = {}
    for wp in load(ed, 'Weapon-Properties'): props[wp['name']] = text(wp.get('desc') or wp.get('description'))
    out = []
    for e in load(ed, 'Equipment'):
        cats = [c['name'] for c in (e.get('equipment_categories') or ([e['equipment_category']] if e.get('equipment_category') else []))]
        x = {'name': e['name'], 'category': cats[0] if cats else ''}
        if len(cats) > 1: x['tags'] = cats[1:]
        cost = e.get('cost')
        if cost: x['cost'] = f"{cost['quantity']} {cost['unit']}"
        if e.get('weight') is not None: x['weight'] = e['weight']
        if e.get('weapon_category'): x['weaponCategory'] = e['weapon_category']
        if e.get('weapon_range'): x['weaponRange'] = e['weapon_range']
        dmg = e.get('damage')
        if dmg: x['damage'] = f"{dmg.get('damage_dice', '')} {(dmg.get('damage_type') or {}).get('name', '').lower()}".strip()
        two = e.get('two_handed_damage')
        if two: x['versatile'] = two.get('damage_dice')
        rng = e.get('range') or {}
        if rng.get('long'): x['range'] = f"{rng.get('normal')}/{rng.get('long')}"
        tr = e.get('throw_range') or {}
        if tr.get('long'): x['range'] = f"{tr.get('normal')}/{tr.get('long')}"
        if e.get('properties'): x['properties'] = [p['name'] for p in e['properties']]
        if e.get('mastery'): x['mastery'] = e['mastery']['name']
        if e.get('armor_category'): x['armorCategory'] = e['armor_category']
        ac = e.get('armor_class')
        if ac: x['ac'] = {'base': ac.get('base'), 'dex': bool(ac.get('dex_bonus')), **({'max': ac['max_bonus']} if ac.get('max_bonus') else {})}
        if e.get('str_minimum'): x['strMin'] = e['str_minimum']
        if e.get('stealth_disadvantage'): x['stealthDisadvantage'] = True
        d = text(e.get('desc') or e.get('description'))
        if d: x['desc'] = d
        out.append(x)
    return sorted(out, key=lambda x: x['name']), props

def slots(sc):
    return [sc.get(f'spell_slots_level_{i}', 0) for i in range(1, 10)] if sc else None

def classes(ed):
    feats = load(ed, 'Features')
    lv = load(ed, 'Levels')
    subs = load(ed, 'Subclasses')
    out = []
    for c in load(ed, 'Classes'):
        cid = c['index']
        mine = [f for f in feats if (f.get('class') or {}).get('index') == cid and not f.get('subclass')]
        def level_of(f):
            l = f.get('level')
            return l if isinstance(l, int) else int(str((l or {}).get('index', '0')).rsplit('-', 1)[-1] or 0)
        x = {
            'name': c['name'], 'hitDie': c.get('hit_die'),
            'saves': [s['name'] for s in c.get('saving_throws') or []],
            'proficiencies': [p['name'] for p in c.get('proficiencies') or []],
            'skillChoice': (c.get('proficiency_choices') or [{}])[0].get('desc', ''),
            'features': sorted(({'level': level_of(f), 'name': f['name'], 'desc': text(f.get('desc') or f.get('description'))} for f in mine), key=lambda f: (f['level'], f['name'])),
        }
        pa = c.get('primary_ability')
        if pa: x['primary'] = pa.get('desc', '')
        sc = c.get('spellcasting')
        if sc: x['spellcasting'] = (sc.get('spellcasting_ability') or {}).get('name', '')
        levels = []
        for L in sorted((l for l in lv if (l.get('class') or {}).get('index') == cid and not l.get('subclass')), key=lambda l: l['level']):
            row = {'level': L['level'], 'pb': L.get('prof_bonus'), 'features': [f['name'] for f in L.get('features') or []]}
            sl = slots(L.get('spellcasting'))
            if sl and any(sl): row['slots'] = sl
            if L.get('spellcasting') and L['spellcasting'].get('cantrips_known') is not None: row['cantrips'] = L['spellcasting']['cantrips_known']
            if L.get('class_specific'): row['extra'] = L['class_specific']
            levels.append(row)
        x['levels'] = levels
        sub_out = []
        for sc_ in (s_ for s_ in subs if (s_.get('class') or {}).get('index') == cid):
            sf = sc_.get('features')
            if sf is None:
                sf = [{'level': level_of(f), 'name': f['name'], 'desc': text(f.get('desc'))} for f in feats if (f.get('subclass') or {}).get('index') == sc_['index']]
            else:
                sf = [{'level': f.get('level', 0), 'name': f['name'], 'desc': text(f.get('desc') or f.get('description'))} for f in sf]
            sub_out.append({'name': sc_['name'], 'flavor': sc_.get('subclass_flavor') or sc_.get('summary') or '', 'desc': text(sc_.get('desc') or sc_.get('description')), 'features': sorted(sf, key=lambda f: (f['level'], f['name']))})
        x['subclasses'] = sub_out
        out.append(x)
    return out

def species(ed):
    traits = {t['index']: t for t in load(ed, 'Traits')}
    tr = lambda refs: [{'name': traits.get(r['index'], r)['name'], 'desc': text(traits.get(r['index'], {}).get('desc') or traits.get(r['index'], {}).get('description'))} for r in refs or []]
    out = []
    if ed == '2014':
        subs = {s['index']: s for s in load(ed, 'Subraces')}
        for r in load(ed, 'Races'):
            x = {'name': r['name'], 'size': r.get('size', ''), 'speed': r.get('speed'), 'traits': tr(r.get('traits')),
                 'abilityBonuses': ', '.join(f"{b['ability_score']['name']} +{b['bonus']}" for b in r.get('ability_bonuses') or []),
                 'desc': '\n\n'.join(text(r.get(k)) for k in ('age', 'alignment', 'size_description', 'language_desc') if r.get(k))}
            x['subspecies'] = [{'name': subs[s['index']]['name'], 'desc': text(subs[s['index']].get('desc')), 'traits': tr(subs[s['index']].get('racial_traits'))} for s in r.get('subraces') or [] if s['index'] in subs]
            out.append(x)
    else:
        subs = {s['index']: s for s in load(ed, 'Subspecies')}
        for r in load(ed, 'Species'):
            x = {'name': r['name'], 'size': r.get('size', ''), 'speed': r.get('speed'), 'traits': tr(r.get('traits')), 'type': r.get('type', '')}
            x['subspecies'] = [{'name': subs[s['index']]['name'], 'traits': tr(subs[s['index']].get('traits'))} for s in r.get('subspecies') or [] if s['index'] in subs]
            out.append(x)
    return out

def backgrounds(ed):
    out = []
    for b in load(ed, 'Backgrounds'):
        x = {'name': b['name']}
        profs = b.get('proficiencies') or b.get('starting_proficiencies') or []
        x['proficiencies'] = [p['name'] for p in profs]
        if b.get('ability_scores'): x['abilityScores'] = [a['name'] for a in b['ability_scores']]
        if b.get('feat'): x['feat'] = b['feat']['name'] + (f" ({b['feat']['note']})" if b['feat'].get('note') else '')
        if b.get('feature'): x['feature'] = {'name': b['feature']['name'], 'desc': text(b['feature'].get('desc'))}
        eq = b.get('equipment_options')
        if eq: x['equipment'] = '\n'.join(o.get('desc', '') for o in eq)
        elif b.get('starting_equipment'): x['equipment'] = ', '.join(f"{e['equipment']['name']}" + (f" ({e['quantity']})" if e.get('quantity', 1) > 1 else '') for e in b['starting_equipment'])
        out.append(x)
    return out

def feats(ed):
    out = []
    for f in load(ed, 'Feats'):
        x = {'name': f['name'], 'desc': text(f.get('desc') or f.get('description'))}
        pre = f.get('prerequisites') or []
        if isinstance(pre, str): pre = [pre]
        def one(p):
            if isinstance(p, str): return p
            if p.get('ability_score'): return f"{p['ability_score']['name']} {p['minimum_score']}+"
            return str(p.get('desc') or p.get('type') or '')
        if pre: x['prerequisite'] = ', '.join(filter(None, map(one, pre)))
        if isinstance(f.get('prerequisite'), str): x['prerequisite'] = f['prerequisite']
        if f.get('type'): x['type'] = f['type']
        out.append(x)
    return out

def rules(ed):
    """The SRD's rules text. 5e-srd-api keeps it as a heading tree in Rules.json (each heading
    its own entry, with a parent); older data had a flat Rule-Sections.json."""
    tree = load(ed, 'Rules')
    if tree and any('parent' in r or 'children' in r for r in tree):
        by = {r['index']: r for r in tree}
        def top(r):
            while r.get('parent'): r = by.get(r['parent']['index'] if isinstance(r['parent'], dict) else r['parent'], {})
            return r.get('name', '')
        return [{'name': r['name'], 'desc': text(r.get('desc')), 'topic': top(r)} for r in tree if text(r.get('desc'))]
    return [{'name': r['name'], 'desc': text(r.get('desc'))} for r in load(ed, 'Rule-Sections')]

def compendium():
    for ed in EDITIONS:
        eq, props = equipment(ed)
        write(f'compendium-{ed}.json', {
            'spells': spells(ed), 'items': magic_items(ed), 'equipment': eq, 'weaponProperties': props,
            'classes': classes(ed), 'species': species(ed), 'backgrounds': backgrounds(ed), 'feats': feats(ed), 'rules': rules(ed),
        })

if __name__ == '__main__':
    conditions()
    monsters()
    compendium()
