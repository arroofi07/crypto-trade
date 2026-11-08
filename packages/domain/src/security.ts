import { D } from './decimal.js';

export interface SecurityEvidence {
  program: 'token' | 'token2022' | 'unsupported'; initialized: boolean; decimals: number; supplyRaw: string;
  mintAuthority: boolean; freezeAuthority: boolean; extensions: number[];
  accounts: { address: string; amountRaw: string; role: 'HOLDER' | 'POOL' | 'BURN' | 'UNKNOWN'; verified: boolean }[];
  source: string; slot: string;
}
export function evaluateSecurity(evidence: SecurityEvidence) {
  const checks: { code: string; status: 'PASS' | 'FAIL' | 'UNKNOWN'; text: string }[] = [];
  const check = (code: string, pass: boolean, text: string) => checks.push({ code, status: pass ? 'PASS' : 'FAIL', text });
  check('PROGRAM_SUPPORTED', evidence.program !== 'unsupported', 'Program token termasuk allowlist decoder.');
  check('MINT_INITIALIZED', evidence.initialized, 'Mint sudah diinisialisasi.');
  check('DECIMALS_SUPPORTED', Number.isInteger(evidence.decimals) && evidence.decimals >= 0 && evidence.decimals <= 18, 'Presisi mint didukung (0–18).');
  const validSupply = /^\d+$/.test(evidence.supplyRaw) && new D(evidence.supplyRaw).gt(0);
  check('SUPPLY_VALID', validSupply, 'Supply raw positif dan dapat diverifikasi.');
  check('MINT_AUTHORITY_DISABLED', !evidence.mintAuthority, 'Mint authority tidak aktif.');
  check('FREEZE_AUTHORITY_DISABLED', !evidence.freezeAuthority, 'Freeze authority tidak aktif.');
  // v1 intentionally supports no Token-2022 extensions, including metadata.
  check('EXTENSIONS_SUPPORTED', evidence.extensions.length === 0, 'Allowlist extension v1 kosong; transfer fee/hook/delegate/pausing dan extension lain ditolak.');
  let largestRatio: string | null = null, top10Ratio: string | null = null;
  const verified = validSupply && evidence.accounts.length > 0 && evidence.accounts.every((a) => a.verified && a.role !== 'UNKNOWN' && /^\d+$/.test(a.amountRaw));
  if (!verified) checks.push({ code: 'CONCENTRATION_UNKNOWN', status: 'UNKNOWN', text: 'Klasifikasi akun atau denominator belum terbukti; akun besar tidak otomatis dikecualikan.' });
  else {
    const amounts = evidence.accounts.filter((a) => a.role === 'HOLDER').map((a) => new D(a.amountRaw)).sort((a, b) => b.cmp(a));
    const total = evidence.accounts.reduce((s, a) => s.plus(a.amountRaw), new D(0));
    if (total.gt(evidence.supplyRaw) || new Set(evidence.accounts.map((a) => a.address)).size !== evidence.accounts.length) checks.push({ code: 'CONCENTRATION_UNKNOWN', status: 'UNKNOWN', text: 'Bukti supply/akun tidak konsisten.' });
    else {
      largestRatio = (amounts[0] ?? new D(0)).div(evidence.supplyRaw).toFixed();
      top10Ratio = amounts.slice(0, 10).reduce((s, a) => s.plus(a), new D(0)).div(evidence.supplyRaw).toFixed();
      check('LARGEST_ACCOUNT_LIMIT', new D(largestRatio).lte('0.20'), 'Akun holder terbesar maksimal 20% supply.');
      check('TOP10_ACCOUNT_LIMIT', new D(top10Ratio).lte('0.50'), 'Sepuluh akun holder terbesar maksimal 50% supply.');
    }
  }
  const status = checks.some((c) => c.status === 'FAIL') ? 'FAIL' as const : checks.some((c) => c.status === 'UNKNOWN') ? 'UNKNOWN' as const : 'PASS' as const;
  return { status, checks, largestRatio, top10Ratio, limitations: ['Lolos pemeriksaan terbatas bukan audit atau jaminan dapat menjual.', 'Kendali/lock LP dan afiliasi wallet: UNKNOWN.', 'Konsentrasi merupakan proksi akun, bukan jumlah pemilik independen.'] };
}
