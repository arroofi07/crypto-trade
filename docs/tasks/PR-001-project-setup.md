# PR-001 — Fondasi workspace dan runtime lokal

- Status: DONE
- Dependensi: tidak ada
- Branch yang disarankan: `chore/project-setup`
- Acuan: [arsitektur](../architecture.md), [API](../api-contracts.md), [pengujian](../testing.md)

## Tujuan dan perilaku akhir

Proyek dapat diinstal, dibangun, dan dijalankan di Windows sebagai backend lokal dengan shell dashboard. Belum ada pengambilan data atau strategi trading.

## Cakupan dan kontrak

Siapkan pnpm workspace `apps/server`, `apps/web`, `packages/contracts`, dan `packages/domain`. Backend menyajikan build UI dan `/api/v1/health` awal. Shared package menyediakan tipe Decimal string, timestamp, response envelope, reason code, dan clock injectable. Schema domain dilengkapi pada PR-002.

## Checklist implementasi

- [x] Verifikasi Node 24 LTS dan versi library kompatibel; pin package manager serta commit lockfile saat repository tersedia. Lockfile tersedia; commit menunggu repository Git.
- [x] Siapkan TypeScript strict, build ESM yang konsisten, React/Vite, Tailwind, Fastify, dan script lint/typecheck/test/build/dev/start.
- [x] Uji instalasi better-sqlite3 di Windows; catat prasyarat bila prebuilt tidak tersedia, tanpa memasang sistem tool secara diam-diam.
- [x] Buat shell UI dengan status aplikasi dan placeholder fitur yang jujur.
- [x] Implementasikan loopback bind, validasi Host/Origin, bootstrap session token, dan autentikasi API sesuai arsitektur.
- [x] Siapkan Vitest, Playwright, fixture directory, dan fake clock.
- [x] Tambahkan `.gitignore` untuk `.env`, data, backup, log, node_modules, dan build; `.env.example` tanpa secret.
- [x] Siapkan Pino dengan redaksi token/header dan graceful shutdown dasar.
- [x] Dokumentasikan perintah lokal yang benar-benar diuji dalam README; belum menambahkan scheduler/data provider.

## Pengujian dan kriteria selesai

- Install, typecheck, test smoke, dan build berhasil pada Windows yang dituju.
- Start produksi melayani halaman dan health hanya pada 127.0.0.1:4317; token tidak muncul di log.
- Origin asing atau token tidak valid ditolak; port terpakai menghasilkan pesan jelas tanpa menghentikan proses lain.
- Tidak memerlukan koneksi wallet, API berbayar, atau bot token untuk menjalankan shell.

## Bukti pelaksanaan

- Tanggal: 22 Oktober 2026; Windows x64, Node 24.22.1 LTS, pnpm 10.27.0.
- Commit/PR: belum ada karena folder belum merupakan repository Git dan belum memiliki remote. `pnpm-lock.yaml` sudah dibuat dan diverifikasi dengan frozen install.

| Perintah | Hasil |
| --- | --- |
| `pnpm.cmd install --frozen-lockfile` | Lulus, seluruh 5 workspace terpasang dengan lockfile konsisten |
| `pnpm.cmd lint` | Lulus tanpa warning ESLint |
| `pnpm.cmd typecheck` | Lulus untuk aplikasi, shared package, konfigurasi, dan script tes |
| `pnpm.cmd test` | 23 tes / 4 berkas lulus, termasuk native SQLite insert/commit/rollback |
| `pnpm.cmd build` | ESM server/shared package dan UI Vite/Tailwind berhasil dibangun |
| `pnpm.cmd test:smoke` | Lulus: halaman produksi, 401 tanpa token, Host/Origin asing, loopback-only, konflik port tidak membunuh server pertama, log tanpa token, shutdown melepas port |
| `pnpm.cmd exec playwright install chromium` | Berhasil; browser disimpan pada `.cache/ms-playwright` melalui `PLAYWRIGHT_BROWSERS_PATH` |
| `pnpm.cmd test:e2e` | 4 tes Chromium lulus: bootstrap dan hapus fragment, reload, sesi hilang/tidak valid, gangguan koneksi dan retry; viewport mobile tanpa overflow |
| `pnpm.cmd dev` | Vite 5173: halaman dan modul React 200; API 4317 tanpa token 401; preflight origin dev 204 dengan allow-origin tepat |
| `pnpm.cmd start` | Build UI dilayani 200 pada 127.0.0.1:4317 |

### Analisis dan keputusan implementasi

- Empat package workspace memisahkan transport/UI dari kontrak dan clock domain. Tipe Decimal tetap string tervalidasi; belum ada schema finansial, database aplikasi, migrasi, scheduler, atau provider PR berikutnya.
- Health mengembalikan envelope dengan UUID request dan waktu UTC dari clock injectable. Status `database: not_configured`, `providers/scheduler: not_implemented`, `dataGap: unknown`, dan `telegram: disabled` menyatakan kondisi setup secara eksplisit.
- Session dibuat dengan 32 byte acak pada setiap start. URL bootstrap dikirim ke browser default melalui environment helper PowerShell; tidak dicetak atau ditulis ke file. Browser menyimpan token di sessionStorage dan menghapus fragment sebelum fetch API. Header Authorization wajib, termasuk untuk health dan route API yang belum tersedia.
- Pino JSON ke stdout meredaksi token/header dan hanya mencatat method, status, serta request ID; raw URL, body, dan pesan error input tidak dicatat. Persistensi/rotasi log belum ditambahkan.
- Node global v22.15.0 tidak memenuhi target. Pengujian memakai Node portable 24.22.1 dalam `.tools`, dengan SHA-512 paket diverifikasi terhadap metadata npm; instalasi sistem tidak diubah.
- better-sqlite3 13.0.3 membawa binary prebuilt Windows. pnpm 10.27 mencoba build implisit meski `gypfile: false`; build implisit khusus paket ini dinonaktifkan melalui `ignoredBuiltDependencies`. Tes native membuktikan binary tetap bekerja. Prasyarat Python/Visual Studio untuk source build didokumentasikan di README; tidak dipasang otomatis dan source build belum diuji.
- Dev menggunakan dukungan TypeScript native Node 24 serta loader konfigurasi Vite native untuk menghindari ketergantungan runner tambahan dan loop restart akibat konfigurasi sementara Vite.
- Server E2E dikelola dalam global setup/teardown Playwright sehingga lifecycle tes di Windows tidak bergantung pada penghentian pohon proses shell.
- Selama verifikasi CLI, `OPEN_BROWSER=false` mencegah membuka browser default pengguna. Bootstrap/session UI sudah diuji di Chromium Playwright; asosiasi dan pembukaan browser default Windows belum diuji secara interaktif.

Lihat [README](../../README.md) untuk perintah PowerShell, konfigurasi, versi, dan referensi resmi kompatibilitas.
