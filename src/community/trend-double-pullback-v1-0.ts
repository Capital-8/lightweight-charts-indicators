/**
 * Trend Double Pullback [Stable 20] v1.0
 *
 * EMAs 15 / 25 (short band), 50 / 70 (medium band) and 199 (baseline). An uptrend is a short band fully above the
 * medium band; it is stable when that holds for `trend_stability` bars, and it ends when the close stays under the
 * EMA 70 for more than `breakout_tolerance` bars (downtrend: the mirror). In a stable trend, a first pullback to
 * the short band (low <= EMA 15 and close >= EMA 25) or to the medium band (low <= EMA 50 and close >= EMA 70) with
 * a green candle or a long lower shadow (> 30 % of the range) is a "watch" signal (after a cooldown); a second
 * pullback to the same band is the buy signal (sell: the mirror). The background shows the stable (85 %) and the
 * unstable (95 % transparency) trends.
 * Alerts (alertcondition, `alerts` of the result): '[Alert] Buy Signal' and '[Alert] Sell Signal', true on the bars of
 * the buy / sell signals.
 *
 * Reference: "Trend Double Pullback [Stable 20]" by puduxbt
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 */

import { ta, math, Series, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { BgColorData, MarkerData } from '../types';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

export interface TrendDoublePullbackV10Inputs {
  /** Short EMA 1 (top) */
  lenEma15: number;
  /** Short EMA 2 (bottom) */
  lenEma25: number;
  /** Medium EMA 1 (top) */
  lenEma50: number;
  /** Medium EMA 2 (bottom, stop line) */
  lenEma70: number;
  /** Baseline (visual only) */
  lenEma199: number;
  /** Bars the EMA order must hold for a stable trend */
  trendStability: number;
  /** Bars between two signals */
  signalCooldown: number;
  /** Bars the close may stay beyond the EMA 70 before the trend ends */
  breakoutTolerance: number;
  showBg: boolean;
}

export const defaultInputs: TrendDoublePullbackV10Inputs = {
  lenEma15: 15,
  lenEma25: 25,
  lenEma50: 50,
  lenEma70: 70,
  lenEma199: 199,
  trendStability: 20,
  signalCooldown: 10,
  breakoutTolerance: 5,
  showBg: true,
};

export const inputConfig: InputConfig[] = [
  { id: 'lenEma15', type: 'int', title: 'Short EMA 1 (Top/动力)', defval: 15 },
  { id: 'lenEma25', type: 'int', title: 'Short EMA 2 (Bottom/支撑)', defval: 25 },
  { id: 'lenEma50', type: 'int', title: 'Medium EMA 1 (Top/防守)', defval: 50 },
  { id: 'lenEma70', type: 'int', title: 'Medium EMA 2 (Bottom/终结)', defval: 70 },
  { id: 'lenEma199', type: 'int', title: 'Baseline (Visual Only)', defval: 199 },
  { id: 'trendStability', type: 'int', title: 'Trend Stability Bars (稳定K线数)', defval: 20, min: 1 },
  { id: 'signalCooldown', type: 'int', title: 'Signal Cooldown Bars (信号冷却期)', defval: 10, min: 1 },
  { id: 'breakoutTolerance', type: 'int', title: 'Breakout Tolerance Bars (破位容忍度)', defval: 5, min: 1 },
  { id: 'showBg', type: 'bool', title: 'Show Trend Background', defval: true },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'EMA 15', color: String(color.new(color.fuchsia, 0)), lineWidth: 1 },
  { id: 'plot1', title: 'EMA 25', color: String(color.new('#C71585', 0)), lineWidth: 1 },
  { id: 'plot2', title: 'EMA 50', color: String(color.new(color.orange, 0)), lineWidth: 1 },
  { id: 'plot3', title: 'EMA 70 (Stop Line)', color: String(color.new(color.orange, 0)), lineWidth: 2 },
  { id: 'plot4', title: 'EMA 199 Baseline', color: color.purple, lineWidth: 2 },
];

export const metadata = {
  title: 'Trend Double Pullback [Stable 20]',
  shortTitle: 'Trend Double Pullback [Stable 20]',
  overlay: true,
};

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const le = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(a - b > EPS);
const ge = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(b - a > EPS);

type Band = 'NA' | 'SHORT' | 'MEDIUM';

