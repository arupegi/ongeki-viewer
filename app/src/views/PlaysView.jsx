import { useMemo, useState } from 'react';
import { Card } from '@astryxdesign/core/Card';
import { Table, proportional, pixel } from '@astryxdesign/core/Table';
import { TextInput } from '@astryxdesign/core/TextInput';
import { Switch } from '@astryxdesign/core/Switch';
import { playKey } from '../store.js';
import { Diff, Rank, Lamps, Num, fmt, Muted, JudgeLine } from '../ui.jsx';

export function PlaysView({ data, S, openPlay }) {
  const plays = data.sample ? data.playlog || [] : S.plays;
  const [q, setQ] = useState('');
  const [pbOnly, setPbOnly] = useState(false);
  const pbKeys = useMemo(() => new Set(S.pb.filter((e) => e.playKey).map((e) => e.playKey)), [S.pb]);
  const rows = plays.filter((p) => (!q || p.title.toLowerCase().includes(q.toLowerCase())) && (!pbOnly || pbKeys.has(playKey(p))))
    .map((p) => ({ ...p, _k: playKey(p) }));
  const cols = [
    { key: 'date', header: '日時', width: pixel(140), renderCell: (p) => <span className="og-num og-muted og-nowrap">{p.date}</span> },
    { key: 'title', header: '曲名', width: proportional(3, { minWidth: 170 }), renderCell: (p) => (
      <span className="og-title-cell">
        <button type="button" className="og-link" onClick={() => openPlay(p._k)}>{p.title}</button>
        {pbKeys.has(p._k) && <span className="og-pb">自己ベスト更新</span>}
      </span>
    ) },
    { key: 'diff', header: '難易度', width: pixel(64), renderCell: (p) => <Diff d={p.diff} /> },
    { key: 'techScore', header: 'スコア', width: pixel(96), align: 'end', renderCell: (p) => <Num>{fmt(p.techScore)}</Num> },
    { key: 'lamp', header: 'ランク', width: pixel(116), renderCell: (p) => <span className="og-ranklamp"><Rank ts={p.techScore} /><Lamps c={p} /></span> },
    { key: 'detail', header: '内訳', width: proportional(3, { minWidth: 300 }), renderCell: (p) => <JudgeLine d={p.detail} /> },
  ];
  return (
    <Card padding={0}>
      <div className="og-card-head og-filters">
        <div className="og-row og-filter-row">
          <TextInput label="曲名で検索" isLabelHidden placeholder="曲名で検索" value={q} onChange={setQ} hasClear size="sm" width={220} type="search" />
          <Switch label="自己ベスト更新のみ" size="sm" value={pbOnly} onChange={setPbOnly} />
        </div>
        <Muted>オンゲキNETは最新50件までしか残らないため、取り込むたびにここへ積み上げて保存します（{fmt(plays.length)}件）。曲名を押すと内訳を大きく表示します。</Muted>
      </div>
      {rows.length ? <Table data={rows} columns={cols} idKey="_k" density="compact" hasHover /> : <div className="og-empty">プレイ履歴がありません</div>}
    </Card>
  );
}
