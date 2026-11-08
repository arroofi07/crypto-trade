# Strategi, risiko, dan model simulasi

## Status strategi

`momentum-pullback-v1` adalah hipotesis awal yang diusulkan, belum terbukti menguntungkan. Semua threshold di bawah merupakan default eksperimen untuk membuat implementasi dan pengujian deterministik. Jangan menyebut strategi tervalidasi sebelum ada hasil out-of-sample yang memadai. Aturan harus tersimpan dengan version/hash dan tidak berubah pada posisi yang sudah terbuka.

## Filter universe

- Chain Solana, pool berumur minimal 24 jam, likuiditas USD minimal 100.000.
- Volume rolling 24 jam minimal USD100.000; field tidak tersedia berarti belum memenuhi filter.
- Pemeriksaan keamanan wajib `PASS` sesuai [sumber data](data-sources.md), maksimal berumur 10 menit.
- Mint/symbol dikenal untuk tampilan tetapi mint tetap identitas utama.
- Minimal 60 bar sampel 1 menit berurutan dan lengkap untuk warm-up. Satu bar lengkap memerlukan minimal dua observasi berbeda dalam menit tersebut; bar yang belum selesai tidak dipakai untuk trigger.
- Tidak ada bar kosong atau gap observasi >90 detik dalam warm-up. Gap memulai ulang warm-up kandidat; monitoring posisi tetap memakai observasi terbaru yang valid.

Ambang likuiditas/usia tidak menjamin kemampuan menjual atau mencegah rug pull. Token yang lolos diberi label lolos pemeriksaan terbatas, bukan aman.

## Aturan entry eksperimental

Evaluasi pada penutupan bar sampel 1 menit. EMA menggunakan alpha 2/(n+1), di-seed SMA n close pertama. Bar hanya dihitung setelah timestamp penutupnya lewat.

1. Tren: EMA9 > EMA21 dan close saat ini > EMA21; perubahan close dibanding 15 bar lalu minimal +3%.
2. Pullback: hitung H = close tertinggi dari 10 bar sebelum bar pemicu. Close bar sebelum pemicu harus 2%-6% di bawah H.
3. Pemulihan: close bar pemicu > close bar sebelumnya dan >= EMA9.
4. Stop S = close terendah dari 5 bar sebelum pemicu dikali 0,99. Jarak dari close pemicu ke S harus 2%-10%; di luar rentang tidak diterbitkan sinyal valid.
5. Area entry = [close pemicu, close pemicu x 1,005]. Sinyal berlaku 120 detik dari publikasi; pada `now >= expiresAt` sinyal sudah kedaluwarsa.
6. Maksimal satu sinyal valid per mint; cooldown 30 menit sesudah sinyal diterbitkan. Evaluasi tetap merekam alasan kandidat ditolak.

Persyaratan sebelum entry diperiksa ulang: harga observasi berikutnya berada di area entry, sinyal belum kedaluwarsa, data segar, keamanan valid, tesis tren masih berlaku, dan risk gate portofolio lolos. Jangan mengisi entry di luar area hanya karena pernah masuk area sebelumnya.

## Hold, target, dan keluar

- Horizon maksimum 120 menit sejak fill. Evaluasi kondisi keluar pada setiap snapshot valid; keputusan tren memakai bar tertutup.
- Stop terencana memakai S dari sinyal. Harga entry efektif P mencakup adverse slippage.
- Target penuh dihitung agar hasil net pada target = 1,5 x plannedLoss setelah seluruh biaya model; rumus ada di bawah. Target adalah rencana keluar, bukan prediksi kemungkinan harga tercapai. Tolak entry jika target memerlukan kenaikan harga observasi >30% dari observasi entry. Tidak ada partial take-profit atau trailing stop pada MVP.
- Tutup seluruh posisi jika harga observasi <= S, harga observasi >= target, dua close berturut-turut < EMA21, atau waktu hold >=120 menit.
- Keamanan menjadi `FAIL`: emit alert dan exit intent segera. Simulasi exit hanya dilakukan ketika ada pengamatan harga/pool valid; jangan menganggap nilai harga lama masih bisa dijual.
- Jika beberapa alasan keluar pada observasi yang sama, prioritas pencatatan: security, stop, target, trend, time. Fill selalu memakai harga observasi tersebut yang sudah disesuaikan biaya, bukan harga threshold.
- Jika data hilang, posisi menjadi `UNPRICED`; tidak ada fill, tidak ada PnL baru. Harga terakhir hanya referensi berlabel stale.
- Setelah restart/gap, exit yang sudah jatuh tempo diproses pada observasi valid pertama dengan penanda `DATA_GAP`. Jangan menciptakan exit di tengah periode offline atau mengklaim target tidak tersentuh saat offline.

