/**
 * Pekipek's PPO Divergence BETA
 *
 * Percentage Price Oscillator smoothed with SMA, plus pivot-based divergence
 * detection including long-term divergences.
 *
 * PPO = ((EMA_fast - EMA_slow) / EMA_slow) * 100, then d = SMA(PPO, smoother).
 *
 * Display elements from Pine source:
 *  - plot(d)                      white line
 *  - plot(bulldiv) "Tops"         aqua circles at PPO bottoms (offset -1)
 *  - plot(beardiv) "Bottoms"      red circles at PPO tops (offset -1)
 *  - 8 divergence circle plots     orange (bearish) / purple (bullish): short term,
 *                                 delayed and long term, each its own plot as in the original
 *  - No markers and no level line: the original draws its signals as circle plots only
 *
 * Reference: "Pekipek's PPO Divergence BETA" by Pekipek
 */

import { ta, getSourceSeries, Series, type IndicatorResult, type InputConfig, type PlotConfig, type Bar, type SourceType } from 'oakscriptjs';

export interface PPODivergenceInputs {
  fastLength: number;
  slowLength: number;
  smoother: number;
  divLookbackPeriod: number;
  longTermDiv: boolean;
  src: SourceType;
}

export const defaultInputs: PPODivergenceInputs = {
  fastLength: 12,
  slowLength: 26,
  smoother: 2,
  divLookbackPeriod: 55,
  longTermDiv: true,
  src: 'close',
};

export const inputConfig: InputConfig[] = [
  { id: 'fastLength', type: 'int', title: 'Fast Length', defval: 12, min: 1 },
  { id: 'slowLength', type: 'int', title: 'Slow Length', defval: 26, min: 1 },
  { id: 'smoother', type: 'int', title: 'Smoother', defval: 2, min: 1 },
  { id: 'divLookbackPeriod', type: 'int', title: 'Lookback Period', defval: 55, min: 1 },
  { id: 'longTermDiv', type: 'bool', title: 'Use Long Term Divergences?', defval: true },
  { id: 'src', type: 'source', title: 'Source', defval: 'close' },
];

// Plot order and titles of the original (11 plots; 8 divergence circle plots)
export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Plot', color: '#FFFFFF', lineWidth: 1 },
  { id: 'plot1', title: 'Tops', color: '#00FFFF', lineWidth: 4, style: 'circles' },
  { id: 'plot2', title: 'Bottoms', color: '#FF0000', lineWidth: 4, style: 'circles' },
  { id: 'plot3', title: 'Bearish Divergence2', color: '#FF7F00', lineWidth: 4, style: 'circles' },
  { id: 'plot4', title: 'Bullish Divergence2', color: '#800080', lineWidth: 4, style: 'circles' },
  { id: 'plot5', title: 'Bullish Divergence2', color: '#800080', lineWidth: 4, style: 'circles' },
  { id: 'plot6', title: 'Bearish Divergence2', color: '#FF7F00', lineWidth: 4, style: 'circles' },
  { id: 'plot7', title: 'Bearish Divergence2', color: '#FF7F00', lineWidth: 4, style: 'circles' },
  { id: 'plot8', title: 'Bullish Divergence2', color: '#800080', lineWidth: 4, style: 'circles' },
  { id: 'plot9', title: 'Bearish Divergence2', color: '#FF7F00', lineWidth: 4, style: 'circles' },
  { id: 'plot10', title: 'Bullish Divergence2', color: '#800080', lineWidth: 4, style: 'circles' },
];

export const metadata = {
  title: 'PPO Divergence',
  shortTitle: 'PPODiv',
  overlay: false,
};

// --- Pine-equivalent helpers ---

/** barssince(cond): 0 on a bar where cond is true, na before the first true bar. */
function barssince(cond: boolean[]): number[] {
  const out: number[] = new Array(cond.length);
  let since = NaN;
  for (let i = 0; i < cond.length; i++) {
    if (cond[i]) since = 0;
    else if (!isNaN(since)) since++;
    out[i] = since;
  }
  return out;
}

/** valuewhen(cond, src, occurrence) as a series (0 = most recent true bar, the current one included). */
function valuewhen(cond: boolean[], src: number[], occurrence: number): number[] {
  const out: number[] = new Array(cond.length);
  const hits: number[] = [];
  for (let i = 0; i < cond.length; i++) {
    if (cond[i]) hits.push(i);
    const k = hits.length - 1 - occurrence;
    out[i] = k >= 0 ? src[hits[k]] : NaN;
  }
  return out;
}

