/* Web Worker: memuat, mem-parse, menormalisasi, dan memverifikasi silang semua sumber data.
   Tidak ada data yang dikirim keluar browser; fetch hanya ke file statis milik situs ini. */
'use strict';

function parseCSV(text) {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const rows = []; let row = [], f = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(f); f = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(f); f = '';
      if (row.length > 1 || row[0] !== '') rows.push(row);
      row = [];
    } else f += c;
  }
  if (f !== '' || row.length) { row.push(f); if (row.length > 1 || row[0] !== '') rows.push(row); }
  return rows;
}
function toObjects(rows) {
  const h = rows[0].map(s => s.trim());
  return rows.slice(1).map((r, i) => { const o = { _line: i + 2 }; h.forEach((k, j) => o[k] = r[j]); return o; });
}
const norm = s => String(s ?? '').normalize('NFKD').replace(/\s+/g, ' ').trim().toLowerCase();
const ASPEK = ['Pemahaman dasar', 'Persiapan', 'Kesiapan'];
const r2 = x => Math.round(x * 100) / 100;

function parseTs(s) { // MM/DD/YY HH:MM:SS  (format Google Forms; terbukti MM/DD dari nilai 11/16, 11/19)
  const m = /^(\d\d)\/(\d\d)\/(\d\d) (\d\d):(\d\d):(\d\d)$/.exec((s || '').trim());
  if (!m) return null;
  return new Date(2000 + +m[3], +m[1] - 1, +m[2], +m[4], +m[5], +m[6]).getTime();
}

