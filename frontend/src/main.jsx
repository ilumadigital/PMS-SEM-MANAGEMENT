import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './assets/index.css';

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', async () => {
    try {
      const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
      window.__SEM_SW_REGISTRATION__ = registration;

      const signalUpdate = () => {
        if (registration.waiting && navigator.serviceWorker.controller) {
          window.dispatchEvent(new CustomEvent('sem:pwa-update-ready'));
        }
      };

      signalUpdate();
      registration.addEventListener('updatefound', () => {
        const worker = registration.installing;
        if (!worker) return;
        worker.addEventListener('statechange', () => {
          if (worker.state === 'installed' && navigator.serviceWorker.controller) {
            window.dispatchEvent(new CustomEvent('sem:pwa-update-ready'));
          }
        });
      });

      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (window.__SEM_SW_RELOADING__) return;
        window.__SEM_SW_RELOADING__ = true;
        window.location.reload();
      });
    } catch (error) {
      console.warn('[PWA] Service worker registration failed:', error);
    }
  });
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);