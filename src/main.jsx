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

