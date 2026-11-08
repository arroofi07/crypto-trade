# Rencana pengujian

## Prinsip

Gunakan fixture deterministik, clock yang dapat diinjeksi, serta adapter mock. CI/test rutin tidak bergantung pada API berbayar, akses jaringan, token Telegram, atau private key. Integrasi jaringan opsional dipisahkan dari suite rutin.
Perubahan dokumentasi diperiksa tautan, struktur task, dan konsistensi nilai. Bukti validasi implementasi terakhir ada di bagian hasil di bawah.

## Unit domain (Vitest)
| Area | Kasus wajib |
| --- | --- |
| Strategi | Warm-up 59/60 bar, seed EMA, bar belum selesai, pullback tepat pada batas, tanpa recovery, cooldown, expired tepat pada timestamp |
| Keamanan | Authority aktif, mint invalid, extension tidak dikenal, supply nol, konsentrasi unknown, akun pool yang belum terverifikasi |
| Sizing | Modal 500000, budget 2500, cap alokasi/likuiditas/kas, biaya terlalu besar, quantity dibulatkan turun, quantity nol |
| Risiko | Pending ikut dihitung, posisi UNPRICED, satu mint per portfolio, batas 3 posisi, daily halt latch, reset UTC+7 dan restart |
| Fill/PnL | Entry snapshot berikutnya, adverse slippage dua sisi, fee tetap dua sisi, target berdasarkan fill, loss melewati stop akibat gap |
| Exit | Stop/target/tren/waktu/security; prioritas alasan; data hilang tidak menciptakan fill |
| Metrik | Net win/loss/breakeven, denominator tertutup, profit factor tanpa loss, drawdown dengan gap |
| Berita | Simbol tabrakan, canonical URL duplikat, waktu publikasi tidak ada, konten HTML berbahaya |

Golden fixture sizing memuat perhitungan tangan dengan Decimal dan fee, bukan sekadar menyalin fungsi implementasi. Gunakan contoh quantity/entryCost/plannedLoss/target dari dokumen strategi sebagai fixture positif; tambahkan kasus target perlu kenaikan >30% yang harus ditolak. Properti tambahan: kas tidak negatif, total ledger cocok saldo, round-down tidak melanggar budget, permintaan idempotent tidak menggandakan fill.

## Integrasi
- SQLite temporary database: migrasi database kosong, rerun tanpa perubahan, rollback kegagalan transaksi, foreign keys, dan backup/restore.
- Dua request entry bersamaan tidak melampaui kas atau risiko. Auto/manual tetap portofolio terpisah.
- Adapter: timeout, 429 + Retry-After, respons malformed/null, mint mismatch, pool berubah, data source lebih tua dari waktu fetch.
- Scheduler: tidak overlap, restart dari checkpoint, prioritas posisi terbuka, kuota provider, dan tidak backfill sinyal offline.
- Telegram mock: user/chat tidak diizinkan, callback lama, klik ganda, kegagalan send sebelum/sesudah kemungkinan terkirim, outbox persistence.
- API: schema DTO, akses tanpa token, Host/Origin asing, input URL/mint invalid, payload idempotency berbeda dengan key sama.
- RSS: script/HTML tidak dieksekusi; URL manual tidak menyebabkan SSRF; exporter melindungi CSV injection.

## End-to-end (Playwright)
1. Bootstrap session lokal, isi kurs, buat eksperimen, tambah mint fixture, dan lihat warm-up.
2. Feed fixture menghasilkan sinyal; kartu menampilkan mint, alasan, waktu, sumber, risiko, dan label simulasi.
3. Simulasikan masuk, tunggu snapshot berikutnya, lihat posisi dan saldo; klik ulang tidak mengubah quantity.
4. Trigger exit; jurnal menampilkan entry/exit, biaya, net PnL, dan versi konfigurasi.
5. Putus SSE/provider; UI menampilkan stale dan memblokir entry, lalu pulih melalui REST snapshot.
6. Restart aplikasi dengan posisi terbuka; data gap terlihat dan exit hanya diobservasi sesudah restart.

## Validasi penelitian
- Kumpulkan data forward terlebih dahulu. Data historis lengkap dan semua token mati tidak diasumsikan tersedia.
- Replay hanya memakai informasi dengan observedAt <= waktu keputusan. Token yang gagal/hilang tetap ada dalam denominator coverage dan laporan.
- Pisahkan periode penyetelan dari periode evaluasi berikutnya secara kronologis; simpan batas periode, versi, dan hasil yang gagal.
- Bandingkan baseline dengan slippage 2%/5%, biaya tetap 2x, delay manual 30/60/120 detik, dan gangguan provider.
- Laporkan trade count, coverage, skip, kualitas harga, pending/unpriced, net expectancy, win rate, drawdown, dan biaya. Coverage rendah tidak boleh disembunyikan sebagai performa bagus.
- Paper trading berdasarkan sampling/model tidak membuktikan fill nyata. Jangan mengaktifkan uang nyata otomatis setelah angka performa tertentu.

## Gate tiap PR
`typecheck`, tes relevan, build bila UI/runtime berubah, dan pemeriksaan migrasi bila schema berubah. PR frontend melakukan E2E skenario yang berubah; tidak harus mengulang seluruh suite tanpa alasan. Scripts tersedia pada package.json. Catat perintah, hasil, dan keterbatasan di dokumen PR.


## Hasil implementasi lokal (2026-10-22)
- Windows x64, Node 24.22.1, pnpm 10.27.0; frozen install, lint, typecheck, build lulus.
- 63 unit/integration test pada 18 file lulus; termasuk restart, single writer, backup/restore, retensi, Telegram ambigu, replay, ledger dan exit tren tanpa menjembatani gap.
- 5 Chromium Playwright test lulus; alur onboarding hingga jurnal/CSV, SSE reconnect, double click, session, input berita berbahaya, dan layout sempit.
- Smoke produksi dan smoke integrasi provider/Telegram mock lulus. Database uji sementara; tidak ada live send atau transaksi nyata.
- start.cmd check lulus dari path dengan spasi. Script .ps1 langsung dibatasi execution policy mesin; CMD launcher memakai bypass pada proses tersebut.