export function calculate(
  bars: Bar[],
  inputs: Partial<TrendDoublePullbackV10Inputs> = {},
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[]; bgColors: BgColorData[] } & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const S = (a: number[]) => Series.fromArray(bars, a);
  const close = S(bars.map((b) => b.close));

  const ema15 = A(ta.ema(close, cfg.lenEma15));
  const ema25 = A(ta.ema(close, cfg.lenEma25));
  const ema50 = A(ta.ema(close, cfg.lenEma50));
  const ema70 = A(ta.ema(close, cfg.lenEma70));
  const ema199 = A(ta.ema(close, cfg.lenEma199));

  // Raw structure: short band above (below) the medium band; math.max / math.min give na with an na EMA
  const rawUp: boolean[] = new Array(n);
  const rawDown: boolean[] = new Array(n);
  for (let i = 0; i < n; i++) {
    const fastTop = Math.max(ema15[i], ema25[i]);
    const fastBottom = Math.min(ema15[i], ema25[i]);
    const slowTop = Math.max(ema50[i], ema70[i]);
    const slowBottom = Math.min(ema50[i], ema70[i]);
    rawUp[i] = gt(fastBottom, slowTop);
    rawDown[i] = lt(fastTop, slowBottom);
  }
  // math.sum(raw ? 1 : 0, trend_stability) == trend_stability (na during the first bars)
  const sumUp = A(math.sum(S(rawUp.map((x) => (x ? 1 : 0))), cfg.trendStability) as Series);
  const sumDown = A(math.sum(S(rawDown.map((x) => (x ? 1 : 0))), cfg.trendStability) as Series);

  const blue = String(color.new(color.blue, 0));
  const red = String(color.new(color.red, 0));
  const bgStableUp = String(color.new(color.green, 85));
  const bgUnstableUp = String(color.new(color.green, 95));
  const bgStableDown = String(color.new(color.red, 85));
  const bgUnstableDown = String(color.new(color.red, 95));

  let breakLong = 0; // var int consecutive_break_long
  let breakShort = 0;
  let lastLong = -999999; // var int last_long_signal_bar
  let lastShort = -999999;
  let stateLong = 0;
  let bandLong: Band = 'NA';
  let stateShort = 0;
  let bandShort: Band = 'NA';
  let prevStateLong = NaN; // state_long[1] (na on the first bar)
  let prevBandLong: Band | null = null;
  let prevStateShort = NaN;
  let prevBandShort: Band | null = null;

  const markers: MarkerData[] = [];
  const bgColors: BgColorData[] = [];
  const buyFlags: boolean[] = [];
  const sellFlags: boolean[] = [];
  for (let i = 0; i < n; i++) {
    const b = bars[i];
    const t = b.time;
    const range = b.high - b.low;
    const lowerShadow = gt(range, 0) ? (lt(b.close, b.open) ? (b.close - b.low) / range : (b.open - b.low) / range) : 0;
    const upperShadow = gt(range, 0) ? (lt(b.close, b.open) ? (b.high - b.open) / range : (b.high - b.close) / range) : 0;
    const isGreen = gt(b.close, b.open);
    const isRed = lt(b.close, b.open);

    const stableUp = !isNaN(sumUp[i]) && Math.abs(sumUp[i] - cfg.trendStability) <= EPS;
    const stableDown = !isNaN(sumDown[i]) && Math.abs(sumDown[i] - cfg.trendStability) <= EPS;

    if (lt(b.close, ema70[i])) breakLong += 1;
    else breakLong = 0;
    if (gt(b.close, ema70[i])) breakShort += 1;
    else breakShort = 0;
    const brokenLong = breakLong > cfg.breakoutTolerance;
    const brokenShort = breakShort > cfg.breakoutTolerance;

    const isUp = stableUp && !brokenLong;
    const isDown = stableDown && !brokenShort;
    const isUnstableUp = rawUp[i] && !stableUp && !brokenLong;
    const isUnstableDown = rawDown[i] && !stableDown && !brokenShort;

    // Support / resistance
    const supportShort = le(b.low, ema15[i]) && ge(b.close, ema25[i]);
    const supportMedium = le(b.low, ema50[i]) && ge(b.close, ema70[i]);
    const validLong = isGreen || gt(lowerShadow, 0.3);
    const longTrigShort = isUp && supportShort && validLong;
    const longTrigMedium = isUp && supportMedium && validLong;
    const resistShort = ge(b.high, ema15[i]) && le(b.close, ema25[i]);
    const resistMedium = ge(b.high, ema50[i]) && le(b.close, ema70[i]);
    const validShort = isRed || gt(upperShadow, 0.3);
    const shortTrigShort = isDown && resistShort && validShort;
    const shortTrigMedium = isDown && resistMedium && validShort;

    // Cooldown
    const longCooldown = i - lastLong > cfg.signalCooldown;
    const shortCooldown = i - lastShort > cfg.signalCooldown;

    // Long state machine
    if (brokenLong) {
      stateLong = 0;
      bandLong = 'NA';
    } else if (isUp) {
      if (stateLong === 0) {
        if (longCooldown) {
          if (longTrigShort) {
            stateLong = 1;
            bandLong = 'SHORT';
            lastLong = i;
          } else if (longTrigMedium) {
            stateLong = 1;
            bandLong = 'MEDIUM';
            lastLong = i;
          }
        }
      } else if (stateLong === 1) {
        if ((bandLong === 'SHORT' && longTrigShort) || (bandLong === 'MEDIUM' && longTrigMedium)) {
          // state_long := 2, then 0 on the same bar
          lastLong = i;
          stateLong = 0;
          bandLong = 'NA';
        }
      }
    }
    // Short state machine
    if (brokenShort) {
      stateShort = 0;
      bandShort = 'NA';
    } else if (isDown) {
      if (stateShort === 0) {
        if (shortCooldown) {
          if (shortTrigShort) {
            stateShort = 1;
            bandShort = 'SHORT';
            lastShort = i;
          } else if (shortTrigMedium) {
            stateShort = 1;
            bandShort = 'MEDIUM';
            lastShort = i;
          }
        }
      } else if (stateShort === 1) {
        if ((bandShort === 'SHORT' && shortTrigShort) || (bandShort === 'MEDIUM' && shortTrigMedium)) {
          lastShort = i;
          stateShort = 0;
          bandShort = 'NA';
        }
      }
    }

    // Background (var color, only written when show_bg)
    if (cfg.showBg) {
      const bg = isUp ? bgStableUp : isUnstableUp ? bgUnstableUp : isDown ? bgStableDown
        : isUnstableDown ? bgUnstableDown : null;
      if (bg) bgColors.push({ time: t, color: bg });
    }

    // Signals
    if (stateLong === 1 && prevStateLong === 0) {
      markers.push({ time: t, position: 'belowBar', shape: 'arrowUp', color: blue, size: 'tiny', text: '一探', textColor: color.blue });
    }
    const isBuy = prevStateLong === 1
      && ((prevBandLong === 'SHORT' && longTrigShort) || (prevBandLong === 'MEDIUM' && longTrigMedium));
    if (isBuy) {
      markers.push({ time: t, position: 'belowBar', shape: 'triangleUp', color: blue, size: 'tiny', text: '买入', textColor: color.blue });
    }
    if (stateShort === 1 && prevStateShort === 0) {
      markers.push({ time: t, position: 'aboveBar', shape: 'arrowDown', color: red, size: 'tiny', text: '一探', textColor: color.red });
    }
    const isSell = prevStateShort === 1
      && ((prevBandShort === 'SHORT' && shortTrigShort) || (prevBandShort === 'MEDIUM' && shortTrigMedium));
    if (isSell) {
      markers.push({ time: t, position: 'aboveBar', shape: 'triangleDown', color: red, size: 'tiny', text: '卖出', textColor: color.red });
    }

    buyFlags.push(isBuy);
    sellFlags.push(isSell);
    prevStateLong = stateLong;
    prevBandLong = bandLong;
    prevStateShort = stateShort;
    prevBandShort = bandShort;
  }

  const line = (v: number[], c: string) => bars.map((b, i) => ({ time: b.time, value: v[i], color: c }));
  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {
      plot0: line(ema15, String(color.new(color.fuchsia, 0))),
      plot1: line(ema25, String(color.new('#C71585', 0))),
      plot2: line(ema50, String(color.new(color.orange, 0))),
      plot3: line(ema70, String(color.new(color.orange, 0))),
      plot4: line(ema199, color.purple),
    },
    fills: [
      { plot1: 'plot0', plot2: 'plot1', options: { title: 'Short Band Fill', color: String(color.new(color.fuchsia, 85)) } },
      { plot1: 'plot2', plot2: 'plot3', options: { title: 'Medium Band Fill', color: String(color.new(color.orange, 85)) } },
    ],
    bgColors,
    markers,
    // alertcondition(is_buy_signal, "[Alert] Buy Signal") / alertcondition(is_sell_signal, "[Alert] Sell Signal")
    alerts: alertStates(alertConditions, bars, [buyFlags, sellFlags]),
  };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: '[Alert] Buy Signal', message: 'Stable Trend Buy: Double pullback 🚀' },
  { id: 'alert1', title: '[Alert] Sell Signal', message: 'Stable Trend Sell: Double pullback 🩸' },
];

export const TrendDoublePullbackV10 = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  alertConditions,
};
