#!/usr/bin/env python3
"""The SRD 5.2 Rules Glossary as JSON, read from the SRD's PDF (CC-BY-4.0; see NOTICE.md).
5e-srd-api has no 2024 rules, so build.py reads this file as 2024's rules.

Needs pdftohtml (poppler). Usage:
  python3 -I scripts/dnd5e/glossary.py SRD_CC_v5.2.1.pdf <raw dir>/2024/Glossary.json

Entry names are set in one font (18pt GillSans SemiBold, the red heading colour); every
other line belongs to the entry above it. A line that opens in bold ("Speed Reduced.")
starts a paragraph. Bold and italics are kept as markdown."""
import html, json, os, re, subprocess, sys, tempfile

PDF, OUT = sys.argv[1], sys.argv[2]
FIRST, LAST = 170, 200  # pages to scan; the glossary is found inside by its title
SOFT_HYPHEN = chr(0xAD)

with tempfile.TemporaryDirectory() as tmp:
    base = os.path.join(tmp, 'g')
    subprocess.run(['pdftohtml', '-xml', '-i', '-q', '-f', str(FIRST), '-l', str(LAST), PDF, base], check=True)
    xml = open(base + '.xml', encoding='utf-8').read()

fonts = {i: (int(sz), fam, col.lower()) for i, sz, fam, col in re.findall(r'<fontspec id="(\d+)" size="(\d+)" family="([^"]+)" color="([^"]+)"/>', xml)}

def is_heading(f):
    sz, fam, col = fonts[f]
    return sz == 18 and 'SemiBold' in fam and col == '#88191f'

def is_title(f):
    return fonts[f][0] >= 30

def is_furniture(f, t):
    sz, fam, col = fonts[f]
    return col == '#7b7879' or sz <= 9 or re.fullmatch(r'\d+|System Reference Document.*', t)

def plain(t):
    return html.unescape(re.sub(r'<[^>]+>', '', t)).replace(SOFT_HYPHEN, '')

def marked(t):
    """Inline bold and italics as markdown."""
    t = re.sub(r'<i>\s*<b>(.*?)</b>\s*</i>', lambda m: f' **{m.group(1).strip()}** ', t)
    t = re.sub(r'<b>(.*?)</b>', lambda m: f' **{m.group(1).strip()}** ' if m.group(1).strip() else ' ', t)
    t = re.sub(r'<i>(.*?)</i>', lambda m: f' *{m.group(1).strip()}* ' if m.group(1).strip() else ' ', t)
    return plain(t)

items = []
for num, width, body in re.findall(r'<page number="(\d+)"[^>]*width="(\d+)"[^>]*>(.*?)</page>', xml, re.S):
    page = []
    for top, left, f, t in re.findall(r'<text top="(\d+)" left="(\d+)" width="\d+" height="\d+" font="(\d+)">(.*?)</text>', body):
        if not plain(t).strip() or is_furniture(f, plain(t).strip()): continue
        runin = bool(re.match(r'\s*(<i>)?\s*<b>', t))
        page.append((int(left) >= int(width) // 2, int(top), int(left), f, plain(t).strip() if is_heading(f) or is_title(f) else marked(t).strip(), runin))
    page.sort(key=lambda x: (x[0], x[1], x[2]))
    items += [(int(num),) + x for x in page]

entries, cur, started, prev, para = [], None, False, None, []

def join(pieces):
    text = ''
    for piece in pieces:
        if not text: text = piece
        elif text.endswith('-'): text = text[:-1] + piece if piece[:1].islower() else text + piece
        else: text += ' ' + piece
    return re.sub(r'\s+', ' ', text).strip()

def flush():
    global para
    if cur is not None and para: cur['paras'].append(join(para))
    para = []

for page, col, top, left, f, t, runin in items:
    if is_title(f):
        if t == 'Rules Glossary': started = True; continue
        if started: break
    if not started: continue
    if is_heading(f):
        flush()
        # A long name wraps onto a second line.
        if cur is not None and cur['open'] and prev and prev[:2] == (page, col) and top - prev[2] < 26:
            cur['raw'] += ' ' + t
        else:
            cur = {'raw': t, 'paras': [], 'open': True}
            entries.append(cur)
        prev = (page, col, top)
        continue
    if cur is None: continue
    cur['open'] = False
    gap = prev is not None and prev[:2] == (page, col) and top - prev[2] > 30
    if runin or t.startswith('•') or gap: flush()
    if t.startswith('•'): t = '- ' + t.lstrip('• ').strip()
    para.append(t)
    prev = (page, col, top)
flush()

out = []
for e in entries:
    m = re.fullmatch(r'(.*?)\s*\[(.+?)\]', e['raw'])
    name, tag = (m.group(1), m.group(2)) if m else (e['raw'], None)
    text = '\n'.join(e['paras'])
    # "See also" pointers on a line of their own.
    text = re.sub(r'\s*\*See also\*\s*', '\n*See also* ', text).strip()
    text = re.sub(r'\*\* ([.,;:])', r'**\1', text)
    x = {'name': name.strip(), 'desc': re.sub(r'[ \t]+', ' ', text)}
    if tag: x['tag'] = tag
    out.append(x)

os.makedirs(os.path.dirname(OUT) or '.', exist_ok=True)
json.dump(out, open(OUT, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print(f'{len(out)} glossary entries → {OUT}')
