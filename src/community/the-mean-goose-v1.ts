/**
 * The Mean Goose v1
 *
 * Two Keltner channels: a wide one (EMA 200 of the source +- 9.5 * ATR 200) and a tight one (SMA 20 +- 3.5 * ATR 40),
 * with a 9 EMA. A breakout dot prints when the bar high is above both upper bands (or the low below both lower
 * bands); with the HOD / LOD filter the high (low) must also be a new high (low) of the session that resets at a
 * clock time in the chosen time zone. A dot arms a trigger; the trigger fires a signal label when the close crosses
 * back over the EMA (high setup: close below the EMA, low setup: close above it), then disarms.
 *
 * Last bar: a label fires on a closed bar only. The port reads the state of the last bar from the optional third
 * argument (see src/chart-context.ts); without it every bar is taken as closed.
 *
 * Reference: "The Mean Goose v1" by FattyGuinness
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 */

import { ta, time, color, getSourceSeries, type IndicatorResult, type InputConfig, type PlotConfig, type Bar, type SourceType } from 'oakscriptjs';
import type { MarkerData } from '../types';
import { barInterval, barTime } from '../bar-time';
import { lastBarConfirmedOf, type ChartContext } from '../chart-context';

export interface TheMeanGooseV1Inputs {
  kc1Len: number;
  kc1Mult: number;
  kc1Src: SourceType;
  kc1UseEMA: boolean;
  kc1AtrLen: number;
  kc2Len: number;
  kc2Mult: number;
  kc2Src: SourceType;
  kc2UseEMA: boolean;
  kc2AtrLen: number;
  emaLen: number;
  emaSrc: SourceType;
  /** Plot offset of the EMA line (bars) */
  emaOff: number;
  /** Breakout dots need a new high / low of the session */
  useHODFilter: boolean;
  /** Session reset hour (0-23) in `tz` */
  resetHour: number;
  /** Session reset minute in `tz` */
  resetMin: number;
  /** Time zone of the reset time: IANA name or UTC / GMT offset */
  tz: string;
}

export const defaultInputs: TheMeanGooseV1Inputs = {
  kc1Len: 200,
  kc1Mult: 9.5,
  kc1Src: 'close',
  kc1UseEMA: true,
  kc1AtrLen: 200,
  kc2Len: 20,
  kc2Mult: 3.5,
  kc2Src: 'close',
  kc2UseEMA: false,
  kc2AtrLen: 40,
  emaLen: 9,
  emaSrc: 'close',
  emaOff: 0,
  useHODFilter: false,
  resetHour: 18,
  resetMin: 0,
  tz: 'America/New_York',
};

export const inputConfig: InputConfig[] = [
  { id: 'kc1Len', type: 'int', title: 'KC1 Length', defval: 200, group: 'Keltner Channel 1' },
  { id: 'kc1Mult', type: 'float', title: 'KC1 Multiplier', defval: 9.5, group: 'Keltner Channel 1' },
  { id: 'kc1Src', type: 'source', title: 'KC1 Source', defval: 'close', group: 'Keltner Channel 1' },
  { id: 'kc1UseEMA', type: 'bool', title: 'KC1 Use Exponential MA', defval: true, group: 'Keltner Channel 1' },
  { id: 'kc1AtrLen', type: 'int', title: 'KC1 ATR Length', defval: 200, group: 'Keltner Channel 1' },
  { id: 'kc2Len', type: 'int', title: 'KC2 Length', defval: 20, group: 'Keltner Channel 2' },
  { id: 'kc2Mult', type: 'float', title: 'KC2 Multiplier', defval: 3.5, group: 'Keltner Channel 2' },
  { id: 'kc2Src', type: 'source', title: 'KC2 Source', defval: 'close', group: 'Keltner Channel 2' },
  { id: 'kc2UseEMA', type: 'bool', title: 'KC2 Use Exponential MA', defval: false, group: 'Keltner Channel 2' },
  { id: 'kc2AtrLen', type: 'int', title: 'KC2 ATR Length', defval: 40, group: 'Keltner Channel 2' },
  { id: 'emaLen', type: 'int', title: 'EMA Length', defval: 9, group: 'EMA' },
  { id: 'emaSrc', type: 'source', title: 'EMA Source', defval: 'close', group: 'EMA' },
  { id: 'emaOff', type: 'int', title: 'EMA Offset', defval: 0, group: 'EMA' },
  { id: 'useHODFilter', type: 'bool', title: 'Require new HOD/LOD', defval: false, group: 'Breakout Dots' },
  { id: 'resetHour', type: 'int', title: 'Reset Hour (0-23)', defval: 18, min: 0, max: 23, group: 'Breakout Dots' },
  { id: 'resetMin', type: 'int', title: 'Reset Minute', defval: 0, min: 0, max: 59, group: 'Breakout Dots' },
  { id: 'tz', type: 'string', title: 'Timezone', defval: 'America/New_York', group: 'Breakout Dots' },
];

