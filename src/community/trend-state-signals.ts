/**
 * Trend State Signals
 *
 * A step filter of the source: the range is the RMA of the absolute bar-to-bar change of the source times a
 * multiplier. The filter moves only when the source leaves the band previous filter +/- range (it is then set to
 * source -/+ range). The trend is bullish when the filter rises, bearish when it falls, unchanged otherwise. The filter
 * line (with a glow) takes the trend colour, a gradient ribbon fills from the filter to the candle midpoint, and
 * BULLISH / BEARISH labels mark the trend changes at the filter -/+ range * distance.
 *
 * Last bar: with 'Confirm Signals On Bar Close' a signal needs a closed bar. The port reads the state of the last bar
 * from the optional third argument (see src/chart-context.ts); without it every bar is taken as closed.
 *
 * Alerts (alertcondition, `alerts` of the result): 'Trend State Bullish' and 'Trend State Bearish', true on the bars of
 * the bullish / bearish signals (the label bars, also when the labels are hidden).
 *
 * Reference: "Trend State Signals [Market Structure Lab]" by MarketStructureLab
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © Market Structure Lab
 */

import { ta, Series, getSourceSeries, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar, type SourceType } from 'oakscriptjs';
import type { MarkerData, BarColorData } from '../types';
import { lastBarConfirmedOf, type ChartContext } from '../chart-context';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

export interface TrendStateSignalsInputs {
  source: SourceType;
  /** RMA length of the absolute price change (sensitivity length) */
  length: number;
  /** Range multiplier: higher values give fewer trend changes */
  multiplier: number;
  /** Confirm signals on bar close */
  confirmOnClose: boolean;
  bullColor: string;
  bearColor: string;
  showGlow: boolean;
  showRibbon: boolean;
  showLabels: boolean;
  /** Label distance from the filter, in ranges */
  labelDistance: number;
  paintCandles: boolean;
}

export const defaultInputs: TrendStateSignalsInputs = {
  source: 'close',
  length: 20,
  multiplier: 3.5,
  confirmOnClose: true,
  bullColor: '#00FFAA',
  bearColor: '#FF0000',
  showGlow: true,
  showRibbon: true,
  showLabels: true,
  labelDistance: 1.0,
  paintCandles: false,
};

export const inputConfig: InputConfig[] = [
  { id: 'source', type: 'source', title: 'Source', defval: 'close' },
  { id: 'length', type: 'int', title: 'Sensitivity Length', defval: 20, min: 1 },
  { id: 'multiplier', type: 'float', title: 'Range Multiplier', defval: 3.5, min: 0.1, step: 0.1 },
  { id: 'confirmOnClose', type: 'bool', title: 'Confirm Signals On Bar Close', defval: true },
  { id: 'bullColor', type: 'color', title: 'Bullish Color', defval: '#00FFAA' },
  { id: 'bearColor', type: 'color', title: 'Bearish Color', defval: '#FF0000' },
  { id: 'showGlow', type: 'bool', title: 'Show Line Glow', defval: true },
  { id: 'showRibbon', type: 'bool', title: 'Show Gradient Ribbon', defval: true },
  { id: 'showLabels', type: 'bool', title: 'Show Bullish/Bearish Labels', defval: true },
  { id: 'labelDistance', type: 'float', title: 'Label Vertical Distance', defval: 1.0, min: 0.0, max: 5.0, step: 0.1 },
  { id: 'paintCandles', type: 'bool', title: 'Color Candles', defval: false },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Trend Line Glow', color: String(color.new('#00FFAA', 82)), lineWidth: 7 },
  { id: 'plot1', title: 'Trend State Line', color: '#00FFAA', lineWidth: 3 },
  { id: 'plot2', title: 'Price Midpoint', color: 'transparent', lineWidth: 1, display: 'none' },
];

export const metadata = {
  title: 'Trend State Signals [Market Structure Lab]',
  shortTitle: 'TSS',
  overlay: true,
};

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;

