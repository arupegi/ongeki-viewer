// 画面共通の小さな部品
import R from './rating.js';
import { Text } from '@astryxdesign/core/Text';

export const fmt = (n, d = 0) => (n == null || isNaN(n) ? '—' : Number(n).toLocaleString('ja-JP', { minimumFractionDigits: d, maximumFractionDigits: d }));
export const f3 = (n) => fmt(n, 3);
export const DIFF_SHORT = { BASIC: 'BAS', ADVANCED: 'ADV', EXPERT: 'EXP', MASTER: 'MAS', LUNATIC: 'LUN' };
export const RANK_LABEL = { sssplus: 'SSS+', sss: 'SSS', ss: 'SS', s: 'S', aaa: 'AAA', aa: 'AA', a: 'A', bbb: 'BBB', bb: 'BB', b: 'B', c: 'C', d: 'D' };
export function techRankOf(ts) {
  if (ts == null) return '';
  const T = [[1007500, 'sssplus'], [1000000, 'sss'], [990000, 'ss'], [970000, 's'], [940000, 'aaa'], [900000, 'aa'], [850000, 'a'], [800000, 'bbb'], [750000, 'bb'], [700000, 'b'], [500000, 'c']];
  for (const [s, r] of T) if (ts >= s) return r;
  return 'd';
}

export const Diff = ({ d }) => <span className={`og-diff og-diff-${d}`}>{DIFF_SHORT[d] || d}</span>;
export const Rank = ({ ts }) => { const r = techRankOf(ts); return r ? <span className={`og-rank og-rank-${r}`}>{RANK_LABEL[r]}</span> : null; };
export function Lamps({ c }) {
  let lamp = c.lamp;
  if (lamp === 'AB' && c.techScore >= 1010000) lamp = 'AB+';
  if (!lamp && !c.fullBell) return null;
  return (
    <span className="og-lamps">
      {lamp && <span className={`og-lamp og-lamp-${lamp === 'AB+' ? 'ABP' : lamp}`}>{lamp}</span>}
      {c.fullBell && <span className="og-lamp og-lamp-FB">FB</span>}
    </span>
  );
}
export const METHOD_LABEL = { total: '公式レートとの一致から逆算', order: 'NETのレート対象曲の並び順から逆算', both: '公式レートとの一致と並び順から逆算', level: 'レベル表記の範囲' };
export function Const({ c }) {
  if (c.const == null) return '—';
  if (c.constManual) return <span className="og-num">{c.const.toFixed(1)}<span className="og-mark og-mark-man" title="手動入力の定数">手</span></span>;
  if (c.constInferred) return <span className="og-num">{c.const.toFixed(1)}<span className="og-mark og-mark-calc" title={METHOD_LABEL[c.constMethod]}>計</span></span>;
  if (c.constEstimated) {
    const r = c.constRange;
    return <span className="og-num">{r && r[0] !== r[1] ? `${r[0].toFixed(1)}–${r[1].toFixed(1)}` : c.const.toFixed(1)}<span className="og-mark og-mark-est" title="定数未確定。計算には最小値を使用">?</span></span>;
  }
  return <span className="og-num">{c.const.toFixed(1)}</span>;
}
export function Stars({ p }) {
  const s = R.platinumStars(p);
  if (!s.stars) return <span className="og-muted og-num">☆0</span>;
  return <span className={`og-stars ${s.rainbow ? 'og-rainbow' : ''}`}>☆{s.stars}</span>;
}
export const Num = ({ children, strong }) => <span className={`og-num ${strong ? 'og-strong' : ''}`}>{children}</span>;
export const Muted = ({ children }) => <Text type="supporting">{children}</Text>;

