/**
 * Liquidity Heatmap (Nephew_Sam_)
 *
 * Marks the swing highs and swing lows (pivots) of up to six higher timeframes with a shaded text block at the
 * pivot price: red for a swing high, green for a swing low. The higher the timeframe, the less transparent and the
 * longer the block (two rows for the two highest timeframes). A chart below 4 hours uses the six "intraday"
 * timeframes, any other chart the six "higher" ones. With "Hide lines lower than enabled timeframes?" only the
 * timeframes above the chart timeframe are used. On charts of 3 minutes or less the pivots of the 5-minute timeframe
 * (6 bars on each side) are also marked when the first timeframe is enabled.
 *
 * A pivot of a timeframe is shown from the first chart bar of the period that confirms it (as the original, which
 * reads the other timeframe with lookahead), at the time of the period that follows the pivot. At most 500 labels
 * are kept (the oldest are removed). A table at the bottom left shows the author name.
 *
 * Other timeframes: their bars are built from the chart bars, with the exchange calendar of the chart context when
 * it has one (third argument: `chart.timezone`, `chart.session`), else with the UTC calendar and the bars (see
 * src/anchor-period.ts). `chart.timeframe` is the chart timeframe; without it, it is taken from the bars.
 * A timeframe below the chart timeframe needs data that the chart bars do not have: with the "Hide lines" option
 * off, the port throws an Error for an enabled timeframe that is below the chart timeframe.
 *
 * Reference: "Liquidity Heatmap (Nephew_Sam_)" by Nephew_Sam_
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © Nephew_Sam_
 */

