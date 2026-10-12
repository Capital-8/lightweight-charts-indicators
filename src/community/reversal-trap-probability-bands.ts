/**
 * Reversal Trap Probability Bands [BigBeluga]
 *
 * An envelope around a 55-bar EMA of the close (plus and minus 4 times the 55-bar ATR), with gradient fills from the
 * bands to the baseline. A bearish "trap" is a close back under the upper band after a wick above it (or after a
 * close above it), when the price did not stay above the band for more than "Trap Window" bars; a bullish trap is the
 * same at the lower band. Signals need "Minimum Bars Between Signals" bars since the last one.
 *
 * For each trap (one active trade per side), the script draws a dashed target line at the baseline, a dashed stop
 * line (2-bar low minus 0.5 times the 100-bar ATR, or 2-bar high plus it) and an arrow from the low (high) to the
 * target, all extended 10 bars past the current bar while the trade is open. The trade ends when the high (low)
 * reaches the target (a win, with a check mark label) or the low (high) passes the stop. Wins and trades are counted
 * per 20-bar RSI bucket (RSI / 10 rounded); the signal label shows the win rate of the bucket of the current RSI.
 * Only trades in the last "Max Lookback Bars" bars and up to "Max Total Trades" are recorded.
 *
 * Reference: "Reversal Trap Probability Bands [BigBeluga]" by BigBeluga
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © BigBeluga
 */

import {
  ta, str, math, color, Series, line, label, resetDrawings, setDrawingBar, varDrawing, drawingOutputs,
  type Line, type IndicatorResult, type InputConfig, type PlotConfig, type Bar,
} from 'oakscriptjs';
import type { LabelData, LineDrawingData } from '../types';

export interface ReversalTrapProbabilityBandsInputs {
  /** Envelope Smoothness: length of the EMA baseline and of the ATR */
  envelopeLen: number;
  /** Envelope Width: ATR multiplier of the bands */
  multiplier: number;
  /** Trap Window (Candles) */
  trapWindow: number;
  /** Minimum Bars Between Signals */
  signalGap: number;
  /** ATR Stop Multiplier */
  stopMult: number;
  /** Max Lookback Bars */
  maxBars: number;
  /** Max Total Trades */
  maxTrades: number;
  /** Bearish Theme Color */
  colorDn: string;
  /** Bullish Theme Color */
  colorUp: string;
  /** MidLine Color */
  colormid: string;
  /** Label Size */
  labelSize: 'Auto' | 'Tiny' | 'Small' | 'Normal' | 'Large' | 'Huge';
}

export const defaultInputs: ReversalTrapProbabilityBandsInputs = {
  envelopeLen: 55,
  multiplier: 4.0,
  trapWindow: 10,
  signalGap: 10,
  stopMult: 0.5,
  maxBars: 5000,
  maxTrades: 500,
  colorDn: '#EC3333',
  colorUp: '#12AF9F',
  colormid: '#787B8680',
  labelSize: 'Small',
};

