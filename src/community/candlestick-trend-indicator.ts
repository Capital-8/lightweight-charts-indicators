/**
 * Candlestick Trend Indicator v0.5 by JustUncleL
 *
 * A trend line (Hull moving average by default, ten types) coloured by its direction, five-bar fractals with their
 * last high / low as support and resistance levels, and candle patterns that support the trend: directional pin
 * bars, Dark Cloud Cover, Piercing Line, Harami, Engulfing and (optional) crosses of the fractal levels, each drawn
 * as an arrow with its name. Optional price action bars (reversal pin bars, shaved bars, inside and outside bars)
 * colour the candles. A pattern in the direction of the trend line that the MACD direction confirms colours its
 * candle (maroon for down, lime for up) and gives a dot at the bottom of the chart once the bar is closed.
 *
 * Reference: "Candlestick Trend Indicator v0.5 by JustUncleL" by JustUncleL
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 */

import {
  ta, compare, color, Series, getSourceSeries, type IndicatorResult, type InputConfig, type PlotConfig, type Bar, type SourceType,
} from 'oakscriptjs';
import type { MarkerData, BarColorData } from '../types';

export interface CandlestickTrendIndicatorInputs {
  /** Fast MA Type: SMA, EMA, WMA, VWMA, SMMA, DEMA, TEMA, HullMA, TMA, ZEMA (case sensitive; another text gives the SMA) */
  matype: string;
  /** Moving Average Length */
  malength: number;
  /** Moving average Source */
  src: SourceType;
  hidefractals: boolean;
  hidelevels: boolean;
  /** Use Fractal S/R Cross Patterns */
  ufb: boolean;
  /** Use Dark Cloud Cover Patterns */
  udc: boolean;
  /** Use Piecing Line Patterns */
  upl: boolean;
  /** Use Engulfing Candle Patterns */
  ube: boolean;
  /** Use Harami Candle Patterns */
  ubh: boolean;
  /** Use Defined PinBar Patterns */
  upb: boolean;
  /** Directional PBars, % of Range of Candle the Long Wick Has To Be */
  pctP: number;
  /** Use CM Price Action Reversal Pin Bars */
  urpb: boolean;
  /** Use CM Price Action Shaved Bars */
  usb: boolean;
  /** Use CM Price Action Outside Bars */
  uob: boolean;
  /** Use CM Price Action Inside Bars */
  uib: boolean;
  /** CM Reversal PBars, % of Range of Candle the Long Wick Has To Be */
  pctRP: number;
  /** CM Shaved Bars, % of Range it Has To Close On The Lows or Highs */
  pctS: number;
  /** CM Reversal Pin Bar Lookback Length */
  pblb: number;
  /** Alert Only Patterns Following Trend */
  stnd: boolean;
  /** Alert Only Patterns Confirmed by MACD */
  umacd: boolean;
  /** MACD Fast MA Length */
  fastMA: number;
  /** MACD Slow MA Length */
  slowMA: number;
  /** MACD Signal Length */
  signal: number;
  /** Check Box To Turn Bars Gray */
  sgb: boolean;
  /** Show Alert condition Dot */
  salc: boolean;
}

export const defaultInputs: CandlestickTrendIndicatorInputs = {
  matype: 'HullMA',
  malength: 20,
  src: 'close',
  hidefractals: false,
  hidelevels: false,
  ufb: false,
  udc: true,
  upl: true,
  ube: true,
  ubh: true,
  upb: true,
  pctP: 66,
  urpb: false,
  usb: false,
  uob: false,
  uib: false,
  pctRP: 72,
  pctS: 5,
  pblb: 6,
  stnd: true,
  umacd: true,
  fastMA: 12,
  slowMA: 26,
  signal: 9,
  sgb: false,
  salc: true,
};

