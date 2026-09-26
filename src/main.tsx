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
import { ErrorBoundary } from './components/ErrorBoundary';
import { installGlobalErrorHandlers } from './lib/errorReports';
import { notePolicyBaseline } from './lib/policyNotice';

// BEFORE render, not in an effect. Resolving the theme after the first paint
// shows lime for a frame and then flips, which is very visible on a cold
// Android start — the app appears to change its mind about what it looks
// like every time you open it.
bootstrapTheme();

// v1.16 (limecore#16) — errors outside render (handlers, timers, promises),
// reported only while the Settings switch is on; see lib/errorReports.ts.
installGlobalErrorHandlers();
// Before onboarding can run: a fresh install starts on the current policy.
notePolicyBaseline();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {/* Outermost, so a throw anywhere below lands on the recovery screen
        instead of a blank page (limecore#16). */}
    <ErrorBoundary>
      {/* Outside <App> so any screen can call useConfirm(), including the
          first-launch auth gate that renders before the app shell. */}
      <ConfirmProvider>
        <App />
      </ConfirmProvider>
    </ErrorBoundary>
  </React.StrictMode>
);
