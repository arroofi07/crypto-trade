# PR-008 — Paper trading, posisi, dan ledger

- Status: DONE
- Dependensi: PR-003, PR-006, PR-007
- Branch yang disarankan: `feat/paper-trading`
- Acuan: [strategi/simulasi](../strategy-and-risk.md), [model data](../data-model.md), [API](../api-contracts.md)

## Tujuan dan perilaku akhir

Sinyal dapat diuji otomatis atau dipilih pengguna tanpa mengirim transaksi nyata. Semua perubahan kas dan posisi dapat diaudit dan tetap benar jika aplikasi diulang atau dimatikan.

## Cakupan dan kontrak

Entry request, reservations, fills, positions, cash ledger, exit intents, equity snapshots, outbox domain, dan API paper/positions. Tidak mengimplementasikan delivery Telegram atau analisis performa lengkap.

## Checklist implementasi

- [x] Auto engine mengantrekan sinyal valid deterministik; manual memakai portfolio terpisah.
- [x] Buat pending request + reservation secara atomik; catat keputusan yang gagal tanpa menghilangkannya dari evaluasi.
- [x] Fill entry hanya memakai observasi sesudah requestedAt, sebelum expiry, setelah revalidasi harga/gate/risk.
- [x] Rehitung quantity pada fill; lepas reservation lama dan tulis posisi/fill/ledger/outbox dalam satu transaksi.
- [x] Terapkan idempotency payload hash, unique portfolio+signal, dan satu posisi per mint.
- [x] Hitung target dari harga fill, stop dari sinyal, dan batas hold dari openedAt.
- [x] Implementasikan exit stop/target/trend/time/security/manual dengan biaya konsisten dan urutan alasan yang ditentukan.
- [x] UNPRICED tidak mendapat fabricated fill; data gap diberi flag pada valuation/exit sesudah pulih.
- [x] Persist pending, exit intent, daily halt, dan event sehingga restart tidak menduplikasi transaksi.
- [x] Atomic outbox menjadi sumber notifikasi; kegagalan kanal eksternal tidak membatalkan fill yang sudah committed.
- [x] Semua output memakai label simulasi dan cost-model version; tidak membuat sign/send transaction code.

## Pengujian dan kriteria selesai

- Sinyal -> pending -> observasi baru -> fill -> exit menghasilkan ledger, saldo, fees, dan PnL yang bisa dihitung ulang.
- Klik ganda, auto retry, dan request paralel menghasilkan satu fill per entry; payload berbeda/key sama ditolak.
- Snapshot saat sinyal tidak dipakai sebagai entry jika pengguna merespons kemudian; harga di luar range menyebabkan tunggu/reject sesuai expiry.
- Crash pada transaksi rollback; restart dari state committed tidak menggandakan kas atau outbox.
- Offline melewati target/stop tidak menghasilkan exit pada harga threshold yang tidak pernah diamati.

## Bukti pelaksanaan

- Commit/PR: belum ada.
- Typecheck/build dan 49 tes awal lulus; tiga tambahan exit TARGET/TIME/SECURITY lulus (total 52). E2E service mencakup pending -> observasi berikutnya -> fill -> manual/otomatis exit, ledger balance, idempotency payload conflict, double click, rollback fill, expiry/release, UNPRICED, gap exit memakai harga observasi, prioritas security, serta portfolio terpisah.
- Auto hanya berjalan pada eksperimen aktif. Entry/exit API memberi HTTP 202 dan tidak mengisi memakai snapshot permintaan. Nilai fill sepenuhnya simulasi cost-model-v1; tidak ada signer, wallet, atau send transaction. Outbox ditulis dalam transaksi dan dipublikasikan sesudah commit.
