# Kebutuhan produk

## Masalah dan hasil yang dituju

Pengguna membutuhkan daftar kandidat memecoin beserta alasan, berita, perkiraan horizon, saran alokasi, dan rencana keluar. Sistem membantu menilai keputusan melalui simulasi yang dapat diaudit. Win rate tinggi harus dinilai bersama profit setelah biaya dan besar kerugian; tidak ada target kemenangan atau keuntungan yang dijamin.

## Pengguna dan batas operasi

- Satu pengguna, Windows, dashboard di browser PC yang sama.
- Telegram merupakan kanal notifikasi dan perintah simulasi, bukan terminal transaksi nyata.
- Sistem tidak memantau ketika PC/aplikasi berhenti. Periode tersebut ditampilkan sebagai celah data.
- Anggaran langganan awal Rp0. Gunakan kapasitas API gratis yang benar-benar tersedia; jangan mengaktifkan paket berbayar otomatis.
- Modal virtual Rp500.000 per portofolio; saldo antara portofolio eksperimen tidak dijumlahkan sebagai satu modal nyata.
- Tampilan IDR; harga sumber umumnya USD. Kurs konversi dimasukkan pengguna sebelum simulasi dimulai, diberi waktu, dan dibekukan per portofolio eksperimen.

## Fitur MVP

### Kandidat dan sinyal

- Watchlist maksimal 20 mint Solana; pengguna dapat menambah alamat mint. Discovery terbatas dari API publik memperkaya daftar, bukan pemindaian seluruh chain.
- Identitas utama mint + chain; simbol tidak cukup untuk membedakan token.
- Filter usia pool, likuiditas, kesegaran data, keamanan token, dan kelengkapan histori.
- Sinyal berisi waktu, area entry, batas berlaku, alasan kuantitatif, kondisi pembatalan, skenario bersyarat, horizon, risiko, dan sumber berita.
- Tidak ada kewajiban mengeluarkan sinyal setiap hari. `WATCH`, `BLOCKED`, atau tidak ada kandidat adalah hasil yang sah.
- Saran nominal bersifat spesifik terhadap portofolio dan harus dihitung ulang saat tombol simulasi ditekan.

### Paper trading

- Portofolio `strategy`: simulasi otomatis seluruh sinyal valid yang lolos batas risiko, berurutan deterministik.
- Portofolio `manual`: simulasi pilihan pengguna dari dashboard atau Telegram.
- Masing-masing mulai dari Rp500.000 dengan batas risiko sendiri; tampilkan terpisah.
- Catat sinyal tidak diambil beserta alasan, termasuk risiko penuh, data stale, dan sinyal kedaluwarsa.
- Entry memakai pengamatan sesudah permintaan dan asumsi biaya terdokumentasi, bukan harga historis saat sinyal pertama terbit.
- Sebut seluruh hasil sebagai simulasi berbasis model biaya. Jangan menampilkan simulated fill sebagai transaksi on-chain atau quote yang dapat dieksekusi.

### Dashboard dan Telegram

- Halaman: ringkasan, daftar/detail token dan sinyal, posisi, jurnal/performa, pengaturan, kesehatan data.
- Telegram: sinyal baru, pembatalan, posisi masuk/keluar, batas risiko harian, dan gangguan penting dengan deduplikasi.
- Tombol: detail, simulasikan masuk, lihat posisi, dan tutup simulasi dengan konfirmasi.
- Tautan localhost hanya bisa dibuka pada PC tempat aplikasi berjalan. Di HP, Telegram menampilkan ringkasan teks dan ID sinyal; dashboard HP/jarak jauh di luar MVP.
- Berita selalu menampilkan sumber, tanggal publikasi, waktu ditemukan, dan kepastian pencocokan token.

## Kartu sinyal minimum

| Kelompok | Isi |
| --- | --- |
| Identitas | Mint, chain, nama/simbol, pool, sumber |
| Keputusan | Pantau, valid, batal, kedaluwarsa, atau diblokir beserta alasan |
| Entry | Rentang, masa berlaku, waktu data terakhir |
| Skenario | Naik/mendatar/turun berupa kondisi; tanpa persentase peluang yang belum terkalibrasi |
| Hold/exit | Horizon maksimum, stop terencana, target, pembatalan tesis |
| Nominal | Estimasi posisi per portofolio, biaya, risiko terencana |
| Bukti | Indikator, keamanan, likuiditas, kualitas data |
| Konteks | Berita relevan atau label tidak ada berita terverifikasi |

## Kriteria penerimaan produk

1. Pengguna dapat menjalankan dashboard lokal, memasukkan kurs dan watchlist, serta melihat status warm-up.
2. Fixture pasar yang valid menghasilkan sinyal yang sama di API, dashboard, dan pesan Telegram mock.
3. Entry manual tidak memakai harga lama; klik ganda tidak membuka dua posisi.
4. Nominal, risiko, dan PnL bersih dapat dilacak sampai data serta konfigurasi asal.
5. Batas risiko memblokir entry baru, tetapi tidak menghentikan pemantauan posisi lama.
6. Restart tidak menggandakan posisi/pesan; celah pemantauan tidak menghasilkan transaksi rekaan.
7. Token atau API bermasalah menghasilkan status yang jujur, bukan label aman atau profit palsu.

## Di luar MVP

Sniping token launching, CEX/multi-chain, sentimen X berbayar, crawling grup privat, deteksi seluruh wallet terafiliasi, audit smart contract menyeluruh, historical backtest semua token, ML/LLM prediksi, integrasi wallet, dan trading nyata.
