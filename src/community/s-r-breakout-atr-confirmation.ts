/**
 * S&R Breakout ATR Confirmation
 *
 * Resistance and support are the highest high and the lowest low of the previous `lookback` bars. A bullish breakout
 * is a close above the resistance with a candle body (close - open) larger than ATR * multiplier and, with the volume
 * filter, a volume above its SMA; a bearish breakout is the mirror below the support. Breakouts get a BUY / SELL
 * label and a green / red background.
 * Alerts (alertcondition, `alerts` of the result): 'Bullish Breakout' and 'Bearish Breakout', true on the breakouts.
 *
 * Reference: "S&R Breakout ATR Confirmation" by Jos-ProTrader
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © Jos-ProTrader
 */

import { ta, Series, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { MarkerData, BgColorData } from '../types';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

export interface SRBreakoutAtrConfirmationInputs {
  /** Support / resistance length */
  lookback: number;
  /** ATR length */
  atrLength: number;
  /** ATR strength multiplier */
  atrMultiplier: number;
  /** Require a volume above its SMA */
  useVolume: boolean;
  /** SMA length of the volume */
  volumeLength: number;
}

export const defaultInputs: SRBreakoutAtrConfirmationInputs = {
  lookback: 20,
  atrLength: 14,
  atrMultiplier: 1.0,
  useVolume: true,
  volumeLength: 20,
};

export const inputConfig: InputConfig[] = [
  { id: 'lookback', type: 'int', title: 'Support/Resistance Length', defval: 20, min: 5 },
  { id: 'atrLength', type: 'int', title: 'ATR Length', defval: 14 },
  { id: 'atrMultiplier', type: 'float', title: 'ATR Strength Multiplier', defval: 1.0, step: 0.1 },
  { id: 'useVolume', type: 'bool', title: 'Use Volume Filter', defval: true },
  { id: 'volumeLength', type: 'int', title: 'Volume MA Length', defval: 20 },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Resistance', color: color.red, lineWidth: 2 },
  { id: 'plot1', title: 'Support', color: color.green, lineWidth: 2 },
];

export const metadata = {
  title: 'S&R Breakout ATR Confirmation',
  shortTitle: 'S&R Breakout ATR Confirmation',
  overlay: true,
};

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;

export function calculate(
  bars: Bar[],
  inputs: Partial<SRBreakoutAtrConfirmationInputs> = {},
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[]; bgColors: BgColorData[] } & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const S = (a: number[]) => Series.fromArray(bars, a);

  const hh = A(ta.highest(S(bars.map((b) => b.high)), cfg.lookback));
  const ll = A(ta.lowest(S(bars.map((b) => b.low)), cfg.lookback));
  // resistance = ta.highest(high, lookback)[1]; support = ta.lowest(low, lookback)[1]
  const resistance = hh.map((_v, i) => (i > 0 ? hh[i - 1] : NaN));
  const support = ll.map((_v, i) => (i > 0 ? ll[i - 1] : NaN));
  const atr = A(ta.atr(bars, cfg.atrLength));
  const volume = bars.map((b) => (b.volume === undefined || b.volume === null ? NaN : b.volume));
  const volMA = A(ta.sma(S(volume), cfg.volumeLength));

  const t = (i: number) => bars[i].time;
  const plot0 = bars.map((_b, i) => ({ time: t(i), value: resistance[i], color: color.red }));
  const plot1 = bars.map((_b, i) => ({ time: t(i), value: support[i], color: color.green }));

  const markers: MarkerData[] = [];
  const bgColors: BgColorData[] = [];
  const bullBg = String(color.new(color.green, 90));
  const bearBg = String(color.new(color.red, 90));
  const bullFlags: boolean[] = [], bearFlags: boolean[] = [];
  for (let i = 0; i < n; i++) {
    const { open, close } = bars[i];
    const bullStrength = gt(close - open, atr[i] * cfg.atrMultiplier);
    const bearStrength = gt(open - close, atr[i] * cfg.atrMultiplier);
    const volumeConfirm = gt(volume[i], volMA[i]);
    const bullBreakout = gt(close, resistance[i]) && bullStrength && (!cfg.useVolume || volumeConfirm);
    const bearBreakout = lt(close, support[i]) && bearStrength && (!cfg.useVolume || volumeConfirm);
    bullFlags.push(bullBreakout);
    bearFlags.push(bearBreakout);
    // plotshape(..., style = shape.labelup / labeldown, text = 'BUY' / 'SELL'): Pine default size (auto) and
    // default text colour (#2962FF)
    if (bullBreakout) {
      markers.push({ time: t(i), position: 'belowBar', shape: 'labelUp', color: color.lime, text: 'BUY',
        textColor: '#2962FF', size: 'auto' });
    }
    if (bearBreakout) {
      markers.push({ time: t(i), position: 'aboveBar', shape: 'labelDown', color: color.red, text: 'SELL',
        textColor: '#2962FF', size: 'auto' });
    }
    // bgcolor(bullBreakout ? color.new(color.green, 90) : na); bgcolor(bearBreakout ? color.new(color.red, 90) : na)
    if (bullBreakout) bgColors.push({ time: t(i), color: bullBg });
    if (bearBreakout) bgColors.push({ time: t(i), color: bearBg });
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: { plot0, plot1 },
    markers,
    bgColors,
    // alertcondition(bullBreakout, 'Bullish Breakout') / alertcondition(bearBreakout, 'Bearish Breakout')
    alerts: alertStates(alertConditions, bars, [bullFlags, bearFlags]),
  };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'Bullish Breakout', message: 'Breakout Confirmation Pro BUY Signal' },
  { id: 'alert1', title: 'Bearish Breakout', message: 'Breakout Confirmation Pro SELL Signal' },
];

export const SRBreakoutAtrConfirmation = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  alertConditions,
};
