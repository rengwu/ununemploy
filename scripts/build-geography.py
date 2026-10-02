"""Build the offline location lookup from downloaded GeoNames extracts.

Inputs: .local-data/geography/{countryInfo.txt,cities15000.zip,admin1CodesASCII.txt}
See data/geography/README.md for attribution and refresh instructions.
"""
import json
import unicodedata
import zipfile
from pathlib import Path

source = Path('.local-data/geography')
target = Path('data/geography')
target.mkdir(parents=True, exist_ok=True)

def fold(value):
    value = ''.join(c for c in unicodedata.normalize('NFKD', value) if not unicodedata.combining(c))
    return ' '.join(value.lower().replace('.', '').split())

countries = []
for line in (source / 'countryInfo.txt').read_text().splitlines():
    if not line or line.startswith('#'):
        continue
    row = line.split('\t')
    countries.append([row[0], row[1], row[4], row[8]])

places = {}
us_states = {}
def add(name, country):
    key = fold(name)
    if len(key) > 2 and country:
        places.setdefault(key, set()).add(country)

with zipfile.ZipFile(source / 'cities15000.zip') as archive:
    for line in archive.read('cities15000.txt').decode().splitlines():
        row = line.split('\t')
        # Primary and ASCII names only: alternate names contain historical and ambiguous aliases.
        for name in row[1:3]:
            add(name, row[8])
            if row[8] == 'US':
                us_states.setdefault(fold(name), set()).add(row[10])
for line in (source / 'admin1CodesASCII.txt').read_text().splitlines():
    row = line.split('\t')
    for name in row[1:3]:
        add(name, row[0].split('.')[0])

data = {'countries': countries, 'places': {k: sorted(v) for k, v in sorted(places.items())}, 'usStates': {k: sorted(v) for k, v in sorted(us_states.items())}}
(target / 'geonames.json').write_text(json.dumps(data, ensure_ascii=False, separators=(',', ':')) + '\n')
print(f'{len(countries)} countries/areas, {len(places)} place names')
