/**
 * Chart of the demo page: the chart, its candlestick series and ONE indicator drawn by the published renderer
 * (lightweight-charts-indicators/render, src/render), so the demo tests the code that hosts use.
 */

import {
  createChart,
  CandlestickSeries,
  ColorType,
  type IChartApi,
  type ISeriesApi,
  type CandlestickData,
  type Time,
} from 'lightweight-charts';
import type { Bar, IndicatorResult } from 'oakscriptjs';
import { IndicatorRenderer, type RenderableIndicator } from '../../src/render';
import { toCandlestickData } from './data-loader';

export class ChartManager {
  private chart: IChartApi;
  private candlestickSeries: ISeriesApi<'Candlestick'>;
  private renderer: IndicatorRenderer;

  constructor(container: HTMLElement) {
    // Create chart with dark theme
    this.chart = createChart(container, {
      layout: {
        background: { type: ColorType.Solid, color: '#1e222d' },
        textColor: '#d1d4dc',
      },
      grid: {
        vertLines: { color: '#2b2b43' },
        horzLines: { color: '#2b2b43' },
      },
      crosshair: {
        mode: 1, // Normal mode
      },
      rightPriceScale: {
        borderColor: '#2b2b43',
      },
      timeScale: {
        borderColor: '#2b2b43',
        timeVisible: true,
        secondsVisible: false,
      },
    });

    this.candlestickSeries = this.chart.addSeries(CandlestickSeries, {
      upColor: '#26a69a',
      downColor: '#ef5350',
      borderVisible: false,
      wickUpColor: '#26a69a',
      wickDownColor: '#ef5350',
    });

    // the indicator: its own pane (1) when it is not an overlay; bar slots after the last bar for future drawings
    this.renderer = new IndicatorRenderer(this.chart, {
      paneIndex: 1,
      mainSeries: this.candlestickSeries,
      extendTimeScale: true,
    });

    // Handle resize
    const resizeObserver = new ResizeObserver(() => {
      const { width, height } = container.getBoundingClientRect();
      this.chart.resize(width, height);
    });
    resizeObserver.observe(container);
  }

  /**
   * Set candlestick data. lightweight-charts 5.0.9 / 5.2.1 bug (lightweight-charts issue 2154): a setData with the
   * same times on a series that is alone keeps a stale list of time points, and a later setData after other series
   * were added empties the time scale (blank chart). Clearing first (setData([])) rebuilds the time points on every
   * call (client-side avoidance given in the issue). Remove when the library fix is released.
   */
  setCandlestickData(bars: Bar[]): void {
    const data = toCandlestickData(bars) as CandlestickData<Time>[];
    this.candlestickSeries.setData([]);
    this.candlestickSeries.setData(data);
    this.chart.timeScale().fitContent();
  }

  /**
   * Draw one indicator result (replaces the previous one). `reuseSeries`: the same indicator calculated again (the
   * visible range changed), its series are kept instead of being removed and created again.
   */
  renderIndicator(
    indicator: RenderableIndicator,
    result: IndicatorResult,
    bars: Bar[],
    inputs: Record<string, unknown>,
    reuseSeries = false
  ): void {
    this.renderer.render(indicator, result, bars, { inputs, reuseSeries });
  }

  /** Remove the indicator */
  clearIndicators(): void {
    this.renderer.clear();
  }

  getChart(): IChartApi {
    return this.chart;
  }

  fitContent(): void {
    this.chart.timeScale().fitContent();
  }
}
