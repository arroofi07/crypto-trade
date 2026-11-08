import { lazy, StrictMode, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { z } from 'zod';
import { discoveryCandidateSchema, entryRequestSchema, experimentSchema, healthSchema, newsSchema, signalSchema, txnSeriesSchema } from '@memecoin/contracts';
import type { DiscoveryCandidate, Health, NewsItem, Signal, TxnSeries } from '@memecoin/contracts';
import { api, serverNow, stream, token } from './api';
import { portfolioView, positionView, previewSchema, settingsView, tokenView } from './dto';
import type { PortfolioView, PositionView, Preview, TokenView } from './dto';
const Journal = lazy(() => import('./Journal').then((module) => ({ default: module.Journal })));
const TokenDetail = lazy(() => import('./TokenDetail').then((module) => ({ default: module.TokenDetail })));
import { time } from './format';
import './styles.css';

export const money = (value: string | null | undefined) => value == null ? 'Tidak dapat dinilai' : new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 2 }).format(Number(value));
export { time } from './format';
export function Panel({ title, children }: { title: string; children: ReactNode }) { return <section className="panel"><h2>{title}</h2>{children}</section>; }
function Empty({ children }: { children: ReactNode }) { return <p className="empty">{children}</p>; }
function Badge({ children }: { children: ReactNode }) { return <span className="badge">{children}</span>; }
function NewsList({ items }: { items: NewsItem[] }) { return items.length ? <ul className="news-list">{items.map((n) => <li key={n.id}><a href={n.canonicalUrl} target="_blank" rel="noreferrer">{n.title}</a><p>{n.publisher} · {n.matchStatus} · {n.source === 'manual' ? 'Input manual' : 'RSS'}</p><small>Terbit: {time(n.publishedAt)} · Ditemukan: {time(n.firstSeenAt)}</small><p>{n.summary}</p></li>)}</ul> : <Empty>Belum ada berita terkait. Cakupan terbatas; ketiadaan berita bukan bukti ketiadaan risiko.</Empty>; }

