/**
 * Faraz Perfect Structure Scalper + Long Short
 *
 * Structure levels: the structure low is the low of the last pivot low (lowest low of 50 bars before the first
 * pivot), the structure high the high of the last pivot high; stop levels are these levels minus / plus a buffer.
 * The breakout / breakdown levels are the highest high / lowest low of the previous `lookbackBreakout` bars.
 * Base Long: close above the breakout level and the structure low, RSI above the long trigger and (optionally) a
 * rising MACD histogram; Base Short is the mirror. Perfect Long (XL) adds a close above the structure high, RSI at
 * or above the perfect minimum and rising, a 200 EMA rising more than the minimum slope over the lookback and a
 * close above it (bar coloured green); Perfect Short (XS) is the mirror (bar coloured red). The background is
 * orange when the close is between a structure level and the breakout / breakdown level (no-add zone). A scalp
 * engine gives Buy / Sell Scalp signals on crossings of a MACD (EMA fast - EMA slow) with its SMA signal, confirmed
 * by the direction of a TEMA.
 * Alerts (alertcondition, `alerts` of the result): XL Long / XS Short, Base Long / Short and Buy / Sell Scalp, true
 * on the bars of these signals.
 *
 * Reference: "Faraz Perfect Structure Scalper + Long Short (Indicator Alerts)" by fsaleem03
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 */

import { ta, Series, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { MarkerData, BarColorData, BgColorData } from '../types';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

export interface FarazPerfectStructureScalperLongShortInputs {
  /** Swing pivot length (both sides) */
  pivotLen: number;
  /** Breakout / breakdown lookback */
  lookbackBreakout: number;
  /** RSI length */
  rsiLen: number;
  /** Base RSI long trigger */
  rsiLongTrig: number;
  /** Base RSI short trigger */
  rsiShortTrig: number;
  /** Perfect long RSI minimum */
  rsiPerfectLong: number;
  /** Perfect short RSI maximum */
  rsiPerfectShort: number;
  /** Use the MACD histogram filter */
  useMACD: boolean;
  /** Stop buffer (points) */
  riskBufferPts: number;
  /** Trend EMA length */
  emaLenTrend: number;
  /** Trend slope lookback bars */
  trendLookback: number;
  /** Minimum EMA slope (points) */
  minSlopePts: number;
  /** Scalp TEMA length */
  itgLen: number;
  /** Scalp fast EMA length */
  itgFastLength: number;
  /** Scalp slow EMA length */
  itgSlowLength: number;
  /** Scalp signal SMA length */
  itgSignalLength: number;
  /** Show the scalp TEMA line */
  showItgTema: boolean;
}

export const defaultInputs: FarazPerfectStructureScalperLongShortInputs = {
  pivotLen: 5,
  lookbackBreakout: 10,
  rsiLen: 14,
  rsiLongTrig: 40.0,
  rsiShortTrig: 60.0,
  rsiPerfectLong: 50.0,
  rsiPerfectShort: 50.0,
  useMACD: true,
  riskBufferPts: 5.0,
  emaLenTrend: 200,
  trendLookback: 10,
  minSlopePts: 5.0,
  itgLen: 14,
  itgFastLength: 12,
  itgSlowLength: 26,
  itgSignalLength: 9,
  showItgTema: true,
};

export const inputConfig: InputConfig[] = [
  { id: 'pivotLen', type: 'int', title: 'Swing Pivot Length (both sides)', defval: 5, min: 2 },
  { id: 'lookbackBreakout', type: 'int', title: 'Breakout / Breakdown Lookback', defval: 10, min: 3 },
  { id: 'rsiLen', type: 'int', title: 'RSI Length', defval: 14 },
  { id: 'rsiLongTrig', type: 'float', title: 'Base RSI Long Trigger', defval: 40.0, min: 5, max: 95 },
  { id: 'rsiShortTrig', type: 'float', title: 'Base RSI Short Trigger', defval: 60.0, min: 5, max: 95 },
  { id: 'rsiPerfectLong', type: 'float', title: 'Perfect Long RSI Min', defval: 50.0, min: 5, max: 95 },
  { id: 'rsiPerfectShort', type: 'float', title: 'Perfect Short RSI Max', defval: 50.0, min: 5, max: 95 },
  { id: 'useMACD', type: 'bool', title: 'Use MACD filter?', defval: true },
  { id: 'riskBufferPts', type: 'float', title: 'Stop buffer (points)', defval: 5.0 },
  { id: 'emaLenTrend', type: 'int', title: 'Trend EMA length', defval: 200, min: 20 },
  { id: 'trendLookback', type: 'int', title: 'Trend slope lookback bars', defval: 10, min: 1 },
  { id: 'minSlopePts', type: 'float', title: 'Min EMA slope (points)', defval: 5.0, min: 0.0 },
  { id: 'itgLen', type: 'int', title: 'Scalp TEMA length', defval: 14, min: 1, group: 'Scalp Engine (ITG)' },
  { id: 'itgFastLength', type: 'int', title: 'Scalp fast EMA length', defval: 12, min: 1, group: 'Scalp Engine (ITG)' },
  { id: 'itgSlowLength', type: 'int', title: 'Scalp slow EMA length', defval: 26, min: 1, group: 'Scalp Engine (ITG)' },
  { id: 'itgSignalLength', type: 'int', title: 'Scalp signal SMA length', defval: 9, min: 1, group: 'Scalp Engine (ITG)' },
  { id: 'showItgTema', type: 'bool', title: 'Show scalp TEMA line', defval: true, group: 'Scalp Engine (ITG)' },
];

const RED = String(color.new(color.red, 0));
const RED_60 = String(color.new(color.red, 60));
const LIME = String(color.new(color.lime, 0));
const BLUE = String(color.new(color.blue, 0));
const BLUE_60 = String(color.new(color.blue, 60));
const ORANGE = String(color.new(color.orange, 0));
const BLUE_40 = String(color.new(color.blue, 40));
const GREEN = String(color.new(color.green, 0));
const BG_NO_ADD = String(color.new(color.orange, 88));

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Structure Low (Red)', color: RED, lineWidth: 2, style: 'linebr' },
  { id: 'plot1', title: 'Long Stop Level', color: RED_60, lineWidth: 1, style: 'linebr' },
  { id: 'plot2', title: 'Long Breakout (Green)', color: LIME, lineWidth: 2, style: 'linebr' },
  { id: 'plot3', title: 'Structure High (Blue)', color: BLUE, lineWidth: 2, style: 'linebr' },
  { id: 'plot4', title: 'Short Stop Level', color: BLUE_60, lineWidth: 1, style: 'linebr' },
  { id: 'plot5', title: 'Short Breakdown (Orange)', color: ORANGE, lineWidth: 2, style: 'linebr' },
  { id: 'plot6', title: 'Scalp TEMA', color: BLUE_40, lineWidth: 2 },
];

