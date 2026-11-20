import { useState } from 'react';
import { Dialog } from '@astryxdesign/core/Dialog';
import { DialogHeader } from '@astryxdesign/core/Dialog';
import { Heading } from '@astryxdesign/core/Heading';
import { Button } from '@astryxdesign/core/Button';
import { TextInput } from '@astryxdesign/core/TextInput';
import R from '../rating.js';
import * as store from '../store.js';
import { Diff, Rank, Lamps, Const, fmt, f3, Muted, JudgeLine, Breakdown, LineChart, RANK_LABEL, techRankOf, METHOD_LABEL } from '../ui.jsx';
import { EventItem, evTime } from './PbView.jsx';

const Stat = ({ k, v, sub }) => (
  <div className="og-dstat"><div className="og-stat-k">{k}</div><div className="og-dstat-v og-num">{v}{sub && <small> {sub}</small>}</div></div>
);

export function ChartDialog({ uid, data, S, onClose, openPlay, notify }) {
  const s = data.scores.find((x) => x.uid === uid);
  const [ov, setOv] = useState(S.overrides[uid] != null ? String(S.overrides[uid]) : '');
  if (!s) return null;
  const c = data.byUid.get(uid) || { ...s, techRate: null, platRate: null, plat: R.platinumStars(s.platinum) };
  const plays = S.plays.filter((p) => store.keyOf(p) === store.keyOf(s) && (!uid.includes('#') || (store.chartForPlay(data.scores, p) || {}).uid === uid))
    .sort((a, b) => store.parseDate(a.date) - store.parseDate(b.date));
  const events = S.pb.filter((e) => (e.uid ? e.uid === uid : store.keyOf(e) === store.keyOf(s))).sort((a, b) => evTime(b) - evTime(a));
  const pbEv = events.find((e) => e.type === 'tech' && e.to === s.techScore && e.detail);
  const pbKeys = new Set(S.pb.filter((e) => e.playKey).map((e) => e.playKey));
  const targets = [1000000, 1007500, 1010000].filter((t) => t > (s.techScore || 0));
  const inf = data.inferred[uid];
  const hasOv = S.overrides[uid] != null;
  const constNote = hasOv ? '手動で入力した値を使っています。'
    : s.constInferred ? `otoge-db に未登録のため、${METHOD_LABEL[s.constMethod]}しました。`
    : s.constEstimated ? `otoge-db に未登録です。${inf && inf.method !== 'level' ? METHOD_LABEL[inf.method] + 'しても1つに絞れませんでした。' : 'NETのレート対象曲に入っていないため逆算できません。'}計算には範囲の最小値を使っています。` : '';
  const saveOv = () => {
    const v = parseFloat(ov);
    if (isNaN(v) || v <= 0 || v > 16) { notify('定数は0〜16の数値で入力してください'); return; }
    store.setOverride(uid, v); notify('譜面定数を保存しました'); onClose();
  };
  return (
    <Dialog isOpen onOpenChange={(o) => !o && onClose()} width={680}>
      <DialogHeader title={s.title} subtitle={<span className="og-row og-gap-sm"><Diff d={s.diff} /> Lv {s.level}{s.version ? ` ・ ${s.version}` : ''}{s.genre ? ` ・ ${s.genre}` : ''}</span>} onOpenChange={(o) => !o && onClose()} />
      <div className="og-dialog-body">
        <div className="og-dstats">
          <Stat k="テクニカル" v={fmt(s.techScore)} sub={RANK_LABEL[techRankOf(s.techScore)]} />
          <Stat k="単曲レート" v={c.techRate != null ? f3(c.techRate) : '—'} />
          <Stat k="プラチナ" v={s.platinum ? fmt(s.platinum.score) : '—'} sub={s.platinum ? `/ ${fmt(s.platinum.max)}` : ''} />
          <Stat k="Pレート" v={c.platRate != null ? f3(c.platRate) : '—'} sub={c.plat && c.plat.stars ? `☆${c.plat.stars}` : ''} />
          <Stat k="バトル" v={fmt(s.battleScore)} sub={s.overDamage != null ? `OD ${fmt(s.overDamage, 2)}%` : ''} />
        </div>
        <div className="og-row og-gap-sm"><Lamps c={s} />{!s.lamp && !s.fullBell && <Muted>ランプなし</Muted>}</div>
        {targets.length > 0 && s.const != null && (
          <div className="og-targets">{targets.map((t) => <span key={t}>{fmt(t)}点 → <b className="og-num">{f3(R.techRateMilli({ ...c, techScore: t }) / 1000)}</b></span>)}</div>
        )}

        <section>
          <Heading level={3}>自己ベスト時の内訳</Heading>
          {pbEv ? <><Muted>{pbEv.at} のプレイ</Muted><Breakdown d={pbEv.detail} techScore={pbEv.to} /></>
            : <Muted>自己ベストを出したプレイの内訳はまだ記録されていません。自己ベストを更新したあとに取り込むと保存されます。</Muted>}
        </section>

        <section className="og-const-box">
          <div className="og-row og-gap-sm"><b>譜面定数</b><Const c={c} /></div>
          {constNote && <Muted>{constNote}</Muted>}
          <div className="og-row og-gap-sm">
            <TextInput label="譜面定数を手動入力" isLabelHidden size="sm" width={120} placeholder="例: 14.3" value={ov} onChange={setOv} inputMode="decimal" onEnter={saveOv} />
            <Button label="定数を保存" size="sm" variant="primary" onClick={saveOv} />
            {hasOv && <Button label="手動入力を消す" size="sm" variant="ghost" onClick={() => { store.setOverride(uid, null); onClose(); }} />}
          </div>
        </section>

        <section>
          <Heading level={3}>記録されたプレイ（{plays.length}回）</Heading>
          <LineChart points={plays.filter((p) => p.techScore != null).map((p) => ({ x: store.parseDate(p.date), y: p.techScore, label: `${p.date}  ${fmt(p.techScore)}` }))}
            fmtY={(v) => Math.round(v).toLocaleString('ja-JP')} minPad={500} label="スコア推移" empty="プレイが2回以上記録されると推移グラフが表示されます。" />
          <div className="og-timeline">
            {plays.slice().reverse().slice(0, 20).map((p) => (
              <button type="button" key={store.playKey(p)} className="og-ev og-ev-btn" onClick={() => { onClose(); openPlay(store.playKey(p)); }}>
                <div className="og-ev-when og-num">{p.date}</div>
                <div className="og-ev-what">
                  <div className="og-row og-gap-sm"><span className="og-num og-strong">{fmt(p.techScore)}</span><Rank ts={p.techScore} /><Lamps c={p} />{pbKeys.has(store.playKey(p)) && <span className="og-pb">自己ベスト更新</span>}</div>
                  <JudgeLine d={p.detail} />
                </div>
              </button>
            ))}
          </div>
        </section>

        {events.length > 0 && (
          <section>
            <Heading level={3}>更新の記録</Heading>
            <div className="og-timeline">{events.map((e, i) => <EventItem key={i} e={e} withTitle={false} />)}</div>
          </section>
        )}
      </div>
    </Dialog>
  );
}

