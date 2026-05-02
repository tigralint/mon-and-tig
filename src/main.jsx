import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import './design/reset.css';
import './design/tokens.css';
import './design/typography.css';
import './design/animations.css';
import './design/mobile.css';

import { ToastProvider } from './components/ui/ToastProvider.jsx';

createRoot(document.getElementById('app')).render(
  <StrictMode>
    <BrowserRouter>
      <ToastProvider>
        <App />
      </ToastProvider>
    </BrowserRouter>
  </StrictMode>,
);

// Экстренное удаление сломанного Service Worker
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').then((registration) => {
      console.log('SW registration updated to trigger unregister: ', registration);
    }).catch((registrationError) => {
      console.log('SW registration failed: ', registrationError);
    });
    
    // Прямое удаление всех SW
    navigator.serviceWorker.getRegistrations().then(function(registrations) {
      for(let registration of registrations) {
        registration.unregister();
      }
    });
  });
}

