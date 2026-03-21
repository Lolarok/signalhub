/**
 * SignalHub — API Layer
 * All data fetching from free APIs. No keys needed.
 * 
 * WHY CoinGecko + DeFiLlama: Both are free, reliable, and cover
 * prices + DeFi data. The rate limits are generous enough for a client-side app.
 */

import { CoinData, TVLData } from './scoring';

const COINGECKO = 'https://api.coingecko.com/api/v3';
const DEFILLAMA = 'https://api.llama.fi';

// ── Curated data (from moltstreet-intelligence) ───────────────────────

export interface WatchlistEntry {
  id: string;
  symbol: string;
  sector: string;
  thesis: string;
}

export interface SectorInfo {
  label: string;
  emoji: string;
}

export interface CuratedData {
  generated_at: string;
  watchlist: WatchlistEntry[];
  sectors: Record<string, SectorInfo>;
}

/**
 * Load curated watchlist + sectors from moltstreet-intelligence output.
 * This file is the bridge between the Python scanner and the React dashboard.
 */
export async function fetchCurated(): Promise<CuratedData> {
  const res = await fetch('/curated.json');
  if (!res.ok) throw new Error('Failed to load curated data');
  return res.json();
}

// ── Live data fetching ────────────────────────────────────────────────

async function fetchJson(url: string): Promise<any> {
  const res = await fetch(url, {
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) {
    if (res.status === 429) {
      throw new Error('Rate limited — wait a minute and try again');
    }
    throw new Error(`API error: ${res.status}`);
  }
  return res.json();
}

/**
 * Fetch top coins from CoinGecko.
 * Free tier: ~10-30 calls/min. We batch to stay under.
 */
export async function fetchTopCoins(page = 1, perPage = 100): Promise<CoinData[]> {
  const url = `${COINGECKO}/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=${perPage}&page=${page}&sparkline=false&price_change_percentage=7d,30d`;
  return fetchJson(url);
}

/**
 * Fetch TVL data from DeFiLlama.
 * Maps by symbol for quick lookup.
 */
export async function fetchTVLData(): Promise<TVLData> {
  const data = await fetchJson(`${DEFILLAMA}/protocols`);
  const out: TVLData = {};
  for (const p of data) {
    const sym = (p.symbol || '').toUpperCase();
    if (sym) {
      out[sym] = {
        tvl: p.tvl || 0,
        change_7d: p.change_7d || 0,
      };
    }
  }
  return out;
}

/**
 * Fetch Fear & Greed index from Alternative.me.
 * Returns [current_value, 7d_trend].
 */
export async function fetchFearGreed(): Promise<{ value: number; label: string; trend: number }> {
  const data = await fetchJson('https://api.alternative.me/fng/?limit=7');
  const values = data.data.map((d: any) => parseInt(d.value));
  const current = values[0];
  const trend = values.length > 1 ? current - values[values.length - 1] : 0;

  let label = 'Unknown';
  if (current < 25) label = 'Extreme Fear';
  else if (current < 45) label = 'Fear';
  else if (current < 56) label = 'Neutral';
  else if (current < 75) label = 'Greed';
  else label = 'Extreme Greed';

  return { value: current, label, trend };
}
