# PR-002 — Database, konfigurasi, dan portfolio

- Status: DONE
- Dependensi: PR-001
- Branch yang disarankan: `feat/database-settings`
- Acuan: [model data](../data-model.md), [API](../api-contracts.md), [risiko](../strategy-and-risk.md)

## Tujuan dan perilaku akhir

Konfigurasi dan state dapat bertahan setelah restart. Pengguna dapat membuat eksperimen dengan dua portfolio virtual yang terpisah, masing-masing Rp500.000, setelah memasukkan kurs USD/IDR.

## Cakupan dan kontrak

Migrasi awal mencakup tabel/indeks model data, repository dasar, config versions, cash ledger initial deposit, portfolio days, job state, dan outbox. Expose health DB, settings, experiments, portfolios. PR fitur boleh menambah migrasi berikutnya; migrasi yang sudah diterapkan tidak diedit.

## Checklist implementasi

- [x] Aktifkan WAL, foreign keys, transaksi, migrasi bernomor, dan pemeriksaan schema.
- [x] Implementasikan serialisasi Decimal/bigint sebagai string dan UTC timestamp.
- [x] Simpan config immutable beserta hash: strategi, risiko, kurs, dan biaya.
- [x] Seed default risiko 0,5%/1,5%/2%, modal 500000; jangan membuat kurs palsu atau otomatis memulai simulasi.
- [x] Buat eksperimen dan portfolio strategy/manual atomik dengan ledger modal awal terpisah.
- [x] Aktivasi eksperimen baru ditolak jika auto portfolio lama memiliki posisi/pending.
- [x] Implementasikan settings nonrahasia, DTO schema, validasi input, dan audit perubahan.
- [x] Siapkan repository serta unique constraints untuk idempotency, pending entries, posisi aktif, dan outbox.
- [x] Pastikan token Telegram tetap di environment, tidak masuk DB/settings response.

## Pengujian dan kriteria selesai

- Database kosong dapat dimigrasi; rerun migrasi tidak menduplikasi tabel, deposit, atau portfolio.
- FX nol/negatif/tidak valid ditolak; nilai finansial tidak kehilangan presisi saat round-trip DB/API.
- Dua portfolio masing-masing memiliki 500000, bukan berbagi kas tanpa aturan.
- Restart mempertahankan config dan ledger; perubahan konfigurasi tidak menulis ulang versi lama.
- Transaksi gagal rollback tanpa state parsial; foreign keys dan unique constraints terbukti bekerja.

## Bukti pelaksanaan

- Commit/PR: belum ada.
- Validasi Windows / Node 24.22.1: typecheck dan build lulus; 27 tes Vitest lulus, termasuk migrasi/rerun/restart, precision FX, rollback, immutable config, FK, unique pending, aktivasi eksperimen, dan API settings/portfolio.
- Data DTO disimpan sebagai JSON tervalidasi dengan kolom relasional untuk FK, indeks, dan unique constraints. Konfigurasi, fills, ledger, audit, dan security evidence dilindungi trigger append-only. Repository Git belum tersedia.
