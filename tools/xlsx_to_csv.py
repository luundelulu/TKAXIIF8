"""Ekstrak sheet xlsx ke CSV agar bisa diverifikasi di browser tanpa library tambahan.
Pakai: python3 tools/xlsx_to_csv.py tools/sumber.xlsx data/
"""
import csv, json, sys, openpyxl
src, out = sys.argv[1], sys.argv[2].rstrip('/')
wb = openpyxl.load_workbook(src, data_only=True)
ws = wb['DATA MENTAH']
rows = [r for r in ws.iter_rows(values_only=True)]
header, body, meta = rows[0], [], {}
for r in rows[1:]:
    if hasattr(r[0], 'strftime'):
        body.append([r[0].strftime('%Y-%m-%dT%H:%M:%S.%f')[:-3]] + list(r[1:]))
    elif r[0]:
        meta[str(r[0]).strip()] = [c for c in r[1:] if c is not None]
with open(f'{out}/xlsx_mentah.csv', 'w', newline='', encoding='utf-8') as f:
    w = csv.writer(f); w.writerow(header[:24]); w.writerows([b[:24] for b in body])
wa = wb['Berdasarkan aspek']
ar = list(wa.iter_rows(values_only=True))
with open(f'{out}/xlsx_aspek.csv', 'w', newline='', encoding='utf-8') as f:
    w = csv.writer(f)
    for r in ar[:-1]: w.writerow(r[:4])
meta['rata_rata_keseluruhan_aspek'] = ar[2][5]
meta['rata_rata_setiap_aspek'] = list(ar[-1][1:4])
json.dump(meta, open(f'{out}/xlsx_meta.json', 'w'), ensure_ascii=False, indent=1)
print(len(body), 'baris data;', list(meta))
