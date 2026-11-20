import { useMemo, useState } from 'react';
import { Card } from '@astryxdesign/core/Card';
import { Heading } from '@astryxdesign/core/Heading';
import { SegmentedControl, SegmentedControlItem } from '@astryxdesign/core/SegmentedControl';
import { TextInput } from '@astryxdesign/core/TextInput';
import { Selector } from '@astryxdesign/core/Selector';
import { Switch } from '@astryxdesign/core/Switch';
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog';
import * as store from '../store.js';
import { fmtDate } from '../store.js';
import { fmt, Muted } from '../ui.jsx';

const SORTS = [
  { value: 'default', label: 'NETの並び順' }, { value: 'attack', label: '攻撃力が高い順' },
  { value: 'level', label: 'レベルが高い順' }, { value: 'name', label: '名前順' },
];
const SKILL_LABEL = { attack: 'ATTACK', boost: 'BOOST', guard: 'GUARD', assist: 'ASSIST', danger: 'DANGER', support: 'SUPPORT' };

export function CardsView({ data, S }) {
  const details = store.getCardDetails();
  const cards = useMemo(() => (data.cards || []).map((c, i) => ({ ...c, _i: i, d: details[store.cardId(c)] || c.sampleDetail || null })), [data, details]);
  const [rar, setRar] = useState('all');
  const [attr, setAttr] = useState('all');
  const [bloom, setBloom] = useState('all');
  const [sort, setSort] = useState('default');
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(null);
  const rars = [...new Set(cards.map((c) => c.rarity).filter(Boolean))];
  const bloomOf = (c) => (c.chokaika ? 'chokaika' : c.kaika ? 'kaika' : 'none');
  const list = cards
    .filter((c) => (rar === 'all' || c.rarity === rar) && (attr === 'all' || c.attribute === attr) && (bloom === 'all' || bloomOf(c) === bloom) && (!q || c.name.includes(q) || (c.d && (c.d.skillName || '').includes(q))))
    .sort({
      default: (a, b) => a._i - b._i,
      attack: (a, b) => ((b.d && b.d.attack) || -1) - ((a.d && a.d.attack) || -1) || a._i - b._i,
      level: (a, b) => ((b.d && b.d.level) || -1) - ((a.d && a.d.level) || -1) || a._i - b._i,
      name: (a, b) => a.name.localeCompare(b.name, 'ja'),
    }[sort]);
  const withDetail = cards.filter((c) => c.d).length;
  const count = (f) => cards.filter(f).length;

  return (
    <Card padding={4}>
      <div className="og-row og-space">
        <Heading level={2}>所持カード</Heading>
        <Muted>{fmt(cards.length)}枚・開花 {fmt(count((c) => c.kaika && !c.chokaika))}枚・超開花 {fmt(count((c) => c.chokaika))}枚</Muted>
      </div>
      {!data.sample && (
        <div className="og-card-sync">
          <div className="og-row og-space">
            <span>性能を取得済み <b className="og-num">{fmt(withDetail)}</b> / {fmt(cards.length)}枚</span>
            <Muted>カード一覧の最終取得 {data.cardsFetchedAt ? fmtDate(Date.parse(data.cardsFetchedAt)) : '—'}</Muted>
          </div>
          <Muted>カードの性能は、まだ取得していないカードだけを、次の取り込みでまとめて読みます（取得済みのカードは読み直しません）。カード一覧は7日に1回読み直し、新しいカードがあればその性能も読みます。</Muted>
          <div className="og-row">
            <Switch label="次回の取り込みでカードを読み直す" size="sm" value={!!S.forceCards} onChange={(v) => store.setForceCards(v)} />
          </div>
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
        <SegmentedControl value={bloom} onChange={setBloom} label="開花" size="sm">
          <SegmentedControlItem value="all" label="開花すべて" />
          <SegmentedControlItem value="none" label="未開花" />
          <SegmentedControlItem value="kaika" label="開花" />
          <SegmentedControlItem value="chokaika" label="超開花" />
        </SegmentedControl>
        <Selector label="並び順" isLabelHidden size="sm" value={sort} onChange={setSort} options={SORTS} />
        <TextInput label="カード名・スキルで検索" isLabelHidden placeholder="キャラ名・カード名・スキル" value={q} onChange={setQ} hasClear size="sm" width={210} type="search" />
      </div>
      {list.length ? (
        <div className="og-cards">
          {list.map((c) => (
            <button type="button" className="og-card" key={c._i} onClick={() => setOpen(c)}>
              <div className={`og-card-img og-attr-bg-${c.attribute}`}>
                {c.imageUrl ? <img src={c.imageUrl} alt="" loading="lazy" referrerPolicy="no-referrer" onError={(e) => e.currentTarget.remove()} /> : null}
                <span className="og-card-ph">{c.rarity}</span>
                {c.chokaika && <span className="og-bloom og-bloom-cho">超開花</span>}
              </div>
              <div className="og-card-meta">
                <div className="og-row og-gap-sm">
                  {c.attribute && <span className={`og-attr og-attr-${c.attribute}`}>{c.attribute.toUpperCase()}</span>}
                  <span className="og-rar">{c.rarity}</span>
                  {c.chokaika ? <span className="og-kaika og-chokaika">超開花</span> : c.kaika ? <span className="og-kaika">開花</span> : null}
                  <span className="og-card-stars">{'★'.repeat(c.stars || 0)}</span>
                </div>
                <div className="og-card-name">{c.name.replace(/^【.+?】/, '')}</div>
                {c.d ? (
                  <div className="og-card-perf">
                    <span>Lv <b className="og-num">{c.d.level ?? '—'}</b><small>/{c.d.maxLevel ?? '—'}</small></span>
                    <span>攻撃 <b className="og-num">{c.d.attack ?? '—'}</b></span>
                  </div>
                ) : <div className="og-card-perf og-muted">性能は未取得</div>}
                {c.d && c.d.skillName && <div className="og-card-skill">{c.d.skillName}</div>}
              </div>
            </button>
          ))}
        </div>
      ) : <div className="og-empty">条件に合うカードがありません</div>}
      {open && <CardDialog c={open} onClose={() => setOpen(null)} />}
    </Card>
  );
}

function CardDialog({ c, onClose }) {
  const d = c.d;
  return (
    <Dialog isOpen onOpenChange={(o) => !o && onClose()} width={560}>
      <DialogHeader title={c.name.replace(/^【.+?】/, '')} subtitle={`${c.rarity}${c.attribute ? ' ・ ' + c.attribute.toUpperCase() : ''}`} onOpenChange={(o) => !o && onClose()} />
      <div className="og-dialog-body">
        <div className="og-card-detail">
          <div className={`og-card-img og-attr-bg-${c.attribute}`}>
            {c.imageUrl ? <img src={c.imageUrl} alt={c.name} referrerPolicy="no-referrer" onError={(e) => e.currentTarget.remove()} /> : null}
            <span className="og-card-ph">{c.rarity}</span>
          </div>
          <div className="og-card-detail-main">
            <div className="og-row og-gap-sm">
              {c.chokaika ? <span className="og-bloom-tag og-bloom-tag-cho">超開花</span> : c.kaika ? <span className="og-bloom-tag">開花</span> : <span className="og-muted">未開花</span>}
              <span className="og-card-stars">{'★'.repeat(c.stars || 0)}<span className="og-muted">{'☆'.repeat(Math.max(0, 5 - (c.stars || 0)))}</span></span>
            </div>
            {d ? (
              <div className="og-dstats">
                <div className="og-dstat"><div className="og-stat-k">レベル</div><div className="og-dstat-v og-num">{d.level ?? '—'}<small> / {d.maxLevel ?? '—'}</small></div></div>
                <div className="og-dstat"><div className="og-stat-k">攻撃力</div><div className="og-dstat-v og-num">{d.attack ?? '—'}<small> / {d.maxAttack ?? '—'}</small></div></div>
                <div className="og-dstat"><div className="og-stat-k">印刷可能回数</div><div className="og-dstat-v og-num">{d.printable ?? '—'}<small> 枚</small></div></div>
              </div>
            ) : <Muted>このカードの性能はまだ取得していません。取り込みを重ねると少しずつ集まります。</Muted>}
          </div>
        </div>
        {d && d.skillName && (
          <section className="og-skill-box">
            <div className="og-row og-gap-sm">
              {d.skillType && <span className={`og-skill-type og-skill-${d.skillType}`}>{SKILL_LABEL[d.skillType] || d.skillType.toUpperCase()}</span>}
              <b>{d.skillName}</b>
            </div>
            {d.skillDesc && <div className="og-skill-desc">{d.skillDesc}</div>}
          </section>
        )}
        {d && (
          <div className="og-card-extra">
            {d.version && <div><span className="og-muted">追加バージョン</span> {d.version}</div>}
            {d.obtain && <div><span className="og-muted">入手方法</span> {d.obtain}</div>}
            {d.at && <div className="og-muted">性能の取得日 {fmtDate(Date.parse(d.at))}</div>}
          </div>
        )}
      </div>
    </Dialog>
  );
}
