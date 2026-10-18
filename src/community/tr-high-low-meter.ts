/**
 * TR High/Low meter
 *
 * On a bar where the highest source of the look-back window rises, the true range is added to a list; on a bar
 * where the lowest source falls, minus the true range is added. The list keeps the last `lookBack` entries and the
 * meter is their sum (optionally smoothed by an EMA), drawn as an area. Its colour is green above zero and red below,
 * with a transparency from the count of advances (declines below zero) since the zero cross relative to the highest
 * count so far. Optional no-trade-zone lines and a circle on 0 inside the zone; a +1 / -1 line gives the sign.
 * Alerts (alertcondition, `alerts` of the result): 'Buy Signal' when the meter crosses up through 0 (through the high
 * threshold with the no-trade zone), 'Sell Signal' the mirror, 'Neutral Signal' when it falls back below the high
 * threshold (always, as the original) or rises back above the low threshold (with the no-trade zone).
 *
 * Reference: "TR High/Low meter" by dman103
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © dman103
 */

import { ta, Series, getSourceSeries, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar, type SourceType } from 'oakscriptjs';
import type { BarColorData } from '../types';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

export interface TrHighLowMeterInputs {
  /** Look-back of the highest / lowest source and length of the true range list */
  lookBack: number;
  src: SourceType;
  /** EMA smoothing of the meter */
  emaSmooth: boolean;
  emaLength: number;
  /** Colour the bars with the meter colour */
  colorBars: boolean;
  /** Use the no-trade zone (alerts and the zone circle) */
  useThreshold: boolean;
  /** Draw the no-trade zone lines */
  displayTradeZoneLines: boolean;
  longThreshold: number;
  shortThreshold: number;
}

export const defaultInputs: TrHighLowMeterInputs = {
  lookBack: 7,
  src: 'close',
  emaSmooth: false,
  emaLength: 7,
  colorBars: false,
  useThreshold: false,
  displayTradeZoneLines: false,
  longThreshold: 10,
  shortThreshold: -10,
};

export const inputConfig: InputConfig[] = [
  { id: 'lookBack', type: 'int', title: 'Look back', defval: 7 },
  { id: 'src', type: 'source', title: 'Source', defval: 'close' },
  { id: 'emaSmooth', type: 'bool', title: 'EMA smoothing', defval: false },
  { id: 'emaLength', type: 'int', title: 'EMA Length', defval: 7 },
  { id: 'colorBars', type: 'bool', title: 'Color bars', defval: false },
  { id: 'useThreshold', type: 'bool', title: 'Use no trade zone', defval: false, group: 'No trade zone' },
  { id: 'displayTradeZoneLines', type: 'bool', title: 'Display trade zones lines', defval: false, group: 'No trade zone' },
  { id: 'longThreshold', type: 'float', title: 'High Threshold', defval: 10, step: 0.5, min: 0, group: 'No trade zone' },
  { id: 'shortThreshold', type: 'float', title: 'Low Threshold', defval: -10, step: 0.5, max: 0, group: 'No trade zone' },
];

const ZONE_COL = String(color.new(color.blue, 44));
const NEUTRAL_COL = String(color.new(color.white, 50));

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'TR High/Low Meter', color: color.green, lineWidth: 2, style: 'area' },
  { id: 'plot1', title: 'High Threshold', color: ZONE_COL, lineWidth: 2 },
  { id: 'plot2', title: 'Low Threshold', color: ZONE_COL, lineWidth: 2 },
  { id: 'plot3', title: 'External Indicator 1 or -1]', color: color.blue, lineWidth: 1 },
  { id: 'plot4', title: 'Neutral Zone', color: NEUTRAL_COL, lineWidth: 1, style: 'circles' },
];

export const metadata = {
  title: 'TR High/Low meter',
  shortTitle: 'TR HL meter',
  overlay: false,
};

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const ge = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(b - a > EPS);
const le = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(a - b > EPS);