import { ta, Series, color, timeframe, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import { periodStarts, chartTimeframe, securityBars } from '../anchor-period';
import type { ChartContext } from '../chart-context';
import type { LabelData, TableData } from '../types';

export interface LiquidityHeatmapInputs {
  ltimeframe1Show: boolean;
  ltimeframe1: string;
  lleftBars1: number;
  lrightBars1: number;
  ltimeframe2Show: boolean;
  ltimeframe2: string;
  lleftBars2: number;
  lrightBars2: number;
  ltimeframe3Show: boolean;
  ltimeframe3: string;
  lleftBars3: number;
  lrightBars3: number;
  ltimeframe4Show: boolean;
  ltimeframe4: string;
  lleftBars4: number;
  lrightBars4: number;
  ltimeframe5Show: boolean;
  ltimeframe5: string;
  lleftBars5: number;
  lrightBars5: number;
  ltimeframe6Show: boolean;
  ltimeframe6: string;
  lleftBars6: number;
  lrightBars6: number;
  htimeframe1Show: boolean;
  htimeframe1: string;
  hleftBars1: number;
  hrightBars1: number;
  htimeframe2Show: boolean;
  htimeframe2: string;
  hleftBars2: number;
  hrightBars2: number;
  htimeframe3Show: boolean;
  htimeframe3: string;
  hleftBars3: number;
  hrightBars3: number;
  htimeframe4Show: boolean;
  htimeframe4: string;
  hleftBars4: number;
  hrightBars4: number;
  htimeframe5Show: boolean;
  htimeframe5: string;
  hleftBars5: number;
  hrightBars5: number;
  htimeframe6Show: boolean;
  htimeframe6: string;
  hleftBars6: number;
  hrightBars6: number;
  /** Hide lines lower than enabled timeframes? */
  hideLTF: boolean;
}

export const defaultInputs: LiquidityHeatmapInputs = {
  ltimeframe1Show: true, ltimeframe1: '15', lleftBars1: 7, lrightBars1: 7,
  ltimeframe2Show: true, ltimeframe2: '30', lleftBars2: 7, lrightBars2: 7,
  ltimeframe3Show: true, ltimeframe3: '60', lleftBars3: 7, lrightBars3: 6,
  ltimeframe4Show: true, ltimeframe4: '120', lleftBars4: 7, lrightBars4: 6,
  ltimeframe5Show: true, ltimeframe5: '240', lleftBars5: 6, lrightBars5: 6,
  ltimeframe6Show: true, ltimeframe6: 'D', lleftBars6: 5, lrightBars6: 5,
  htimeframe1Show: true, htimeframe1: '480', hleftBars1: 7, hrightBars1: 7,
  htimeframe2Show: true, htimeframe2: 'D', hleftBars2: 7, hrightBars2: 7,
  htimeframe3Show: true, htimeframe3: '3D', hleftBars3: 7, hrightBars3: 6,
  htimeframe4Show: true, htimeframe4: 'W', hleftBars4: 7, hrightBars4: 6,
  htimeframe5Show: true, htimeframe5: 'M', hleftBars5: 6, hrightBars5: 6,
  htimeframe6Show: false, htimeframe6: '2M', hleftBars6: 5, hrightBars6: 5,
  hideLTF: true,
};

const GRP1 = '•••••••••• INTRADAY TIMEFRAMES ••••••••••';
const GRP2 = '•••••••••• HIGHER TIMEFRAMES (> 4HR) ••••••••••';
const GRP3 = '•••••••••• Other Settings ••••••••••';
const PIVOT_TOOLTIP = 'Highest/lowest point in x right and left bars.';

function timeframeInputs(prefix: 'l' | 'h', group: string): InputConfig[] {
  const out: InputConfig[] = [];
  for (let k = 1; k <= 6; k++) {
    const inline = String(k);
    const d = defaultInputs as unknown as Record<string, boolean | string | number>;
    out.push(
      { id: `${prefix}timeframe${k}Show`, type: 'bool', title: '', defval: d[`${prefix}timeframe${k}Show`] as boolean, inline, group },
      { id: `${prefix}timeframe${k}`, type: 'timeframe', title: '', defval: d[`${prefix}timeframe${k}`] as string, inline, group },
      { id: `${prefix}leftBars${k}`, type: 'int', title: 'Left', defval: d[`${prefix}leftBars${k}`] as number, min: 2, max: 20, inline, group },
      {
        id: `${prefix}rightBars${k}`, type: 'int', title: 'Right', defval: d[`${prefix}rightBars${k}`] as number, min: 2, max: 20,
        inline, group, tooltip: PIVOT_TOOLTIP,
      },
    );
  }
  return out;
}

export const inputConfig: InputConfig[] = [
  ...timeframeInputs('l', GRP1),
  ...timeframeInputs('h', GRP2),
  { id: 'hideLTF', type: 'bool', title: 'Hide lines lower than enabled timeframes?', defval: true, group: GRP3 },
];

export const plotConfig: PlotConfig[] = [];

export const metadata = {
  title: 'Liquidity Heatmap (Nephew_Sam_)',
  shortTitle: 'Liquidity Heatmap (Nephew_Sam_)',
  overlay: true,
};

/** indicator(max_labels_count = 500) */
const MAX_LABELS = 500;

const RED = '#FF5252';
const GREEN = '#4CAF50';
const GRAY = '#787B86';
/** Transparency and text length of the six timeframes */
const TRANSPARENCY = [70, 60, 50, 40, 30, 20];
const LINE_LENGTH = [6, 10, 10, 10, 15, 15];

/** generateText(): n + 1 spaces then n + 1 blocks; twice, on two rows, when large */
function generateText(n: number, large = false): string {
  const row = ' '.repeat(n + 1) + '░'.repeat(n + 1);
  return large ? `${row}\n${row}` : row;
}

/** resolutionInMinutes(): length of a timeframe in minutes (a month counts 30.4375 days), na for an unknown unit */
function resolutionInMinutes(tf: string): number {
  if (tf === '') return NaN;
  const info = timeframe.info(tf);
  const unit = info.isseconds ? 1 / 60 : info.isminutes ? 1 : info.isdaily ? 60 * 24 : info.isweekly ? 60 * 24 * 7
    : info.ismonthly ? 60 * 24 * 30.4375 : NaN;
  return info.multiplier * unit;
}

interface Pivot {
  /** Chart bar on which the label is made */
  bar: number;
  time: number;
  price: number;
  high: boolean;
}

export function calculate(
  bars: Bar[],
  inputs: Partial<LiquidityHeatmapInputs> = {},
  chart?: ChartContext,
): Omit<IndicatorResult, 'labels' | 'tables'> & { labels: LabelData[]; tables: TableData[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const values = cfg as unknown as Record<string, boolean | string | number>;
  const n = bars.length;
  const chartTf = chartTimeframe(bars, chart);
  const chartMinutes = resolutionInMinutes(chartTf);

  /**
   * request.security(syminfo.tickerid, tf, getPivotData(lb, rb), lookahead = barmerge.lookahead_on), then
   * `na(ph[1]) and ph ? ph : na` on the chart bars: the pivots of the bars of timeframe `tf`, each on the first chart
   * bar of the period that confirms it. A pivot confirmed on the period right after another confirmation is skipped.
   */
  const pivotsOf = (tf: string, lb: number, rb: number): Pivot[] => {
    const minutes = resolutionInMinutes(tf);
    let htf: Bar[] = bars;
    let first: number[] = bars.map((_b, i) => i);
    if (minutes < chartMinutes) {
      throw new Error(`Liquidity Heatmap: the timeframe "${tf}" is lower than the chart timeframe "${chartTf}": the chart bars do not have that data`);
    }
    if (minutes > chartMinutes) {
      const calendar = securityBars(bars, tf, chart);
      if (calendar) {
        htf = calendar.htf;
        first = calendar.first;
      } else {
        const starts = periodStarts(bars, tf, chart);
        htf = [];
        first = [];
        bars.forEach((b, i) => {
          if (i === 0 || starts[i] !== starts[i - 1]) {
            htf.push({ time: starts[i], open: b.open, high: b.high, low: b.low, close: b.close, volume: b.volume ?? NaN });
            first.push(i);
          } else {
            const last = htf[htf.length - 1];
            last.high = Math.max(last.high, b.high);
            last.low = Math.min(last.low, b.low);
            last.close = b.close;
          }
        });
      }
    }
    const out: Pivot[] = [];
    const ph = ta.pivothigh(new Series(htf, (b) => b.high), lb, rb).toArray().map((v) => v ?? NaN);
    const pl = ta.pivotlow(new Series(htf, (b) => b.low), lb, rb).toArray().map((v) => v ?? NaN);
    for (let j = 0; j < htf.length; j++) {
      for (const [p, high] of [[ph, true], [pl, false]] as Array<[number[], boolean]>) {
        // `ph ? ...`: na and 0 are false; the start time is time[rb - 1] of the timeframe
        const found = !isNaN(p[j]) && p[j] !== 0 && (j === 0 || isNaN(p[j - 1]));
        if (found && j - rb + 1 >= 0) out.push({ bar: first[j], time: htf[j - rb + 1].time, price: p[j], high });
      }
    }
    return out;
  };

  // isLtf = resolutionInMinutes() < resolutionInMinutes("240")
  const isLtf = chartMinutes < 240;
  const prefix = isLtf ? 'l' : 'h';

  // Label creations in script order: per bar, the 5-minute pivots, then timeframes 1 to 6, the high before the low
  const created: Array<{ bar: number; slot: number; label: LabelData }> = [];
  const add = (slot: number, pivots: Pivot[], text: string, transparency: number) => {
    for (const p of pivots) {
      created.push({
        bar: p.bar,
        slot: slot * 2 + (p.high ? 0 : 1),
        label: {
          time: p.time, price: p.price, text, style: 'none',
          textColor: String(color.new(p.high ? RED : GREEN, transparency)),
        },
      });
    }
  };

  // Chart of 3 minutes or less: the pivots of the 5-minute timeframe
  if (values[`${prefix}timeframe1Show`] && chartMinutes <= 3) {
    add(0, pivotsOf('5', 6, 6), generateText(12), TRANSPARENCY[0]);
  }
  for (let k = 1; k <= 6; k++) {
    const tf = values[`${prefix}timeframe${k}`] as string;
    // notLowerTimeframe(tf)
    const valid = cfg.hideLTF ? chartMinutes < resolutionInMinutes(tf) : true;
    if (!values[`${prefix}timeframe${k}Show`] || !valid || isNaN(chartMinutes)) continue;
    const lb = Math.trunc(values[`${prefix}leftBars${k}`] as number);
    const rb = Math.trunc(values[`${prefix}rightBars${k}`] as number);
    add(k, pivotsOf(tf, lb, rb), generateText(LINE_LENGTH[k - 1], k >= 5), TRANSPARENCY[k - 1]);
  }
  created.sort((a, b) => a.bar - b.bar || a.slot - b.slot);

  // When a creation brings the count above max + 5, the oldest labels are removed until max remain
  const labels: LabelData[] = [];
  for (const c of created) {
    labels.push(c.label);
    if (labels.length > MAX_LABELS + 5) labels.splice(0, labels.length - MAX_LABELS);
  }

  // Watermark, made on the last bar
  const tables: TableData[] = n === 0 ? [] : [{
    position: 'bottom_left', columns: 1, rows: 1,
    cells: [{ column: 0, row: 0, text: '@Nephew_Sam_', textSize: 'small', textColor: String(color.new(GRAY, 50)) }],
  }];

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {},
    labels,
    tables,
  };
}

export const LiquidityHeatmap = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
};
