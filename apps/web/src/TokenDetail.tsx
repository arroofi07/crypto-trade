import type { ReactNode } from 'react';
import type { NewsItem, Snapshot, TxnSeries } from '@memecoin/contracts';
import type { TokenView } from './dto';
import { dexLabel, pctChange, pctClass, supplyShare, time, usdCompact, usdPrice } from './format';
import { BuySellChart } from './Chart';

function Badge({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={`badge ${className ?? ''}`.trim()}>{children}</span>;
}

function Metric({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <div className="metric-card">
      <p className="metric-label">{label}</p>
      <p className="metric-value">{value}</p>
      {hint ? <p className="metric-hint">{hint}</p> : null}
    </div>
  );
}

function TxnRow({ label, buys, sells }: { label: string; buys: number | null | undefined; sells: number | null | undefined }) {
  const total = buys != null && sells != null ? buys + sells : null;
  const buyShare = total && buys != null ? Math.round((buys / total) * 100) : null;
  return (
    <tr>
      <th scope="row">{label}</th>
      <td className="buy-side">{buys ?? '—'}</td>
      <td className="sell-side">{sells ?? '—'}</td>
      <td>{total ?? '—'}</td>
      <td>
        {buyShare != null ? (
          <span className="txn-share" title={`Buy ${buyShare}% · Sell ${100 - buyShare}%`}>
            <span className="txn-share-buy" style={{ width: `${buyShare}%` }} />
          </span>
        ) : '—'}
      </td>
    </tr>
  );
}

function ChangeGrid({ snap }: { snap: Snapshot }) {
  const rows = [
    { key: '5m', v: snap.priceChangeM5Pct },
    { key: '1j', v: snap.priceChangeH1Pct },
    { key: '6j', v: snap.priceChangeH6Pct },
    { key: '24j', v: snap.priceChangeH24Pct },
  ];
  return (
    <div className="change-grid">
      {rows.map((r) => (
        <div key={r.key} className="change-cell">
          <span className="metric-label">{r.key}</span>
          <span className={pctClass(r.v)}>{pctChange(r.v) ?? '—'}</span>
        </div>
      ))}
    </div>
  );
}

function VolumeGrid({ snap }: { snap: Snapshot }) {
  const rows = [
    { label: '5 menit', v: snap.rollingVolume5mUsd },
    { label: '1 jam', v: snap.volumeH1Usd },
    { label: '6 jam', v: snap.volumeH6Usd },
    { label: '24 jam', v: snap.volume24hUsd },
  ];
  return (
    <div className="metric-grid metric-grid-4">
      {rows.map((r) => <Metric key={r.label} label={`Vol. ${r.label}`} value={usdCompact(r.v)} hint="Rolling DEX Screener" />)}
    </div>
  );
}

function CopyButton({ label, text, onDone }: { label: string; text: string; onDone: (msg: string) => void }) {
  return (
    <button type="button" className="ghost-btn" onClick={() => { void navigator.clipboard.writeText(text).then(() => onDone(`${label} disalin.`)).catch(() => onDone('Clipboard tidak tersedia.')); }}>
      Salin {label}
    </button>
  );
}

export function TokenDetail({
  token,
  txnSeries,
  news,
  onNotice,
}: {
  token: TokenView;
  txnSeries: TxnSeries | null;
  news: NewsItem[];
  onNotice: (message: string) => void;
}) {
  const snap = token.snapshot;
  const pool = token.pool;
  const dexHref = snap?.dexPairUrl ?? (pool ? `https://dexscreener.com/solana/${pool.address}` : null);

  return (
    <article className="token-detail">
      <header className="token-hero">
        <div className="token-hero-text">
          <p className="eyebrow">PASAR · DEX SCREENER</p>
          <h2 className="token-title">
            {token.symbol ?? 'Token'}
            {token.name ? <span className="token-name"> {token.name}</span> : null}
          </h2>
          <div className="token-badges">
            <Badge className={token.stale ? 'badge-warn' : 'badge-ok'}>{token.stale ? 'STALE' : 'FRESH'}</Badge>
            <Badge className={token.securityFresh ? 'badge-ok' : 'badge-warn'}>{token.security?.status ?? 'UNKNOWN'}{token.securityFresh ? ' · GATE OK' : ''}</Badge>
            <Badge>{token.candidateState}</Badge>
            {pool ? <Badge>{dexLabel(pool.dexId)}</Badge> : <Badge>Pool belum dipilih</Badge>}
          </div>
          <p className="token-reason">{token.reasonCodes.join(' · ') || 'Menunggu evaluasi'}</p>
        </div>
        <div className="token-hero-price">
          <p className="metric-label">Harga USD</p>
          <p className="token-price-usd">{snap ? usdPrice(snap.priceUsd) : '—'}</p>
          {snap?.priceNative ? <p className="token-price-native">Native: {snap.priceNative}</p> : null}
          <p className="metric-hint">Observasi: {time(snap?.observedAt)}</p>
          {dexHref ? <a className="dex-link" href={dexHref} target="_blank" rel="noreferrer">Buka di DEX Screener</a> : null}
        </div>
      </header>

      {!snap ? (
        <p className="empty">Belum ada observasi market. Tunggu polling berikutnya setelah pool kanonik terpilih.</p>
      ) : (
        <>
          <section className="token-section" aria-labelledby="token-market-heading">
            <h3 id="token-market-heading">Ringkasan pasar</h3>
            <MotionMetrics snap={snap} />
            <ChangeGrid snap={snap} />
          </section>

          <section className="token-section" aria-labelledby="token-volume-heading">
            <h3 id="token-volume-heading">Volume (rolling)</h3>
            <VolumeGrid snap={snap} />
          </section>

          <section className="token-section" aria-labelledby="token-txn-heading">
            <h3 id="token-txn-heading">Transaksi (buy / sell)</h3>
            <p className="section-lead">Agregat jendela DEX Screener pada pool kanonik — bukan daftar wallet.</p>
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col">Jendela</th>
                  <th scope="col">Buy</th>
                  <th scope="col">Sell</th>
                  <th scope="col">Total</th>
                  <th scope="col">Tekanan buy</th>
                </tr>
              </thead>
              <tbody>
                <TxnRow label="5 menit" buys={snap.txnsM5Buys} sells={snap.txnsM5Sells} />
                <TxnRow label="1 jam" buys={snap.txnsH1Buys} sells={snap.txnsH1Sells} />
                <TxnRow label="6 jam" buys={snap.txnsH6Buys} sells={snap.txnsH6Sells} />
                <TxnRow label="24 jam" buys={snap.txnsH24Buys} sells={snap.txnsH24Sells} />
              </tbody>
            </table>
            {txnSeries ? <BuySellChart series={txnSeries} /> : <p className="empty">Memuat riwayat buy/sell…</p>}
          </section>

          <section className="token-section" aria-labelledby="token-liquidity-heading">
            <h3 id="token-liquidity-heading">Likuiditas pool</h3>
            <div className="metric-grid metric-grid-3">
              <Metric label="USD" value={usdCompact(snap.liquidityUsd)} />
              <Metric label="Base (token)" value={snap.liquidityBase ?? '—'} />
              <Metric label="Quote" value={snap.liquidityQuote ?? '—'} />
            </div>
          </section>
        </>
      )}

      <section className="token-section" aria-labelledby="token-id-heading">
        <h3 id="token-id-heading">Identitas on-chain</h3>
        <dl className="token-ids">
          <div><dt>Mint</dt><dd><code className="address">{token.mint}</code><CopyButton label="mint" text={token.mint} onDone={onNotice} /></dd></div>
          <div><dt>Pool kanonik</dt><dd><code className="address">{pool?.address ?? 'Belum ditemukan'}</code>{pool ? <CopyButton label="pool" text={pool.address} onDone={onNotice} /> : null}</dd></div>
          <div><dt>Quote mint</dt><dd><code className="address">{pool?.quoteMint ?? '—'}</code></dd></div>
          <div><dt>Pool dibuat (sumber)</dt><dd>{pool ? time(pool.createdAtSource) : '—'}</dd></div>
          <div><dt>Warm-up sejak</dt><dd>{time(token.warmupSince)}</dd></div>
        </dl>
      </section>

      <section className="token-section" aria-labelledby="token-security-heading">
        <h3 id="token-security-heading">Keamanan (terbatas)</h3>
        <p className="section-lead">
          <Badge className={token.securityFresh ? 'badge-ok' : 'badge-warn'}>{token.security?.status ?? 'UNKNOWN'}{token.securityFresh ? ' · GATE OK' : ''}</Badge>
          {' '}· pemeriksaan {time(token.security?.checkedAt)}
          {' '}· {token.securityFresh ? 'Gate sinyal lolos (mint/freeze/extension). Konsentrasi UNKNOWN tidak memblokir.' : 'Gate sinyal diblokir: FAIL mint/freeze/extension/konsentrasi, atau RPC belum siap.'}
        </p>
        <div className="metric-grid metric-grid-3">
          <Metric label="Akun terbesar" value={supplyShare(token.security?.largestRatio)} hint="Batas PASS ≤ 20% supply" />
          <Metric label="Top 10 akun" value={supplyShare(token.security?.top10Ratio)} hint="Batas PASS ≤ 50% supply" />
          <Metric label="Status gate" value={token.securityFresh ? 'Lolos gate' : 'Diblokir'} hint="Proksi akun, bukan jumlah orang" />
        </div>
        {(token.security?.checks ?? []).map((c) => <p key={c.code} className="security-line"><strong>{c.status}</strong> — {c.text}</p>)}
        {!token.security?.checks?.length ? <p className="empty">Belum ada bukti RPC terbaru.</p> : null}
      </section>

      <details className="token-limitations">
        <summary>Keterbatasan data</summary>
        {token.limitations.map((t) => <p key={t}>{t}</p>)}
      </details>

      {news.length ? (
        <section className="token-section" aria-labelledby="token-news-heading">
          <h3 id="token-news-heading">Berita terkait</h3>
          <ul className="news-list">{news.map((n) => (
            <li key={n.id}><a href={n.canonicalUrl} target="_blank" rel="noreferrer">{n.title}</a><p>{n.publisher} · {time(n.publishedAt)}</p></li>
          ))}</ul>
        </section>
      ) : (
        <p className="empty token-news-empty">Belum ada berita terkait mint ini.</p>
      )}
    </article>
  );
}

function MotionMetrics({ snap }: { snap: Snapshot }) {
  return (
    <div className="metric-grid metric-grid-4">
      <Metric label="Likuiditas" value={usdCompact(snap.liquidityUsd)} />
      <Metric label="Market cap" value={usdCompact(snap.marketCapUsd)} {...(snap.marketCapUsd ? {} : { hint: 'Provider tidak kirim' })} />
      <Metric label="FDV" value={usdCompact(snap.fdvUsd)} {...(snap.fdvUsd ? {} : { hint: 'Provider tidak kirim' })} />
      <Metric label="Vol. 24j" value={usdCompact(snap.volume24hUsd)} />
    </div>
  );
}
