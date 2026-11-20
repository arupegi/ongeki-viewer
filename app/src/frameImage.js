// レート枠を1枚の画像に描く（Canvas）
import { fmtDate } from './store.js';

const THEMES = {
  dark: {
    bg: '#14121d', bg2: '#1c1929', cell: '#221f31', cellLine: '#322e47', text: '#f2f0fa', muted: '#a7a2c2', accent: '#ff5ea6',
    bas: '#4fcf83', adv: '#f2b23c', exc: '#ff6a80', mas: '#b67cff', lnt: '#e8e5f6', lntInk: '#17151f',
    gold: '#f0c94f', blue: '#62b8ff', green: '#53d690', pink: '#ff69ad', jacket: '#2c2840',
  },
  light: {
    bg: '#f3f2f9', bg2: '#ffffff', cell: '#ffffff', cellLine: '#e2dfee', text: '#1c1930', muted: '#6b6787', accent: '#d1307c',
    bas: '#2f9f5e', adv: '#d08a10', exc: '#d63b55', mas: '#8a43cf', lnt: '#2b2838', lntInk: '#ffffff',
    gold: '#a67c0e', blue: '#1f78c0', green: '#1d8a52', pink: '#d1307c', jacket: '#e7e4f2',
  },
};
const DIFF_KEY = { BASIC: 'bas', ADVANCED: 'adv', EXPERT: 'exc', MASTER: 'mas', LUNATIC: 'lnt' };
const DIFF_SHORT = { BASIC: 'BASIC', ADVANCED: 'ADVANCED', EXPERT: 'EXPERT', MASTER: 'MASTER', LUNATIC: 'LUNATIC' };
const JP = '"Zen Kaku Gothic New", "Hiragino Kaku Gothic ProN", "Yu Gothic", "Meiryo", sans-serif';
const NUM = '"Chakra Petch", "Zen Kaku Gothic New", sans-serif';

const RANKS = [[1007500, 'SSS+'], [1000000, 'SSS'], [990000, 'SS'], [970000, 'S'], [940000, 'AAA'], [900000, 'AA'], [850000, 'A'], [800000, 'BBB'], [0, '']];
const rankOf = (ts) => (RANKS.find(([s]) => ts >= s) || [0, ''])[1];
const n = (v, d = 0) => (v == null ? '—' : Number(v).toLocaleString('ja-JP', { minimumFractionDigits: d, maximumFractionDigits: d }));

export const FRAME_SETS = {
  best: { label: 'ベスト枠', frames: [['best', 'ベスト枠']] },
  new: { label: '新曲枠', frames: [['new', '新曲枠']] },
  platinum: { label: 'P枠', frames: [['platinum', 'プラチナスコア枠']] },
  newbest: { label: '新曲枠＋ベスト枠', frames: [['new', '新曲枠'], ['best', 'ベスト枠']] },
  all: { label: '3枠すべて', frames: [['new', '新曲枠'], ['best', 'ベスト枠'], ['platinum', 'プラチナスコア枠']] },
};

function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
function fitText(ctx, text, maxW) {
  if (ctx.measureText(text).width <= maxW) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(t + '…').width > maxW) t = t.slice(0, -1);
  return t + '…';
}
function tag(ctx, x, y, label, color, fill) {
  ctx.font = `700 12px ${NUM}`;
  const w = ctx.measureText(label).width + 10;
  rr(ctx, x, y, w, 18, 4);
  if (fill) { ctx.fillStyle = color; ctx.fill(); ctx.fillStyle = fill; }
  else { ctx.strokeStyle = color; ctx.lineWidth = 1.2; ctx.stroke(); ctx.fillStyle = color; }
  ctx.textBaseline = 'middle';
  ctx.fillText(label, x + 5, y + 9.5);
  return w;
}
function loadImg(src) {
  return new Promise((resolve) => {
    if (!src) { resolve(null); return; }
    const im = new Image();
    im.onload = () => resolve(im);
    im.onerror = () => resolve(null);
    im.src = src;
  });
}

export async function ensureFonts() {
  if (!document.fonts) return;
  try {
    await Promise.all([
      document.fonts.load(`700 20px "Chakra Petch"`), document.fonts.load(`600 20px "Chakra Petch"`),
      document.fonts.load(`700 20px "Zen Kaku Gothic New"`, 'オンゲキ'), document.fonts.load(`500 20px "Zen Kaku Gothic New"`, 'オンゲキ'),
    ]);
  } catch (e) { /* フォントが無くても代わりの書体で描く */ }
}

/**
 * @param data   derive() 済みのデータ
 * @param opts   { set: 'best'|'new'|..., theme: 'dark'|'light', columns: number, getJacket: (chart) => dataURL|null }
 * @returns HTMLCanvasElement
 */
