/**
 * Trend Duration Forecast [ChartPrime]
 *
 * A Hull moving average of the close gives the trend: up when the average is above each of its last
 * `trendLength` values (rising), down when it is below each of them (falling). The script counts the bars of every
 * trend and keeps the last `samples` durations of the up trends and of the down trends.
 *
 * Outputs:
 * - the average, in the colour of the trend;
 * - a label at each trend change ("Trend ↑" / "Trend ↓") with the real length of that trend (it counts up while the
 *   trend lasts and stays when it ends);
 * - for the current trend: an arrow line from the bar before the change, as long as the average duration of the
 *   past trends of that direction plus one bar, and a label "Probable Length" at its middle;
 * - a table at the bottom right with the stored durations and their averages.
 * At most 50 labels are kept (the oldest are removed).
 *
 * Pine runtime error kept by the port: the table reads the first stored up-trend duration, so the script stops with
 * "Index 0 is out of bounds, array size is 0" on the last bar when no up trend has ended yet.
 *
 * Chart values (third argument): the port reads the chart foreground colour (arrow line, "Probable Length" label and
 * table numbers; without it: #DBDBDB, a dark chart) and the state of the last bar (the trend only changes on a closed
 * bar; without it the last bar is taken as closed).
 *
 * Reference: "Trend Duration Forecast [ChartPrime]" by ChartPrime
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © ChartPrime
 */

import { ta, str, array, color, Series, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { LabelData, LineDrawingData, TableCellData, TableData } from '../types';
import { barInterval, barTime } from '../bar-time';
import { foregroundColorOf, lastBarConfirmedOf, type ChartContext } from '../chart-context';

export interface TrendDurationForecastInputs {
  /** Bars of the Hull moving average */
  length: number;
  /** Bars checked for a rising / falling average */
  trendLength: number;
  /** Number of past trend durations kept per direction */
  samples: number;
  coloUP: string;
  coloDN: string;
}

export const defaultInputs: TrendDurationForecastInputs = {
  length: 50,
  trendLength: 3,
  samples: 10,
  coloUP: 'rgb(18, 228, 158)',
  coloDN: 'rgb(236, 86, 16)',
};

export const inputConfig: InputConfig[] = [
  { id: 'length', type: 'int', title: 'Smoothing Length', defval: 50,
    tooltip: 'Defines how many bars are used for the Hull Moving Average (HMA). A longer length smooths out short-term noise but increases lag.' },
  { id: 'trendLength', type: 'int', title: 'Trend Detection Sensitivity', defval: 3,
    tooltip: 'Controls how many consecutive bars are checked for rising/falling HMA slope. Lower values make trends switch faster, higher values make them more stable.' },
  { id: 'samples', type: 'int', title: 'Trend Sample Size', defval: 10, min: 2,
    tooltip: 'Defines how many past trend durations are stored to calculate the average probable trend length. Larger samples produce smoother probability estimates.' },
  { id: 'coloUP', type: 'color', title: '↑ Trend', defval: 'rgb(18, 228, 158)', inline: 'col' },
  { id: 'coloDN', type: 'color', title: '↓ Trend', defval: 'rgb(236, 86, 16)', inline: 'col' },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'HMA', color: 'rgb(18, 228, 158)', lineWidth: 3 },
];

export const metadata = {
  title: 'Trend Duration Forecast [ChartPrime]',
  shortTitle: 'Trend Duration Forecast [ChartPrime]',
  overlay: true,
};

/** Default max_labels_count of indicator() */
const MAX_LABELS = 50;

interface Lb {
  x: number;
  y: number;
  text: string;
  color: string;
  textColor: string;
  style: 'label_up' | 'label_down';
  tooltip: string;
  deleted: boolean;
}

