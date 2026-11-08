# PR-011 — Jurnal, performa, dan evaluasi eksperimen

- Status: DONE
- Dependensi: PR-008, PR-009
- Branch yang disarankan: `feat/performance-journal`
- Acuan: [evaluasi strategi](../strategy-and-risk.md), [pengujian](../testing.md), [model data](../data-model.md)

## Tujuan dan perilaku akhir

Pengguna dapat menilai hasil bersih dan alasan keputusan, membandingkan simulasi otomatis/manual, serta melihat dampak data tidak lengkap. Hasil tidak dinilai hanya dari win rate.

## Cakupan dan kontrak

Performance API, jurnal UI, equity chart, CSV export, dan replay harness fixture/rekaman yang tersedia. Tidak mengklaim backtest menyeluruh semua token atau performa live trading.

## Checklist implementasi

- [x] Hitung net PnL dari ledger/fill, bukan perubahan harga mentah; biaya/slippage ditampilkan terpisah.
- [x] Implementasikan closed count, win/loss/breakeven, win rate net, avg win/loss, expectancy, profit factor, fees, hold time, dan drawdown.
- [x] Profit factor tanpa loss ditampilkan tidak terdefinisi/infinity dengan label, bukan angka sukses palsu; dataset kosong ditampilkan belum cukup data.
- [x] Pisahkan portfolio, periode, strategy/config version, dan FX assumption; jangan gabungkan dua modal virtual menjadi hasil satu akun.
- [x] Tampilkan jumlah sinyal, skip dan reason, pending, unpriced, serta coverage/gap.
- [x] Equity/drawdown hanya dihitung dari valuasi yang valid; celah data berarti drawdown selama gap tidak diketahui.
- [x] Detail trade menghubungkan sinyal, evidence saat keputusan, biaya, fill, dan alasan exit.
- [x] CSV ekspor mencakup quality/config IDs dan melindungi formula injection.
- [x] Buat replay dengan clock injectable; catat split periode train/tuning dan evaluasi tanpa look-ahead.
- [x] Tambahkan sensitivity runner untuk slippage/fee/delay yang ditetapkan; simpan run terpisah dari baseline.

## Pengujian dan kriteria selesai

- Dataset kecil hitung tangan menghasilkan metrik yang sama, termasuk contoh win rate tinggi tetapi net PnL negatif.
- Posisi terbuka tidak masuk denominator closed win rate; breakeven tetap dihitung sebagai closed non-win.
- Token hilang dan UNPRICED tetap terlihat; filter tidak menyembunyikan kegagalan tanpa label.
- Replay tidak membaca berita/snapshot sebelum waktu pertama diketahui dan tidak mengisi gap offline secara palsu.
- UI dan CSV cocok dengan ledger sumber; expectancy ditampilkan dalam satuan jelas, bukan probabilitas profit.

## Bukti pelaksanaan

- Commit/PR: implementasi lokal, tanpa repository Git/remote.
- Perintah dan hasil tes: 59 unit/integration test dan 5 Playwright test lulus; typecheck/build lulus. E2E mencakup jurnal dan download CSV.
- Keterbatasan/perubahan keputusan: replay memakai rekaman yang tersedia; train adalah warm-up dengan parameter beku, bukan tuning otomatis atau backtest seluruh universe. Delay dibulatkan ke event berikutnya; fixed fee 2x sesuai spesifikasi.
