# Peta Kesiapan TKA

Graf interaktif untuk survei kesiapan TKA (35 responden × 20 pernyataan Ya/Tidak, kelas XII F8).
Statis, tanpa backend, tanpa dependensi runtime, tanpa request eksternal. Seluruh data diproses di browser.

## Jalankan lokal
ES module dan Web Worker membutuhkan server HTTP (bukan `file://`):

    python3 -m http.server 8000      # lalu buka http://localhost:8000

## Deploy ke GitHub Pages
1. Push folder ini ke repo GitHub (branch `main`).
2. Settings → Pages → Source: **GitHub Actions**.
3. Workflow `.github/workflows/pages.yml` menyalin `index.html`, `css/`, `js/`, `data/` dan men-deploy-nya.
Semua path relatif, sehingga aman di subdirektori `https://user.github.io/nama-repo/`. Tidak ada routing sisi klien.

## Data
| Berkas | Peran |
|---|---|
| `data/responden.csv` | Sumber utama (1 baris/responden) |
| `data/jawaban_long.csv` | Format panjang, diverifikasi sel demi sel |
| `data/ringkasan.csv` | Agregat, dihitung ulang dan dibandingkan |
| `data/xlsx_*.csv`, `xlsx_meta.json` | Ekstrak `tools/sumber.xlsx` (`python3 tools/xlsx_to_csv.py tools/sumber.xlsx data/`) |

Worker (`js/worker.js`) mem-parse semua sumber, menormalisasi ke satu model, dan menjalankan 9 pemeriksaan silang
(hasil di tab **Data**). Hasil saat ini: seluruh pemeriksaan lolos, 0 sel kosong, 0 duplikat.
Excel diekstrak ke CSV saat build agar tidak perlu memuat SheetJS (~1 MB) hanya untuk satu berkas tetap.

Temuan penting:
- Sumber **tidak memuat relasi antar-responden** (tidak ada kolom kelompok/institusi/teman). Relasi graf diturunkan dari jawaban:
  **Aspek** (responden↔aspek, bobot = skor aspek), **Celah** (responden↔pernyataan yang dijawab Tidak),
  **Kemiripan** (responden↔responden, jawaban identik ≥ ambang yang bisa diatur). Tidak ada relasi yang dikarang.
- Rata-rata keseluruhan punya dua definisi sah: 87,00% (Ya ÷ semua jawaban) dan 86,57% (rata-rata tiga aspek, nilai di Excel). Aplikasi memakai yang pertama.
- Timestamp berformat MM/DD/YY. Nama di Excel mentah HURUF BESAR; versi CSV dipakai untuk tampilan.
- "Tanggal pengisian" (4 tanggal) dipakai sebagai kelompok deskriptif, bukan perbandingan statistik (n kecil).

## Keputusan teknis dan trade-off
- **Render DOM + SVG, bukan Canvas/WebGL.** Graf hanya 38–55 node. DOM memberi teks tajam, fokus keyboard, dan panel yang bisa di-scroll di dalam node.
  Tersedia LOD (badge/label disembunyikan saat zoom jauh) dan culling di luar viewport; ambang Canvas tidak ditetapkan tanpa benchmark pada data yang lebih besar.
- **Fisika sendiri** (`js/physics.js`, ±120 baris): tolakan, pegas relasi, tumbukan AABB dengan ukuran aktual node (termasuk saat mengembang), damping, batas area, pin saat drag.
  Loop `requestAnimationFrame` berhenti total saat graf stabil (CPU idle ≈ 0).
- **Deteksi komunitas tidak dihitung**: dengan 13 responden berpola identik dan n kecil, hasilnya tidak stabil. Komponen terhubung, kepadatan, derajat, dan node terisolasi dipakai.
- **Tanpa filter "dataset"**: keempat sumber memuat responden yang sama, sehingga filter tersebut tidak bermakna.
- Semua chart adalah SVG buatan sendiri (`js/charts.js`); tooltip lewat `data-tip`.

## Interaksi
Klik node: mengembang/menciut (morph di tempat) · klik node lain: yang lama menciut (opsi "beberapa node" di Pengaturan) · klik area kosong: ciutkan semua ·
klik ganda: fokus tetangga · seret node: pindah dan dikunci (Lepas pin di Pengaturan) · scroll: zoom · seret kanvas: geser · hover: sorot koneksi ·
`Esc`: ciutkan · `+` `−` `0`: zoom/reset · Tab/Enter/Spasi: navigasi keyboard · `prefers-reduced-motion` dihormati.

## Struktur
    index.html
    css/style.css
    js/main.js      state, filter, kontrol UI
    js/worker.js    parsing + normalisasi + verifikasi
    js/stats.js     filter, agregasi, pembangunan graf, metrik jaringan
    js/physics.js   simulasi gaya
    js/graph.js     renderer node morphing, viewport, input
    js/panel.js     panel analitik kontekstual
    js/charts.js    chart SVG
    js/views.js     tab Responden / Relasi / Data
    data/  tools/  .github/workflows/pages.yml

## Pembaruan tampilan
- **Inisial**: semua kata nama (`initials()` di `js/stats.js`, maks 4 huruf). Santi Turyana Ali → STA.
- **Kontras**: node responden solid, teks otomatis putih/gelap; Ya = hijau ✓, Tidak = merah ✕ (bukan hanya warna).
- **Mini-chart**: cincin Ya/20 di node responden, bar mini di node aspek/pertanyaan, kartu metrik di isi node.
- **Filter**: tombol aspek (Pemahaman dasar / Persiapan / Kesiapan) aktif = solid + ✓, nonaktif = putus-putus.
- **Kustomisasi warna**: Pengaturan → Warna & tampilan (`js/theme.js`): 3 preset, pemilih warna, peringatan kontras, reset.
- **Kredit**: Created by Syahla · Visualized by Valmortheos.
