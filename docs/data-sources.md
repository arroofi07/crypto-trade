# Sumber data dan batas kelengkapan

## Verifikasi implementasi — 22 Oktober 2026
DEX Screener: [API resmi](https://docs.dexscreener.com/api/reference) mendokumentasikan `tokens/v1/solana/{mint,...}` (maksimal 30 alamat) dan `latest/dex/pairs/solana/{pool,...}`, limit 300 request/menit. Implementasi membatasi 30/menit dan dua request paralel; watchlist maksimal 40. Field yang digunakan: chainId, dexId, pairAddress, url, base/quote token, priceUsd, priceNative, liquidity (usd/base/quote), volume m5/h1/h6/h24, priceChange m5/h1/h6/h24, txns m5/h1/h6/h24 (buy/sell), fdv, marketCap, pairCreatedAt. Timestamp harga sumber tidak tersedia; `sourceAt=null` tetap ditampilkan sebagai keterbatasan, bukan waktu sumber buatan. Adapter hanya menerima pool Raydium, Orca, Meteora, dan PumpSwap dengan token base sesuai mint. Tidak melakukan live polling dalam suite tes.

[RPC publik Solana](https://solana.com/docs/references/clusters) (`https://api.mainnet-beta.solana.com`, atau `SOLANA_RPC_URL`) tidak menyediakan SLA dan kuotanya dapat berubah. Pemeriksaan keamanan memakai anggaran ~180 request/menit. Kegagalan RPC dicatat sebagai `UNKNOWN` beserta kode error, bukan bukti aman atau berbahaya.

Verifikasi RSS pada tanggal yang sama: `https://cointelegraph.com/rss` mengembalikan XML HTTP 200, namun [ketentuannya](https://cointelegraph.com/terms-and-privacy) membatasi pipeline konten otomatis. Endpoint CoinDesk `https://www.coindesk.com/arc/outboundfeeds/rss/` tidak berhasil diambil dari lingkungan ini. [CryptoSlate](https://cryptoslate.com/feeds/) mengizinkan pembacaan personal/nonkomersial dengan atribusi, tetapi `https://cryptoslate.com/feed/` mengembalikan HTTP 403. Karena belum ada feed yang memenuhi akses dan penggunaan sekaligus, allowlist produksi kosong; input link manual tersedia tanpa server fetch. Adapter RSS tetap diuji dengan fixture allowlist, maksimal tiga feed dan interval 15 menit. Tidak mengambil artikel lengkap, tidak menyimpan excerpt penerbit, tidak melewati pembatasan akses.

Decoder keamanan v1 mendukung base mint SPL/Token-2022, tanpa extension yang diizinkan. Vault LP diklasifikasi dari akun pool kanonik (offset DEX yang diketahui); sisanya dihitung holder. Jika vault tidak terbaca, rasio tetap ditampilkan sebagai proksi termasuk LP, status konsentrasi `UNKNOWN`. Tidak ada heuristik mengecualikan akun hanya karena besar.

## Provider awal
| Kebutuhan | Sumber | Penggunaan dan batas |
| --- | --- | --- |
| Pool/harga/likuiditas | DEX Screener API | Snapshot pool yang tersedia; tidak menjamin seluruh token atau trade individual |
| Discovery | Feed DEX Screener (boost, profil, ads, takeover) + meta trending + search | Rotasi cursor setiap 10 menit; maks ~500 kandidat aktif; bukan daftar seluruh chain |
| Mint/token authority | Solana RPC, token decoder | Pembacaan on-chain; public RPC terbatas dan bukan SLA produksi |
| Konsentrasi | Largest token accounts + supply RPC | Proksi konsentrasi akun, bukan bukti jumlah orang atau afiliasi wallet |
| Berita | RSS publik yang diverifikasi + link manual | Metadata dan kutipan pendek sesuai izin; cakupan terbatas |
| USD/IDR | Input manual pengguna | Wajib sebelum mulai paper portfolio; label kurs asumsi, bukan kurs live |

Tidak ada dependency ke subscription berbayar. Jika suatu kebutuhan tidak tersedia gratis, tampilkan keterbatasan dan blokir perilaku yang memerlukan datanya; jangan melakukan fallback diam-diam ke scraping atau layanan berbayar.

## Endpoint dan batas pengambilan
Gunakan dokumentasi [DEX Screener](https://docs.dexscreener.com/api/reference) sebagai acuan discovery: `token-boosts/*`, `token-profiles/*`, `ads/latest`, `community-takeovers/latest`, `metas/trending` + `metas/meta/v1/{slug}`, serta `latest/dex/search?q=…`, lalu `tokens/v1/solana/{mint,…}` untuk enrich mint dari feed (batch 30). Tidak ada endpoint “semua koin Solana”; cakupan = gabungan feed yang diekspos API publik. Job discovery ~10 menit memutar offset meta/search di `job_state.discovery-cursor`. Dokumentasi membedakan limit 60 dan 300 permintaan per menit; job discovery memakai HttpClient terpisah (budget 45/menit) di luar polling watchlist.

Default eksperimen:

- Maksimal 20 mint aktif; satu pool kanonik per mint, dipilih dari likuiditas USD terbesar di pool yang didukung.
- Refresh market setiap 30 detik, discovery setiap 10 menit, refresh pemilihan pool setiap 10 menit.
- Limit internal DEX Screener 30 request/menit; RPC 20 request/menit; maksimal 2 request paralel per provider. Gunakan batching ketika tersedia.
- RPC security saat kandidat masuk dan setiap 10 menit; entry membutuhkan pemeriksaan terakhir maksimal 10 menit.
- Berita maksimal 3 feed allowlist, refresh setiap 15 menit.
- Request timeout 10 detik; maksimal 3 percobaan total, exponential backoff dengan jitter, hormati Retry-After.
- Snapshot market stale jika umur observasi lokal >90 detik. Jika timestamp provider tersedia, evaluasi juga timestamp tersebut; waktu fetch baru tidak membuktikan data sumber baru.
- Prioritaskan posisi terbuka, lalu pending entry, lalu kandidat. Tunda discovery ketika anggaran habis.

Pastikan respons skema cocok. `null`, nilai tidak finite, desimal tidak valid, mint berbeda, pool berubah, dan field hilang tidak boleh diperlakukan sebagai nol yang sah.

## Seri harga dan keterbatasan indikator
Simpan snapshot 30 detik, bangun bar sampel 1 menit dari pengamatan yang benar-benar diterima. Bar ditandai `sampled`, bukan OHLC dari seluruh transaksi. Volume rolling 5 menit dari provider tidak boleh dijumlahkan menjadi volume candle karena jendelanya tumpang tindih.

Indikator strategi MVP memakai harga penutupan sampel. Tidak mengklaim mendeteksi high/low intramenit, semua wallet, order flow detail, atau wash trading secara pasti. Lightweight Charts tidak memberikan histori pasar secara otomatis.

Pool kanonik terkunci untuk episode sinyal/posisi. Pergantian pool pada watchlist memulai warm-up seri baru; jangan menyambung harga antar-pool tanpa provenance. Jika pool posisi hilang, tandai posisi tidak dapat dinilai; jangan mengarang harga exit.

## Keamanan token
Pemeriksaan wajib sebelum sinyal tradable: mint valid, program dikenali, decimals/supply valid, status mint/freeze authority, extension terdekode dan didukung, market cukup segar, dan histori cukup. Mint/freeze authority aktif menyebabkan penolakan pada MVP.

Token-2022 dengan transfer fee, permanent delegate, pembatasan/pausing transfer, transfer hook, atau extension yang belum didukung ditolak pada MVP. Daftar decoder/extension harus eksplisit dan diuji; extension tidak diketahui tidak diasumsikan aman.

Ambang awal konsentrasi: akun terbesar <=20% dan total 10 akun terbesar <=50% supply, setelah hanya mengecualikan akun pool/burn yang perannya terverifikasi. Jika klasifikasi atau denominator tidak dapat diverifikasi, hasil konsentrasi `UNKNOWN` dan entry diblokir. Filter ini konservatif dan berpotensi melewatkan peluang; bukan bukti tidak ada insider.

Kendali LP, lock/burn LP, hubungan wallet, rug pull, dan kemampuan menjual masa depan tidak dapat disimpulkan dari harga saja. Laporkan `UNKNOWN` atau bukti spesifik. Pemeriksaan MVP tidak diberi label audit keamanan menyeluruh. Likuiditas USD bukan kedalaman eksekusi untuk semua bentuk AMM.

## Berita
PR-005 memvalidasi feed resmi/penerbit yang memang menyediakan RSS publik, merekam URL sumber, status akses, dan tanggal verifikasi. Sebelum itu daftar feed kosong adalah konfigurasi valid, bukan berita palsu. Fitur link manual tetap tersedia.

Simpan judul, canonical URL, publisher, publishedAt jika tersedia, firstSeenAt, dan excerpt pendek yang diizinkan. Ringkasan awal memakai metadata/teks yang tersedia tanpa LLM. Jangan menyalin artikel penuh atau mengambil paywall.

Pencocokan alamat mint atau URL proyek terverifikasi lebih kuat daripada simbol. Simbol sama saja menghasilkan `UNVERIFIED_MATCH`, bukan katalis pasti. Berita umum Solana diberi label konteks pasar. Berita tidak menjadi trigger entry wajib pada MVP dan tidak boleh menutupi kegagalan keamanan.

## Retensi dan provenance
- Snapshot mentah market: 30 hari; bar sampel dan evidence yang dirujuk sinyal/posisi tetap dipertahankan.
- Security checks, sinyal, posisi, fill, equity, konfigurasi, dan audit: tidak dihapus otomatis dalam MVP.
- Log teknis: rotasi 14 hari dan redaksi rahasia. Payload penuh yang berisi rahasia tidak disimpan.
- Timestamp internal UTC; tampilkan zona UTC+7 sesuai pengaturan. Gunakan waktu observasi untuk simulasi, bukan waktu kejadian yang baru diketahui belakangan.

Referensi: [Solana RPC](https://solana.com/docs/rpc), [token extensions](https://solana.com/docs/tokens/extensions), [permanent delegate](https://solana.com/docs/tokens/extensions/permanent-delegate). Ketersediaan dan kuota provider perlu diverifikasi lagi saat integrasi.