export async function drawFrameImage(data, opts) {
  await ensureFonts();
  const T = THEMES[opts.theme] || THEMES.dark;
  const cols = opts.columns || 5;
  const set = FRAME_SETS[opts.set] || FRAME_SETS.best;
  const { comp } = data;
  const p = data.player || {};
  const PAD = 40, GAP = 14, CW = 300, CH = 112, HEAD = 168, SEC = 56, FOOT = 50;
  const W = PAD * 2 + cols * CW + (cols - 1) * GAP;
  const sections = set.frames.map(([k, label]) => ({ k, label, list: comp.frames[k] || [] }));
  const rowsOf = (l) => Math.max(1, Math.ceil(l.length / cols));
  const H = HEAD + sections.reduce((a, s) => a + SEC + rowsOf(s.list) * (CH + GAP), 0) + FOOT;

  const jackets = new Map();
  await Promise.all(sections.flatMap((s) => s.list).map(async (c) => { if (!jackets.has(c.uid)) jackets.set(c.uid, await loadImg(opts.getJacket(c))); }));

  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = T.bg; ctx.fillRect(0, 0, W, H);

  // ---- ヘッダー ----
  rr(ctx, PAD, 28, W - PAD * 2, HEAD - 48, 16); ctx.fillStyle = T.bg2; ctx.fill();
  ctx.fillStyle = T.accent; rr(ctx, PAD, 28, 8, HEAD - 48, 4); ctx.fill();
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = T.muted; ctx.font = `500 15px ${JP}`;
  ctx.fillText(`オンゲキ レーティング対象曲 ・ ${set.label}`, PAD + 32, 64);
  ctx.fillStyle = T.text; ctx.font = `700 34px ${JP}`;
  ctx.fillText(fitText(ctx, p.name || '', W / 2 - 80), PAD + 32, 106);
  ctx.fillStyle = T.muted; ctx.font = `500 15px ${JP}`;
  const sub = [p.level != null ? `Lv.${p.level}` : '', p.trophy || '', `取得 ${fmtDate(Date.parse(data.fetchedAt))}`].filter(Boolean).join('  ・  ');
  ctx.fillText(fitText(ctx, sub, W / 2 - 80), PAD + 32, 134);

  const rx = W - PAD - 32;
  ctx.textAlign = 'right';
  ctx.fillStyle = T.muted; ctx.font = `600 14px ${NUM}`; ctx.fillText('RATING', rx, 60);
  ctx.fillStyle = T.accent; ctx.font = `700 56px ${NUM}`; ctx.fillText(n(p.rating ?? comp.total, 3), rx, 112);
  ctx.fillStyle = T.muted; ctx.font = `600 ${cols <= 3 ? 12 : 15}px ${NUM}`;
  ctx.fillText(`NEW +${n(comp.part.new, 3)}   BEST +${n(comp.part.best, 3)}   PLATINUM +${n(comp.part.platinum, 3)}`, rx, 138);
  ctx.textAlign = 'left';

  // ---- 枠ごと ----
  let y = HEAD;
  for (const s of sections) {
    const isP = s.k === 'platinum';
    ctx.fillStyle = T.text; ctx.font = `700 22px ${JP}`; ctx.textBaseline = 'alphabetic';
    ctx.fillText(s.label, PAD, y + 34);
    const lw = ctx.measureText(s.label).width;
    ctx.fillStyle = T.muted; ctx.font = `600 15px ${NUM}`;
    ctx.fillText(`${s.list.length}譜面   平均 ${n(comp.avg[s.k], 3)}   最低 ${n(comp.border[s.k], 3)}   合計 +${n(comp.part[s.k], 3)}`, PAD + lw + 18, y + 34);
    y += SEC;
    s.list.forEach((c, i) => {
      const x = PAD + (i % cols) * (CW + GAP);
      const cy = y + Math.floor(i / cols) * (CH + GAP);
      drawCell(ctx, T, c, i + 1, x, cy, CW, CH, jackets.get(c.uid), isP);
    });
    y += rowsOf(s.list) * (CH + GAP);
  }

  ctx.fillStyle = T.muted; ctx.font = `500 13px ${JP}`; ctx.textBaseline = 'alphabetic';
  ctx.fillText('オンゲキ レートビューア ・ 譜面定数: otoge-db.net（未登録分は逆算）', PAD, H - 22);
  return cv;
}

