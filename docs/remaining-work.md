# Kekurangan implementasi dan pekerjaan lanjutan

Tanggal tinjauan: 2026-10-22. Dasar: inspeksi kode lokal, dokumen task, dan bukti pengujian yang sudah dicatat. Dokumen ini tidak menjalankan pengujian provider atau pengiriman Telegram nyata.

**Aplikasi sudah memiliki alur simulasi yang diuji dengan fixture, tetapi alur sinyal dari data pasar nyata masih terhalang klasifikasi keamanan akun.** Status DONE pada PR-001 sampai PR-012 mencatat penyelesaian implementasi lokal beserta fallback; status itu tidak berarti seluruh integrasi aktif, semua kekurangan tertutup, atau strategi terbukti profitable. Khusus PR-004, penghitungan konsentrasi terverifikasi baru terbukti melalui adapter fixture, belum melalui adapter RPC produksi.

Temuan perilaku di bawah berasal dari inspeksi statis. Kasus regresi yang diusulkan belum ditambahkan pada tinjauan dokumentasi ini. Angka 63 unit/integration test dan 5 Playwright test merupakan hasil validasi sebelumnya, bukan hasil pengujian ulang pada tinjauan ini.

## Daftar prioritas

P0 = menghalangi fungsi inti dari data nyata. P1 = perlu diselesaikan sebelum hasil/notifikasi dipakai untuk evaluasi rutin. P2 = kelengkapan penggunaan dan operasional. Prioritas ini merupakan urutan usulan, bukan jadwal atau izin aktivasi layanan eksternal.

| ID | Prioritas | Kekurangan | Status | Task terkait |
| --- | --- | --- | --- | --- |
| GAP-01 | P0 | Klasifikasi holder/pool/burn produksi belum tersedia | Terverifikasi di kode | PR-004, PR-006 |
| GAP-02 | P1 | Pesan sinyal Telegram yang sudah disiapkan tidak memeriksa ulang invalidasi | Teridentifikasi melalui inspeksi | PR-010 |
| GAP-03 | P1 | Retry-After Telegram belum membatasi seluruh antrean tujuan | Teridentifikasi melalui inspeksi | PR-010 |
| GAP-04 | P1 | Filter periode ringkasan, detail trade, dan CSV belum konsisten | Teridentifikasi melalui inspeksi | PR-011 |
| GAP-05 | P1 | Belum ada ekspor rekaman runtime ke format replay | Belum diimplementasikan | PR-011 |
| GAP-06 | P1 | Belum ada bukti pengamatan pasar berkelanjutan dan evaluasi strategi nyata | Belum tervalidasi dalam bukti proyek | PR-003, PR-006–PR-012 |
| GAP-07 | P2 | Berita otomatis belum memiliki feed aktif | Fallback manual aktif | PR-005 |
| GAP-08 | P2 | Pengelolaan outbox dan navigasi Telegram masih terbatas | Belum lengkap | PR-009, PR-010 |
| GAP-09 | P2 | Pembacaan histori dan pertumbuhan database belum diuji pada volume besar | Risiko skala dari inspeksi | PR-003, PR-009, PR-011, PR-012 |
| GAP-10 | P2 | Validasi mesin Windows baru, kegagalan operasi, dan CI belum lengkap | Belum tervalidasi/tersedia | PR-001, PR-012 |

## GAP-01 — Klasifikasi keamanan produksi

**Kondisi:** [SolanaAdapter.inspect](../apps/server/src/adapters/solana.ts) memverifikasi program, mint, dan amount, tetapi menambahkan setiap akun terbesar sebagai `role: 'UNKNOWN', verified: false`. [evaluateSecurity](../packages/domain/src/security.ts) memerlukan klasifikasi seluruh akun yang dipakai dalam bukti. Jika pemeriksaan lain lolos, konsentrasi tetap UNKNOWN; bila pemeriksaan lain gagal, hasil dapat menjadi FAIL. Adapter produksi saat ini tidak memiliki jalur untuk menghasilkan PASS.

**Dampak:** bukan sekadar sesekali ada token yang gagal. Semua kandidat dari adapter produksi terhalang gate keamanan untuk penerbitan sinyal eligible/entry. Menambah mint dan menunggu 60 bar tidak menyelesaikan penghalang ini. PASS dalam fixture tidak boleh digunakan sebagai bukti kesiapan integrasi produksi.

