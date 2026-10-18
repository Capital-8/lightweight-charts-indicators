/**
 * EMA21 Pullback Buy
 *
 * EMA21 and SMA50 lines. A test candle is a bar in an uptrend (Strict, Moderate or Loose trend filter) whose
 * previous close was above the EMA21, whose low touches or crosses the EMA21 and whose close is back above it.
 * The tests are counted while the trend holds (optional limit). A valid test colours the bar white and draws a
 * circle below it. The first bullish candle (close > open > EMA21) that takes out the high of the latest test, while
 * the trend holds and the close stays above both averages, draws a "Buy" triangle above the bar.
 * Alerts (alertcondition, `alerts` of the result): 'EMA21 test' on the valid test candles and 'Buy bullish reversal'
 * on the Buy bars.
 *
 * Reference: "EMA21 Pullback Buy" by Kennedy08
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 */

import { ta, Series, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { BarColorData, MarkerData } from '../types';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

export interface Ema21PullbackBuyInputs {
  emaLen: number;
  /** SMA length (trend) */
  smaLen: number;
  useTrendFilter: boolean;
  trendSensitivity: 'Strict' | 'Moderate' | 'Loose';
  /** EMA10 momentum filter (Strict trend) */
  useEma10Filter: boolean;
  useMaxTestLimit: boolean;
  /** Max number of EMA21 tests in a trend */
  maxTests: number;
  showTestColor: boolean;
  showBuySignal: boolean;
  /** Min days above EMA21 (Strict) */
  emaTrendDays: number;
  /** Min days SMA50 rising (Strict) */
  smaUpDays: number;
}

export const defaultInputs: Ema21PullbackBuyInputs = {
  emaLen: 21,
  smaLen: 50,
  useTrendFilter: true,
  trendSensitivity: 'Strict',
  useEma10Filter: false,
  useMaxTestLimit: true,
  maxTests: 6,
  showTestColor: true,
  showBuySignal: true,
  emaTrendDays: 5,
  smaUpDays: 5,
};

export const inputConfig: InputConfig[] = [
  { id: 'emaLen', type: 'int', title: 'EMA length', defval: 21 },
  { id: 'smaLen', type: 'int', title: 'SMA length (trend)', defval: 50 },
  { id: 'useTrendFilter', type: 'bool', title: 'Use trend filter', defval: true },
  { id: 'trendSensitivity', type: 'string', title: 'Trend Sensitivity', defval: 'Strict', options: ['Strict', 'Moderate', 'Loose'] },
  { id: 'useEma10Filter', type: 'bool', title: 'Use EMA10 momentum filter', defval: false },
  { id: 'useMaxTestLimit', type: 'bool', title: 'Limit max number of EMA21 tests', defval: true },
  { id: 'maxTests', type: 'int', title: 'Max number of EMA21 tests in trend', defval: 6, min: 1, max: 20 },
  { id: 'showTestColor', type: 'bool', title: 'Color EMA21 test candles', defval: true },
  { id: 'showBuySignal', type: 'bool', title: 'Show buy signal after test', defval: true },
  { id: 'emaTrendDays', type: 'int', title: 'Min days above EMA21 (strict)', defval: 5, min: 1 },
  { id: 'smaUpDays', type: 'int', title: 'Min days SMA50 rising (strict)', defval: 5, min: 1 },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'EMA21', color: String(color.new(color.gray, 0)), lineWidth: 1 },
  { id: 'plot1', title: 'SMA50', color: String(color.new(color.silver, 0)), lineWidth: 1 },
];

export const metadata = {
  title: 'EMA21 Pullback Buy',
  shortTitle: '21 Pullback',
  overlay: true,
};

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const le = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(a - b > EPS);
const ge = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(b - a > EPS);