const KC1_BASIS = String(color.new(color.orange, 0));
const KC1_BAND = String(color.new(color.orange, 30));
const KC2_BASIS = String(color.new(color.blue, 0));
const KC2_BAND = String(color.new(color.blue, 30));
const EMA_COL = String(color.new(color.white, 0));
const LIME = String(color.new(color.lime, 0));
const RED = String(color.new(color.red, 0));

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'KC1 Basis', color: KC1_BASIS, lineWidth: 1 },
  { id: 'plot1', title: 'KC1 Upper', color: KC1_BAND, lineWidth: 1 },
  { id: 'plot2', title: 'KC1 Lower', color: KC1_BAND, lineWidth: 1 },
  { id: 'plot3', title: 'KC2 Basis', color: KC2_BASIS, lineWidth: 1 },
  { id: 'plot4', title: 'KC2 Upper', color: KC2_BAND, lineWidth: 1 },
  { id: 'plot5', title: 'KC2 Lower', color: KC2_BAND, lineWidth: 1 },
  { id: 'plot6', title: 'EMA', color: EMA_COL, lineWidth: 1 },
];

export const metadata = {
  title: 'The Mean Goose v1',
  shortTitle: 'The Mean Goose v1',
  overlay: true,
};

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;

export function calculate(
  bars: Bar[],
  inputs: Partial<TheMeanGooseV1Inputs> = {},
  chart?: ChartContext,
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[] } {
  // barstate.isconfirmed: every bar is closed, except the last one when the chart context says that it is still open
  const lastBarOpen = !lastBarConfirmedOf(chart);
  const barIsConfirmed = (index: number) => !(lastBarOpen && index === bars.length - 1);
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const A = (s: { toArray(): (number | null)[] }) => s.toArray().map((v) => v ?? NaN);

  // kc_ma = useEMA ? ta.ema(src, len) : ta.sma(src, len) (a constant input: one branch runs on every bar)
  const kc1Src = getSourceSeries(bars, cfg.kc1Src);
  const kc1Ma = A(cfg.kc1UseEMA ? ta.ema(kc1Src, cfg.kc1Len) : ta.sma(kc1Src, cfg.kc1Len));
  const kc1Rng = A(ta.atr(bars, cfg.kc1AtrLen));
  const kc2Src = getSourceSeries(bars, cfg.kc2Src);
  const kc2Ma = A(cfg.kc2UseEMA ? ta.ema(kc2Src, cfg.kc2Len) : ta.sma(kc2Src, cfg.kc2Len));
  const kc2Rng = A(ta.atr(bars, cfg.kc2AtrLen));
  const emaVal = A(ta.ema(getSourceSeries(bars, cfg.emaSrc), cfg.emaLen));

  const kc1Upper = kc1Ma.map((m, i) => m + kc1Rng[i] * cfg.kc1Mult);
  const kc1Lower = kc1Ma.map((m, i) => m - kc1Rng[i] * cfg.kc1Mult);
  const kc2Upper = kc2Ma.map((m, i) => m + kc2Rng[i] * cfg.kc2Mult);
  const kc2Lower = kc2Ma.map((m, i) => m - kc2Rng[i] * cfg.kc2Mult);

  // hour(time, tz) == reset_hour and minute(time, tz) == reset_min (Pine time in milliseconds)
  const atReset = (i: number) => {
    if (i < 0) return false; // time[1] on the first bar is na: hour(na) == x is false
    const ms = bars[i].time * 1000;
    return time.hour(ms, cfg.tz) === cfg.resetHour && time.minute(ms, cfg.tz) === cfg.resetMin;
  };

  const markers: MarkerData[] = [];
  let dayHigh = NaN; // var float dayHigh = na
  let dayLow = NaN;
  let highTrigger = false; // var bool highTrigger = false
  let lowTrigger = false;
  for (let i = 0; i < n; i++) {
    const b = bars[i];
    const highOutsideBoth = gt(b.high, kc1Upper[i]) && gt(b.high, kc2Upper[i]);
    const lowOutsideBoth = lt(b.low, kc1Lower[i]) && lt(b.low, kc2Lower[i]);

    const isReset = atReset(i) && !atReset(i - 1);
    const prevDayHigh = dayHigh; // dayHigh[1]
    const prevDayLow = dayLow;
    if (isReset || isNaN(dayHigh)) {
      dayHigh = b.high;
      dayLow = b.low;
    } else {
      dayHigh = Math.max(dayHigh, b.high);
      dayLow = Math.min(dayLow, b.low);
    }
    const prevHigh = isReset ? NaN : prevDayHigh;
    const prevLow = isReset ? NaN : prevDayLow;
    const newHigh = !isNaN(prevHigh) && gt(b.high, prevHigh);
    const newLow = !isNaN(prevLow) && lt(b.low, prevLow);

    const highDot = highOutsideBoth && (!cfg.useHODFilter || newHigh);
    const lowDot = lowOutsideBoth && (!cfg.useHODFilter || newLow);
    if (highDot) markers.push({ time: b.time, position: 'aboveBar', shape: 'circle', color: LIME, size: 'tiny' });
    if (lowDot) markers.push({ time: b.time, position: 'belowBar', shape: 'circle', color: RED, size: 'tiny' });

    if (highDot) highTrigger = true;
    if (lowDot) lowTrigger = true;
    // fireDown = highTrigger and close < ema_val and barstate.isconfirmed
    const fireDown = highTrigger && lt(b.close, emaVal[i]) && barIsConfirmed(i);
    const fireUp = lowTrigger && gt(b.close, emaVal[i]) && barIsConfirmed(i);
    if (fireDown) highTrigger = false;
    if (fireUp) lowTrigger = false;
    if (fireDown) {
      markers.push({ time: b.time, position: 'aboveBar', shape: 'labelDown', color: RED, textColor: color.white, size: 'small' });
    }
    if (fireUp) {
      markers.push({ time: b.time, position: 'belowBar', shape: 'labelUp', color: LIME, textColor: color.white, size: 'small' });
    }
  }

  const line = (vals: number[], c: string) => bars.map((b, i) => ({ time: b.time, value: vals[i], color: c }));
  // plot(ema_val, offset = ema_off): the value of bar i is drawn on bar i + ema_off
  const interval = barInterval(bars);
  const emaPlot: { time: number; value: number; color: string }[] = [];
  for (let i = 0; i < n; i++) {
    const j = i + cfg.emaOff;
    if (j < 0) continue;
    emaPlot.push({ time: barTime(bars, j, interval), value: emaVal[i], color: EMA_COL });
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {
      plot0: line(kc1Ma, KC1_BASIS),
      plot1: line(kc1Upper, KC1_BAND),
      plot2: line(kc1Lower, KC1_BAND),
      plot3: line(kc2Ma, KC2_BASIS),
      plot4: line(kc2Upper, KC2_BAND),
      plot5: line(kc2Lower, KC2_BAND),
      plot6: emaPlot,
    },
    markers,
  };
}

export const TheMeanGooseV1 = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
};
