/**
 * CoinChart — Interactive candlestick chart with volume (lightweight-charts v5)
 * Uses TradingView lightweight-charts for professional-grade financial viz
 *
 * Data source: CoinGecko /coins/{id}/ohlc?vs_currency=usd&days=30
 */

import { useEffect, useRef } from 'react';
import {
  createChart,
  IChartApi,
  ISeriesApi,
  Time,
  CandlestickData,
  HistogramData,
  CandlestickSeries,
  HistogramSeries,
} from 'lightweight-charts';

interface CoinChartProps {
  coinId: string;
  coinName: string;
  days?: 1 | 7 | 30 | 90 | 365;
}

export default function CoinChart({ coinId, coinName, days = 30 }: CoinChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candlestickSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null);

  useEffect(() => {
    if (!chartContainerRef.current) return;

    // Create chart
    const chart = createChart(chartContainerRef.current, {
      width: chartContainerRef.current.clientWidth,
      height: 400,
      layout: {
        background: { color: 'transparent' },
        textColor: '#d1d4dc',
      },
      grid: {
        vertLines: { color: 'rgba(42, 46, 57, 0.5)' },
        horzLines: { color: 'rgba(42, 46, 57, 0.5)' },
      },
      crosshair: {
        mode: 1,
      },
      rightPriceScale: {
        borderColor: 'rgba(197, 203, 206, 0.3)',
      },
      timeScale: {
        borderColor: 'rgba(197, 203, 206, 0.3)',
        timeVisible: true,
        secondsVisible: false,
      },
    });

    chartRef.current = chart;

    // Candlestick series on main price scale
    const candlestickSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#26a69a',
      downColor: '#ef5350',
      borderVisible: false,
      wickUpColor: '#26a69a',
      wickDownColor: '#ef5350',
    });
    candlestickSeriesRef.current = candlestickSeries;

    // Volume histogram on its own price scale (bottom pane)
    const volumeSeries = chart.addSeries(HistogramSeries, {
      color: '#26a69a',
      priceFormat: { type: 'volume' },
      priceScaleId: 'volume',
    });
    volumeSeriesRef.current = volumeSeries;

    // Configure the 'volume' price scale: position at bottom 20%
    const volumeScale = chart.priceScale('volume');
    volumeScale.applyOptions({
      scaleMargins: { top: 0.8, bottom: 0 },
      borderColor: 'rgba(197, 203, 206, 0.3)',
    });

    // Responsive resize
    const handleResize = () => {
      if (chartContainerRef.current) {
        chart.applyOptions({
          width: chartContainerRef.current.clientWidth,
          height: 400,
        });
      }
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      chart.remove();
    };
  }, []);

  // Load data when coin or days changes
  useEffect(() => {
    const fetchOHLCV = async () => {
      if (!candlestickSeriesRef.current || !volumeSeriesRef.current) return;

      try {
        const url = `https://api.coingecko.com/api/v3/coins/${coinId}/ohlc?vs_currency=usd&days=${days}`;
        const res = await fetch(url);
        if (!res.ok) throw new Error('Failed to fetch OHLCV');
        const data: [number, number, number, number, number, number][] = await res.json();

        // Transform data
        const candleData: CandlestickData<Time>[] = data.map(([ts, open, high, low, close, volume]) => ({
          time: (ts / 1000) as Time,
          open,
          high,
          low,
          close,
        }));

        const volumeData: HistogramData<Time>[] = data.map(([ts, , , , , volume]) => ({
          time: (ts / 1000) as Time,
          value: volume,
          color: volume > 0 ? 'rgba(38, 166, 154, 0.5)' : 'rgba(239, 83, 80, 0.5)',
        }));

        candlestickSeriesRef.current.setData(candleData);
        volumeSeriesRef.current.setData(volumeData);

        chartRef.current?.timeScale().fitContent();
      } catch (err) {
        console.error('Failed to load chart data:', err);
      }
    };

    fetchOHLCV();
  }, [coinId, days]);

  return (
    <div className="coin-chart">
      <div className="chart-header">
        <h3>{coinName} Price Chart</h3>
        <span className="chart-subtitle">Last {days} days • CoinGecko data</span>
      </div>
      <div ref={chartContainerRef} className="chart-container" />
    </div>
  );
}
