// 保存データ・取り込み・計算済みデータ
import R from './rating.js';

export const STORE_KEY = 'ongekiViewer.v1';
const JACKET_KEY = 'ongekiViewer.jackets.v1';
export const DIFFS = ['BASIC', 'ADVANCED', 'EXPERT', 'MASTER', 'LUNATIC'];
export const keyOf = (c) => c.diff + ':' + c.title;
export const playKey = (p) => [p.date, p.diff, p.title, p.techScore, p.battleScore].join('|');

const empty = () => ({ latest: null, ratings: [], pb: [], plays: [], overrides: {} });
let S = empty();
let J = {}; // ジャケット画像 { ファイル名: dataURL }
let memoryOnly = false;
let version = 0;
const listeners = new Set();

export function load() {
  try { const raw = localStorage.getItem(STORE_KEY); if (raw) S = Object.assign(empty(), JSON.parse(raw)); }
  catch (e) { memoryOnly = true; }
  try { const raw = localStorage.getItem(JACKET_KEY); if (raw) J = JSON.parse(raw) || {}; } catch (e) { /* 画像なしでも動く */ }
}
function saveJackets() { try { localStorage.setItem(JACKET_KEY, JSON.stringify(J)); } catch (e) { /* 容量不足なら保存しない */ } }
export const getJackets = () => J;
export const jacketName = (s) => (s && s.jacketUrl ? String(s.jacketUrl).split('/').pop() : null);
export const jacketOf = (s) => { const n = jacketName(s); return n ? J[n] || null : null; };
function save() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(S)); memoryOnly = false; }
  catch (e) { memoryOnly = true; }
  version++;
  listeners.forEach((f) => f());
}
export const getState = () => S;
export const getVersion = () => version;
export const isMemoryOnly = () => memoryOnly;
export const subscribe = (f) => { listeners.add(f); return () => listeners.delete(f); };