export const inputConfig: InputConfig[] = [
  {
    id: 'matype', type: 'string', defval: 'HullMA',
    title: 'Fast MA Type: SMA, EMA, WMA, VWMA, SMMA, DEMA, TEMA, HullMA, TMA, ZEMA ( case sensitive )',
  },
  { id: 'malength', type: 'int', title: 'Moving Average Length', defval: 20, min: 1 },
  { id: 'src', type: 'source', title: 'Moving average Source', defval: 'close' },
  { id: 'hidefractals', type: 'bool', title: 'hidefractals', defval: false },
  { id: 'hidelevels', type: 'bool', title: 'hidelevels', defval: false },
  { id: 'ufb', type: 'bool', title: 'Use Fractal S/R Cross Patterns', defval: false },
  { id: 'udc', type: 'bool', title: 'Use Dark Cloud Cover Patterns', defval: true },
  { id: 'upl', type: 'bool', title: 'Use Piecing Line Patterns', defval: true },
  { id: 'ube', type: 'bool', title: 'Use Engulfing Candle Patterns', defval: true },
  { id: 'ubh', type: 'bool', title: 'Use Harami Candle Patterns', defval: true },
  { id: 'upb', type: 'bool', title: 'Use Defined PinBar Patterns', defval: true },
  { id: 'pctP', type: 'int', title: 'Directional PBars, % of Range of Candle the Long Wick Has To Be', defval: 66, min: 1, max: 99 },
  { id: 'urpb', type: 'bool', title: 'Use CM Price Action Reversal Pin Bars', defval: false },
  { id: 'usb', type: 'bool', title: 'Use CM Price Action Shaved Bars', defval: false },
  { id: 'uob', type: 'bool', title: 'Use CM Price Action Outside Bars', defval: false },
  { id: 'uib', type: 'bool', title: 'Use CM Price Action Inside Bars', defval: false },
  { id: 'pctRP', type: 'int', title: 'CM Reversal PBars, % of Range of Candle the Long Wick Has To Be', defval: 72, min: 1, max: 99 },
  { id: 'pctS', type: 'int', title: 'CM Shaved Bars, % of Range it Has To Close On The Lows or Highs', defval: 5, min: 1, max: 99 },
  { id: 'pblb', type: 'int', title: 'CM Reversal Pin Bar Lookback Length', defval: 6, min: 1 },
  { id: 'stnd', type: 'bool', title: 'Alert Only Patterns Following Trend', defval: true },
  { id: 'umacd', type: 'bool', title: 'Alert Only Patterns Confirmed by MACD', defval: true },
  { id: 'fastMA', type: 'int', title: 'MACD Fast MA Length', defval: 12, min: 2 },
  { id: 'slowMA', type: 'int', title: 'MACD Slow MA Length', defval: 26, min: 7 },
  { id: 'signal', type: 'int', title: 'MACD Signal Length', defval: 9, min: 1 },
  { id: 'sgb', type: 'bool', title: 'Check Box To Turn Bars Gray', defval: false },
  { id: 'salc', type: 'bool', title: 'Show Alert condition Dot', defval: true },
];

// Colours of the original Pine version
const GREEN = '#008000';
const RED = '#FF0000';
const FUCHSIA = '#FF00FF';
const AQUA = '#00FFFF';
const YELLOW = '#FFFF00';
const ORANGE = '#FF7F00';
const MAROON = '#800000';
const LIME = '#00FF00';
const GRAY = '#808080';
/** A plotshape without `transp` is drawn with a transparency of 35 in this Pine version */
const SHAPE_RED = String(color.new(RED, 35));
const SHAPE_GREEN = String(color.new(GREEN, 35));
/** Pine plotshape default text colour */
const TEXT_COLOR = '#2962FF';

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Moving Average', color: GREEN, lineWidth: 4 },
  { id: 'plot1', title: 'Top Fractal Level', color: GREEN, lineWidth: 2 },
  { id: 'plot2', title: 'Bottom Fractal Level', color: RED, lineWidth: 2 },
];

export const metadata = {
  title: 'Candlestick Trend Indicator v0.5 by JustUncleL',
  shortTitle: 'CDLTRD v0.5 by JustUncleL',
  overlay: true,
};

const { gt, lt, ge, le, ne } = compare;

