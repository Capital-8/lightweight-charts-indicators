/**
 * Scalping Tool with Dynamic Take Profit & Stop Loss
 *
 * EMA(5) / EMA(13) crossovers give BUY and SELL labels. A buy opens a long trade at the close with a take profit
 * (close * (1 + percent) or close + ATR * multiplier) and a stop loss (entry - ATR * multiplier, moving with the
 * ATR). When the close reaches the take profit, the take profit is recalculated from that close. The long trade
 * ends on the next bearish cross; sell trades work the other way. The take profit and stop loss lines are drawn
 * while the trade is open.
 * Alerts (alertcondition, `alerts` of the result): 'Buy Signal' / 'Sell Signal', true on the bars of the labels.
 *
 * Reference: "Scalping Tool with Dynamic Take Profit & Stop Loss" by TruFREND
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 */

import { ta, Series, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { MarkerData } from '../types';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

export interface ScalpingToolDynamicTPSLInputs {
  fastLength: number;
  slowLength: number;
  atrLength: number;
  buyTakeProfitEnabled: boolean;
  /** 'Percentage' or 'ATR' */
  buyTakeProfitType: string;
  /** Buy take profit in percent */
  buyTakeProfitPercent: number;
  buyTakeProfitAtrMultiplier: number;
  buyStopLossEnabled: boolean;
  buyStopLossMultiplier: number;
  sellTakeProfitEnabled: boolean;
  /** 'Percentage' or 'ATR' */
  sellTakeProfitType: string;
  /** Sell take profit in percent */
  sellTakeProfitPercent: number;
  sellTakeProfitAtrMultiplier: number;
  sellStopLossEnabled: boolean;
  sellStopLossMultiplier: number;
}

export const defaultInputs: ScalpingToolDynamicTPSLInputs = {
  fastLength: 5,
  slowLength: 13,
  atrLength: 14,
  buyTakeProfitEnabled: true,
  buyTakeProfitType: 'Percentage',
  buyTakeProfitPercent: 0.3,
  buyTakeProfitAtrMultiplier: 1.5,
  buyStopLossEnabled: true,
  buyStopLossMultiplier: 1.5,
  sellTakeProfitEnabled: true,
  sellTakeProfitType: 'Percentage',
  sellTakeProfitPercent: 0.3,
  sellTakeProfitAtrMultiplier: 1.5,
  sellStopLossEnabled: true,
  sellStopLossMultiplier: 1.5,
};

export const inputConfig: InputConfig[] = [
  { id: 'fastLength', type: 'int', title: 'Fast Length', defval: 5, min: 1 },
  { id: 'slowLength', type: 'int', title: 'Slow Length', defval: 13, min: 1 },
  { id: 'atrLength', type: 'int', title: 'ATR Length', defval: 14, min: 1 },
  { id: 'buyTakeProfitEnabled', type: 'bool', title: 'Enable Buy Take Profit', defval: true },
  { id: 'buyTakeProfitType', type: 'string', title: 'Buy Take Profit Type', defval: 'Percentage', options: ['Percentage', 'ATR'] },
  { id: 'buyTakeProfitPercent', type: 'float', title: 'Buy Take Profit (%)', defval: 0.3, step: 0.1 },
  { id: 'buyTakeProfitAtrMultiplier', type: 'float', title: 'Buy Take Profit ATR Multiplier', defval: 1.5, step: 0.1 },
  { id: 'buyStopLossEnabled', type: 'bool', title: 'Enable Buy Stop Loss', defval: true },
  { id: 'buyStopLossMultiplier', type: 'float', title: 'Buy Stop Loss ATR Multiplier', defval: 1.5, step: 0.1 },
  { id: 'sellTakeProfitEnabled', type: 'bool', title: 'Enable Sell Take Profit', defval: true },
  { id: 'sellTakeProfitType', type: 'string', title: 'Sell Take Profit Type', defval: 'Percentage', options: ['Percentage', 'ATR'] },
  { id: 'sellTakeProfitPercent', type: 'float', title: 'Sell Take Profit (%)', defval: 0.3, step: 0.1 },
  { id: 'sellTakeProfitAtrMultiplier', type: 'float', title: 'Sell Take Profit ATR Multiplier', defval: 1.5, step: 0.1 },
  { id: 'sellStopLossEnabled', type: 'bool', title: 'Enable Sell Stop Loss', defval: true },
  { id: 'sellStopLossMultiplier', type: 'float', title: 'Sell Stop Loss ATR Multiplier', defval: 1.5, step: 0.1 },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Fast MA', color: color.blue, lineWidth: 1 },
  { id: 'plot1', title: 'Slow MA', color: color.red, lineWidth: 1 },
  { id: 'plot2', title: 'Buy Take Profit', color: color.green, lineWidth: 1, style: 'linebr' },
  { id: 'plot3', title: 'Buy Stop Loss', color: color.orange, lineWidth: 1, style: 'linebr' },
  { id: 'plot4', title: 'Sell Take Profit', color: color.red, lineWidth: 1, style: 'linebr' },
  { id: 'plot5', title: 'Sell Stop Loss', color: color.purple, lineWidth: 1, style: 'linebr' },
];

export const metadata = {
  title: 'Scalping Tool with Dynamic TP (ATR/Percentage), EMA, and ATR [v6]',
  shortTitle: 'Scalping Tool with Dynamic TP (ATR/Percentage), EMA, and ATR [v6]',
  overlay: true,
};

/** Pine float comparisons with the 1e-10 tolerance (false with na) */
const EPS = 1e-10;
const le = (a: number, b: number) => a - b <= EPS;
const ge = (a: number, b: number) => b - a <= EPS;

export function calculate(
  bars: Bar[],
  inputs: Partial<ScalpingToolDynamicTPSLInputs> = {},
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[] } & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const close = bars.map((b) => b.close);
  const closeS = Series.fromArray(bars, close);
  // input.float(...) / 100
  const buyTpPct = cfg.buyTakeProfitPercent / 100;
  const sellTpPct = cfg.sellTakeProfitPercent / 100;

  const fastMA = A(ta.ema(closeS, cfg.fastLength));
  const slowMA = A(ta.ema(closeS, cfg.slowLength));
  const atr = A(ta.atr(bars, cfg.atrLength));

  let longEntry = NaN;
  let shortEntry = NaN;
  let inLong = false;
  let inShort = false;
  let longTp = NaN;
  let shortTp = NaN;

  const blue = String(color.new(color.blue, 0));
  const red = String(color.new(color.red, 0));
  const green = String(color.new(color.green, 0));
  const orange = String(color.new(color.orange, 0));
  const purple = String(color.new(color.purple, 0));
  type Point = { time: number; value: number; color: string };
  const plots: Point[][] = Array.from({ length: 6 }, () => []);
  const markers: MarkerData[] = [];
  const longFlags: boolean[] = [], shortFlags: boolean[] = [];

  for (let i = 0; i < n; i++) {
    const t = bars[i].time;
    const f = fastMA[i];
    const s = slowMA[i];
    const f1 = i > 0 ? fastMA[i - 1] : NaN;
    const s1 = i > 0 ? slowMA[i - 1] : NaN;
    // ta.crossover(fast_ma, slow_ma): fast > slow and fast[1] <= slow[1]; ta.crossunder the other way
    // (exact comparisons: ta.crossover / ta.crossunder do not use the 1e-10 tolerance of the operators)
    const trendUp = f > s && f1 <= s1;
    const trendDown = f < s && f1 >= s1;
    const c = close[i];

    const longSignal = trendUp && !inLong;
    const shortSignal = trendDown && !inShort;
    longFlags.push(longSignal);
    shortFlags.push(shortSignal);

    if (longSignal) {
      longEntry = c;
      inLong = true;
      longTp = cfg.buyTakeProfitEnabled
        ? (cfg.buyTakeProfitType === 'Percentage' ? longEntry * (1 + buyTpPct) : longEntry + atr[i] * cfg.buyTakeProfitAtrMultiplier)
        : NaN;
    }
    if (shortSignal) {
      shortEntry = c;
      inShort = true;
      shortTp = cfg.sellTakeProfitEnabled
        ? (cfg.sellTakeProfitType === 'Percentage' ? shortEntry * (1 - sellTpPct) : shortEntry - atr[i] * cfg.sellTakeProfitAtrMultiplier)
        : NaN;
    }
    if (trendDown && inLong) {
      inLong = false;
      longEntry = NaN;
      longTp = NaN;
    }
    if (trendUp && inShort) {
      inShort = false;
      shortEntry = NaN;
      shortTp = NaN;
    }
    // Dynamic TP: a new take profit from the close when the close reaches it
    if (inLong && cfg.buyTakeProfitEnabled && ge(c, longTp)) {
      longTp = cfg.buyTakeProfitType === 'Percentage' ? c * (1 + buyTpPct) : c + atr[i] * cfg.buyTakeProfitAtrMultiplier;
    }
    if (inShort && cfg.sellTakeProfitEnabled && le(c, shortTp)) {
      shortTp = cfg.sellTakeProfitType === 'Percentage' ? c * (1 - sellTpPct) : c - atr[i] * cfg.sellTakeProfitAtrMultiplier;
    }
    const buySl = cfg.buyStopLossEnabled && inLong ? longEntry - atr[i] * cfg.buyStopLossMultiplier : NaN;
    const sellSl = cfg.sellStopLossEnabled && inShort ? shortEntry + atr[i] * cfg.sellStopLossMultiplier : NaN;

    plots[0].push({ time: t, value: f, color: blue });
    plots[1].push({ time: t, value: s, color: red });
    plots[2].push({ time: t, value: inLong ? longTp : NaN, color: green });
    plots[3].push({ time: t, value: inLong ? buySl : NaN, color: orange });
    plots[4].push({ time: t, value: inShort ? shortTp : NaN, color: red });
    plots[5].push({ time: t, value: inShort ? sellSl : NaN, color: purple });

    // plotshape(long_signal, location.belowbar, color.green, shape.labelup, text "BUY", size.small); default textcolor
    if (longSignal) {
      markers.push({ time: t, position: 'belowBar', shape: 'labelUp', color: green, text: 'BUY', textColor: color.blue, size: 'small' });
    }
    if (shortSignal) {
      markers.push({ time: t, position: 'aboveBar', shape: 'labelDown', color: red, text: 'SELL', textColor: color.blue, size: 'small' });
    }
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: Object.fromEntries(plots.map((p, k) => [`plot${k}`, p])),
    markers,
    // alertcondition(long_signal, "Buy Signal") / alertcondition(short_signal, "Sell Signal")
    alerts: alertStates(alertConditions, bars, [longFlags, shortFlags]),
  };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'Buy Signal', message: 'Buy Signal' },
  { id: 'alert1', title: 'Sell Signal', message: 'Sell Signal' },
];

export const ScalpingToolDynamicTPSL = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  alertConditions,
};
