/**
 * Alpha Trading Signal (Up side Down)
 *
 * A SuperTrend: up = src - multiplier * ATR, kept from falling while the previous close is above the previous up
 * line; dn = src + multiplier * ATR, kept from rising while the previous close is below the previous dn line. The
 * ATR is ta.atr (RMA of the true range) or an SMA of the true range. The trend turns up when the close goes above
 * the previous dn line and turns down when it goes below the previous up line. The up line is drawn in an up trend,
 * the dn line in a down trend, with circles and Buy / Sell labels where the trend turns. A fill between OHLC4 and
 * the trend line is green in an up trend, red in a down trend (white when the highlighter is off).
 * Alerts (alertcondition, `alerts` of the result): 'SuperTrend Buy' and 'SuperTrend Sell' on the bars where the trend
 * turns up / down, 'SuperTrend Direction Change' on both.
 *
 * Reference: "Alpha Trading Signal _ Up side Down" by giaodichdsmart
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 */

import { ta, getSourceSeries, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar, type SourceType } from 'oakscriptjs';
import type { MarkerData } from '../types';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

export interface AlphaTradingSignalUpSideDownInputs {
  /** ATR period */
  periods: number;
  /** Source of the up / dn lines */
  src: SourceType;
  /** ATR multiplier */
  multiplier: number;
  /** true: ta.atr (RMA of the true range); false: SMA of the true range */
  changeATR: boolean;
  /** Show the Buy / Sell labels */
  showSignals: boolean;
  /** Trend colours in the fills (white when off) */
  highlighting: boolean;
}

export const defaultInputs: AlphaTradingSignalUpSideDownInputs = {
  periods: 10,
  src: 'hl2',
  multiplier: 3.0,
  changeATR: true,
  showSignals: true,
  highlighting: true,
};

export const inputConfig: InputConfig[] = [
  { id: 'periods', type: 'int', title: 'ATR Period', defval: 10 },
  { id: 'src', type: 'source', title: 'Source', defval: 'hl2' },
  { id: 'multiplier', type: 'float', title: 'ATR Multiplier', defval: 3.0, step: 0.1 },
  { id: 'changeATR', type: 'bool', title: 'Change ATR Calculation Method ?', defval: true },
  { id: 'showSignals', type: 'bool', title: 'Show Buy/Sell Signals ?', defval: true },
  { id: 'highlighting', type: 'bool', title: 'Highlighter On/Off ?', defval: true },
];

const GREEN = String(color.new(color.green, 0));
const RED = String(color.new(color.red, 0));
const WHITE = String(color.new(color.white, 0));
/** Pine default plot colour (the OHLC4 plot has no colour) */
const PINE_BLUE = '#2962FF';

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Up Trend', color: GREEN, lineWidth: 2, style: 'linebr' },
  { id: 'plot1', title: 'Down Trend', color: RED, lineWidth: 2, style: 'linebr' },
  { id: 'plot2', title: 'OHLC4', color: PINE_BLUE, lineWidth: 1, style: 'circles' },
];

export const metadata = {
  title: 'buy sell',
  shortTitle: 'buy sell',
  overlay: true,
  format: 'price',
  precision: 2,
};

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;

