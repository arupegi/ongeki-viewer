import { useRef, useState } from 'react';
import { Card } from '@astryxdesign/core/Card';
import { Heading } from '@astryxdesign/core/Heading';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { Banner } from '@astryxdesign/core/Banner';
import { TextArea } from '@astryxdesign/core/TextArea';
import * as store from '../store.js';
import { BOOKMARKLET, LOADER, SITE_URL } from '../bookmarklet.gen.js';
import { Collapsible } from '@astryxdesign/core/Collapsible';
import { fmt, Muted } from '../ui.jsx';

const NET_URL = 'https://ongeki-net.com/ongeki-mobile/home/';
// claude.ai のアーティファクト内（iframe）では、別タブとのやり取りやダウンロードができない
const inArtifact = window.self !== window.top;

export function DataView({ S, notify, go }) {
  const [paste, setPaste] = useState('');
  const [confirmDel, setConfirmDel] = useState(false);
  const [over, setOver] = useState(false);
  const fileRef = useRef(null);
  const bmRef = useRef(null);
  const loaderRef = useRef(null);

  const run = (text) => {
    try { notify(store.importAny(text)); go('rating'); }
    catch (e) { notify(e instanceof SyntaxError ? 'JSONとして読めませんでした。ブックマークレットの出力をそのまま使ってください。' : e.message); }
  };
  const readFile = (f) => { const r = new FileReader(); r.onload = () => run(String(r.result)); r.readAsText(f); };
  const copy = async (text, el) => {
    try { await navigator.clipboard.writeText(text); notify('コピーしました'); }
    catch (e) { if (el) { el.focus(); el.select(); } notify('自動でコピーできませんでした。選択された文字をコピーしてください'); }
  };
  const openNet = () => {
    const w = window.open(NET_URL, 'ongekiNet');
    if (!w) notify('新しいタブを開けませんでした。ポップアップの許可を確認してください');
  };

  return (
    <div className="og-stack">
      <Card padding={5}>
        <Heading level={2}>データを取り込む</Heading>
        <ol className="og-steps">
          <li>
            <div className="og-step-title">このページのボタンからオンゲキNETを開く</div>
            <Muted>このページから開いたタブで実行すると、取得したデータがこのページに自動で届きます。ログインしていなければ、開いたタブでログインしてください。</Muted>
            <div className="og-row og-pad-top"><Button label="オンゲキNETを開く" variant="primary" onClick={openNet} /></div>
          </li>
          <li>
            <div className="og-step-title">開いたタブでブックマークレットを実行する</div>
            <Muted>1分半ほどで終わり、このページに戻ると取り込みが済んでいます。</Muted>
          </li>
        </ol>
        {inArtifact && (
          <div className="og-pad-top">
            <Banner status="info" collapsible={false} title="自動の取り込みは、Web版かダウンロードしたビューアで使えます"
              description={`Web版: ${SITE_URL}　このページでは、ブックマークレットが保存したJSONファイルを下から読み込んでください。`} />
          </div>
        )}
      </Card>

      <Card padding={5}>
        <Heading level={3}>ブックマークレットを登録する（最初の1回）</Heading>
        <Muted>短い版は、実行のたびに最新の取得プログラムをWeb版から読み込みます。スマホでも登録しやすく、今後プログラムを直しても入れ替えが要りません。</Muted>
        <div className="og-row og-pad-top">
          <a className="og-bm" href={LOADER} onClick={(e) => { e.preventDefault(); notify('このボタンはブックマークバーへドラッグして使います'); }}>オンゲキデータ取得</a>
          <Button label="短い版のコードをコピー" size="sm" variant="primary" onClick={() => copy(LOADER, loaderRef.current)} />
        </div>
        <textarea ref={loaderRef} className="og-code og-code-short" readOnly value={LOADER} aria-label="短い版のブックマークレット" />
        <div className="og-howto">
          <div><b>PC</b>：上のピンクのボタンをブックマークバーへドラッグ。</div>
          <div><b>iPhone（Safari）</b>：このページをブックマークに追加 → ブックマークを編集して、URL欄をコピーしたコードに置き換え。実行はオンゲキNETを開いた状態でブックマーク一覧から選ぶ。</div>
          <div><b>Android（Chrome）</b>：このページをブックマーク → 編集でURLをコードに置き換え。実行はオンゲキNETを開いた状態でアドレスバーにブックマーク名を入力し、候補に出たブックマークを押す。</div>
        </div>
        <Collapsible trigger={<Text type="label">完全版（Web版を使わずに動く・{fmt(BOOKMARKLET.length)}文字）</Text>} defaultIsOpen={false}>
          <div className="og-row og-pad-top">
            <a className="og-bm og-bm-sub" href={BOOKMARKLET} onClick={(e) => { e.preventDefault(); notify('このボタンはブックマークバーへドラッグして使います'); }}>オンゲキデータ取得（完全版）</a>
            <Button label="完全版のコードをコピー" size="sm" onClick={() => copy(BOOKMARKLET, bmRef.current)} />
          </div>
          <textarea ref={bmRef} className="og-code" readOnly value={BOOKMARKLET} aria-label="完全版のブックマークレット" />
        </Collapsible>
      </Card>

      <Card padding={5}>
        <Heading level={3}>ファイルから読み込む</Heading>
        <Muted>NETを別の方法で開いた場合は、ブックマークレットが ongeki-data-….json を保存します（クリップボードにもコピーされます）。</Muted>
        <div className={`og-drop ${over ? 'is-over' : ''}`}
          onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
          onDrop={(e) => { e.preventDefault(); setOver(false); if (e.dataTransfer.files[0]) readFile(e.dataTransfer.files[0]); }}>
          <Text>JSONファイルをここにドロップ</Text>
          <Button label="ファイルを選ぶ" size="sm" onClick={() => fileRef.current && fileRef.current.click()} />
          <input ref={fileRef} type="file" accept=".json,application/json" hidden onChange={(e) => { if (e.target.files[0]) readFile(e.target.files[0]); e.target.value = ''; }} />
        </div>
        <TextArea label="JSONを貼り付け" description="貼り付けると自動で読み込みます" value={paste}
          onChange={(v) => { setPaste(v); const t = v.trim(); if (t.startsWith('{') && t.endsWith('}')) { run(t); setPaste(''); } }} />
      </Card>

      <Card padding={5}>
        <Heading level={3}>保存データ</Heading>
        <Muted>データはこのブラウザの中だけに保存されます（取り込み {S.ratings.length}回・プレイ {fmt(S.plays.length)}件・自己ベスト更新 {fmt(S.pb.length)}件・手動の定数 {Object.keys(S.overrides).length}件）。別の端末へ移すときや控えに、バックアップを使ってください。</Muted>
        <div className="og-row og-pad-top">
          <Button label="バックアップをコピー" size="sm" onClick={() => copy(store.backupJson(), null)} />
          {!inArtifact && <Button label="バックアップをダウンロード" size="sm" onClick={() => {
            const a = document.createElement('a');
            a.href = URL.createObjectURL(new Blob([store.backupJson()], { type: 'application/json' }));
            a.download = 'ongeki-viewer-backup.json'; document.body.appendChild(a); a.click(); a.remove();
          }} />}
          <Muted>復元は、バックアップのJSONを上で読み込むだけです。</Muted>
        </div>
        <div className="og-row og-pad-top">
          {!confirmDel ? <Button label="保存データをすべて消す" size="sm" variant="destructive" onClick={() => setConfirmDel(true)} /> : (
            <>
              <Text>取り込んだデータ・履歴・手動の定数をすべて消します。元に戻せません。</Text>
              <Button label="消す" size="sm" variant="destructive" onClick={() => { store.clearAll(); setConfirmDel(false); notify('削除しました'); }} />
              <Button label="やめる" size="sm" variant="ghost" onClick={() => setConfirmDel(false)} />
            </>
          )}
        </div>
      </Card>
    </div>
  );
}
