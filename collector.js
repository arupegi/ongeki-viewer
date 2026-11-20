/* オンゲキNET データ取得スクリプト
 * ongeki-net.com にログインした状態でブックマークレットとして実行する。
 * ビューアから開いたタブで実行すると、ビューアへ直接送る。それ以外は JSON ファイルとしてダウンロードする。
 * Web版: https://arupegi.github.io/ongeki-viewer/ （短いブックマークレットは、このファイルを Web版から読み込む）
 */
(async () => {
  'use strict';
  const BASE = 'https://ongeki-net.com/ongeki-mobile';
  const DB_URL = 'https://otoge-db.net/ongeki/data/music-ex.json';
  // 同時に4本・80ms間隔で読んだところ、NETの「短時間の連続アクセス」制限（エラー200001）にかかった。
  // そのため、ページの読み込みは開始の間隔を INTERVAL あけて1本ずつ進める（以前の安定していた速さと同程度）。
  // 速くするのは、読むページ数を減らす方（取得済みの内訳・ジャケット・カードを省く）で行う。
  const CONCURRENCY = 2; // pool() の同時処理数（実際のアクセス間隔は INTERVAL で抑える）
  const GAP = 0;
  const INTERVAL = 350; // ページを読み始める間隔(ms)。以前の安定していた版（350ms待ってから1本ずつ）と同程度
  const IMAGE_INTERVAL = 250; // ジャケット画像を読み始める間隔(ms)
  const CARD_REFRESH_DAYS = 7; // カード一覧を読み直す間隔
  const CARD_DETAIL_LIMIT = 30; // カード一覧を読んだ回に、性能（詳細ページ）を読む枚数
  const CARD_DETAIL_BULK = 200; // 「まとめて取得」をオンにした回の枚数
  const DIFFS = [
    { id: 0, key: 'bas', name: 'BASIC' },
    { id: 1, key: 'adv', name: 'ADVANCED' },
    { id: 2, key: 'exc', name: 'EXPERT' },
    { id: 3, key: 'mas', name: 'MASTER' },
    { id: 10, key: 'lnt', name: 'LUNATIC' },
  ];
  const DIFF_BY_IMG = { basic: 'BASIC', advanced: 'ADVANCED', expert: 'EXPERT', master: 'MASTER', lunatic: 'LUNATIC' };

  if (!location.hostname.endsWith('ongeki-net.com')) {
    alert('オンゲキNET（ongeki-net.com）にログインした状態で実行してください。');
    return;
  }
  if (window.__ongekiCollectorRunning) return;
  window.__ongekiCollectorRunning = true;

  // ---------- 進捗表示 ----------
  const box = document.createElement('div');
  box.style.cssText = 'position:fixed;inset:auto 8px 8px 8px;z-index:99999;background:#1b1530;color:#fff;font:14px/1.5 sans-serif;padding:12px 14px;border-radius:10px;box-shadow:0 4px 20px rgba(0,0,0,.4);white-space:pre-wrap';
  document.body.appendChild(box);
  // 並行して進む処理ごとに1行ずつ表示する
  const status = new Map();
  const log = (m, key = 'main') => {
    status.set(key, m);
    box.textContent = 'オンゲキデータ取得中…\n' + [...status.values()].join('\n');
  };
  // ビューアと同じ形式のプレイの識別子
  const playKey = (p) => [p.date, p.diff, p.title, p.techScore, p.battleScore].join('|');

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const parser = new DOMParser();
  // items を最大 limit 本ずつ並行して処理する（結果は items と同じ順番）
  async function pool(items, limit, fn) {
    const out = new Array(items.length);
    let next = 0;
    const worker = async () => {
      while (next < items.length) { const i = next++; out[i] = await fn(items[i], i); await sleep(GAP); }
    };
    await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
    return out;
  }
  // NETへのアクセスは、開始の間隔を INTERVAL 以上あける（短時間に連続すると、NET側でアクセス制限がかかる）
  function spacer(interval) {
    let chain = Promise.resolve();
    let last = 0;
    return () => {
      chain = chain.then(async () => {
        const w = last + interval - Date.now();
        if (w > 0) await sleep(w);
        last = Date.now();
      });
      return chain;
    };
  }
  const pageSlot = spacer(INTERVAL);
  const imageSlot = spacer(IMAGE_INTERVAL);
  async function get(path) {
    await pageSlot();
    const res = await fetch(BASE + path, { credentials: 'include' });
    const html = await res.text();
    if (/エラーコード：?\s*200001/.test(html)) {
      throw new Error('オンゲキNETの「短時間の連続アクセス」による制限がかかりました。10分ほど待ってから、もう一度実行してください。');
    }
    const doc = parser.parseFromString(html, 'text/html');
    if (/\/error\//.test(res.url) || /エラーコード/.test(doc.body.textContent.slice(0, 2000))) {
      throw new Error('オンゲキNETがエラーを返しました（ログイン切れの可能性）: ' + path);
    }
    return doc;
  }
  const txt = (el) => (el ? el.textContent.replace(/\s+/g, ' ').trim() : '');
  const num = (s) => { const v = String(s || '').replace(/[^\d.\-]/g, ''); return v === '' ? null : Number(v); };
  const imgName = (img) => (img ? img.getAttribute('src').split('/').pop().split('?')[0] : '');
  const abs = (src) => (src ? new URL(src, BASE + '/').href : '');

  function parseIcons(container) {
    const r = { battleRank: null, techRank: null, fullBell: false, lamp: null };
    if (!container) return r;
    container.querySelectorAll('img').forEach((img) => {
      const n = imgName(img).replace(/\.png$/, '');
      let m;
      if ((m = n.match(/^music_icon_br_(.+)$/))) r.battleRank = m[1];
      else if ((m = n.match(/^music_icon_tr_(.+)$/))) r.techRank = m[1];
      else if (n === 'music_icon_fb') r.fullBell = true;
      else if (n === 'music_icon_fc') r.lamp = 'FC';
      else if (n === 'music_icon_ab') r.lamp = 'AB';
      else if (/^music_icon_ab_?plus$/.test(n)) r.lamp = 'AB+';
    });
    return r;
  }
  function parsePlatinum(block) {
    if (!block) return null;
    const m = txt(block).match(/([\d,]+)\s*\/\s*([\d,]+)/);
    if (!m) return null;
    const starEl = block.querySelector('.platinum_high_score_star_block .f_b');
    const starBox = block.querySelector('[class*="platinum_score_star_block"]');
    return {
      score: num(m[1]), max: num(m[2]),
      stars: starEl ? num(txt(starEl)) : null,
      starClass: starBox ? starBox.className : '',
    };
  }

  // ---------- プレイヤーデータ ----------
  async function fetchPlayer() {
    const d = await get('/home/playerDataDetail/');
    const q = (s) => d.querySelector(s);
    const detail = {};
    d.querySelectorAll('.user_data_detail_block tr').forEach((tr) => {
      const tds = tr.querySelectorAll('td');
      if (tds.length >= 3) detail[txt(tds[1])] = txt(tds[2]);
    });
    const ratingText = txt(q('.rating_new_block'));
    const maxM = ratingText.match(/MAX\s*([\d.]+)/);
    const activity = [...d.querySelectorAll('.user_activity_table tr')].map((tr) => {
      const tds = tr.querySelectorAll('td');
      const img = tds[1] && tds[1].querySelector('img');
      const lines = tds[1] ? tds[1].innerText.split('\n').map((s) => s.trim()).filter(Boolean) : [];
      return {
        date: txt(tds[0]),
        text: lines[0] || '',
        diff: img ? DIFF_BY_IMG[(imgName(img).match(/diff_(\w+)/) || [])[1]] || null : null,
        title: lines.slice(1).join(' ') || null,
      };
    });
    return {
      name: txt(q('.name_block')),
      level: num(txt(q('.lv_block'))),
      reincarnation: num(txt(q('.reincarnation_block'))) || 0,
      trophy: txt(q('.trophy_block')),
      trophyClass: (q('.trophy_block') || { className: '' }).className.split(' ').find((c) => /^trophy_\d/.test(c)) || '',
      battlePoint: num(txt(q('[class^="battle_point"]'))),
      rating: num(txt(q('.rating_new_block .rating_field span'))),
      ratingMax: maxM ? Number(maxM[1]) : null,
      ratingLabel: imgName(q('.rating_new_block img')),
      comment: txt(q('.comment_block')),
      money: detail['所持マニー'] || null,
      totalTracks: num(detail['トータルプレイTRACK数']),
      iconUrl: abs((q('.icon_block img') || {}).getAttribute?.('src')),
      charaUrl: abs((q('.home_character_block img') || {}).getAttribute?.('src')),
      battleRankUrl: abs((q('.battle_rank_block img') || {}).getAttribute?.('src')),
      activity,
    };
  }

  // ---------- 全曲スコア ----------
  // diffs: 読む難易度名の配列（null なら全難易度）
  async function fetchScores(diffs) {
    const targets = diffs ? DIFFS.filter((df) => diffs.includes(df.name)) : DIFFS;
    log(targets.length ? `スコア取得（${diffs ? targets.map((df) => df.name).join('・') : '全難易度'}）` : 'スコア: 新しいプレイがないため省略', 'score');
    const lists = await pool(targets, CONCURRENCY, async (df) => {
      const out = [];
      const d = await get(`/record/musicGenre/search/?genre=99&diff=${df.id}`);
      const cont = d.querySelector('.container3') || d.body;
      let genre = '';
      for (const el of cont.children) {
        if (el.matches('div.p_5.f_20')) { genre = txt(el); continue; }
        if (!el.matches('.basic_btn')) continue;
        const title = txt(el.querySelector('.music_label'));
        const level = txt(el.querySelector('.score_level'));
        const e = { title, genre, diff: df.name, level, played: false };
        const tbl = el.querySelector('table.score_table');
        if (tbl) {
          const vals = [...tbl.querySelectorAll('tr:nth-child(2) td')].map(txt);
          if (vals.length >= 3) {
            e.played = true;
            e.overDamage = num(vals[0]);
            e.battleScore = num(vals[1]);
            e.techScore = num(vals[2]);
          }
          e.platinum = parsePlatinum(el.querySelector('.platinum_score_block'));
          Object.assign(e, parseIcons(el.querySelector('.music_score_icon_area')));
        }
        out.push(e);
      }
      return out;
    });
    log('スコア取得: 完了', 'score');
    return lists.flat();
  }

  // ---------- プレイ履歴（最新50件） ----------
  async function fetchPlaylog() {
    log('プレイ履歴取得', 'detail');
    const d = await get('/record/playlog/');
    return [...d.querySelectorAll('.container3 > .m_10')].map((el) => {
      const diffImg = el.querySelector('img[src*="diff_"]');
      const nums = [...el.querySelectorAll('.playlog_score_block .f_20')].map(txt);
      const ranks = [...el.querySelectorAll('.playlog_score_block td.w_65 img')].map(imgName);
      const lampImgs = [...el.querySelectorAll('.playlog_score_block .clearfix img')].map(imgName);
      const has = (k) => lampImgs.some((n) => n === `score_detail_${k}.png`);
      const titleEl = el.querySelector('.m_5.l_h_10');
      return {
        date: txt(el.querySelector('span.f_r')),
        diff: diffImg ? DIFF_BY_IMG[(imgName(diffImg).match(/diff_(\w+)/) || [])[1]] || null : null,
        title: txt(titleEl),
        jacketUrl: abs((el.querySelector('img[src*="/music/"]') || {}).getAttribute?.('src')),
        battleScore: num(nums[0]),
        overDamage: num(nums[1]),
        techScore: num(nums[2]),
        battleRank: (ranks[0] || '').replace(/^score_br_|\.png$/g, ''),
        techRank: (ranks[1] || '').replace(/^score_tr_|\.png$/g, ''),
        win: lampImgs.find((n) => /score_detail_(win|lose|draw)/.test(n))?.replace(/^score_detail_|\.png$/g, '') || null,
        fullBell: has('fb'),
        lamp: has('abplus') || has('ab_plus') ? 'AB+' : has('ab') ? 'AB' : has('fc') ? 'FC' : null,
        lampImgs,
        idx: (el.querySelector('input[name=idx]') || {}).value ?? null,
      };
    });
  }

  // ---------- プレイ詳細（判定内訳など） ----------
  async function fetchPlayDetail(idx) {
    const d = await get(`/record/playlogDetail/?idx=${encodeURIComponent(idx)}`);
    const det = {};
    const cell = (sel) => d.querySelector(sel + ' td');
    const firstRow = d.querySelector('.score_detail_table tr');
    if (firstRow && firstRow.querySelector('img[src*="score_max_combo"]')) det.maxCombo = num(txt(firstRow.querySelector('td')));
    det.criticalBreak = num(txt(cell('tr.score_critical_break')));
    det.break = num(txt(cell('tr.score_break')));
    det.hit = num(txt(cell('tr.score_hit')));
    det.miss = num(txt(cell('tr.score_miss')));
    const bell = txt(cell('tr.score_bell')).match(/(\d+)\s*\/\s*(\d+)/);
    if (bell) { det.bell = Number(bell[1]); det.bellTotal = Number(bell[2]); }
    det.damage = num(txt(cell('tr.score_damage')));
    det.rates = {};
    d.querySelectorAll('.score_detail_table tr').forEach((tr) => {
      const th = txt(tr.querySelector('th'));
      if (/^(TAP|HOLD|FLICK|SIDE TAP|SIDE HOLD)$/.test(th)) det.rates[th] = num(txt(tr.querySelector('td')));
    });
    return det;
  }
  // knownPlays: ビューアが内訳を持っているプレイ（playKey の Set）。これらは読み直さない
  async function attachPlayDetails(playlog, knownPlays) {
    const todo = playlog.filter((p) => p.idx != null && !knownPlays.has(playKey(p)));
    const skipped = playlog.length - todo.length;
    let done = 0;
    const msg = () => `プレイ詳細取得: ${done}/${todo.length}${skipped ? `（取得済みの ${skipped}件は省略）` : ''}`;
    log(msg(), 'detail');
    await pool(todo, CONCURRENCY, async (p) => {
      try { p.detail = await fetchPlayDetail(p.idx); } catch (e) { console.warn(e); }
      done++; log(msg(), 'detail');
    });
  }

  // ---------- レーティング対象曲（NET表示） ----------
  async function fetchRatingTarget() {
    log('レーティング対象曲取得', 'rt');
    const d = await get('/home/ratingTargetMusic/');
    const MAP = {
      title_ratingmusic_bestnew: 'new', title_ratingmusic_best: 'best', title_ratingmusic_new_platinum: 'platinum',
      title_ratingmusic_new_next_new: 'nextNew', title_ratingmusic_new_next_best: 'nextBest', title_ratingmusic_new_next_platinum: 'nextPlatinum',
    };
    const res = {};
    const root = d.querySelector('.main_wrapper') || d.body;
    let cur = null;
    root.querySelectorAll('img.title, .basic_btn').forEach((el) => {
      if (el.matches('img.title')) { cur = MAP[imgName(el).replace('.png', '')] || null; if (cur) res[cur] = []; return; }
      if (!cur) return;
      const diffImg = el.querySelector('img[src*="diff_"]');
      const scoreTd = el.querySelector('.score_value');
      const e = {
        title: txt(el.querySelector('.music_label')),
        level: txt(el.querySelector('.score_level')),
        diff: diffImg ? DIFF_BY_IMG[(imgName(diffImg).match(/diff_(\w+)/) || [])[1]] || null : null,
      };
      const pl = parsePlatinum(el.querySelector('.rating_target_platinum_score_block'));
      if (pl) e.platinum = pl;
      else { e.techScore = num(txt(scoreTd)); Object.assign(e, parseIcons(el.querySelector('.music_score_icon_area'))); }
      res[cur].push(e);
    });
    return res;
  }

  // ---------- 所持カード ----------
  async function fetchCards() {
    const cards = [];
    log('カード取得: 1ページ目', 'card');
    const first = await get('/card/cardList/search/?ip=all&ipType=0&search=0&sIdx=-1');
    const pm = txt(first.querySelector('#page')).match(/\/\s*(\d+)/);
    const total = pm ? Number(pm[1]) : 1;
    let done = 1;
    const rest = await pool(Array.from({ length: Math.max(0, total - 1) }, (_, i) => i + 2), CONCURRENCY, async (page) => {
      const d = await get(`/card/cardList/pages/?pIdx=${page}&type=0`);
      log(`カード取得: ${++done}/${total} ページ`, 'card');
      return d;
    });
    for (const d of [first, ...rest]) {
      d.querySelectorAll('.border_block').forEach((b) => {
        const cardImg = b.querySelector('img[src*="/img/card/"]');
        if (!cardImg) return;
        const icons = [...b.querySelectorAll('img')].map(imgName);
        const name = txt(b.querySelector('.break'));
        const chokaika = icons.includes('card_icon_chokaika.png'); // 超開花（このときは開花の印が付かない）
        cards.push({
          name,
          rarity: (icons.find((n) => /^card_icon_(n|r|sr|ssr|sr_plus|srp|r_plus)\.png$/.test(n)) || '').replace(/^card_icon_|\.png$/g, '').toUpperCase() || (name.match(/^【(.+?)】/) || [])[1] || '',
          attribute: (icons.find((n) => /^card_icon_(fire|aqua|leaf)\.png$/.test(n)) || '').replace(/^card_icon_|\.png$/g, ''),
          kaika: chokaika || icons.includes('card_icon_kaika.png'),
          chokaika,
          stars: icons.filter((n) => n === 'card_icon_star_on.png').length,
          imageUrl: abs(cardImg.getAttribute('src')),
          id: imgName(cardImg), // カード画像のファイル名を、取り込みをまたいだ識別子にする
          idx: (b.querySelector('input[name=idx]') || {}).value || null, // 詳細ページ用（セッションごとに変わる）
        });
      });
    }
    return cards;
  }

  // ---------- カードの性能（詳細ページ） ----------
  let cardDetailStopped = false;
  async function fetchCardDetail(idx) {
    const d = await get(`/card/cardDetail/?idx=${encodeURIComponent(idx)}`);
    const det = {};
    const lv = d.querySelectorAll('.card_lv_block span');
    if (lv.length >= 2) { det.level = num(txt(lv[0])); det.maxLevel = num(txt(lv[1])); }
    d.querySelectorAll('.card_detail_param_block tr').forEach((tr) => {
      const tds = tr.querySelectorAll('td');
      if (tds.length < 2) return;
      const k = txt(tds[0]);
      if (k === '攻撃力') { const m = txt(tds[1]).match(/(\d+)\s*\/\s*(\d+)/); if (m) { det.attack = Number(m[1]); det.maxAttack = Number(m[2]); } }
      else if (k === '印刷可能回数') det.printable = num(txt(tds[1]));
      else if (k === 'ver.') det.version = txt(tds[1]);
    });
    const sk = d.querySelector('.card_skill_table');
    if (sk) {
      const rows = sk.querySelectorAll('tr');
      const icon = sk.querySelector('img');
      det.skillType = icon ? imgName(icon).replace(/^skill_|\.png.*$/g, '').trim() : null;
      det.skillName = txt(rows[0] && rows[0].querySelectorAll('td')[1]);
      const descTd = rows[1] && rows[1].querySelector('td');
      det.skillDesc = descTd ? descTd.innerHTML.split(/<br\s*\/?>/i).map((t) => t.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()).filter(Boolean).join('\n') : '';
    }
    det.obtain = txt(d.querySelector('.card_detail_other_item')) || null;
    return det;
  }
  // known: ビューアが持っている性能 { id: { level, maxLevel, stars, kaika, chokaika, at } }
  // 優先度: 未取得 → 開花・☆が変わった → レベルが上限でない（古い順）
  async function fetchCardDetails(cards, known, limit) {
    const stateOf = (c) => `${c.stars}|${c.kaika ? 1 : 0}|${c.chokaika ? 1 : 0}`;
    const missing = [], changed = [], growing = [];
    cards.forEach((c) => {
      if (!c.idx || !c.id) return;
      const k = known[c.id];
      if (!k) missing.push(c);
      else if (stateOf(k) !== stateOf(c)) changed.push(c);
      else if (k.level != null && k.maxLevel != null && k.level < k.maxLevel) growing.push(c);
    });
    growing.sort((a, b) => String(known[a.id].at || '').localeCompare(String(known[b.id].at || '')));
    const todo = [...missing, ...changed, ...growing].slice(0, limit);
    const out = {};
    let done = 0;
    let stopped = false;
    if (!todo.length) return out;
    log(`カード性能: 0/${todo.length}（未取得 ${missing.length}枚）`, 'carddetail');
    const at = new Date().toISOString();
    await pool(todo, CONCURRENCY, async (c) => {
      if (stopped) return;
      try { out[c.id] = { ...(await fetchCardDetail(c.idx)), stars: c.stars, kaika: c.kaika, chokaika: c.chokaika, at }; }
      catch (e) {
        if (/制限/.test(e.message)) { stopped = true; cardDetailStopped = true; log(`カード性能: アクセス制限のため ${done}枚で中断（読めた分は取り込みます）`, 'carddetail'); return; }
        console.warn(e);
      }
      log(`カード性能: ${++done}/${todo.length}（未取得 ${missing.length}枚）`, 'carddetail');
    });
    return out;
  }

  // ---------- 譜面定数（otoge-db） ----------
  async function attachConstants(scores, ratingTarget, dbPromise) {
    log('譜面定数データの照合（otoge-db.net）');
    const db = await dbPromise;
    if (!db) return { ok: false, error: 'otoge-db.net のデータを取得できませんでした' };
    const norm = (s) => String(s || '').normalize('NFKC').replace(/\s+/g, '').toLowerCase();
    const byTitle = new Map();
    db.forEach((m) => { const k = norm(m.title); if (!byTitle.has(k)) byTitle.set(k, []); byTitle.get(k).push(m); });
    const DK = { BASIC: 'bas', ADVANCED: 'adv', EXPERT: 'exc', MASTER: 'mas', LUNATIC: 'lnt' };
    const pick = (title, genre, diff, level) => {
      let c = (byTitle.get(norm(title)) || []).filter((m) => (diff === 'LUNATIC') === (m.lunatic === '1') && m['lev_' + DK[diff]]);
      if (c.length > 1 && genre) { const g = c.filter((m) => norm(m.category) === norm(genre)); if (g.length) c = g; }
      if (c.length > 1 && level) { const l = c.filter((m) => m['lev_' + DK[diff]] === level); if (l.length) c = l; }
      return c[0] || null;
    };
    let matched = 0;
    for (const s of scores) {
      const m = pick(s.title, s.genre, s.diff, s.level);
      const k = DK[s.diff];
      const lv = s.level || (m && m['lev_' + k]) || '';
      const ci = m ? parseFloat(m['lev_' + k + '_i']) : NaN;
      s.version = m ? m.version : null;
      s.dateAdded = m ? m.date_added : null;
      s.bonus = m ? m.bonus === '1' : false;
      s.notes = m ? num(m['lev_' + k + '_notes']) : null;
      s.bells = m ? num(m['lev_' + k + '_bells']) : null;
      s.jacketUrl = m && m.image_url ? `${BASE}/img/music/${m.image_url}` : null;
      if (!isNaN(ci)) { s.const = ci; s.constEstimated = false; }
      else { const b = parseFloat(lv); s.const = isNaN(b) ? null : b + (lv.includes('+') ? 0.7 : 0); s.constEstimated = true; }
      if (m) matched++;
    }
    // 「現バージョン（新曲枠）」の判定
    //  NETの新曲枠に並んでいる曲で一番多いバージョンを現バージョンとみなし、その開始日以降に追加された曲を新曲とする。
    //  （Re:Fresh Act.2 時点では、Re:Fresh(Act.1) の曲はベスト枠扱いだった）
    const versionStart = {};
    db.forEach((m) => { if (m.version && m.date_added && (!versionStart[m.version] || m.date_added < versionStart[m.version])) versionStart[m.version] = m.date_added; });
    const netNew = [...(ratingTarget.new || []), ...(ratingTarget.nextNew || [])];
    const netNewKeys = new Set(netNew.map((e) => e.diff + ':' + norm(e.title)));
    const vc = {};
    netNew.forEach((e) => { const m = pick(e.title, null, e.diff, e.level); if (m) vc[m.version] = (vc[m.version] || 0) + 1; });
    const curVersion = Object.keys(vc).sort((a, b) => vc[b] - vc[a])[0]
      || Object.keys(versionStart).sort((a, b) => (versionStart[b] > versionStart[a] ? 1 : -1))[0];
    const threshold = versionStart[curVersion] || '99999999';
    for (const s of scores) {
      s.isNew = netNewKeys.has(s.diff + ':' + norm(s.title)) || !s.dateAdded || s.dateAdded >= threshold;
    }
    // レート対象曲・次点候補のジャケット（スコアを読まなかった難易度の曲も含めるため、曲名から otoge-db で引く）
    const rtJacketUrls = new Set();
    Object.values(ratingTarget).flat().forEach((e) => {
      (byTitle.get(norm(e.title)) || []).filter((m) => (e.diff === 'LUNATIC') === (m.lunatic === '1') && m['lev_' + DK[e.diff]] === e.level)
        .forEach((m) => { if (m.image_url) rtJacketUrls.add(`${BASE}/img/music/${m.image_url}`); });
    });
    return { ok: true, source: DB_URL, matched, total: scores.length, currentVersion: curVersion, newThreshold: threshold, rtJacketUrls: [...rtJacketUrls] };
  }

  // ---------- ジャケット画像（画像ジェネレータ用） ----------
  // レート対象曲と次点候補のジャケットを、120px の JPEG に縮めて持っていく（ビューアのページからは直接読めないため）
  // knownJackets: ビューアが既に持っているファイル名。これらは読み直さない
  async function fetchJackets(urlList, knownJackets) {
    const urls = new Set(urlList);
    const names = [...urls].map((u) => u.split('/').pop());
    const todo = [...urls].filter((u) => !knownJackets.has(u.split('/').pop()));
    const out = {};
    let done = 0;
    if (todo.length) log(`ジャケット取得: 0/${todo.length}`, 'jacket');
    await pool(todo, 2, async (url) => {
      await imageSlot();
      try {
        const img = new Image();
        img.src = url;
        await img.decode();
        const c = document.createElement('canvas');
        c.width = c.height = 120;
        c.getContext('2d').drawImage(img, 0, 0, 120, 120);
        out[url.split('/').pop()] = c.toDataURL('image/jpeg', 0.82);
      } catch (e) { console.warn('jacket', url, e); }
      log(`ジャケット取得: ${++done}/${todo.length}`, 'jacket');
    });
    return { jackets: out, jacketNames: names };
  }

  // ---------- ビューアへの受け渡し ----------
  // 送り先は、このタブを開いたページ（window.opener）のうち、ローカルの index.html（origin が "null"）と Web版だけ。
  // ほかのサイトがこのタブを開いていた場合に、データを渡してしまわないための確認。
  const VIEWER_ORIGINS = ['null', 'https://arupegi.github.io']; // ローカルの index.html と Web版
  function waitMessage(source, type, timeout) {
    return new Promise((resolve) => {
      const on = (e) => {
        if (e.source !== source || !e.data || e.data.type !== type) return;
        clearTimeout(t); window.removeEventListener('message', on); resolve(e);
      };
      const t = setTimeout(() => { window.removeEventListener('message', on); resolve(null); }, timeout);
      window.addEventListener('message', on);
    });
  }
  // ビューアを探し、ビューアが既に持っているプレイ内訳・ジャケットの一覧も受け取る
  async function findViewer() {
    const op = window.opener;
    if (!op || op.closed) return null;
    const wait = waitMessage(op, 'ongeki-viewer-pong', 1500);
    try { op.postMessage({ type: 'ongeki-viewer-ping' }, '*'); } catch (e) { return null; }
    const e = await wait;
    if (!e || !VIEWER_ORIGINS.includes(e.origin)) return null;
    const k = e.data.known || {};
    return { win: op, knownPlays: new Set(k.plays || []), knownJackets: new Set(k.jackets || []), allPlays: new Set(k.allPlays || []), hasScores: !!k.hasScores, cardsFetchedAt: k.cardsFetchedAt || null, forceCards: !!k.forceCards, cardDetails: k.cardDetails || {}, cardDetailBulk: !!k.cardDetailBulk };
  }
  async function sendToViewer(viewer, data) {
    const wait = waitMessage(viewer, 'ongeki-viewer-received', 15000);
    try { viewer.postMessage({ type: 'ongeki-viewer-data', data }, '*'); } catch (e) { return null; }
    const e = await wait;
    return e ? e.data : null;
  }

  try {
    const t0 = Date.now();
    // ビューア探しと otoge-db の取得は、NETの読み込みと並行して進める
    const viewerP = findViewer();
    const dbP = fetch(DB_URL, { cache: 'no-cache' }).then((r) => r.json()).catch((e) => { console.warn(e); return null; });
    // NETのページはすべて pageSlot() で間隔をあけて読む（同時に投げても、開始は INTERVAL ごと）
    const playlogP = fetchPlaylog();
    const viewerAndPlaylogP = Promise.all([viewerP, playlogP]);
    // プレイの内訳: ビューアが持っていないプレイだけ
    const detailsP = viewerAndPlaylogP.then(([v, pl]) => attachPlayDetails(pl, v ? v.knownPlays : new Set()));
    // スコア: 前回からのプレイに出てきた難易度だけ読む（スコアはプレイしない限り変わらないため）
    //   ビューアが前回のスコアを持っていない、またはプレイ履歴50件がすべて新しい（取りこぼしがあり得る）ときは全難易度
    const scoreDiffsP = viewerAndPlaylogP.then(([v, pl]) => {
      if (!v || !v.hasScores) return null;
      const fresh = pl.filter((p) => !v.allPlays.has(playKey(p)));
      if (fresh.length === pl.length) return null;
      return [...new Set(fresh.map((p) => p.diff).filter(Boolean))];
    });
    const scoresP = scoreDiffsP.then((diffs) => fetchScores(diffs));
    const ratingTargetP = fetchRatingTarget();
    const playerP = fetchPlayer();
    // ジャケット: 譜面定数の照合が済みしだい、カードの性能を読むのと並行して取る（画像は別の間隔で読む）
    const constP = Promise.all([scoresP, ratingTargetP]).then(([sc, rt]) => attachConstants(sc, rt, dbP));
    const jacketsP = Promise.all([constP, viewerP]).then(([ci, v]) => fetchJackets(ci.rtJacketUrls || [], v ? v.knownJackets : new Set()));
    // カード一覧はめったに変わらないので、ビューアが CARD_REFRESH_DAYS 日以内に取得済みなら読まない
    const cardsP = viewerP.then((v) => {
      const age = v && v.cardsFetchedAt ? (Date.now() - Date.parse(v.cardsFetchedAt)) / 86400000 : Infinity;
      if (v && !v.forceCards && !v.cardDetailBulk && age < CARD_REFRESH_DAYS) { log(`カード: ${Math.floor(age)}日前に取得済みのため省略`, 'card'); return { cards: null, cardDetails: {} }; }
      return fetchCards().then(async (cards) => {
        // 性能はビューアに覚えてもらう前提なので、ビューアから開いたときだけ読む
        const cardDetails = v ? await fetchCardDetails(cards, v.cardDetails, v.cardDetailBulk ? CARD_DETAIL_BULK : CARD_DETAIL_LIMIT) : {};
        cards.forEach((c) => { delete c.idx; });
        return { cards, cardDetails };
      });
    });
    const [player, ratingTarget, scores, scoreDiffs, playlog, , constInfo, { jackets, jacketNames }, { cards, cardDetails }, viewerInfo] = await Promise.all([
      playerP, ratingTargetP, scoresP, scoreDiffsP, playlogP, detailsP, constP, jacketsP, cardsP, viewerP,
    ]);
    delete constInfo.rtJacketUrls;
    const data = {
      format: 'ongeki-viewer/1', fetchedAt: new Date().toISOString(), player, ratingTarget,
      scores, scoreDiffs, // scoreDiffs: 読んだ難易度（null は全難易度）。読まなかった難易度はビューアが前回の値を引き継ぐ
      playlog, cards, cardDetails, cardDetailStopped, constInfo, jackets, jacketNames,
    };
    window.__ongekiData = data;
    const sec = ((Date.now() - t0) / 1000).toFixed(1);
    if (window.__ongekiNoDownload) { box.textContent = `取得完了（テストモード・${sec}秒）`; return; }
    const scoreText = scoreDiffs ? (scoreDiffs.length ? `${scoreDiffs.join('・')}を更新` : '変化なし') : `${scores.filter((s) => s.played).length}譜面`;
    const cardText = cards ? `${cards.length}枚${Object.keys(cardDetails).length ? `（性能 ${Object.keys(cardDetails).length}枚）` : ''}` : '前回分を使用';
    const summary = `スコア ${scoreText} / 履歴 ${playlog.length}件 / カード ${cardText}（${sec}秒）${cardDetailStopped ? '\n※アクセス制限のため、カード性能は途中までです。10分ほどあけて再実行すると続きを読みます。' : ''}`;
    // このタブをビューアから開いた場合は、ビューアへ直接送る
    if (viewerInfo) {
      log('ビューアへ送信中');
      const viewer = viewerInfo.win;
      const ack = await sendToViewer(viewer, data);
      if (ack && ack.ok) {
        box.textContent = `取得完了！ビューアに取り込みました。\n${summary}\n${ack.message || ''}\nビューアのタブに戻ってください。（タップで閉じる）`;
        box.style.background = '#14532d';
        box.onclick = () => box.remove();
        try { viewer.focus(); } catch (e) { /* フォーカスできなくても問題なし */ }
        return;
      }
      if (ack && !ack.ok) log('ビューアでの取り込みに失敗: ' + ack.message + '\nファイルとして保存します');
    }
    const json = JSON.stringify(data);
    try { await navigator.clipboard.writeText(json); } catch (e) { /* クリップボード不可でも続行 */ }
    const blob = new Blob([json], { type: 'application/json' });
    const a = document.createElement('a');
    const ts = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '');
    a.href = URL.createObjectURL(blob);
    a.download = `ongeki-data-${ts}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    box.textContent = `取得完了！\n${summary}\nJSONをダウンロードしました（クリップボードにもコピー済み）。\nビューアの「データ取り込み」で読み込んでください。\n次からはビューアの「オンゲキNETを開く」から開くと、自動で取り込まれます。（タップで閉じる）`;
    box.onclick = () => box.remove();
  } catch (e) {
    console.error(e);
    box.textContent = 'エラー: ' + e.message + '\n（タップで閉じる）';
    box.style.background = '#6b1020';
    box.onclick = () => box.remove();
  } finally {
    window.__ongekiCollectorRunning = false;
  }
})();
