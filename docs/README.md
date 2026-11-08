# Indeks dokumentasi

Tanggal: 2026-11-06. Bahasa produk dan dokumentasi: Indonesia.

## Urutan membaca

| Dokumen | Isi |
| --- | --- |
| **[Redesign V2](redesign-v2.md)** | **Discovery hybrid, fase sinyal, stub eksekusi — arah repo setelah MVP** |
| [Kebutuhan produk](product-requirements.md) | Tujuan, batasan, fitur, dan kriteria MVP |
| [Arsitektur](architecture.md) | Stack, modul, runtime lokal, dan keamanan akses |
| [Sumber data](data-sources.md) | Provider, keterbatasan, polling, dan provenance |
| [Strategi dan risiko](strategy-and-risk.md) | Hipotesis strategi, sizing, biaya, dan simulasi |
| [Model data](data-model.md) | Entitas, tipe, versi, dan aturan persistensi |
| [Kontrak API](api-contracts.md) | REST, SSE, Telegram, dan idempotensi |
| [Pengujian](testing.md) | Unit, integrasi, E2E, replay, dan acceptance |
| [Operasi lokal](operations.md) | Launcher, Telegram, recovery, backup/restore, replay, dan troubleshooting |
| [Kekurangan dan pekerjaan lanjutan](remaining-work.md) | Penghalang data nyata, temuan kode, prioritas, dan kriteria penyelesaian |
| [Roadmap](roadmap.md) | Dependensi dan urutan implementasi |
| [Tugas PR](tasks/README.md) | Checklist per unit pekerjaan |
| **[Migrasi Next.js](migration-nextjs.md)** | **Rencana UI App Router + task PR-013–016** |

## Status keputusan

- **Disepakati pengguna:** pribadi, lokal Windows, dashboard PC + Telegram, DEX Solana aktif, horizon menit-jam, simulasi Rp500.000, profil risiko konservatif, dan mulai gratis.
- **Pilihan teknis rancangan:** stack, struktur modul, kontrak, dan penyimpanan yang dijelaskan dalam dokumen ini.
- **Default eksperimen:** ambang filter, indikator, polling, biaya model, dan aturan entry/exit. Angka tersebut belum divalidasi sebagai strategi yang menguntungkan.
- **Di luar MVP:** transaksi nyata, wallet signing, private key, leverage, auto-copy-trading, hosting 24 jam, dan model AI berbayar.

## Aturan implementasi

1. Ikuti dependensi PR; jangan menandai fitur selesai hanya karena tampilan sudah ada.
2. Dokumen kebutuhan menentukan cakupan; strategi menentukan hitungan; model data dan API menentukan kontrak bersama. Jika berubah, perbarui seluruh dokumen yang terdampak dalam PR yang sama.
3. Bekukan versi strategi, konfigurasi risiko, kurs, dan model biaya pada setiap sinyal/posisi. Jangan memperbaiki hasil lama dengan data masa depan.
4. Data yang tidak diketahui tetap tidak diketahui. Skor bukan probabilitas profit; pemeriksaan lolos bukan jaminan token aman.
5. Simpan bukti pengujian dalam dokumen/deskripsi PR dan sinkronkan status di indeks tugas. PR-001 sampai PR-012 sudah diimplementasikan dan diuji lokal; keterbatasan provider dicatat secara eksplisit.
6. Dokumentasi tidak memberi izin mengirim pesan Telegram selama pengerjaan; gunakan mock, kemudian lakukan uji pengiriman hanya setelah pengguna memberikan token, chat ID, dan instruksi pengujian.