**Pekerjaan:** tentukan protokol/pool yang didukung, tambahkan decoder serta pembuktian hubungan vault/pool/mint dan klasifikasi burn/holder dengan provenance. Akun yang belum terbukti tetap UNKNOWN. Periksa konsistensi slot dari beberapa pembacaan RPC; jangan menyelesaikan masalah dengan menganggap seluruh akun sebagai holder atau mengecualikan akun besar berdasarkan saldo.

**Kriteria selesai:** tersedia rekaman respons nyata yang dapat diuji offline untuk klasifikasi yang didukung, fixture negatif untuk vault palsu/mint mismatch/bukti tidak konsisten, dan demonstrasi terbatas bahwa adapter produksi dapat menghasilkan PASS atau FAIL yang beralasan. Entry UNKNOWN tetap ditolak. Klaim kemampuan dan checklist [PR-004](tasks/PR-004-token-security-checks.md) harus diselaraskan dengan bukti tersebut.

Allowlist extension Token-2022 saat ini kosong. Mendukung extension tambahan adalah pekerjaan terpisah setelah decoder dan dampaknya ditinjau; mengizinkan semuanya bukan solusi GAP-01. Bukti lock LP dan afiliasi wallet juga tetap tidak tersedia.

## GAP-02 — Validasi ulang pesan sinyal sebelum pengiriman

**Kondisi:** [TelegramService](../apps/server/src/modules/telegram.ts) menyimpan hasil `/signals` sebagai `payload.message`. Pada `deliver()`, pesan ini diperiksa berdasarkan `expiresAt`, tetapi tidak dihubungkan kembali ke state sinyal untuk memeriksa INVALIDATED. Sebaliknya, event `signal.created` yang belum dirender mengambil sinyal terbaru.

**Contoh pemicu:** pengguna meminta `/signals`, pesan masih mengantre, kemudian keamanan berubah menjadi FAIL sebelum expiry. Pesan yang sudah disiapkan masih dapat dikirim sebagai kesempatan entry. Callback tetap melewati gate domain, sehingga temuan ini menyangkut informasi yang menyesatkan, bukan bukti bypass order.

**Pekerjaan dan kriteria selesai:** simpan referensi sinyal/versi dalam pesan antrean; periksa ulang state, expiry, dan kelayakan tombol sebelum setiap send/retry. Tambahkan regresi untuk security FAIL, stale market, dan invalidasi tren setelah enqueue. Pesan dibuang atau diubah menjadi status akhir, tanpa tombol entry yang sudah tidak berlaku.

## GAP-03 — Backoff Telegram pada seluruh antrean

**Kondisi:** [deliver()](../apps/server/src/modules/telegram.ts) memperbarui `nextAttemptAt` hanya pada row yang mendapat 429 lalu keluar dari batch. Job Telegram dijadwalkan setiap satu detik dalam [Services](../apps/server/src/modules/services.ts). Row lain yang sudah due dapat dikirim pada tick berikutnya meskipun masa Retry-After tujuan belum selesai.

**Dampak:** retry row pertama menghormati waktunya sendiri, tetapi pembatasan belum melindungi keseluruhan antrean bot/chat. Backlog dapat terus memicu penolakan.

**Pekerjaan dan kriteria selesai:** simpan batas waktu pengiriman berikutnya per cakupan tujuan yang sesuai dan terapkan pada seluruh batch, termasuk setelah restart. Uji dua atau lebih pesan: setelah send pertama mendapat 429, tidak ada send berikutnya sebelum batas berakhir. Timeout ambigu tetap DELIVERY_UNKNOWN dan tidak di-retry otomatis.

## GAP-04 — Konsistensi periode laporan

**Kondisi:** [PerformanceService](../apps/server/src/modules/performance.ts) menyaring `metrics.feesIdr` berdasarkan waktu fill dalam periode, tetapi `csv()` menjumlahkan seluruh fill pada trade yang dipilih. Detail trade juga mengambil state posisi, fill, dan ledger terkini tanpa membatasi semuanya ke `to`.

**Contoh pemicu:** entry sebelum `from`, exit di dalam periode. Ringkasan biaya mencakup exit saja, sedangkan kolom biaya CSV mencakup entry dan exit. Jika `to` berada sebelum exit, net PnL laporan dapat null tetapi detail masih menunjukkan posisi CLOSED beserta fill setelah `to`.

Coverage gap juga mengambil seluruh `data_gaps` yang tumpang tindih dengan periode, tanpa pembatasan pool terkait portfolio. Keputusan dengan `portfolioId: null` adalah keputusan kandidat global. Konteks global ini belum dipisahkan secara eksplisit dari coverage portfolio dalam struktur hasil.

