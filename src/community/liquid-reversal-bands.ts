/**
 * Uptrick: Liquid Reversal Bands
 *
 * Fair value = EMA(smoothness / 2) of 0.55 * EMA(fair length) + 0.45 * ALMA(fair length, 0.85, 6) of the source.
 * Band width = EMA(smoothness) of 0.60 * stdev(source - fair, lookback) + 0.25 * ATR(14)
 * + 0.10 * EMA(lookback) of |source - fair| + 0.05 * EMA(smoothness) of the bar range. Upper / lower bands are
 * fair +/- width * multiplier, the optional outer bands a further multiple. The fair value line is coloured on a
 * bear-to-bull scale by its smoothed normalised slope. A close back above the lower band gives a buy label, a close
 * back below the upper band a sell label (with an optional cooldown). Candles are redrawn with the position of the
 * source in the bands (bull colour at the lower band, bear colour at the upper band) or with the last signal colour.
 * Gradient fills from the bands to the fair value.
 * Alerts (alertcondition, `alerts` of the result): 'Buy Signal' / 'Sell Signal', true on the bars of the buy / sell
 * labels.
 *
 * Reference: "Uptrick: Liquid Reversal Bands" by Uptrick
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 */

import { ta, getSourceSeries, Series, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar, type SourceType } from 'oakscriptjs';
import type { MarkerData, PlotCandleData } from '../types';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

export interface LiquidReversalBandsInputs {
  /** Source */
  src: SourceType;
  /** Fair value length (EMA and ALMA) */
  fairLen: number;
  /** Lookback of the deviation stdev and EMA */
  zLen: number;
  /** Band smoothness (EMA length of the width and the range; fair value EMA of half of it) */
  smoothLen: number;
  upperMult: number;
  lowerMult: number;
  outerUpperMult: number;
  outerLowerMult: number;
  /** Show the buy / sell signals */
  enableSignals: boolean;
  /** Minimum bars between two signals */
  cooldownBars: number;
  /** Candle colouring mode */
  candleMode: 'Reversal Heat' | 'Latest Signal';
  showOuterBands: boolean;
  /** EMA length of the fair value slope */
  lineSlopeLen: number;
  /** Slope colour sensitivity */
  lineSlopeSensitivity: number;
}

export const defaultInputs: LiquidReversalBandsInputs = {
  src: 'close',
  fairLen: 50,
  zLen: 100,
  smoothLen: 18,
  upperMult: 2.4,
  lowerMult: 2.4,
  outerUpperMult: 1.45,
  outerLowerMult: 1.45,
  enableSignals: true,
  cooldownBars: 0,
  candleMode: 'Reversal Heat',
  showOuterBands: false,
  lineSlopeLen: 5,
  lineSlopeSensitivity: 1.25,
};

export const inputConfig: InputConfig[] = [
  { id: 'src', type: 'source', title: 'Source', defval: 'close' },
  { id: 'fairLen', type: 'int', title: 'Fair Value Length', defval: 50, min: 1 },
  { id: 'zLen', type: 'int', title: 'Z-Width Lookback', defval: 100, min: 10 },
  { id: 'smoothLen', type: 'int', title: 'Band Smoothness', defval: 18, min: 1 },
  { id: 'upperMult', type: 'float', title: 'Upper Band Multiplier', defval: 2.4, step: 0.1 },
  { id: 'lowerMult', type: 'float', title: 'Lower Band Multiplier', defval: 2.4, step: 0.1 },
  { id: 'outerUpperMult', type: 'float', title: 'Outer Upper Band Multiplier', defval: 1.45, step: 0.05 },
  { id: 'outerLowerMult', type: 'float', title: 'Outer Lower Band Multiplier', defval: 1.45, step: 0.05 },
  { id: 'enableSignals', type: 'bool', title: 'Show Signals', defval: true },
  { id: 'cooldownBars', type: 'int', title: 'Signal Cooldown', defval: 0, min: 0 },
  { id: 'candleMode', type: 'string', title: 'Candle Coloring Mode', defval: 'Reversal Heat', options: ['Reversal Heat', 'Latest Signal'] },
  { id: 'showOuterBands', type: 'bool', title: 'Show Outer Bands', defval: false },
  { id: 'lineSlopeLen', type: 'int', title: 'Slope Smoothing Length', defval: 5, min: 1 },
  { id: 'lineSlopeSensitivity', type: 'float', title: 'Slope Color Sensitivity', defval: 1.25, step: 0.05 },
];