/** a > b / a < b with na: false. */
const gt = (a: number, b: number): boolean => a > b;
const lt = (a: number, b: number): boolean => a < b;

export function calculate(bars: Bar[], inputs: Partial<PPODivergenceInputs> = {}): Omit<IndicatorResult, 'markers'> {
  const { fastLength, slowLength, smoother, divLookbackPeriod, longTermDiv, src } = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const source = getSourceSeries(bars, src);

  const emaFast = ta.ema(source, fastLength).toArray();
  const emaSlow = ta.ema(source, slowLength).toArray();

  // PPO = ((EMA_fast - EMA_slow) / EMA_slow) * 100
  const macd2Arr: number[] = new Array(n);
  for (let i = 0; i < n; i++) {
    const f = emaFast[i];
    const s = emaSlow[i];
    macd2Arr[i] = (f == null || s == null || s === 0) ? NaN : ((f - s) / s) * 100;
  }

  // d = SMA(PPO, smoother)
  const macd2Series = new Series(bars, (_b, i) => macd2Arr[i]);
  const dArr = ta.sma(macd2Series, smoother).toArray().map(v => v ?? NaN);

  const lowArr = bars.map(b => b.low);
  const highArr = bars.map(b => b.high);
  const at = (arr: number[], i: number): number => (i >= 0 ? arr[i] : NaN);
  const series = (arr: number[]) => new Series(bars, (_b, i) => arr[i]);
  const highestOf = (arr: number[], len: number) => ta.highest(series(arr), len).toArray().map(v => v ?? NaN);
  const lowestOf = (arr: number[], len: number) => ta.lowest(series(arr), len).toArray().map(v => v ?? NaN);

  // --- Price bottoms/tops (priceMins / priceMax; na comparisons are false) ---
  const priceMins: boolean[] = new Array(n);
  const priceMax: boolean[] = new Array(n);
  for (let i = 0; i < n; i++) {
    const L = (k: number) => at(lowArr, i - k);
    const H = (k: number) => at(highArr, i - k);
    priceMins[i] = (L(0) > L(1) && L(1) < L(2))
      || (L(1) === L(2) && L(1) < L(0) && L(1) < L(3))
      || (L(1) === L(2) && L(1) === L(3) && L(1) < L(0) && L(1) < L(4))
      || (L(1) === L(2) && L(1) === L(3) && L(1) !== 0 && L(1) === L(4) && L(1) < L(0) && L(1) < L(5));
    priceMax[i] = (H(0) < H(1) && H(1) > H(2))
      || (H(1) === H(2) && H(1) > H(0) && H(1) > H(3))
      || (H(1) === H(2) && H(1) === H(3) && H(1) > H(0) && H(1) > H(4))
      || (H(1) === H(2) && H(1) === H(3) && H(1) !== 0 && H(1) === H(4) && H(1) > H(0) && H(1) > H(5));
  }

  // --- Oscillator bottoms/tops ---
  const oscMins: boolean[] = new Array(n);
  const oscMax: boolean[] = new Array(n);
  for (let i = 0; i < n; i++) {
    oscMins[i] = gt(dArr[i], at(dArr, i - 1)) && lt(at(dArr, i - 1), at(dArr, i - 2));
    oscMax[i] = lt(dArr[i], at(dArr, i - 1)) && gt(at(dArr, i - 1), at(dArr, i - 2));
  }

  const d1 = dArr.map((_, i) => at(dArr, i - 1));
  const low1 = lowArr.map((_, i) => at(lowArr, i - 1));
  const high1 = highArr.map((_, i) => at(highArr, i - 1));

  const ct4 = valuewhen(oscMins, d1, 0);
  const ct5 = valuewhen(oscMax, d1, 0);
  const ct6 = valuewhen(priceMins, low1, 0);
  const ct7 = valuewhen(priceMax, high1, 0);

  const bsOscMins = barssince(oscMins);
  const bsOscMax = barssince(oscMax);
  const bsPriceMins = barssince(priceMins);
  const bsPriceMax = barssince(priceMax);

  // delayedlow / delayedhigh: price bottom/top within 3 bars of the oscillator one
  const delayedlow = lowArr.map((_, i) => (priceMins[i] && bsOscMins[i] < 3 ? low1[i] : NaN));
  const delayedhigh = highArr.map((_, i) => (priceMax[i] && bsOscMax[i] < 3 ? high1[i] : NaN));

  // filter / filter2: tops/bottoms in price less than 5 bars away
  const low6 = lowestOf(ct6, 4);
  const high7 = highestOf(ct7, 4);
  const filterArr = low6.map((v, i) => (bsPriceMins[i] < 5 ? v : NaN));
  const filter2Arr = high7.map((v, i) => (bsPriceMax[i] < 5 ? v : NaN));

  const y2 = valuewhen(oscMax, filter2Arr, 1);
  const y6 = valuewhen(oscMins, filterArr, 1);
  const longTermBullFilt = valuewhen(priceMins, lowestOf(lowArr, divLookbackPeriod), 1);
  const longTermBearFilt = valuewhen(priceMax, highestOf(highArr, divLookbackPeriod), 1);
  const y3 = valuewhen(oscMax, ct5, 0);
  const y4 = valuewhen(oscMax, ct5, 1);
  const y7 = valuewhen(oscMins, ct4, 0);
  const y8 = valuewhen(oscMins, ct4, 1);
  const y9 = valuewhen(oscMins, ct6, 0);
  const y10 = valuewhen(oscMax, ct7, 0);

  const highestD = highestOf(dArr, divLookbackPeriod);
  const lowestD = lowestOf(dArr, divLookbackPeriod);

  const cond: boolean[][] = Array.from({ length: 8 }, () => new Array(n).fill(false));
  for (let i = 0; i < n; i++) {
    const iBear = lt(ct5[i], highestD[i]);              // i  : long term bearish oscillator divergence
    const i2 = gt(y10[i], longTermBearFilt[i]);         // i2 : long term bearish top divergence
    const i3 = gt(delayedhigh[i], longTermBearFilt[i]); // i3 : long term bearish delayed high divergence
    const i4 = gt(ct4[i], lowestD[i]);                  // i4 : long term bullish oscillator divergence
    const i5 = lt(y9[i], longTermBullFilt[i]);          // i5 : long term bullish bottom divergence
    const i6 = lt(delayedlow[i], longTermBullFilt[i]);  // i6 : long term bullish delayed bottom divergence
    cond[0][i] = gt(y10[i], y2[i]) && oscMax[i] && lt(y3[i], y4[i]);
    cond[1][i] = lt(y9[i], y6[i]) && oscMins[i] && gt(y7[i], y8[i]);
    cond[2][i] = lt(delayedlow[i], y6[i]) && gt(y7[i], y8[i]);
    cond[3][i] = gt(delayedhigh[i], y2[i]) && lt(y3[i], y4[i]);
    cond[4][i] = longTermDiv && oscMax[i] && iBear && i2;
    cond[5][i] = longTermDiv && oscMins[i] && i4 && i5;
    cond[6][i] = longTermDiv && iBear && i3;
    cond[7][i] = longTermDiv && i4 && i6;
  }

  // plot(d); bulldiv / beardiv = d[1] at oscillator bottoms / tops, drawn with offset -1 (on the previous bar)
  const plot0 = bars.map((b, i) => ({ time: b.time, value: dArr[i] }));
  const plot1 = bars.map((b, i) => ({ time: b.time, value: i + 1 < n && oscMins[i + 1] ? d1[i + 1] : NaN }));
  const plot2 = bars.map((b, i) => ({ time: b.time, value: i + 1 < n && oscMax[i + 1] ? d1[i + 1] : NaN }));
  const divPlots = cond.map(c => bars.map((b, i) => ({ time: b.time, value: c[i] ? dArr[i] : NaN })));

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {
      'plot0': plot0,
      'plot1': plot1,
      'plot2': plot2,
      'plot3': divPlots[0],
      'plot4': divPlots[1],
      'plot5': divPlots[2],
      'plot6': divPlots[3],
      'plot7': divPlots[4],
      'plot8': divPlots[5],
      'plot9': divPlots[6],
      'plot10': divPlots[7],
    },
  };
}

export const PPODivergence = { calculate, metadata, defaultInputs, inputConfig, plotConfig };
