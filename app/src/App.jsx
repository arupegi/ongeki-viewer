import { useEffect, useMemo, useState, useSyncExternalStore, useCallback } from 'react';
import { TabList, Tab } from '@astryxdesign/core/TabList';
import { Banner } from '@astryxdesign/core/Banner';
import { Text } from '@astryxdesign/core/Text';
import * as store from './store.js';
import { f3 } from './ui.jsx';
import { RatingView } from './views/RatingView.jsx';
import { ProfileView } from './views/ProfileView.jsx';
import { ScoresView } from './views/ScoresView.jsx';
import { PlaysView } from './views/PlaysView.jsx';
import { PbView } from './views/PbView.jsx';
import { CardsView } from './views/CardsView.jsx';
import { DataView } from './views/DataView.jsx';
import { ImageView } from './views/ImageView.jsx';
import { ChartDialog, PlayDialog } from './views/Dialogs.jsx';

const TABS = [
  ['rating', 'レート枠'], ['profile', 'プレイヤー'], ['scores', '全スコア'], ['plays', 'プレイ履歴'],
  ['pb', '自己ベスト'], ['image', '画像'], ['cards', 'カード'], ['data', 'データ取り込み'],
];
const NET_ORIGIN = 'https://ongeki-net.com';

export function App() {
  const version = useSyncExternalStore(store.subscribe, store.getVersion);
  const S = store.getState();
  const view = useHash();
  const [toast, setToast] = useState(null);
  const [chartUid, setChartUid] = useState(null);
  const [playKey, setPlayKey] = useState(null);
  const notify = useCallback((msg) => { setToast(msg); setTimeout(() => setToast((t) => (t === msg ? null : t)), 3200); }, []);

  const data = useMemo(() => store.derive(S.latest || store.sampleData(), S.overrides), [version]); // eslint-disable-line react-hooks/exhaustive-deps

  // オンゲキNETのブックマークレットから届いたデータを取り込む
  useEffect(() => {
    const onMsg = (e) => {
      if (e.origin !== NET_ORIGIN || !e.data || typeof e.data !== 'object') return;
      if (e.data.type === 'ongeki-viewer-ping') {
        // 既に持っている内訳・ジャケットを伝えて、ブックマークレットが読み直さずに済むようにする
        const st = store.getState();
        const known = {
          plays: st.plays.filter((p) => p.detail).map(store.playKey),
          // 保存済みのプレイ（新しい順に200件）と、前回のスコアの有無。ブックマークレットが読むスコアのページを絞るのに使う
          allPlays: st.plays.slice(0, 200).map(store.playKey),
          hasScores: !!(st.latest && st.latest.scores && st.latest.scores.length),
          jackets: Object.keys(store.getJackets()),
          cardsFetchedAt: st.latest ? st.latest.cardsFetchedAt || st.latest.fetchedAt : null,
          forceCards: !!st.forceCards,
          // 性能が未取得のカードが残っているか（残っていれば、ブックマークレットはカード一覧を読んで未取得分をすべて読む）
          cardDetailsMissing: !(st.latest && st.latest.cards && st.latest.cards.length) || st.latest.cards.some((c) => !store.getCardDetails()[store.cardId(c)]),
          // 取得済みのカード性能（どのカードを読み直すかの判断用）
          cardDetails: Object.fromEntries(Object.entries(store.getCardDetails()).map(([id, d]) => [id, { level: d.level, maxLevel: d.maxLevel, stars: d.stars, kaika: d.kaika, chokaika: d.chokaika, at: d.at }])),
        };
        e.source.postMessage({ type: 'ongeki-viewer-pong', known }, NET_ORIGIN);
        return;
      }
      if (e.data.type !== 'ongeki-viewer-data') return;
      try {
        const msg = store.importAny(e.data.data);
        e.source.postMessage({ type: 'ongeki-viewer-received', ok: true, message: msg }, NET_ORIGIN);
        notify(msg);
        setHash('rating');
        window.focus();
      } catch (err) {
        e.source.postMessage({ type: 'ongeki-viewer-received', ok: false, message: err.message }, NET_ORIGIN);
        notify(err.message);
      }
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, [notify]);

  const ctx = { data, S, notify, openChart: setChartUid, openPlay: setPlayKey, go: setHash };
  const p = data.player || {};
  const View = { rating: RatingView, profile: ProfileView, scores: ScoresView, plays: PlaysView, pb: PbView, cards: CardsView, image: ImageView, data: DataView }[view] || RatingView;

  return (
    <div className="og-app">
      <header className="og-top">
        <div className="og-wrap og-top-inner">
          <div className="og-brand">
            <span className="og-logo" aria-hidden="true">音</span>
            <Text type="label" weight="bold" size="lg">オンゲキ レートビューア</Text>
            {data.sample && <span className="og-sample">サンプル表示中</span>}
          </div>
          <div className="og-who">
            <span className="og-who-name">{p.name}</span>
            <span className="og-who-rating og-num">{f3(p.rating)}</span>
          </div>
        </div>
        <div className="og-wrap">
          <TabList value={view} onChange={setHash} size="md" hasDivider={false} role="tablist">
            {TABS.map(([v, l]) => <Tab key={v} value={v} label={l} />)}
          </TabList>
        </div>
      </header>
      <main className="og-wrap og-main">
        {data.sample && view !== 'data' && (
          <Banner status="info" title="サンプルデータを表示しています" description="「データ取り込み」から、オンゲキNETのデータを読み込めます。" collapsible={false} />
        )}
        {store.isMemoryOnly() && !data.sample && (
          <Banner status="warning" title="このブラウザでは保存ができません" description="閉じる前に「データ取り込み」からバックアップを取ってください。" collapsible={false} />
        )}
        <View {...ctx} />
      </main>
      {chartUid && <ChartDialog uid={chartUid} {...ctx} onClose={() => setChartUid(null)} />}
      {playKey && <PlayDialog pk={playKey} {...ctx} onClose={() => setPlayKey(null)} />}
      {toast && <div className="og-toast" role="status">{toast}</div>}
    </div>
  );
}

function setHash(v) { if (location.hash !== '#' + v) location.hash = v; window.scrollTo(0, 0); }
function useHash() {
  const get = () => (location.hash || '#rating').slice(1);
  const [h, setH] = useState(get);
  useEffect(() => { const f = () => setH(get()); window.addEventListener('hashchange', f); return () => window.removeEventListener('hashchange', f); }, []);
  return h;
}
