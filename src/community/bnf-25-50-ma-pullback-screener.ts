/**
 * BNF 25/50 MA Pullback Screener
 *
 * A fast and a slow moving average (SMA, or EMA) of the source. Uptrend: fast MA above slow MA (and, optionally, both
 * MAs rising over the slope lookback); downtrend: the reverse. A long signal is an uptrend bar whose close is at least
 * the long threshold (%) below both MAs (or below either one); a short signal is a downtrend bar whose close is at
 * least the short threshold above the MAs. Signals give BUY / SELL labels and a background shade; optional debug
 * characters show the trend and threshold flags.
 * Alerts (alertcondition, `alerts` of the result): 'BNF Long Entry' and 'BNF Short Entry', true on the long / short
 * signal bars.
 *
 * Last bar: with 'Confirm on Bar Close' a signal needs a closed bar. The port reads the state of the last bar from
 * the optional third argument (see src/chart-context.ts); without it every bar is taken as closed.
 *
 * Reference: "BNF 25/50 — Threshold + Debug (Indicator) [v6, price-scale only]" by jackson_g_sheehan
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 */

import { ta, Series, getSourceSeries, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar, type SourceType } from 'oakscriptjs';
import type { BgColorData, MarkerData } from '../types';
import { lastBarConfirmedOf, type ChartContext } from '../chart-context';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'BNF Long Entry', message: 'Uptrend + price below threshold for longs.' },
  { id: 'alert1', title: 'BNF Short Entry', message: 'Downtrend + price above threshold for shorts.' },
];

export interface Bnf2550MaPullbackScreenerInputs {
  src: SourceType;
  lenFast: number;
  lenSlow: number;
  useEMA: boolean;
  /** Require both MA slopes in the trend direction */
  useSlope: boolean;
  slopeLook: number;
  /** Signals on confirmed bars only */
  confirmClose: boolean;
  thLongPct: number;
  thShortPct: number;
  /** Price beyond both MAs (else either one) */
  mustTouchBoth: boolean;
  showLabels: boolean;
  showBG: boolean;
  showDebug: boolean;
}

export const defaultInputs: Bnf2550MaPullbackScreenerInputs = {
  src: 'close',
  lenFast: 25,
  lenSlow: 50,
  useEMA: false,
  useSlope: true,
  slopeLook: 5,
  confirmClose: true,
  thLongPct: 20.0,
  thShortPct: 20.0,
  mustTouchBoth: true,
  showLabels: true,
  showBG: true,
  showDebug: false,
};

export const inputConfig: InputConfig[] = [
  { id: 'src', type: 'source', title: 'Source', defval: 'close' },
  { id: 'lenFast', type: 'int', title: 'Fast MA (25)', defval: 25, min: 1 },
  { id: 'lenSlow', type: 'int', title: 'Slow MA (50)', defval: 50, min: 2 },
  { id: 'useEMA', type: 'bool', title: 'Use EMA Instead of SMA', defval: false },
  { id: 'useSlope', type: 'bool', title: 'Require MA Slopes (trend confirm)', defval: true },
  { id: 'slopeLook', type: 'int', title: 'Slope Lookback (bars)', defval: 5, min: 1 },
  { id: 'confirmClose', type: 'bool', title: 'Confirm on Bar Close (avoid intrabar triggers)', defval: true },
  { id: 'thLongPct', type: 'float', title: 'Long Threshold % (below MAs)', defval: 20.0, min: 0.0, step: 0.1 },
  { id: 'thShortPct', type: 'float', title: 'Short Threshold % (above MAs)', defval: 20.0, min: 0.0, step: 0.1 },
  { id: 'mustTouchBoth', type: 'bool', title: 'Require BOTH MAs (else ANY one)', defval: true },
  { id: 'showLabels', type: 'bool', title: 'Show BUY/SELL labels', defval: true },
  { id: 'showBG', type: 'bool', title: 'Shade BG on signals', defval: true },
  { id: 'showDebug', type: 'bool', title: 'Show Debug Flags (plotchar)', defval: false },
];

const FAST_COL = String(color.new(color.teal, 0));
const SLOW_COL = String(color.new(color.orange, 0));

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'MA 25', color: FAST_COL, lineWidth: 2 },
  { id: 'plot1', title: 'MA 50', color: SLOW_COL, lineWidth: 2 },
];

export const metadata = {
  title: 'BNF 25/50 — Threshold + Debug (Indicator) [v6, price-scale only]',
  shortTitle: 'BNF 25/50 — Threshold + Debug (Indicator) [v6, price-scale only]',
  overlay: true,
};

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const ge = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(b - a > EPS);
const le = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(a - b > EPS);

