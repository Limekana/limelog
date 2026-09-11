import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { ConfirmProvider } from './components/ConfirmDialog';
import './i18n';
import './index.css';
import './components/ui/ui.css';
// AFTER index.css: Cast Iron is a token override, and with `[data-theme]`
// unset it contributes nothing. That is the theme's regression gate — the
// free theme has to stay byte-identical to what shipped before it existed.
import './themes/cast-iron.css';
import { bootstrapTheme } from './store/themeStore';

// BEFORE render, not in an effect. Resolving the theme after the first paint
// shows lime for a frame and then flips, which is very visible on a cold
// Android start — the app appears to change its mind about what it looks
// like every time you open it.
bootstrapTheme();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {/* Outside <App> so any screen can call useConfirm(), including the
        first-launch auth gate that renders before the app shell. */}
    <ConfirmProvider>
      <App />
    </ConfirmProvider>
  </React.StrictMode>
);
