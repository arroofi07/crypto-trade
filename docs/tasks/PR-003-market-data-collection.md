# PR-003 — Watchlist dan pengumpulan data pasar

- Status: DONE
- Dependensi: PR-002
- Branch yang disarankan: `feat/market-data`
- Acuan: [sumber data](../data-sources.md), [model data](../data-model.md), [API](../api-contracts.md)

## Tujuan dan perilaku akhir

Sistem mengumpulkan observasi pasar untuk watchlist terbatas, memperlihatkan kesegaran data, dan membangun seri sampel yang bisa dipakai strategi tanpa mengklaim histori lengkap.

## Cakupan dan kontrak

Implementasikan adapter DEX Screener, watchlist endpoints, token/series reads, market snapshots, sample bars, scheduler, dan health provider. Discovery hanya terbatas; tidak membangun indexer seluruh chain. Tidak ada entry trading pada PR ini.

## Checklist implementasi

- [x] Verifikasi endpoint/kuota gratis dari dokumentasi resmi; simpan tanggal verifikasi dan field yang tersedia.
- [x] Validasi mint, chain, schema, harga, likuiditas, usia pool, dan timestamp sebelum persistensi.
- [x] Terapkan maksimal 20 mint, batch yang didukung, polling 30 detik, dan budget request internal.
- [x] Pilih pool likuiditas terbesar yang didukung, simpan provenance, dan restart warm-up ketika pool berubah.
- [x] Kunci pool episode sinyal/posisi; watchlist delete tidak mematikan monitoring posisi.
- [x] Bangun bar sampel 1 menit, label sampled, sample count, complete flag, serta data gap.
- [x] Jangan menjumlahkan rolling volume provider untuk menciptakan volume candle.
- [x] Terapkan timeout, Retry-After, backoff, non-overlap job, prioritas posisi terbuka, dan checkpoint.
- [x] Health menampilkan stale/unavailable, last success, error code, dan keterbatasan source timestamp.
- [x] Simpan evidence yang dirujuk domain sebelum retensi snapshot berjalan.

## Pengujian dan kriteria selesai

- Fixture normal menghasilkan snapshot/bar benar tanpa memakai bar yang belum tertutup.
- Kasus 429, timeout, null, pool/mint mismatch, harga invalid, dan pergantian pool tidak menghasilkan data valid palsu.
- Umur data >90 detik menjadi stale; kehilangan observasi menghasilkan gap dan warm-up baru.
- Job overlap tidak melampaui concurrency/budget; retry tidak menduplikasi snapshot logis.
- Endpoint series memperlihatkan gap, bukan garis/candle yang diam-diam mengisi periode kosong.

## Bukti pelaksanaan

- Commit/PR: belum ada.
- Typecheck dan 32 tes Vitest lulus: snapshot/bar deterministik, dedupe, gap/stale, pergantian pool, monitoring episode terkunci, invalid schema, Retry-After, timeout, budget, non-overlap, dan checkpoint. Build runtime/UI lulus.
- Verifikasi endpoint/kuota resmi 22 Oktober 2026 tercatat di data-sources.md. Timestamp harga sumber tidak tersedia; sourceAt tetap null. Tidak ada live polling selama tes. Discovery dibatasi input watchlist; bukan indeks seluruh chain.
