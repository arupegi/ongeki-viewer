/* オンゲキ Re:Fresh 以降のレーティング計算
 * 内部はすべて 1/1000 単位の整数で計算する（浮動小数点の誤差を避けるため）。
 * 実データで、オンゲキNETに表示されるレーティングと一致することを確認済み（2026年11月）。
 */
const OngekiRating = (() => {
  // テクニカルスコア → 補正値（1/1000単位）。区間内は線形で、1/1000未満は切り捨て。
  const POINTS = [
    [800000, -6000], [900000, -4000], [970000, 0], [990000, 750],
    [1000000, 1250], [1007500, 1750], [1010000, 2000],
  ];
  function scoreCoefMilli(ts, constMilli) {
    if (ts >= 1010000) return 2000;
    if (ts < 800000) {
      // 50万点で単曲レート0、80万点で -6.000 となる区間（Wiki記載）
      if (ts <= 500000) return -constMilli;
      const lo = -constMilli, hi = -6000;
      return lo + Math.floor(((ts - 500000) * (hi - lo)) / 300000);
    }
    for (let i = 0; i < POINTS.length - 1; i++) {
      const [s0, v0] = POINTS[i], [s1, v1] = POINTS[i + 1];
      if (ts >= s0 && ts < s1) return v0 + Math.floor(((ts - s0) * (v1 - v0)) / (s1 - s0));
    }
    return 2000;
  }
  const rankBonusMilli = (ts) => (ts >= 1007500 ? 300 : ts >= 1000000 ? 200 : ts >= 990000 ? 100 : 0);
  const lampBonusMilli = (lamp) => ({ FC: 100, AB: 300, 'AB+': 350 }[lamp] || 0);

  function techRateMilli(chart) {
    if (chart.const == null || chart.techScore == null) return 0;
    const c = Math.round(chart.const * 1000);
    let lamp = chart.lamp;
    if (lamp === 'AB' && chart.techScore >= 1010000) lamp = 'AB+';
    const v = c + scoreCoefMilli(chart.techScore, c) + rankBonusMilli(chart.techScore)
      + (chart.fullBell ? 50 : 0) + lampBonusMilli(lamp);
    return Math.max(0, v);
  }

  // プラチナスコアの☆（理論値に対する割合: 94%→☆1 … 98%→☆5、99%以上は虹☆5）
  function platinumStars(p) {
    if (!p || !p.max) return { stars: 0, rainbow: false, ratio: 0 };
    let stars = 0;
    for (let s = 5; s >= 1; s--) if (p.score * 100 >= p.max * (93 + s)) { stars = s; break; }
    return { stars, rainbow: p.score * 100 >= p.max * 99, ratio: p.score / p.max };
  }
  function platinumRateMilli(chart) {
    if (chart.const == null || !chart.platinum) return 0;
    const { stars } = platinumStars(chart.platinum);
    const c10 = Math.round(chart.const * 10);
    // ☆数 × 定数² ÷ 1000 → 1/1000単位では ☆数 × 定数²
    return Math.floor((stars * c10 * c10) / 100);
  }

  const isEligible = (s) => s.played && !s.bonus && !(s.diff === 'LUNATIC' && s.level === '0') && s.const != null;
  const kOf = (s) => s.diff + ':' + s.title;

  // 同名曲（Singularity など）を区別するための一意キーを振る
  function assignUids(scores) {
    const count = {};
    scores.forEach((s) => { count[kOf(s)] = (count[kOf(s)] || 0) + 1; });
    const seen = {};
    return scores.map((s) => {
      let uid = kOf(s);
      if (count[uid] > 1) { seen[uid] = (seen[uid] || 0) + 1; uid += `#${s.genre || ''}#${seen[uid]}`; }
      return s.uid === uid ? s : { ...s, uid };
    });
  }
  // NETのレート対象曲の1件を、スコア一覧の譜面に対応付ける（同名曲はスコアで見分ける）
  function matchEntry(scores, e) {
    const c = scores.filter((s) => s.played && kOf(s) === kOf(e));
    if (c.length <= 1) return c[0] || null;
    const m = c.find((s) => (e.platinum
      ? s.platinum && s.platinum.score === e.platinum.score && s.platinum.max === e.platinum.max
      : s.techScore === e.techScore && (e.level ? s.level === e.level : true)));
    return m || c.find((s) => s.level === e.level) || c[0];
  }

  const sumMilli = (l, k) => l.reduce((a, c) => a + c[k], 0);
  // 3つの枠の合計を ÷50 して、小数第3位で切り捨て（実データで検証済み）
  const totalOf = (sNew, sBest, sPlat) => Math.floor((sNew + sBest + sPlat) / 50);

  // overrides: { uid: 14.3 } のような手動の譜面定数
  function compute(scores, overrides = {}) {
    const charts = scores.map((s) => {
      const o = overrides[s.uid];
      return o != null && o !== '' ? { ...s, const: Number(o), constEstimated: false, constInferred: false, constManual: true } : s;
    }).filter(isEligible).map((s) => ({
      ...s,
      isNew: !!s.isNew,
      techRate: techRateMilli(s) / 1000,
      platRate: platinumRateMilli(s) / 1000,
      plat: platinumStars(s.platinum),
      _t: techRateMilli(s),
      _p: platinumRateMilli(s),
    }));
    const byT = (a, b) => b._t - a._t || (b.techScore || 0) - (a.techScore || 0);
    const byP = (a, b) => b._p - a._p || (b.platinum?.score || 0) - (a.platinum?.score || 0);
    const newList = charts.filter((c) => c.isNew).sort(byT);
    const oldList = charts.filter((c) => !c.isNew).sort(byT);
    const platList = charts.filter((c) => c.platinum).sort(byP);
    const frames = {
      new: newList.slice(0, 10), nextNew: newList.slice(10, 20),
      best: oldList.slice(0, 50), nextBest: oldList.slice(50, 70),
      platinum: platList.slice(0, 50), nextPlatinum: platList.slice(50, 70),
    };
    const sNew = sumMilli(frames.new, '_t'), sBest = sumMilli(frames.best, '_t'), sPlat = sumMilli(frames.platinum, '_p');
    const min = (l, k) => (l.length ? Math.min(...l.map((c) => c[k])) : 0);
    return {
      charts, frames,
      // 各枠の寄与（表示用。合計は totalOf で切り捨てる）
      part: { new: sNew / 50000, best: sBest / 50000, platinum: sPlat / 50000 },
      total: totalOf(sNew, sBest, sPlat) / 1000,
      avg: {
        new: frames.new.length ? sNew / frames.new.length / 1000 : 0,
        best: frames.best.length ? sBest / frames.best.length / 1000 : 0,
        platinum: frames.platinum.length ? sPlat / frames.platinum.length / 1000 : 0,
      },
      border: { new: min(frames.new, '_t') / 1000, best: min(frames.best, '_t') / 1000, platinum: min(frames.platinum, '_p') / 1000 },
    };
  }

  // 目標の単曲レートに必要なテクニカルスコア
  function requiredScore(chart, targetMilli) {
    let lo = 0, hi = 1010000;
    const t = (ts) => techRateMilli({ ...chart, techScore: ts });
    if (t(hi) < targetMilli) return null;
    while (lo < hi) { const mid = Math.floor((lo + hi) / 2); if (t(mid) >= targetMilli) hi = mid; else lo = mid + 1; }
    return lo;
  }

  // ---------- 譜面定数の逆算 ----------
  // レベル表記から取りうる定数（0.1刻み）: "14" → 14.0〜14.6、"14+" → 14.7〜14.9
  function levelCandidates(level) {
    const b = parseFloat(level);
    if (isNaN(b)) return [];
    const plus = String(level).includes('+');
    const out = [];
    for (let t = plus ? 7 : 0; t <= (plus ? 9 : 6); t++) out.push(Math.round((b + t / 10) * 10) / 10);
    return out;
  }

  /* NETの「レーティング対象曲」一覧と公式レートから、未確定の定数を絞り込む。
   *  A) 公式レート一致: 3枠に並ぶ譜面のレート合計から出した値が、公式レートと一致する組み合わせだけ残す
   *  B) 並び順: 一覧は単曲レートの高い順なので、前後の既知譜面のレートに挟まれる値だけ残す
   *  両方で絞れたら共通部分、片方だけならその結果を使う（NETの並びは同点付近で入れ替わることがあるため A を優先）。
   * 戻り値: { uid: { values: [14.1], method: 'total' | 'order' | 'both' | 'level' } }
   */
  function inferConstants(scores, ratingTarget, officialRating, overrides = {}) {
    const rt = ratingTarget || {};
    const unknown = scores.filter((s) => s.played && !s.bonus && s.constEstimated && overrides[s.uid] == null);
    if (!unknown.length) return {};
    const base = {};
    unknown.forEach((s) => { base[s.uid] = levelCandidates(s.level); });
    const tRate = (s, c) => techRateMilli({ ...s, const: c });
    const pRate = (s, c) => platinumRateMilli({ ...s, const: c });
    const constOf = (s) => (overrides[s.uid] != null ? Number(overrides[s.uid]) : s.const);
    const resolve = (entries) => entries.map((e) => matchEntry(scores, e));

    // B) 並び順
    const order = {};
    const lists = [
      { charts: resolve([...(rt.new || []), ...(rt.nextNew || [])]), fn: tRate },
      { charts: resolve([...(rt.best || []), ...(rt.nextBest || [])]), fn: tRate },
      { charts: resolve([...(rt.platinum || []), ...(rt.nextPlatinum || [])]), fn: pRate },
    ];
    for (const L of lists) {
      L.charts.forEach((s, i) => {
        if (!s || !base[s.uid]) return;
        let upper = Infinity, lower = -Infinity;
        L.charts.forEach((o, j) => {
          if (!o || j === i || base[o.uid]) return;
          const r = L.fn(o, constOf(o));
          if (j < i) upper = Math.min(upper, r); else lower = Math.max(lower, r);
        });
        const cur = order[s.uid] || base[s.uid];
        const f = cur.filter((c) => { const r = L.fn(s, c); return r <= upper && r >= lower; });
        if (f.length) order[s.uid] = f;
      });
    }

    // A) 公式レート一致
    const total = {};
    const target = officialRating != null ? Math.round(officialRating * 1000) : null;
    const frames = [
      { charts: resolve(rt.new || []), fn: tRate },
      { charts: resolve(rt.best || []), fn: tRate },
      { charts: resolve(rt.platinum || []), fn: pRate },
    ];
    const complete = frames.every((F) => F.charts.every(Boolean)) && frames[0].charts.length > 0;
    const involved = complete ? [...new Set(frames.flatMap((F) => F.charts.filter((s) => base[s.uid]).map((s) => s.uid)))] : [];
    let combos = 1;
    involved.forEach((u) => { combos *= base[u].length; });
    if (target != null && involved.length && combos <= 200000) {
      const ok = {};
      involved.forEach((u) => { ok[u] = new Set(); });
      // 未確定譜面を含まない部分の合計は先に計算しておく
      const fixed = frames.map((F) => F.charts.filter((s) => !base[s.uid]).reduce((a, s) => a + F.fn(s, constOf(s)), 0));
      const pick = {};
      const rec = (i) => {
        if (i === involved.length) {
          const sums = frames.map((F, fi) => F.charts.filter((s) => base[s.uid]).reduce((a, s) => a + F.fn(s, pick[s.uid]), fixed[fi]));
          if (totalOf(sums[0], sums[1], sums[2]) === target) involved.forEach((u) => ok[u].add(pick[u]));
          return;
        }
        for (const c of base[involved[i]]) { pick[involved[i]] = c; rec(i + 1); }
      };
      rec(0);
      if (involved.every((u) => ok[u].size)) involved.forEach((u) => { total[u] = [...ok[u]].sort((a, b) => a - b); });
    }

    const result = {};
    unknown.forEach((s) => {
      const u = s.uid, A = total[u], B = order[u];
      let values = base[u], method = 'level';
      if (A && B) { const both = A.filter((c) => B.includes(c)); if (both.length) { values = both; method = 'both'; } else { values = A; method = 'total'; } }
      else if (A) { values = A; method = 'total'; }
      else if (B && B.length < base[u].length) { values = B; method = 'order'; }
      result[u] = { values, method };
    });
    return result;
  }

  // 逆算結果を反映したスコア一覧を返す（1つに決まれば確定、範囲なら最小値で仮置き）
  function applyInferred(scores, inferred) {
    return scores.map((s) => {
      const r = inferred[s.uid];
      if (!r || !r.values.length) return s;
      const lo = r.values[0], hi = r.values[r.values.length - 1];
      return { ...s, const: lo, constEstimated: lo !== hi, constInferred: lo === hi, constRange: [lo, hi], constMethod: r.method };
    });
  }

  return {
    compute, inferConstants, applyInferred, assignUids, matchEntry, levelCandidates,
    techRateMilli, platinumRateMilli, platinumStars, scoreCoefMilli, requiredScore, isEligible,
  };
})();
export default OngekiRating;