export const metadata = {
  title: 'Faraz Perfect Structure XL / XS (Indicator Alerts)',
  shortTitle: 'Faraz Perfect Structure XL / XS (Indicator Alerts)',
  overlay: true,
};

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const ge = (a: number, b: number) => !Number.isNaN(a) && !Number.isNaN(b) && !(b - a > EPS);
const le = (a: number, b: number) => ge(b, a);

export function calculate(
  bars: Bar[],
  inputs: Partial<FarazPerfectStructureScalperLongShortInputs> = {},
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[]; barColors: BarColorData[]; bgColors: BgColorData[] }
  & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const S = (a: number[]) => Series.fromArray(bars, a);
  const close = S(bars.map((b) => b.close));
  const high = S(bars.map((b) => b.high));
  const low = S(bars.map((b) => b.low));
  const pl = cfg.pivotLen;
  const prev = (a: number[], i: number, k = 1) => (i - k >= 0 ? a[i - k] : NaN);

  // Structure levels
  const lowArr = bars.map((b) => b.low);
  const highArr = bars.map((b) => b.high);
  const lowLb = lowArr.map((_v, i) => prev(lowArr, i, pl)); // low[pivotLen]
  const highLb = highArr.map((_v, i) => prev(highArr, i, pl)); // high[pivotLen]
  const pivotLow = A(ta.pivotlow(low, pl, pl));
  const pivotHigh = A(ta.pivothigh(high, pl, pl));
  const pivotLowPrice = A(ta.valuewhen(S(pivotLow.map((v) => (Number.isNaN(v) ? 0 : 1))), S(lowLb), 0));
  const pivotHighPrice = A(ta.valuewhen(S(pivotHigh.map((v) => (Number.isNaN(v) ? 0 : 1))), S(highLb), 0));
  const lowest50 = A(ta.lowest(low, 50));
  const highest50 = A(ta.highest(high, 50));
  const structLow = pivotLowPrice.map((v, i) => (Number.isNaN(v) ? lowest50[i] : v));
  const structHigh = pivotHighPrice.map((v, i) => (Number.isNaN(v) ? highest50[i] : v));
  const longStopLevel = structLow.map((v) => v - cfg.riskBufferPts);
  const shortStopLevel = structHigh.map((v) => v + cfg.riskBufferPts);

  // Breakout / breakdown levels of the previous bars ([1])
  const hiBo = A(ta.highest(high, cfg.lookbackBreakout));
  const loBd = A(ta.lowest(low, cfg.lookbackBreakout));
  const breakoutLvl = hiBo.map((_v, i) => prev(hiBo, i));
  const breakdownLvl = loBd.map((_v, i) => prev(loBd, i));

  // Momentum filters
  const rsi = A(ta.rsi(close, cfg.rsiLen));
  const [, , macdHistS] = ta.macd(close, 12, 26, 9);
  const macdHist = A(macdHistS);

  // Trend filter
  const emaTrend = A(ta.ema(close, cfg.emaLenTrend));

  // Scalp engine: TEMA and MACD-style filter
  const ema1 = ta.ema(close, cfg.itgLen);
  const ema2 = ta.ema(ema1, cfg.itgLen);
  const ema3 = ta.ema(ema2, cfg.itgLen);
  const e1 = A(ema1);
  const e2 = A(ema2);
  const e3 = A(ema3);
  const itgTema = e1.map((v, i) => 3.0 * (v - e2[i]) + e3[i]);
  const itgFast = A(ta.ema(close, cfg.itgFastLength));
  const itgSlow = A(ta.ema(close, cfg.itgSlowLength));
  const itgMacdS = S(itgFast.map((v, i) => v - itgSlow[i]));
  const itgSignalS = ta.sma(itgMacdS, cfg.itgSignalLength);
  const crossUp = A(ta.crossover(itgMacdS, itgSignalS));
  const crossDown = A(ta.crossunder(itgMacdS, itgSignalS));

  const markers: MarkerData[] = [];
  const barColors: BarColorData[] = [];
  const bgColors: BgColorData[] = [];
  const flags: boolean[][] = [[], [], [], [], [], []];
  for (let i = 0; i < n; i++) {
    const t = bars[i].time;
    const c = bars[i].close;
    const macdUp = gt(macdHist[i], prev(macdHist, i));
    const macdDown = lt(macdHist[i], prev(macdHist, i));
    const rsiUp = gt(rsi[i], prev(rsi, i));
    const rsiDown = lt(rsi[i], prev(rsi, i));

    // emaTrendPB = nz(emaTrend[trendLookback], emaTrend)
    const pb = prev(emaTrend, i, cfg.trendLookback);
    const emaTrendPB = Number.isNaN(pb) ? emaTrend[i] : pb;
    const emaSlope = emaTrend[i] - emaTrendPB;
    const upTrend = gt(emaTrend[i], emaTrendPB) && gt(emaSlope, cfg.minSlopePts);
    const downTrend = lt(emaTrend[i], emaTrendPB) && lt(emaSlope, -cfg.minSlopePts);

    const baseLong = gt(c, breakoutLvl[i]) && gt(c, structLow[i]) && gt(rsi[i], cfg.rsiLongTrig) && (!cfg.useMACD || macdUp);
    const baseShort = lt(c, breakdownLvl[i]) && lt(c, structHigh[i]) && lt(rsi[i], cfg.rsiShortTrig) && (!cfg.useMACD || macdDown);
    const trendLongOnly = gt(c, structHigh[i]) && gt(c, breakoutLvl[i]);
    const trendShortOnly = lt(c, structLow[i]) && lt(c, breakdownLvl[i]);
    const perfectLong = baseLong && trendLongOnly && ge(rsi[i], cfg.rsiPerfectLong) && rsiUp && upTrend && gt(c, emaTrend[i]);
    const perfectShort = baseShort && trendShortOnly && le(rsi[i], cfg.rsiPerfectShort) && rsiDown && downTrend && lt(c, emaTrend[i]);

    const buyScalp = crossUp[i] === 1 && gt(itgTema[i], prev(itgTema, i));
    const sellScalp = crossDown[i] === 1 && lt(itgTema[i], prev(itgTema, i));
    [perfectLong, perfectShort, baseLong, baseShort, buyScalp, sellScalp].forEach((f, k) => flags[k].push(f));

    // No-add zone background
    const longNoAddZone = gt(c, structLow[i]) && lt(c, breakoutLvl[i]);
    const shortNoAddZone = lt(c, structHigh[i]) && gt(c, breakdownLvl[i]);
    if (longNoAddZone || shortNoAddZone) bgColors.push({ time: t, color: BG_NO_ADD });

    // barcolor(perfectLong ? green : perfectShort ? red : na)
    if (perfectLong) barColors.push({ time: t, color: GREEN });
    else if (perfectShort) barColors.push({ time: t, color: RED });

    if (baseLong) {
      markers.push({ time: t, position: 'belowBar', shape: 'triangleUp', color: LIME, text: 'Long',
        textColor: String(color.rgb(6, 71, 247)), size: 'tiny' });
    }
    if (baseShort) {
      markers.push({ time: t, position: 'aboveBar', shape: 'triangleDown', color: RED, text: 'Short',
        textColor: String(color.rgb(18, 8, 1)), size: 'tiny' });
    }
    if (perfectLong) {
      markers.push({ time: t, position: 'belowBar', shape: 'labelUp', color: GREEN, text: 'XL',
        textColor: color.black, size: 'small' });
    }
    if (perfectShort) {
      markers.push({ time: t, position: 'aboveBar', shape: 'labelDown', color: RED, text: 'XS',
        textColor: String(color.rgb(118, 246, 6)), size: 'small' });
    }
    if (buyScalp) {
      markers.push({ time: t, position: 'belowBar', shape: 'triangleUp', color: '#4caf50', text: 'Buy\nScalp',
        textColor: String(color.rgb(81, 5, 246)), size: 'small' });
    }
    if (sellScalp) {
      markers.push({ time: t, position: 'aboveBar', shape: 'triangleDown', color: RED, text: 'Sell\nScalp',
        textColor: String(color.rgb(247, 9, 9)), size: 'small' });
    }
  }

  const P = (vals: number[], col: string) => bars.map((b, i) => ({
    time: b.time, value: Number.isFinite(vals[i]) ? vals[i] : NaN, color: col,
  }));
  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {
      plot0: P(structLow, RED),
      plot1: P(longStopLevel, RED_60),
      plot2: P(breakoutLvl, LIME),
      plot3: P(structHigh, BLUE),
      plot4: P(shortStopLevel, BLUE_60),
      plot5: P(breakdownLvl, ORANGE),
      plot6: P(cfg.showItgTema ? itgTema : itgTema.map(() => NaN), BLUE_40),
    },
    markers,
    barColors,
    bgColors,
    // alertcondition(perfectLong / perfectShort / baseLong / baseShort / buyScalp / sellScalp)
    alerts: alertStates(alertConditions, bars, flags),
  };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'Faraz XL Long Signal', message: 'Faraz Perfect Structure: XL LONG signal on {{ticker}} ({{interval}}).' },
  { id: 'alert1', title: 'Faraz XS Short Signal', message: 'Faraz Perfect Structure: XS SHORT signal on {{ticker}} ({{interval}}).' },
  { id: 'alert2', title: 'Faraz Base Long', message: 'Faraz Structure: Base LONG signal on {{ticker}} ({{interval}}).' },
  { id: 'alert3', title: 'Faraz Base Short', message: 'Faraz Structure: Base SHORT signal on {{ticker}} ({{interval}}).' },
  { id: 'alert4', title: 'Faraz Buy Scalp', message: 'Faraz ITG-style BUY SCALP on {{ticker}} ({{interval}}).' },
  { id: 'alert5', title: 'Faraz Sell Scalp', message: 'Faraz ITG-style SELL SCALP on {{ticker}} ({{interval}}).' },
];

export const FarazPerfectStructureScalperLongShort = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  alertConditions,
};