**Pekerjaan:** tetapkan kontrak yang membedakan metrik periode, total sepanjang trade, kondisi saat ini, dan rekonstruksi kondisi pada `to`. Selaraskan nama kolom CSV dan UI. Pisahkan coverage global dari coverage portfolio; jangan menggabungkan modal strategy/manual.

**Kriteria selesai:** dataset lintas batas periode membuktikan biaya UI/CSV sesuai definisi, detail tidak menampilkan data setelah `to` tanpa label yang jelas, serta gap pool lain tidak keliru dianggap gap valuasi portfolio. Tambahkan regresi entry sebelum periode, exit sesudah periode, posisi UNPRICED, dan dua portfolio.

## GAP-05 — Rekaman runtime untuk replay

**Kondisi:** [replay.ts](../apps/server/src/replay.ts) menerima JSON `recordingSchema`, sementara [scripts/replay.ts](../scripts/replay.ts) membaca file tersebut dan menyimpan tujuh hasil sensitivitas. Belum ada command yang mengekspor database runtime menjadi recording yang dapat langsung dikonsumsi. Format market replay memakai pasangan DEX yang tidak identik dengan DTO snapshot tersimpan.

**Dampak:** harness tersedia, tetapi pengguna perlu merakit rekaman sendiri. Contoh fixture tidak menggantikan dataset hasil observasi. Penetapan `firstSeenAt` secara manual dapat memperkenalkan informasi masa depan.

**Pekerjaan dan kriteria selesai:** sediakan exporter dengan manifest sumber, periode, hash, config, waktu pertama diketahui, dan label gap. Petakan pool/snapshot/security/news tanpa mengarang field yang tidak tersimpan. Uji round-trip database sementara → recording → replay; berita/security tidak tersedia sebelum diketahui, dan data yang hilang tetap hilang. Eksport harus menjaga baseline dan menyatakan keterbatasan retensi snapshot.

## GAP-06 — Validasi observasi berkelanjutan dan strategi

**Kondisi:** bukti di [testing.md](testing.md) mencakup fixture/mock, recovery, dan browser lokal. Belum ada laporan pengamatan multi-hari pada provider nyata, bukti reliabilitas pada watchlist penuh, atau hasil evaluasi out-of-sample strategi dari data yang dikumpulkan ke depan. Pengiriman Telegram nyata juga belum diuji.

**Pekerjaan:** setelah GAP-01 ditangani, kumpulkan observasi dengan konfigurasi dibekukan dan catat uptime, latensi, 429/timeout, gap, security UNKNOWN/FAIL, skip, serta token yang hilang. Evaluasi net PnL, expectancy, biaya, drawdown teramati dan ketidakpastian selama gap; jangan hanya menilai win rate. Pisahkan masa penyetelan dari evaluasi berikutnya. Durasi dan cakupan percobaan perlu ditetapkan sebelum pengumpulan.

**Kriteria selesai:** tersedia manifest dataset dan laporan yang dapat direproduksi melalui replay, termasuk hasil buruk/ketidaklengkapan. Tidak ada ambang jumlah trade atau win rate yang otomatis membuktikan profitabilitas. Pengujian pengiriman bot nyata hanya dilakukan setelah instruksi eksplisit pengguna dengan tujuan yang ditetapkan; pembuatan dokumen ini tidak mengaktifkannya.

## GAP-07 — Berita otomatis

**Kondisi:** `approvedFeeds` pada [adapter RSS](../apps/server/src/adapters/rss.ts) masih kosong. Parser, sanitizer, dedupe, dan job tersedia; input link manual berfungsi. Ini fallback yang memang diizinkan PR-005, tetapi belum memenuhi pengalaman berita otomatis.

**Pekerjaan dan kriteria selesai:** verifikasi ulang akses serta ketentuan penggunaan penerbit ketika integrasi akan diaktifkan, pilih feed yang sesuai, dokumentasikan metadata yang boleh disimpan, lalu uji outage, duplikasi, timestamp hilang, dan pencocokan mint/simbol. UI/health perlu menampilkan jumlah feed aktif dan kesegaran pengambilan agar job tanpa feed tidak disalahartikan sebagai cakupan berita sehat. Bukti lama di [data-sources.md](data-sources.md) bukan jaminan ketersediaan feed saat ini.

## GAP-08 — Pengelolaan outbox dan navigasi Telegram