export function PlayDialog({ pk, data, S, onClose, openChart }) {
  const list = data.sample ? data.playlog || [] : S.plays;
  const p = list.find((x) => store.playKey(x) === pk);
  if (!p) return null;
  const ch = store.chartForPlay(data.scores, p);
  const isPb = S.pb.some((e) => e.playKey === pk);
  return (
    <Dialog isOpen onOpenChange={(o) => !o && onClose()} width={620}>
      <DialogHeader title={p.title} subtitle={<span className="og-row og-gap-sm"><Diff d={p.diff} /><span className="og-num">{p.date}</span>{isPb && <span className="og-pb">自己ベスト更新</span>}</span>} onOpenChange={(o) => !o && onClose()} />
      <div className="og-dialog-body">
        <div className="og-dstats">
          <Stat k="テクニカル" v={fmt(p.techScore)} sub={RANK_LABEL[techRankOf(p.techScore)]} />
          <Stat k="バトル" v={fmt(p.battleScore)} sub={p.overDamage != null ? `OD ${fmt(p.overDamage, 2)}%` : ''} />
          {ch && ch.techScore != null && <Stat k="現在の自己ベスト" v={fmt(ch.techScore)} sub={p.techScore != null && ch.techScore > p.techScore ? `差 −${fmt(ch.techScore - p.techScore)}` : ''} />}
        </div>
        <div className="og-row og-gap-sm"><Lamps c={p} />{!p.lamp && !p.fullBell && <Muted>ランプなし</Muted>}</div>
        <section>
          <Heading level={3}>スコアの内訳</Heading>
          <Breakdown d={p.detail} techScore={p.techScore} />
        </section>
        {ch && <div><Button label="この譜面の詳細を見る" size="sm" onClick={() => { onClose(); openChart(ch.uid); }} /></div>}
      </div>
    </Dialog>
  );
}
