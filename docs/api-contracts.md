# Kontrak API dan kanal pengguna

## Dasar

REST lokal di `http://127.0.0.1:4317/api/v1`. Frontend produksi dilayani origin yang sama. Semua API dan stream memerlukan session token lokal; lihat [arsitektur](architecture.md). Backend saja yang mengakses provider dan rahasia bot.

DTO memakai camelCase. Decimal = string, timestamp = UTC ISO-8601, ID = UUID. Schema Zod bersama di `packages/contracts`. Response sukses `{ data, meta: { requestId, observedAt } }`; error `{ error: { code, message, details? }, requestId }`. Daftar top-level memakai cursor ID dan limit default 50, maksimum 100; `meta.nextCursor` null menandakan akhir. Cursor yang tidak ada pada filter tersebut ditolak. Data agregat performance/series dan evidence memuat array internal utuh agar hitungan tidak berubah akibat pagination.

Input/response diuji schema; jangan mengirim objek provider mentah ke frontend. Pesan human-readable Bahasa Indonesia; reasonCode tetap stabil berbahasa Inggris.

## Endpoint

| Method/path | Perilaku |
| --- | --- |
| GET `/health` | Status aplikasi, DB, provider, job terakhir, data gap, Telegram aktif/nonaktif; tanpa secret |
| GET `/settings` | Konfigurasi nonrahasia dan versi aktif |
| PATCH `/settings` | Watchlist/polling nonfinansial; validasi batas dan audit perubahan |
| POST `/experiments` | Membuat sepasang portfolio strategy/manual dengan modal dan FX yang dibekukan; tidak mereset eksperimen lama |
| GET `/portfolios` | Saldo, equity, freshness, risiko terbuka, dan daily halt per portfolio |
| GET/POST `/watchlist` | Daftar/tambah mint Solana; maksimal 20 aktif; jangan mengambil URL arbitrer dari input |
| DELETE `/watchlist/:mint` | Nonaktifkan discovery baru; posisi terbuka tetap dipantau dan histori dipertahankan |
| GET `/tokens/:mint` | Identitas, pool, keamanan, kandidat, dan kualitas data |
| GET `/tokens/:mint/series` | Sampel/bar dengan source, interval, quality, dan gap |
| GET `/signals` | Filter status, mint, cursor; urut waktu terbaru |
| GET `/signals/:id` | SignalDetail lengkap dan keterbatasan |
| POST `/signals/:id/preview` | Input portfolioId; hitung ulang sizing read-only tanpa reservation |
| POST `/paper/entries` | Input signalId, portfolioId; buat pending request/reservation, HTTP 202 |
| GET `/paper/entries/:id` | Status pending/fill/reject dan alasan |
| GET `/positions` | Filter portfolio dan status; termasuk UNPRICED |
| POST `/positions/:id/close` | Exit intent manual; HTTP 202, fill sesudah observasi baru yang valid |
| GET `/news` | Filter mint dan status pencocokan; tampilkan sumber/waktu |
| POST `/news` | Link http(s) + judul manual; tidak fetch arbitrary URL, label manual/unverified |
| GET `/performance` | Portfolio, periode, versi strategi; metrik dan coverage |
| GET `/journal/export` | CSV hasil dan kualitas data; netralisasi CSV formula injection |
| GET `/events` | Stream SSE melalui fetch dengan header token |

`POST /experiments` memakai default modal Rp500.000 dan profil risiko yang disepakati; FX wajib eksplisit, positif. Eksperimen baru tidak otomatis memindahkan fokus auto engine: request memiliki `activate` boolean, dan activation memerlukan semua portfolio auto eksperimen lama tanpa posisi/pending. Posisi lama tidak dipindah antar konfigurasi.

`GET /performance` dan `/journal/export` wajib `portfolioId`, opsional `from`/`to` UTC ISO dan `strategyConfigId` yang cocok dengan portfolio. Net PnL closed memakai tanggal exit; fees/slippage memakai tanggal fill. Exposure/pending/open/unpriced adalah kondisi saat ini dan diberi label demikian. CSV memakai UTF-8 BOM serta neutralisasi formula. Preview dapat memperbarui daily-halt latch, tetapi tidak membuat reservation atau ledger.

## Bentuk SignalDetail

