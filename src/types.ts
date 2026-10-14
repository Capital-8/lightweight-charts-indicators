/**
 * Output types of the indicators: the oakscriptjs IndicatorResult shapes, shared by the built-in indicators and
 * scripts run with executeScript.
 *
 * A point on a bar after the last bar (Pine bar_index + k) has the time of that future bar: barTime(bars, index).
 * A property that is not set is omitted (the renderer applies the Pine default); a colour set to na is 'transparent'.
 */
/**
 * A PineScript `alert()` call of an indicator: the time of the bar it ran on (as given in the input bars), its message
 * and how often it may trigger the alert (`alert.freq_all`, `alert.freq_once_per_bar` (default),
 * `alert.freq_once_per_bar_close`). The host fires the calls made on the realtime bar.
 */
export interface AlertCall {
  time: number;
  message: string;
  freq: 'all' | 'once_per_bar' | 'once_per_bar_close';
}

export type {
  PineSize,
  MarkerData,
  MarkerPosition,
  MarkerShape,
  BarColorData,
  BgColorData,
  PlotCandleData,
  PlotBarData,
  LabelData,
  LabelStyle,
  LineDrawingData,
  BoxData,
  LinefillData,
  PolylineData,
  TableData,
  TableCellData,
  TableCellData as TableCell,
  TableMergeData,
  TablePosition,
} from 'oakscriptjs';
