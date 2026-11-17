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

if __name__ == '__main__':
    conditions()
    monsters()
