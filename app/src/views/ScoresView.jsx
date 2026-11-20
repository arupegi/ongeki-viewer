import { useMemo, useState } from 'react';
import { Card } from '@astryxdesign/core/Card';
import { Table, proportional, pixel } from '@astryxdesign/core/Table';
import { TextInput } from '@astryxdesign/core/TextInput';
import { Selector } from '@astryxdesign/core/Selector';
import { Switch } from '@astryxdesign/core/Switch';
import { ToggleButton } from '@astryxdesign/core/ToggleButton';
import R from '../rating.js';
import { DIFFS } from '../store.js';
import { Diff, Rank, Lamps, Const, Stars, Num, f3, fmt, Muted, DIFF_SHORT } from '../ui.jsx';

const SORTS = [
  { value: 'rate', label: '単曲レート順' }, { value: 'prate', label: 'Pレート順' }, { value: 'score', label: 'スコア順' },
  { value: 'const', label: '定数順' }, { value: 'title', label: '曲名順' },
];
const LIMIT = 300;

export function ScoresView({ data, openChart }) {
  const [diffs, setDiffs] = useState(() => new Set(['EXPERT', 'MASTER', 'LUNATIC']));
  const [q, setQ] = useState('');
  const [lv, setLv] = useState('all');
  const [sort, setSort] = useState('rate');
  const [onlyEst, setOnlyEst] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const played = data.scores.filter((s) => s.played);
  const levels = useMemo(() => [...new Set(played.map((s) => s.level))].sort((a, b) => parseFloat(b) - parseFloat(a) || (b.includes('+') - a.includes('+'))), [data]); // eslint-disable-line react-hooks/exhaustive-deps

  const rows = useMemo(() => {
    let r = played.map((s) => data.byUid.get(s.uid) || { ...s, techRate: null, platRate: null, plat: R.platinumStars(s.platinum), _t: -1, _p: -1 });
    r = r.filter((c) => diffs.has(c.diff) && (lv === 'all' || c.level === lv) && (!q || c.title.toLowerCase().includes(q.toLowerCase())) && (!onlyEst || c.constEstimated || c.constInferred));
    const cmp = { rate: (a, b) => b._t - a._t, prate: (a, b) => b._p - a._p, score: (a, b) => (b.techScore || 0) - (a.techScore || 0), const: (a, b) => (b.const || 0) - (a.const || 0), title: (a, b) => a.title.localeCompare(b.title, 'ja') }[sort];
    return r.sort((a, b) => cmp(a, b) || DIFFS.indexOf(b.diff) - DIFFS.indexOf(a.diff));
  }, [data, diffs, q, lv, sort, onlyEst]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = (d) => setDiffs((s) => { const n = new Set(s); n.has(d) ? n.delete(d) : n.add(d); return n; });
  const cols = [
    { key: 'title', header: '曲名', width: proportional(3, { minWidth: 170 }), renderCell: (c) => (
      <span className="og-title-cell"><button type="button" className="og-link" onClick={() => openChart(c.uid)}>{c.title}</button>{c.isNew && <span className="og-new">NEW</span>}</span>
    ) },
    { key: 'diff', header: '難易度', width: pixel(64), renderCell: (c) => <Diff d={c.diff} /> },
    { key: 'const', header: '定数', width: pixel(80), align: 'end', renderCell: (c) => <Const c={c} /> },
    { key: 'techScore', header: 'スコア', width: pixel(96), align: 'end', renderCell: (c) => <Num>{fmt(c.techScore)}</Num> },
    { key: 'lamp', header: 'ランク', width: pixel(120), renderCell: (c) => <span className="og-ranklamp"><Rank ts={c.techScore} /><Lamps c={c} /></span> },
    { key: 'techRate', header: '単曲レート', width: pixel(90), align: 'end', renderCell: (c) => <span className="og-rate og-num">{c.techRate != null ? f3(c.techRate) : '—'}</span> },
    { key: 'pscore', header: 'Pスコア', width: pixel(84), align: 'end', renderCell: (c) => <Num>{c.platinum ? fmt(c.platinum.score) : '—'}</Num> },
    { key: 'stars', header: '☆', width: pixel(46), renderCell: (c) => <Stars p={c.platinum} /> },
    { key: 'platRate', header: 'Pレート', width: pixel(76), align: 'end', renderCell: (c) => <Num>{c.platRate != null ? f3(c.platRate) : '—'}</Num> },
  ];
  const shown = showAll ? rows : rows.slice(0, LIMIT);
  return (
    <Card padding={0}>
      <div className="og-card-head og-filters">
        <div className="og-row">
          {DIFFS.map((d) => (
            <ToggleButton key={d} size="sm" label={DIFF_SHORT[d]} isPressed={diffs.has(d)} onPressedChange={() => toggle(d)} />
          ))}
        </div>
        <div className="og-row og-filter-row">
          <TextInput label="曲名で検索" isLabelHidden placeholder="曲名で検索" value={q} onChange={setQ} hasClear size="sm" width={220} type="search" />
          <Selector label="レベル" isLabelHidden size="sm" value={lv} onChange={(v) => setLv(v || 'all')}
            options={[{ value: 'all', label: '全レベル' }, ...levels.map((l) => ({ value: l, label: `Lv ${l}` }))]} />
          <Selector label="並び順" isLabelHidden size="sm" value={sort} onChange={setSort} options={SORTS} />
          <Switch label="未登録の定数のみ" size="sm" value={onlyEst} onChange={setOnlyEst} />
        </div>
        <Muted>{fmt(rows.length)} 譜面</Muted>
      </div>
      {rows.length ? <Table data={shown} columns={cols} idKey="uid" density="compact" hasHover /> : <div className="og-empty">条件に合う譜面がありません</div>}
      {rows.length > LIMIT && !showAll && (
        <div className="og-card-foot"><button type="button" className="og-link" onClick={() => setShowAll(true)}>残り {fmt(rows.length - LIMIT)} 譜面も表示する</button></div>
      )}
    </Card>
  );
}
