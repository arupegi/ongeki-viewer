import '@astryxdesign/core/reset.css';
import '@astryxdesign/core/astryx.css';
import '@astryxdesign/theme-neutral/theme.css';
import './styles.css';
import { createRoot } from 'react-dom/client';
import { Theme } from '@astryxdesign/core/theme';
import { neutralTheme } from '@astryxdesign/theme-neutral/built';
import { load } from './store.js';
import { App } from './App.jsx';

load();
createRoot(document.getElementById('root')).render(
  <Theme theme={neutralTheme} mode="system">
    <App />
  </Theme>,
);

// 開発時の動作確認用（本番ビルドには含まれない）
if (import.meta.env.DEV) {
  import('./store.js').then((s) => { window.__ongekiImport = s.importAny; });
}
