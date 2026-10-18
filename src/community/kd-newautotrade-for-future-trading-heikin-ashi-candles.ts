/**
 * KD-NewAuto Trade
 *
 * A fast and a slow EMA of the close. A BUY triangle (and a green background) is drawn when the fast EMA crosses
 * over the slow EMA, the RSI is above the buy level and, with the ADX filter on, the ADX of ta.dmi is above the
 * minimum. A SELL triangle (and a red background) is drawn on a cross under with the RSI below the sell level and
 * the same ADX filter.
 * Alerts (alertcondition, `alerts` of the result): 'BUY ALERT' and 'SELL ALERT' on the bars of the BUY / SELL signals.
 *
 * Reference: "KD-NewAutoTrade for Future Trading - Heikin Ashi candles" by krish16887
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 */

import { ta, Series, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { BgColorData, MarkerData } from '../types';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

export interface KdNewAutoTradeInputs {
  fastLength: number;
  slowLength: number;
  rsiLength: number;
  /** DI length of ta.dmi */
  adxLength: number;
  /** ADX smoothing of ta.dmi */
  adxSmooth: number;
  adxMin: number;
  adxFilter: boolean;
  rsiBuyLvl: number;
  rsiSellLvl: number;
}

export const defaultInputs: KdNewAutoTradeInputs = {
  fastLength: 10,
  slowLength: 20,
  rsiLength: 14,
  adxLength: 14,
  adxSmooth: 14,
  adxMin: 25,
  adxFilter: true,
  rsiBuyLvl: 55,
  rsiSellLvl: 45,
};

export const inputConfig: InputConfig[] = [
  { id: 'fastLength', type: 'int', title: 'Fast EMA Length', defval: 10 },
  { id: 'slowLength', type: 'int', title: 'Slow EMA Length', defval: 20 },
  { id: 'rsiLength', type: 'int', title: 'RSI Length', defval: 14 },
  { id: 'adxLength', type: 'int', title: 'ADX Length', defval: 14 },
  { id: 'adxSmooth', type: 'int', title: 'ADX Smooth', defval: 14 },
  { id: 'adxMin', type: 'int', title: 'ADX Min', defval: 25 },
  { id: 'adxFilter', type: 'bool', title: 'Enable ADX Filter', defval: true },
  { id: 'rsiBuyLvl', type: 'int', title: 'RSI Buy Level', defval: 55 },
  { id: 'rsiSellLvl', type: 'int', title: 'RSI Sell Level', defval: 45 },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'EMA 10', color: String(color.new(color.green, 0)), lineWidth: 2 },
  { id: 'plot1', title: 'EMA 20', color: String(color.new(color.orange, 0)), lineWidth: 2 },
];

export const metadata = {
  title: 'KD-NewAuto Trade',
  shortTitle: 'KD-NewAuto Trade',
  overlay: true,
};

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;

export function calculate(
  bars: Bar[],
  inputs: Partial<KdNewAutoTradeInputs> = {},
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[]; bgColors: BgColorData[] } & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const close = Series.fromArray(bars, bars.map((b) => b.close));
  const emaFastS = ta.ema(close, cfg.fastLength);
  const emaSlowS = ta.ema(close, cfg.slowLength);
  const emaFast = A(emaFastS);
  const emaSlow = A(emaSlowS);
  const rsi = A(ta.rsi(close, cfg.rsiLength));
  const adx = A(ta.dmi(bars, cfg.adxLength, cfg.adxSmooth)[2]);
  // ta.crossover / ta.crossunder: exact comparisons
  const bullishCross = ta.crossover(emaFastS, emaSlowS).toArray();
  const bearishCross = ta.crossunder(emaFastS, emaSlowS).toArray();

  const markers: MarkerData[] = [];
  const bgColors: BgColorData[] = [];
  const buyColor = String(color.new(color.green, 0));
  const sellColor = String(color.new(color.red, 0));
  const buyBg = String(color.new(color.green, 85));
  const sellBg = String(color.new(color.red, 85));
  const longFlags: boolean[] = [];
  const shortFlags: boolean[] = [];
  for (let i = 0; i < n; i++) {
    const t = bars[i].time;
    const trendStrong = !cfg.adxFilter || gt(adx[i], cfg.adxMin);
    const longCond = !!bullishCross[i] && gt(rsi[i], cfg.rsiBuyLvl) && trendStrong;
    const shortCond = !!bearishCross[i] && lt(rsi[i], cfg.rsiSellLvl) && trendStrong;
    longFlags.push(longCond);
    shortFlags.push(shortCond);
    // plotshape(..., size = size.large, text = "BUY"): no textcolor, the Pine default text colour (color.blue)
    if (longCond) {
      markers.push({ time: t, position: 'belowBar', shape: 'triangleUp', color: buyColor, text: 'BUY',
        textColor: color.blue, size: 'large' });
    }
    if (shortCond) {
      markers.push({ time: t, position: 'aboveBar', shape: 'triangleDown', color: sellColor, text: 'SELL',
        textColor: color.blue, size: 'large' });
    }
    // bgcolor(longCond ? color.new(color.green, 85) : shortCond ? color.new(color.red, 85) : na)
    if (longCond) bgColors.push({ time: t, color: buyBg });
    else if (shortCond) bgColors.push({ time: t, color: sellBg });
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {
      plot0: bars.map((b, i) => ({ time: b.time, value: emaFast[i], color: buyColor })),
      plot1: bars.map((b, i) => ({ time: b.time, value: emaSlow[i], color: String(color.new(color.orange, 0)) })),
    },
    markers,
    bgColors,
    // alertcondition(longCond, "BUY ALERT") / alertcondition(shortCond, "SELL ALERT")
    alerts: alertStates(alertConditions, bars, [longFlags, shortFlags]),
  };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'BUY ALERT', message: 'BUY: EMA 10 crossed above EMA 20 with RSI & ADX confirmation.' },
  { id: 'alert1', title: 'SELL ALERT', message: 'SELL: EMA 10 crossed below EMA 20 with RSI & ADX confirmation.' },
];

export const KdNewAutoTrade = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  alertConditions,
};