export const inputConfig: InputConfig[] = [
  { id: 'envelopeLen', type: 'int', title: 'Envelope Smoothness', defval: 55, min: 1, group: 'Envelope Settings' },
  { id: 'multiplier', type: 'float', title: 'Envelope Width', defval: 4.0, min: 0.1, step: 0.1, group: 'Envelope Settings' },
  { id: 'trapWindow', type: 'int', title: 'Trap Window (Candles)', defval: 10, min: 1, group: 'Strategy Settings' },
  { id: 'signalGap', type: 'int', title: 'Minimum Bars Between Signals', defval: 10, min: 1, group: 'Strategy Settings' },
  { id: 'stopMult', type: 'float', title: 'ATR Stop Multiplier', defval: 0.5, min: 0.1, step: 0.1, group: 'Strategy Settings' },
  { id: 'maxBars', type: 'int', title: 'Max Lookback Bars', defval: 5000, min: 1, group: 'Database Limits' },
  { id: 'maxTrades', type: 'int', title: 'Max Total Trades', defval: 500, min: 1, group: 'Database Limits' },
  { id: 'colorDn', type: 'color', title: 'Bearish Theme Color', defval: '#EC3333', group: 'Color Styling' },
  { id: 'colorUp', type: 'color', title: 'Bullish Theme Color', defval: '#12AF9F', group: 'Color Styling' },
  { id: 'colormid', type: 'color', title: 'MidLine Color', defval: '#787B8680', group: 'Color Styling' },
  {
    id: 'labelSize', type: 'string', title: 'Label Size', defval: 'Small',
    options: ['Auto', 'Tiny', 'Small', 'Normal', 'Large', 'Huge'], group: 'Color Styling',
  },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Envelope Ceiling', color: '#EC333380', lineWidth: 3 },
  { id: 'plot1', title: 'Envelope Floor', color: '#12AF9F80', lineWidth: 3 },
  { id: 'plot2', title: 'Envelope Baseline', color: '#787B8680', lineWidth: 1, linestyle: 'dashed' },
];

export const metadata = {
  title: 'Reversal Trap Probability Bands [BigBeluga]',
  shortTitle: 'Reversal Trap Probability Bands [BigBeluga]',
  overlay: true,
};

/** indicator(max_labels_count = 100, max_lines_count = 500) */
const MAX_LABELS = 100;
const MAX_LINES = 500;

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const ge = (a: number, b: number) => !Number.isNaN(a) && !Number.isNaN(b) && !(b - a > EPS);
const le = (a: number, b: number) => !Number.isNaN(a) && !Number.isNaN(b) && !(a - b > EPS);

const SIZES = { Auto: 'auto', Tiny: 'tiny', Small: 'small', Normal: 'normal', Large: 'large', Huge: 'huge' } as const;

type Point = { time: number; value: number };