export function calculate(
  bars: Bar[],
  inputs: Partial<TrendStateSignalsInputs> = {},
  chart?: ChartContext,
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[]; barColors: BarColorData[] } & { alerts: AlertConditionState[] } {
  // barstate.isconfirmed: every bar is closed, except the last one when the chart context says that it is still open
  const lastBarOpen = !lastBarConfirmedOf(chart);
  const barIsConfirmed = (index: number) => !(lastBarOpen && index === bars.length - 1);
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const src = A(getSourceSeries(bars, cfg.source));

  // priceMovement = math.abs(ta.change(source)); adaptiveRange = ta.rma(priceMovement, length) * multiplier
  const movement = src.map((v, i) => (i > 0 ? Math.abs(v - src[i - 1]) : NaN));
  const smoothed = A(ta.rma(Series.fromArray(bars, movement), cfg.length));
  const range = smoothed.map((v) => v * cfg.multiplier);

  const filter: number[] = new Array(n).fill(NaN);
  const trend: number[] = new Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    // previousFilter = nz(rangeFilter[1], source)
    const prev = i > 0 && !isNaN(filter[i - 1]) ? filter[i - 1] : src[i];
    if (gt(src[i], prev + range[i])) filter[i] = src[i] - range[i];
    else if (lt(src[i], prev - range[i])) filter[i] = src[i] + range[i];
    else filter[i] = prev;
    const f1 = i > 0 ? filter[i - 1] : NaN;
    if (gt(filter[i], f1)) trend[i] = 1;
    else if (lt(filter[i], f1)) trend[i] = -1;
    else trend[i] = i > 0 ? trend[i - 1] : 0;
  }

  const trendColor = (i: number) => (trend[i] === 1 ? cfg.bullColor : trend[i] === -1 ? cfg.bearColor : color.gray);
  const t = (i: number) => bars[i].time;
  const plot0 = bars.map((_b, i) => ({
    time: t(i), value: cfg.showGlow ? filter[i] : NaN, color: String(color.new(trendColor(i), 82)),
  }));
  const plot1 = bars.map((_b, i) => ({ time: t(i), value: filter[i], color: trendColor(i) }));
  const hl2 = bars.map((b) => (b.high + b.low) / 2);
  const plot2 = bars.map((_b, i) => ({ time: t(i), value: hl2[i] }));

  // fill(filterPlot, pricePlot, hl2, rangeFilter, na, showRibbon ? color.new(trendColor, 20) : na)
  const gradient = {
    topValue: hl2.slice(),
    bottomValue: filter.slice(),
    topColor: hl2.map((): string | null => null),
    bottomColor: hl2.map((_v, i): string | null => (cfg.showRibbon ? String(color.new(trendColor(i), 20)) : null)),
  };

  const markers: MarkerData[] = [];
  const barColors: BarColorData[] = [];
  const bullFlags: boolean[] = [];
  const bearFlags: boolean[] = [];
  for (let i = 0; i < n; i++) {
    const prevTrend = i > 0 ? trend[i - 1] : 0;
    // signalConfirmed = not confirmOnClose or barstate.isconfirmed
    const signalConfirmed = !cfg.confirmOnClose || barIsConfirmed(i);
    const bullishSignal = trend[i] === 1 && prevTrend !== 1 && signalConfirmed;
    const bearishSignal = trend[i] === -1 && prevTrend !== -1 && signalConfirmed;
    bullFlags.push(bullishSignal);
    bearFlags.push(bearishSignal);
    if (cfg.showLabels && bullishSignal) {
      const price = filter[i] - range[i] * cfg.labelDistance;
      if (!isNaN(price)) {
        markers.push({ time: t(i), position: 'atPriceBottom', price, shape: 'labelUp', color: cfg.bullColor,
          text: 'BULLISH', textColor: color.black, size: 'tiny', forceOverlay: true });
      }
    }
    if (cfg.showLabels && bearishSignal) {
      const price = filter[i] + range[i] * cfg.labelDistance;
      if (!isNaN(price)) {
        markers.push({ time: t(i), position: 'atPriceTop', price, shape: 'labelDown', color: cfg.bearColor,
          text: 'BEARISH', textColor: color.white, size: 'tiny', forceOverlay: true });
      }
    }
    // barcolor(paintCandles ? trendColor : na)
    if (cfg.paintCandles) barColors.push({ time: t(i), color: trendColor(i) });
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: { plot0, plot1, plot2 },
    fills: [{ plot1: 'plot1', plot2: 'plot2', options: { title: 'Trend State Ribbon' }, gradient }],
    markers,
    barColors,
    // alertcondition(bullishSignal, "Trend State Bullish") / alertcondition(bearishSignal, "Trend State Bearish")
    alerts: alertStates(alertConditions, bars, [bullFlags, bearFlags]),
  };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'Trend State Bullish', message: 'Trend State Signals: bullish state confirmed on {{exchange}}:{{ticker}} at {{close}}' },
  { id: 'alert1', title: 'Trend State Bearish', message: 'Trend State Signals: bearish state confirmed on {{exchange}}:{{ticker}} at {{close}}' },
];

export const TrendStateSignals = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  alertConditions,
};