function drawCell(ctx, T, c, idx, x, y, w, h, img, isP) {
  rr(ctx, x, y, w, h, 12); ctx.fillStyle = T.cell; ctx.fill();
  ctx.strokeStyle = T.cellLine; ctx.lineWidth = 1; ctx.stroke();
  const dc = T[DIFF_KEY[c.diff]] || T.mas;
  // 難易度の帯
  ctx.save(); rr(ctx, x, y, w, h, 12); ctx.clip(); ctx.fillStyle = dc; ctx.fillRect(x, y, 5, h); ctx.restore();

  // ジャケット
  const J = 84, jx = x + 14, jy = y + (h - J) / 2;
  ctx.save(); rr(ctx, jx, jy, J, J, 8); ctx.clip();
  if (img) ctx.drawImage(img, jx, jy, J, J);
  else { ctx.fillStyle = T.jacket; ctx.fillRect(jx, jy, J, J); }
  ctx.restore();
  // 順位
  ctx.font = `700 13px ${NUM}`;
  const it = `#${idx}`; const iw = ctx.measureText(it).width + 10;
  rr(ctx, jx, jy, iw, 20, 6); ctx.fillStyle = 'rgba(0,0,0,.62)'; ctx.fill();
  ctx.fillStyle = '#fff'; ctx.textBaseline = 'middle'; ctx.fillText(it, jx + 5, jy + 10.5);

  const tx = jx + J + 12, tw = x + w - tx - 12;
  // 曲名
  ctx.fillStyle = T.text; ctx.font = `700 15px ${JP}`; ctx.textBaseline = 'alphabetic';
  ctx.fillText(fitText(ctx, c.title, tw), tx, y + 28);
  // 難易度・定数
  let ax = tx;
  ax += tag(ctx, ax, y + 38, DIFF_SHORT[c.diff] ? DIFF_SHORT[c.diff].slice(0, 3) : c.diff, dc, c.diff === 'LUNATIC' ? T.lntInk : '#fff') + 6;
  ctx.fillStyle = T.muted; ctx.font = `600 13px ${NUM}`; ctx.textBaseline = 'middle';
  const cst = c.const != null ? c.const.toFixed(1) : '—';
  const mark = c.constManual ? ' 手' : c.constInferred ? ' 計' : c.constEstimated ? ' ?' : '';
  ctx.fillText(`定数 ${cst}${mark}`, ax, y + 47.5);

  ctx.textBaseline = 'alphabetic';
  if (!isP) {
    // スコア・ランク・ランプ
    ctx.fillStyle = T.text; ctx.font = `700 18px ${NUM}`;
    const sc = n(c.techScore); ctx.fillText(sc, tx, y + 80);
    let lx = tx + ctx.measureText(sc).width + 8;
    const rk = rankOf(c.techScore || 0);
    ctx.fillStyle = rk.startsWith('SSS') ? T.gold : rk === 'SS' || rk === 'S' ? T.blue : T.muted;
    ctx.font = `700 13px ${NUM}`; ctx.fillText(rk, lx, y + 80);
    lx += ctx.measureText(rk).width + 8;
    let lamp = c.lamp; if (lamp === 'AB' && c.techScore >= 1010000) lamp = 'AB+';
    let ly = y + 88; let lx2 = tx;
    if (lamp) lx2 += tag(ctx, lx2, ly, lamp, lamp === 'FC' ? T.blue : lamp === 'AB' ? T.pink : T.gold) + 4;
    if (c.fullBell) tag(ctx, lx2, ly, 'FB', T.green);
    // 単曲レート
    ctx.textAlign = 'right'; ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = T.accent; ctx.font = `700 20px ${NUM}`;
    ctx.fillText(n(c.techRate, 3), x + w - 12, y + h - 12);
    ctx.textAlign = 'left';
  } else {
    const pl = c.platinum || {};
    ctx.fillStyle = T.text; ctx.font = `700 17px ${NUM}`;
    const sc = `${n(pl.score)}`; ctx.fillText(sc, tx, y + 80);
    const scw = ctx.measureText(sc).width;
    ctx.fillStyle = T.muted; ctx.font = `600 13px ${NUM}`;
    ctx.fillText(`/ ${n(pl.max)}`, tx + scw + 6, y + 80);
    ctx.font = `600 12px ${NUM}`;
    ctx.fillText(`${n((c.plat?.ratio || 0) * 100, 2)}%`, tx, y + 100);
    ctx.fillStyle = T.gold; ctx.font = `700 14px ${NUM}`;
    ctx.fillText(`☆${c.plat?.stars || 0}${c.plat?.rainbow ? ' 虹' : ''}`, tx + 64, y + 100);
    ctx.textAlign = 'right';
    ctx.fillStyle = T.accent; ctx.font = `700 20px ${NUM}`;
    ctx.fillText(n(c.platRate, 3), x + w - 12, y + h - 12);
    ctx.textAlign = 'left';
  }
}
