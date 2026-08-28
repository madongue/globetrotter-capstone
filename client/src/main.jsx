import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import 'leaflet/dist/leaflet.css';
import './styles.css';
// Loaded after styles.css so its overrides win. Removing this line returns the
// app to its original light appearance without touching anything else.
import './theme-dark.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // The app should remain fully usable if the browser blocks service workers.
    });
  });
}
