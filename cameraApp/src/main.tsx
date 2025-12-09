import React from 'react';
import ReactDOM from 'react-dom/client';
import {App} from './App.tsx';
import SimpleApp from './SimpleApp.tsx';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <SimpleApp />
  </React.StrictMode>,
)
