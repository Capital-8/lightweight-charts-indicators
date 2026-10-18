/**
 * RSI [Hash Capital Research]
 *
 * A smoothed RSI: rsi = ema(ema(rsi(src, length), smoothing), 2). The line is lime below the oversold level, red
 * above the overbought level and white otherwise, with a wide glow line in the same zone colours. An optional signal
 * line is a moving average of the RSI (SMA / EMA / RMA / WMA / VWMA). Strong Buy / Strong Sell dots mark the bar
 * before a bar where the previous RSI was below 20 (above 80) and the RSI momentum (change of the RSI) crossed
 * above (below) 0 on that previous bar. With the divergence option, regular bullish (RSI higher low, price lower
 * low) and bearish (RSI lower high, price higher high) divergences between pivots are drawn on the pivot bar with
 * Bull / Bear labels.
 * Alerts (alertcondition, `alerts` of the result): Strong Buy / Strong Sell (the dot conditions), Buy / Sell (RSI
 * beyond the oversold / overbought level with momentum and its change both rising / both falling), the RSI
 * crossing 50 and the two divergences.
 *
 * Reference: "RSI [Hash Capital Research]" by Hash_Capital
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 */

import { ta, Series, getSourceSeries, callsite, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar, type SourceType } from 'oakscriptjs';
import type { MarkerData } from '../types';
import { barInterval, barTime } from '../bar-time';
import { alertStates, crossedOver, crossedUnder, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

export type RsiHashCapitalMaType = 'None' | 'SMA' | 'EMA' | 'SMMA (RMA)' | 'WMA' | 'VWMA';

export interface RsiHashCapitalInputs {
  /** RSI period */
  length: number;
  src: SourceType;
  /** EMA length of the first smoothing */
  smoothing: number;
  showGlowEffect: boolean;
  /** Glow intensity (1-10) */
  glowIntensity: number;
  /** Show the 50 line */
  showMidline: boolean;
  overboughtLevel: number;
  oversoldLevel: number;
  showBuySignals: boolean;
  showSellSignals: boolean;
  buySignalLocation: 'Bottom' | 'Zone Line' | 'RSI Line';
  sellSignalLocation: 'Top' | 'Zone Line' | 'RSI Line';
  /** Signal line type ('None' = no signal line) */
  maTypeInput: RsiHashCapitalMaType;
  maLengthInput: number;
  signalLineColor: string;
  calculateDivergence: boolean;
  lookbackRight: number;
  lookbackLeft: number;
  /** Max bars between two pivots */
  rangeUpper: number;
  /** Min bars between two pivots */
  rangeLower: number;
}

export const defaultInputs: RsiHashCapitalInputs = {
  length: 13,
  src: 'hlc3',
  smoothing: 3,
  showGlowEffect: true,
  glowIntensity: 4.0,
  showMidline: true,
  overboughtLevel: 70,
  oversoldLevel: 30,
  showBuySignals: true,
  showSellSignals: true,
  buySignalLocation: 'Bottom',
  sellSignalLocation: 'Top',
  maTypeInput: 'None',
  maLengthInput: 14,
  signalLineColor: color.yellow,
  calculateDivergence: false,
  lookbackRight: 5,
  lookbackLeft: 5,
  rangeUpper: 60,
  rangeLower: 5,
};

export const inputConfig: InputConfig[] = [
  { id: 'length', type: 'int', title: 'RSI Period', defval: 13, min: 1 },
  { id: 'src', type: 'source', title: 'Source', defval: 'hlc3' },
  { id: 'smoothing', type: 'int', title: 'Smoothing', defval: 3, min: 1, max: 10 },
  { id: 'showGlowEffect', type: 'bool', title: 'Glow Effect', defval: true },
  { id: 'glowIntensity', type: 'float', title: 'Glow Intensity', defval: 4.0, min: 1.0, max: 10.0, step: 1.0 },
  { id: 'showMidline', type: 'bool', title: 'Midline (50)', defval: true },
  { id: 'overboughtLevel', type: 'int', title: 'Overbought Level', defval: 70, min: 51, max: 90 },
  { id: 'oversoldLevel', type: 'int', title: 'Oversold Level', defval: 30, min: 10, max: 49 },
  { id: 'showBuySignals', type: 'bool', title: 'Show Buy Signals', defval: true },
  { id: 'showSellSignals', type: 'bool', title: 'Show Sell Signals', defval: true },
  { id: 'buySignalLocation', type: 'string', title: 'Buy Signal Location', defval: 'Bottom', options: ['Bottom', 'Zone Line', 'RSI Line'] },
  { id: 'sellSignalLocation', type: 'string', title: 'Sell Signal Location', defval: 'Top', options: ['Top', 'Zone Line', 'RSI Line'] },
  { id: 'maTypeInput', type: 'string', title: 'Signal Line Type', defval: 'None', options: ['None', 'SMA', 'EMA', 'SMMA (RMA)', 'WMA', 'VWMA'] },
  { id: 'maLengthInput', type: 'int', title: 'Signal Line Length', defval: 14 },
  { id: 'signalLineColor', type: 'color', title: 'Signal Line Color', defval: color.yellow },
  { id: 'calculateDivergence', type: 'bool', title: 'Calculate Divergence', defval: false },
  { id: 'lookbackRight', type: 'int', title: 'Pivot Lookback Right', defval: 5, min: 1 },
  { id: 'lookbackLeft', type: 'int', title: 'Pivot Lookback Left', defval: 5, min: 1 },
  { id: 'rangeUpper', type: 'int', title: 'Max Pivot Range', defval: 60, min: 1 },
  { id: 'rangeLower', type: 'int', title: 'Min Pivot Range', defval: 5, min: 1 },
];

const LIME = String(color.new('#00FF00', 0));
const RED = String(color.new('#FF0000', 0));
const WHITE = String(color.new('#FFFFFF', 0));
const NONE_COLOR = String(color.new(color.white, 100));

// plot(smoothingMA, display = enableSignalLine ? display.all : display.none): result.visibility.enableSignalLine
export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'RSI Line', color: WHITE, lineWidth: 2 },
  { id: 'plot1', title: 'RSI Glow', color: String(color.new('#FFFFFF', 75)), lineWidth: 6 },
  { id: 'plot2', title: 'RSI Signal Line', color: color.yellow, lineWidth: 1, visible: 'enableSignalLine' },
  { id: 'plot3', title: 'Regular Bullish', color: color.green, lineWidth: 2, display: 'pane' },
  { id: 'plot4', title: 'Regular Bearish', color: color.red, lineWidth: 2, display: 'pane' },
];

