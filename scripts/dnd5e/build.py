#!/usr/bin/env python3
"""Build the plugin's 5e data (src/systems/dnd5e/data/) from the SRD JSON that
fetch.sh downloads. Usage: python3 -I scripts/dnd5e/build.py <raw dir>

Text is from the System Reference Document 5.1 and 5.2 by Wizards of the Coast
LLC, under CC-BY-4.0 (see NOTICE.md). Structured by 5e-bits/5e-database (MIT).
"""
import json, os, sys

RAW = sys.argv[1]
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'src', 'systems', 'dnd5e', 'data')
EDITIONS = ('2014', '2024')

def load(ed, name):
    p = os.path.join(RAW, ed, name + '.json')
    return json.load(open(p, encoding='utf-8')) if os.path.exists(p) else []

def text(x):
    """2014 data keeps paragraphs as lists; 2024 as one markdown string."""
    if isinstance(x, list): return '\n'.join(s.strip() for s in x if isinstance(s, str))
    return (x or '').strip()

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

if __name__ == '__main__':
    conditions()