Skenario kartu sinyal: bullish jika pemulihan berlanjut ke target; netral jika kondisi belum invalid tetapi momentum tidak berlanjut; bearish jika stop/tesis terlanggar. Tidak menampilkan angka probabilitas profit. Horizon adalah aturan manajemen posisi, bukan prediksi kapan harga tertinggi.

## Modal dan batas risiko

Masing-masing portofolio `strategy` dan `manual` memiliki modal awal Rp500.000; hasil keduanya terpisah. Ekuitas E = kas + nilai likuidasi simulasi posisi berdasarkan observasi segar, setelah estimasi biaya keluar. Jika salah satu posisi tidak dapat dinilai, entry baru portofolio diblokir.

| Parameter | Default |
| --- | --- |
| Risiko terencana per posisi | 0,5% E saat evaluasi entry |
| Batas total risiko | 1,5% E, termasuk pending reservation |
| Maksimal posisi/pending | 3 per portofolio; satu per mint |
| Alokasi maksimal per posisi | 10% E, termasuk biaya entry |
| Cap terhadap likuiditas | Notional <=0,01% liquidity USD; hanya proksi konservatif |
| Batas rugi harian | 2% equity awal hari |
| Zona reset harian | Asia/Bangkok (UTC+7), dapat diubah sebelum eksperimen dimulai |

Pada modal awal, anggaran risiko per posisi Rp2.500, total Rp7.500, batas harian Rp10.000. Risiko terencana bukan batas kerugian maksimum; gap harga, hilangnya likuiditas, atau kegagalan menjual bisa melampauinya.

Daily halt dihitung dari `equity sekarang <= equity awal hari x 0,98`, mencakup realized dan unrealized net PnL. Setelah terpicu, latch sampai pergantian hari; recovery harga tidak mengaktifkan kembali entry. Posisi terbuka tetap dipantau. Jika tidak ada valuasi segar pada pergantian hari, pending reset dan blokir entry sampai valuasi valid. Simpan baseline/resets dalam DB agar restart tidak menghapus batas harian.

## Kurs dan biaya

Pengguna memasukkan USD/IDR positif sebelum membuat kedua portfolio. Catat nilai, timestamp, dan label `MANUAL_FIXED`. Kurs dibekukan pada portfolio untuk memisahkan uji strategi token dari spekulasi kurs. Mengubah kurs membuat eksperimen/portfolio baru; jangan menulis ulang histori.

Model awal `cost-model-v1` memakai asumsi yang sengaja eksplisit:

- Adverse slippage 1% per sisi: buy = harga observasi x 1,01; sell = harga observasi x 0,99.
- Fee perdagangan 0,3% dari nilai transaksi per sisi, ditambah Rp500 biaya tetap per sisi.
- Angka tersebut adalah parameter simulasi, bukan tarif terverifikasi atau estimasi akurat untuk semua pool. Tidak ada klaim quote executable, price impact nyata, atau estimasi MEV.
- Jika memakai quote provider pada tahap selanjutnya, pisahkan mode quote dari model dan jangan menghitung biaya yang sama dua kali.
- Uji sensitivitas slippage 2% dan 5% per sisi, serta biaya tetap 2x, tanpa mengubah run baseline.

## Rumus sizing

Semua perhitungan memakai Decimal; raw token quantity dibulatkan turun sesuai decimals mint. Simpan uang/desimal sebagai string, bukan floating point JSON.

Untuk quantity q, harga beli efektif P, fee rate f, biaya tetap b, kurs k, dan harga stop efektif S_eff = S x (1 - slippage):

