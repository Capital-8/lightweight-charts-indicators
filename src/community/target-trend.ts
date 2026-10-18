/**
 * Target Trend [BigBeluga]
 *
 * Two bands: the SMA of the highs plus an ATR distance and the SMA of the lows minus it (the distance is 0.8 times
 * the 200-bar average of ATR(200)). A close that crosses above the upper band starts an up trend, a close that
 * crosses below the lower band a down trend. The candles take the trend colour, the band on the other side of the
 * price is drawn as a trailing stop with a gradient fill to hl2, and each change of trend is marked by a triangle.
 *
 * Each change of trend also draws five levels, 20 bars to the right: the stop (the trailing band), the entry (the
 * close) and three targets at 5, 10 and 15 ATR distances (plus the "Set Targets" input), with fills between stop,
 * entry and third target. While the trend lasts the levels follow the last bar; a level that a bar touches becomes a
 * dashed line with a check mark (a cross for the stop). The levels are removed when the trend changes.
 *
 * Chart values (third argument): the port reads the chart foreground and background colours (levels, labels, band
 * and fill colours; without them: #DBDBDB and #0F0F0F, a dark chart) and the state of the last bar: the trend
 * changes on a closed bar only, so a last bar that is still open does not change it (without it: the last bar is
 * closed). `plotConfig` has the band colour of the dark chart.
 *
 * Reference: "Target Trend [BigBeluga]" by BigBeluga
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © BigBeluga
 */

import { ta, str, math, color, Series, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { MarkerData, PlotCandleData, LineDrawingData, LabelData, LinefillData } from '../types';
import { barInterval, barTime } from '../bar-time';
import { backgroundColorOf, foregroundColorOf, lastBarConfirmedOf, type ChartContext } from '../chart-context';

export interface TargetTrendInputs {
  /** Length of the SMAs of the highs and of the lows */
  length: number;
  /** Added to the target multipliers (1x, 2x, 3x) */
  target: number;
}

export const defaultInputs: TargetTrendInputs = {
  length: 10,
  target: 0,
};

export const inputConfig: InputConfig[] = [
  { id: 'length', type: 'int', title: 'Trend Length', defval: 10 },
  { id: 'target', type: 'int', title: 'Set Targets', defval: 0 },
];

const UP_COLOR = '#06B690';
const DN_COLOR = String(color.rgb(182, 112, 6));
/** color.new(chart.fg_color, 80) without a chart context (dark chart) */
const PLOT_COLOR_DEFAULT = String(color.new(foregroundColorOf(), 80));

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Trailing Stop Up', color: PLOT_COLOR_DEFAULT, lineWidth: 1, style: 'linebr' },
  { id: 'plot1', title: 'Trailing Stop Down', color: PLOT_COLOR_DEFAULT, lineWidth: 1, style: 'linebr' },
  { id: 'plot2', title: 'HL2', color: '#2962FF', lineWidth: 1, display: 'none' },
];

export const metadata = {
  title: 'Target Trend [BigBeluga]',
  shortTitle: 'Target Trend [BigBeluga]',
  overlay: true,
};

/** Pine float comparisons: a >= b unless b - a > 1e-10 (na compares false) */
const EPS = 1e-10;
const ge = (a: number, b: number) => a - b >= -EPS;
const le = (a: number, b: number) => b - a >= -EPS;

interface Ln {
  x1: number;
  x2: number;
  y: number;
  color: string;
  dashed: boolean;
}
interface Lb {
  x: number;
  y: number;
  text: string;
  textColor: string;
}
/** type TrendTargets: stop loss, entry, target 1, 2, 3 */
interface Targets {
  lines: Ln[];
  labels: Lb[];
}