export function calculate(
  bars: Bar[],
  inputs: Partial<AlphaTradingSignalUpSideDownInputs> = {},
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[] } & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const A = (s: { toArray(): (number | null | undefined)[] }) => s.toArray().map((v) => v ?? NaN);
  const src = A(getSourceSeries(bars, cfg.src));
  // atr2 = ta.sma(ta.tr, Periods); atr = changeATR ? ta.atr(Periods) : atr2
  const atr = cfg.changeATR ? A(ta.atr(bars, cfg.periods)) : A(ta.sma(ta.tr(bars), cfg.periods));

  const up: number[] = new Array(n).fill(NaN);
  const dn: number[] = new Array(n).fill(NaN);
  const trendArr: number[] = new Array(n).fill(1);
  let trend = 1;
  for (let i = 0; i < n; i++) {
    const c1 = i > 0 ? bars[i - 1].close : NaN;
    let u = src[i] - cfg.multiplier * atr[i];
    const up1 = i > 0 && !isNaN(up[i - 1]) ? up[i - 1] : u; // nz(up[1], up)
    u = gt(c1, up1) ? Math.max(u, up1) : u;
    let d = src[i] + cfg.multiplier * atr[i];
    const dn1 = i > 0 && !isNaN(dn[i - 1]) ? dn[i - 1] : d; // nz(dn[1], dn)
    d = lt(c1, dn1) ? Math.min(d, dn1) : d;
    up[i] = u;
    dn[i] = d;
    // trend := nz(trend[1], trend); trend := trend == -1 and close > dn1 ? 1 : trend == 1 and close < up1 ? -1 : trend
    const close = bars[i].close;
    trend = trend === -1 && gt(close, dn1) ? 1 : trend === 1 && lt(close, up1) ? -1 : trend;
    trendArr[i] = trend;
  }

  const t = (i: number) => bars[i].time;
  const markers: MarkerData[] = [];
  const buyFlags: boolean[] = [], sellFlags: boolean[] = [], changeFlags: boolean[] = [];
  for (let i = 0; i < n; i++) {
    const prev = i > 0 ? trendArr[i - 1] : NaN;
    const buySignal = trendArr[i] === 1 && prev === -1;
    const sellSignal = trendArr[i] === -1 && prev === 1;
    buyFlags.push(buySignal);
    sellFlags.push(sellSignal);
    // changeCond = trend != trend[1] (na on the first bar: false)
    changeFlags.push(i > 0 && trendArr[i] !== prev);
    if (buySignal && !isNaN(up[i])) {
      // plotshape(buySignal ? up : na, 'UpTrend Begins', location.absolute, shape.circle, size.tiny)
      markers.push({ time: t(i), position: 'atPriceMiddle', price: up[i], shape: 'circle', color: GREEN, size: 'tiny', id: 'shape0' });
      // plotshape(buySignal and showsignals ? up : na, 'Buy', text 'Buy', location.absolute, shape.labelup, size.tiny)
      if (cfg.showSignals) {
        markers.push({ time: t(i), position: 'atPriceBottom', price: up[i], shape: 'labelUp', color: GREEN,
          size: 'tiny', text: 'Buy', textColor: WHITE, id: 'shape1' });
      }
    }
    if (sellSignal && !isNaN(dn[i])) {
      markers.push({ time: t(i), position: 'atPriceMiddle', price: dn[i], shape: 'circle', color: RED, size: 'tiny', id: 'shape2' });
      if (cfg.showSignals) {
        markers.push({ time: t(i), position: 'atPriceTop', price: dn[i], shape: 'labelDown', color: RED,
          size: 'tiny', text: 'Sell', textColor: WHITE, id: 'shape3' });
      }
    }
  }

  const idx = bars.map((_b, i) => i);
  return {
    metadata: {
      title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay,
      format: metadata.format, precision: metadata.precision,
    },
    plots: {
      plot0: idx.map((i) => ({ time: t(i), value: trendArr[i] === 1 ? up[i] : NaN, color: GREEN })),
      plot1: idx.map((i) => ({ time: t(i), value: trendArr[i] === 1 ? NaN : dn[i], color: RED })),
      plot2: idx.map((i) => {
        const b = bars[i];
        return { time: t(i), value: (b.open + b.high + b.low + b.close) / 4, color: PINE_BLUE };
      }),
    },
    fills: [
      // fill(mPlot, upPlot, color = highlighting ? trend == 1 ? color.green : color.white : color.white)
      {
        plot1: 'plot2', plot2: 'plot0', options: { title: 'UpTrend Highligter' },
        colors: idx.map((i) => (cfg.highlighting && trendArr[i] === 1 ? GREEN : WHITE)),
      },
      // fill(mPlot, dnPlot, color = highlighting ? trend == -1 ? color.red : color.white : color.white)
      {
        plot1: 'plot2', plot2: 'plot1', options: { title: 'DownTrend Highligter' },
        colors: idx.map((i) => (cfg.highlighting && trendArr[i] === -1 ? RED : WHITE)),
      },
    ],
    markers,
    // alertcondition(buySignal) / alertcondition(sellSignal) / alertcondition(changeCond)
    alerts: alertStates(alertConditions, bars, [buyFlags, sellFlags, changeFlags]),
  };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'SuperTrend Buy', message: 'SuperTrend Buy!' },
  { id: 'alert1', title: 'SuperTrend Sell', message: 'SuperTrend Sell!' },
  { id: 'alert2', title: 'SuperTrend Direction Change', message: 'SuperTrend has changed direction!' },
];

export const AlphaTradingSignalUpSideDown = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  alertConditions,
};
