# Memecoin Trade

Dashboard analisis Solana dan paper trading lokal untuk Windows. PR-001 sampai PR-012 telah diimplementasikan: watchlist, sampel pasar, pemeriksaan keamanan, sinyal, sizing, simulasi, Telegram opsional, jurnal, replay, serta backup/recovery. **Tidak ada wallet atau transaksi uang nyata.**

Gunakan Node **24.22.1** (seri 24) dan pnpm **10.27.0**. Launcher memilih runtime portable `.tools/package/bin` jika tersedia; folder tersebut diabaikan Git dan perlu disiapkan sendiri pada mesin baru.

```powershell
.\start.cmd setup
.\start.cmd
```

Launcher CMD juga berjalan dari PowerShell dan menangani policy script yang membatasi `.ps1`. Jika policy sudah mengizinkan, `./start.ps1 setup` lalu `./start.ps1` juga tersedia. Alternatif terminal dengan Node yang sesuai:

```powershell
pnpm.cmd install --frozen-lockfile
pnpm.cmd build
pnpm.cmd start
```

Browser dibuka pada **http://127.0.0.1:4317** dengan sesi lokal otomatis. Token tidak dicetak ke terminal; gunakan tab yang dibuka peluncur. **Ctrl+C** menghentikan aplikasi. Pengembangan: `pnpm.cmd dev`. Opsi `.env` tersedia di [.env.example](.env.example).

Isi kurs asumsi USD/IDR pada Pengaturan untuk membuat portfolio **strategy** dan **manual**, masing-masing Rp500.000. Kurs dan konfigurasi dibekukan per eksperimen. Strategy otomatis hanya berjalan jika diaktifkan saat eksperimen dibuat. Manual memakai preview server, reservation, dan fill pada observasi berikutnya. Model awal: risiko 0,5% per posisi, total 1,5%, daily halt 2%, slippage 1% per sisi, fee 0,3% plus Rp500 per sisi.

Tambahkan alamat mint di Watchlist. Sinyal memerlukan setidaknya 60 bar sampel lengkap dan seluruh gate data/security. **RPC publik saat ini belum membuktikan klasifikasi akun pool/burn, sehingga security dapat tetap UNKNOWN dan entry diblokir.** Tidak ada bypass otomatis. Allowlist RSS produksi juga masih kosong karena akses/ketentuan feed belum memenuhi syarat; pencatatan link manual tersedia. Detail batas sumber ada di [data-sources.md](docs/data-sources.md).

Jurnal memisahkan portfolio dan versi, memakai ledger/fill untuk net PnL, dan menampilkan biaya, skip, UNPRICED, serta gap. Strategi belum terbukti profitable; win rate tinggi saja tidak menjamin profit. Tidak ada pengawasan saat PC tidur/mati atau aplikasi berhenti.

Telegram **nonaktif secara default**. Konfigurasi allowlist, command/callback, perilaku DELIVERY_UNKNOWN, backup/restore, replay, retensi, dan troubleshooting dijelaskan dalam [panduan operasi](docs/operations.md). Tidak ada live Telegram send dalam implementasi atau suite otomatis.

```powershell
pnpm.cmd lint
pnpm.cmd typecheck
pnpm.cmd test
pnpm.cmd test:smoke
$env:PLAYWRIGHT_BROWSERS_PATH = (Join-Path $PWD '.cache/ms-playwright')
pnpm.cmd exec playwright install chromium  # sekali saat setup browser
pnpm.cmd test:e2e
```

Pengujian menggunakan provider/Telegram mock, SQLite sementara, dan clock deterministik. Smoke memeriksa loopback, Host/Origin/session, konflik port/writer, shutdown, alur simulasi sampai jurnal, dan backup/restore. E2E menguji onboarding sampai ekspor CSV, reconnect, klik ganda, dan input berita. Hasil terakhir dicatat di [task PR-012](docs/tasks/PR-012-recovery-and-local-launch.md).

`better-sqlite3` 13.0.3 menggunakan binary prebuilt yang telah diuji pada Windows x64/Node 24.22.1. `ignoredBuiltDependencies` mencegah pnpm 10 menjalankan node-gyp yang tidak dibutuhkan paket ini. Tidak ada instalasi Python/Visual Studio otomatis. Platform lain perlu validasi binary sendiri; lihat [panduan upstream](https://github.com/WiseLibs/better-sqlite3/blob/master/docs/troubleshooting.md).

- `apps/server`: Fastify, SQLite, adapter, scheduler, services, API/SSE, dan runtime.
- `apps/web`: React/Vite/Tailwind dan Lightweight Charts dengan atribusi.
- `packages/contracts`: schema DTO Zod; `packages/domain`: Decimal, strategi, risiko, dan metrik.
- `scripts`: launcher pendukung, backup/restore, replay, smoke; `tests`: fixture dan Playwright.
- `data`, `.env`, backup, log, cache, dan build diabaikan Git.

[Indeks dokumentasi](docs/README.md) · [Daftar task](docs/tasks/README.md) · [Panduan operasi](docs/operations.md)

Lihat [kekurangan dan pekerjaan lanjutan](docs/remaining-work.md) untuk batas kesiapan data nyata, temuan kode yang perlu ditangani, prioritas, dan kriteria penyelesaiannya.

Arah redesign (discovery hybrid + sinyal + fase eksekusi terpisah): [Redesign V2](docs/redesign-v2.md).

Rencana migrasi dashboard ke **Next.js** (backend Fastify tetap): [migration-nextjs.md](docs/migration-nextjs.md) · task [PR-013–016](docs/tasks/README.md).

Folder kerja belum memiliki repository Git/remote. Status task menunjukkan implementasi dan validasi lokal, bukan commit atau PR GitHub yang telah dibuat.
