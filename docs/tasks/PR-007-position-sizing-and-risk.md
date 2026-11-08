# PR-007 — Sizing, biaya, dan batas risiko

- Status: DONE
- Dependensi: PR-002, PR-006
- Branch yang disarankan: `feat/risk-engine`
- Acuan: [strategi dan rumus risiko](../strategy-and-risk.md), [API](../api-contracts.md), [pengujian](../testing.md)

## Tujuan dan perilaku akhir

Sinyal valid menghasilkan saran quantity dan nominal khusus portfolio setelah biaya, atau alasan mengapa transaksi harus dilewatkan. Keputusan ini digunakan konsisten oleh UI, auto, dan Telegram.

## Cakupan dan kontrak

Pure sizing/cost functions, portfolio risk service, daily halt state, reservation support, dan endpoint preview. Tidak membuat fill atau ledger transaksi; integrasinya pada PR-008.

## Checklist implementasi

- [x] Gunakan Decimal untuk FX, entry/stop/target, fee, slippage, equity, quantity, dan PnL estimasi.
- [x] Implementasikan rumus qRisk serta cap kas, alokasi 10%, likuiditas, quantity precision, dan total risiko.
- [x] Terapkan 0,5% risiko per posisi, 1,5% total termasuk reservation, maksimal 3, dan satu mint per portfolio.
- [x] Blokir entry jika portfolio UNPRICED, FX belum ditetapkan, data stale, atau kondisi sinyal tidak valid.
- [x] Hitung target net 1,5R setelah biaya; tolak jika butuh kenaikan >30%, hasil akhir <1,2R, biaya menghabiskan budget, atau target net negatif.
- [x] Implementasikan daily equity baseline, halt 2% yang persistent, serta reset hari UTC+7 dengan data segar.
- [x] Setelah rounding quantity, hitung ulang semua batas; jangan mengandalkan floating point UI.
- [x] Preview memuat config versions, waktu, alasan, biaya model, equity basis; tidak mereservasi dana.
- [x] Siapkan operasi reservasi/release atomik yang akan dipakai paper engine; total risk tidak turun hanya karena harga naik.

## Pengujian dan kriteria selesai

- Golden test modal 500000 menghasilkan budget 2500 dan total 7500 sebelum perubahan equity; nominal entry mengikuti stop dan biaya, bukan selalu 2500.
- Biaya tetap melebihi budget, q nol, saldo kecil, dan reward net buruk ditolak dengan reason code spesifik.
- Pending bersamaan tidak bisa melampaui kas/risk; dua portfolio tidak berbagi batas harian.
- Batas harian tetap aktif setelah harga pulih/restart dan menunggu valuasi segar saat reset.
- Fungsi domain dapat diuji tanpa jaringan atau database; service persistensi diuji dengan SQLite temporary.

## Bukti pelaksanaan

- Commit/PR: belum ada.
- Typecheck/build dan 46 tes Vitest lulus. Golden fixture: quantityRaw 2049601, entryCost 33720.91681648, plannedLoss 2499.9996720096, budget 2500. Pengujian meliputi caps/rounding, biaya melebihi budget, target >30%, pending paralel, portfolio terpisah, preview tanpa reservation, daily latch dan reset UTC+7 dengan data segar.
- Fungsi Decimal murni terpisah dari service SQLite. Preview dapat memperbarui baseline/halt harian, tetapi tidak membuat reservation/fill/ledger. Risk awal tidak turun saat harga naik; valuasi stale memblokir entry.
