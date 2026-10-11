/**
 * VWAP Deviation Oscillator
 *
 * VWAP = sum(hlc3 * volume) / sum(volume) over a window: the last N bars (rolling), the bars since the start of the
 * current 4-hour / day / week period (periods counted in UTC from the Unix epoch), or the bars of the last N days
 * before the current time. The oscillator is the deviation of the price (hlc3 or close) from the VWAP: in price
 * units, in percent, or as a z-score over a window. Histogram columns take one of ten colours by the deviation zone
 * (multiples 0.5 / 1 / 2 / 2.8 of the standard deviation of the deviation, with a minimum, or fixed z levels).
 * Lines at +-1, 2 and 3 standard deviations; in line mode, a fill between the oscillator and zero.
 *
 * The mode 'Rolling (Lookback: Days)' counts back from the current time (timenow). The port reads it from the optional
 * third argument (see src/chart-context.ts); without it, it is the clock of the computer.
 *
 * Reference: "VWAP Deviation Oscillator [BackQuant]" by BackQuant
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © BackQuant
 */

import { ta, Series, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import { nowOf, type ChartContext } from '../chart-context';

export type VwapMode = '4 Hours' | 'Daily' | 'Weekly' | 'Rolling (Lookback: Bars)' | 'Rolling (Lookback: Days)';

export interface VwapDeviationOscillatorInputs {
  /** VWAP window: periods reset every 4 hours / day / week (UTC), or a rolling window of bars or days */
  sessionType: VwapMode;
  /** Bars of the 'Rolling (Lookback: Bars)' mode */
  rollingPeriod: number;
  /** Days of the 'Rolling (Lookback: Days)' mode (counted back from the current time) */
  rollingDays: number;
  /** Use close instead of hlc3 as the price compared with the VWAP */
  useClose: boolean;
  /** Deviation: 'Percent', 'Absolute' (price units) or 'Z-Score' */
  devMode: 'Percent' | 'Absolute' | 'Z-Score';
  /** Window of the z-score mean and standard deviation */
  zWin: number;
  /** 'Histogram' (zone coloured columns) or 'Line' */
  plotType: 'Histogram' | 'Line';
  /** Show the +-1, 2, 3 standard deviation lines */
  showStddev: boolean;
  posCol: string;
  negCol: string;
  /** Fill between the line oscillator and zero */
  fillLines: boolean;
  /** Transparency of the fill (Pine "Fill Opacity") */
  fillAlpha: number;
  /** Line width (input of the Pine script; the port plot widths stay 1) */
  lineW: number;
  /** Placeholder input of the Pine script (not used by its computation) */
  confirm: boolean;
  /** Standard deviation window of the percent deviation */
  pctVolLookback: number;
  /** Minimum standard deviation of the percent deviation */
  pctMinSigma: number;
  /** Standard deviation window of the absolute deviation */
  absVolLookback: number;
}

export const defaultInputs: VwapDeviationOscillatorInputs = {
  sessionType: 'Rolling (Lookback: Bars)',
  rollingPeriod: 20,
  rollingDays: 30,
  useClose: false,
  devMode: 'Absolute',
  zWin: 50,
  plotType: 'Histogram',
  showStddev: true,
  posCol: '#00ff00',
  negCol: '#ff0000',
  fillLines: true,
  fillAlpha: 60,
  lineW: 1,
  confirm: true,
  pctVolLookback: 100,
  pctMinSigma: 0.1,
  absVolLookback: 100,
};

export const inputConfig: InputConfig[] = [
  { id: 'sessionType', type: 'string', title: 'VWAP Mode', defval: 'Rolling (Lookback: Bars)', options: ['4 Hours', 'Daily', 'Weekly', 'Rolling (Lookback: Bars)', 'Rolling (Lookback: Days)'], group: 'Calculation Settings' },
  { id: 'rollingPeriod', type: 'int', title: 'Rolling (Lookback: Bars)', defval: 20, min: 1, group: 'Calculation Settings' },
  { id: 'rollingDays', type: 'int', title: 'Rolling (Lookback: Days)', defval: 30, min: 1, group: 'Calculation Settings' },
  { id: 'useClose', type: 'bool', title: 'Use Close instead of HLC3', defval: false, group: 'Calculation Settings' },
  { id: 'devMode', type: 'string', title: 'Deviation Mode', defval: 'Absolute', options: ['Percent', 'Absolute', 'Z-Score'], group: 'Deviation Mode' },
  { id: 'zWin', type: 'int', title: 'Z/Std Window', defval: 50, min: 5, group: 'Deviation Mode' },
  { id: 'plotType', type: 'string', title: 'Plot Type', defval: 'Histogram', options: ['Histogram', 'Line'], group: 'Visual Settings' },
  { id: 'showStddev', type: 'bool', title: 'Show Standard Deviations', defval: true, group: 'Visual Settings' },
  { id: 'posCol', type: 'color', title: 'Positive Color', defval: '#00ff00', group: 'Visual Settings' },
  { id: 'negCol', type: 'color', title: 'Negative Color', defval: '#ff0000', group: 'Visual Settings' },
  { id: 'fillLines', type: 'bool', title: 'Fill Line Oscillator', defval: true, group: 'Visual Settings' },
  { id: 'fillAlpha', type: 'int', title: 'Fill Opacity', defval: 60, min: 0, max: 100, group: 'Visual Settings' },
  { id: 'lineW', type: 'int', title: 'Line Width', defval: 1, min: 1, max: 5, group: 'Visual Settings' },
  { id: 'confirm', type: 'bool', title: 'Histogram Confirmation', defval: true, group: 'Volatility Controls' },
  { id: 'pctVolLookback', type: 'int', title: 'Percent Mode Volatility Lookback', defval: 100, min: 10, group: 'Volatility Controls' },
  { id: 'pctMinSigma', type: 'float', title: 'Minimum Sigma Guard (pct pts)', defval: 0.1, min: 0.01, group: 'Volatility Controls' },
  { id: 'absVolLookback', type: 'int', title: 'Absolute Mode Volatility Lookback', defval: 100, min: 10, group: 'Volatility Controls' },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'VWAP Deviation', color: '#1dcaff', lineWidth: 1, style: 'columns' },
  { id: 'plot1', title: 'Zero', color: '#ffffff', lineWidth: 1 },
  { id: 'plot2', title: 'Std +1', color: '#00ff00', lineWidth: 1 },
  { id: 'plot3', title: 'Std +2', color: '#00ff00', lineWidth: 1 },
  { id: 'plot4', title: 'Std +3', color: '#00ff00', lineWidth: 1 },
  { id: 'plot5', title: 'Std -1', color: '#ff0000', lineWidth: 1 },
  { id: 'plot6', title: 'Std -2', color: '#ff0000', lineWidth: 1 },
  { id: 'plot7', title: 'Std -3', color: '#ff0000', lineWidth: 1 },
];

