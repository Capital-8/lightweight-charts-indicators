/**
 * Trade Prime - Fluid Trend Indicator
 *
 * A HalfTrend engine (amplitude = intensity level, times 5 in Trend Mode) with a channel of +-2 * ATR(100) / 2
 * around the HalfTrend line. The HalfTrend line and both channel edges are smoothed with an HMA (Smoothness Length).
 * The centre line is the bull colour in an uptrend, the bear colour in a downtrend; the ribbon shows only the active
 * side (the lower edge in an uptrend, the upper edge in a downtrend), filled to the centre line. A trend flip with a
 * known ATR draws a triangle (and optionally a BUY / SELL label) at the smoothed channel edge.
 * Alerts (alertcondition, `alerts` of the result): 'TP Fluid Buy' / 'TP Fluid Sell' on the bars of a valid buy / sell
 * flip (also when the triangles are not shown).
 *
 * Reference: "Trade Prime - Fluid Trend Indicator" by tradeprime01
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 */

import { ta, Series, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { MarkerData } from '../types';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

export interface TradePrimeFluidTrendIndicatorInputs {
  /** Trading Mode */
  opMode: 'Signal Mode' | 'Trend Mode';
  /** Intensity Level (1 to 3) */
  ampLevel: number;
  /** Smoothness Length (HMA, 10 to 20) */
  smoothLen: number;
  /** Color Theme */
  themeOpt: 'Green & Red' | 'Aqua & Orange';
  showLabels: boolean;
  showArrows: boolean;
  /** Show Trailing Ribbon */
  showChannels: boolean;
}

export const defaultInputs: TradePrimeFluidTrendIndicatorInputs = {
  opMode: 'Trend Mode',
  ampLevel: 1,
  smoothLen: 16,
  themeOpt: 'Green & Red',
  showLabels: false,
  showArrows: true,
  showChannels: true,
};

export const inputConfig: InputConfig[] = [
  { id: 'opMode', type: 'string', title: 'Trading Mode', defval: 'Trend Mode', options: ['Signal Mode', 'Trend Mode'] },
  { id: 'ampLevel', type: 'int', title: 'Intensity Level', defval: 1, min: 1, max: 3, step: 1 },
  { id: 'smoothLen', type: 'int', title: 'Smoothness Length', defval: 16, min: 10, max: 20 },
  { id: 'themeOpt', type: 'string', title: 'Color Theme', defval: 'Green & Red', options: ['Green & Red', 'Aqua & Orange'] },
  { id: 'showLabels', type: 'bool', title: 'Show Buy/Sell Labels', defval: false },
  { id: 'showArrows', type: 'bool', title: 'Show Signal Arrows', defval: true },
  { id: 'showChannels', type: 'bool', title: 'Show Trailing Ribbon', defval: true },
];

const GREEN = String(color.rgb(0, 255, 0));
const RED = String(color.rgb(255, 0, 0));
const AQUA = String(color.rgb(131, 238, 255));
const ORANGE = String(color.rgb(255, 95, 31));

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'HalfTrend Center', color: GREEN, lineWidth: 3 },
  { id: 'plot1', title: 'Upper Ribbon', color: String(color.new(RED, 50)), lineWidth: 1, style: 'linebr' },
  { id: 'plot2', title: 'Lower Ribbon', color: String(color.new(GREEN, 50)), lineWidth: 1, style: 'linebr' },
];

export const metadata = {
  title: 'Trade Prime - Fluid Trend Indicator',
  shortTitle: 'FTI',
  overlay: true,
};

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;

