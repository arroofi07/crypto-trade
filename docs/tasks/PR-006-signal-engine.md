# PR-006 — Mesin sinyal momentum setelah pullback

- Status: DONE
- Dependensi: PR-003, PR-004, PR-005
- Branch yang disarankan: `feat/signal-engine`
- Acuan: [strategi](../strategy-and-risk.md), [API](../api-contracts.md), [model data](../data-model.md)

## Tujuan dan perilaku akhir

Data yang memenuhi syarat menghasilkan sinyal berskenario yang dapat dijelaskan. Keputusan menunggu/menolak tercatat; sistem tidak memaksakan sinyal harian atau memberi probabilitas profit rekaan.

## Cakupan dan kontrak

Fungsi domain deterministik untuk filter, EMA, pullback, entry range, stop, expiry, cooldown, dan invalidation. Expose signals list/detail dan event sinyal. Sizing per portfolio dimiliki PR-007; fill dimiliki PR-008.

## Checklist implementasi

- [x] Implementasikan seluruh threshold dan seed indikator persis sesuai versi strategi di dokumen acuan.
- [x] Pakai hanya bar selesai dan data yang sudah diketahui saat evaluasi; warm-up/gap tidak dilewati.
- [x] Pisahkan candidate state dari signal state; simpan alasan gagal setiap gate.
- [x] Batasi satu sinyal valid per mint, expiry 120 detik, cooldown 30 menit.
- [x] Buat entry range, stop, horizon, tiga skenario bersyarat, dan alasan berbasis angka.
- [x] Lampirkan evidence immutable, security status/waktu, pool, source snapshots, dan news yang tersedia saat itu.
- [x] Terapkan invalidation jika filter wajib tidak lagi terpenuhi; expired/invalidated tidak kembali VALID tanpa sinyal baru.
- [x] Simpan domain events dan version/hash konfigurasi; deduplikasi evaluasi ulang bar yang sama.
- [x] DTO tidak memiliki field probability atau nominal universal yang bisa disalahartikan.

## Pengujian dan kriteria selesai

- Fixture positif menghasilkan satu sinyal pada bar yang ditentukan; rerun menghasilkan ID/state yang sama atau dedupe yang konsisten.
- Data masa depan, bar parsial, security UNKNOWN, stale price, cooldown, dan stop distance di luar batas mencegah sinyal.
- Expiry tepat batas timestamp dan invalidation mengubah API/event dengan alasan yang sesuai.
- Replay input/version identik menghasilkan keputusan identik; tidak ada API eksternal dalam fungsi strategi murni.

## Bukti pelaksanaan

- Commit/PR: belum ada.
- Typecheck/build lulus; 41 tes Vitest lulus. Fixture 60 bar menghasilkan satu sinyal deterministik, dedupe bar sama, EMA SMA seed, 59 bar/future/partial/gap, recovery, stale/UNKNOWN, cooldown, expiry tepat batas, dan invalidation terminal diuji.
- Signal menyimpan salinan snapshot, bar, pool, security, indikator serta versi/hash config dan newsIds yang sudah diketahui. Keputusan SKIP dicatat per bar; outbox domain/Telegram ditulis atomik. Tidak ada probability atau nominal universal. Sinyal live tetap diblokir bila security belum terbukti.
