import React from 'react';
import TrendingList from './TrendingList';

export default function App(){
  return (
    <div style={{padding: 20, fontFamily: 'Arial'}}>
      <h2>Herd Alerter — Trending Now</h2>
      <TrendingList />
    </div>
  );
}
