import { useEffect, useRef, useState } from 'react';
import { Card } from '@astryxdesign/core/Card';
import { Heading } from '@astryxdesign/core/Heading';
import { Button } from '@astryxdesign/core/Button';
import { SegmentedControl, SegmentedControlItem } from '@astryxdesign/core/SegmentedControl';
import { Banner } from '@astryxdesign/core/Banner';
import * as store from '../store.js';
import { drawFrameImage, FRAME_SETS } from '../frameImage.js';
import { Muted } from '../ui.jsx';

const canDownload = window.self === window.top; // アーティファクト内（iframe）ではダウンロードできない

export function ImageView({ data, notify }) {
  const [set, setSet] = useState('best');
  const [theme, setTheme] = useState('dark');
  const [cols, setCols] = useState('5');
  const [url, setUrl] = useState(null);
  const [busy, setBusy] = useState(false);
  const canvasRef = useRef(null);
  const jackets = store.getJackets();
  const hasJackets = Object.keys(jackets).length > 0;

  useEffect(() => {
    let alive = true;
    setBusy(true);
    drawFrameImage(data, { set, theme, columns: Number(cols), getJacket: (c) => store.jacketOf(c) })
      .then((cv) => {
        if (!alive) return;
        canvasRef.current = cv;
        cv.toBlob((b) => { if (!alive || !b) return; setUrl((old) => { if (old) URL.revokeObjectURL(old); return URL.createObjectURL(b); }); setBusy(false); }, 'image/png');
      })
      .catch((e) => { setBusy(false); notify('画像を作れませんでした: ' + e.message); });
    return () => { alive = false; };
  }, [data, set, theme, cols]); // eslint-disable-line react-hooks/exhaustive-deps

  const download = () => {
    if (!url) return;
    const a = document.createElement('a');
    const d = new Date(data.fetchedAt || Date.now());
    const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
    a.href = url; a.download = `ongeki-${set}-${ymd}.png`;
    document.body.appendChild(a); a.click(); a.remove();
  };
  const copy = async () => {
    try {
      const blob = await (await fetch(url)).blob();
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      notify('画像をコピーしました');
    } catch (e) { notify('このブラウザでは画像をコピーできませんでした。保存してから使ってください'); }
  };

  return (
    <div className="og-stack">
      <Card padding={4}>
        <div className="og-row og-space">
          <Heading level={2}>レート枠を画像にする</Heading>
          <div className="og-row">
            {canDownload && <Button label="PNGで保存" variant="primary" size="sm" onClick={download} isDisabled={!url} />}
            <Button label="画像をコピー" size="sm" onClick={copy} isDisabled={!url} />
          </div>
        </div>
        <div className="og-row og-filter-row og-pad-y">
          <SegmentedControl value={set} onChange={setSet} label="対象" size="sm">
            {Object.entries(FRAME_SETS).map(([k, v]) => <SegmentedControlItem key={k} value={k} label={v.label} />)}
          </SegmentedControl>
          <SegmentedControl value={theme} onChange={setTheme} label="配色" size="sm">
            <SegmentedControlItem value="dark" label="ダーク" />
            <SegmentedControlItem value="light" label="ライト" />
          </SegmentedControl>
          <SegmentedControl value={cols} onChange={setCols} label="列数" size="sm">
            <SegmentedControlItem value="3" label="3列" />
            <SegmentedControlItem value="5" label="5列" />
          </SegmentedControl>
        </div>
        <Muted>{canDownload ? '「PNGで保存」でダウンロードできます。' : 'このページでは保存ボタンが使えません。画像を右クリック（スマホは長押し）して保存してください。'}3列はスマホで見る・共有するのに向いています。</Muted>
      </Card>
      {!hasJackets && !data.sample && (
        <Banner status="info" collapsible={false} title="ジャケット画像がまだありません"
          description="新しいブックマークレットで取り込み直すと、レート対象曲のジャケットが入ります。" />
      )}
      <div className="og-image-preview">
        {url ? <img src={url} alt={`${FRAME_SETS[set].label}の画像`} /> : <div className="og-empty">{busy ? '画像を作っています…' : ''}</div>}
      </div>
    </div>
  );
}
