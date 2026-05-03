import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';
import './design/reset.css';
import './design/tokens.css';
import './design/typography.css';
import './design/animations.css';
import './design/mobile.css';

import { ToastProvider } from './components/ui/ToastProvider.jsx';

// ─── Storage Persistence ───
// Запрашиваем у браузера persistent storage, чтобы IndexedDB не была очищена.
const requestPersistentStorage = async () => {
  if (!navigator.storage?.persist) return;
  
  const isPersisted = await navigator.storage.persisted();
  if (isPersisted) {
    console.log('✅ Storage: persistent (data is safe)');
    return;
  }

  const granted = await navigator.storage.persist();
  if (granted) {
    console.log('✅ Storage: persistence granted');
  } else {
    console.warn('⚠️ Storage: persistence denied — data may be evicted by browser');
  }
};

// ─── Theme Initialization ───
// Применяем тему ДО рендера React, чтобы избежать flash of wrong theme
const initTheme = () => {
  const saved = localStorage.getItem('lumea-theme');
  if (saved) {
    document.documentElement.setAttribute('data-theme', saved);
    return;
  }
  // Auto-detect system preference
  if (window.matchMedia?.('(prefers-color-scheme: light)').matches) {
    document.documentElement.setAttribute('data-theme', 'light');
  } else {
    document.documentElement.setAttribute('data-theme', 'dark');
  }
};

// ─── Backup Reminder ───
const checkBackupReminder = () => {
  const lastBackup = localStorage.getItem('lumea-last-backup');
  const now = Date.now();
  const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;

  if (!lastBackup || (now - parseInt(lastBackup)) > SEVEN_DAYS) {
    // Будет показано через ToastProvider после mount
    window.__lumeaShowBackupReminder = true;
  }
};

initTheme();
requestPersistentStorage();
checkBackupReminder();

createRoot(document.getElementById('app')).render(
  <StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        <ToastProvider>
          <App />
        </ToastProvider>
      </BrowserRouter>
    </ErrorBoundary>
  </StrictMode>,
);
