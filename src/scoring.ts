/**
 * SignalHub — Scoring Engine
 * Client-side crypto project scoring.
 * 
 * WHY these weights: Momentum catches trends, ATH discount finds value,
 * volume confirms interest, TVL proves DeFi usage, F&G gives contrarian signal.
 */

export interface CoinData {
  id: string;
  symbol: string;
  name: string;
  current_price: number;
  market_cap: number;
  total_volume: number;
  price_change_percentage_24h: number | null;
  price_change_percentage_7d_in_currency: number | null;
  price_change_percentage_30d_in_currency: number | null;
  ath: number;
  ath_change_percentage: number;
}

export interface TVLData {
  [symbol: string]: { tvl: number; change_7d: number };
}

export interface ScoreResult {
  id: string;
  symbol: string;
  name: string;
  score: number;
  rating: 'STRONG BUY' | 'ALERT' | 'WATCH' | 'CAUTION' | 'HOLD';
  price: number;
  marketCap: number;
  volume: number;
  change24h: number;
  change7d: number;
  change30d: number;
  athDrop: number;
  tvl: number;
  signals: string[];
  breakdown: Record<string, number>;
  // Curated overlay fields (from moltstreet-intelligence)
  sector?: string;
  sectorLabel?: string;
  sectorEmoji?: string;
  thesis?: string;
  isWatchlist?: boolean;
}

const WEIGHTS = {
  momentum24h: 0.10,
  momentum7d: 0.15,
  momentum30d: 0.10,
  athDiscount: 0.15,
  volumeMcap: 0.10,
  tvlLevel: 0.05,
  tvlChange7d: 0.10,
  fearGreed: 0.05,
  mcapUpside: 0.20, // increased without GitHub data
};

function clamp(v: number, lo = 0, hi = 100): number {
  return Math.max(lo, Math.min(hi, v));
}

function scoreMomentum24h(pct: number): number {
  if (pct > 10) return 90;
  if (pct > 5) return 75;
  if (pct > 2) return 60;
  if (pct > 0) return 50;
  if (pct > -2) return 40;
  if (pct > -5) return 25;
  if (pct > -10) return 10;
  return 0;
}

function scoreMomentum7d(pct: number): number {
  if (pct > 30) return 95;
  if (pct > 20) return 85;
  if (pct > 10) return 70;
  if (pct > 5) return 55;
  if (pct > 0) return 45;
  if (pct > -5) return 35;
  if (pct > -10) return 20;
  if (pct > -20) return 10;
  return 0;
}

function scoreMomentum30d(pct: number): number {
  if (pct > 50) return 95;
  if (pct > 30) return 80;
  if (pct > 15) return 65;
  if (pct > 5) return 50;
  if (pct > 0) return 40;
  if (pct > -15) return 25;
  if (pct > -30) return 10;
  return 0;
}

function scoreAthDiscount(pct: number): number {
  const d = Math.abs(pct);
  if (d > 95) return 95;
  if (d > 90) return 85;
  if (d > 75) return 70;
  if (d > 50) return 50;
  if (d > 30) return 30;
  if (d > 15) return 15;
  return 5;
}

function scoreVolumeMcap(volume: number, mcap: number): number {
  if (mcap <= 0 || volume <= 0) return 10;
  const ratio = volume / mcap;
  if (ratio > 0.5) return 95;
  if (ratio > 0.3) return 85;
  if (ratio > 0.15) return 70;
  if (ratio > 0.08) return 50;
  if (ratio > 0.03) return 30;
  return 10;
}

function scoreTvlLevel(tvl: number): number {
  if (tvl > 10e9) return 90;
  if (tvl > 1e9) return 75;
  if (tvl > 500e6) return 60;
  if (tvl > 100e6) return 45;
  if (tvl > 10e6) return 25;
  return 10;
}

