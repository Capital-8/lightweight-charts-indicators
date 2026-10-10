/**
 * ATR Stop Loss Finder
 *
 * Two stop levels from the average true range: a short stop at source 1 (the high) plus the smoothed true range
 * times the multiplier, a long stop at source 2 (the low) minus it. The smoothing is RMA, SMA, EMA or WMA. A table at
 * the bottom centre of the chart shows the ATR distance and both stops of the last bar.
 *
 * The original draws a price line on each plot (`trackprice`, "Show Price Lines"); the plot output has no such
 * option, so the input has no effect here.
 *
 * Reference: "Average True Range Stop Loss Finder" by veryfid
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 */

import {
  ta, str, color, Series, getSourceSeries, type IndicatorResult, type InputConfig, type PlotConfig, type Bar, type SourceType,
} from 'oakscriptjs';
import type { TableData } from '../types';

export interface AtrStopLossFinderInputs {
  /** Length */
  length: number;
  /** Smoothing */
  smoothing: 'RMA' | 'SMA' | 'EMA' | 'WMA';
  /** Multiplier */
  m: number;
  /** Source of the short stop */
  src1: SourceType;
  /** Source of the long stop */
  src2: SourceType;
  /** Show Price Lines */
  pline: boolean;
  /** ATR Text Color */
  col1: string;
  /** Low Text Color */
  col2: string;
  /** High Text Color */
  col3: string;
  /** Low Line Color */
  collong: string;
  /** High Line Color */
  colshort: string;
}

// Colours of the original Pine version
const BLUE = '#2196F3';
const TEAL = '#00897B';
const RED = '#FF5252';

export const defaultInputs: AtrStopLossFinderInputs = {
  length: 14,
  smoothing: 'RMA',
  m: 1.5,
  src1: 'high',
  src2: 'low',
  pline: true,
  col1: BLUE,
  col2: TEAL,
  col3: RED,
  collong: TEAL,
  colshort: RED,
};

export const inputConfig: InputConfig[] = [
  { id: 'length', type: 'int', title: 'Length', defval: 14, min: 1 },
  { id: 'smoothing', type: 'string', title: 'Smoothing', defval: 'RMA', options: ['RMA', 'SMA', 'EMA', 'WMA'] },
  { id: 'm', type: 'float', title: 'Multiplier', defval: 1.5 },
  { id: 'src1', type: 'source', title: 'src1', defval: 'high' },
  { id: 'src2', type: 'source', title: 'src2', defval: 'low' },
  { id: 'pline', type: 'bool', title: 'Show Price Lines', defval: true },
  { id: 'col1', type: 'color', title: 'ATR Text Color', defval: BLUE },
  { id: 'col2', type: 'color', title: 'Low Text Color', defval: TEAL, inline: '1' },
  { id: 'col3', type: 'color', title: 'High Text Color', defval: RED, inline: '2' },
  { id: 'collong', type: 'color', title: 'Low Line Color', defval: TEAL, inline: '1' },
  { id: 'colshort', type: 'color', title: 'High Line Color', defval: RED, inline: '2' },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'ATR Short Stop Loss', color: String(color.new(RED, 20)), lineWidth: 1 },
  { id: 'plot1', title: 'ATR Long Stop Loss', color: String(color.new(TEAL, 20)), lineWidth: 1 },
];

export const metadata = {
  title: 'Average True Range Stop Loss Finder',
  shortTitle: 'ATR',
  overlay: true,
};

export function calculate(
  bars: Bar[],
  inputs: Partial<AtrStopLossFinderInputs> = {},
): IndicatorResult & { tables: TableData[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);

  // ma_function(tr(true), length)
  const tr = ta.tr(bars, true);
  const ma = A(cfg.smoothing === 'RMA' ? ta.rma(tr, cfg.length)
    : cfg.smoothing === 'SMA' ? ta.sma(tr, cfg.length)
      : cfg.smoothing === 'EMA' ? ta.ema(tr, cfg.length)
        : ta.wma(tr, cfg.length));
  const src1 = A(getSourceSeries(bars, cfg.src1));
  const src2 = A(getSourceSeries(bars, cfg.src2));
  const a = ma.map((v) => v * cfg.m);
  const x = a.map((v, i) => v + src1[i]);
  const x2 = a.map((v, i) => src2[i] - v);

  // plot(..., color = colshort / collong, transp = 20)
  const shortColor = String(color.new(cfg.colshort, 20));
  const longColor = String(color.new(cfg.collong, 20));

  // Table of the last bar (barstate.islast): 'ATR: ', 'H: ' and 'L: ' with the value formatted with "#.#"
  const tables: TableData[] = [];
  if (n > 0) {
    const cell = (column: number, value: number, label: string, textColor: string) => (
      { column, row: 0, text: label + str.tostring(value, '#.#'), textColor }
    );
    tables.push({
      position: 'bottom_center',
      columns: 3,
      rows: 1,
      borderWidth: 3,
      cells: [
        cell(0, a[n - 1], 'ATR: ', cfg.col1),
        // table.cell_set_text_color(Table, 1, 0, color.new(col3, 0)) and (Table, 2, 0, color.new(col2, 0))
        cell(1, x[n - 1], 'H: ', String(color.new(cfg.col3, 0))),
        cell(2, x2[n - 1], 'L: ', String(color.new(cfg.col2, 0))),
      ],
    });
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {
      plot0: bars.map((b, i) => ({ time: b.time, value: x[i], color: shortColor })),
      plot1: bars.map((b, i) => ({ time: b.time, value: x2[i], color: longColor })),
    },
    tables,
  };
}

export const AtrStopLossFinder = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
};
