import { useState } from 'react';
import { Card } from '@astryxdesign/core/Card';
import { Heading } from '@astryxdesign/core/Heading';
import { SegmentedControl, SegmentedControlItem } from '@astryxdesign/core/SegmentedControl';
import { TextInput } from '@astryxdesign/core/TextInput';
import { Switch } from '@astryxdesign/core/Switch';
import * as store from '../store.js';
import { fmt, Muted } from '../ui.jsx';
import { fmtDate } from '../store.js';

export function CardsView({ data, S }) {
  const cards = data.cards || [];
  const [rar, setRar] = useState('all');
  const [attr, setAttr] = useState('all');
  const [q, setQ] = useState('');
  const rars = [...new Set(cards.map((c) => c.rarity).filter(Boolean))];
  const list = cards.filter((c) => (rar === 'all' || c.rarity === rar) && (attr === 'all' || c.attribute === attr) && (!q || c.name.includes(q)));
  return (
    <Card padding={4}>
      <div className="og-row og-space">
        <Heading level={2}>所持カード</Heading>
        <Muted>{fmt(cards.length)}枚・開花済み {fmt(cards.filter((c) => c.kaika).length)}枚</Muted>
      </div>
      {!data.sample && (
        <div className="og-row og-space og-pad-top">
          <Muted>カード一覧は時間短縮のため7日に1回だけ読み直します（最終取得 {data.cardsFetchedAt ? fmtDate(Date.parse(data.cardsFetchedAt)) : '—'}）。</Muted>
          <Switch label="次回の取り込みでカードも読み直す" size="sm" value={!!S.forceCards} onChange={(v) => store.setForceCards(v)} />
        </div>
      )}
      <div className="og-row og-filter-row og-pad-y">
        <SegmentedControl value={rar} onChange={setRar} label="レアリティ" size="sm">
          <SegmentedControlItem value="all" label="すべて" />
          {rars.map((r) => <SegmentedControlItem key={r} value={r} label={r} />)}
        </SegmentedControl>
        <SegmentedControl value={attr} onChange={setAttr} label="属性" size="sm">
          <SegmentedControlItem value="all" label="全属性" />
          <SegmentedControlItem value="fire" label="FIRE" />
          <SegmentedControlItem value="aqua" label="AQUA" />
          <SegmentedControlItem value="leaf" label="LEAF" />
        </SegmentedControl>
        <TextInput label="カード名で検索" isLabelHidden placeholder="キャラ名・カード名" value={q} onChange={setQ} hasClear size="sm" width={200} type="search" />
      </div>
      {list.length ? (
        <div className="og-cards">
          {list.map((c, i) => (
            <div className="og-card" key={i}>
              <div className={`og-card-img og-attr-bg-${c.attribute}`}>
                {c.imageUrl ? <img src={c.imageUrl} alt={c.name} loading="lazy" referrerPolicy="no-referrer" onError={(e) => e.currentTarget.remove()} /> : null}
                <span className="og-card-ph">{c.rarity}</span>
              </div>
              <div className="og-card-meta">
                <div className="og-row og-gap-sm">
                  {c.attribute && <span className={`og-attr og-attr-${c.attribute}`}>{c.attribute.toUpperCase()}</span>}
                  <span className="og-rar">{c.rarity}</span>
                  {c.kaika && <span className="og-kaika">開花</span>}
                  <span className="og-card-stars">{'★'.repeat(c.stars || 0)}</span>
                </div>
                <div className="og-card-name">{c.name.replace(/^【.+?】/, '')}</div>
              </div>
            </div>
          ))}
        </div>
      ) : <div className="og-empty">条件に合うカードがありません</div>}
    </Card>
  );
}