export function calculate(
  bars: Bar[],
  inputs: Partial<CandlestickTrendIndicatorInputs> = {},
): IndicatorResult & { markers: MarkerData[]; barColors: BarColorData[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const S = (a: number[]) => Series.fromArray(bars, a);
  const closeSeries = new Series(bars, (b) => b.close);

  // variant(type, src, len): every average is computed on every bar, the type picks one
  const variant = (type: string, src: Series, len: number): number[] => {
    const srcArr = A(src);
    const v1 = ta.sma(src, len);
    const v2 = ta.ema(src, len);
    const pick = (): Series | number[] => {
      switch (type) {
        case 'EMA': return v2;
        case 'WMA': return ta.wma(src, len);
        case 'VWMA': return ta.vwma(src, len, new Series(bars, (b) => b.volume ?? NaN));
        case 'SMMA': {
          // v5 = na(v5[1]) ? sma(src, len) : (v5[1] * (len - 1) + src) / len
          const sma = A(v1);
          const v5: number[] = new Array(n);
          for (let i = 0; i < n; i++) {
            const prev = i > 0 ? v5[i - 1] : NaN;
            v5[i] = isNaN(prev) ? sma[i] : (prev * (len - 1) + srcArr[i]) / len;
          }
          return v5;
        }
        case 'DEMA': return v2.mul(2).sub(ta.ema(v2, len));
        case 'TEMA': {
          const e2 = ta.ema(v2, len);
          return v2.sub(e2).mul(3).add(ta.ema(e2, len));
        }
        case 'HullMA':
          // wma(2 * wma(src, len / 2) - wma(src, len), round(sqrt(len))): len / 2 is an integer division
          return ta.wma(ta.wma(src, Math.trunc(len / 2)).mul(2).sub(ta.wma(src, len)), Math.round(Math.sqrt(len)));
        case 'ZEMA': {
          const ema2 = ta.ema(v2, len);
          return v2.add(v2.sub(ema2));
        }
        case 'TMA': return ta.sma(v1, len);
        default: return v1;
      }
    };
    const out = pick();
    return Array.isArray(out) ? out : A(out);
  };

  const zlema = variant(cfg.matype, getSourceSeries(bars, cfg.src), cfg.malength);

  // MACD of close and of close[1]
  const [currMacdS] = ta.macd(closeSeries, cfg.fastMA, cfg.slowMA, cfg.signal);
  const [prevMacdS] = ta.macd(S(bars.map((_b, i) => (i > 0 ? bars[i - 1].close : NaN))), cfg.fastMA, cfg.slowMA, cfg.signal);
  const currMacd = A(currMacdS);
  const prevMacd = A(prevMacdS);

  const lowestLow = A(ta.lowest(new Series(bars, (b) => b.low), cfg.pblb));
  const highestHigh = A(ta.highest(new Series(bars, (b) => b.high), cfg.pblb));

  const pctCp = cfg.pctP * 0.01;
  const pctCs = cfg.pctS * 0.01;
  const pctCRp = cfg.pctRP * 0.01;
  const pctCRPO = 1 - pctCRp;

  const H = (i: number) => (i >= 0 ? bars[i].high : NaN);
  const L = (i: number) => (i >= 0 ? bars[i].low : NaN);
  const O = (i: number) => (i >= 0 ? bars[i].open : NaN);
  const C = (i: number) => (i >= 0 ? bars[i].close : NaN);

  const topfractals: number[] = new Array(n);
  const botfractals: number[] = new Array(n);
  const topLevelColors: Array<string | undefined> = new Array(n);
  const botLevelColors: Array<string | undefined> = new Array(n);
  const maColors: string[] = new Array(n);
  const markers: MarkerData[] = [];
  const barColors: BarColorData[] = [];
  const barAlert: boolean[] = new Array(n);
  const barAlertDn: boolean[] = new Array(n);

  // id: shape<k> of the k-th plotshape of the original
  const arrowDown = (id: string, i: number, on: boolean, text: string) => {
    if (on) markers.push({ id, time: bars[i].time, position: 'aboveBar', shape: 'arrowDown', color: SHAPE_RED, text, textColor: TEXT_COLOR });
  };
  const arrowUp = (id: string, i: number, on: boolean, text: string) => {
    if (on) markers.push({ id, time: bars[i].time, position: 'belowBar', shape: 'arrowUp', color: SHAPE_GREEN, text, textColor: TEXT_COLOR });
  };

  for (let i = 0; i < n; i++) {
    const open = O(i);
    const high = H(i);
    const low = L(i);
    const close = C(i);
    const zPrev = i > 0 ? zlema[i - 1] : NaN;
    const up = gt(zlema[i], zPrev);
    const down = lt(zlema[i], zPrev);
    maColors[i] = up ? GREEN : RED;

    // Fractals
    const topfractal = gt(H(i - 2), H(i - 1)) && gt(H(i - 2), high) && gt(H(i - 2), H(i - 3)) && gt(H(i - 2), H(i - 4));
    const botfractal = lt(L(i - 2), L(i - 1)) && lt(L(i - 2), low) && lt(L(i - 2), L(i - 3)) && lt(L(i - 2), L(i - 4));
    // plotshape(hidefractals ? na : topfractal, ..., offset = -2): drawn two bars back
    if (!cfg.hidefractals && topfractal) {
      markers.push({ id: 'shape0', time: bars[i - 2].time, position: 'aboveBar', shape: 'triangleUp', color: GREEN, size: 'tiny' });
    }
    if (!cfg.hidefractals && botfractal) {
      markers.push({ id: 'shape1', time: bars[i - 2].time, position: 'belowBar', shape: 'triangleDown', color: RED, size: 'tiny' });
    }
    const topPrev = i > 0 ? topfractals[i - 1] : NaN;
    const botPrev = i > 0 ? botfractals[i - 1] : NaN;
    topfractals[i] = topfractal ? H(i - 2) : topPrev;
    botfractals[i] = botfractal ? L(i - 2) : botPrev;
    // the level is not drawn on the bar where it changes
    topLevelColors[i] = ne(topfractals[i], topPrev) ? undefined : GREEN;
    botLevelColors[i] = ne(botfractals[i], botPrev) ? undefined : RED;

    // MACD direction: green or red
    const macdGreen = gt(currMacd[i], 0) ? gt(currMacd[i], prevMacd[i]) : !lt(currMacd[i], prevMacd[i]);
    const sbarUp = (!cfg.umacd || macdGreen) && (!cfg.stnd || up);
    const sbarDn = (!cfg.umacd || !macdGreen) && (!cfg.stnd || down);

    const range = high - low;
    // Reversal pin bars
    const pBarRUp = cfg.urpb && gt(open, high - range * pctCRPO) && gt(close, high - range * pctCRPO) && le(low, lowestLow[i]);
    const pBarRDn = cfg.urpb && lt(open, high - range * pctCRp) && lt(close, high - range * pctCRp) && ge(high, highestHigh[i]);
    // Shaved bars
    const sBarUp = cfg.usb && ge(close, high - range * pctCs);
    const sBarDown = cfg.usb && le(close, low + range * pctCs);
    // Inside and outside bars
    const inside = lt(high, H(i - 1)) && gt(low, L(i - 1));
    const outside = gt(high, H(i - 1)) && lt(low, L(i - 1));
    const insideBar = cfg.uib && inside;
    const outsideBar = cfg.uob && outside;

    // Pin bars with a long upper shadow (selling pressure) / a long lower shadow (buying pressure)
    const pBarDn = cfg.upb && lt(open, high - range * pctCp) && lt(close, high - range * pctCp);
    arrowDown('shape2', i, pBarDn && !pBarRUp && !pBarRDn, 'Bearish\nPinBar');
    const pBarUp = cfg.upb && gt(open, low + range * pctCp) && gt(close, low + range * pctCp);
    arrowUp('shape3', i, pBarUp && !pBarRUp && !pBarRDn, 'Bullish\nPinBar');

    const o1 = O(i - 1);
    const c1 = C(i - 1);
    const range1 = H(i - 1) - L(i - 1);
    const dcc = cfg.udc && gt(c1, o1) && ge(Math.abs(c1 - o1) / range1, 0.7) && lt(close, open)
      && ge(Math.abs(close - open) / range, 0.7) && ge(open, c1) && gt(close, o1) && lt(close, (o1 + c1) / 2);
    arrowDown('shape4', i, dcc, 'DarkCloud\nCover');

    const pln = cfg.upl && lt(c1, o1) && ge(Math.abs(o1 - c1) / range1, 0.7) && gt(close, open)
      && ge(Math.abs(close - open) / range, 0.7) && le(open, c1) && lt(close, o1) && gt(close, (o1 + c1) / 2);
    arrowUp('shape5', i, pln, 'Piercing\nLine');

    const beh = cfg.ubh && gt(c1, o1) && gt(open, close) && le(open, c1) && ge(low, o1) && lt(open - close, c1 - o1) && inside;
    arrowDown('shape6', i, beh && !dcc, 'Bear\nHarami');

    const blh = cfg.ubh && gt(o1, c1) && gt(close, open) && le(close, o1) && le(high, o1) && lt(close - open, o1 - c1) && inside;
    arrowUp('shape7', i, blh && !pln, 'Bull\nHarami');

    const bee = cfg.ube && gt(c1, o1) && lt(close, open) && le(close, L(i - 1)) && ge(open, c1);
    arrowDown('shape8', i, bee, 'Bearish\nEngulf');

    const ble = cfg.ube && lt(c1, o1) && gt(close, open) && ge(close, H(i - 1)) && le(open, c1);
    arrowUp('shape9', i, ble, 'Bullish\nEngulf');

    // crossover / crossunder of the close and the fractal levels (exact comparisons)
    const blfr = cfg.ufb && i > 0 && close > topfractals[i] && c1 <= topPrev;
    arrowUp('shape10', i, blfr && !ble && !blh && !sBarUp, 'Fractal\nCross');
    const befr = cfg.ufb && i > 0 && close < botfractals[i] && c1 >= botPrev;
    arrowDown('shape11', i, befr && !bee && !beh && !sBarDown, 'Fractal\nCross');

    const bcolorDn = sbarDn && !(pBarRDn || pBarRUp || sBarDown || insideBar || outsideBar) && (beh || bee || dcc || befr || pBarDn);
    const bcolorUp = sbarUp && !(pBarRDn || pBarRUp || sBarUp || insideBar || outsideBar) && (blh || ble || pln || blfr || pBarUp);

    // barcolor calls in the order of the script: the last colour that is not na is drawn (id: barcolor<k> of that call)
    const barcolorCalls: Array<[boolean, string]> = [
      [pBarRUp, GREEN], [pBarRDn, RED], [sBarDown, FUCHSIA], [sBarUp, AQUA], [insideBar, YELLOW], [outsideBar, ORANGE],
      [bcolorDn, MAROON], [bcolorUp, LIME], [cfg.sgb && !isNaN(close) && close !== 0, GRAY],
    ];
    let barColorCall = -1;
    barcolorCalls.forEach(([on], k) => {
      if (on) barColorCall = k;
    });
    if (barColorCall >= 0) {
      barColors.push({ id: `barcolor${barColorCall}`, time: bars[i].time, color: barcolorCalls[barColorCall][1] });
    }

    barAlertDn[i] = (sbarDn && (befr || bee || beh || pBarDn || dcc)) || (sbarDn && (insideBar || outsideBar || sBarDown)) || pBarRDn;
    const barAlertUp = (sbarUp && (blfr || ble || blh || pBarUp || pln)) || (sbarUp && (insideBar || outsideBar || sBarUp)) || pBarRUp;
    barAlert[i] = barAlertDn[i] || barAlertUp;
    // plotshape(salc and barAlert[1], location.bottom, color = barAlertDn[1] ? red : green, offset = -1):
    // a dot under the bar of the alert once that bar is closed
    if (cfg.salc && i > 0 && barAlert[i - 1]) {
      markers.push({ id: 'shape12', time: bars[i - 1].time, position: 'bottom', shape: 'circle', color: barAlertDn[i - 1] ? RED : GREEN });
    }
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {
      plot0: bars.map((b, i) => ({ time: b.time, value: zlema[i], color: maColors[i] })),
      plot1: bars.map((b, i) => ({ time: b.time, value: cfg.hidelevels ? NaN : topfractals[i], color: topLevelColors[i] ?? 'transparent' })),
      plot2: bars.map((b, i) => ({ time: b.time, value: cfg.hidelevels ? NaN : botfractals[i], color: botLevelColors[i] ?? 'transparent' })),
    },
    markers,
    barColors,
  };
}

export const CandlestickTrendIndicator = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
};
