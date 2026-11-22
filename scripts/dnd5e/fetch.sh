#!/bin/sh
# Download the SRD 5.1 (2014) and SRD 5.2 (2024) data from 5e-bits/5e-srd-api
# (packages/5e-database; the old 5e-bits/5e-database repo is archived),
# pinned to one commit so the build is reproducible. The JSON is data only:
# build.py reads it, nothing in it is ever run.
#   sh scripts/dnd5e/fetch.sh <empty dir>      (also reads the SRD 5.2 PDF's Rules Glossary)
#   python3 -I scripts/dnd5e/build.py <that dir>
set -eu
SHA=3b6da29a45b3b328c2409cf97a14e2507e291bf8
OUT=${1:?usage: fetch.sh <dir>}
for y in 2014 2024; do
	mkdir -p "$OUT/$y"
	for f in Monsters Spells Conditions Magic-Items Equipment Classes Subclasses Backgrounds Features Traits Feats Levels Skills Rules Races Subraces Species Subspecies Weapon-Properties Weapon-Mastery-Properties Magic-Schools Languages Ability-Scores; do
		curl -sf -o "$OUT/$y/$f.json" "https://raw.githubusercontent.com/5e-bits/5e-srd-api/$SHA/packages/5e-database/src/$y/en/5e-SRD-$f.json" || rm -f "$OUT/$y/$f.json"
	done
done
# SRD 5.2 has no rules in 5e-srd-api: its Rules Glossary is read from the SRD's PDF (needs pdftohtml).
curl -sf -o "$OUT/SRD_CC_v5.2.1.pdf" "https://media.dndbeyond.com/compendium-images/srd/5.2/SRD_CC_v5.2.1.pdf"
python3 -I "$(dirname "$0")/glossary.py" "$OUT/SRD_CC_v5.2.1.pdf" "$OUT/2024/Glossary.json"
echo "SRD data in $OUT"