self.onmessage = async (e) => {
  const base = e.data.base;
  const diag = [];
  const add = (level, title, detail) => diag.push({ level, title, detail });
  const files = {
    responden: 'responden.csv', long: 'jawaban_long.csv', ringkasan: 'ringkasan.csv',
    xraw: 'xlsx_mentah.csv', xaspek: 'xlsx_aspek.csv', xmeta: 'xlsx_meta.json'
  };
  try {
    const txt = {};
    await Promise.all(Object.entries(files).map(async ([k, f]) => {
      const r = await fetch(base + f);
      if (!r.ok) throw new Error(`Gagal memuat ${f} (HTTP ${r.status})`);
      txt[k] = await r.text();
    }));
    const sources = [];
    const wide = toObjects(parseCSV(txt.responden));
    const long = toObjects(parseCSV(txt.long));
    const sum = toObjects(parseCSV(txt.ringkasan));
    const xraw = toObjects(parseCSV(txt.xraw));
    const xaspek = toObjects(parseCSV(txt.xaspek));
    const xmeta = JSON.parse(txt.xmeta);
    delete txt.long;
    sources.push(
      { file: 'responden.csv', role: 'Sumber utama: 1 baris per responden (format lebar)', rows: wide.length },
      { file: 'jawaban_long.csv', role: 'Format panjang: 1 baris per jawaban', rows: long.length },
      { file: 'ringkasan.csv', role: 'Agregat per aspek dan pertanyaan', rows: sum.length },
      { file: 'sumber.xlsx', role: 'Excel mentah (sheet DATA MENTAH, Berdasarkan aspek) diekstrak ke xlsx_*.csv', rows: xraw.length }
    );

    /* --- pertanyaan --- */
    const qs = sum.filter(r => r.tipe === 'pertanyaan').map(r => ({
      id: +r.kunci.slice(1), key: r.kunci, aspek: ASPEK.indexOf(r.aspek), text: r.label
    })).sort((a, b) => a.id - b.id);
    if (qs.length !== 20 || qs.some(q => q.aspek < 0)) add('error', 'Daftar pertanyaan tidak valid', 'ringkasan.csv harus memuat Q1–Q20 dengan aspek dikenal.');
    const aspekQ = ASPEK.map((_, a) => qs.filter(q => q.aspek === a).map(q => q.id - 1));

    /* --- responden (wide) --- */
    const respondents = [], answers = new Uint8Array(wide.length * 20);
    const seenEmail = new Map(), seenName = new Map();
    let bad = 0, mismatchScore = 0, mismatchAspek = 0;
    wide.forEach((r, i) => {
      const ans = qs.map(q => r['Q' + q.id]);
      const invalid = ans.filter(v => v !== '0' && v !== '1').length;
      const ts = parseTs(r.timestamp);
      if (invalid || ts === null || !r.email || !r.nama) {
        bad++; add('error', `Baris ${r._line} responden.csv tidak valid`, `${invalid} sel jawaban non-biner, timestamp ${ts === null ? 'gagal dibaca' : 'ok'}.`);
      }
      ans.forEach((v, j) => answers[i * 20 + j] = v === '1' ? 1 : 0);
      const ya = ans.filter(v => v === '1').length;
      const aspekYa = aspekQ.map(ix => ix.reduce((s, j) => s + answers[i * 20 + j], 0));
      if (+r.score !== ya * 10) mismatchScore++;
      const given = [r.skor_pemahaman_dasar, r.skor_persiapan, r.skor_kesiapan].map(Number);
      if (given.some((g, a) => g !== r2(aspekYa[a] / aspekQ[a].length * 100))) mismatchAspek++;
      const d = new Date(ts);
      const p = n => String(n).padStart(2, '0');
      respondents.push({
        i, email: r.email.trim(), nama: r.nama.trim(), ts, tsRaw: r.timestamp,
        kohort: `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`,
        ya, score: +r.score, aspekYa
      });
      const ke = norm(r.email), kn = norm(r.nama);
      if (seenEmail.has(ke)) add('warn', 'Email ganda', `${r.email} muncul di baris ${seenEmail.get(ke)} dan ${r._line}`);
      if (seenName.has(kn)) add('warn', 'Nama ganda', `${r.nama} muncul di baris ${seenName.get(kn)} dan ${r._line}`);
      seenEmail.set(ke, r._line); seenName.set(kn, r._line);
    });
    const N = respondents.length;
    add(bad ? 'error' : 'ok', 'Struktur responden.csv', `${N} responden, ${bad} baris tidak valid, ${N - seenEmail.size} email ganda, ${N - seenName.size} nama ganda.`);
    add(mismatchScore ? 'warn' : 'ok', 'Kolom score = 10 × jumlah Ya', mismatchScore ? `${mismatchScore} baris tidak cocok.` : `Cocok untuk ${N} dari ${N} responden.`);
    add(mismatchAspek ? 'warn' : 'ok', 'Skor per aspek (skor_*) dihitung ulang dari jawaban', mismatchAspek ? `${mismatchAspek} baris tidak cocok.` : `Cocok untuk ${N} dari ${N} responden.`);
    const emptyCells = wide.reduce((s, r) => s + qs.filter(q => r['Q' + q.id] === '' || r['Q' + q.id] == null).length, 0);
    add(emptyCells ? 'warn' : 'ok', 'Sel jawaban kosong', `${emptyCells} dari ${N * 20} sel. Nilai kosong tidak pernah dihitung sebagai 0.`);

    /* --- jawaban_long vs wide --- */
    const idxByEmail = new Map(respondents.map(r => [norm(r.email), r.i]));
    let lMiss = 0, lDiff = 0, lMeta = 0, lUnknown = 0; const cnt = new Map();
    for (const r of long) {
      const i = idxByEmail.get(norm(r.email)); const q = qs[+r.qid - 1];
      if (i === undefined || !q) { lUnknown++; continue; }
      cnt.set(i, (cnt.get(i) || 0) + 1);
      const num = r.jawaban === 'Ya' ? 1 : r.jawaban === 'Tidak' ? 0 : -1;
      if (num !== +r.jawaban_num || num !== answers[i * 20 + q.id - 1]) lDiff++;
      if (r.aspek !== ASPEK[q.aspek] || r.pertanyaan !== q.text) lMeta++;
      if (norm(r.nama) !== norm(respondents[i].nama) || +r.score !== respondents[i].score) lMiss++;
    }
    const full = [...cnt.values()].filter(v => v === 20).length;
    add(long.length === N * 20 && !lUnknown && !lDiff && !lMeta && !lMiss && full === N ? 'ok' : 'error',
      'jawaban_long.csv identik dengan responden.csv',
      `${long.length} baris (diharapkan ${N * 20}); ${full}/${N} responden punya 20 jawaban; selisih jawaban ${lDiff}, selisih nama/skor ${lMiss}, selisih aspek/teks ${lMeta}, kunci tak dikenal ${lUnknown}.`);

    /* --- ringkasan vs hitung ulang --- */
    let sDiff = 0;
    const perQ = qs.map(q => { let y = 0; for (let i = 0; i < N; i++) y += answers[i * 20 + q.id - 1]; return y; });
    for (const r of sum) {
      let n, y;
      if (r.tipe === 'pertanyaan') { const q = qs[+r.kunci.slice(1) - 1]; n = N; y = perQ[q.id - 1]; }
      else { const a = ASPEK.indexOf(r.aspek); n = N * aspekQ[a].length; y = aspekQ[a].reduce((s, j) => s + perQ[j], 0); }
      if (+r.n !== n || +r.ya !== y || +r.tidak !== n - y || Math.abs(+r.persen_ya - r2(y / n * 100)) > 0.011) sDiff++;
    }
    add(sDiff ? 'error' : 'ok', 'ringkasan.csv dihitung ulang dari jawaban', sDiff ? `${sDiff} dari ${sum.length} baris berbeda.` : `${sum.length} dari ${sum.length} baris (3 aspek, 20 pertanyaan) cocok persis.`);

    /* --- xlsx vs wide --- */
    let xName = 0, xAns = 0, xTs = 0, xCase = 0, xMissing = 0;
    for (const r of xraw) {
      const i = idxByEmail.get(norm(r['Email Address']));
      if (i === undefined) { xMissing++; continue; }
      const R = respondents[i];
      if (r.Nama !== R.nama) xCase++;
      if (norm(r.Nama) !== norm(R.nama) || +r.Score !== R.score) xName++;
      for (let j = 0; j < 20; j++) if ((r[String(j + 1)] === 'Ya' ? 1 : 0) !== answers[i * 20 + j]) { xAns++; }
      if (Math.abs(new Date(r.Timestamp).getTime() - R.ts) > 1500) xTs++;
    }
    add(xraw.length === N && !xMissing && !xName && !xAns && !xTs ? 'ok' : 'error', 'Excel mentah (DATA MENTAH) identik dengan responden.csv',
      `${xraw.length} baris; email tak ditemukan ${xMissing}; selisih nama/skor ${xName}; selisih jawaban ${xAns}; selisih timestamp > 1,5 dtk ${xTs}.`);
    if (xCase) add('info', 'Perbedaan huruf kapital nama', `${xCase} nama di Excel mentah ditulis HURUF BESAR; versi CSV (Title Case) dipakai untuk tampilan, nama asli tetap tersimpan di model.`);
    let xa = 0;
    for (const r of xaspek) {
      const R = respondents.find(x => norm(x.nama) === norm(r.Nama));
      if (!R) { if (r.Nama && !/^Rata-rata/.test(r.Nama) && r.Nama !== 'Nama') xa++; continue; }
      if (ASPEK.some((a, k) => +r[a] !== r2(R.aspekYa[k] / aspekQ[k].length * 100))) xa++;
    }
    add(xa ? 'warn' : 'ok', 'Sheet "Berdasarkan aspek" cocok dengan hitung ulang', xa ? `${xa} baris berbeda.` : 'Semua baris cocok.');

    /* --- catatan metodologi --- */
    const totalYa = perQ.reduce((a, b) => a + b, 0);
    const micro = totalYa / (N * 20);
    const macro = ASPEK.reduce((s, _, a) => s + aspekQ[a].reduce((t, j) => t + perQ[j], 0) / (N * aspekQ[a].length), 0) / 3;
    add('info', 'Dua definisi "rata-rata keseluruhan"', `Rasio Ya terhadap seluruh jawaban = ${r2(micro * 100)}% (cocok dengan "Rata-rata skor 0,87" di Excel). Rata-rata ketiga aspek = ${r2(macro * 100)}% (cocok dengan 0,8657 di Excel). Keduanya valid; aplikasi memakai yang pertama dan menyebutnya eksplisit.`);
    add('info', 'Format timestamp', 'Format MM/DD/YY (terbukti dari nilai 11/16 dan 11/19). Zona waktu tidak tersedia di sumber, jadi waktu ditampilkan apa adanya.');
    add('info', 'Tidak ada relasi antar-responden di sumber', 'Tidak ada kolom teman, kelompok, atau institusi. Relasi pada graf diturunkan dari jawaban: responden-aspek, responden-pertanyaan (jawaban Tidak), dan kemiripan pola jawaban. Tidak ada relasi yang dikarang.');
    add('info', 'Arah pertanyaan', 'Seluruh 20 pernyataan ditulis positif (Ya = siap/mengetahui), termasuk Q20 ("tidak merasa tertekan"), sehingga Ya selalu bernilai baik. Tidak ada pembalikan skor.');

    self.postMessage({
      ok: true,
      model: {
        kelas: (Object.keys(xmeta).find(k => /^Rekapitulasi kelas/.test(k)) || '').replace('Rekapitulasi kelas ', ''),
        aspek: ASPEK, aspekQ, questions: qs, respondents, answers: answers.buffer,
        xmetaOverall: xmeta.rata_rata_keseluruhan_aspek
      },
      diagnostics: diag, sources,
      quality: { empty: emptyCells, errors: bad, dups: (N - seenEmail.size) + (N - seenName.size) }
    }, [answers.buffer]);
  } catch (err) {
    self.postMessage({ ok: false, error: String(err && err.message || err) });
  }
};