export const metadata = {
  title: 'RSI [Hash Capital Research]',
  shortTitle: 'RSI [Hash Capital Research]',
  overlay: false,
};

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;

type Point = { time: number; value: number; color?: string };

export function calculate(
  bars: Bar[],
  inputs: Partial<RsiHashCapitalInputs> = {},
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[]; visibility: Record<string, boolean> } & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const S = (a: number[]) => Series.fromArray(bars, a);

  // rawRSI = ta.rsi(src, length); rsi = ta.ema(ta.ema(rawRSI, smoothing), 2)
  const rawRsi = ta.rsi(getSourceSeries(bars, cfg.src), cfg.length);
  const rsi = A(ta.ema(ta.ema(rawRsi, cfg.smoothing), 2));
  const rsiS = S(rsi);
  // momentum = ta.change(rsi, 1)
  const momentum = rsi.map((v, i) => (i > 0 ? v - rsi[i - 1] : NaN));

  // smoothingMA = enableSignalLine ? ma(rsi, maLengthInput, maTypeInput) : na
  const enableSignalLine = cfg.maTypeInput !== 'None';
  let smoothingMa = new Array<number>(n).fill(NaN);
  if (enableSignalLine) {
    let maS: Series;
    switch (cfg.maTypeInput) {
      case 'EMA': maS = ta.ema(rsiS, cfg.maLengthInput); break;
      case 'SMMA (RMA)': maS = ta.rma(rsiS, cfg.maLengthInput); break;
      case 'WMA': maS = ta.wma(rsiS, cfg.maLengthInput); break;
      case 'VWMA': maS = ta.vwma(rsiS, cfg.maLengthInput, S(bars.map((b) => b.volume ?? NaN))); break;
      default: maS = ta.sma(rsiS, cfg.maLengthInput); break;
    }
    smoothingMa = A(maS);
  }

  // getAdaptiveColor() / getGlowColor()
  const adaptiveColor = (r: number) => (lt(r, cfg.oversoldLevel) ? LIME : gt(r, cfg.overboughtLevel) ? RED : WHITE);
  const glowAlpha = Math.max(30, Math.round(60 - 20 * (cfg.glowIntensity / 10.0)));
  const glowColor = (r: number): string => {
    if (!cfg.showGlowEffect) return 'transparent';
    if (lt(r, cfg.oversoldLevel)) return String(color.new('#00FF00', glowAlpha));
    if (gt(r, cfg.overboughtLevel)) return String(color.new('#FF0000', glowAlpha));
    return String(color.new('#FFFFFF', 75));
  };

  // extremeOversold = rsi[1] < 20 and ta.crossover(momentum, 0)[1]. The crossover with the history reference [1]
  // runs on every bar (not only where rsi[1] < 20): [1] is the crossover of the previous bar.
  const overSite = callsite.crossover();
  const underSite = callsite.crossunder();
  const momOver = momentum.map((m) => overSite(m, 0));
  const momUnder = momentum.map((m) => underSite(m, 0));
  const extremeOversold = rsi.map((_v, i) => i > 0 && lt(rsi[i - 1], 20) && momOver[i - 1]);
  const extremeOverbought = rsi.map((_v, i) => i > 0 && gt(rsi[i - 1], 80) && momUnder[i - 1]);

  // Regular divergences
  const lbR = cfg.lookbackRight;
  const rsiLbr = (i: number) => (i - lbR >= 0 ? rsi[i - lbR] : NaN);
  const plFound = new Array<boolean>(n).fill(false);
  const phFound = new Array<boolean>(n).fill(false);
  const bullCond = new Array<boolean>(n).fill(false);
  const bearCond = new Array<boolean>(n).fill(false);
  if (cfg.calculateDivergence) {
    const pl = A(ta.pivotlow(rsiS, cfg.lookbackLeft, lbR));
    const ph = A(ta.pivothigh(rsiS, cfg.lookbackLeft, lbR));
    // ta.valuewhen(found, x, 1): x on the found bar before the latest one (the latest can be the current bar)
    const plRsi: number[] = [];
    const plLow: number[] = [];
    const phRsi: number[] = [];
    const phHigh: number[] = [];
    const second = (a: number[]) => (a.length >= 2 ? a[a.length - 2] : NaN);
    // The `and` is lazy: the ta.barssince inside _inRange(found[1]) only runs on the bars where the left side
    // (rsiLBR > / < ta.valuewhen(...)) is true, so it counts those calls.
    const plBarssince = callsite.barssince();
    const phBarssince = callsite.barssince();
    for (let i = 0; i < n; i++) {
      const r = rsiLbr(i);
      const lowLbr = i - lbR >= 0 ? bars[i - lbR].low : NaN;
      const highLbr = i - lbR >= 0 ? bars[i - lbR].high : NaN;

      plFound[i] = !isNaN(pl[i]);
      if (plFound[i]) {
        plRsi.push(r);
        plLow.push(lowLbr);
      }
      let rsiHL = false;
      if (gt(r, second(plRsi))) {
        const b = plBarssince(i > 0 && plFound[i - 1]);
        rsiHL = cfg.rangeLower <= b && b <= cfg.rangeUpper;
      }
      bullCond[i] = lt(lowLbr, second(plLow)) && rsiHL && plFound[i];

      phFound[i] = !isNaN(ph[i]);
      if (phFound[i]) {
        phRsi.push(r);
        phHigh.push(highLbr);
      }
      let rsiLH = false;
      if (lt(r, second(phRsi))) {
        const b = phBarssince(i > 0 && phFound[i - 1]);
        rsiLH = cfg.rangeLower <= b && b <= cfg.rangeUpper;
      }
      bearCond[i] = gt(highLbr, second(phHigh)) && rsiLH && phFound[i];
    }
  }

  const t = (i: number) => bars[i].time;
  const interval = barInterval(bars);
  const plot0: Point[] = [];
  const plot1: Point[] = [];
  const plot2: Point[] = [];
  const plot3: Point[] = [];
  const plot4: Point[] = [];
  const markers: MarkerData[] = [];
  // getBuySignalPosition() / getSellSignalPosition() run only on the signal bars: their `rsi[1]` reads the history
  // of their own calls (the rsi of the previous call; na on the first call)
  let buyPrevRsi = NaN;
  let sellPrevRsi = NaN;
  for (let i = 0; i < n; i++) {
    plot0.push({ time: t(i), value: rsi[i], color: adaptiveColor(rsi[i]) });
    plot1.push({ time: t(i), value: rsi[i], color: glowColor(rsi[i]) });
    plot2.push({ time: t(i), value: smoothingMa[i], color: cfg.signalLineColor });

    // plotshape(showBuySignals and extremeOversold ? getBuySignalPosition() : na, shape.circle, location.absolute,
    //   size.tiny, offset = -1): the value of bar i is drawn on bar i - 1
    if (i >= 1) {
      const at = t(i - 1);
      if (cfg.showBuySignals && extremeOversold[i]) {
        const price = cfg.buySignalLocation === 'Bottom' ? 0
          : cfg.buySignalLocation === 'Zone Line' ? cfg.oversoldLevel : buyPrevRsi;
        buyPrevRsi = rsi[i];
        if (!isNaN(price)) {
          markers.push({ id: 'shape0', time: at, position: 'atPriceMiddle', price, shape: 'circle', color: LIME, size: 'tiny' });
        }
      }
      if (cfg.showSellSignals && extremeOverbought[i]) {
        const price = cfg.sellSignalLocation === 'Top' ? 100
          : cfg.sellSignalLocation === 'Zone Line' ? cfg.overboughtLevel : sellPrevRsi;
        sellPrevRsi = rsi[i];
        if (!isNaN(price)) {
          markers.push({ id: 'shape1', time: at, position: 'atPriceMiddle', price, shape: 'circle', color: RED, size: 'tiny' });
        }
      }
    }

    // plot(found ? rsiLBR : na, offset = -lookbackRight): the value of bar i is drawn on bar i - lookbackRight
    if (i >= lbR) {
      const at = barTime(bars, i - lbR, interval);
      const v = rsiLbr(i);
      plot3.push({ time: at, value: plFound[i] ? v : NaN, color: bullCond[i] ? color.green : NONE_COLOR });
      plot4.push({ time: at, value: phFound[i] ? v : NaN, color: bearCond[i] ? color.red : NONE_COLOR });
      if (bullCond[i] && !isNaN(v)) {
        markers.push({ id: 'shape2', time: at, position: 'atPriceBottom', price: v, shape: 'labelUp', color: color.green,
          text: ' Bull ', textColor: color.white });
      }
      if (bearCond[i] && !isNaN(v)) {
        markers.push({ id: 'shape3', time: at, position: 'atPriceTop', price: v, shape: 'labelDown', color: color.red,
          text: ' Bear ', textColor: color.white });
      }
    }
  }

  const hlines: NonNullable<IndicatorResult['hlines']> = [
    { value: cfg.overboughtLevel, options: { title: 'Overbought', color: String(color.new('#FF0000', 40)), linestyle: 'dashed', linewidth: 1 } },
    { value: cfg.oversoldLevel, options: { title: 'Oversold', color: String(color.new('#00FF00', 40)), linestyle: 'dashed', linewidth: 1 } },
  ];
  // hline(showMidline ? 50 : na, "Midline"): no line when the option is off
  if (cfg.showMidline) {
    hlines.push({ value: 50, options: { title: 'Midline', color: String(color.new(color.white, 60)), linestyle: 'dashed', linewidth: 1 } });
  }
  hlines.push(
    { value: 100, options: { title: 'Upper Bound', color: String(color.new(color.white, 90)), linestyle: 'solid' } },
    { value: 0, options: { title: 'Lower Bound', color: String(color.new(color.white, 90)), linestyle: 'solid' } },
  );

  // velocity = ta.change(momentum, 1); oversoldReversal / overboughtReversal; ta.crossover / crossunder(rsi, 50)
  const velocity = momentum.map((m, i) => (i > 0 ? m - momentum[i - 1] : NaN));
  const oversoldReversal = rsi.map((r, i) => lt(r, cfg.oversoldLevel) && gt(momentum[i], 0) && gt(velocity[i], 0));
  const overboughtReversal = rsi.map((r, i) => gt(r, cfg.overboughtLevel) && lt(momentum[i], 0) && lt(velocity[i], 0));

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay, precision: 2 },
    plots: { plot0, plot1, plot2, plot3, plot4 },
    hlines,
    markers,
    visibility: { enableSignalLine },
    alerts: alertStates(alertConditions, bars, [
      extremeOversold, extremeOverbought, oversoldReversal, overboughtReversal,
      crossedOver(rsi, 50), crossedUnder(rsi, 50), bullCond, bearCond,
    ]),
  };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'RSI - Strong Buy', message: 'Extreme oversold reversal detected' },
  { id: 'alert1', title: 'RSI - Strong Sell', message: 'Extreme overbought reversal detected' },
  { id: 'alert2', title: 'RSI - Buy Signal', message: 'Oversold reversal with momentum' },
  { id: 'alert3', title: 'RSI - Sell Signal', message: 'Overbought reversal with momentum' },
  { id: 'alert4', title: 'RSI - Bullish Cross', message: 'RSI crossed above 50' },
  { id: 'alert5', title: 'RSI - Bearish Cross', message: 'RSI crossed below 50' },
  { id: 'alert6', title: 'RSI - Bullish Divergence', message: 'Found a new Regular Bullish Divergence' },
  { id: 'alert7', title: 'RSI - Bearish Divergence', message: 'Found a new Regular Bearish Divergence' },
];

export const RsiHashCapital = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  alertConditions,
};
