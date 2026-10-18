/**
 * Trendlines with Breaks [LuxAlgo]
 *
 * Pivot-based trendline indicator. Detects swing highs/lows, then
 * calculates slope-adjusted trendlines that update on each new pivot.
 * Breakout signals fire when price crosses through a trendline.
 * Plots as the original: Upper = upper (backpaint) or upper - slope_ph * length, drawn `length` bars back with
 * backpaint on (offset = -length, the last `length` bars empty), with an na colour (transparent) on the pivot bars;
 * upper / lower are 0 before the first pivot, as the original's `var` values. The dashed extended lines (extend right)
 * of the last pivot high / low start at bar - offset: at the pivot and pivot -/+ slope one bar later (backpaint) or at
 * upper - slope_ph * length and upper - slope_ph * (length + 1).
 * Alerts (alertcondition, `alerts` of the result): 'Upward Breakout' and 'Downward Breakout', true on the bars on which
 * the close breaks the upper / lower trendline (upos > upos[1], dnos > dnos[1]).
 * The "B" break labels (Upper Break at the low, Lower Break at the high, absolute location) are drawn on every bar
 * where upos > upos[1] / dnos > dnos[1], with the original's state: upper / lower / slopes start at 0, upos / dnos at 0,
 * ta.pivothigh / ta.pivotlow(length, length), and the Atr / Stdev / Linreg slope formulas of the original.
 *
 * Reference: "Trendlines with Breaks [LuxAlgo]" by LuxAlgo
 */

