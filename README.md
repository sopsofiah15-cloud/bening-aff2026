# Piala AFF 2026 — Jadwal, Klasemen & Top Skor

Website statis 1 halaman (HTML/CSS/JS murni, tanpa build step) yang menampilkan:

- **Jadwal Lengkap** — semua pertandingan, dikelompokkan per tanggal & grup
- **Klasemen** — dihitung otomatis per grup dari hasil pertandingan yang sudah selesai
- **Top Skor** — dihitung otomatis dari kejadian gol di setiap pertandingan
- **Live update** — auto-refresh (30 detik saat ada laga live, 2 menit saat tidak ada)

Semua data diambil langsung dari endpoint publik ESPN, tanpa API key.

## Struktur folder

```
piala-aff-2026/
├── index.html          # halaman utama (1 halaman, semua section)
├── css/style.css        # tema warna hitam-emas + background lapangan blur
├── js/espn-api.js        # wrapper fetch ke ESPN + hitung klasemen & top skor
├── js/main.js             # render UI dari data ESPN
└── vercel.json
```

## Kenapa klasemen & top skor bisa "otomatis dari ESPN" tanpa endpoint khusus?

ESPN tidak punya endpoint standings/leaders publik yang stabil untuk turnamen
regional seperti AFF. Jadi klasemen dan top skor **dihitung sendiri di sisi
browser** dari data pertandingan (`/scoreboard`) yang sama:

- **Klasemen**: dihitung dari skor akhir tiap match yang sudah `finished`,
  dikelompokkan berdasarkan `Group A/B/...` yang terbaca dari catatan ESPN.
- **Top skor**: dihitung dari field `details` tiap pertandingan (event gol
  yang dicatat ESPN per laga).

Jadi datanya tetap 100% dari ESPN, cuma logika agregasinya dikerjakan di
`js/espn-api.js` (fungsi `computeStandings` & `computeTopScorers`).

> Catatan: endpoint ESPN ini tidak resmi/tidak didokumentasikan. Kalau di
> kemudian hari ESPN mengubah format datanya, sesuaikan `ESPN_BASE` dan
> fungsi `normalizeEspnEvent` di `js/espn-api.js`.

## Menjalankan lokal

Karena murni statis, cukup buka lewat server lokal apa saja, contoh:

```bash
npx serve .
# atau
python3 -m http.server 8000
```

Lalu buka `http://localhost:8000`.

## Deploy: GitHub → Vercel

1. **Buat repo GitHub baru**, lalu push folder ini:

   ```bash
   cd piala-aff-2026
   git init
   git add .
   git commit -m "Initial commit: Piala AFF 2026"
   git branch -M main
   git remote add origin https://github.com/USERNAME/piala-aff-2026.git
   git push -u origin main
   ```

2. **Import ke Vercel**
   - Buka [vercel.com/new](https://vercel.com/new)
   - Pilih **Import Git Repository**, sambungkan akun GitHub, pilih repo `piala-aff-2026`
   - Framework preset: pilih **Other** (situs ini statis, tidak butuh build command)
   - Root Directory: biarkan default (root repo)
   - Build Command: kosongkan
   - Output Directory: kosongkan (Vercel otomatis serve `index.html` di root)
   - Klik **Deploy**

3. Setelah selesai, Vercel akan memberi URL seperti
   `https://piala-aff-2026.vercel.app` — website langsung live dan setiap
   `git push` ke `main` akan otomatis re-deploy.

## Menyesuaikan rentang tanggal turnamen

Kalau jadwal resmi berubah, edit `AFF_2026_RANGE` di `js/espn-api.js`:

```js
const AFF_2026_RANGE = { start: '20260715', end: '20260905' }; // YYYYMMDD
```

## Catatan lisensi & keandalan data

Endpoint `site.api.espn.com` yang dipakai di sini adalah endpoint publik
tidak resmi milik ESPN (tidak butuh API key, banyak dipakai proyek open
source lain juga). ESPN bisa mengubah/menonaktifkan endpoint ini kapan saja
tanpa pemberitahuan, jadi jangan dipakai untuk aplikasi production yang
butuh jaminan uptime.