**Kondisi:** health dapat menunjukkan `delivery_unknown`, tetapi belum ada halaman/API untuk meninjau dan merekonsiliasi pesan tersebut. Satu row UNKNOWN historis dapat mempertahankan indikator agregat. `externalMessageId` disimpan, namun belum dipakai untuk edit/update pesan. `/signals` memilih satu sinyal valid terbaru; `/positions` membatasi sepuluh posisi tanpa navigasi halaman. Portfolio manual dipilih otomatis oleh service, belum dapat dipilih melalui bot.

**Pekerjaan dan kriteria selesai:** tampilkan daftar kegagalan, umur antrean, status penyelesaian yang diaudit, dan pemisahan antara mengakui status versus mengirim ulang. Jangan membuat tombol retry buta untuk delivery ambigu. Tambahkan navigasi sinyal/posisi dan identitas portfolio yang eksplisit pada aksi bot. Uji beberapa eksperimen serta backlog; tindakan domain tetap idempotent.

## GAP-09 — Histori besar dan retensi

**Kondisi:** helper [api.ts](../apps/web/src/api.ts) mengikuti seluruh cursor secara otomatis. Backend [performance.ts](../apps/server/src/modules/performance.ts) memuat histori dan evidence utuh; [market.ts](../apps/server/src/modules/market.ts) memeriksa bar lampau dalam `closeBars()`. Banyak query membaca JSON seluruh row sebelum memfilter. Retensi dalam [operations.ts](../apps/server/src/db/operations.ts) melindungi snapshot referensi, tetapi belum ada kebijakan arsip untuk pertumbuhan bar, keputusan, equity, outbox, atau callback.

**Dampak:** pagination endpoint belum membatasi total pekerjaan satu refresh dashboard. RAM, ukuran respons, waktu query dan backup dapat meningkat seiring histori. Besar dampak belum diukur; ini bukan klaim bahwa beban sekarang sudah gagal.

**Pekerjaan dan kriteria selesai:** ukur data representatif untuk 20 mint dengan histori panjang, tentukan anggaran latensi/RAM bersama target mesin, lalu batasi pembacaan/render dan gunakan query terindeks atau agregasi. Pisahkan evidence detail dari daftar. Definisikan arsip/retensi dengan perlindungan ledger, config, dan evidence audit. Uji bahwa optimasi tidak mengubah metrik atau menghapus data yang masih dirujuk.

## GAP-10 — Validasi operasi dan pengiriman perangkat lunak

**Kondisi:** launcher, restore dan konflik writer sudah diuji lokal; belum ada bukti instalasi menyeluruh pada Windows baru tanpa runtime portable/cache. Tidak ada workflow `.github` dalam workspace yang ditinjau dan belum ada repository Git/remote menurut dokumentasi. Pengujian deterministik belum membuktikan perilaku saat disk penuh, izin folder berubah, backup besar terputus, atau laptop benar-benar sleep/resume.

**Pekerjaan dan kriteria selesai:** jalankan panduan setup pada mesin bersih dan catat hasil; tambah pengujian kegagalan I/O dan interupsi operasi; ukur waktu shutdown/backup pada database besar. Siapkan CI Windows untuk lint/typecheck/unit/build/E2E ketika repository ditetapkan. Pembuatan/push repository atau publikasi build adalah tindakan terpisah dari dokumen ini. Restore harus tetap offline dan menjaga backup sebelum penggantian.

## Urutan tindak lanjut

1. Tangani GAP-01 dan tambahkan bukti kemampuan adapter produksi. Pertahankan gate UNKNOWN.
2. Perbaiki GAP-02, GAP-03, dan GAP-04 dengan regresi yang menunjukkan kasus pemicu sebelum perbaikan.
3. Sediakan exporter GAP-05, lalu rencanakan dan jalankan evaluasi GAP-06 dalam cakupan yang disepakati.
4. Lengkapi GAP-07/GAP-08 sesuai kebutuhan pemakaian, lalu ukur dan tangani GAP-09/GAP-10 sebelum penggunaan berkelanjutan diperluas.

Setiap gap ditutup hanya setelah bukti kode, tes, dan batas keputusan diperbarui. Daftar ini belum membuat task PR baru atau mengimplementasikan perubahan aplikasi.

## Batas scope yang tetap disengaja

Transaksi uang nyata, wallet signing/private key, leverage, public hosting/dashboard jarak jauh, pengawasan saat PC mati, layanan berbayar, serta model AI berbayar tetap di luar MVP. Daftar kekurangan ini bukan permintaan menambah fitur-fitur tersebut. Harga sampel bukan quote executable; model slippage/fee tetap asumsi simulasi, sekalipun semua gap teknis di atas sudah ditutup.
