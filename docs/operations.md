# Operasi lokal dan recovery

Implementasi PR-001 sampai PR-012 berjalan lokal di Windows. Tidak ada wallet, private key, real order, cloud, atau startup Windows otomatis. Seluruh hasil berlabel simulasi dan memakai model biaya.

## Menjalankan dan menghentikan

Gunakan Node 24.22.1 (seri 24) dan pnpm 10.27.0. Dari folder proyek:

```powershell
.\start.ps1 check
.\start.ps1 setup   # install --frozen-lockfile dan build
.\start.ps1         # produksi, buka browser default
# Alternatif CMD: start.cmd setup, kemudian start.cmd
```

`start.ps1` memilih runtime portable `.tools/package/bin/node.exe` bila tersedia, memeriksa versi, dan berpindah ke folder script menggunakan literal path. `.tools` tidak disertakan pada checkout baru. Script tidak mengubah instalasi Node sistem. Jika PowerShell memblokir script, `start.cmd` menggunakan bypass hanya untuk proses launcher tersebut, bukan policy sistem permanen. Path berisi spasi didukung.

Tekan **Ctrl+C pada terminal peluncur** untuk berhenti. Entry baru ditolak, polling/job dihentikan, transaksi SQLite diselesaikan, lalu koneksi ditutup. Batas shutdown 10 detik mencegah proses menggantung; recovery memeriksa state yang tersisa bila proses dipaksa berhenti. Jangan menghapus file WAL/SHM atau mematikan proses lain untuk mengatasi konflik port.

`.env` opsional, contoh di `.env.example`. `DATA_DIR` default `data`; `PORT` default 4317; `OPEN_BROWSER=false` untuk headless; `LOG_LEVEL` untuk log. Produksi hanya bind `127.0.0.1`. Dev menggunakan `pnpm.cmd dev`, frontend 5173 dan backend 4317; `DEV_ORIGIN` hanya berlaku untuk dev.

Browser menerima session acak melalui fragment, menyimpannya di `sessionStorage`, kemudian menghapus fragment. Session tidak dicetak atau disimpan ke disk server. Tab baru tanpa bootstrap tidak memiliki akses. Restart membuka sesi baru; jika browser gagal dibuka, perbaiki asosiasi browser default lalu jalankan ulang launcher. Tidak ada endpoint bootstrap publik.

## Telegram opsional

Bot tidak aktif secara default. Setelah pengguna menetapkan tujuan dan memilih mengaktifkannya, isi `.env` lokal:

```dotenv
TELEGRAM_ENABLED=true
TELEGRAM_BOT_TOKEN=<token bot milik Anda>
TELEGRAM_CHAT_ID=<chat tujuan yang diizinkan>
TELEGRAM_USER_ID=<user yang diizinkan>
```

Jangan commit/kirim file ini. Tidak ada endpoint UI untuk secret. Kedua ID harus cocok; callback memakai ID opaque, expiry, versi sinyal, dan risk gate server. `/status`, `/signals`, `/positions`, `/help` menghasilkan teks SIMULASI. Entry bot hanya portfolio manual; penutupan meminta konfirmasi dan menunggu observasi berikutnya. Link localhost hanya bisa dibuka pada PC aplikasi.

grammY menggunakan long polling dengan checkpoint update yang disimpan bersama efek command/outbox. SQLite mengunci satu writer per database dan satu poller per bot pada pengguna OS yang sama. Lock polling disimpan di folder temporary `memecoin-polling-locks`, namanya hash token; token aslinya tidak disimpan. Jangan menjalankan bot yang sama pada host lain secara bersamaan.

429 yang pasti ditolak bisa dicoba lagi mengikuti Retry-After, maksimal lima percobaan. Timeout/5xx ambigu menjadi `DELIVERY_UNKNOWN` dan tidak dikirim ulang otomatis. Health menampilkan status tersebut; tidak ada jaminan exactly-once pengiriman pesan. SENDING yang tersisa saat restart juga menjadi DELIVERY_UNKNOWN. Pesan sinyal yang expired dibuang, health alert dibatasi 15 menit. Suite hanya memakai mock; tidak ada pesan nyata yang dikirim selama implementasi.