export function calculate(
  bars: Bar[],
  inputs: Partial<ReversalTrapProbabilityBandsInputs> = {},
): Omit<IndicatorResult, 'labels' | 'lines'> & { labels: LabelData[]; lines: LineDrawingData[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const { colorUp, colorDn, trapWindow, signalGap, multiplier } = cfg;
  const labelSize = SIZES[cfg.labelSize] ?? 'small';
  const closeS = new Series(bars, (b) => b.close);

  const basis = ta.ema(closeS, cfg.envelopeLen).toArray().map((v) => v ?? NaN);
  const vola = ta.atr(bars, cfg.envelopeLen).toArray().map((v) => v ?? NaN);
  const rsi = ta.rsi(closeS, 20).toArray().map((v) => v ?? NaN);
  const atr = ta.atr(bars, 100).toArray().map((v) => (v ?? NaN) * cfg.stopMult);
  const lowest2 = ta.lowest(new Series(bars, (b) => b.low), 2).toArray().map((v) => v ?? NaN);
  const highest2 = ta.highest(new Series(bars, (b) => b.high), 2).toArray().map((v) => v ?? NaN);
  const upper = basis.map((b, i) => b + multiplier * vola[i]);
  const lower = basis.map((b, i) => b - multiplier * vola[i]);

  resetDrawings({ label: MAX_LABELS, line: MAX_LINES });

  const bullTotal = new Array<number>(11).fill(0);
  const bullWins = new Array<number>(11).fill(0);
  const bearTotal = new Array<number>(11).fill(0);
  const bearWins = new Array<number>(11).fill(0);
  let totalTrades = 0;
  let aboveCount = 0;
  let belowCount = 0;
  let lastSignalBar = -1000;

  let activeBull = false;
  const bullTarget = varDrawing<Line>();
  const bullStop = varDrawing<Line>();
  const bullArrow = varDrawing<Line>();
  let bullBucket = NaN;
  let activeBear = false;
  const bearTarget = varDrawing<Line>();
  const bearStop = varDrawing<Line>();
  const bearArrow = varDrawing<Line>();
  let bearBucket = NaN;

  const transparentDn = String(color.new(colorDn, 100));
  const transparentUp = String(color.new(colorUp, 100));
  const priceAt = (l: Line | undefined, x: number) => (l ? line.get_price(l, x) : NaN);
  const setX2 = (x: number, ...ls: Array<Line | undefined>) => {
    for (const l of ls) if (l) line.set_x2(l, x);
  };

  const plots: Record<string, Point[]> = { plot0: [], plot1: [], plot2: [] };
  const lastIndex = n - 1;

  for (let i = 0; i < n; i++) {
    setDrawingBar(i, i === lastIndex);
    const b = bars[i];
    const prevClose = i > 0 ? bars[i - 1].close : NaN;
    const up = upper[i];
    const lo = lower[i];
    const rsiBucket = (math.max(0, math.min(10, math.round(rsi[i] / 10))) as number);
    const allowed = lastIndex - i <= cfg.maxBars && totalTrades < cfg.maxTrades;

    // bearish trap: close back under the upper band (counts of the bar before)
    let rawBear = false;
    if (lt(b.close, up)) {
      if (gt(b.high, up) && lt(prevClose, up) && le(i > 0 ? aboveCount : NaN, trapWindow)) rawBear = true;
      else if (gt(prevClose, up) && le(i > 0 ? aboveCount : NaN, trapWindow)) rawBear = true;
    }
    aboveCount = gt(b.high, up) ? aboveCount + 1 : 0;

    let rawBull = false;
    if (gt(b.close, lo)) {
      if (lt(b.low, lo) && gt(prevClose, lo) && le(i > 0 ? belowCount : NaN, trapWindow)) rawBull = true;
      else if (lt(prevClose, lo) && le(i > 0 ? belowCount : NaN, trapWindow)) rawBull = true;
    }
    belowCount = lt(b.low, lo) ? belowCount + 1 : 0;

    const canFire = i - lastSignalBar >= signalGap;
    const bullTrap = rawBull && canFire;
    const bearTrap = rawBear && canFire;
    if (bullTrap || bearTrap) lastSignalBar = i;

    // bullish tracking engine
    const bullStopPrice = lowest2[i] - atr[i];
    if (bullTrap && !activeBull && allowed) {
      activeBull = true;
      bullBucket = rsiBucket;
      totalTrades += 1;
      const target = basis[i];
      bullTarget.value = line.new(i, target, i + 10, target, 'bar_index', 'none', colorUp, 'dashed');
      bullStop.value = line.new(i, bullStopPrice, i + 10, bullStopPrice, 'bar_index', 'none', colorUp, 'dashed');
      bullArrow.value = line.new(i, b.low, i + 10, target, 'bar_index', 'none', colorUp, 'arrow_right');
      const attempts = bullTotal[rsiBucket];
      const success = bullWins[rsiBucket];
      let probText = 'Tracking...';
      let rate = 0.0;
      if (attempts > 0) {
        rate = (math.round((success / attempts) * 100) as number);
        probText = str.tostring(rate) + '% WIN PROB';
      }
      label.new(i, b.low - atr[i], '⬆\nTRAP\n' + probText + '\n(RSI: ' + str.tostring(math.round(rsi[i]) as number) + ')',
        'bar_index', 'price', transparentUp, 'label_up', colorUp, labelSize, undefined,
        'Win Probability: ' + str.tostring(rate) + '%');
    }
    if (activeBull) {
      setX2(i + 10, bullStop.value, bullTarget.value, bullArrow.value);
      if (ge(b.high, priceAt(bullTarget.value, i)) && i - lastSignalBar > 1) {
        bullTotal[bullBucket] += 1;
        bullWins[bullBucket] += 1;
        activeBull = false;
        label.new(i, b.high, '✓', 'bar_index', 'price', transparentDn, 'label_down', colorUp, labelSize);
        setX2(i, bullStop.value, bullTarget.value, bullArrow.value);
      } else if (lt(b.low, priceAt(bullStop.value, i)) && i - lastSignalBar > 1) {
        bullTotal[bullBucket] += 1;
        activeBull = false;
        setX2(i, bullStop.value, bullTarget.value, bullArrow.value);
      }
    }

    // bearish tracking engine
    const bearStopPrice = highest2[i] + atr[i];
    if (bearTrap && !activeBear && allowed) {
      activeBear = true;
      bearBucket = rsiBucket;
      totalTrades += 1;
      const target = basis[i];
      bearTarget.value = line.new(i, target, i + 10, target, 'bar_index', 'none', colorDn, 'dashed');
      bearStop.value = line.new(i, bearStopPrice, i + 10, bearStopPrice, 'bar_index', 'none', colorDn, 'dashed');
      bearArrow.value = line.new(i, b.high, i + 10, target, 'bar_index', 'none', colorDn, 'arrow_right');
      const attempts = bearTotal[rsiBucket];
      const success = bearWins[rsiBucket];
      let probText = 'Tracking...';
      let rate = 0.0;
      if (attempts > 0) {
        rate = (math.round((success / attempts) * 100) as number);
        probText = str.tostring(rate) + '% WIN PROB';
      }
      label.new(i, b.high + atr[i], probText + '\n(RSI: ' + str.tostring(math.round(rsi[i]) as number) + ')' + '\nTRAP\n⬇',
        'bar_index', 'price', transparentUp, 'label_down', colorDn, labelSize, undefined,
        'Win Probability: ' + str.tostring(rate) + '%');
    }
    if (activeBear) {
      setX2(i + 10, bearStop.value, bearArrow.value, bearTarget.value);
      if (le(b.low, priceAt(bearTarget.value, i)) && i - lastSignalBar > 1) {
        bearTotal[bearBucket] += 1;
        bearWins[bearBucket] += 1;
        activeBear = false;
        label.new(i, b.low, '✓', 'bar_index', 'price', transparentDn, 'label_up', colorDn, labelSize);
        setX2(i, bearStop.value, bearTarget.value, bearArrow.value);
      } else if (gt(b.high, priceAt(bearStop.value, i)) && i - lastSignalBar > 1) {
        bearTotal[bearBucket] += 1;
        activeBear = false;
        setX2(i, bearStop.value, bearTarget.value, bearArrow.value);
      }
    }

    plots.plot0.push({ time: b.time, value: up });
    plots.plot1.push({ time: b.time, value: lo });
    plots.plot2.push({ time: b.time, value: basis[i] });
  }
  setDrawingBar(null);

  const upTop = String(color.new(colorDn, 90));
  const upBottom = String(color.new(colorDn, 100));
  const loTop = String(color.new(colorUp, 100));
  const loBottom = String(color.new(colorUp, 90));
  const drawn = drawingOutputs(bars);
  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {
      plot0: plots.plot0.map((p) => ({ ...p, color: String(color.new(colorDn, 50)) })),
      plot1: plots.plot1.map((p) => ({ ...p, color: String(color.new(colorUp, 50)) })),
      plot2: plots.plot2.map((p) => ({ ...p, color: cfg.colormid })),
    },
    fills: [
      {
        plot1: 'plot0', plot2: 'plot2', options: { title: 'Upper Band Gradient' },
        gradient: {
          topValue: upper, bottomValue: basis,
          topColor: upper.map(() => upTop), bottomColor: upper.map(() => upBottom),
        },
      },
      {
        plot1: 'plot2', plot2: 'plot1', options: { title: 'Lower Band Gradient' },
        gradient: {
          topValue: basis, bottomValue: lower,
          topColor: lower.map(() => loTop), bottomColor: lower.map(() => loBottom),
        },
      },
    ],
    labels: drawn.labels ?? [],
    lines: drawn.lines ?? [],
  };
}

export const ReversalTrapProbabilityBands = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
};
