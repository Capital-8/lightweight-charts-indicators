/**
 * Fractals Trend
 *
 * Fractal highs (the high of bar i - length is the highest high of the last 2 * length + 1 bars) and fractal lows
 * (mirror) are pushed into two arrays that start with `storage` zeros; on a bar without a fractal the oldest value
 * of an array longer than `storage` is removed (upper array first, one array per bar). The upper and lower bands are
 * the average, the max / min or the median of the arrays. The trend turns up when close crosses over the upper band
 * and down when close crosses under the lower band. The line is the lower band in an up trend and the upper band in
 * a down trend (broken on the trend change bars), with a gradient shadow to hl2 and fractal labels drawn on the
 * fractal bars.
 * Alerts (alertcondition, `alerts` of the result): 'Trend Up' / 'Trend Down' on the bars where the trend changes.
 *
 * Reference: "Fractals Trend [BigBeluga]" by BigBeluga
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 */

import { ta, Series, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { MarkerData } from '../types';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

export type FractalsTrendBandsType = 'avg' | 'min/max' | 'median';

export interface FractalsTrendInputs {
  /** Show the fractal labels */
  showFractals: boolean;
  /** Fractal detection length (bars on each side) */
  fractalLength: number;
  /** Number of fractals kept in each array */
  storage: number;
  /** Band calculation from the stored fractals */
  bandsType: FractalsTrendBandsType;
  /** Up trend colour (and fractal low labels) */
  colorSup: string;
  /** Down trend colour (and fractal high labels) */
  colorRes: string;
  /** Transparency of the shadow fill */
  shadow: number;
}

export const defaultInputs: FractalsTrendInputs = {
  showFractals: true,
  fractalLength: 5,
  storage: 3,
  bandsType: 'avg',
  colorSup: color.aqua,
  colorRes: color.orange,
  shadow: 80,
};

export const inputConfig: InputConfig[] = [
  { id: 'showFractals', type: 'bool', title: 'Show Fractals', defval: true },
  { id: 'fractalLength', type: 'int', title: 'Fractals Detection Length', defval: 5 },
  { id: 'storage', type: 'int', title: 'Fractals Storage Qty', defval: 3 },
  { id: 'bandsType', type: 'string', title: 'Bands Type', defval: 'avg', options: ['avg', 'min/max', 'median'] },
  { id: 'colorSup', type: 'color', title: 'Support Color', defval: color.aqua },
  { id: 'colorRes', type: 'color', title: 'Resistance Color', defval: color.orange },
  { id: 'shadow', type: 'int', title: 'Shadow Transparency', defval: 80 },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Fractal Line', color: color.aqua, lineWidth: 2, style: 'linebr' },
  { id: 'plot1', title: 'hl2', color: 'transparent', lineWidth: 1, display: 'none' },
];

export const metadata = {
  title: 'Fractals Trend [BigBeluga]',
  shortTitle: 'Fractals Trend [BigBeluga]',
  overlay: true,
};

/** Pine float comparisons with the 1e-10 tolerance; na operands give false */
const ge = (a: number, b: number): boolean => !isNaN(a) && !isNaN(b) && !(b - a > 1e-10);

/** Pine array.avg / array.max / array.min / array.median of a float array (na when empty) */
function arrAvg(a: number[]): number {
  if (a.length === 0) return NaN;
  let s = 0;
  for (const v of a) s += v;
  return s / a.length;
}
function arrMedian(a: number[]): number {
  if (a.length === 0) return NaN;
  const s = [...a].sort((x, y) => x - y);
  const m = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? s[m] : (s[m - 1] + s[m]) / 2;
}
const arrMax = (a: number[]): number => (a.length === 0 ? NaN : Math.max(...a));
const arrMin = (a: number[]): number => (a.length === 0 ? NaN : Math.min(...a));

export function calculate(
  bars: Bar[],
  inputs: Partial<FractalsTrendInputs> = {},
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[] } & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const { fractalLength: len, storage, bandsType } = cfg;
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const highs = bars.map((b) => b.high);
  const lows = bars.map((b) => b.low);
  const highest = A(ta.highest(Series.fromArray(bars, highs), len * 2 + 1));
  const lowest = A(ta.lowest(Series.fromArray(bars, lows), len * 2 + 1));

  // var FracrtalsUpper = array.new<float>(fCount, 0); var FracrtalsLower = array.new<float>(fCount, 0)
  const upperArr: number[] = new Array(storage).fill(0);
  const lowerArr: number[] = new Array(storage).fill(0);
  const upperF: boolean[] = new Array(n);
  const lowerF: boolean[] = new Array(n);
  const lineUpper: number[] = new Array(n);
  const lineLower: number[] = new Array(n);
  const trend: boolean[] = new Array(n);
  // var trend = bool(na): a Pine v6 bool is never na, bool(na) is false
  let tr = false;
  for (let i = 0; i < n; i++) {
    // upperF = high[fractalLen] >= ta.highest(high, fractalLen * 2 + 1); lowerF = low[fractalLen] <= ta.lowest(...)
    const hBack = i >= len ? highs[i - len] : NaN;
    const lBack = i >= len ? lows[i - len] : NaN;
    upperF[i] = ge(hBack, highest[i]);
    lowerF[i] = ge(lowest[i], lBack);
    // switch: the first true case only
    if (upperF[i]) upperArr.push(hBack);
    else if (lowerF[i]) lowerArr.push(lBack);
    else if (upperArr.length > storage) upperArr.shift();
    else if (lowerArr.length > storage) lowerArr.shift();

    lineUpper[i] = bandsType === 'avg' ? arrAvg(upperArr) : bandsType === 'min/max' ? arrMax(upperArr) : arrMedian(upperArr);
    lineLower[i] = bandsType === 'avg' ? arrAvg(lowerArr) : bandsType === 'min/max' ? arrMin(lowerArr) : arrMedian(lowerArr);

    const close = bars[i].close;
    const prevClose = i > 0 ? bars[i - 1].close : NaN;
    // ta.crossover(close, fractalLineUpper): close > upper and close[1] <= upper[1], exact comparisons (no tolerance)
    if (i > 0 && close > lineUpper[i] && prevClose <= lineUpper[i - 1]) tr = true;
    // ta.crossunder(close, fractalLineLower): close < lower and close[1] >= lower[1], exact comparisons
    if (i > 0 && close < lineLower[i] && prevClose >= lineLower[i - 1]) tr = false;
    trend[i] = tr;
  }

  const hl2 = bars.map((b) => (b.high + b.low) / 2);
  const fractalLine = trend.map((t, i) => (t ? lineLower[i] : lineUpper[i]));
  const trendColor = (i: number) => (trend[i] ? cfg.colorSup : cfg.colorRes);
  const plot0: { time: number; value: number; color: string }[] = [];
  const plot1: { time: number; value: number }[] = [];
  const topColor: Array<string | null> = [];
  const markers: MarkerData[] = [];
  for (let i = 0; i < n; i++) {
    const t = bars[i].time;
    // plot(trend != trend[1] ? na : fractalLine, style = plot.style_linebr, color = trendColor); trend[1] of bar 0
    // is false (Pine v6 bool history)
    const prevTrend = i > 0 ? trend[i - 1] : false;
    plot0.push({ time: t, value: trend[i] !== prevTrend ? NaN : fractalLine[i], color: trendColor(i) });
    plot1.push({ time: t, value: hl2[i] });
    // fill(pt, ph, fractalLine, hl2, color.new(trendColor, shadow), na)
    topColor.push(String(color.new(trendColor(i), cfg.shadow)));
    // plotshape(upperF / lowerF, location.abovebar / belowbar, size.tiny, color.new(colorRes / colorSup, 50),
    //   shape.labeldown / labelup, offset = -5): the shape of bar i is drawn on bar i - 5
    if (cfg.showFractals && i >= 5) {
      const tShift = bars[i - 5].time;
      if (upperF[i]) {
        markers.push({ time: tShift, position: 'aboveBar', shape: 'labelDown', color: String(color.new(cfg.colorRes, 50)), size: 'tiny' });
      }
      if (lowerF[i]) {
        markers.push({ time: tShift, position: 'belowBar', shape: 'labelUp', color: String(color.new(cfg.colorSup, 50)), size: 'tiny' });
      }
    }
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: { plot0, plot1 },
    fills: [{
      plot1: 'plot0', plot2: 'plot1',
      gradient: { topValue: fractalLine, bottomValue: hl2, topColor, bottomColor: new Array<string | null>(n).fill(null) },
    }],
    markers,
    // alertcondition(trend != trend[1] and trend, "Trend Up") / (trend != trend[1] and not trend, "Trend Down")
    alerts: alertStates(alertConditions, bars, [
      trend.map((t, i) => t !== (i > 0 ? trend[i - 1] : false) && t),
      trend.map((t, i) => t !== (i > 0 ? trend[i - 1] : false) && !t),
    ]),
  };
}

/** The original's alertconditions (no message: the default one) */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'Trend Up', message: 'Alert Fired!' },
  { id: 'alert1', title: 'Trend Down', message: 'Alert Fired!' },
];

export const FractalsTrend = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  alertConditions,
};
