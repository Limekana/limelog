import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { ConfirmProvider } from './components/ConfirmDialog';
import './i18n';
import './index.css';
import './components/ui/ui.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {/* Outside <App> so any screen can call useConfirm(), including the
        first-launch auth gate that renders before the app shell. */}
    <ConfirmProvider>
      <App />
    </ConfirmProvider>
  </React.StrictMode>
);