export function calculate(
  bars: Bar[],
  inputs: Partial<TrHighLowMeterInputs> = {},
): IndicatorResult & { barColors: BarColorData[] } & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const src = getSourceSeries(bars, cfg.src);
  const highest = A(ta.highest(src, cfg.lookBack));
  const lowest = A(ta.lowest(src, cfg.lookBack));
  const tr = A(ta.tr(bars, false));

  // var float[] arr: +TR on a new highest, -TR on a new lowest, the last lookBack entries kept
  const arr: number[] = [];
  const sumTotal: number[] = new Array(n);
  for (let i = 0; i < n; i++) {
    if (i > 0 && gt(highest[i], highest[i - 1])) {
      arr.push(tr[i]);
      while (arr.length > cfg.lookBack) arr.shift();
    }
    if (i > 0 && lt(lowest[i], lowest[i - 1])) {
      arr.push(-tr[i]);
      while (arr.length > cfg.lookBack) arr.shift();
    }
    // array.sum: na for an empty array, na values skipped
    let s = NaN;
    for (const v of arr) if (!isNaN(v)) s = isNaN(s) ? v : s + v;
    sumTotal[i] = s;
  }
  const result = cfg.emaSmooth ? A(ta.ema(Series.fromArray(bars, sumTotal), cfg.emaLength)) : sumTotal;

  // f_c_gradientAdvDec(plot_result, 0, color.red, color.green)
  const plotColor: (string | null)[] = new Array(n);
  let maxAdvDec = 0; // var float _maxAdvDec = 0.
  let qtyAdvDec = 0; // var float _qtyAdvDec = 0.
  let ret: string | null = null; // var color _return = na
  let last = NaN; // ta.crossover / crossunder: the last bar where the source was not na
  for (let i = 0; i < n; i++) {
    const x = result[i];
    // ta.crossover(_source, 0) / ta.crossunder(_source, 0) compare exactly (no 1e-10 tolerance)
    const xUp = !isNaN(x) && !isNaN(last) && x > 0 && last <= 0;
    const xDn = !isNaN(x) && !isNaN(last) && x < 0 && last >= 0;
    if (!isNaN(x)) last = x;
    const chg = i > 0 ? x - result[i - 1] : NaN;
    const up = gt(chg, 0);
    const dn = lt(chg, 0);
    const srcBull = gt(x, 0);
    const srcBear = lt(x, 0);
    qtyAdvDec = srcBull
      ? (xUp ? 1 : up ? qtyAdvDec + 1 : dn ? Math.max(1, qtyAdvDec - 1) : qtyAdvDec)
      : srcBear
        ? (xDn ? 1 : dn ? qtyAdvDec + 1 : up ? Math.max(1, qtyAdvDec - 1) : qtyAdvDec)
        : qtyAdvDec;
    maxAdvDec = Math.max(maxAdvDec, qtyAdvDec);
    // 0 / 0 (no advance yet) gives na: color.new(c, na) is transparent
    const transp = 100 - (qtyAdvDec * 100) / maxAdvDec - 50;
    const withT = (c: string) => (isNaN(transp) ? 'transparent' : String(color.new(c, transp)));
    ret = srcBull ? withT(color.green) : srcBear ? withT(color.red) : ret;
    plotColor[i] = ret;
  }

  const plot0: { time: number; value: number; color: string }[] = [];
  const plot1: { time: number; value: number; color: string }[] = [];
  const plot2: { time: number; value: number; color: string }[] = [];
  const plot3: { time: number; value: number; color: string }[] = [];
  const plot4: { time: number; value: number; color: string }[] = [];
  const barColors: BarColorData[] = [];
  const zoneLines = cfg.useThreshold && cfg.displayTradeZoneLines;
  for (let i = 0; i < n; i++) {
    const t = bars[i].time;
    const x = result[i];
    plot0.push({ time: t, value: x, color: plotColor[i] ?? 'transparent' });
    if (cfg.colorBars && plotColor[i] !== null) barColors.push({ time: t, color: plotColor[i] as string });
    plot1.push({ time: t, value: zoneLines ? cfg.longThreshold : NaN, color: ZONE_COL });
    plot2.push({ time: t, value: zoneLines ? cfg.shortThreshold : NaN, color: ZONE_COL });
    // plot(plot_result > 0 ? 1 : -1, "External Indicator 1 or -1]", editable = false)
    plot3.push({ time: t, value: gt(x, 0) ? 1 : -1, color: color.blue });
    // neutral_plot = plot_result < LongThreshold and plot_result > ShortThreshold
    const neutral = lt(x, cfg.longThreshold) && gt(x, cfg.shortThreshold);
    plot4.push({ time: t, value: cfg.useThreshold && neutral ? 0 : NaN, color: NEUTRAL_COL });
  }

  // long_Condition / short_Condition / neutral_Condition of the original
  const L = cfg.longThreshold;
  const S = cfg.shortThreshold;
  const useT = cfg.useThreshold;
  const longFlags: boolean[] = [], shortFlags: boolean[] = [], neutralFlags: boolean[] = [];
  for (let i = 0; i < n; i++) {
    const x = result[i];
    const x1 = i > 0 ? result[i - 1] : NaN;
    longFlags.push((ge(x, 0) && gt(x, L) && lt(x1, L) && useT) || (ge(x, 0) && lt(x1, 0) && !useT));
    shortFlags.push((le(x, 0) && lt(x, S) && gt(x1, S) && useT) || (le(x, 0) && gt(x1, 0) && !useT));
    neutralFlags.push((lt(x, L) && gt(x1, L)) || (gt(x, S) && lt(x1, S) && useT));
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: { plot0, plot1, plot2, plot3, plot4 },
    barColors,
    alerts: alertStates(alertConditions, bars, [longFlags, shortFlags, neutralFlags]),
  };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'Buy Signal', message: 'Buy Signal' },
  { id: 'alert1', title: 'Sell Signal', message: 'Sell Signal' },
  { id: 'alert2', title: 'Neutral Signal', message: 'Neutral Signal' },
];

export const TrHighLowMeter = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  alertConditions,
};
