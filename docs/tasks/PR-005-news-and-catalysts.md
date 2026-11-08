# PR-005 — Berita bersumber dan pencocokan token

- Status: DONE
- Dependensi: PR-002
- Branch yang disarankan: `feat/news-context`
- Acuan: [sumber data](../data-sources.md), [API](../api-contracts.md), [kebutuhan produk](../product-requirements.md)

## Tujuan dan perilaku akhir

Detail token/sinyal dapat menunjukkan berita relevan dengan sumber dan waktu. Sistem membedakan bukti terkait token, kecocokan lemah, dan konteks pasar umum.

## Cakupan dan kontrak

Adapter RSS dengan allowlist maksimal 3 feed, news items/token links, GET/POST news, dan job 15 menit. Tidak memerlukan crawling X, grup privat, paywall, atau LLM. Daftar feed kosong tetap valid, dengan status yang jujur.

## Checklist implementasi

- [x] Verifikasi RSS penerbit yang benar-benar tersedia publik, aturan penggunaan, dan metadata; catat URL/tanggal di dokumen sumber data.
- [x] Jika tidak tersedia feed layak gratis, gunakan input link manual dan dokumentasikan keterbatasan; jangan mengarang integrasi.
- [x] Normalisasi canonical URL, deduplikasi, publisher, publishedAt nullable, firstSeenAt, dan excerpt yang diizinkan.
- [x] Implementasikan status EXACT_REFERENCE, UNVERIFIED_MATCH, MARKET_CONTEXT dengan aturan mint/URL resmi/simbol.
- [x] Sanitasi konten, escape HTML, batasi panjang teks, dan validasi URL http(s).
- [x] Batasi server fetching ke allowlist; link manual disimpan tanpa server fetch arbitrer.
- [x] Siapkan query berita token; absence berita bukan bukti ketiadaan risiko.
- [x] Tulis alasan ringkas berbasis metadata; jangan menyatakan dampak harga sebagai fakta.

## Pengujian dan kriteria selesai

- Artikel dengan simbol sama tetapi mint berbeda tidak menjadi katalis terverifikasi.
- Feed invalid/offline, publishedAt hilang, URL duplikat, dan konten script ditangani tanpa crash/XSS.
- Bukti yang baru ditemukan tidak muncul dalam replay sebelum firstSeenAt.
- News failure tidak memalsukan berita dan tidak membatalkan data market yang masih valid; tampilan menunjukkan cakupan terbatas.

## Bukti pelaksanaan

- Commit/PR: belum ada.
- Typecheck, build, dan 37 tes Vitest lulus. Berita manual tidak melakukan fetch, canonical dedupe, simbol sama tetap UNVERIFIED_MATCH, mint eksplisit RSS, firstSeenAt replay, missing publishedAt, script sanitization, URL non-http ditolak, XML/entity invalid dan allowlist RSS diuji.
- Feed produksi kosong sesuai fallback task. Verifikasi Cointelegraph/CoinDesk/CryptoSlate serta akses/ketentuan dicatat di data-sources.md; tidak ada bypass akses. Metadata manual tetap tersedia; ketiadaan berita bukan bukti ketiadaan risiko.