const BULL_MAIN = String(color.new('#5CF0D7', 0));
const BEAR_MAIN = String(color.new('#B32AC3', 0));
const LABEL_TEXT_COL = color.white;
const BORDER_COL = String(color.new(color.white, 50));
const EMPTY_COL = String(color.new('#000104', 100));

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Upper Band', color: BORDER_COL, lineWidth: 1 },
  { id: 'plot1', title: 'Lower Band', color: BORDER_COL, lineWidth: 1 },
  { id: 'plot2', title: 'Fair Value', color: BULL_MAIN, lineWidth: 1 },
  { id: 'plot3', title: 'Outer Upper Band', color: String(color.new(BORDER_COL, 80)), lineWidth: 1 },
  { id: 'plot4', title: 'Outer Lower Band', color: String(color.new(BORDER_COL, 80)), lineWidth: 1 },
];

export const metadata = {
  title: 'Uptrick: Liquid Reversal Bands',
  shortTitle: 'LRB',
  overlay: true,
};

// Pine compares floats with a tolerance of 1e-10; a comparison with na is false, `na != 0` too.
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const le = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(a - b > EPS);
const ge = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(b - a > EPS);
const ne = (a: number, b: number) => Math.abs(a - b) > EPS;
/** f_clamp(x, min, max) = math.max(min, math.min(x, max)) (na stays na) */
const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(x, hi));

/** f_colorGradient(ratio, colA, colB): channel a + int((b - a) * ratio), color.rgb(r, g, b, 0) */
function colorGradient(ratio: number, colA: string, colB: string): string {
  const ch = (k: 'r' | 'g' | 'b') => {
    const a = color[k](colA);
    const b = color[k](colB);
    return a + Math.trunc((b - a) * ratio);
  };
  return String(color.rgb(ch('r'), ch('g'), ch('b'), 0));
}