export function calculate(
  bars: Bar[],
  inputs: Partial<TrendDurationForecastInputs> = {},
  chart?: ChartContext,
): IndicatorResult & { labels: LabelData[]; lines: LineDrawingData[]; tables: TableData[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const { coloUP, coloDN } = cfg;
  const samples = Math.trunc(cfg.samples);
  const fg = foregroundColorOf(chart);
  const lastConfirmed = lastBarConfirmedOf(chart);

  const hmaSeries = ta.hma(new Series(bars, (b) => b.close), Math.trunc(cfg.length));
  const hma = hmaSeries.toArray().map((v) => v ?? NaN);
  const rising = ta.rising(hmaSeries, Math.trunc(cfg.trendLength)).toArray();
  const falling = ta.falling(hmaSeries, Math.trunc(cfg.trendLength)).toArray();

  // Live labels in creation order: when a creation brings the count above max + 5, the oldest are deleted until max
  // remain. A label held by a `var` variable of the script is never deleted by this limit, but it counts.
  const labels: Lb[] = [];
  const held = new Set<Lb>();
  const newLabel = (l: Omit<Lb, 'deleted'>): Lb => {
    const o = { ...l, deleted: false };
    labels.push(o);
    if (labels.length > MAX_LABELS + 5) {
      for (let k = 0; k < labels.length && labels.length > MAX_LABELS; ) {
        if (held.has(labels[k])) k++;
        else labels.splice(k, 1)[0].deleted = true;
      }
    }
    return o;
  };
  const hold = (before: Lb | null, now: Lb): Lb => {
    if (before) held.delete(before);
    held.add(now);
    return now;
  };
  const remove = (l: Lb | null) => {
    if (l && !l.deleted) {
      l.deleted = true;
      labels.splice(labels.indexOf(l), 1);
    }
  };
  const setText = (l: Lb | null, text: string) => {
    if (l && !l.deleted) l.text = text;
  };

  let trend = false; // var trend = bool(na): a bool is never na, so it starts false
  let trendCount = 0;
  const bullishCount: number[] = [];
  const bearishCount: number[] = [];
  let trendUp: Lb | null = null;
  let trendDn: Lb | null = null;
  // LengthLine: x1, x2 (na when the average is na), y; null = na or deleted
  let lengthLine: { x1: number; x2: number; y: number } | null = null;
  let labelProbLen: Lb | null = null;
  const trendColor: string[] = new Array(n);

  const avgText = (a: number[]) => str.tostring(array.avg(a), '##');

  for (let i = 0; i < n; i++) {
    const before: boolean = trend;
    // if barstate.isconfirmed
    if (i < n - 1 || lastConfirmed) {
      if (rising[i]) trend = true;
      if (falling[i]) trend = false;
    }

    // if trend or not trend
    trendCount += 1;

    // if trend != trend[1] (trend[1] is false on the first bar)
    if (trend !== before) {
      lengthLine = null;
      remove(labelProbLen);
      if (trendUp && !trendUp.deleted) trendUp.tooltip = '';
      if (trendDn && !trendDn.deleted) trendDn.tooltip = '';
      const prev = i > 0 ? hma[i - 1] : NaN;

      if (trend) {
        bearishCount.push(trendCount);
        trendUp = hold(trendUp, newLabel({
          x: i, y: hma[i], text: 'Trend ↑\nProbable Length: ' + avgText(bullishCount),
          color: String(color.new(coloUP, 100)), textColor: coloUP, style: 'label_up',
          tooltip: 'New bullish trend detected.\nShows Real length of the current bullish trend.',
        }));
        setText(trendDn, 'Trend ↓\n' + str.tostring(trendCount) + '\n');
        lengthLine = { x1: i - 1, x2: i, y: prev };
        labelProbLen = hold(labelProbLen, newLabel({
          x: i, y: prev, text: '', color: String(color.new(color.white, 100)), textColor: fg, style: 'label_up',
          tooltip: 'Estimated extension of the current bullish trend based on average past durations.',
        }));
      } else {
        bullishCount.push(trendCount);
        trendDn = hold(trendDn, newLabel({
          x: i, y: hma[i], text: 'Trend ↓\nProbable Length: ' + avgText(bearishCount),
          color: String(color.new(coloDN, 100)), textColor: coloDN, style: 'label_down',
          tooltip: 'New bearish trend detected.\nShows Real length of the current bearish trend.',
        }));
        setText(trendUp, '\n' + str.tostring(trendCount) + '\nTrend ↑');
        lengthLine = { x1: i - 1, x2: i, y: prev };
        labelProbLen = hold(labelProbLen, newLabel({
          x: i, y: prev, text: '', color: String(color.new(color.white, 100)), textColor: fg, style: 'label_down',
          tooltip: 'Estimated extension of the current bearish trend based on average past durations.',
        }));
      }
      trendCount = 0;
    }

    // Dynamic label updates
    const counts = trend ? bullishCount : bearishCount;
    if (trend) setText(trendUp, 'Trend ↑\nReal Length: ' + str.tostring(trendCount));
    else setText(trendDn, 'Trend ↓\nReal Length: ' + str.tostring(trendCount) + '\n');
    if (lengthLine) {
      // set_x2(x1 + average + 1): the bar index is the integer part; an na average gives an na x
      const avg = array.avg(counts) ?? NaN;
      lengthLine.x2 = Math.trunc(lengthLine.x1 + avg + 1);
    }
    if (labelProbLen && !labelProbLen.deleted) {
      labelProbLen.x = lengthLine ? Math.trunc((lengthLine.x1 + lengthLine.x2) / 2) : NaN;
      labelProbLen.text = 'Probable Length\n' + avgText(counts);
    }

    if (bullishCount.length > samples) bullishCount.shift();
    if (bearishCount.length > samples) bearishCount.shift();

    trendColor[i] = trend ? coloUP : coloDN;
  }

  // Trend length table (barstate.islast)
  const cells: TableCellData[] = [];
  if (n > 0) {
    const cell = (column: number, row: number, text: string, textColor: string, tooltip: string) => {
      const at = cells.findIndex((c) => c.column === column && c.row === row);
      if (at >= 0) cells.splice(at, 1);
      cells.push({ column, row, text, textColor, textSize: 'auto', tooltip });
    };
    const get = (a: number[], i: number): number => {
      if (i < 0 || i >= a.length) throw new Error(`Index ${i} is out of bounds, array size is ${a.length}`);
      return a[i];
    };
    // for i = 0 to size - 1: with an empty array the loop counts down from 0 to -1
    const last = bullishCount.length - 1;
    const step = last >= 0 ? 1 : -1;
    for (let i = 0; step > 0 ? i <= last : i >= last; i += step) {
      cell(0, i + 1, str.tostring(i + 1), String(color.gray), 'Sample index (1 = most recent trend)');
      const lenBull = get(bullishCount, i);
      if (i === 0) {
        cell(1, i, 'Trend ↑', coloUP, 'Bullish trend length samples — based on detected rising HMA periods');
      }
      cell(1, i + 1, str.tostring(lenBull), fg,
        'Duration of bullish trend #' + str.tostring(i + 1) + ' (' + str.tostring(lenBull) + ' bars)');
      const lenBear = get(bearishCount, i);
      if (i === 0) {
        cell(2, i, 'Trend ↓', coloDN, 'Bearish trend length samples — based on detected falling HMA periods');
      }
      cell(2, i + 1, str.tostring(lenBear), fg,
        'Duration of bearish trend #' + str.tostring(i + 1) + ' (' + str.tostring(lenBear) + ' bars)');
    }
    cell(1, bullishCount.length + 1, avgText(bullishCount), coloUP,
      'Average duration of recent bullish trends (' + avgText(bullishCount) + ' bars)');
    cell(2, bearishCount.length + 1, avgText(bearishCount), coloDN,
      'Average duration of recent bearish trends (' + avgText(bearishCount) + ' bars)');
  }

  const interval = barInterval(bars);
  const T = (index: number) => barTime(bars, index, interval);
  const lines: LineDrawingData[] = [];
  // a line with an na x is not drawn
  if (lengthLine && !isNaN(lengthLine.x2) && !isNaN(lengthLine.y)) {
    lines.push({
      time1: T(lengthLine.x1), price1: lengthLine.y, time2: T(lengthLine.x2), price2: lengthLine.y, color: fg,
      style: 'arrow_right',
    });
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {
      plot0: bars.map((b, i) => ({ time: b.time, value: hma[i], color: trendColor[i] })),
    },
    lines,
    // a label with an na coordinate is not drawn
    labels: labels.filter((l) => !isNaN(l.x) && !isNaN(l.y)).map((l) => ({
      time: T(l.x), price: l.y, text: l.text, color: l.color, textColor: l.textColor, style: l.style,
      ...(l.tooltip ? { tooltip: l.tooltip } : {}),
    })),
    tables: n > 0 ? [{ position: 'bottom_right', columns: 100, rows: 100, cells }] : [],
  };
}

export const TrendDurationForecast = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
};