Acuan integrasi: [grammY long polling](https://grammy.dev/guide/deployment-types), [error Telegram versus transport](https://grammy.dev/guide/errors).

## Backup dan restore

Saat runtime aktif, job maintenance membuat backup harian konsisten melalui SQLite backup API. Backup berada di `DATA_DIR/backups`, diverifikasi integrity/FK/schema, lalu dipindah dari `.partial` menjadi `.sqlite`. Maksimal tujuh backup selesai dipertahankan. Kegagalan maintenance muncul pada halaman Kesehatan. Log berotasi per tanggal UTC dan maksimal 5 MB per file, retensi 14 hari.

Backup manual dan restore dilakukan **sesudah menghentikan aplikasi**:

```powershell
pnpm.cmd db:backup
pnpm.cmd db:restore "R:\lokasi backup\backup-....sqlite"
```

CLI membaca `DATA_DIR` dari `.env`. Restore memverifikasi sumber sebelum mengubah tujuan, mengambil backup database lama di `DATA_DIR/pre-restore` (retensi tujuh), lalu menggunakan SQLite backup API dan memverifikasi hasil. Database aktif ditolak oleh lock. Jangan menjalankan launcher bersamaan dengan restore. Mengganti FX atau ingin modal baru memakai eksperimen baru, bukan restore.

Jangan menyalin hanya `.sqlite` ketika aplikasi berjalan: transaksi terakhir dapat berada dalam WAL. Simpan salinan backup terverifikasi di media lain jika dibutuhkan; proyek tidak mengunggah backup. Acuan: [SQLite backup API](https://www.sqlite.org/backup.html), [locking EXCLUSIVE](https://www.sqlite.org/pragma.html#pragma_locking_mode), [better-sqlite3 backup](https://github.com/WiseLibs/better-sqlite3/blob/master/docs/api.md#backupdestination-options---promise).

Snapshot yang lebih tua dari 30 hari dapat dihapus jika tidak dirujuk fill, sinyal, atau keputusan dan bukan observasi terakhir pool. Evidence bar/snapshot yang dibekukan di sinyal serta ledger/config/posisi tetap dipertahankan. Database tidak menyusut otomatis setiap penghapusan; ruang halaman dapat digunakan ulang SQLite.

## Recovery dan troubleshooting

| Kondisi | Perilaku dan tindakan |
| --- | --- |
| Port dipakai | Startup gagal dengan pesan port, tanpa menghentikan pemiliknya. Tutup instance sendiri atau pilih PORT lain. |
| Database dipakai | Writer kedua ditolak, termasuk ketika memakai port berbeda. Hentikan instance pemilik DATA_DIR. |
| PC tidur/mati, jaringan putus | Tidak ada pengawasan/backfill. Gap lebih dari 90 detik mengulang warm-up 60 bar. |
| Restart dengan posisi | Posisi menjadi UNPRICED/RECOVERY; entry diblokir sampai observasi baru. Exit yang due memakai harga aktual pertama yang valid, dengan DATA_GAP. |
| Pending expired offline | Reservation dilepas; tidak dibuat entry historis. |
| Daily halt | Latch bertahan setelah restart. Reset UTC+7 menunggu valuasi segar bila diperlukan. |
| Security UNKNOWN | Entry diblokir. RPC gratis tidak membuktikan afiliasi akun pool/burn; tidak ada tombol bypass. |
| Provider 429/timeout | Backoff, batas concurrency/budget, indikator stale; tidak mengisi data rekaan. |
| Tidak ada berita otomatis | Allowlist RSS produksi kosong setelah pemeriksaan akses/ketentuan; input link manual tetap tersedia dan tidak fetch URL. |
| Schema/integritas gagal | Startup dihentikan. Simpan file asli dan gunakan backup yang cocok; jangan mengedit migrasi yang sudah diterapkan. |
| Sesi ditolak | Gunakan tab yang dibuka launcher terbaru. Restart membatalkan session sebelumnya. |

Database dan backup berisi histori pribadi. Lindungi akun Windows dan folder data. Security PASS hanya pemeriksaan terbatas; model biaya bukan quote executable. Strategi momentum-pullback belum terbukti profitable.

## Replay dan sensitivitas

```powershell
pnpm.cmd replay "rekaman.json" "data\replay-runs"
```

Format divalidasi oleh `recordingSchema` dalam `apps/server/src/replay.ts`: `name`, `fxUsdIdr`, `start`, `evaluationStart`, `end`, dan `events`. Event market berisi `kind: "market"`, `firstSeenAt`, `pairs` dengan format DEX Screener yang telah dinormalisasi. Event security menyimpan mint dan evidence yang benar-benar diketahui saat itu; event news menyimpan input link/judul/mint. Jangan membuat ulang firstSeenAt dari tanggal publikasi artikel. Contoh konstruksi rekaman deterministik ada di `apps/server/src/replay.test.ts`.

Urutan kronologis hanya memasukkan event yang telah diketahui ke adapter; tidak ada network, interpolasi harga, atau pembacaan data masa depan. Sebelum `evaluationStart` hanya warm-up dengan parameter beku. Sinyal periode train tidak diperdagangkan sebagai hasil evaluasi. Tujuh run disimpan dengan ID dan hash rekaman terpisah: baseline, slippage 2%/5%, fixed fee 2x, dan delay 30/60/120 detik. Delay menunda request sampai event berikutnya, fill tetap observasi setelah request. Dataset ini tidak mencakup seluruh token mati/hilang di pasar dan bukan bukti hasil live.

## Validasi

`pnpm.cmd lint`, `pnpm.cmd typecheck`, `pnpm.cmd test`, `pnpm.cmd test:e2e`, dan `pnpm.cmd test:smoke`. Browser Chromium perlu dipasang sekali lewat `pnpm.cmd exec playwright install chromium`; runtime/cache lokal dapat memakai `PLAYWRIGHT_BROWSERS_PATH=.cache/ms-playwright`.

Smoke runtime menggunakan database sementara pada path berisi spasi, memerlukan port 4317 kosong, dan tidak membuka browser atau bot nyata. E2E memakai 14317. Smoke integrasi memakai fixture deterministik untuk provider, Telegram, paper trading, jurnal, dan backup/restore. Semua database uji terpisah dari DATA_DIR pengguna.
