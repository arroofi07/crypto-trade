# PR-014 — Port halaman dashboard ke App Router

- Status: TODO
- Dependensi: PR-013
- Branch yang disarankan: `feat/nextjs-pages`
- Acuan: [PR-009](PR-009-dashboard.md), [Migrasi Next.js](../migration-nextjs.md)

## Tujuan dan perilaku akhir

Seluruh workspace UI yang ada di `main.tsx` tersedia sebagai rute Next dengan konten dan copy Bahasa Indonesia yang setara: Ringkasan, Penemuan, Watchlist, Sinyal, Posisi, Jurnal, Berita, Pengaturan, Kesehatan.

## Cakupan

- Pecah `main.tsx` menjadi layout + halaman per segment (`app/(app)/ringkasan/page.tsx`, …).
- Pindahkan komponen: `Panel`, `Badge`, `Empty`, `NewsList`, dialog konfirmasi exit, dll. ke `components/`.
- Port `Journal.tsx`, `Chart.tsx` (`SampleChart`, `BuySellChart`, `EquityChart`) sebagai client components.
- State global (portfolio terpilih, loading, error) dapat `useContext` atau URL search param untuk portfolio — dokumentasikan pilihan di PR.
- Batas: data masih boleh di-fetch langsung ke backend internal jika PR-015 belum selesai (hardcode origin sementara).

## Kontrak dan data

- Pakai schema yang sama dari `@memecoin/contracts` dan `lib/dto.ts` (salinan dari `dto.ts` Vite).
- Tidak mengubah envelope API.

## Checklist implementasi

- [ ] Navigasi menggunakan `<Link>` dan `usePathname`; `aria-current` pada tab aktif.
- [ ] Halaman Watchlist + detail token (panel expand atau sub-route `/watchlist/[mint]` — pilih satu pola dan konsisten).
- [ ] Halaman Penemuan, Sinyal, Posisi, Berita, Pengaturan, Kesehatan — paritas field dengan UI Vite.
- [ ] Lazy load chart (dynamic import, `ssr: false`).
- [ ] Styles: port kelas CSS dari `styles.css` ke `globals.css` / modul.
- [ ] Metadata dasar (`title`, `description`) per layout; tidak menyimpan secret di metadata.
- [ ] Accessibility: dialog exit, focus, status stale/error tetap ada.

## Pengujian dan kriteria selesai

- Manual: navigasi semua tab tanpa error React hydration.
- Unit ringan (opsional): render halaman dengan fixture jika ada testing library.
- Checklist PR-009 terpenuhi secara visual/fungsional terhadap backend yang sama (dengan origin dev yang berlaku).

## Bukti pelaksanaan

- Commit/PR: belum ada.
- Perintah dan hasil tes: belum dijalankan.
- Perubahan keputusan: belum ada.