export function calculate(
  bars: Bar[],
  inputs: Partial<Bnf2550MaPullbackScreenerInputs> = {},
  chart?: ChartContext,
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[]; bgColors: BgColorData[] } & { alerts: AlertConditionState[] } {
  // barstate.isconfirmed: every bar is closed, except the last one when the chart context says that it is still open
  const lastBarOpen = !lastBarConfirmedOf(chart);
  const barIsConfirmed = (index: number) => !(lastBarOpen && index === bars.length - 1);
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const src = getSourceSeries(bars, cfg.src);

  const maFast = A(cfg.useEMA ? ta.ema(src, cfg.lenFast) : ta.sma(src, cfg.lenFast));
  const maSlow = A(cfg.useEMA ? ta.ema(src, cfg.lenSlow) : ta.sma(src, cfg.lenSlow));
  const tL = cfg.thLongPct / 100.0;
  const tS = cfg.thShortPct / 100.0;

  const longBg = String(color.new(color.teal, 90));
  const shortBg = String(color.new(color.red, 90));
  const buyCol = String(color.new(color.teal, 0));
  const sellCol = String(color.new(color.red, 0));
  const bgColors: BgColorData[] = [];
  const markers: MarkerData[] = [];
  const char = (time: number, on: boolean, text: string, position: 'top' | 'bottom', c: string) => {
    if (on) markers.push({ time, position, shape: 'circle', color: 'transparent', text, textColor: c, size: 'tiny' });
  };
  const longFlags: boolean[] = [], shortFlags: boolean[] = [];
  for (let i = 0; i < n; i++) {
    const time = bars[i].time;
    const close = bars[i].close;
    const slopeFast = i >= cfg.slopeLook ? maFast[i] - maFast[i - cfg.slopeLook] : NaN;
    const slopeSlow = i >= cfg.slopeLook ? maSlow[i] - maSlow[i - cfg.slopeLook] : NaN;
    const uptrend = gt(maFast[i], maSlow[i]) && (!cfg.useSlope || (gt(slopeFast, 0) && gt(slopeSlow, 0)));
    const downtrend = lt(maFast[i], maSlow[i]) && (!cfg.useSlope || (lt(slopeFast, 0) && lt(slopeSlow, 0)));
    const below25 = le(close, maFast[i] * (1.0 - tL));
    const below50 = le(close, maSlow[i] * (1.0 - tL));
    const above25 = ge(close, maFast[i] * (1.0 + tS));
    const above50 = ge(close, maSlow[i] * (1.0 + tS));
    const farBelow = cfg.mustTouchBoth ? below25 && below50 : below25 || below50;
    const farAbove = cfg.mustTouchBoth ? above25 && above50 : above25 || above50;
    // sigLong = confirmClose ? rawLong and barstate.isconfirmed : rawLong
    const confirmed = !cfg.confirmClose || barIsConfirmed(i);
    const sigLong = uptrend && farBelow && confirmed;
    const sigShort = downtrend && farAbove && confirmed;
    longFlags.push(sigLong);
    shortFlags.push(sigShort);

    // bgcolor(showBG ? (sigLong ? color.new(color.teal, 90) : sigShort ? color.new(color.red, 90) : na) : na)
    if (cfg.showBG && sigLong) bgColors.push({ time, color: longBg });
    else if (cfg.showBG && sigShort) bgColors.push({ time, color: shortBg });
    // plotshape(showLabels and sigLong, 'Long Signal', shape.labelup, 'BUY', location.belowbar, size.tiny)
    if (cfg.showLabels && sigLong) {
      markers.push({ time, position: 'belowBar', shape: 'labelUp', color: buyCol, text: 'BUY', textColor: color.white, size: 'tiny' });
    }
    // plotshape(showLabels and sigShort, 'Short Signal', shape.labeldown, 'SELL', location.abovebar, size.tiny)
    if (cfg.showLabels && sigShort) {
      markers.push({ time, position: 'aboveBar', shape: 'labelDown', color: sellCol, text: 'SELL', textColor: color.white, size: 'tiny' });
    }
    // Debug flags: plotchar(showDebug and flag, char, location.top / location.bottom, size.tiny)
    char(time, cfg.showDebug && uptrend, 'U', 'top', color.teal);
    char(time, cfg.showDebug && downtrend, 'D', 'top', color.red);
    char(time, cfg.showDebug && below25, 'b', 'bottom', color.teal);
    char(time, cfg.showDebug && below50, 'B', 'bottom', color.teal);
    char(time, cfg.showDebug && above25, 'a', 'bottom', color.red);
    char(time, cfg.showDebug && above50, 'A', 'bottom', color.red);
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {
      plot0: bars.map((b, i) => ({ time: b.time, value: maFast[i], color: FAST_COL })),
      plot1: bars.map((b, i) => ({ time: b.time, value: maSlow[i], color: SLOW_COL })),
    },
    markers,
    bgColors,
    // alertcondition(sigLong, "BNF Long Entry") / alertcondition(sigShort, "BNF Short Entry")
    alerts: alertStates(alertConditions, bars, [longFlags, shortFlags]),
  };
}

export const Bnf2550MaPullbackScreener = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  alertConditions,
};
