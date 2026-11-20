import { useState } from 'react';
import { Card } from '@astryxdesign/core/Card';
import { Heading } from '@astryxdesign/core/Heading';
import { Text } from '@astryxdesign/core/Text';
import { Table, proportional, pixel } from '@astryxdesign/core/Table';
import { Banner } from '@astryxdesign/core/Banner';
import { SegmentedControl, SegmentedControlItem } from '@astryxdesign/core/SegmentedControl';
import { Collapsible } from '@astryxdesign/core/Collapsible';
import R from '../rating.js';
import { Diff, Rank, Lamps, Const, Stars, Num, f3, fmt, Muted } from '../ui.jsx';

const FRAMES = {
  new: { name: '新曲枠', count: 10, desc: '現バージョン（Re:Fresh Act.2）の曲から、単曲レートが高い順に10譜面', mode: 'tech', next: 'nextNew' },
  best: { name: 'ベスト枠', count: 50, desc: 'それより前のバージョンの曲から、単曲レートが高い順に50譜面', mode: 'tech', next: 'nextBest' },
  platinum: { name: 'P枠', count: 50, desc: '全譜面から、プラチナスコアによるレートが高い順に50譜面', mode: 'plat', next: 'nextPlatinum' },
};

export function RatingView({ data, openChart }) {
  const { comp } = data;
  const p = data.player || {};
  const [frame, setFrame] = useState('new');
  const delta = p.rating != null ? Math.round((p.rating - comp.total) * 1000) / 1000 : null;
  const inFrames = [...comp.frames.new, ...comp.frames.best, ...comp.frames.platinum];
  const uniq = (l) => [...new Map(l.map((c) => [c.uid, c])).values()];
  const calc = uniq(inFrames.filter((c) => c.constInferred));
  const est = uniq(inFrames.filter((c) => c.constEstimated));

  return (
    <div className="og-stack">
      <Card padding={5}>
        <div className="og-hero">
          <div className="og-hero-main">
            <Text type="supporting">RATING（オンゲキNET）</Text>
            <div className="og-big og-num">{f3(p.rating)}</div>
            <div className="og-hero-sub">
              <span>MAX <Num>{f3(p.ratingMax)}</Num></span>
              <span>計算値 <Num strong>{f3(comp.total)}</Num>{' '}
                {delta === 0 ? <span className="og-ok">一致</span> : delta != null ? <span className="og-warn">差 {delta > 0 ? '+' : ''}{f3(delta)}</span> : null}
              </span>
            </div>
          </div>
          <div className="og-hero-frames">
            {Object.entries(FRAMES).map(([k, f]) => (
              <button key={k} type="button" className={`og-frame og-frame-${k} ${frame === k ? 'is-active' : ''}`} onClick={() => setFrame(k)}>
                <span className="og-frame-name">{f.name}<small>{f.count}譜面</small></span>
                <span className="og-frame-val og-num">+{f3(comp.part[k])}</span>
                <span className="og-frame-sub og-num">平均 {f3(comp.avg[k])} ・ 最低 {f3(comp.border[k])}</span>
              </button>
            ))}
          </div>
        </div>
      </Card>

      {calc.length > 0 && (
        <Banner status="success" collapsible={false} title={`未登録の譜面定数を${calc.length}件逆算しました`}
          description={calc.map((c) => `${c.title}（${c.diff}）${c.const.toFixed(1)}`).join('、')} />
      )}
      {est.length > 0 && (
        <Banner status="warning" collapsible={false} title={`定数を1つに絞れない譜面が${est.length}件あります`}
          description="範囲の最小値で計算しています。曲名を押すと定数を手入力できます。" />
      )}

      <Card padding={0}>
        <div className="og-card-head">
          <SegmentedControl value={frame} onChange={setFrame} label="表示する枠">
            {Object.entries(FRAMES).map(([k, f]) => <SegmentedControlItem key={k} value={k} label={f.name} />)}
          </SegmentedControl>
          <Muted>{FRAMES[frame].desc}</Muted>
        </div>
        <FrameTable list={comp.frames[frame]} mode={FRAMES[frame].mode} net={comp.net[frame]} openChart={openChart} />
        <div className="og-card-foot">
          <Collapsible trigger={<Text type="label">次点の候補（{Math.min(10, comp.frames[FRAMES[frame].next].length)}譜面）</Text>} defaultIsOpen={false}>
            <FrameTable list={comp.frames[FRAMES[frame].next].slice(0, 10)} mode={FRAMES[frame].mode} startIndex={FRAMES[frame].count}
              border={comp.frames[frame]} openChart={openChart} isNext />
          </Collapsible>
        </div>
      </Card>

      <Formula />
    </div>
  );
}

