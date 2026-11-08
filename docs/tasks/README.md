# Daftar tugas per PR

Setiap dokumen berisi unit pekerjaan yang dapat direview. Status diperbarui berdasarkan bukti implementasi lokal; belum ada PR GitHub. Ikuti [roadmap](../roadmap.md) untuk dependency dan [template](PR-TEMPLATE.md) untuk tugas tambahan.

Status DONE di bawah mencatat implementasi lokal dan fallback yang terdokumentasi, bukan kesiapan seluruh integrasi data nyata. Klasifikasi akun produksi PR-004 masih menghalangi security PASS. Lihat [kekurangan dan pekerjaan lanjutan](../remaining-work.md) untuk penghalang, temuan inspeksi kode, serta validasi yang belum tersedia.

| ID | Judul | Status |
| --- | --- | --- |
| [PR-001](PR-001-project-setup.md) | Project setup | DONE |
| [PR-002](PR-002-database-and-settings.md) | Database dan pengaturan | DONE |
| [PR-003](PR-003-market-data-collection.md) | Pengumpulan data pasar | DONE |
| [PR-004](PR-004-token-security-checks.md) | Pemeriksaan keamanan token | DONE |
| [PR-005](PR-005-news-and-catalysts.md) | Berita dan katalis | DONE |
| [PR-006](PR-006-signal-engine.md) | Mesin sinyal | DONE |
| [PR-007](PR-007-position-sizing-and-risk.md) | Ukuran posisi dan risiko | DONE |
| [PR-008](PR-008-paper-trading.md) | Paper trading | DONE |
| [PR-009](PR-009-dashboard.md) | Dashboard | DONE |
| [PR-010](PR-010-telegram-bot.md) | Telegram | DONE |
| [PR-011](PR-011-performance-journal.md) | Jurnal dan performa | DONE |
| [PR-012](PR-012-recovery-and-local-launch.md) | Recovery dan peluncuran lokal | DONE |
| [PR-013](PR-013-nextjs-scaffold.md) | Scaffold Next.js (apps/web) | TODO |
| [PR-014](PR-014-nextjs-pages.md) | Port halaman ke App Router | TODO |
| [PR-015](PR-015-nextjs-api-sse-session.md) | Proxy API, sesi, dan SSE | TODO |
| [PR-016](PR-016-nextjs-cutover.md) | Cutover launcher, hapus Vite, E2E | TODO |

## Migrasi UI (Next.js)

Panduan lengkap: [migration-nextjs.md](../migration-nextjs.md). Task **PR-013–016** mengganti dashboard Vite; backend Fastify, SQLite, dan kontrak API tetap. Jangan memulai cutover (016) sebelum proxy/sesi (015) lulus uji.

## Aturan pelaksanaan

1. Baca dokumen acuan dan pastikan dependency selesai. Lakukan perubahan kode hanya pada saat task implementasi tersebut dijalankan.
2. Mulai status `IN_PROGRESS`, catat branch/PR jika sudah ada. Tidak perlu membuat branch/remote saat hanya menulis dokumen ini.
3. Selesaikan checklist dan tes bermakna yang disebutkan. Catat penyimpangan dan perubahan kontrak.
4. Ubah ke `DONE` hanya dengan bukti validasi; sinkronkan status di indeks ini.
5. Jika terhambat provider, catat `BLOCKED` beserta fakta dan langkah pemulihan. Jangan mengganti hasil tidak diketahui dengan data rekaan.
6. Secret, data runtime, dan kredensial tidak masuk commit atau deskripsi PR.
