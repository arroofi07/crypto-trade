# Roadmap implementasi

PR-001 sampai PR-012 telah diimplementasikan dan divalidasi lokal secara berurutan. Bukti per task ada di indeks tugas; nomor PR bukan pull request GitHub atau izin mengirim pesan eksternal. Batas provider/security dan operasi dijelaskan dalam panduan operasi.

## Dependensi

| PR | Deliverable | Bergantung pada |
| --- | --- | --- |
| [001](tasks/PR-001-project-setup.md) | Fondasi workspace, runtime, kontrak dasar, test tooling | - |
| [002](tasks/PR-002-database-and-settings.md) | Database, migrasi, config versions, portfolio | 001 |
| [003](tasks/PR-003-market-data-collection.md) | Adapter market, watchlist, sampel, scheduler | 002 |
| [004](tasks/PR-004-token-security-checks.md) | RPC/token checks dan kualitas bukti | 003 |
| [005](tasks/PR-005-news-and-catalysts.md) | Berita publik/manual dan pencocokan | 002 |
| [006](tasks/PR-006-signal-engine.md) | Strategi eksperimen, state, evidence sinyal | 003, 004, 005 |
| [007](tasks/PR-007-position-sizing-and-risk.md) | Sizing Decimal, biaya, risk gates | 002, 006 |
| [008](tasks/PR-008-paper-trading.md) | Request/fill, ledger, auto/manual portfolios | 003, 006, 007 |
| [009](tasks/PR-009-dashboard.md) | Dashboard inti, detail, posisi, pengaturan | 005, 008 |
| [010](tasks/PR-010-telegram-bot.md) | Bot, callback, outbox, recovery pengiriman | 008 |
| [011](tasks/PR-011-performance-journal.md) | Metrik, CSV, perbandingan portfolio, UI jurnal | 008, 009 |
| [012](tasks/PR-012-recovery-and-local-launch.md) | Integrasi recovery, backup, launcher, smoke test | 009, 010, 011 |

## Tahap penerimaan

1. **Fondasi dan data (001-005):** aplikasi hidup, database persisten, sumber terbatas dapat dipantau; belum ada klaim sinyal siap dipakai.
2. **Sinyal dan simulasi (006-008):** fixture end-to-end menghasilkan keputusan, sizing, ledger, dan posisi yang benar.
3. **Pengalaman pengguna (009-011):** dashboard dan Telegram menyajikan state yang sama; semua hasil dapat diaudit.
4. **Operasi lokal (012):** restart, sleep, provider gagal, backup/restore, dan batas akses lokal diuji sebelum pengumpulan data forward rutin.

Urutan serial yang direkomendasikan: 001 sampai 012. Setelah 002, task 005 secara teknis dapat dikerjakan terpisah dari 003-004; setelah 008, 009 dan 010 dapat terpisah. Ini hanya informasi dependensi, bukan instruksi otomatis menjalankan banyak agen.

## Aturan batas tanggung jawab

- PR-001 membuat shell API/UI dan tooling; tidak membuat strategi atau tabel domain final.
- PR-002 membuat schema dan repository; modul fitur berikutnya boleh menambah migrasi, bukan mengubah database manual.
- PR-006 menentukan kandidat/sinyal; PR-007 menentukan apakah portfolio boleh masuk; PR-008 memproses state transaksi simulasi.
- PR-009 mengerjakan UI inti; jurnal dan grafik performa lengkap dimiliki PR-011.
- PR-008 menyediakan domain event/outbox; PR-010 mengerjakan delivery Telegram. PR-012 menguji integrasinya saat crash/restart.
- PR-012 tidak menambahkan live trading, public hosting, atau membuktikan profit strategi.

## Setelah MVP

Jalankan eksperimen forward dan tinjau kualitas/biaya data. Baru kemudian putuskan kebutuhan quote eksekusi, data transaksi lebih detail, model prediksi, atau hosting. Perubahan ke trading nyata memerlukan spesifikasi, batas risiko, dan instruksi pengguna baru; tidak termasuk task di sini.

## Migrasi dashboard ke Next.js (opsional, PR-013–016)

| PR | Deliverable | Bergantung pada |
| --- | --- | --- |
| [013](tasks/PR-013-nextjs-scaffold.md) | Scaffold Next di `apps/web`, build standalone | 012 |
| [014](tasks/PR-014-nextjs-pages.md) | Halaman App Router paritas PR-009 | 013 |
| [015](tasks/PR-015-nextjs-api-sse-session.md) | Rewrite API, sesi, SSE, dev dual-process | 014 |
| [016](tasks/PR-016-nextjs-cutover.md) | Launcher, hapus Vite, smoke/E2E, docs operasi | 015 |

Acuan arsitektur dan pemetaan file: [migration-nextjs.md](migration-nextjs.md). Backend **tidak** diganti; hosting publik tetap di luar cakupan.
