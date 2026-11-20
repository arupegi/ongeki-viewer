// ビルド: collector.js → ブックマークレット、app（React + Astryx）→ 1つのHTML
//   node build.js
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { minify } = require('terser');

// Web版（GitHub Pages）の公開先
const SITE_URL = 'https://arupegi.github.io/ongeki-viewer/';

(async () => {
  const dir = __dirname;
  const collector = fs.readFileSync(path.join(dir, 'collector.js'), 'utf8');
  const min = await minify(collector, { compress: true, mangle: true, format: { comments: false } });
  if (min.error) throw min.error;
  const bookmarklet = 'javascript:' + encodeURIComponent(min.code).replace(/%20/g, ' ');
  fs.mkdirSync(path.join(dir, 'dist'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'dist', 'bookmarklet.txt'), bookmarklet);
  // 短い版: 実行のたびに Web版の collector.js を読み込む
  const loader = `javascript:(()=>{const s=document.createElement('script');s.src='${SITE_URL}collector.js?t='+Date.now();s.onerror=()=>alert('取得プログラムを読み込めませんでした');document.body.appendChild(s)})()`;
  fs.writeFileSync(path.join(dir, 'dist', 'bookmarklet-short.txt'), loader);
  fs.writeFileSync(path.join(dir, 'app', 'src', 'bookmarklet.gen.js'),
    `// build.js が生成（手で編集しない）\nexport const SITE_URL = ${JSON.stringify(SITE_URL)};\nexport const LOADER = ${JSON.stringify(loader)};\nexport const BOOKMARKLET = ${JSON.stringify(bookmarklet)};\n`);

  execSync('npx vite build', { cwd: path.join(dir, 'app'), stdio: 'inherit' });
  // ライブラリ内の文字列リテラルにある U+FFFD は、エスケープ表記に置き換えておく（公開時の文字化け検査に引っかかるため）
  const html = fs.readFileSync(path.join(dir, 'app', 'dist', 'index.html'), 'utf8').replace(/�/g, '\\uFFFD');
  // ローカルで直接開く用（完全なHTML文書）
  fs.writeFileSync(path.join(dir, 'index.html'), html);
  // アーティファクト用（外枠は公開時に付くので、head と body の中身だけ）
  const head = html.match(/<head>([\s\S]*?)<\/head>/)[1].replace(/<meta charset[^>]*>\s*/, '').replace(/<meta name="viewport"[^>]*>\s*/, '');
  const body = html.match(/<body>([\s\S]*?)<\/body>/)[1];
  fs.writeFileSync(path.join(dir, 'dist', 'ongeki-viewer.html'), `${head}\n${body}`);
  console.log('bookmarklet', bookmarklet.length, 'chars; viewer', html.length, 'chars');
})().catch((e) => { console.error(e); process.exit(1); });
