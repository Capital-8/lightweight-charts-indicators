/**
 * Inside Bar Coloring (Real-time + Historical)
 *
 * An inside bar has high <= previous high and low >= previous low. Inside bars are coloured with a bullish colour
 * (close >= open) or a bearish colour. The real-time bar uses the full colours, the historical bars the
 * semi-transparent historical colours (when "Show Historical Inside Bars" is on). "Highlight Current Bar Only" keeps
 * only the real-time bar. Optional triangle markers above (or below) the inside bars.
 *
 * The real-time bar is the last bar when it is still open. The port reads the state of the last bar from the
 * optional third argument (see src/chart-context.ts); without it every bar is a historical (closed) bar, so the
 * bars get the historical colours and "Highlight Current Bar Only" colours no bar.
 *
 * Alerts (alert() call, `alertCalls` of the result): with "Enable Inside Bar Alerts", every confirmed inside bar
 * ("Inside Bar Detected: Bullish | High: <high> | Low: <low>", once per bar).
 *
 * Reference: "Inside Bar Coloring (Real-time + Historical) w/ Alerts" by SpinTrades
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: Copyright (c) 2025 @SpinTrades
 */

import { str, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { AlertCall, MarkerData, BarColorData } from '../types';
import { lastBarConfirmedOf, type ChartContext } from '../chart-context';

export interface InsideBarColoringWAlertsInputs {
  /** Bullish Inside Bar (Close >= Open) */
  bullishInsideColor: string;
  /** Bearish Inside Bar (Close < Open) */
  bearishInsideColor: string;
  /** Historical Bullish Inside Bar */
  bullishHistoricalColor: string;
  /** Historical Bearish Inside Bar */
  bearishHistoricalColor: string;
  showHistorical: boolean;
  showCurrentOnly: boolean;
  /** Enable Inside Bar Alerts (the alert() calls, `alertCalls` of the result) */
  alertOnInsideBar: boolean;
  showMarkers: boolean;
  markerPosition: 'Above' | 'Below';
}

export const defaultInputs: InsideBarColoringWAlertsInputs = {
  bullishInsideColor: '#FCE601',
  bearishInsideColor: '#FC9D0F',
  bullishHistoricalColor: '#FCE60180',
  bearishHistoricalColor: '#FC9D0F80',
  showHistorical: true,
  showCurrentOnly: false,
  alertOnInsideBar: false,
  showMarkers: false,
  markerPosition: 'Above',
};

export const inputConfig: InputConfig[] = [
  { id: 'bullishInsideColor', type: 'color', title: 'Bullish Inside Bar (Close ≥ Open)', defval: '#FCE601', group: 'Color Settings' },
  { id: 'bearishInsideColor', type: 'color', title: 'Bearish Inside Bar (Close < Open)', defval: '#FC9D0F', group: 'Color Settings' },
  { id: 'bullishHistoricalColor', type: 'color', title: 'Historical Bullish Inside Bar', defval: '#FCE60180', group: 'Color Settings' },
  { id: 'bearishHistoricalColor', type: 'color', title: 'Historical Bearish Inside Bar', defval: '#FC9D0F80', group: 'Color Settings' },
  { id: 'showHistorical', type: 'bool', title: 'Show Historical Inside Bars', defval: true, group: 'Display Settings' },
  { id: 'showCurrentOnly', type: 'bool', title: 'Highlight Current Bar Only', defval: false, group: 'Display Settings' },
  { id: 'alertOnInsideBar', type: 'bool', title: 'Enable Inside Bar Alerts', defval: false, group: 'Display Settings' },
  { id: 'showMarkers', type: 'bool', title: 'Show Markers Above/Below Inside Bars', defval: false, group: 'Display Settings' },
  { id: 'markerPosition', type: 'string', title: 'Marker Position', defval: 'Above', options: ['Above', 'Below'], group: 'Display Settings' },
];

// Only bar colours (barcolor) and markers (plotshape): no line plots
export const plotConfig: PlotConfig[] = [];

export const metadata = {
  title: 'Inside Bar Coloring',
  shortTitle: 'Inside Bar Coloring',
  overlay: true,
};

/** Pine float comparisons: a >= b unless b - a > 1e-10 (na compares false) */
const EPS = 1e-10;
const ge = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(b - a > EPS);
const le = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(a - b > EPS);

export function calculate(
  bars: Bar[],
  inputs: Partial<InsideBarColoringWAlertsInputs> = {},
  chart?: ChartContext,
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[]; barColors: BarColorData[]; alertCalls: AlertCall[] } {
  // barstate.isconfirmed: every bar is closed, except the last one when the chart context says that it is still open
  const lastBarOpen = !lastBarConfirmedOf(chart);
  const barIsConfirmed = (index: number) => !(lastBarOpen && index === bars.length - 1);
  const cfg = { ...defaultInputs, ...inputs };
  const { bullishInsideColor, bearishInsideColor, bullishHistoricalColor, bearishHistoricalColor } = cfg;
  const { showHistorical, showCurrentOnly, showMarkers, markerPosition } = cfg;
  const n = bars.length;

  const markerLocation = markerPosition === 'Above' ? 'aboveBar' : 'belowBar';
  const markerStyle = markerPosition === 'Above' ? 'triangleDown' : 'triangleUp';

  const markers: MarkerData[] = [];
  const barColors: BarColorData[] = [];
  const alertCalls: AlertCall[] = [];
  for (let i = 0; i < n; i++) {
    const { time, open, high, low, close } = bars[i];
    // high[1] / low[1]: na on bar 0
    const high1 = i > 0 ? bars[i - 1].high : NaN;
    const low1 = i > 0 ? bars[i - 1].low : NaN;
    const isInsideBar = le(high, high1) && ge(low, low1);
    const isBullish = ge(close, open);
    // barstate.isrealtime and bar_index == last_bar_index: the last bar when it is still open
    const isRealtime = !barIsConfirmed(i);
    const isCurrentBar = isRealtime && i === n - 1;

    let barColor: string | null;
    if (!isInsideBar) barColor = null;
    else if (showCurrentOnly && !isCurrentBar) barColor = null;
    else if (isCurrentBar) barColor = isBullish ? bullishInsideColor : bearishInsideColor;
    else if (showHistorical) barColor = isBullish ? bullishHistoricalColor : bearishHistoricalColor;
    else barColor = null;
    // barcolor(barColor, title = "Inside Bar Color")
    if (barColor !== null) barColors.push({ time, color: barColor });

    // plotshape(showMarkers and isInsideBar, style = markerStyle, location = markerLocation, color = markerColor, size.tiny)
    if (showMarkers && isInsideBar) {
      const markerColor = isBullish ? bullishInsideColor : bearishInsideColor;
      markers.push({ time, position: markerLocation, shape: markerStyle, color: markerColor, size: 'tiny' });
    }

    // if alertOnInsideBar and isInsideBar and barstate.isconfirmed: alert(alertMessage, alert.freq_once_per_bar)
    if (cfg.alertOnInsideBar && isInsideBar && barIsConfirmed(i)) {
      const message = 'Inside Bar Detected: ' + (isBullish ? 'Bullish' : 'Bearish') + ' | High: ' + str.tostring(high) + ' | Low: ' + str.tostring(low);
      alertCalls.push({ time, message, freq: 'once_per_bar' });
    }
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {},
    markers,
    barColors,
    alertCalls,
  };
}

/** The original calls alert() (confirmed inside bars) */
export const hasAlertFunction = true;

export const InsideBarColoringWAlerts = { calculate, metadata, defaultInputs, inputConfig, plotConfig, hasAlertFunction };
