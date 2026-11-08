# PR-013 — Scaffold Next.js (apps/web)

- Status: TODO
- Dependensi: PR-012
- Branch yang disarankan: `feat/nextjs-scaffold`
- Acuan: [Migrasi Next.js](../migration-nextjs.md), [Arsitektur](../architecture.md)

## Tujuan dan perilaku akhir

Workspace memiliki aplikasi Next.js App Router di `apps/web` yang dapat `next build` dan `next dev` tanpa menghapus Vite terlebih dahulu. Belum ada paritas fitur; hanya shell, Tailwind, dan halaman placeholder.

## Cakupan

- Yang dikerjakan: inisialisasi Next 15+ (atau versi yang kompatibel Node 24), TypeScript strict, App Router, `output: 'standalone'`, paket workspace `@memecoin/web`.
- Batas: tidak mengubah `apps/server` kecuali penyesuaian CORS origin opsional; tidak memotong Vite.

## Kontrak dan data

- Tidak ada perubahan REST/SSE.
- Tambah env dokumentasi: `API_INTERNAL_ORIGIN` (default `http://127.0.0.1:4318`) untuk rewrite fase berikutnya.

## Checklist implementasi

- [ ] Ganti atau sisipkan konfigurasi Next di `apps/web` (`next.config.ts`, `app/layout.tsx`, `app/page.tsx` placeholder).
- [ ] Port Tailwind/PostCSS dari setup Vite ke Next (`globals.css`, `@import "tailwindcss"`).
- [ ] Dependensi: `next`, `react`, `react-dom`; pertahankan `zod`, `@memecoin/contracts`, `lightweight-charts` sebagai deps web.
- [ ] Script package: `dev:next`, `build`, `start`; root `package.json` / `pnpm-workspace` tetap konsisten.
- [ ] Typecheck web memakai `next` types; path alias `@/` → `src/` atau root `app/`.
- [ ] Halaman placeholder menampilkan teks “Next shell — belum cutover”.
- [ ] Dokumentasi singkat di [migration-nextjs.md](../migration-nextjs.md) jika deviasi versi Next.

## Pengujian dan kriteria selesai

- `pnpm --filter @memecoin/web build` sukses.
- `next dev` pada 4317 (atau port yang didokumentasikan) menampilkan placeholder.
- `pnpm typecheck` lulus (packages + web).
- Vite lama masih dapat di-build jika belum dihapus (dua target paralel diperbolehkan sementara).

## Bukti pelaksanaan

- Commit/PR: belum ada.
- Perintah dan hasil tes: belum dijalankan.
- Perubahan keputusan: belum ada.