// ---------- 日付 ----------
export const parseDate = (s) => {
  if (!s) return 0;
  if (String(s).includes('T')) return Date.parse(s);
  const m = String(s).match(/(\d{4})\D(\d{1,2})\D(\d{1,2})(?:\D+(\d{1,2}):(\d{2}))?/);
  return m ? new Date(+m[1], m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0)).getTime() : 0;
};
export const fmtDate = (s) => {
  const t = typeof s === 'number' ? s : parseDate(s);
  if (!t) return '—';
  const d = new Date(t); const p = (x) => String(x).padStart(2, '0');
  return `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
};

// ---------- 計算 ----------
export function derive(base, overrides) {
  let scores = R.assignUids(base.scores || []);
  const inferred = R.inferConstants(scores, base.ratingTarget, base.player && base.player.rating, overrides);
  scores = R.applyInferred(scores, inferred);
  const comp = R.compute(scores, overrides);
  const rt = base.ratingTarget || {};
  const netSet = (k) => new Set((rt[k] || []).map((e) => (R.matchEntry(scores, e) || {}).uid).filter(Boolean));
  comp.net = { new: netSet('new'), best: netSet('best'), platinum: netSet('platinum') };
  const byUid = new Map(comp.charts.map((c) => [c.uid, c]));
  return { ...base, scores, comp, inferred, byUid };
}
// プレイ（曲名＋難易度）から譜面を探す。同名曲は自己ベストが一致するものを優先
export function chartForPlay(scores, p) {
  const c = scores.filter((s) => keyOf(s) === keyOf(p));
  return c.find((s) => s.techScore === p.techScore) || c[0] || null;
}

// ---------- 取り込み ----------
function bestMap(scores) {
  const m = {};
  R.assignUids(scores || []).forEach((s) => {
    if (s.played) m[s.uid] = { ts: s.techScore, lamp: s.lamp, fb: !!s.fullBell, p: s.platinum ? s.platinum.score : null, title: s.title, diff: s.diff, key: keyOf(s) };
  });
  return m;
}
const LAMP_RANK = { null: 0, undefined: 0, FC: 1, AB: 2, 'AB+': 3 };
function playEvent(p, uid, from, src) {
  return {
    at: p.date, type: 'tech', uid, title: p.title, diff: p.diff, from, to: p.techScore, src,
    playKey: playKey(p), detail: p.detail || null,
    play: { battleScore: p.battleScore, overDamage: p.overDamage, lamp: p.lamp, fullBell: p.fullBell, battleRank: p.battleRank },
  };
}

export function ingest(data) {
  if (!data || !data.scores || !data.player) throw new Error('オンゲキデータの形式ではありません。');
  const prev = S.latest;
  const at = data.fetchedAt || new Date().toISOString();
  const prevBest = prev ? bestMap(prev.scores) : null;
  const curBest = bestMap(data.scores);
  const uidsFor = (p) => Object.keys(curBest).filter((u) => curBest[u].key === keyOf(p));
  const incoming = new Map((data.playlog || []).map((p) => [playKey(p), p]));
  S.plays.forEach((p) => { const n = incoming.get(playKey(p)); if (n && n.detail && !p.detail) p.detail = n.detail; });
  S.pb.forEach((e) => { const n = e.playKey && incoming.get(e.playKey); if (n && n.detail && !e.detail) e.detail = n.detail; });
  const known = new Set(S.plays.map(playKey));
  const newPlays = (data.playlog || []).filter((p) => !known.has(playKey(p)));
  const chrono = newPlays.map((p, i) => ({ p, i })).sort((a, b) => parseDate(a.p.date) - parseDate(b.p.date) || b.i - a.i).map((x) => x.p);
  const events = [];
  if (prevBest) {
    const running = JSON.parse(JSON.stringify(prevBest));
    chrono.forEach((p) => {
      if (p.techScore == null) return;
      const cands = uidsFor(p);
      const uid = cands.length === 1 ? cands[0] : cands.find((u) => curBest[u].ts === p.techScore) || cands.find((u) => running[u] && running[u].ts < p.techScore && curBest[u].ts >= p.techScore);
      if (!uid) return;
      const r = running[uid];
      if (!r || p.techScore > r.ts) {
        events.push(playEvent(p, uid, r ? r.ts : null, 'play'));
        running[uid] = Object.assign(r || {}, { ts: p.techScore });
      }
    });
    Object.entries(curBest).forEach(([u, c]) => {
      const b = prevBest[u];
      const covered = events.some((e) => e.type === 'tech' && e.uid === u && e.to === c.ts);
      const base = { at, uid: u, title: c.title, diff: c.diff, src: 'snapshot' };
      if ((!b || c.ts > b.ts) && !covered) events.push({ ...base, type: 'tech', from: b ? b.ts : null, to: c.ts });
      if (b && LAMP_RANK[c.lamp] > LAMP_RANK[b.lamp]) events.push({ ...base, type: 'lamp', from: b.lamp || null, to: c.lamp });
      if (b && c.fb && !b.fb) events.push({ ...base, type: 'fb', from: null, to: 'FULL BELL' });
      if (b && c.p != null && (b.p == null || c.p > b.p)) events.push({ ...base, type: 'plat', from: b.p, to: c.p });
    });
  } else {
    const seen = new Set();
    chrono.forEach((p) => {
      const uid = uidsFor(p).find((u) => curBest[u].ts === p.techScore);
      if (uid && !seen.has(uid)) { seen.add(uid); events.push(playEvent(p, uid, null, 'first')); }
    });
  }
  const comp = derive(data, S.overrides).comp;
  S.plays = S.plays.concat(newPlays).sort((a, b) => parseDate(b.date) - parseDate(a.date));
  S.pb = S.pb.concat(events.map((e) => ({ ...e, importedAt: at })));
  S.ratings = S.ratings.filter((r) => r.at !== at)
    .concat([{ at, official: data.player.rating, max: data.player.ratingMax, computed: comp.total, part: comp.part }])
    .sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  // ジャケット: 今回の分を足し、レート対象曲・次点候補で使うものだけ残す
  if (data.jackets) {
    const all = { ...J, ...data.jackets };
    // jacketNames は今回必要なジャケットの全リスト（取得済みで送られなかった分も含む）
    const keep = new Set(data.jacketNames || Object.keys(data.jackets));
    J = Object.fromEntries(Object.entries(all).filter(([k]) => keep.has(k)));
    saveJackets();
  }
  const { jackets, jacketNames, ...rest } = data; // eslint-disable-line no-unused-vars
  // カードを読まなかった回（前回の取得から日が浅いとき）は、前回のカードを引き継ぐ
  const cards = data.cards || (prev && prev.cards) || [];
  const cardsFetchedAt = data.cards ? at : (prev && (prev.cardsFetchedAt || prev.fetchedAt)) || null;
  if (data.cards) S.forceCards = false;
  S.latest = Object.assign({}, rest, { scores: data.scores.filter((s) => s.played), chartCount: data.scores.length, cards, cardsFetchedAt });
  save();
  return { newPlays: newPlays.length, events: events.length };
}

// JSON文字列・オブジェクトのどちらでも受け付ける
export function importAny(input) {
  const data = typeof input === 'string' ? JSON.parse(input) : input;
  if (data && data.format === 'ongeki-viewer-backup/1') {
    S = Object.assign(empty(), data.state);
    if (data.jackets) { J = data.jackets; saveJackets(); }
    save();
    return '保存データをバックアップから復元しました';
  }
  const r = ingest(data);
  return `取り込みました（新しいプレイ ${r.newPlays}件・更新 ${r.events}件）`;
}
export const backupJson = () => JSON.stringify({ format: 'ongeki-viewer-backup/1', savedAt: new Date().toISOString(), state: S, jackets: J });
export function clearAll() { S = empty(); J = {}; try { localStorage.removeItem(STORE_KEY); localStorage.removeItem(JACKET_KEY); } catch (e) { /* noop */ } version++; listeners.forEach((f) => f()); }
export function setForceCards(v) { S.forceCards = !!v; save(); }
export function setOverride(uid, v) { if (v == null) delete S.overrides[uid]; else S.overrides[uid] = v; save(); }

// ---------- サンプル ----------
export function sampleData() {
  const songs = [
    ['Singularity', 'MASTER', '14+', 14.9, 'bright MEMORY Act.1', 1006210, 'FC', true, 0.981],
    ['Apollo', 'MASTER', '14+', 14.8, 'bright MEMORY Act.2', 1004880, 'FC', true, 0.97],
    ['GODLINESS', 'LUNATIC', '14+', 14.8, 'bright MEMORY Act.3', 999120, null, true, 0.955],
    ["Viyella's Tears", 'MASTER', '14+', 14.8, 'bright MEMORY Act.2', 1003750, 'FC', false, 0.962],
    ['MEGALOVANIA', 'MASTER', '14', 14.6, 'RED Plus', 1007890, 'AB', true, 0.985],
    ['Odysseus', 'MASTER', '14+', 14.9, 'Re:Fresh', 1002300, 'FC', true, 0.958],
    ['Hypernaid', 'MASTER', '14', 14.4, 'Re:Fresh', 1008620, 'AB', true, 0.988],
    ['Calamity Fortune', 'LUNATIC', '14', 14.1, 'SUMMER Plus', 1007200, 'AB', true, 0.979],
    ['ナイト・オブ・ナイツ', 'MASTER', '12+', 12.8, 'ONGEKI', 1009820, 'AB', true, 0.993],
    ['Dolphika', 'MASTER', '13', 13.0, 'RED', 1008900, 'AB', true, 0.986],
    ['MORAL', 'MASTER', '14+', 14.6, 'Re:Fresh', 1005100, 'FC', true, 0.967],
    ['零號車輛', 'MASTER', '15', 15.1, 'Re:Fresh Act.2', 1004200, 'FC', true, 0.958, true],
    ['熱異常', 'MASTER', '14+', 14.6, 'Re:Fresh Act.2', 1008100, 'AB', true, 0.984, true],
    ['Demonia', 'MASTER', '15', 15.3, 'Re:Fresh Act.2', 996300, null, true, 0.935, true],
    ["What's up? Pop!", 'MASTER', '14+', 14.9, 'Re:Fresh Act.2', 1006400, 'FC', true, 0.972, true],
  ];
  const scores = songs.map(([title, diff, level, c, ver, ts, lamp, fb, pr, isNew]) => {
    const max = Math.round(c * 130) * 2;
    return { title, diff, level, genre: '', const: c, constEstimated: false, version: ver, isNew: !!isNew, played: true, techScore: ts, battleScore: 9800000 + (ts % 300000), overDamage: 300 + (ts % 500), lamp, fullBell: fb, platinum: { score: Math.floor(max * pr), max } };
  });
  const now = Date.parse('2026-11-19T21:00:00+09:00');
  const playlog = scores.slice(0, 10).map((s, i) => ({
    date: fmtDate(now - i * 9 * 60000), diff: s.diff, title: s.title, techScore: s.techScore - (i % 3) * 1200,
    battleScore: s.battleScore, overDamage: s.overDamage, lamp: i % 3 ? null : s.lamp, fullBell: s.fullBell,
    detail: { maxCombo: 1180 - i * 20, criticalBreak: 1190 - i * 3, break: 8 + i * 3, hit: i % 3, miss: i % 2, bell: 75 - (i % 2), bellTotal: 75, damage: i % 2, rates: { TAP: 99, HOLD: 100, FLICK: 99, 'SIDE TAP': 100, 'SIDE HOLD': 100 } },
  }));
  const comp = R.compute(R.assignUids(scores), {});
  return {
    sample: true, fetchedAt: new Date(now).toISOString(),
    player: { name: 'サンプルプレイヤー', level: 42, reincarnation: 3, trophy: 'サンプル称号', rating: comp.total, ratingMax: comp.total, battlePoint: 15230, totalTracks: 3120, money: '52,400（累計 1,204,880）', comment: 'これは表示例です。', activity: [] },
    ratingTarget: {}, scores, playlog,
    cards: [
      { name: '【SSR】星咲 あかり[サンプル]', rarity: 'SSR', attribute: 'fire', kaika: true, stars: 5 },
      { name: '【SSR】藤沢 柚子[サンプル]', rarity: 'SSR', attribute: 'leaf', kaika: false, stars: 3 },
      { name: '【SR】三角 葵[サンプル]', rarity: 'SR', attribute: 'aqua', kaika: true, stars: 2 },
      { name: '【R】高瀬 梨緒[サンプル]', rarity: 'R', attribute: 'aqua', kaika: false, stars: 1 },
    ],
  };
}
