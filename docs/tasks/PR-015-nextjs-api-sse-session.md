# PR-015 — Proxy API, sesi, dan SSE di Next

- Status: TODO
- Dependensi: PR-014
- Branch yang disarankan: `feat/nextjs-api-sse`
- Acuan: [api-contracts.md](../api-contracts.md), [architecture.md](../architecture.md), [migration-nextjs.md](../migration-nextjs.md)

## Tujuan dan perilaku akhir

Browser hanya berkomunikasi dengan origin Next (**4317**). Semua mutasi dan baca data memakai `/api/v1/*` yang di-rewrite ke Fastify internal. SSE reconnect berfungsi; sesi Bearer sama seperti SPA Vite; idempotency key pada entry/close tidak rusak.

## Cakupan

- `next.config` rewrites ke `API_INTERNAL_ORIGIN`.
- Port `lib/api.ts` dari `apps/web/src/api.ts` (offset waktu server, cursor pagination, streaming).
- Bootstrap sesi: fragment URL atau mekanisme yang disetujui di dokumen migrasi.
- Perbarui Fastify `allowedOrigins` + CSP `connect-src` untuk origin Next.
- Dev orchestrator: ganti Vite di `scripts/dev.ts` dengan `next dev` + Fastify di port internal.
- Batas: tidak memindahkan handler REST ke Route Handler Next.

## Kontrak dan data

- Dokumentasikan di `api-contracts.md`: diagram dua port, header wajib, dan contoh bootstrap URL.
- Jika tidak ada perubahan payload, versi API tetap v1.

## Checklist implementasi

- [ ] Rewrite `/api/v1/:path*` teruji (GET health, POST entry dengan Idempotency-Key).
- [ ] SSE `/api/v1/events` tidak ter-buffer; client `stream()` menetapkan `connected` seperti sebelumnya.
- [ ] 401 → clear session + pesan restart peluncur.
- [ ] `Authorization` tidak bocor ke log Next; tidak ada token di HTML SSR.
- [ ] CORS/Host Fastify menerima `127.0.0.1:4317`.
- [ ] Envelope Zod di client tetap `successEnvelopeSchema`.
- [ ] Polling 15s + refresh txn-series 15s pada detail token tetap jalan.

## Pengujian dan kriteria selesai

- Integrasi manual: onboarding FX, watchlist, detail token, buy/sell chart terisi setelah polling.
- Vitest server tidak regresi.
- Playwright (jika sudah diarahkan ke Next): reconnect SSE setelah putus simulasi.

## Bukti pelaksanaan

- Commit/PR: belum ada.
- Perintah dan hasil tes: belum dijalankan.
- Perubahan keputusan: catat pilihan bootstrap sesi (A/B).
