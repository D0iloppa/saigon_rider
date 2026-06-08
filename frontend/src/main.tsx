import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { native } from './lib/native';
import './styles/globals.css';
import './styles/noto-color-emoji.css';
import './styles/sonner.css';
import './lib/i18n';
import 'flag-icons/css/flag-icons.min.css';

// Android 전용(F-03): 소프트 키보드가 레이아웃 뷰포트(100dvh)를 압축하지 않고 오버레이하도록
// viewport 에 interactive-widget=resizes-visual 을 런타임 추가. iOS 는 기본 동작이 정상이므로
// 절대 건드리지 않는다(공용 index.html 의 정적 meta 는 불변).
if (native.platform === 'android') {
  const vp = document.querySelector('meta[name="viewport"]');
  const content = vp?.getAttribute('content') ?? '';
  if (vp && !content.includes('interactive-widget')) {
    vp.setAttribute('content', `${content}, interactive-widget=resizes-visual`);
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
