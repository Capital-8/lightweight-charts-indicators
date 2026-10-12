/**
 * AG FX - Watermark
 *
 * Two tables used as a chart watermark: a title and a subtitle (1 column, 3 rows), and the symbol information
 * ("Show Symbol Info"): the date of the close of the last bar (day/month/year) above "TICKER | timeframe" (an "M" is
 * added to minute timeframes). Position, colours, sizes, alignments and cell size are inputs.
 *
 * Chart context (optional third argument of calculate): the ticker, the chart timeframe, the exchange time zone of
 * the date and the session (close time of a daily bar). Without a context the ticker is empty, the timeframe is read
 * from the bar spacing, and the close time is the bar time plus the bar interval in UTC.
 *
 * Reference: "AG FX - Watermark" by AGFXTRADING
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 */

import { time as pineTime, timeframe, barInterval, periodClose, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { PineSize, TableCellData, TableData, TablePosition } from '../types';
import { chartTimeframe, hasCalendar } from '../anchor-period';
import { tickerOf, timezoneOf, type ChartContext } from '../chart-context';

type Size = 'tiny' | 'small' | 'normal' | 'large' | 'huge' | 'auto';
type Align = 'center' | 'left' | 'right';
type VPos = 'top' | 'middle' | 'bottom';
type HPos = 'left' | 'center' | 'right';

export interface AgFxWatermarkInputs {
  title: string;
  subtitle: string;
  symInfoCheck: boolean;
  textVPosition: VPos;
  textHPosition: HPos;
  symVPosition: VPos;
  symHPosition: HPos;
  /** Cell width in % of the chart (0 = fit the text) */
  width: number;
  /** Cell height in % of the chart (0 = fit the text) */
  height: number;
  titleColor: string;
  titleSize: Size;
  titleAlign: Align;
  subtitleColor: string;
  subtitleSize: Size;
  subtitleAlign: Align;
  symInfoColor: string;
  symInfoSize: Size;
  symInfoAlign: Align;
  bgColor: string;
}

export const defaultInputs: AgFxWatermarkInputs = {
  title: 'AG FX TRADING',
  subtitle: 'PATIENCE  |  DISCIPLINE  |  FEARLESS',
  symInfoCheck: true,
  textVPosition: 'top',
  textHPosition: 'center',
  symVPosition: 'bottom',
  symHPosition: 'center',
  width: 0,
  height: 0,
  titleColor: '#363A45',
  titleSize: 'large',
  titleAlign: 'center',
  subtitleColor: 'rgba(54, 58, 69, 0.7)',
  subtitleSize: 'normal',
  subtitleAlign: 'center',
  symInfoColor: 'rgba(54, 58, 69, 0.7)',
  symInfoSize: 'normal',
  symInfoAlign: 'center',
  bgColor: 'rgba(33, 150, 243, 0)',
};

const SIZES = ['tiny', 'small', 'normal', 'large', 'huge', 'auto'];
const ALIGNS = ['center', 'left', 'right'];
const CELL_TIP = (what: string) => `The ${what} of the cell as a % of the indicator's visual space. Optional. By default, auto-adjusts the ${what} based on the text inside${what === 'height' ? ' of' : ''} the cell. Value 0 has the same effect.`;

export const inputConfig: InputConfig[] = [
  { id: 'title', type: 'string', title: 'Tittle', defval: defaultInputs.title, group: 'text' },
  { id: 'subtitle', type: 'string', title: 'Subtitle', defval: defaultInputs.subtitle, group: 'text' },
  { id: 'symInfoCheck', type: 'bool', title: 'Show Symbol Info', defval: true, group: 'watermark position' },
  { id: 'textVPosition', type: 'string', title: 'Vertical Position', defval: 'top', options: ['top', 'middle', 'bottom'], group: 'watermark position' },
  { id: 'textHPosition', type: 'string', title: 'Horizontal Position', defval: 'center', options: ['left', 'center', 'right'], group: 'watermark position' },
  { id: 'symVPosition', type: 'string', title: 'Vertical Position', defval: 'bottom', options: ['top', 'middle', 'bottom'], group: 'symbol position' },
  { id: 'symHPosition', type: 'string', title: 'Horizontal Position', defval: 'center', options: ['left', 'center', 'right'], group: 'symbol position' },
  { id: 'width', type: 'int', title: 'Width', defval: 0, min: 0, max: 100, tooltip: CELL_TIP('width'), group: 'cell size' },
  { id: 'height', type: 'int', title: 'Height', defval: 0, min: 0, max: 100, tooltip: CELL_TIP('height'), group: 'cell size' },
  { id: 'titleColor', type: 'color', title: 'Title Color', defval: defaultInputs.titleColor, group: 'title settings' },
  { id: 'titleSize', type: 'string', title: 'Title Size', defval: 'large', options: SIZES, group: 'title settings' },
  { id: 'titleAlign', type: 'string', title: 'Title Alignment', defval: 'center', options: ALIGNS, group: 'title settings' },
  { id: 'subtitleColor', type: 'color', title: 'Subitle Color', defval: defaultInputs.subtitleColor, group: 'subtitle settings' },
  { id: 'subtitleSize', type: 'string', title: 'Subtitle Size', defval: 'normal', options: SIZES, group: 'subtitle settings' },
  { id: 'subtitleAlign', type: 'string', title: 'Subtitle Alignment', defval: 'center', options: ALIGNS, group: 'subtitle settings' },
  { id: 'symInfoColor', type: 'color', title: 'Subitle Color', defval: defaultInputs.symInfoColor, group: 'symbol settings' },
  { id: 'symInfoSize', type: 'string', title: 'Subtitle Size', defval: 'normal', options: SIZES, group: 'symbol settings' },
  { id: 'symInfoAlign', type: 'string', title: 'Subtitle Alignment', defval: 'center', options: ALIGNS, group: 'symbol settings' },
  { id: 'bgColor', type: 'color', title: 'Background', defval: defaultInputs.bgColor, group: 'background' },
];

export const plotConfig: PlotConfig[] = [];

export const metadata = {
  title: 'AG FX - Watermark',
  shortTitle: 'AG FX - Watermark',
  overlay: true,
};

/** time_close of the last bar, in ms */
function lastCloseTime(bars: Bar[], chartTf: string, chart?: ChartContext): number {
  const last = bars[bars.length - 1];
  const unit = last.time >= 1e12 ? 1 : 1000;
  const fallback = last.time * unit + barInterval(bars) * unit;
  if (!chart || !hasCalendar(chart) || chartTf === '') return fallback;
  const context = {
    timeframe: chartTf, timezone: chart.timezone, session: chart.session, regularSession: chart.regularSession,
    timeUnit: unit === 1 ? 'ms' as const : 's' as const,
  };
  const v = periodClose(last.time, chartTf, context);
  return Number.isFinite(v) ? v : fallback;
}

export function calculate(
  bars: Bar[],
  inputs: Partial<AgFxWatermarkInputs> = {},
  chart?: ChartContext,
): Omit<IndicatorResult, 'tables'> & { tables: TableData[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const result = {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {},
  };
  if (bars.length === 0) return { ...result, tables: [] };

  const cell = (column: number, row: number, text: string, textColor: string, size: Size, align: Align): TableCellData => ({
    column, row, text, width: cfg.width, height: cfg.height, textColor, textHAlign: align, textVAlign: 'center',
    textSize: size as PineSize, bgColor: cfg.bgColor,
  });

  // table.new(textVPosition + "_" + textHPosition, 1, 3): title and subtitle
  const textTable: TableData = {
    position: `${cfg.textVPosition}_${cfg.textHPosition}` as TablePosition, columns: 1, rows: 3,
    cells: [
      cell(0, 0, cfg.title, cfg.titleColor, cfg.titleSize, cfg.titleAlign),
      cell(0, 1, cfg.subtitle, cfg.subtitleColor, cfg.subtitleSize, cfg.subtitleAlign),
    ],
  };
  // table.new(symVPosition + "_" + symHPosition, 5, 5): the symbol information
  const symTable: TableData = {
    position: `${cfg.symVPosition}_${cfg.symHPosition}` as TablePosition, columns: 5, rows: 5, cells: [],
  };
  if (cfg.symInfoCheck) {
    // timeframe.period of this version of the language: "D", "W", "M" for one day / week / month
    const tf = chartTimeframe(bars, chart);
    const period = tf.replace(/^1([DWM])$/, '$1');
    // syminfo.ticker + " | " + timeframe.period + (timeframe.isminutes ? "M" : na): na adds nothing
    const minutes = tf !== '' && timeframe.info(tf).isminutes;
    const symInfo = `${tickerOf(chart)} | ${period}${minutes ? 'M' : ''}`;
    // dayofmonth / month / year of time_close in the exchange time zone
    const close = lastCloseTime(bars, tf, chart);
    const tz = timezoneOf(chart);
    const date = `${pineTime.dayofmonth(close, tz)}/${pineTime.month(close, tz)}/${pineTime.year(close, tz)}`;
    symTable.cells.push(cell(0, 1, symInfo, cfg.symInfoColor, cfg.symInfoSize, cfg.symInfoAlign));
    symTable.cells.push(cell(0, 0, date, cfg.symInfoColor, cfg.symInfoSize, cfg.symInfoAlign));
  }
  return { ...result, tables: [textTable, symTable] };
}

export const AgFxWatermark = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
};