function FrameTable({ list, mode, net, openChart, startIndex = 0, border, isNext }) {
  const borderMilli = border && border.length ? (mode === 'tech' ? border[border.length - 1]._t : border[border.length - 1]._p) : null;
  const rows = list.map((c, i) => ({ ...c, _idx: startIndex + i + 1 }));
  const title = {
    key: 'title', header: '曲名', width: proportional(3, { minWidth: 160 }),
    renderCell: (c) => (
      <span className="og-title-cell">
        <button type="button" className="og-link" onClick={() => openChart(c.uid)}>{c.title}</button>
        {net && net.size > 0 && !net.has(c.uid) && <span className="og-flag" title="オンゲキNETの表示ではこの枠に入っていません">NETと相違</span>}
        {isNext && <NextHint c={c} mode={mode} borderMilli={borderMilli} />}
      </span>
    ),
  };
  const common = [
    { key: '_idx', header: '#', width: pixel(40), renderCell: (c) => <span className="og-muted og-num">{c._idx}</span> },
    title,
    { key: 'diff', header: '難易度', width: pixel(64), renderCell: (c) => <Diff d={c.diff} /> },
    { key: 'const', header: '定数', width: pixel(76), align: 'end', renderCell: (c) => <Const c={c} /> },
  ];
  const cols = mode === 'tech' ? [
    ...common,
    { key: 'techScore', header: 'スコア', width: pixel(96), align: 'end', renderCell: (c) => <Num>{fmt(c.techScore)}</Num> },
    { key: 'lamp', header: 'ランク', width: pixel(120), renderCell: (c) => <span className="og-ranklamp"><Rank ts={c.techScore} /><Lamps c={c} /></span> },
    { key: 'techRate', header: '単曲レート', width: pixel(92), align: 'end', renderCell: (c) => <span className="og-rate og-num">{f3(c.techRate)}</span> },
  ] : [
    ...common,
    { key: 'pscore', header: 'Pスコア', width: pixel(116), align: 'end', renderCell: (c) => <Num>{fmt(c.platinum?.score)}<span className="og-muted"> / {fmt(c.platinum?.max)}</span></Num> },
    { key: 'ratio', header: '割合', width: pixel(70), align: 'end', renderCell: (c) => <Num>{fmt((c.plat.ratio || 0) * 100, 2)}%</Num> },
    { key: 'stars', header: '☆', width: pixel(48), renderCell: (c) => <Stars p={c.platinum} /> },
    { key: 'platRate', header: 'レート', width: pixel(78), align: 'end', renderCell: (c) => <span className="og-rate og-num">{f3(c.platRate)}</span> },
  ];
  if (!rows.length) return <div className="og-empty">対象の譜面がありません</div>;
  return <Table data={rows} columns={cols} idKey="uid" density="compact" hasHover dividers="rows" />;
}

function NextHint({ c, mode, borderMilli }) {
  if (borderMilli == null) return null;
  if (mode === 'tech') {
    const need = R.requiredScore(c, borderMilli + 1);
    if (need == null) return <span className="og-hint">ランプ更新が必要</span>;
    if (need > (c.techScore || 0)) return <span className="og-hint">あと <b className="og-num">{fmt(need - c.techScore)}</b> 点（{fmt(need)}）で枠入り</span>;
    return null;
  }
  const st = c.plat.stars || 0;
  if (st >= 5 || !c.const) return null;
  const c10 = Math.round(c.const * 10);
  const needStars = Math.ceil(((borderMilli + 1) * 100) / (c10 * c10));
  return needStars <= 5 ? <span className="og-hint">☆{needStars}で枠入り</span> : null;
}

function Formula() {
  return (
    <Card padding={4}>
      <Collapsible trigger={<Heading level={3}>レーティングの計算方法</Heading>} defaultIsOpen={false}>
        <div className="og-formula">
          <p><b>全体</b>＝（新曲枠10譜面 ＋ ベスト枠50譜面 ＋ P枠50譜面 のレート合計）÷ 50。小数第3位で切り捨て。</p>
          <p><b>単曲レート</b>＝ 譜面定数 ＋ スコア補正 ＋ ランク（SS +0.1 / SSS +0.2 / SSS+ +0.3）＋ ランプ（FC +0.1 / AB +0.3 / AB+ +0.35）＋ FULL BELL +0.05</p>
          <div className="og-scroll">
            <table className="og-mini">
              <tbody>
                <tr><th>スコア</th><td>80万</td><td>90万</td><td>97万</td><td>99万</td><td>100万</td><td>100.75万</td><td>101万</td></tr>
                <tr><th>補正</th><td>−6.0</td><td>−4.0</td><td>±0</td><td>+0.75</td><td>+1.25</td><td>+1.75</td><td>+2.0</td></tr>
              </tbody>
            </table>
          </div>
          <p><b>P枠</b>＝ ☆の数 × 譜面定数² ÷ 1000。☆は理論値に対する割合で決まる（94%で☆1、95%で☆2、96%で☆3、97%で☆4、98%以上で☆5）。</p>
          <p className="og-muted">新曲枠は Re:Fresh Act.2 で追加された曲。Re:Fresh（Act.1）の曲はベスト枠に入る。譜面定数は otoge-db.net の有志データを使い、未登録のものはNETのレート対象曲と公式レートから逆算する。</p>
        </div>
      </Collapsible>
    </Card>
  );
}