// 判定内訳（1行）
export function JudgeLine({ d }) {
  if (!d) return <span className="og-muted">—</span>;
  return (
    <span className="og-jd">
      <span className="og-cb">CB <b>{fmt(d.criticalBreak)}</b></span>
      <span className="og-br">B <b>{fmt(d.break)}</b></span>
      <span className="og-hi">H <b>{fmt(d.hit)}</b></span>
      <span className="og-ms">M <b>{fmt(d.miss)}</b></span>
      <span>BELL <b>{fmt(d.bell)}/{fmt(d.bellTotal)}</b></span>
      <span>DMG <b>{fmt(d.damage)}</b></span>
    </span>
  );
}
// 判定内訳（詳細）
export function Breakdown({ d, techScore }) {
  if (!d) return <Muted>このプレイの内訳は記録されていません（内訳の取得に対応する前に取り込んだプレイです）。</Muted>;
  const notes = [d.criticalBreak, d.break, d.hit, d.miss].every((v) => v != null) ? d.criticalBreak + d.break + d.hit + d.miss : null;
  const Cell = ({ k, v, sub, cls, bg }) => (
    <div className={`og-jcell ${bg ? "og-jc-" + bg : ""}`}><div className="og-jk">{k}</div><div className={`og-jv ${cls || ''}`}>{v}{sub && <small> {sub}</small>}</div></div>
  );
  return (
    <div className="og-breakdown">
      <div className="og-jgrid">
        <Cell k="CRITICAL BREAK" v={fmt(d.criticalBreak)} cls="og-cb" bg="cb" />
        <Cell k="BREAK" v={fmt(d.break)} cls="og-br" bg="br" />
        <Cell k="HIT" v={fmt(d.hit)} cls="og-hi" bg="hit" />
        <Cell k="MISS" v={fmt(d.miss)} cls="og-ms" bg="miss" />
        <Cell k="BELL" v={fmt(d.bell)} sub={`/ ${fmt(d.bellTotal)}`} />
        <Cell k="DAMAGE" v={fmt(d.damage)} />
        <Cell k="MAX COMBO" v={fmt(d.maxCombo)} sub={notes ? `/ ${fmt(notes)}` : ''} />
        {techScore != null && <Cell k="理論値まで" v={`−${fmt(1010000 - techScore)}`} />}
      </div>
      {d.rates && Object.keys(d.rates).length > 0 && (
        <div className="og-rates">{Object.entries(d.rates).map(([k, v]) => <span key={k}>{k} <b>{fmt(v)}%</b></span>)}</div>
      )}
    </div>
  );
}

// 折れ線グラフ（SVG）
export function LineChart({ points, fmtY = (v) => v.toFixed(3), minPad = 0.01, empty, label }) {
  if (points.length < 2) return <div className="og-empty">{empty || 'データを2回以上取り込むと推移グラフが表示されます。'}</div>;
  const W = 640, H = 200, L = 64, Rm = 14, T = 12, B = 28;
  const xs = points.map((p) => p.x), ys = points.map((p) => p.y);
  let x0 = Math.min(...xs), x1 = Math.max(...xs); if (x0 === x1) { x0 -= 1; x1 += 1; }
  let y0 = Math.min(...ys), y1 = Math.max(...ys);
  const pad = Math.max((y1 - y0) * 0.15, minPad); y0 -= pad; y1 += pad;
  const sx = (x) => L + ((x - x0) / (x1 - x0)) * (W - L - Rm);
  const sy = (y) => T + (1 - (y - y0) / (y1 - y0)) * (H - T - B);
  const d = points.map((p, i) => `${i ? 'L' : 'M'}${sx(p.x).toFixed(1)},${sy(p.y).toFixed(1)}`).join('');
  const area = `${d}L${sx(points[points.length - 1].x).toFixed(1)},${H - B}L${sx(points[0].x).toFixed(1)},${H - B}Z`;
  const last = points[points.length - 1];
  const dl = (t) => { const z = new Date(t); return `${z.getMonth() + 1}/${z.getDate()}`; };
  return (
    <svg className="og-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label}>
      {[0, 1, 2, 3, 4].map((i) => {
        const v = y0 + ((y1 - y0) * i) / 4; const y = sy(v);
        return <g key={i}><line x1={L} x2={W - Rm} y1={y} y2={y} className="og-grid" /><text x={L - 6} y={y + 4} textAnchor="end">{fmtY(v)}</text></g>;
      })}
      <path d={area} className="og-area" />
      <path d={d} className="og-line" />
      {points.map((p, i) => <circle key={i} cx={sx(p.x)} cy={sy(p.y)} r="2.5" className="og-dot"><title>{p.label}</title></circle>)}
      <circle cx={sx(last.x)} cy={sy(last.y)} r="5" className="og-dot-last" />
      <text x={L} y={H - 8}>{dl(x0)}</text>
      <text x={W - Rm} y={H - 8} textAnchor="end">{dl(x1)}</text>
    </svg>
  );
}
