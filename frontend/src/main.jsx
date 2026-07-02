import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './assets/index.css'; // Αν σου χτυπάει σφάλμα εδώ, σβήσε αυτή τη γραμμή προσωρινά

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);