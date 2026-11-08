# PR-004 — Pemeriksaan token dan bukti risiko

- Status: DONE
- Dependensi: PR-003
- Branch yang disarankan: `feat/token-security`
- Acuan: [sumber data](../data-sources.md), [strategi](../strategy-and-risk.md), [model data](../data-model.md)

## Tujuan dan perilaku akhir

Kandidat mendapat status PASS/FAIL/UNKNOWN dari pemeriksaan terbatas yang dapat ditelusuri. Data tidak tersedia atau extension tidak didukung tidak boleh dianggap aman.

## Cakupan dan kontrak

Adapter Solana RPC dan token decoder; security checks persistensi; evidence dan reason codes pada token detail. Tidak melakukan audit kontrak menyeluruh atau menyatakan semua holder independen.

## Checklist implementasi

- [x] Implementasikan RPC read melalui @solana/kit dan decoder kompatibel untuk program token yang didukung.
- [x] Validasi program owner, mint, decimals, supply, mint authority, dan freeze authority.
- [x] Buat allowlist decoder/extension eksplisit; tolak transfer fee, delegate permanen, transfer hook, pembatasan/pausing, dan extension tidak didukung.
- [x] Hitung proksi konsentrasi largest token accounts terhadap supply dengan klasifikasi pool/burn yang benar-benar terverifikasi.
- [x] Terapkan ambang konsentrasi 20% akun terbesar dan 50% top-10; unknown evidence memblokir entry.
- [x] Catat kendali LP/lock/afiliasi wallet sebagai tidak diketahui jika tidak ada sumber pendukung; jangan menebak dari ticker atau saldo saja.
- [x] Cache pemeriksaan maksimal 10 menit dan refresh sesuai budget/prioritas.
- [x] Simpan waktu, sumber, decoder version, hasil tiap pemeriksaan, dan keterbatasan.
- [x] Publikasikan perubahan FAIL/UNKNOWN agar signal dan paper modules dapat merespons lewat event domain.

## Pengujian dan kriteria selesai

- Mint biasa, authority aktif, extension asing, supply nol, RPC error, dan akun terbesar ambigu memiliki hasil fixture yang eksplisit.
- Unknown dan stale security tidak lolos gate entry.
- Akun pool tidak dikecualikan hanya karena ukurannya besar.
- UI/API menggunakan frasa lolos pemeriksaan terbatas; tidak ada label rug-proof atau aman 100%.

## Bukti pelaksanaan

- Commit/PR: belum ada.
- Typecheck, build, dan 35 tes Vitest lulus. Fixture membuktikan authority, supply nol, decimals, ambang 20%/50%, akun ambigu, decoder mint, TLV asing/malformed, cache 10 menit, event perubahan, serta RPC failure UNKNOWN.
- Decoder @solana-program/token 0.18.0 dengan @solana/kit 8.5.0. Base mint SPL/Token-2022 didukung; allowlist extension kosong sehingga seluruh extension ditolak. RPC memverifikasi mint/amount akun terbesar tetapi belum memiliki decoder protokol untuk membuktikan afiliasi pool/burn: hasil konsentrasi live tetap UNKNOWN dan memblokir entry. PASS hanya dapat dihasilkan jika adapter menyediakan bukti klasifikasi terverifikasi; tidak ada bypass lewat API. LP/lock/afiliasi wallet tetap UNKNOWN.