```typescript
type SignalDetail = {
  id: string;
  token: { chain: 'solana'; mint: string; symbol: string | null; name: string | null };
  poolId: string;
  state: 'VALID' | 'EXPIRED' | 'INVALIDATED';
  publishedAt: string;
  expiresAt: string;
  entry: { lowUsd: string; highUsd: string; stopUsd: string };
  exitPlan: { maxHoldMinutes: number; targetNetR: string; invalidationReasons: string[] };
  scenarios: { bullish: string; neutral: string; bearish: string };
  reasons: Array<{ code: string; text: string; evidenceIds: string[] }>;
  security: { status: 'PASS' | 'FAIL' | 'UNKNOWN'; checkedAt: string; limitations: string[] };
  dataQuality: { observedAt: string; stale: boolean; gaps: boolean; sampling: 'sampled' };
  newsIds: string[];
  strategyVersion: string;
};
```

Nominal tidak disimpan sebagai rekomendasi universal dalam SignalDetail. Sizing preview terpisah: portfolioId, allowed, reasonCodes, quantityRaw, entryCostIdr, plannedLossIdr, targetObservedUsd, targetRewardIdr, equityBasisIdr, expiresAt, configVersionIds. Target final dihitung setelah fill berdasarkan quantity aktual dan biaya untuk net 1,5R, dengan batas kenaikan target sesuai strategi.

## Konsistensi dan idempotensi

- Mutasi finansial simulasi memakai header `Idempotency-Key`. Duplikasi dengan payload sama mengembalikan hasil pertama; payload berbeda: HTTP 409.
- Domain gate berlaku identik untuk dashboard, auto engine, dan Telegram. Kedaluwarsa diuji di server, bukan dari tombol UI.
- HTTP 400 input salah; 401/403 akses; 404 entity tidak ditemukan; 409 state/risk conflict; 503 data penting tidak tersedia. Rate limit lokal 429 bila perlu.
- Reason codes minimum: `STALE_MARKET`, `SECURITY_FAIL`, `SECURITY_UNKNOWN`, `WARMUP_REQUIRED`, `SIGNAL_EXPIRED`, `OUTSIDE_ENTRY_RANGE`, `DAILY_HALT`, `OPEN_RISK_LIMIT`, `INSUFFICIENT_CASH`, `COST_TOO_HIGH`, `DUPLICATE_ENTRY`, `UNPRICED_POSITION`, `DATA_GAP`.

## SSE

Event envelope `{ id, type, occurredAt, entityId, portfolioId?, data }`. Jenis: `candidate.updated`, `signal.created`, `signal.updated`, `entry.updated`, `position.updated`, `portfolio.updated`, `health.updated`.

UI mengambil snapshot REST ketika connect/reconnect, lalu memakai event untuk invalidasi/refetch. Event realtime bukan satu-satunya penyimpan state; jangan mengasumsikan replay SSE tak terbatas. Heartbeat setiap 15 detik, reconnect dengan backoff. UI menampilkan putus koneksi dan tidak memakai cache lama untuk mengizinkan entry.

## Telegram

- Perintah: `/status`, `/signals`, `/positions`, `/help`. Seluruh output menyebut simulasi.
- Tombol callback berisi ID opaque pendek, bukan JSON payload besar atau secret. Server mengurai ke entity lalu memeriksa allowlist dan state terbaru.
- `Simulasikan masuk`: membuat request pada portfolio manual; idempotency stabil dari portfolio + signal. Bot menjelaskan pending lalu memberi pembaruan hasil.
- `Tutup simulasi`: tampilkan konfirmasi, lalu buat exit intent; tombol lama pada posisi CLOSED tidak membuat ledger baru.
- `Detail`: kirim ringkasan teks; tautan localhost diberi label hanya untuk PC. Telegram tidak menjadi proxy publik untuk dashboard.
- Outbox memakai dedupe event+channel. Simpan Telegram message ID ketika diketahui untuk update pesan.
- Pengiriman Telegram tidak menjamin exactly-once. Timeout setelah send bisa berarti pesan sudah terkirim: tandai DELIVERY_UNKNOWN, tampilkan di health, jangan retry buta yang menyebabkan spam. Entry tetap idempotent walaupun pesan ganda.
- Sinyal yang kedaluwarsa selama antrean tidak dikirim sebagai kesempatan entry baru. Kirim status final bila diperlukan.