import { ta, Series, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { MarkerData, LineDrawingData } from '../types';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';
import { barInterval, barTime } from '../bar-time';

export interface TrendlinesWithBreaksInputs {
  length: number;
  mult: number;
  calcMethod: string;
  /** offset of the plots and extended lines: `length` bars back when on */
  backpaint: boolean;
}

export const defaultInputs: TrendlinesWithBreaksInputs = {
  length: 14,
  mult: 1.0,
  calcMethod: 'Atr',
  backpaint: true,
};

export const inputConfig: InputConfig[] = [
  { id: 'length', type: 'int', title: 'Swing Detection Lookback', defval: 14, min: 1 },
  { id: 'mult', type: 'float', title: 'Slope', defval: 1.0, min: 0, step: 0.1 },
  { id: 'calcMethod', type: 'string', title: 'Slope Calculation Method', defval: 'Atr', options: ['Atr', 'Stdev', 'Linreg'] },
  {
    id: 'backpaint', type: 'bool', title: 'backpaint', defval: true,
    tooltip: 'Backpainting offset displayed elements in the past. Disable backpainting to see real time information returned by the indicator.',
  },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Upper', color: '#00897B', lineWidth: 1 },
  { id: 'plot1', title: 'Lower', color: '#FF5252', lineWidth: 1 },
];

export const metadata = {
  title: 'Trendlines with Breaks [LuxAlgo]',
  shortTitle: 'TwB',
  overlay: true,
};

export function calculate(bars: Bar[], inputs: Partial<TrendlinesWithBreaksInputs> = {}): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[]; lines: LineDrawingData[] }
  & { alerts: AlertConditionState[] } {
  const { length, mult, calcMethod, backpaint } = { ...defaultInputs, ...inputs };
  const n = bars.length;
  // var offset = backpaint ? length : 0
  const offset = backpaint ? length : 0;

  const closeSeries = new Series(bars, (b) => b.close);
  const highSeries = new Series(bars, (b) => b.high);
  const lowSeries = new Series(bars, (b) => b.low);

  // slope = switch calcMethod
  //   'Atr'    => ta.atr(length) / length * mult
  //   'Stdev'  => ta.stdev(src, length) / length * mult
  //   'Linreg' => math.abs(ta.sma(src * n, length) - ta.sma(src, length) * ta.sma(n, length)) / ta.variance(n, length) / 2 * mult
  const num = (v: number | null | undefined) => (v == null ? NaN : v);
  let slopeArr: number[];
  if (calcMethod === 'Stdev') {
    const stdevArr = ta.stdev(closeSeries, length).toArray();
    slopeArr = stdevArr.map((v) => (num(v) / length) * mult);
  } else if (calcMethod === 'Linreg') {
    const idx = bars.map((_b, i) => i);
    const srcN = Series.fromArray(bars, bars.map((b, i) => b.close * i));
    const nSeries = Series.fromArray(bars, idx);
    const a = ta.sma(srcN, length).toArray();
    const b = ta.sma(closeSeries, length).toArray();
    const c = ta.sma(nSeries, length).toArray();
    const v = ta.variance(nSeries, length).toArray();
    slopeArr = bars.map((_b, i) => (Math.abs(num(a[i]) - num(b[i]) * num(c[i])) / num(v[i]) / 2) * mult);
  } else {
    const atrArr = ta.atr(bars, length).toArray();
    slopeArr = atrArr.map((v) => (num(v) / length) * mult);
  }

  // ph = ta.pivothigh(length, length), pl = ta.pivotlow(length, length): the pivot value on the bar that confirms it
  // (`ph ? ...`: true when the value exists and is not 0)
  const closeArr = closeSeries.toArray();
  const phRaw = ta.pivothigh(highSeries, length, length).toArray();
  const plRaw = ta.pivotlow(lowSeries, length, length).toArray();
  const truthy = (v: number | null | undefined) => v != null && Number.isFinite(v) && v !== 0;
  const ph: (number | null)[] = phRaw.map((v) => (truthy(v) ? (v as number) : null));
  const pl: (number | null)[] = plRaw.map((v) => (truthy(v) ? (v as number) : null));

  // var upper = 0., var lower = 0., var slope_ph = 0., var slope_pl = 0., var upos = 0, var dnos = 0
  const upperArr: number[] = new Array(n);
  const lowerArr: number[] = new Array(n);
  const slopePhArr: number[] = new Array(n);
  const slopePlArr: number[] = new Array(n);
  let upper = 0;
  let lower = 0;
  let slopePh = 0;
  let slopePl = 0;

  const upos: number[] = new Array(n).fill(0);
  const dnos: number[] = new Array(n).fill(0);

  // Last pivot bars for the extended lines (var line moved on each pivot)
  let lastPhBar = -1;
  let lastPlBar = -1;

  for (let i = 0; i < n; i++) {
    const slope = slopeArr[i];

    // slope_ph := ph ? slope : slope_ph; upper := ph ? ph : upper - slope_ph (same for the lower line)
    if (ph[i] !== null) {
      slopePh = slope;
      upper = ph[i]!;
      lastPhBar = i;
    } else {
      upper = upper - slopePh;
    }

    if (pl[i] !== null) {
      slopePl = slope;
      lower = pl[i]!;
      lastPlBar = i;
    } else {
      lower = lower + slopePl;
    }
    upperArr[i] = upper;
    lowerArr[i] = lower;
    slopePhArr[i] = slopePh;
    slopePlArr[i] = slopePl;

    // upos := ph ? 0 : close > upper - slope_ph * length ? 1 : upos (na compares false: upos kept)
    const prevU = i > 0 ? upos[i - 1] : 0;
    const prevD = i > 0 ? dnos[i - 1] : 0;
    if (ph[i] !== null) upos[i] = 0;
    else if (closeArr[i] > upper - slopePh * length) upos[i] = 1;
    else upos[i] = prevU;

    if (pl[i] !== null) dnos[i] = 0;
    else if (closeArr[i] < lower + slopePl * length) dnos[i] = 1;
    else dnos[i] = prevD;
  }

  const upCss = '#00897B'; // color.teal
  const dnCss = '#FF5252'; // color.red

  // plot(backpaint ? upper : upper - slope_ph * length, 'Upper', color = ph ? na : upCss, offset = -offset) and
  // plot(backpaint ? lower : lower + slope_pl * length, 'Lower', color = pl ? na : dnCss, offset = -offset): the value
  // of bar i is drawn on bar i - offset
  const upperVal = (i: number) => (backpaint ? upperArr[i] : upperArr[i] - slopePhArr[i] * length);
  const lowerVal = (i: number) => (backpaint ? lowerArr[i] : lowerArr[i] + slopePlArr[i] * length);
  const plotOf = (val: (i: number) => number, piv: (number | null)[], css: string) => bars.map((b, j) => {
    const i = j + offset;
    if (i >= n) return { time: b.time, value: NaN };
    const v = val(i);
    return { time: b.time, value: Number.isFinite(v) ? v : NaN, color: piv[i] !== null ? 'transparent' : css };
  });
  const plot0 = plotOf(upperVal, ph, upCss);
  const plot1 = plotOf(lowerVal, pl, dnCss);

  // plotshape(upos > upos[1] ? low : na, "Upper Break", shape.labelup, location.absolute, text = "B") and
  // plotshape(dnos > dnos[1] ? high : na, "Lower Break", shape.labeldown, location.absolute, text = "B"), every bar
  // (upos[1] is na on the first bar)
  const upFlags = upos.map((v, i) => i > 0 && v > upos[i - 1]);
  const downFlags = dnos.map((v, i) => i > 0 && v > dnos[i - 1]);
  const markers: MarkerData[] = [];
  for (let i = 0; i < n; i++) {
    if (upFlags[i]) {
      markers.push({ id: 'shape0', time: bars[i].time, position: 'atPriceBottom', price: bars[i].low, shape: 'labelUp', color: upCss, text: 'B', textColor: '#FFFFFF', size: 'tiny' });
    }
    if (downFlags[i]) {
      markers.push({ id: 'shape1', time: bars[i].time, position: 'atPriceTop', price: bars[i].high, shape: 'labelDown', color: dnCss, text: 'B', textColor: '#FFFFFF', size: 'tiny' });
    }
  }

  // Extended lines: var uptl / dntl = line.new(na, na, na, na, style dashed, extend right), moved on each pivot (Show
  // Extended Lines on): uptl.set_xy1(n - offset, backpaint ? ph : upper - slope_ph * length),
  // uptl.set_xy2(n - offset + 1, backpaint ? ph - slope : upper - slope_ph * (length + 1)); dntl the mirror
  const interval = barInterval(bars);
  const lines: LineDrawingData[] = [];
  if (lastPhBar >= 0) {
    const i = lastPhBar;
    const y1 = backpaint ? upperArr[i] : upperArr[i] - slopePhArr[i] * length;
    const y2 = backpaint ? upperArr[i] - slopeArr[i] : upperArr[i] - slopePhArr[i] * (length + 1);
    lines.push({
      time1: barTime(bars, i - offset, interval), price1: y1,
      time2: barTime(bars, i - offset + 1, interval), price2: y2,
      color: upCss, width: 1, style: 'dashed', extend: 'right',
    });
  }
  if (lastPlBar >= 0) {
    const i = lastPlBar;
    const y1 = backpaint ? lowerArr[i] : lowerArr[i] + slopePlArr[i] * length;
    const y2 = backpaint ? lowerArr[i] + slopeArr[i] : lowerArr[i] + slopePlArr[i] * (length + 1);
    lines.push({
      time1: barTime(bars, i - offset, interval), price1: y1,
      time2: barTime(bars, i - offset + 1, interval), price2: y2,
      color: dnCss, width: 1, style: 'dashed', extend: 'right',
    });
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: { 'plot0': plot0, 'plot1': plot1 },
    markers,
    lines,
    alerts: alertStates(alertConditions, bars, [upFlags, downFlags]),
  };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'Upward Breakout', message: 'Price broke the down-trendline upward' },
  { id: 'alert1', title: 'Downward Breakout', message: 'Price broke the up-trendline downward' },
];

export const TrendlinesWithBreaks = { calculate, metadata, defaultInputs, inputConfig, plotConfig, alertConditions };