function scoreTvlChange7d(pct: number): number {
  if (pct > 50) return 95;
  if (pct > 20) return 80;
  if (pct > 10) return 65;
  if (pct > 0) return 50;
  if (pct > -10) return 30;
  if (pct > -20) return 15;
  return 5;
}

function scoreFearGreed(value: number | null): number {
  if (value === null) return 50;
  return clamp(100 - value, 0, 100);
}

function scoreMcapUpside(mcap: number): number {
  const m = mcap / 1e6;
  if (m < 50) return 95;
  if (m < 100) return 85;
  if (m < 250) return 70;
  if (m < 500) return 55;
  if (m < 1000) return 40;
  if (m < 5000) return 25;
  return 10;
}

function getRating(score: number): ScoreResult['rating'] {
  if (score >= 78) return 'STRONG BUY';
  if (score >= 65) return 'ALERT';
  if (score >= 50) return 'WATCH';
  if (score >= 35) return 'CAUTION';
  return 'HOLD';
}

export function scoreCoin(
  coin: CoinData,
  tvlData: TVLData,
  fgValue: number | null
): ScoreResult {
  const p24 = coin.price_change_percentage_24h ?? 0;
  const p7 = coin.price_change_percentage_7d_in_currency ?? 0;
  const p30 = coin.price_change_percentage_30d_in_currency ?? 0;
  const ath = coin.ath_change_percentage ?? 0;
  const vol = coin.total_volume ?? 0;
  const mcap = coin.market_cap ?? 0;
  const sym = coin.symbol.toUpperCase();
  const tvlInfo = tvlData[sym] || null;
  const tvl = tvlInfo?.tvl ?? 0;
  const tvl7d = tvlInfo?.change_7d ?? 0;

  const scores: Record<string, number> = {
    momentum24h: scoreMomentum24h(p24),
    momentum7d: scoreMomentum7d(p7),
    momentum30d: scoreMomentum30d(p30),
    athDiscount: scoreAthDiscount(ath),
    volumeMcap: scoreVolumeMcap(vol, mcap),
    tvlLevel: scoreTvlLevel(tvl),
    tvlChange7d: scoreTvlChange7d(tvl7d),
    fearGreed: scoreFearGreed(fgValue),
    mcapUpside: scoreMcapUpside(mcap),
  };

  const composite = Object.entries(WEIGHTS).reduce(
    (sum, [k, w]) => sum + (scores[k] || 0) * w,
    0
  );

  // Build signals
  const signals: string[] = [];
  if (p24 > 5) signals.push(`24h +${p24.toFixed(0)}%`);
  if (p7 > 10) signals.push(`7d +${p7.toFixed(0)}%`);
  if (p30 > 20) signals.push(`30d +${p30.toFixed(0)}%`);
  if (ath < -75) signals.push(`${Math.abs(ath).toFixed(0)}% from ATH`);
  if (mcap > 0 && vol / mcap > 0.15) signals.push(`Vol/MC ${(vol / mcap).toFixed(2)}`);
  if (tvl > 1e9) signals.push(`TVL $${(tvl / 1e9).toFixed(1)}B`);
  else if (tvl > 100e6) signals.push(`TVL $${(tvl / 1e6).toFixed(0)}M`);
  if (tvl7d > 15) signals.push(`TVL +${tvl7d.toFixed(0)}%/7d`);

  const breakdown: Record<string, number> = {};
  for (const [k, v] of Object.entries(scores)) {
    breakdown[k] = Math.round(v * 10) / 10;
  }

  const finalScore = Math.round(clamp(composite) * 10) / 10;

  return {
    id: coin.id,
    symbol: sym,
    name: coin.name,
    score: finalScore,
    rating: getRating(finalScore),
    price: coin.current_price,
    marketCap: mcap,
    volume: vol,
    change24h: p24,
    change7d: p7,
    change30d: p30,
    athDrop: ath,
    tvl,
    signals,
    breakdown,
  };
}
