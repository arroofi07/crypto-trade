# PR-012 — Recovery, backup, dan peluncuran lokal

- Status: DONE
- Dependensi: PR-009, PR-010, PR-011
- Branch yang disarankan: `feat/local-operations`
- Acuan: [arsitektur](../architecture.md), [model data](../data-model.md), [pengujian](../testing.md)

## Tujuan dan perilaku akhir

Aplikasi dapat dijalankan dan dihentikan dengan jelas di Windows, pulih tanpa efek transaksi ganda, dan memperlihatkan periode offline. Pengguna memiliki panduan backup/restore dan troubleshooting.

## Cakupan dan kontrak

Launcher lokal, integrasi startup/shutdown, recovery scheduler/ledger/outbox, backup, retensi, dan smoke test. Tidak menambah startup Windows otomatis, cloud hosting, layanan berbayar, atau live trading.

## Checklist implementasi

- [x] Sediakan launcher PowerShell/CMD dan dokumentasikan setup/build/start/stop yang sudah diuji, termasuk path dengan spasi.
- [x] Pastikan hanya satu writer/bot polling instance; konflik port/DB dilaporkan tanpa membunuh proses lain.
- [x] Startup memverifikasi schema, memuat config/checkpoint, menandai gap, dan merekonsiliasi pending/positions/daily halt.
- [x] Pending entry yang expired saat offline dibatalkan dan reservation dilepas; tidak ada entry/backfill order retrospektif.
- [x] Posisi yang due saat offline dievaluasi pada observasi valid pertama, dengan quality flag dan biaya model saat fill.
- [x] Gap/warm-up/provider failure memblokir entry sesuai aturan; health dan notifikasi perubahan kondisi tidak spam.
- [x] Shutdown menghentikan entry baru dan job, menyelesaikan transaksi DB, lalu menutup bot/database.
- [x] Implementasikan backup SQLite konsisten, integrity check, retensi 7 backup, dan restore terdokumentasi saat app berhenti.
- [x] Retensi snapshot/log tidak menghapus evidence yang masih dirujuk sinyal/posisi.
- [x] Dokumentasikan batas data gratis, tanpa pemantauan saat PC mati, secret handling, dan label hasil simulasi.
- [x] Jalankan smoke test integrasi lengkap dengan mock provider dan Telegram; live verification hanya dalam cakupan instruksi pengguna.

## Pengujian dan kriteria selesai

- Restart di setiap state penting tidak menggandakan posisi, saldo, cash ledger, atau efek callback.
- Simulasi Windows sleep/gap, koneksi hilang, rate limit, DB lock, dan port bentrok memiliki pesan dan pemulihan yang jelas.
- Backup dapat direstore ke database uji dengan ledger/config/posisi sama dan integrity check lulus.
- Seluruh E2E MVP dari onboarding sampai jurnal berhasil tanpa data berbayar atau wallet.
- README berisi langkah yang dapat diikuti pengguna; tidak ada klaim strategi sudah profitable atau pengawasan 24 jam.

## Bukti pelaksanaan

- Commit/PR: implementasi lokal; workspace tidak memiliki repository Git/remote.
- Perintah dan hasil tes: pnpm install --frozen-lockfile, lint, typecheck, build lulus; 63 unit/integration test (18 file), 5 Playwright test, smoke runtime dan smoke integrasi lengkap lulus pada Windows x64 / Node 24.22.1. Launcher CMD check lulus dari path dengan spasi.
- Keterbatasan/perubahan keputusan: runtime memakai SQLite EXCLUSIVE lock; backup CLI/restore dilakukan offline. Backup harian memakai API SQLite, integrity/FK/schema check dan retensi 7; log 14 hari. Native browser default tidak dibuka saat test. PowerShell policy mesin memblokir pemanggilan langsung .ps1; start.cmd berhasil dengan bypass hanya pada proses launcher. Bot nyata tidak diaktifkan; RPC classification UNKNOWN dan RSS kosong dijelaskan di docs/operations.md.
