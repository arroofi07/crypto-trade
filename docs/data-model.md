# Model data

## Konvensi

SQLite lokal dengan migrasi SQL bernomor, foreign keys, WAL, transaksi atomik, dan satu writer. ID memakai UUID, waktu UTC ISO-8601, alamat mint case-sensitive, chain literal `solana`. Angka uang/harga/rasio sebagai decimal string; raw token amount sebagai integer string. DTO publik mengikuti [kontrak API](api-contracts.md).

Status ini merupakan kontrak rancangan; nama tabel berikut dipakai pada migrasi awal. Field tambahan boleh ditambahkan bila menjaga kontrak dan provenance.

| Entitas | Field inti dan aturan |
| --- | --- |
| `schema_migrations` | version, applied_at; migrasi gagal tidak boleh setengah diterapkan |
| `config_versions` | id, kind, version, payload_json, hash, created_at; immutable |
| `tokens` | id, chain, mint UNIQUE(chain,mint), name, symbol, decimals, watchlist_enabled, canonical_pool_id |
| `pools` | id, provider, address, token_id, dex_id, quote_mint, created_at_source; identitas pool unik per chain |
| `market_snapshots` | id, token_id, pool_id, observed_at, source_at nullable, price_usd, liquidity_usd, rolling_volume_json, quality, source |
| `sample_bars` | id, pool_id, interval, open_at, close_at, sample_count, sampled_ohlc_json, complete; UNIQUE(pool_id,interval,open_at) |
| `security_checks` | id, token_id, checked_at, expires_at, status, checks_json, evidence_json, decoder_version |
| `news_items` | id, canonical_url UNIQUE, publisher, title, excerpt, published_at nullable, first_seen_at, match_status |
| `news_token_links` | news_id, token_id, match_method, confidence_label; simbol saja bukan match terverifikasi |
| `signals` | id, token_id, pool_id, state, published_at, expires_at, entry_low/high, stop_price, max_hold_minutes, reasons_json, scenario_json, evidence_json, strategy_config_id |
| `signal_events` | id, signal_id, event_type, occurred_at, reason_codes, evidence_json; append-only |
| `portfolios` | id, mode auto/manual, initial_cash_idr, cash_idr, fx_config_id, risk_config_id, cost_config_id, created_at; eksperimen terpisah |
| `portfolio_days` | portfolio_id, day_key, opening_equity_idr, halted_at nullable, reset_pending; UNIQUE(portfolio_id,day_key) |
| `entry_requests` | id, portfolio_id, signal_id, requested_at, state, reserved_cash_idr, reserved_risk_idr, idempotency_key, reason_codes |
| `positions` | id, portfolio_id, signal_id, pool_id, state, quantity_raw, entry_effective_price, stop_price, target_price, opened_at, due_at, closed_at nullable, planned_risk_idr, config_refs |
| `fills` | id, position_id, side, quantity_raw, observed_price, effective_price, fees_idr, observed_at, filled_at, source_snapshot_id, quality_flags, cost_config_id |
| `cash_ledger` | id, portfolio_id, position_id nullable, fill_id nullable, amount_idr_signed, reason, created_at; ledger append-only |
| `equity_snapshots` | id, portfolio_id, observed_at, cash_idr, equity_idr nullable, quality_flags; nilai stale tidak menjadi equity baru |
| `decisions` | id, portfolio_id nullable, token_id, signal_id nullable, evaluated_at, outcome, reason_codes, evidence_json |
| `outbox` | id, event_id, channel, dedupe_key UNIQUE, payload_json, state, attempt_count, next_attempt_at, delivered_at nullable, external_message_id nullable |
| `job_state` | job_name PRIMARY KEY, last_started_at, last_succeeded_at, checkpoint_json, last_error_code |
| `data_gaps` | id, provider/pool/portfolio scope, started_at, ended_at nullable, reason |
| `audit_events` | id, kind, actor, entity_id, occurred_at, sanitized_payload; tidak menyimpan token/secret |

Indeks wajib: snapshot(pool_id, observed_at), bars(pool_id, close_at), signals(state, expires_at), positions(portfolio_id,state), outbox(state,next_attempt_at), decisions(evaluated_at).

## Status domain

- Kandidat: `WATCH`, `BLOCKED`, `WARMING_UP`, `ELIGIBLE`. Kandidat belum tentu sinyal.
- Security: `PASS`, `FAIL`, `UNKNOWN`. PASS hanya bermakna pemeriksaan yang diimplementasikan lolos.
- Sinyal: `VALID -> EXPIRED | INVALIDATED`. Status filled berada di portfolio/entry, karena sinyal dapat digunakan oleh dua portofolio.
- Entry: `PENDING -> FILLED | REJECTED | EXPIRED | CANCELLED`. FILLED bersifat final; update tidak mengurangi ledger secara ulang.
- Posisi: `OPEN`, `UNPRICED`, `CLOSED`. UNPRICED bisa kembali OPEN; request exit disimpan terpisah sebagai event/intent.
- Outbox: `PENDING`, `SENDING`, `DELIVERED`, `RETRY`, `DEAD`, `DELIVERY_UNKNOWN`.

## Invariant

1. Semua posisi harus berasal dari sinyal dan fill entry yang valid. Keputusan menolak tetap memiliki evidence.
2. Partial unique index mencegah lebih dari satu posisi OPEN/UNPRICED per mint/portfolio; mint disalin secara terkontrol ke posisi jika diperlukan untuk constraint tersebut.
3. Unique entry key(portfolio,signal) dan idempotency key melindungi aksi ulang. Mutation idempotency menyimpan payload hash; key sama dengan payload berbeda menghasilkan conflict.
4. Catatan fill/cash tidak diedit setelah committed. Koreksi memakai reversal eksplisit dan audit, bukan overwrite tersembunyi.
5. Sinyal menyimpan bukti immutable yang dibutuhkan replay, tidak bergantung hanya pada snapshot yang nanti terkena retensi.
6. Transaksi fill menyimpan ledger + posisi + status request + outbox secara atomik. Kegagalan rollback seluruhnya.
7. Simpan harga dan fees dengan presisi penuh; pembulatan rupiah hanya pada tampilan. Constraint saldo/risk dijalankan dengan Decimal, bukan SQL cast REAL.
8. Mengubah parameter eksperimen membuat config version baru. Portofolio/posisi lama mempertahankan versi asal.

## Backup dan migrasi

Gunakan backup API SQLite yang konsisten, verifikasi integritas dan versi schema pada restore. Backup harian saat aplikasi aktif, retensi 7 backup terakhir; lokasi tetap dalam folder data proyek. Restore hanya saat aplikasi utama berhenti dan setelah membuat backup keadaan sebelumnya. PR-012 mendokumentasikan langkah pengguna tanpa menghapus database secara otomatis.