export function calculate(
  bars: Bar[],
  inputs: Partial<Ema21PullbackBuyInputs> = {},
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[]; barColors: BarColorData[] } & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const S = (a: number[]) => Series.fromArray(bars, a);
  const close = bars.map((b) => b.close);

  const ema10 = A(ta.ema(S(close), 10));
  const ema21 = A(ta.ema(S(close), cfg.emaLen));
  const sma50 = A(ta.sma(S(close), cfg.smaLen));
  const prev = (a: number[], i: number) => (i > 0 ? a[i - 1] : NaN);

  // smaRisingRecently = ta.barssince(not smaRising) >= smaUpDays; aboveEmaRecently = ta.barssince(close < ema21) >= ...
  const notSmaRising = sma50.map((v, i) => (gt(v, prev(sma50, i)) ? 0 : 1));
  const closeBelowEma = close.map((c, i) => (lt(c, ema21[i]) ? 1 : 0));
  const bsNotSmaRising = A(ta.barssince(S(notSmaRising)));
  const bsCloseBelowEma = A(ta.barssince(S(closeBelowEma)));

  const white = String(color.new(color.white, 0));
  const lime = String(color.new(color.lime, 0));
  const markers: MarkerData[] = [];
  const barColors: BarColorData[] = [];
  const testFlags: boolean[] = [];
  const buyFlags: boolean[] = [];

  let testCount = 0; // var int testCount = 0
  let lastTestHigh = NaN; // var float lastTestHigh = na
  let lastTestBarIndex = NaN; // var int lastTestBarIndex = na
  let buyTriggered = false; // var bool buyTriggered = false
  for (let i = 0; i < n; i++) {
    const b = bars[i];
    const e21 = ema21[i];
    const s50 = sma50[i];
    const emaReady = !isNaN(e21) && !isNaN(s50);

    const emaSlopeOk = gt(e21, prev(ema21, i) * 1.001);
    const emaAboveSmaWithMargin = gt(e21, s50 * 1.01);
    const smaRisingRecently = ge(bsNotSmaRising[i], cfg.smaUpDays);
    const aboveEmaRecently = ge(bsCloseBelowEma[i], cfg.emaTrendDays);
    const ema10SlopeUp = gt(ema10[i], prev(ema10, i));

    const strictTrend = emaReady && gt(b.close, e21) && gt(b.close, s50) && emaAboveSmaWithMargin && emaSlopeOk
      && smaRisingRecently && aboveEmaRecently && (!cfg.useEma10Filter || ema10SlopeUp);
    const moderateTrend = emaReady && gt(b.close, e21) && ge(e21, s50);
    const looseTrend = emaReady && gt(b.close, e21);
    const uptrend = (cfg.trendSensitivity === 'Strict' && strictTrend)
      || (cfg.trendSensitivity === 'Moderate' && moderateTrend)
      || (cfg.trendSensitivity === 'Loose' && looseTrend);
    const trendOk = cfg.useTrendFilter ? uptrend : emaReady;

    // EMA21 test candle
    const wasAbovePrev = emaReady && gt(prev(close, i), prev(ema21, i));
    const touchesOrUnder = emaReady && le(b.low, e21);
    const closesAbove = emaReady && gt(b.close, e21);
    const isTestCandidate = trendOk && wasAbovePrev && touchesOrUnder && closesAbove;

    if (!trendOk) testCount = 0;
    else if (isTestCandidate) testCount += 1;
    const limitOk = !cfg.useMaxTestLimit || testCount <= cfg.maxTests;
    const isValidTest = isTestCandidate && limitOk;

    if (isValidTest) {
      lastTestHigh = b.high;
      lastTestBarIndex = i;
      buyTriggered = false;
    }
    // Reset if the trend breaks or the price closes below the averages
    if (!trendOk || lt(b.close, e21) || lt(b.close, s50)) {
      lastTestHigh = NaN;
      lastTestBarIndex = NaN;
      buyTriggered = false;
    }

    // barcolor(showTestColor and isValidTest ? white : na)
    if (cfg.showTestColor && isValidTest) barColors.push({ time: b.time as number, color: white });
    // plotshape(isValidTest, style = shape.circle, location = location.belowbar, size = size.tiny)
    if (isValidTest) markers.push({ time: b.time as number, position: 'belowBar', shape: 'circle', color: white, size: 'tiny' });

    // Buy trigger: a bullish candle that takes out the last test high
    const hasTest = !isNaN(lastTestHigh) && !isNaN(lastTestBarIndex);
    const takesOutHigh = hasTest && gt(b.high, lastTestHigh) && i > lastTestBarIndex;
    const isBullish = gt(b.close, b.open) && gt(b.open, e21) && gt(b.close, e21);
    const isBuy = cfg.showBuySignal && hasTest && trendOk && !buyTriggered && takesOutHigh && isBullish;
    if (isBuy) buyTriggered = true;
    testFlags.push(isValidTest);
    buyFlags.push(isBuy);
    // plotshape(isBuy, style = shape.triangleup, location = location.abovebar, size = size.small, text = "Buy")
    if (isBuy) {
      markers.push({ time: b.time as number, position: 'aboveBar', shape: 'triangleUp', color: lime, size: 'small',
        text: 'Buy', textColor: color.lime });
    }
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {
      plot0: bars.map((b, i) => ({ time: b.time, value: ema21[i] })),
      plot1: bars.map((b, i) => ({ time: b.time, value: sma50[i] })),
    },
    markers,
    barColors,
    // alertcondition(isValidTest, "EMA21 test") / alertcondition(isBuy, "Buy bullish reversal")
    alerts: alertStates(alertConditions, bars, [testFlags, buyFlags]),
  };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'EMA21 test', message: 'EMA21 test in strong uptrend, price went below ema21 and closed back above.' },
  { id: 'alert1', title: 'Buy bullish reversal', message: 'First bullish reversal that takes out high of latest EMA21 test candle in strong uptrend.' },
];

export const Ema21PullbackBuy = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  alertConditions,
};
