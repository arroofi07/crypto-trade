# PR-016 — Cutover produksi, launcher, dan pengujian

- Status: TODO
- Dependensi: PR-015
- Branch yang disarankan: `feat/nextjs-cutover`
- Acuan: [PR-012](PR-012-recovery-and-local-launch.md), [operations.md](../operations.md), [testing.md](../testing.md)

## Tujuan dan perilaku akhir

Jalur produksi dan `start.cmd` menjalankan Next + Fastify; artefak Vite dan `fastify-static` untuk UI dihapus. Smoke, E2E, backup/recovery, dan dokumentasi operasi terbarui. Pengguna hanya perlu satu perintah start dan membuka **http://127.0.0.1:4317**.

## Cakupan

- `start.ps1`: urutan start backend → Next → buka browser bootstrap.
- Build root: `pnpm build` menghasilkan server dist + Next standalone.
- Hapus `vite.config.ts`, entry Vite, dan penyajian static lama di Fastify (`serveUi: true` path).
- Perbarui Playwright, smoke, README, architecture, operations.
- Batas: tidak menambah hosting cloud atau HTTPS.

## Kontrak dan data

- Port dokumentasi: UI 4317, API internal 4318 (atau sesuai keputusan final — konsisten di semua doc).

## Checklist implementasi

- [ ] `pnpm test:smoke` lulus dengan stack Next.
- [ ] `pnpm test:e2e` lulus (onboarding, entry, jurnal/CSV jika tercakup).
- [ ] Recovery sleep/gap (`operations.test`) tidak regresi.
- [ ] Bootstrap browser dari launcher membuka sesi valid.
- [ ] Telegram mock path tidak berubah.
- [ ] Rollback documented: cara kembali ke build Vite (tag/branch).
- [ ] Indeks [tasks/README.md](README.md) status PR-013–016 diperbarui.

## Pengujian dan kriteria selesai

- Windows: `.\start.cmd setup` (jika perlu) dan `.\start.cmd` pada mesin bersih sesuai README.
- Tidak ada file `import.meta.env.VITE_*` tersisa di web.
- `pnpm lint` dan `pnpm typecheck` lulus.

## Bukti pelaksanaan

- Commit/PR: belum ada.
- Perintah dan hasil tes: belum dijalankan.
- Perubahan keputusan: port internal final, rollback tag.
