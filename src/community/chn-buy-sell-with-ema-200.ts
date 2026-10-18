/**
 * CHN BUY SELL with EMA 200
 *
 * RSI (7) colours the bars: yellow at or above the overbought level, purple at or below the oversold level. A BUY
 * label shows when the close is above the EMA (200) on a yellow bar, a SELL label when the close is below the EMA on
 * a purple bar; a new label of the same side needs at least `signalCooldown` bars since the last one.
 * Alerts (alertcondition, `alerts` of the result): 'BUY Signal', 'SELL Signal' and 'BUY and SELL' (either), true on
 * the bars of the labels.
 *
 * Reference: "CHN BUY SELL with EMA 200" by CHNTeam
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 */

import { ta, Series, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { BarColorData, MarkerData } from '../types';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

export interface ChnBuySellWithEma200Inputs {
  /** RSI length */
  rsi7Length: number;
  /** EMA length */
  emaLength: number;
  /** RSI overbought level (yellow bars) */
  rsi7Overbought: number;
  /** RSI oversold level (purple bars) */
  rsi7Oversold: number;
  /** Minimum bars between two signals of the same side */
  signalCooldown: number;
}

export const defaultInputs: ChnBuySellWithEma200Inputs = {
  rsi7Length: 7,
  emaLength: 200,
  rsi7Overbought: 70,
  rsi7Oversold: 30,
  signalCooldown: 5,
};

export const inputConfig: InputConfig[] = [
  { id: 'rsi7Length', type: 'int', title: 'RSI 7 Length', defval: 7, min: 1 },
  { id: 'emaLength', type: 'int', title: 'EMA Length', defval: 200, min: 1 },
  { id: 'rsi7Overbought', type: 'int', title: 'RSI 7 Overbought Level', defval: 70, min: 50, max: 100 },
  { id: 'rsi7Oversold', type: 'int', title: 'RSI 7 Oversold Level', defval: 30, min: 0, max: 50 },
  { id: 'signalCooldown', type: 'int', title: 'Signal Cooldown (candles)', defval: 5, min: 1, max: 20 },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'EMA 200', color: color.blue, lineWidth: 2 },
];

export const metadata = {
  title: 'CHN BUY SELL with EMA 200',
  shortTitle: 'CHN+EMA200',
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
  inputs: Partial<ChnBuySellWithEma200Inputs> = {},
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[]; barColors: BarColorData[] } & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const close = Series.fromArray(bars, bars.map((b) => b.close));

  const rsi7 = A(ta.rsi(close, cfg.rsi7Length));
  const ema200 = A(ta.ema(close, cfg.emaLength));

  const barColors: BarColorData[] = [];
  const markers: MarkerData[] = [];
  const buyFlags: boolean[] = [], sellFlags: boolean[] = [];
  // var int last_buy_bar = 0, var int last_sell_bar = 0 (bar_index of the last signal)
  let lastBuyBar = 0;
  let lastSellBar = 0;
  for (let i = 0; i < n; i++) {
    const t = bars[i].time;
    const isYellow = ge(rsi7[i], cfg.rsi7Overbought);
    const isPurple = le(rsi7[i], cfg.rsi7Oversold);
    // barcolor(is_yellow_candle ? color.yellow : is_purple_candle ? color.purple : na, title = "Candle Colors")
    if (isYellow) barColors.push({ time: t, color: color.yellow });
    else if (isPurple) barColors.push({ time: t, color: color.purple });

    const buy = gt(bars[i].close, ema200[i]) && isYellow && i - lastBuyBar >= cfg.signalCooldown;
    const sell = lt(bars[i].close, ema200[i]) && isPurple && i - lastSellBar >= cfg.signalCooldown;
    if (buy) lastBuyBar = i;
    if (sell) lastSellBar = i;
    buyFlags.push(buy);
    sellFlags.push(sell);
    if (buy) {
      markers.push({ time: t, position: 'belowBar', shape: 'labelUp', color: color.green, text: 'BUY',
        textColor: color.white, size: 'normal' });
    }
    if (sell) {
      markers.push({ time: t, position: 'aboveBar', shape: 'labelDown', color: color.red, text: 'SELL',
        textColor: color.white, size: 'normal' });
    }
  }

  const plot0 = bars.map((b, i) => ({ time: b.time, value: ema200[i], color: color.blue }));

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: { plot0 },
    markers,
    barColors,
    // alertcondition(buy_condition), (sell_condition), (buy_condition or sell_condition)
    alerts: alertStates(alertConditions, bars, [buyFlags, sellFlags, buyFlags.map((b, i) => b || sellFlags[i])]),
  };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'BUY Signal', message: 'CHN BUY SELL: BUY signal' },
  { id: 'alert1', title: 'SELL Signal', message: 'CHN BUY SELL: SELL signal' },
  { id: 'alert2', title: 'BUY and SELL', message: 'CHN BUY SELL: Trading signal generated' },
];

export const ChnBuySellWithEma200 = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  alertConditions,
};
