import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { installAuthRefresh } from './utils/authSession';
import './index.css';

installAuthRefresh();

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode><App /></React.StrictMode>
);