function App() {
  const [page, setPage] = useState('Ringkasan'), [health, setHealth] = useState<Health | null>(null);
  const [portfolios, setPortfolios] = useState<PortfolioView[]>([]), [portfolioId, setPortfolioId] = useState('');
  const [watchlist, setWatchlist] = useState<TokenView[]>([]), [discovery, setDiscovery] = useState<DiscoveryCandidate[]>([]), [signals, setSignals] = useState<Signal[]>([]), [positions, setPositions] = useState<PositionView[]>([]), [news, setNews] = useState<NewsItem[]>([]);
  const [connected, setConnected] = useState(false), [healthy, setHealthy] = useState(false), [loading, setLoading] = useState(false), [busy, setBusy] = useState(false);
  const [error, setError] = useState(''), [notice, setNotice] = useState(''), [now, setNow] = useState(serverNow());
  const [selectedSignal, setSelectedSignal] = useState<string | null>(null), [preview, setPreview] = useState<Preview | null>(null), [selectedToken, setSelectedToken] = useState<TokenView | null>(null), [tokenNews, setTokenNews] = useState<NewsItem[]>([]), [txnSeries, setTxnSeries] = useState<TxnSeries | null>(null);
  const [closing, setClosing] = useState<PositionView | null>(null), [polling, setPolling] = useState(30);
  const dialog = useRef<HTMLDialogElement>(null), actionLock = useRef(false), keys = useRef(new Map<string, string>()), mounted = useRef(true), loadingRef = useRef(false);
  const selectedPortfolio = portfolios.find((p) => p.id === portfolioId), signal = signals.find((s) => s.id === selectedSignal);
  const live = healthy && connected;
  const load = useCallback(async () => {
    if (!token || loadingRef.current) return;
    loadingRef.current = true; setLoading(true);
    try {
      const [h, p, w, d, s, pos, n, settings] = await Promise.all([
        api('/health', healthSchema), api('/portfolios', z.array(portfolioView)), api('/watchlist', z.array(tokenView)), api('/discovery', z.array(discoveryCandidateSchema)), api('/signals', z.array(signalSchema)), api('/positions', z.array(positionView)), api('/news', z.array(newsSchema)), api('/settings', settingsView),
      ]);
      if (!mounted.current) return;
      setHealth(h); setPortfolios(p); setPortfolioId((id) => p.some((x) => x.id === id) ? id : (p.find((x) => x.mode === 'manual')?.id ?? p[0]?.id ?? ''));
      setWatchlist(w); setDiscovery(d); setSignals(s); setPositions(pos); setNews(n); setPolling(settings.pollingSeconds); setHealthy(true); setError(''); setNow(serverNow());
    } catch (failure) { if (mounted.current) { setHealthy(false); setError(failure instanceof Error ? failure.message : 'Gagal memuat data.'); } }
    finally { loadingRef.current = false; if (mounted.current) setLoading(false); }
  }, []);
  useEffect(() => {
    mounted.current = true; const controller = new AbortController(); void load();
    let debounce: ReturnType<typeof setTimeout> | undefined;
    if (token) void stream(controller.signal, () => { clearTimeout(debounce); debounce = setTimeout(() => { void load(); }, 100); }, (state) => { if (mounted.current) { setConnected(state); if (!state) { setHealthy(false); setPreview(null); } } });
    const interval = setInterval(() => { void load(); }, 15_000), ticker = setInterval(() => setNow(serverNow()), 1000);
    return () => { mounted.current = false; controller.abort(); clearTimeout(debounce); clearInterval(interval); clearInterval(ticker); };
  }, [load]);
  useEffect(() => { setPreview(null); }, [portfolioId, selectedSignal]);
  useEffect(() => { if (closing) dialog.current?.showModal(); else dialog.current?.close(); }, [closing]);
  async function act(action: () => Promise<void>) {
    if (actionLock.current) return; actionLock.current = true; setBusy(true); setError('');
    try { await action(); await load(); } catch (failure) { setError(failure instanceof Error ? failure.message : 'Aksi gagal.'); }
    finally { setBusy(false); actionLock.current = false; }
  }
  function key(action: string) { const old = keys.current.get(action); if (old) return old; const value = crypto.randomUUID(); keys.current.set(action, value); return value; }
  async function inspect(mint: string) {
    await act(async () => {
      const [detail, articles, txns] = await Promise.all([
        api(`/tokens/${mint}`, tokenView), api(`/news?mint=${mint}`, z.array(newsSchema)), api(`/tokens/${mint}/txn-series`, txnSeriesSchema),
      ]);
      setSelectedToken(detail); setTokenNews(articles); setTxnSeries(txns);
    });
  }
  useEffect(() => {
    if (!selectedToken || !token) return;
    const refresh = () => { void api(`/tokens/${selectedToken.mint}/txn-series`, txnSeriesSchema).then((data) => { if (mounted.current) setTxnSeries(data); }).catch(() => undefined); };
    refresh();
    const id = setInterval(refresh, 15_000);
    return () => clearInterval(id);
  }, [selectedToken?.mint, token]);
  function submitExperiment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    void act(async () => { const experiment = await api('/experiments', experimentSchema, { method: 'POST', body: { fxUsdIdr: String(form.get('fx')), activate: form.get('activate') === 'on' } }); setPortfolioId(experiment.portfolios.find((p) => p.mode === 'manual')!.id); setNotice('Eksperimen dibuat. Strategy dan manual masing-masing memiliki modal virtual Rp500.000.'); });
  }
  const statusText = !token ? 'Sesi belum tersedia. Jalankan pnpm start atau pnpm dev untuk membuka dashboard.' : error.startsWith('Sesi') ? error : !healthy ? loading ? 'Memeriksa koneksi…' : 'Backend tidak terjangkau atau data belum tervalidasi.' : connected ? 'Backend lokal terhubung' : 'Stream terputus · aksi entry dinonaktifkan';
  const entryDisabled = busy || !live || !signal || signal.state !== 'VALID' || now >= Date.parse(signal.expiresAt) || selectedPortfolio?.mode !== 'manual' || !!selectedPortfolio.unpriced || !!selectedPortfolio.daily.haltedAt;
  return <main className="layout">
    <header className="topbar"><div><span className="brand">MEMECOIN / TRADE</span><p>Ruang analisis lokal · Solana</p></div><Badge>SIMULASI · TANPA WALLET</Badge></header>
    <nav aria-label="Navigasi utama">{['Ringkasan','Penemuan','Watchlist','Sinyal','Posisi','Jurnal','Berita','Pengaturan','Kesehatan'].map((name) => <button key={name} aria-current={page === name ? 'page' : undefined} onClick={() => setPage(name)}>{name}</button>)}</nav>
    <div className="statusbar"><p role="status">{statusText}</p><button disabled={!token || loading} onClick={() => { void load(); }}>Periksa ulang</button></div>
    {error && <p role="alert" className="alert">{error}</p>}{notice && <p className="notice" aria-live="polite">{notice}</p>}
    <div className="page-head"><div><p className="eyebrow">WORKSPACE / {page.toUpperCase()}</p><h1>{page === 'Ringkasan' ? 'Amati. Uji. Evaluasi.' : page}</h1></div><label>Portfolio<select aria-label="Portfolio" value={portfolioId} onChange={(e) => setPortfolioId(e.target.value)}><option value="">Belum ada eksperimen</option>{portfolios.map((p) => <option key={p.id} value={p.id}>{p.mode} · {p.experimentId.slice(0, 8)}</option>)}</select></label></div>
    {page === 'Jurnal' && <Suspense fallback={<p>Memuat jurnal…</p>}><Journal portfolioId={portfolioId} revision={positions.map((p) => `${p.id}:${p.state}`).join(',')} /></Suspense>}
    {page === 'Ringkasan' && <>
      <p className="intro">Bukti dan risiko lebih dahulu. Seluruh posisi di sini adalah simulasi dengan model biaya, bukan transaksi on-chain.</p>
      {!portfolios.length && <Panel title="Mulai dengan kurs asumsi"><p>Masukkan kurs USD/IDR untuk membuat dua portfolio terpisah. Kurs dibekukan dan tidak diklaim sebagai kurs live.</p><button onClick={() => setPage('Pengaturan')}>Buat eksperimen</button></Panel>}
      {selectedPortfolio && <div className="stats"><Panel title="Ekuitas simulasi"><strong>{money(selectedPortfolio.equityIdr)}</strong><p>{selectedPortfolio.unpriced ? 'UNPRICED · entry diblokir' : `Portfolio ${selectedPortfolio.mode}`}</p></Panel><Panel title="Kas tersedia"><strong>{money(selectedPortfolio.availableCashIdr)}</strong><p>Reservation: {money(selectedPortfolio.reservedCashIdr)}</p></Panel><Panel title="Risiko terbuka"><strong>{money(selectedPortfolio.openRiskIdr)}</strong><p>{selectedPortfolio.daily.haltedAt ? 'DAILY HALT aktif' : 'Termasuk pending reservation'}</p></Panel></div>}
      <div className="grid-two"><Panel title="Pantauan"><p>{watchlist.length} mint · {discovery.length} kandidat penemuan · {signals.filter((s) => s.state === 'VALID').length} sinyal valid · {positions.filter((p) => p.portfolioId === portfolioId && p.state !== 'CLOSED').length} posisi aktif.</p><p>Minimal 60 bar sampel lengkap sebelum evaluasi sinyal. Penemuan memindai feed, meta, dan pencarian DEX Screener (bukan seluruh chain). Urutan = skor aturan, bukan rekomendasi profit.</p><button onClick={() => setPage('Penemuan')}>Buka penemuan</button></Panel><Panel title="Batas bukti"><p>Security PASS berarti lolos pemeriksaan terbatas. Jika klasifikasi akun belum terbukti, status tetap UNKNOWN dan entry diblokir.</p><p>Tidak ada data atau pemantauan ketika PC/aplikasi berhenti.</p></Panel></div>
    </>}
    {page === 'Pengaturan' && <div className="grid-two"><Panel title="Eksperimen baru"><form onSubmit={submitExperiment}><label>Kurs USD/IDR<input name="fx" aria-label="Kurs USD/IDR" required inputMode="decimal" pattern="[0-9]+([.][0-9]+)?" placeholder="Contoh asumsi: 16000" /></label><label className="check"><input type="checkbox" name="activate" />Aktifkan simulasi otomatis pada portfolio strategy</label><p>Modal Rp500.000 masing-masing. Risiko posisi 0,5%, total 1,5%, daily halt 2%. Mengubah kurs membuat eksperimen baru.</p><button type="submit" disabled={busy || !healthy}>Simpan eksperimen</button></form></Panel><Panel title="Pengambilan data"><form onSubmit={(event) => { event.preventDefault(); void act(async () => { await api('/settings', z.object({ pollingSeconds: z.number() }).passthrough(), { method: 'PATCH', body: { pollingSeconds: polling } }); setNotice('Interval diperbarui.'); }); }}><label>Interval polling (detik)<input type="number" min="30" max="300" value={polling} onChange={(e) => setPolling(Number(e.target.value))} /></label><button disabled={busy || !healthy}>Simpan interval</button></form><p>Waktu tampilan UTC+7. Bot token tidak disimpan melalui dashboard.</p></Panel></div>}
    {page === 'Penemuan' && <>
      <Panel title="Antrean kandidat (DEX Screener)"><p>Menggabungkan feed (boost, profil, ads, takeover), meta trending, dan pencarian — diputar setiap ~10 menit. Bukan seluruh chain Solana. Skor = aturan likuiditas/volume/usia pool.</p>
        {!discovery.length ? <Empty>Belum ada kandidat. Job penemuan berjalan ~10 menit sekali saat aplikasi hidup.</Empty> : <div className="cards">{discovery.map((c) => <article className="panel" key={c.id}><div className="row"><h2>{c.symbol ?? c.mint.slice(0, 10)}</h2><Badge>Skor {c.score}</Badge></div><code className="address">{c.mint}</code><p>{c.reasonCodes.join(' · ')}</p><p>Likuiditas USD {Number(c.liquidityUsd).toLocaleString('en-US')} · DEX {c.dexId}</p><p>Terlihat: {time(c.lastSeenAt)}</p><div className="actions"><button disabled={busy || !healthy} onClick={() => { void act(async () => { await api(`/discovery/${c.mint}/promote`, z.object({ id: z.string() }).passthrough(), { method: 'POST', body: {} }); setNotice('Mint dipromosikan ke watchlist. Menunggu warm-up dan keamanan.'); }); }}>Pantau</button><button disabled={busy || !healthy} onClick={() => { void act(async () => { await api(`/discovery/${c.mint}/dismiss`, z.unknown(), { method: 'POST', body: {} }); }); }}>Abaikan</button></div></article>)}</div>}
      </Panel>
    </>}
    {page === 'Watchlist' && <>
      <Panel title="Tambah mint Solana"><form className="inline-form" onSubmit={(event) => { event.preventDefault(); const form = event.currentTarget, mint = String(new FormData(form).get('mint')); void act(async () => { await api('/watchlist', z.object({ id: z.string() }).passthrough(), { method: 'POST', body: { mint } }); form.reset(); setNotice('Mint ditambahkan. Menunggu observasi dan pemeriksaan keamanan.'); }); }}><label>Alamat mint<input name="mint" aria-label="Alamat mint" required minLength={32} maxLength={44} /></label><button disabled={busy || !healthy}>Tambah watchlist</button></form></Panel>
      {!watchlist.length ? <Empty>Watchlist kosong. Tambahkan alamat mint, bukan ticker.</Empty> : <div className="cards">{watchlist.map((t) => <article className="panel" key={t.id}><div className="row"><h2>{t.symbol ?? 'Token belum dikenal'}</h2><Badge>{t.stale ? 'STALE' : t.candidateState}</Badge></div><code className="address">{t.mint}</code><p>{t.reasonCodes.join(' · ') || 'Menunggu evaluasi'}</p><p>Observasi: {time(t.snapshot?.observedAt)}</p><div className="actions"><button onClick={() => { void inspect(t.mint); }}>Detail token</button><button onClick={() => { void act(async () => { await api(`/watchlist/${t.mint}`, z.unknown(), { method: 'DELETE', body: {} }); }); }}>Nonaktifkan pantauan</button></div></article>)}</div>}
      {selectedToken && <Panel title={`Detail ${selectedToken.symbol ?? 'token'}`}>
        <Suspense fallback={<p>Memuat detail…</p>}>
          <TokenDetail token={selectedToken} txnSeries={txnSeries} news={tokenNews} onNotice={setNotice} />
        </Suspense>
      </Panel>}
    </>}
    {page === 'Sinyal' && <div className="grid-two"><Panel title="Sinyal dan keputusan"><p>Skenario bersyarat, tanpa probabilitas profit. Expiry 120 detik; target dihitung per portfolio.</p>{!signals.length ? <Empty>Belum ada sinyal. Periksa warm-up, kesegaran pasar, dan bukti keamanan di watchlist.</Empty> : signals.map((s) => <button className="signal-item" key={s.id} onClick={() => setSelectedSignal(s.id)}><span>{s.token.symbol ?? s.token.mint.slice(0, 12)}</span><Badge>{now >= Date.parse(s.expiresAt) && s.state === 'VALID' ? 'EXPIRED' : s.state}</Badge><small>{time(s.publishedAt)}</small></button>)}</Panel>
      {signal ? <Panel title={`Detail sinyal ${signal.token.symbol ?? ''}`}><code className="address">{signal.token.mint}</code><p>Pool: {String((signal.evidence.pool as { address?: string } | undefined)?.address ?? signal.poolId)}</p><p>Entry USD {signal.entry.lowUsd} – {signal.entry.highUsd} · Stop USD {signal.entry.stopUsd}</p><p>Berlaku sampai {time(signal.expiresAt)} · hold maksimal {signal.exitPlan.maxHoldMinutes} menit.</p><p>Observasi {time(signal.dataQuality.observedAt)} · Security {signal.security.status} ({time(signal.security.checkedAt)})</p><p>{signal.scenarios.bullish}</p><p>{signal.scenarios.neutral}</p><p>{signal.scenarios.bearish}</p><details><summary>Bukti dan alasan</summary>{signal.reasons.map((r) => <p key={r.code}>{r.text}</p>)}<p>Versi: {signal.strategyVersion} · {signal.configHash}</p><p>{signal.security.limitations.join(' ')}</p></details><NewsList items={news.filter((n) => signal.newsIds.includes(n.id))} />
        <button disabled={entryDisabled} onClick={() => { void act(async () => { setPreview(await api(`/signals/${signal.id}/preview`, previewSchema, { method: 'POST', body: { portfolioId } })); }); }}>Hitung preview</button>
        {selectedPortfolio?.mode !== 'manual' && <p>Entry pilihan pengguna menggunakan portfolio manual.</p>}
        {preview && <div className="preview"><h3>{preview.allowed ? 'Preview simulasi' : 'Entry diblokir'}</h3><p>{preview.reasonCodes.join(' · ')}</p><dl><dt>Quantity</dt><dd>{preview.quantity}</dd><dt>Biaya entry total</dt><dd>{money(preview.entryCostIdr)}</dd><dt>Risiko terencana</dt><dd>{money(preview.plannedLossIdr)}</dd><dt>Target observasi USD</dt><dd>{Number(preview.targetObservedUsd).toPrecision(8)}</dd><dt>Reward target net</dt><dd>{money(preview.targetRewardIdr)}</dd></dl><p>Slippage {Number(preview.feeAssumptions.slippage) * 100}%/sisi, fee {Number(preview.feeAssumptions.feeRate) * 100}% + {money(preview.feeAssumptions.fixedFeeIdr)}/sisi. Nominal dihitung ulang saat fill.</p><button disabled={entryDisabled || !preview.allowed || now >= Date.parse(preview.expiresAt)} onClick={() => { void act(async () => { const entry = await api('/paper/entries', entryRequestSchema, { method: 'POST', body: { signalId: signal.id, portfolioId }, key: key(`entry:${portfolioId}:${signal.id}`) }); setNotice(`SIMULASI ${entry.state}: ${entry.state === 'PENDING' ? 'menunggu observasi valid berikutnya.' : entry.reasonCodes.join(', ')}`); setPreview(null); }); }}>Simulasikan masuk</button></div>}
      </Panel> : <Empty>Pilih sinyal untuk melihat bukti dan menghitung risiko.</Empty>}</div>}
    {page === 'Posisi' && <Panel title="Posisi simulasi"><p>Portfolio {selectedPortfolio?.mode ?? 'belum dipilih'} · fill memakai observasi, bukan harga threshold.</p>{!positions.some((p) => p.portfolioId === portfolioId) ? <Empty>Belum ada posisi pada portfolio ini. Entry PENDING menunggu observasi berikutnya.</Empty> : positions.filter((p) => p.portfolioId === portfolioId).map((p) => <article className="position" key={p.id}><div className="row"><code className="address">{p.mint}</code><Badge>{p.stale && p.state !== 'CLOSED' ? 'UNPRICED / STALE' : p.state}</Badge></div><p>Quantity raw {p.quantityRaw} · entry {money(p.entryCostIdr)} · risiko {money(p.plannedRiskIdr)}</p><p>Stop USD {p.stopPrice} · Target USD {Number(p.targetPrice).toPrecision(8)} · batas hold {time(p.dueAt)}</p><p>Harga observasi {p.snapshot?.priceUsd ?? 'Tidak tersedia'} · {time(p.snapshot?.observedAt)}</p><p>{p.qualityFlags.join(' · ')} {p.exitIntent && p.state !== 'CLOSED' ? `Exit ${p.exitIntent.reason} menunggu observasi berikutnya.` : ''}</p>{p.state === 'CLOSED' ? <p>Net PnL: {money(p.pnlIdr)} · alasan {p.exitReason}</p> : <button disabled={busy || !healthy || !!p.exitIntent} onClick={() => setClosing(p)}>Tutup simulasi</button>}</article>)}</Panel>}
    {page === 'Berita' && <div className="grid-two"><Panel title="Catat link manual"><form onSubmit={(event) => { event.preventDefault(); const form = event.currentTarget, data = new FormData(form); void act(async () => { await api('/news', newsSchema, { method: 'POST', body: { title: String(data.get('title')), url: String(data.get('url')), ...(data.get('mint') ? { mint: String(data.get('mint')) } : {}) } }); form.reset(); }); }}><label>Judul<input name="title" required maxLength={300} /></label><label>URL sumber<input type="url" name="url" required /></label><label>Mint terkait (opsional)<input name="mint" maxLength={44} /></label><button disabled={busy || !healthy}>Simpan link</button></form><p>Link manual tidak diambil oleh server dan tetap berstatus belum diverifikasi. Feed otomatis belum diaktifkan.</p></Panel><Panel title="Konteks berita"><NewsList items={news} /></Panel></div>}
    {page === 'Kesehatan' && <Panel title="Kesehatan sistem"><dl><dt>Database</dt><dd>{health?.database ?? 'Tidak diketahui'}</dd><dt>Provider market</dt><dd>{health?.providers ?? 'Tidak diketahui'}</dd><dt>Scheduler</dt><dd>{health?.scheduler ?? 'Tidak diketahui'}</dd><dt>Telegram</dt><dd>{health?.telegram ?? 'Tidak diketahui'}</dd><dt>Data gap</dt><dd>{health?.dataGap ?? 'unknown'}</dd></dl>{health?.jobs?.map((job) => <p key={job.id}>{job.id}: sukses {time(job.lastSucceededAt)} · {job.lastErrorCode ?? 'tanpa error tercatat'}</p>)}{health?.limitations?.map((text) => <p key={text}>{text}</p>)}</Panel>}
    <dialog ref={dialog} onCancel={() => setClosing(null)} aria-labelledby="close-title"><h2 id="close-title">Konfirmasi tutup simulasi</h2><p>Exit akan menunggu observasi valid berikutnya. Harga dan biaya model dapat berbeda dari tampilan terakhir.</p><div className="actions"><button autoFocus onClick={() => setClosing(null)}>Batal</button><button disabled={busy} onClick={() => { if (closing) void act(async () => { await api(`/positions/${closing.id}/close`, z.unknown(), { method: 'POST', body: { confirmed: true }, key: key(`close:${closing.id}`) }); setClosing(null); setNotice('Exit intent tersimpan; menunggu observasi berikutnya.'); }); }}>Konfirmasi exit</button></div></dialog>
    <footer>SIMULASI BERBASIS MODEL BIAYA · Tidak ada jaminan keuntungan, wallet, atau transaksi uang nyata.</footer>
  </main>;
}
createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
