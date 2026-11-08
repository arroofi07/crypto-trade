# PR-010 — Telegram, callback, dan notification outbox

- Status: DONE
- Dependensi: PR-008
- Branch yang disarankan: `feat/telegram-bot`
- Acuan: [kontrak Telegram](../api-contracts.md), [arsitektur](../architecture.md), [pengujian](../testing.md)

## Tujuan dan perilaku akhir

Pengguna menerima ringkasan sinyal/perubahan posisi di Telegram dan dapat meminta simulasi manual. Perintah bot memiliki batas risiko dan idempotensi yang sama dengan dashboard.

## Cakupan dan kontrak

grammY long polling, allowlist, commands, callbacks, formatting, outbox worker, dan delivery health. Bot tidak menjadi server dashboard jarak jauh atau mengirim trade nyata.

## Checklist implementasi

- [x] Baca bot token, authorized chat ID, dan user ID dari environment; token tidak masuk browser/log.
- [x] Bot nonaktif tanpa konfigurasi; dashboard dan paper engine tetap berjalan.
- [x] Implementasikan `/status`, `/signals`, `/positions`, `/help` beserta label simulasi.
- [x] Format sinyal mencakup mint, entry, masa berlaku, risiko, nominal preview manual, dan ID detail.
- [x] Callback opaque dipetakan ke entity; cek ulang allowlist, expiry, state, risk, dan versi data di service domain.
- [x] Tombol entry idempotent; close memakai konfirmasi dan exit intent, bukan fill langsung dari harga lama.
- [x] Detail tersedia sebagai teks di HP; link localhost diberi penjelasan khusus PC.
- [x] Outbox mendukung retry aman, dedupe event, message ID, DEAD, dan DELIVERY_UNKNOWN.
- [x] Jangan kirim sinyal expired dari antrean sebagai sinyal beli baru; throttle health alerts agar tidak spam.
- [x] Satu polling instance aktif; simpan checkpoint update agar command ulang tidak menggandakan efek.
- [x] Sediakan panduan konfigurasi dan mock test. Live send hanya setelah instruksi eksplisit pengguna dengan konfigurasi tujuan.

## Pengujian dan kriteria selesai

- Mock bot membuktikan format, escaping karakter, callback valid/invalid, user asing, dan pesan kedaluwarsa.
- Klik tombol berulang hanya menghasilkan satu request/posisi; portfolio manual tidak tercampur strategy.
- Timeout ambigu tidak di-retry buta; health menunjukkan status delivery yang belum pasti.
- Restart tidak mengulang efek command yang sudah committed; tidak menjanjikan exactly-once delivery pesan.
- Tidak ada pesan Telegram nyata yang dikirim oleh suite test otomatis.

## Bukti pelaksanaan

- Commit/PR: implementasi lokal; workspace tidak memiliki repository Git/remote.
- Perintah dan hasil tes: typecheck/build lulus; 55 unit/integration test dan 5 Playwright test lulus. Telegram memakai mock, tanpa live send.
- Keterbatasan/perubahan keputusan: Telegram opt-in melalui environment; tanpa konfigurasi tetap nonaktif. Dashboard mengikuti state domain dan membatasi entry saat stream terputus.