export function calculate(
  bars: Bar[],
  inputs: Partial<LiquidReversalBandsInputs> = {},
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[]; plotCandles: Record<string, PlotCandleData[]> } & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const { fairLen, zLen, smoothLen, upperMult, lowerMult, outerUpperMult, outerLowerMult, cooldownBars,
    showOuterBands, lineSlopeLen, lineSlopeSensitivity } = cfg;
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const S = (a: number[]) => Series.fromArray(bars, a);
  const src = A(getSourceSeries(bars, cfg.src));

  // Liquid fair value
  const emaFair = A(ta.ema(S(src), fairLen));
  const almaFair = A(ta.alma(S(src), fairLen, 0.85, 6.0));
  const fairRaw = emaFair.map((e, i) => e * 0.55 + almaFair[i] * 0.45);
  const fair = A(ta.ema(S(fairRaw), Math.max(1, Math.trunc(smoothLen / 2))));

  // Liquid band width
  const dev = src.map((s, i) => s - fair[i]);
  const devStdev = A(ta.stdev(S(dev), zLen));
  const atrValue = A(ta.atr(bars, 14));
  const absDev = A(ta.ema(S(dev.map((d) => Math.abs(d))), zLen));
  const rangeEnergy = A(ta.ema(S(bars.map((b) => b.high - b.low)), smoothLen));
  const baseWidth = devStdev.map((d, i) => d * 0.60 + atrValue[i] * 0.25 + absDev[i] * 0.10 + rangeEnergy[i] * 0.05);
  const width = A(ta.ema(S(baseWidth), smoothLen));

  const upperBand = fair.map((f, i) => f + width[i] * upperMult);
  const lowerBand = fair.map((f, i) => f - width[i] * lowerMult);
  const outerUpperBand = fair.map((f, i) => f + width[i] * upperMult * outerUpperMult);
  const outerLowerBand = fair.map((f, i) => f - width[i] * lowerMult * outerLowerMult);

  // Smooth fair value line colour
  // fairSlopeRaw = nz(fair - fair[1], 0.0)
  const fairSlopeRaw = fair.map((f, i) => {
    const d = f - (i > 0 ? fair[i - 1] : NaN);
    return isNaN(d) ? 0 : d;
  });
  const fairSlopeAvg = A(ta.ema(S(fairSlopeRaw.map((v) => Math.abs(v))), lineSlopeLen));
  // fairSlopeNorm = fairSlopeAvg != 0.0 ? fairSlopeRaw / fairSlopeAvg : 0.0
  const fairSlopeNorm = fairSlopeAvg.map((a, i) => (ne(a, 0) ? fairSlopeRaw[i] / a : 0));
  const fairSlopeSmooth = A(ta.ema(S(fairSlopeNorm), lineSlopeLen));

  const close = bars.map((b) => b.close);
  const markers: MarkerData[] = [];
  const fairPlot: { time: number; value: number; color: string }[] = [];
  const candles: PlotCandleData[] = [];
  let lastSignalBar = NaN; // var int lastSignalBar
  let lastSignal = ''; // var string lastSignal
  const buyFlags: boolean[] = new Array(n).fill(false);
  const sellFlags: boolean[] = new Array(n).fill(false);
  for (let i = 0; i < n; i++) {
    const b = bars[i];
    const t = b.time;
    // lineRatio = f_clamp(0.5 + fairSlopeSmooth / (2.0 * lineSlopeSensitivity), 0.0, 1.0)
    // (sensitivity 0: a non-zero value / 0 is +-infinity, clamped to 1 / 0 as in Pine; 0 / 0 is na)
    const lineRatio = clamp(0.5 + fairSlopeSmooth[i] / (2.0 * lineSlopeSensitivity), 0.0, 1.0);
    fairPlot.push({ time: t, value: fair[i], color: colorGradient(lineRatio, BEAR_MAIN, BULL_MAIN) });

    // rawBuy = close[1] <= lowerBand[1] and close > lowerBand; rawSell = close[1] >= upperBand[1] and close < upperBand
    const rawBuy = i > 0 && le(close[i - 1], lowerBand[i - 1]) && gt(close[i], lowerBand[i]);
    const rawSell = i > 0 && ge(close[i - 1], upperBand[i - 1]) && gt(upperBand[i], close[i]);
    // barsOk = na(lastSignalBar) or bar_index - lastSignalBar >= cooldownBars
    const barsOk = isNaN(lastSignalBar) || i - lastSignalBar >= cooldownBars;
    const finalBuy = cfg.enableSignals && rawBuy && barsOk;
    const finalSell = cfg.enableSignals && rawSell && barsOk;
    buyFlags[i] = finalBuy;
    sellFlags[i] = finalSell;
    if (finalBuy) {
      lastSignalBar = i;
      lastSignal = 'bull';
    }
    if (finalSell) {
      lastSignalBar = i;
      lastSignal = 'bear';
    }

    // bandRange = upperBand - lowerBand; ratioRaw = bandRange != 0.0 ? (src - lowerBand) / bandRange : 0.5
    const bandRange = upperBand[i] - lowerBand[i];
    const ratioRaw = ne(bandRange, 0) ? (src[i] - lowerBand[i]) / bandRange : 0.5;
    const ratioClamped = clamp(isNaN(ratioRaw) ? 0.5 : ratioRaw, 0.0, 1.0);
    const reversalCandleCol = colorGradient(ratioClamped, BULL_MAIN, BEAR_MAIN);
    const latestSignalCol = lastSignal === 'bull' ? BULL_MAIN : lastSignal === 'bear' ? BEAR_MAIN : reversalCandleCol;
    const candleCol = cfg.candleMode === 'Reversal Heat' ? reversalCandleCol : latestSignalCol;
    // plotcandle(open, high, low, close, 'Liquid Reversal Candles', color / wickcolor / bordercolor = candleCol)
    candles.push({ time: t, open: b.open, high: b.high, low: b.low, close: b.close,
      color: candleCol, wickColor: candleCol, borderColor: candleCol });

    // plotshape(finalBuy, 'Buy', location.belowbar, shape.labelup, text '𝓤𝓹', color bullMain, textcolor #000000, size.small)
    if (finalBuy) {
      markers.push({ time: t, position: 'belowBar', shape: 'labelUp', color: BULL_MAIN, text: '𝓤𝓹',
        textColor: '#000000', size: 'small' });
    }
    // plotshape(finalSell, 'Sell', location.abovebar, shape.labeldown, text '𝓓𝓸𝔀𝓷', color bearMain, textcolor white, size.small)
    if (finalSell) {
      markers.push({ time: t, position: 'aboveBar', shape: 'labelDown', color: BEAR_MAIN, text: '𝓓𝓸𝔀𝓷',
        textColor: LABEL_TEXT_COL, size: 'small' });
    }
  }

  const line = (v: number[], col?: string) => bars.map((b, i) => ({ time: b.time, value: v[i], ...(col ? { color: col } : {}) }));
  const constant = (c: string | null) => new Array<string | null>(n).fill(c);
  const outerCol = String(color.new(BORDER_COL, 80));
  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {
      plot0: line(upperBand, BORDER_COL),
      plot1: line(lowerBand, BORDER_COL),
      plot2: fairPlot,
      // plot(showOuterBands ? outerUpperBand : na, ...); plot(showOuterBands ? outerLowerBand : na, ...)
      plot3: line(showOuterBands ? outerUpperBand : new Array(n).fill(NaN), outerCol),
      plot4: line(showOuterBands ? outerLowerBand : new Array(n).fill(NaN), outerCol),
    },
    fills: [
      // fill(pUpper, pFair, upperBand, fair, color.new(bearMain, 80), emptyCol)
      { plot1: 'plot0', plot2: 'plot2', gradient: { topValue: upperBand, bottomValue: fair,
        topColor: constant(String(color.new(BEAR_MAIN, 80))), bottomColor: constant(EMPTY_COL) } },
      // fill(pFair, pLower, fair, lowerBand, emptyCol, color.new(bullMain, 80))
      { plot1: 'plot2', plot2: 'plot1', gradient: { topValue: fair, bottomValue: lowerBand,
        topColor: constant(EMPTY_COL), bottomColor: constant(String(color.new(BULL_MAIN, 80))) } },
      // fill(pOuterUpper, pUpper, outerUpperBand, upperBand, showOuterBands ? color.new(bearMain, 70) : na,
      //      showOuterBands ? color.new(bearMain, 100) : na)
      { plot1: 'plot3', plot2: 'plot0', gradient: { topValue: outerUpperBand, bottomValue: upperBand,
        topColor: constant(showOuterBands ? String(color.new(BEAR_MAIN, 70)) : null),
        bottomColor: constant(showOuterBands ? String(color.new(BEAR_MAIN, 100)) : null) } },
      // fill(pLower, pOuterLower, lowerBand, outerLowerBand, showOuterBands ? color.new(bullMain, 100) : na,
      //      showOuterBands ? color.new(bullMain, 70) : na)
      { plot1: 'plot1', plot2: 'plot4', gradient: { topValue: lowerBand, bottomValue: outerLowerBand,
        topColor: constant(showOuterBands ? String(color.new(BULL_MAIN, 100)) : null),
        bottomColor: constant(showOuterBands ? String(color.new(BULL_MAIN, 70)) : null) } },
    ],
    markers,
    plotCandles: { liquidReversalCandles: candles },
    // alertcondition(finalBuy, "Buy Signal") / alertcondition(finalSell, "Sell Signal")
    alerts: alertStates(alertConditions, bars, [buyFlags, sellFlags]),
  };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'Buy Signal', message: 'Uptrick LRB: Close crossed above lower band' },
  { id: 'alert1', title: 'Sell Signal', message: 'Uptrick LRB: Close crossed below upper band' },
];

export const LiquidReversalBands = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  alertConditions,
};
