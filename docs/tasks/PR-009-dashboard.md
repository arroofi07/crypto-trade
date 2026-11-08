# PR-009 — Dashboard lokal dan alur simulasi

- Status: DONE
- Dependensi: PR-005, PR-008
- Branch yang disarankan: `feat/local-dashboard`
- Acuan: [produk](../product-requirements.md), [API](../api-contracts.md), [arsitektur](../architecture.md)

## Tujuan dan perilaku akhir

Pengguna dapat membaca sinyal, bukti, berita, dan risiko; menjalankan simulasi manual; serta memantau posisi dari browser PC. UI mengikuti state server dan tidak memberi kesan bahwa data stale masih live.

## Cakupan dan kontrak

Halaman ringkasan, watchlist, detail token/sinyal, posisi, pengaturan eksperimen, dan kesehatan sistem. Jurnal/performa lengkap pada PR-011. Dashboard produksi hanya loopback; mobile remote/public hosting tidak termasuk.

## Checklist implementasi

- [x] Buat navigasi dan komponen loading/empty/error/stale/warm-up yang konsisten dalam Bahasa Indonesia.
- [x] Implementasikan pemilihan portfolio dengan label strategy/manual dan modal terpisah.
- [x] Tampilkan mint/alamat yang dapat disalin, pool, waktu observasi, security evidence, alasan, berita, entry range, dan masa berlaku.
- [x] Tampilkan skenario kondisional dan batas hold; hindari persentase profit yang tidak terkalibrasi.
- [x] Preview sizing lewat server dan tampilkan biaya model/risiko; submit entry memakai idempotency key dan status pending.
- [x] Posisi menampilkan stop/target/waktu, harga stale, UNPRICED, dan aksi exit dengan konfirmasi.
- [x] Integrasikan Lightweight Charts dengan atribusi; sample chart diberi label dan gap tidak disambung seolah data lengkap.
- [x] SSE menginvalidasi data; reconnect mengambil REST snapshot dan mempertahankan indikasi stale hingga data valid.
- [x] Input pengaturan/FX/watchlist memiliki validasi; perubahan eksperimen tidak mengubah histori.
- [x] Jaga keyboard navigation, fokus dialog, kontras, dan identitas status selain warna.
- [x] Jangan mengirim secret server ke bundle, DOM, atau network response.

## Pengujian dan kriteria selesai

- Playwright membuktikan onboarding FX, sinyal fixture, preview, entry, pending/fill, dan exit.
- Expired/stale/blocked entry dinonaktifkan UI dan tetap ditolak server bila dipaksa.
- Double click tidak menambah posisi; reconnect menampilkan state terbaru tanpa refresh manual.
- Berita berbahaya tidak mengeksekusi script; token panjang dan empty state tidak merusak layout.
- Build produksi disajikan Fastify pada alamat lokal yang didokumentasikan.

## Bukti pelaksanaan

- Commit/PR: implementasi lokal; workspace tidak memiliki repository Git/remote.
- Perintah dan hasil tes: typecheck/build lulus; 55 unit/integration test dan 5 Playwright test lulus. Telegram memakai mock, tanpa live send.
- Keterbatasan/perubahan keputusan: Telegram opt-in melalui environment; tanpa konfigurasi tetap nonaktif. Dashboard mengikuti state domain dan membatasi entry saat stream terputus.
