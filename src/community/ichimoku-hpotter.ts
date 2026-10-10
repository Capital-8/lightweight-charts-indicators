/**
 * Ichimoku (HPotter)
 *
 * Tenkan and Kijun are the middles of the highest high and the lowest low of the conversion and base periods. The
 * Chikou is the close drawn `displacement` bars back. Senkou A is the middle of the lagging span 2 period, read
 * `displacement` bars back; Senkou B is the average of Tenkan and Kijun of `basePeriods` bars back. The cloud
 * between Senkou A and Senkou B is filled.
 *
 * Reference: "Ichimoku2c" (Ichimoku) by HPotter
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: Copyright by HPotter v1.0 23/05/2014
 */

import { ta, Series, color, type IndicatorResult, type InputConfig, type PlotConfig, type FillConfig, type Bar } from 'oakscriptjs';
import { barInterval, barTime } from '../bar-time';

export interface IchimokuHpotterInputs {
  conversionPeriods: number;
  basePeriods: number;
  laggingSpan2Periods: number;
  displacement: number;
}

export const defaultInputs: IchimokuHpotterInputs = {
  conversionPeriods: 9,
  basePeriods: 26,
  laggingSpan2Periods: 52,
  displacement: 26,
};

export const inputConfig: InputConfig[] = [
  { id: 'conversionPeriods', type: 'int', title: 'conversionPeriods', defval: 9, min: 1 },
  { id: 'basePeriods', type: 'int', title: 'basePeriods', defval: 26, min: 1 },
  { id: 'laggingSpan2Periods', type: 'int', title: 'laggingSpan2Periods', defval: 52, min: 1 },
  { id: 'displacement', type: 'int', title: 'displacement', defval: 26, min: 1 },
];

// Colour constants of Pine version 1, with the default plot transparency of that version (35); fill: 90
const V1 = (hex: string) => String(color.new(hex, 35));
const GREEN = '#008000';

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Tenkan', color: V1('#FF0000'), lineWidth: 1 },
  { id: 'plot1', title: 'Kijun', color: V1('#0000FF'), lineWidth: 1 },
  { id: 'plot2', title: 'Chikou', color: V1('#008080'), lineWidth: 1 },
  { id: 'plot3', title: 'SenkouA', color: V1('#800080'), lineWidth: 1 },
  { id: 'plot4', title: 'SenkouB', color: V1(GREEN), lineWidth: 1 },
];

export const fillConfig: FillConfig[] = [
  { id: 'fill0', plot1: 'plot3', plot2: 'plot4', color: String(color.new(GREEN, 90)), title: 'Plots Background' },
];

export const metadata = {
  title: 'Ichimoku2c',
  shortTitle: 'Ichimoku2c',
  overlay: true,
};

export function calculate(bars: Bar[], inputs: Partial<IchimokuHpotterInputs> = {}): IndicatorResult {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const high = Series.fromArray(bars, bars.map((b) => b.high));
  const low = Series.fromArray(bars, bars.map((b) => b.low));
  // middleDonchian(Length) => avg(highest(Length), lowest(Length))
  const middleDonchian = (length: number): number[] => {
    const upper = ta.highest(high, length).toArray();
    const lower = ta.lowest(low, length).toArray();
    return upper.map((u, i) => ((u ?? NaN) + (lower[i] ?? NaN)) / 2);
  };
  const tenkan = middleDonchian(cfg.conversionPeriods);
  const kijun = middleDonchian(cfg.basePeriods);
  const senkouA = middleDonchian(cfg.laggingSpan2Periods);
  const back = (x: number[], i: number, k: number) => (i - k >= 0 ? x[i - k] : NaN);

  const interval = barInterval(bars);
  const plot0: Array<{ time: number; value: number }> = [];
  const plot1: typeof plot0 = [];
  const plot2: typeof plot0 = [];
  const plot3: typeof plot0 = [];
  const plot4: typeof plot0 = [];
  for (let i = 0; i < n; i++) {
    const time = bars[i].time;
    plot0.push({ time, value: tenkan[i] });
    plot1.push({ time, value: kijun[i] });
    // plot(close, offset = -displacement): the close of bar i is drawn on bar i - displacement
    if (i - cfg.displacement >= 0) {
      plot2.push({ time: barTime(bars, i - cfg.displacement, interval), value: bars[i].close });
    }
    plot3.push({ time, value: back(senkouA, i, cfg.displacement) });
    // SenkouB = (Tenkan[basePeriods] + Kijun[basePeriods]) / 2
    plot4.push({ time, value: (back(tenkan, i, cfg.basePeriods) + back(kijun, i, cfg.basePeriods)) / 2 });
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: { plot0, plot1, plot2, plot3, plot4 },
    fills: fillConfig.map((f) => ({ plot1: f.plot1, plot2: f.plot2, options: { color: f.color, title: f.title } })),
  };
}

export const IchimokuHpotter = { calculate, metadata, defaultInputs, inputConfig, plotConfig, fillConfig };
