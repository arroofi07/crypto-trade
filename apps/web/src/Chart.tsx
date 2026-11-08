import { useEffect, useRef } from 'react';
import { createChart, ColorType, LineSeries } from 'lightweight-charts';
import type { UTCTimestamp } from 'lightweight-charts';
import type { Bar, EquitySnapshot, TxnSeries } from '@memecoin/contracts';

export function SampleChart({ bars }: { bars: Bar[] }) {
  const container = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!container.current) return;
    const chart = createChart(container.current, { autoSize: true, height: 260, layout: { background: { type: ColorType.Solid, color: '#101b2e' }, textColor: '#a9b8ce', attributionLogo: true }, grid: { vertLines: { color: '#1f2c40' }, horzLines: { color: '#1f2c40' } }, timeScale: { timeVisible: true } });
    // Separate line series at every incomplete or missing minute: never bridge a gap.
    let segment: { time: UTCTimestamp; value: number }[] = [];
    const flush = () => { if (segment.length) chart.addSeries(LineSeries, { color: '#61ddbc', lineWidth: 2, lastValueVisible: false, priceLineVisible: false }).setData(segment); segment = []; };
    let previous: Bar | undefined;
    for (const bar of bars) {
      if (!bar.complete || bar.gap || (previous && bar.openAt !== previous.closeAt)) flush();
      if (bar.complete && !bar.gap) segment.push({ time: Math.floor(Date.parse(bar.closeAt) / 1000) as UTCTimestamp, value: Number(bar.close) });
      previous = bar;
    }
    flush(); chart.timeScale().fitContent();
    return () => { chart.remove(); };
  }, [bars]);
  return <figure><div ref={container} className="chart" aria-label="Grafik harga sampel USD" /><figcaption>Harga sampel 1 menit · garis terputus pada gap · bukan seluruh transaksi. <a href="https://www.tradingview.com/" target="_blank" rel="noreferrer">TradingView Lightweight Charts™</a> © TradingView, Inc.</figcaption></figure>;
}

function TxnBarDiagram({ title, counts, color, side }: { title: string; counts: { observedAt: string; value: number }[]; color: string; side: 'buy' | 'sell' }) {
  const window = counts.slice(-72);
  const max = Math.max(1, ...window.map((p) => p.value));
  const latest = window.at(-1)?.value;
  return (
    <figure className={`txn-bars-figure txn-bars-${side}`}>
      <div className="txn-bars-head">
        <h3>{title}</h3>
        {latest != null ? <p className="txn-bars-latest">Terakhir: <strong>{latest}</strong> tx</p> : null}
      </div>
      {!window.length ? <p className="empty">Belum ada sampel.</p> : (
        <div className="txn-bars" role="img" aria-label={`Diagram batang ${side}: jumlah transaksi rolling 5 menit per observasi polling`}>
          {window.map((p) => {
            const label = new Date(p.observedAt).toLocaleString('id-ID', { timeZone: 'Asia/Bangkok', hour: '2-digit', minute: '2-digit', hour12: false });
            return (
              <div key={p.observedAt} className="txn-bar-cell" title={`${label} UTC+7 · ${p.value} transaksi`}>
                <div className="txn-bar" style={{ height: `${(p.value / max) * 100}%`, backgroundColor: color }} />
              </div>
            );
          })}
        </div>
      )}
      <p className="txn-bars-axis">Kiri = lebih lama · kanan = terbaru · setiap batang = hitungan tx rolling 5m saat polling</p>
    </figure>
  );
}

export function BuySellChart({ series }: { series: TxnSeries }) {
  const latest = series.latest;
  const buys = series.points.map((p) => ({ observedAt: p.observedAt, value: p.buysM5 }));
  const sells = series.points.map((p) => ({ observedAt: p.observedAt, value: p.sellsM5 }));
  return (
    <section className="txn-charts" aria-label="Transaksi buy dan sell pool">
      {latest ? (
        <p className="txn-summary" aria-live="polite">
          Tekanan 5m: <strong className="buy-side">BUY {latest.buysM5}</strong> vs <strong className="sell-side">SELL {latest.sellsM5}</strong>
          {' '}· dominan <BadgeLike leader={latest.leaderM5} />
          {latest.buysH1 != null && latest.sellsH1 != null && latest.leaderH1 ? <> · 1j: BUY {latest.buysH1} vs SELL {latest.sellsH1} ({latest.leaderH1})</> : null}
          {' '}· {new Date(latest.observedAt).toLocaleString('id-ID', { timeZone: 'Asia/Bangkok', hour12: false })} UTC+7
        </p>
      ) : <p className="empty">Belum ada data buy/sell. Tunggu beberapa siklus polling market.</p>}
      <div className="txn-bars-grid">
        <TxnBarDiagram title="Transaksi BUY" counts={buys} color="#3ecf8e" side="buy" />
        <TxnBarDiagram title="Transaksi SELL" counts={sells} color="#ff6b6b" side="sell" />
      </div>
      <p className="txn-footnote">{series.limitations.join(' ')}</p>
    </section>
  );
}
function BadgeLike({ leader }: { leader: 'BUY' | 'SELL' | 'TIE' }) {
  const label = leader === 'BUY' ? 'BUY lebih tinggi' : leader === 'SELL' ? 'SELL lebih tinggi' : 'Seimbang';
  return <span className={`badge txn-${leader.toLowerCase()}`}>{label}</span>;
}

export function EquityChart({ points }: { points: EquitySnapshot[] }) {
  const container = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!container.current) return;
    const chart = createChart(container.current, { autoSize: true, height: 240, layout: { background: { type: ColorType.Solid, color: '#101b2e' }, textColor: '#a9b8ce', attributionLogo: true }, timeScale: { timeVisible: true } });
    let segment: { time: UTCTimestamp; value: number }[] = [], previous = 0;
    const flush = () => { if (segment.length) chart.addSeries(LineSeries, { color: '#61ddbc', lastValueVisible: false, priceLineVisible: false }).setData(segment); segment = []; };
    for (const point of points) { const time = Math.floor(Date.parse(point.observedAt) / 1000); if (point.equityIdr === null || (previous && time - previous > 90)) flush(); if (point.equityIdr !== null) { const item = { time: time as UTCTimestamp, value: Number(point.equityIdr) }; if (segment.at(-1)?.time === time) segment[segment.length - 1] = item; else segment.push(item); } previous = time; }
    flush(); chart.timeScale().fitContent(); return () => chart.remove();
  }, [points]);
  return <figure><div ref={container} aria-label="Grafik ekuitas simulasi IDR" /><figcaption>Ekuitas IDR · gap tidak diinterpolasi. <a href="https://www.tradingview.com/" target="_blank" rel="noreferrer">TradingView Lightweight Charts™</a> © TradingView, Inc.</figcaption></figure>;
}
