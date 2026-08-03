import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import './styles/globals.css';
import './styles/noto-color-emoji.css';
import './styles/sonner.css';
import './lib/i18n';
// P2-1: flag-icons 전체 스프라이트(200개국) 대신 실제 쓰는 3개(vn/us/kr)만 추출한 파일 —
// 근거·갱신 방법은 styles/flags.css 참조.
import './styles/flags.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);
