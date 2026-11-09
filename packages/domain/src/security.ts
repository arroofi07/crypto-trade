import { D } from './decimal.js';

export interface SecurityEvidence {
  program: 'token' | 'token2022' | 'unsupported'; initialized: boolean; decimals: number; supplyRaw: string;
  mintAuthority: boolean; freezeAuthority: boolean; extensions: number[];
  accounts: { address: string; amountRaw: string; role: 'HOLDER' | 'POOL' | 'BURN' | 'UNKNOWN'; verified: boolean }[];
  source: string; slot: string;
}

/** ImmutableOwner, MetadataPointer, TokenMetadata, GroupPointer, GroupMemberPointer, TokenGroup, TokenGroupMember */
export const ALLOWED_TOKEN2022_EXTENSIONS = new Set([7, 18, 19, 20, 21, 22, 23]);
const SIGNAL_FAIL_CODES = new Set([
  'PROGRAM_SUPPORTED', 'MINT_INITIALIZED', 'DECIMALS_SUPPORTED', 'SUPPLY_VALID',
  'MINT_AUTHORITY_DISABLED', 'FREEZE_AUTHORITY_DISABLED', 'EXTENSIONS_SUPPORTED',
  'LARGEST_ACCOUNT_LIMIT', 'TOP10_ACCOUNT_LIMIT',
]);
const MINT_READY_CODES = ['PROGRAM_SUPPORTED', 'MINT_INITIALIZED', 'DECIMALS_SUPPORTED', 'SUPPLY_VALID'] as const;

export function securityTradable(checks: Array<{ code: string; status: 'PASS' | 'FAIL' | 'UNKNOWN' }>) {
  const ready = MINT_READY_CODES.every((code) => checks.some((c) => c.code === code && c.status === 'PASS'));
  return ready && !checks.some((c) => SIGNAL_FAIL_CODES.has(c.code) && c.status === 'FAIL');
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
  const blockedExt = evidence.extensions.filter((kind) => !ALLOWED_TOKEN2022_EXTENSIONS.has(kind));
  check('EXTENSIONS_SUPPORTED', blockedExt.length === 0, blockedExt.length ? `Extension berbahaya/tidak didukung: ${blockedExt.join(', ')}.` : 'Extension hanya metadata/group/immutable owner, atau tidak ada.');
  let largestRatio: string | null = null, top10Ratio: string | null = null;
  const usable = evidence.accounts.filter((a) => /^\d+$/.test(a.amountRaw));
  const verified = validSupply && usable.length > 0 && usable.every((a) => a.verified && a.role !== 'UNKNOWN');
  const counted = verified ? usable.filter((a) => a.role === 'HOLDER') : usable;
  const amounts = counted.map((a) => new D(a.amountRaw)).sort((a, b) => b.cmp(a));
  const total = usable.reduce((s, a) => s.plus(a.amountRaw), new D(0));
  if (validSupply && amounts.length && new Set(usable.map((a) => a.address)).size === usable.length && total.lte(evidence.supplyRaw)) {
    largestRatio = (amounts[0] ?? new D(0)).div(evidence.supplyRaw).toFixed();
    top10Ratio = amounts.slice(0, 10).reduce((s, a) => s.plus(a), new D(0)).div(evidence.supplyRaw).toFixed();
  }
  if (!verified) checks.push({ code: 'CONCENTRATION_UNKNOWN', status: 'UNKNOWN', text: 'Klasifikasi akun (LP/burn vs holder) belum terbukti; rasio dihitung sebagai proksi termasuk akun tak terklasifikasi.' });
  else if (!amounts.length || total.gt(evidence.supplyRaw) || new Set(usable.map((a) => a.address)).size !== usable.length) checks.push({ code: 'CONCENTRATION_UNKNOWN', status: 'UNKNOWN', text: 'Bukti supply/akun tidak konsisten.' });
  else {
    check('LARGEST_ACCOUNT_LIMIT', new D(largestRatio!).lte('0.20'), 'Akun holder terbesar maksimal 20% supply.');
    check('TOP10_ACCOUNT_LIMIT', new D(top10Ratio!).lte('0.50'), 'Sepuluh akun holder terbesar maksimal 50% supply.');
  }
  const status = checks.some((c) => c.status === 'FAIL') ? 'FAIL' as const : checks.some((c) => c.status === 'UNKNOWN') ? 'UNKNOWN' as const : 'PASS' as const;
  return { status, checks, largestRatio, top10Ratio, tradable: securityTradable(checks), limitations: ['Lolos pemeriksaan terbatas bukan audit atau jaminan dapat menjual.', 'Kendali/lock LP dan afiliasi wallet: UNKNOWN.', 'Konsentrasi merupakan proksi akun, bukan jumlah pemilik independen.'] };
}
