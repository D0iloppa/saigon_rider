import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles/globals.css';
import './styles/noto-color-emoji.css';
import './styles/sonner.css';
import './lib/i18n';
import 'flag-icons/css/flag-icons.min.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