export const metadata = {
  title: 'VWAP Deviation Oscillator [BackQuant]',
  shortTitle: 'VWAP Deviation [BackQuant]',
  overlay: false,
};

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const ge = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(b - a > EPS);

/** Zone colours: 0..4 positive (weak to strong), 5..9 negative (weak to strong) */
const ZONE_COLORS = [
  String(color.new('#1dcaff', 70)), String(color.new('#1e9b25', 70)), String(color.new('#00ff00', 60)),
  String(color.new('#00ff00', 20)), String(color.new('#33ff00', 0)), String(color.new('#e65100', 70)),
  String(color.new('#771515', 70)), String(color.new('#ff0000', 60)), String(color.new('#ff0000', 20)),
  String(color.new('#ff0000', 0)),
];

/** getPeriodId(): the 4-hour / day / week number of a bar time (ms), counted from the Unix epoch */
function periodId(timeMs: number, mode: VwapMode): number {
  const sec = timeMs / 1000;
  if (mode === '4 Hours') return Math.floor(Math.floor(sec / 3600) / 4);
  if (mode === 'Daily') return Math.floor(sec / 86400);
  if (mode === 'Weekly') return Math.floor((Math.floor(sec / 86400) + 3) / 7);
  return NaN;
}

export function calculate(bars: Bar[], inputs: Partial<VwapDeviationOscillatorInputs> = {}, chart?: ChartContext): IndicatorResult {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const S = (a: number[]) => Series.fromArray(bars, a.map((v) => (Number.isFinite(v) ? v : NaN)));
  const isRollingBars = cfg.sessionType === 'Rolling (Lookback: Bars)';
  const isRollingDays = cfg.sessionType === 'Rolling (Lookback: Days)';
  const timeMs = bars.map((b) => b.time * 1000);
  const timenow = nowOf(chart);

  // Window length per bar
  const period: number[] = new Array(n);
  let lastPeriodId = NaN; // var int lastPeriodId = na
  let currentPeriodStart = NaN; // var int currentPeriodStart = na
  for (let i = 0; i < n; i++) {
    if (isRollingBars) {
      period[i] = cfg.rollingPeriod;
    } else if (isRollingDays) {
      // bars of the last rollingDays days before the current time (timenow), at most 2001
      const cutoff = timenow - cfg.rollingDays * 86400000;
      let count = 0;
      for (let k = 0; k <= 2000; k++) {
        if (i - k >= 0 && timeMs[i - k] >= cutoff) count += 1;
        else break;
      }
      period[i] = count;
    } else {
      const id = periodId(timeMs[i], cfg.sessionType);
      if (isNaN(lastPeriodId) || id !== lastPeriodId) {
        lastPeriodId = id;
        currentPeriodStart = i;
      }
      period[i] = Math.max(1, i - currentPeriodStart + 1);
    }
  }

  // vwapValue = math.sum(hlc3 * volume, period) / math.sum(volume, period)
  const hlc3 = bars.map((b) => (b.high + b.low + b.close) / 3);
  const pv = bars.map((b, i) => hlc3[i] * (b.volume ?? NaN));
  const vol = bars.map((b) => b.volume ?? NaN);
  const vwap: number[] = new Array(n);
  for (let i = 0; i < n; i++) {
    const len = period[i];
    if (!(len > 0)) {
      // Pine runtime error of math.sum
      throw new Error(`Error on bar ${i}: Invalid value of the 'length' argument (${len.toFixed(1)}) in the 'sum' function. It must be > 0.`);
    }
    if (i + 1 < len) {
      vwap[i] = NaN;
      continue;
    }
    let sPv = 0;
    let sV = 0;
    for (let k = i - len + 1; k <= i; k++) {
      sPv += pv[k];
      sV += vol[k];
    }
    vwap[i] = sPv / sV;
  }

  // Deviations
  const priceRef = cfg.useClose ? bars.map((b) => b.close) : hlc3;
  const residAbs = priceRef.map((p, i) => p - vwap[i]);
  const residPct = priceRef.map((p, i) => 100 * (p / vwap[i] - 1));
  const muR = A(ta.sma(S(residAbs), cfg.zWin));
  const sdR = A(ta.stdev(S(residAbs), cfg.zWin));
  const zRaw = residAbs.map((r, i) => (r - muR[i]) / sdR[i]);
  const osc = cfg.devMode === 'Percent' ? residPct : cfg.devMode === 'Absolute' ? residAbs : zRaw;

  const sigmaPct = A(ta.stdev(S(residPct), cfg.pctVolLookback));
  const sigmaAbs = A(ta.stdev(S(residAbs), cfg.absVolLookback));
  // math.max(x, guard): na when x is na
  const sp = sigmaPct.map((v) => (isNaN(v) ? NaN : Math.max(v, cfg.pctMinSigma)));
  const sa = sigmaAbs.map((v) => (isNaN(v) ? NaN : Math.max(v, 1.0)));

  type Point = { time: number; value: number; color: string };
  const plots: Record<string, Point[]> = {};
  for (let p = 0; p < 8; p++) plots[`plot${p}`] = [];
  const fillColors: string[] = [];
  const histogram = cfg.plotType === 'Histogram';
  const val = (v: number) => (Number.isFinite(v) ? v : NaN);

  for (let i = 0; i < n; i++) {
    const t = bars[i].time;
    const o = osc[i];
    // Zone index: thresholds 0.5 / 1 / 2 / 2.8 times sigma (fixed values in the z-score mode)
    const s = cfg.devMode === 'Percent' ? sp[i] : cfg.devMode === 'Absolute' ? sa[i] : 1.0;
    const c1 = 0.5 * s;
    const c2 = 1.0 * s;
    const c3 = 2.0 * s;
    const c4 = 2.8 * s;
    const idx = ge(o, c4) ? 4 : ge(o, c3) ? 3 : ge(o, c2) ? 2 : ge(o, c1) ? 1 : ge(o, 0) ? 0
      : gt(o, -c1) ? 5 : gt(o, -c2) ? 6 : gt(o, -c3) ? 7 : gt(o, -c4) ? 8 : 9;
    const oscColor = histogram ? ZONE_COLORS[idx] : ge(o, 0) ? cfg.posCol : cfg.negCol;

    plots.plot0.push({ time: t, value: val(o), color: oscColor });
    plots.plot1.push({ time: t, value: 0, color: String(color.new(color.white, 0)) });
    // s1 = sp / sa / 1.0 by the deviation mode; s2 = 2 * s1; s3 = 3 * s1
    const show = cfg.showStddev;
    plots.plot2.push({ time: t, value: show ? s : NaN, color: cfg.posCol });
    plots.plot3.push({ time: t, value: show ? s * 2 : NaN, color: cfg.posCol });
    plots.plot4.push({ time: t, value: show ? s * 3 : NaN, color: cfg.posCol });
    plots.plot5.push({ time: t, value: show ? -s : NaN, color: cfg.negCol });
    plots.plot6.push({ time: t, value: show ? -s * 2 : NaN, color: cfg.negCol });
    plots.plot7.push({ time: t, value: show ? -s * 3 : NaN, color: cfg.negCol });
    // fill(plot1, zero, fillLines ? color.new(oscColor, fillAlpha) : color.rgb(255, 255, 255, 100))
    fillColors.push(cfg.fillLines ? String(color.new(oscColor, cfg.fillAlpha)) : 'transparent');
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots,
    // display = plotType == "Histogram" ? display.none : display.all: FillData has no display option, so the fill is
    // returned only in the line mode
    fills: histogram ? [] : [{ plot1: 'plot0', plot2: 'plot1', options: { title: 'Plot Fill' }, colors: fillColors }],
  };
}

export const VwapDeviationOscillator = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
};