export function calculate(
  bars: Bar[],
  inputs: Partial<TargetTrendInputs> = {},
  chart?: ChartContext,
): Omit<IndicatorResult, 'markers' | 'lines' | 'labels' | 'linefills'> & {
  markers: MarkerData[];
  plotCandles: Record<string, PlotCandleData[]>;
  lines: LineDrawingData[];
  labels: LabelData[];
  linefills: LinefillData[];
} {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  // chart.fg_color / chart.bg_color
  const CHART_FG = foregroundColorOf(chart);
  const CHART_BG = backgroundColorOf(chart);
  const PLOT_COLOR = String(color.new(CHART_FG, 80));
  const FILL_COLOR = String(color.new(CHART_FG, 90));
  // barstate.isconfirmed: false on a last bar that is still open
  const lastConfirmed = lastBarConfirmedOf(chart);
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);

  const closeSeries = new Series(bars, (b) => b.close);
  const atrSeries = ta.sma(ta.atr(bars, 200), 200);
  const atrValue = A(atrSeries).map((v) => v * 0.8);
  const smaHighArr = A(ta.sma(new Series(bars, (b) => b.high), cfg.length)).map((v, i) => v + atrValue[i]);
  const smaLowArr = A(ta.sma(new Series(bars, (b) => b.low), cfg.length)).map((v, i) => v - atrValue[i]);
  const crossUp = ta.crossover(closeSeries, Series.fromArray(bars, smaHighArr)).toArray();
  const crossDown = ta.crossunder(closeSeries, Series.fromArray(bars, smaLowArr)).toArray();

  const up20 = String(color.new(UP_COLOR, 80));
  const dn20 = String(color.new(DN_COLOR, 80));
  const price = (v: number) => str.tostring(math.round(v, 2) as number);

  // var bool trend = na: an na bool is false in a condition (`not trend` is true)
  let trend: boolean | null = null;
  let countUp = 0;
  let countDown = 0;
  const targetsUp: Targets = { lines: [], labels: [] };
  const targetsDown: Targets = { lines: [], labels: [] };

  const plot0: Array<{ time: number; value: number; color: string }> = [];
  const plot1: Array<{ time: number; value: number; color: string }> = [];
  const plot2: Array<{ time: number; value: number }> = [];
  const trendValue: number[] = new Array(n);
  const hl2Arr: number[] = new Array(n);
  const candles: PlotCandleData[] = [];
  const markers: MarkerData[] = [];

  /** draw_targets(): the levels of one direction */
  const drawTargets = (i: number, targets: Targets, signal1: boolean, signal2: boolean, direction: boolean) => {
    const { high, low, close } = bars[i];
    const base = direction ? smaLowArr[i] : smaHighArr[i];
    const atrMultiplier = atrValue[i] * (direction ? 1 : -1);
    const count = direction ? countUp : countDown;

    if (signal1) {
      const len1 = atrMultiplier * (5 + cfg.target);
      const len2 = atrMultiplier * (10 + cfg.target * 2);
      const len3 = atrMultiplier * (15 + cfg.target * 3);
      // the lines and labels before are deleted
      const ys = [base, close, close + len1, close + len2, close + len3];
      targets.lines = ys.map((y) => ({ x1: i, x2: i + 20, y, color: CHART_FG, dashed: false }));
      const texts = [price(base), price(close), '１ - ' + price(ys[2]), '２ - ' + price(ys[3]), '３ - ' + price(ys[4])];
      targets.labels = ys.map((y, k) => ({ x: i + 20, y, text: texts[k], textColor: CHART_BG }));
    }
    if (signal2) {
      targets.lines = [];
      targets.labels = [];
    }

    for (let k = 0; k < targets.lines.length; k++) {
      const ln = targets.lines[k];
      const first = targets.lines[0];
      const firstLabel = targets.labels[0];
      const entryLine = targets.lines[1];
      const entryLabel = targets.labels[1];
      // a level that the bar touches
      if (ge(high, ln.y) && le(low, ln.y) && count > 1) {
        targets.labels[k].text = '   ✔   ';
        targets.labels[k].textColor = '#16AC09';
        ln.dashed = true;
        ln.color = PLOT_COLOR;
      }
      // the stop loss
      if (ge(high, first.y) && le(low, first.y) && count > 1) firstLabel.text = '  ✖  ';

      if (direction ? trend : !trend) {
        firstLabel.textColor = '#DB1E1E';
        ln.x2 = i + 20;
        first.color = '#DB1E1E';
        targets.labels[k].x = i + 20;
        entryLine.dashed = false;
        entryLine.color = UP_COLOR;
        entryLabel.text = '◉ ' + price(entryLine.y);
        entryLabel.textColor = '#1D80DD';
      }
    }
  };

  for (let i = 0; i < n; i++) {
    const { open, high, low, close, time } = bars[i];
    const trendPrev = trend;
    // `and barstate.isconfirmed`: every bar but a last bar that is still open
    const confirmed = i < n - 1 || lastConfirmed;
    if (crossUp[i] && confirmed) trend = true;
    if (crossDown[i] && confirmed) trend = false;
    const value = trend ? smaLowArr[i] : smaHighArr[i];
    trendValue[i] = value;
    hl2Arr[i] = (high + low) / 2;
    const trendColor = trend ? UP_COLOR : DN_COLOR;

    // ta.change(trend) and not trend[1] / trend[1]: the first trend (the value before is na) is not a change
    const changed = trendPrev !== null && trend !== trendPrev;
    const signalUp = changed && !trendPrev;
    const signalDown = changed && trendPrev === true;

    if (trend) {
      countDown = 0;
      countUp += 1;
    } else {
      countDown += 1;
      countUp = 0;
    }
    drawTargets(i, targetsDown, signalDown, signalUp, false);
    drawTargets(i, targetsUp, signalUp, signalDown, true);

    candles.push({ time, open, high, low, close, color: trendColor, wickColor: trendColor, borderColor: trendColor });
    plot0.push({ time, value: trend ? value : NaN, color: PLOT_COLOR });
    plot1.push({ time, value: !trend ? value : NaN, color: PLOT_COLOR });
    plot2.push({ time, value: hl2Arr[i] });

    const sigUp = signalUp ? low - atrValue[i] * 2 : NaN;
    const sigDn = signalDown ? high + atrValue[i] * 2 : NaN;
    if (!Number.isNaN(sigUp)) {
      markers.push({ time, position: 'atPriceMiddle', price: sigUp, shape: 'triangleUp', color: UP_COLOR, size: 'tiny', id: 'shape0' });
      markers.push({ time, position: 'atPriceMiddle', price: sigUp, shape: 'triangleUp', color: up20, size: 'small', id: 'shape1' });
    }
    if (!Number.isNaN(sigDn)) {
      markers.push({ time, position: 'atPriceMiddle', price: sigDn, shape: 'triangleDown', color: DN_COLOR, size: 'tiny', id: 'shape2' });
      markers.push({ time, position: 'atPriceMiddle', price: sigDn, shape: 'triangleDown', color: dn20, size: 'small', id: 'shape3' });
    }
  }

  const interval = barInterval(bars);
  const T = (index: number) => barTime(bars, index, interval);
  const lines: LineDrawingData[] = [];
  const labels: LabelData[] = [];
  const linefills: LinefillData[] = [];
  for (const targets of [targetsDown, targetsUp]) {
    const out = targets.lines.map((l): LineDrawingData => ({
      time1: T(l.x1), price1: l.y, time2: T(l.x2), price2: l.y, color: l.color, ...(l.dashed ? { style: 'dashed' as const } : {}),
    }));
    lines.push(...out);
    for (const l of targets.labels) {
      labels.push({ time: T(l.x), price: l.y, text: l.text, style: 'label_left', color: CHART_FG, textColor: l.textColor });
    }
    if (out.length) {
      linefills.push({ line1: out[0], line2: out[1], color: String(color.new(DN_COLOR, 95)) });
      linefills.push({ line1: out[1], line2: out[4], color: String(color.new(UP_COLOR, 95)) });
    }
  }

  const gradient = () => ({
    topValue: trendValue,
    bottomValue: hl2Arr,
    topColor: new Array<string | null>(n).fill(FILL_COLOR),
    bottomColor: new Array<string | null>(n).fill(null),
  });
  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: { plot0, plot1, plot2 },
    fills: [
      { plot1: 'plot0', plot2: 'plot2', gradient: gradient() },
      { plot1: 'plot1', plot2: 'plot2', gradient: gradient() },
    ],
    markers,
    plotCandles: { candles },
    lines,
    labels,
    linefills,
  };
}

export const TargetTrend = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
};