```text
entryCost(q)    = q x P x k x (1 + f) + b
stopProceeds(q) = q x S_eff x k x (1 - f) - b
plannedLoss(q)  = entryCost(q) - stopProceeds(q)
budget         = E x 0,005
qRisk          = (budget - 2b) / (k x [P(1+f) - S_eff(1-f)])
targetObserved = [entryCost(q) + 1,5 x plannedLoss(q) + b]
                 / [q x k x (1-slippage) x (1-f)]
```

Jika denominator <=0 atau budget <=2b, tolak. Hitung batas quantity dari masing-masing qRisk, kas tersedia, cap alokasi, cap likuiditas, dan sisa total risiko; ambil minimum dari batas-batas tersebut lalu bulatkan turun. Hitung ulang semua batas dan target setelah pembulatan. Tolak quantity nol, targetObserved > harga observasi entry x 1,30, proceeds target <= entry cost, atau net reward/risk <1,2. Target net 1,5R dan floor 1,2R adalah default eksperimen, bukan bukti keuntungan. Floor menjadi pemeriksaan akhir untuk pembulatan/konfigurasi, bukan izin menurunkan target diam-diam.

Contoh hitung untuk fixture, bukan harga/kurs pasar: observasi USD1, stop USD0,98, kurs asumsi Rp16.000/USD, decimals 6, budget Rp2.500, dan biaya model di atas. Quantity setelah round-down = 2,049601 token; entryCost = Rp33.720,91681648; plannedLoss = Rp2.499,9996720096; targetObserved sekitar USD1,17309023; net reward target sekitar Rp3.749,999508. Kas dan cap alokasi Rp50.000 mencukupi jika gate lain lolos. Target sekitar +17,31% ini tetap bisa tidak pernah tercapai. Contoh ini menunjukkan pentingnya memasukkan biaya saat menentukan target pada modal kecil.

Total risiko menggunakan plannedLoss awal setiap posisi + reservation. Tidak turun hanya karena harga sementara naik; naikkan sampai estimasi loss kini jika lebih buruk dan masih bisa dinilai. Jika melampaui batas, blokir entry baru tanpa mengarang forced fill.

Setiap hasil sizing memuat `allowed`, `reasonCodes`, quantity, notional, entry cost, estimated stop loss, net target reward, fee assumptions, equity basis, dan versi konfigurasi. UI tidak boleh menganggap nominal preview mengikat.

## Mesin paper trading

- Auto dan manual menggunakan service yang sama. Auto mengambil seluruh sinyal eligible secara urut publishedAt lalu signal ID; sinyal yang gagal karena kapasitas tetap dicatat.
- Request entry mereservasi saldo dan risiko menggunakan snapshot saat permintaan; fill memakai observasi valid berikutnya yang waktunya lebih besar dari requestedAt. Revalidasi seluruh gate dan sizing pada saat itu.
- Satu pending entry per sinyal/portfolio; batas waktu sampai expiresAt. Lepaskan reservation ketika expire/reject.
- Request ID/idempotency key mencegah posisi ganda. Auto key stabil = portfolio + signal. Klik ulang manual untuk pasangan yang sudah masuk mengembalikan posisi yang sama, bukan menambah posisi.
- Ledger kas, fill, posisi, reservation, dan event/outbox ditulis atomik. Kas tidak boleh negatif.
- Exit manual memakai observasi valid berikutnya setelah request. Exit otomatis menggunakan observasi pemicu; keduanya memakai model biaya yang sama.
- Fill simulasi bukan bukti token akan bisa dijual di pasar nyata. Laporan harus selalu membawa label model biaya dan kualitas data.

## Evaluasi

Laporkan jumlah sinyal, kesempatan entry, alasan skip, transaksi tertutup, win rate net, rata-rata win/loss, expectancy net, profit factor, total biaya, equity/drawdown, exposure, dan durasi hold. Net PnL >0 adalah win; =0 adalah breakeven dan tetap masuk denominator transaksi tertutup. Posisi terbuka tidak masuk win rate.

Bandingkan auto vs manual, versi strategi, dan periode data. Jangan memilih hanya token yang masih hidup. Token hilang/unpriced tidak boleh dihapus dari laporan. Tidak ada kelulusan otomatis berdasarkan jumlah transaksi atau win rate saja; hasil eksperimen harus ditinjau sebelum perubahan scope ke uang nyata.
