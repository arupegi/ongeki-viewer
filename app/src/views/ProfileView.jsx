import { Card } from '@astryxdesign/core/Card';
import { Heading } from '@astryxdesign/core/Heading';
import { Text } from '@astryxdesign/core/Text';
import { Avatar } from '@astryxdesign/core/Avatar';
import { fmt, f3, Diff, LineChart, Muted } from '../ui.jsx';
import { fmtDate, totalLevel } from '../store.js';

export function ProfileView({ data, S }) {
  const p = data.player || {};
  const played = data.scores.filter((s) => s.played);
  const count = (f) => played.filter(f).length;
  const money = String(p.money || '');
  const stats = [
    ['レーティング', f3(p.rating), `MAX ${f3(p.ratingMax)}`],
    ['レベル', fmt(totalLevel(p)), p.reincarnation ? `転生${p.reincarnation}回 ＋ Lv.${p.level}` : ''],
    ['バトルポイント', fmt(p.battlePoint), ''],
    ['プレイTRACK数', fmt(p.totalTracks), ''],
    ['所持マニー', money.replace(/（.*$/, '') || '—', (money.match(/（(.*)）/) || [])[1] || ''],
    ['プレイ済み譜面', fmt(played.length), data.chartCount ? `全 ${fmt(data.chartCount)} 譜面中` : ''],
    ['AB 以上', fmt(count((s) => s.lamp === 'AB' || s.lamp === 'AB+')), `FC 以上 ${fmt(count((s) => s.lamp))}`],
    ['SSS+', fmt(count((s) => s.techScore >= 1007500)), `SSS 以上 ${fmt(count((s) => s.techScore >= 1000000))}`],
    ['FULL BELL', fmt(count((s) => s.fullBell)), ''],
    ['所持カード', fmt((data.cards || []).length), '枚'],
  ];
  const pts = S.ratings.filter((r) => r.official != null).map((r) => ({ x: Date.parse(r.at), y: r.official, label: `${fmtDate(Date.parse(r.at))}  ${f3(r.official)}` }));
  return (
    <div className="og-stack">
      <Card padding={5}>
        <div className="og-profile">
          <Avatar src={p.iconUrl} name={p.name || '?'} size={72} shape="rounded" tooltip={false} />
          <div className="og-profile-text">
            <div className="og-row">
              <Heading level={2}>{p.name}</Heading>
              {p.trophy && <span className="og-trophy">{p.trophy}</span>}
            </div>
            {p.comment && <Text type="body" color="secondary">{p.comment}</Text>}
            <Muted>データ取得：{fmtDate(Date.parse(data.fetchedAt))}</Muted>
          </div>
        </div>
      </Card>
      <div className="og-stats">
        {stats.map(([k, v, sub]) => (
          <Card key={k} padding={3} variant="muted">
            <div className="og-stat-k">{k}</div>
            <div className="og-stat-v og-num">{v}{sub && <small> {sub}</small>}</div>
          </Card>
        ))}
      </div>
      <Card padding={4}>
        <div className="og-row og-space"><Heading level={3}>レーティング推移</Heading><Muted>取り込むたびに記録（{S.ratings.length}回分）</Muted></div>
        <LineChart points={pts} label="レーティング推移" />
      </Card>
      {(p.activity || []).length > 0 && (
        <Card padding={4}>
          <Heading level={3}>最近の達成（オンゲキNET）</Heading>
          <div className="og-timeline">
            {p.activity.map((a, i) => (
              <div className="og-ev" key={i}>
                <div className="og-ev-when og-num">{a.date}</div>
                <div className="og-ev-what"><Text>{a.text}</Text>{a.title && <div>{a.diff && <Diff d={a.diff} />} {a.title}</div>}</div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
