import { useState } from 'react';
import { Card } from '@astryxdesign/core/Card';
import { Heading } from '@astryxdesign/core/Heading';
import { SegmentedControl, SegmentedControlItem } from '@astryxdesign/core/SegmentedControl';
import { Collapsible } from '@astryxdesign/core/Collapsible';
import { parseDate, fmtDate } from '../store.js';
import { Diff, Rank, Lamps, fmt, Muted, JudgeLine, Breakdown } from '../ui.jsx';

export const evTime = (e) => parseDate(e.at);
const KIND = { tech: 'テクニカル', lamp: 'ランプ', fb: 'FULL BELL', plat: 'プラチナ' };

export function EventItem({ e, withTitle = true, openChart }) {
  const isNum = e.type === 'tech' || e.type === 'plat';
  return (
    <div className="og-ev">
      <div className="og-ev-when og-num">{String(e.at).includes('T') ? fmtDate(Date.parse(e.at)) : e.at}</div>
      <div className="og-ev-what">
        <div className="og-row og-gap-sm">
          {withTitle && <Diff d={e.diff} />}
          {withTitle && (e.uid && openChart ? <button type="button" className="og-link og-strong" onClick={() => openChart(e.uid)}>{e.title}</button> : <b>{e.title}</b>)}
          <span className={`og-kind og-kind-${e.type}`}>{KIND[e.type]}</span>
        </div>
        <div className="og-row og-gap-sm">
          {isNum ? (
            <>
              {e.from != null && <><span className="og-num og-muted">{fmt(e.from)}</span><span className="og-muted">→</span></>}
              <span className="og-num og-up">{fmt(e.to)}</span>
              {e.type === 'tech' && <Rank ts={e.to} />}
              {e.from != null && <span className="og-num og-up-small">+{fmt(e.to - e.from)}</span>}
            </>
          ) : (
            <>{e.from && <><span className="og-muted">{e.from}</span><span className="og-muted">→</span></>}<span className="og-up">{e.to}</span></>
          )}
          {e.play && <Lamps c={{ ...e.play, techScore: e.to }} />}
          {e.src === 'snapshot' && <Muted>取り込み時に検出</Muted>}
          {e.src === 'first' && <Muted>初回取り込みの履歴から</Muted>}
        </div>
        {e.type === 'tech' && e.detail && (
          <Collapsible trigger={<JudgeLine d={e.detail} />} defaultIsOpen={false}>
            <div className="og-pad-top"><Breakdown d={e.detail} techScore={e.to} /></div>
          </Collapsible>
        )}
        {e.type === 'tech' && !e.detail && e.src === 'snapshot' && <Muted>内訳なし（プレイ履歴50件より前のプレイ）</Muted>}
      </div>
    </div>
  );
}

export function PbView({ S, openChart }) {
  const [kind, setKind] = useState('all');
  const evs = S.pb.filter((e) => kind === 'all' || e.type === kind).sort((a, b) => evTime(b) - evTime(a));
  return (
    <Card padding={4}>
      <div className="og-row og-space">
        <Heading level={2}>自己ベスト更新履歴</Heading>
        <SegmentedControl value={kind} onChange={setKind} label="種類" size="sm">
          <SegmentedControlItem value="all" label="すべて" />
          <SegmentedControlItem value="tech" label="スコア" />
          <SegmentedControlItem value="lamp" label="ランプ" />
          <SegmentedControlItem value="plat" label="プラチナ" />
        </SegmentedControl>
      </div>
      <Muted>取り込むたびに前回との差分とプレイ履歴から記録し、自己ベストを出したプレイの判定内訳も保存します（{evs.length}件）。内訳の行を押すと詳しく開きます。</Muted>
      {evs.length ? (
        <div className="og-timeline">{evs.slice(0, 400).map((e, i) => <EventItem key={i} e={e} openChart={openChart} />)}</div>
      ) : <div className="og-empty">まだ記録がありません。データを取り込むと、自己ベストの更新がここに並びます。</div>}
    </Card>
  );
}