export function calculate(
  bars: Bar[],
  inputs: Partial<TradePrimeFluidTrendIndicatorInputs> = {},
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[] } & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const S = (a: number[]) => Series.fromArray(bars, a);

  const amplitude = cfg.ampLevel * (cfg.opMode === 'Signal Mode' ? 1 : 5);
  const channelDeviation = 2;
  const greenRed = cfg.themeOpt === 'Green & Red';
  const colorBull = greenRed ? GREEN : AQUA;
  const colorBear = greenRed ? RED : ORANGE;

  const high = bars.map((b) => b.high);
  const low = bars.map((b) => b.low);
  const atr = A(ta.atr(bars, 100));
  const hiBars = A(ta.highestbars(S(high), amplitude));
  const loBars = A(ta.lowestbars(S(low), amplitude));
  const highma = A(ta.sma(S(high), amplitude));
  const lowma = A(ta.sma(S(low), amplitude));

  // HalfTrend engine
  const trendArr: number[] = new Array(n);
  const upArr: number[] = new Array(n);
  const downArr: number[] = new Array(n);
  const htRaw: number[] = new Array(n);
  const atrHighRaw: number[] = new Array(n);
  const atrLowRaw: number[] = new Array(n);
  const arrowUp: number[] = new Array(n).fill(NaN);
  const arrowDown: number[] = new Array(n).fill(NaN);
  let trend = 0;
  let nextTrend = 0;
  // var float maxLowPrice = nz(low[1], low); var float minHighPrice = nz(high[1], high) (set on bar 0)
  let maxLowPrice = n > 0 ? low[0] : NaN;
  let minHighPrice = n > 0 ? high[0] : NaN;
  let up = 0;
  let down = 0;
  for (let i = 0; i < n; i++) {
    const atr2 = atr[i] / 2;
    const dev = channelDeviation * atr2;
    // high[math.abs(ta.highestbars(amplitude))]: an na offset (warm-up) reads the current bar
    const highPrice = isNaN(hiBars[i]) ? high[i] : high[i - Math.abs(hiBars[i])];
    const lowPrice = isNaN(loBars[i]) ? low[i] : low[i - Math.abs(loBars[i])];
    const prevLow = i > 0 ? low[i - 1] : low[i];
    const prevHigh = i > 0 ? high[i - 1] : high[i];
    const c = bars[i].close;

    if (nextTrend === 1) {
      maxLowPrice = Math.max(lowPrice, maxLowPrice);
      if (lt(highma[i], maxLowPrice) && lt(c, prevLow)) {
        trend = 1;
        nextTrend = 0;
        minHighPrice = highPrice;
      }
    } else {
      minHighPrice = Math.min(highPrice, minHighPrice);
      if (gt(lowma[i], minHighPrice) && gt(c, prevHigh)) {
        trend = 0;
        nextTrend = 1;
        maxLowPrice = lowPrice;
      }
    }

    const prevTrend = i > 0 ? trendArr[i - 1] : NaN;
    const upPrev = i > 0 ? upArr[i - 1] : NaN;
    const downPrev = i > 0 ? downArr[i - 1] : NaN;
    if (trend === 0) {
      if (!isNaN(prevTrend) && prevTrend !== 0) {
        up = isNaN(downPrev) ? down : downPrev;
        arrowUp[i] = up - atr2;
      } else {
        up = isNaN(upPrev) ? maxLowPrice : Math.max(maxLowPrice, upPrev);
      }
      atrHighRaw[i] = up + dev;
      atrLowRaw[i] = up - dev;
    } else {
      if (!isNaN(prevTrend) && prevTrend !== 1) {
        down = isNaN(upPrev) ? up : upPrev;
        arrowDown[i] = down + atr2;
      } else {
        down = isNaN(downPrev) ? minHighPrice : Math.min(minHighPrice, downPrev);
      }
      atrHighRaw[i] = down + dev;
      atrLowRaw[i] = down - dev;
    }
    trendArr[i] = trend;
    upArr[i] = up;
    downArr[i] = down;
    htRaw[i] = trend === 0 ? up : down;
  }

  // HMA smoothing
  const htFluid = A(ta.hma(S(htRaw), cfg.smoothLen));
  const atrHighFluid = A(ta.hma(S(atrHighRaw), cfg.smoothLen));
  const atrLowFluid = A(ta.hma(S(atrLowRaw), cfg.smoothLen));

  const bearRibbon = String(color.new(colorBear, 50));
  const bullRibbon = String(color.new(colorBull, 50));
  const bearFill = String(color.new(colorBear, 80));
  const bullFill = String(color.new(colorBull, 80));
  const showUpper = (i: number) => trendArr[i] === 1 && cfg.showChannels;
  const showLower = (i: number) => trendArr[i] === 0 && cfg.showChannels;

  const markers: MarkerData[] = [];
  const buyFlags: boolean[] = new Array(n).fill(false);
  const sellFlags: boolean[] = new Array(n).fill(false);
  for (let i = 1; i < n; i++) {
    const t = bars[i].time;
    const validBuy = !isNaN(arrowUp[i]) && trendArr[i] === 0 && trendArr[i - 1] === 1;
    const validSell = !isNaN(arrowDown[i]) && trendArr[i] === 1 && trendArr[i - 1] === 0;
    buyFlags[i] = validBuy;
    sellFlags[i] = validSell;
    const lo = atrLowFluid[i];
    const hi = atrHighFluid[i];
    // plotshape(showArrows and validBuy ? atrLowFluid : na, style = shape.triangleup, location = location.absolute,
    //   size = size.small, color = colorBull)
    if (cfg.showArrows && validBuy && !isNaN(lo)) {
      markers.push({ time: t, position: 'atPriceMiddle', price: lo, shape: 'triangleUp', color: colorBull, size: 'small' });
    }
    if (cfg.showArrows && validSell && !isNaN(hi)) {
      markers.push({ time: t, position: 'atPriceMiddle', price: hi, shape: 'triangleDown', color: colorBear, size: 'small' });
    }
    // plotshape(showLabels and validBuy ? atrLowFluid : na, text = 'BUY', style = shape.labelup,
    //   location = location.absolute, size = size.small, color = colorBull, textcolor = color.black)
    if (cfg.showLabels && validBuy && !isNaN(lo)) {
      markers.push({ time: t, position: 'atPriceBottom', price: lo, shape: 'labelUp', color: colorBull, text: 'BUY',
        textColor: color.black, size: 'small' });
    }
    if (cfg.showLabels && validSell && !isNaN(hi)) {
      markers.push({ time: t, position: 'atPriceTop', price: hi, shape: 'labelDown', color: colorBear, text: 'SELL',
        textColor: color.black, size: 'small' });
    }
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {
      plot0: bars.map((b, i) => ({ time: b.time, value: htFluid[i], color: trendArr[i] === 0 ? colorBull : colorBear })),
      plot1: bars.map((b, i) => ({ time: b.time, value: showUpper(i) ? atrHighFluid[i] : NaN, color: bearRibbon })),
      plot2: bars.map((b, i) => ({ time: b.time, value: showLower(i) ? atrLowFluid[i] : NaN, color: bullRibbon })),
    },
    fills: [
      // fill(htPlot, atrHighPlot, color = showUpper ? color.new(colorBear, 80) : na)
      { plot1: 'plot0', plot2: 'plot1', options: { title: 'Bearish Ribbon Fill' },
        colors: bars.map((_b, i) => (showUpper(i) ? bearFill : 'transparent')) },
      // fill(htPlot, atrLowPlot, color = showLower ? color.new(colorBull, 80) : na)
      { plot1: 'plot0', plot2: 'plot2', options: { title: 'Bullish Ribbon Fill' },
        colors: bars.map((_b, i) => (showLower(i) ? bullFill : 'transparent')) },
    ],
    markers,
    // alertcondition(validBuy, 'TP Fluid Buy') / alertcondition(validSell, 'TP Fluid Sell')
    alerts: alertStates(alertConditions, bars, [buyFlags, sellFlags]),
  };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'TP Fluid Buy', message: 'Fluid Buy, {{exchange}}:{{ticker}}' },
  { id: 'alert1', title: 'TP Fluid Sell', message: 'Fluid Sell, {{exchange}}:{{ticker}}' },
];

export const TradePrimeFluidTrendIndicator = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  alertConditions,
};
