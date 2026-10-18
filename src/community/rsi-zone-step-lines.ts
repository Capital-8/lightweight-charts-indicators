/**
 * RSI Zone Step Lines
 *
 * Two step lines on the price chart: the upper level takes the close when the RSI crosses above the upper
 * threshold, the lower level takes the close when the RSI crosses below the lower threshold; each level holds until
 * its next cross. The zone between the two levels is filled green when the RSI is above the upper threshold, red
 * below the lower threshold and gray between them. Circles mark the crosses at the close.
 * The Pine 'Line Width' input is not ported: the step line width is fixed by plotConfig (the Pine default, 2).
 *
 * Reference: "RSI Zone Step Lines" by Devjames
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 */

import {
  ta, getSourceSeries, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar, type SourceType,
} from 'oakscriptjs';
import type { MarkerData } from '../types';

export interface RsiZoneStepLinesInputs {
  /** RSI length */
  rsiLength: number;
  /** RSI source */
  rsiSource: SourceType;
  /** Upper RSI threshold */
  upperThresh: number;
  /** Lower RSI threshold */
  lowerThresh: number;
  upperColor: string;
  lowerColor: string;
  /** Zone fill colour when the RSI is above the upper threshold */
  zoneGreen: string;
  /** Zone fill colour when the RSI is below the lower threshold */
  zoneRed: string;
  /** Zone fill colour when the RSI is between the thresholds */
  zoneGrey: string;
}

export const defaultInputs: RsiZoneStepLinesInputs = {
  rsiLength: 9,
  rsiSource: 'close',
  upperThresh: 55,
  lowerThresh: 45,
  upperColor: String(color.new(color.green, 0)),
  lowerColor: String(color.new(color.red, 0)),
  zoneGreen: String(color.new(color.green, 85)),
  zoneRed: String(color.new(color.red, 85)),
  zoneGrey: String(color.new(color.gray, 85)),
};

export const inputConfig: InputConfig[] = [
  { id: 'rsiLength', type: 'int', title: 'RSI Length', defval: 9, min: 1 },
  { id: 'rsiSource', type: 'source', title: 'RSI Source', defval: 'close' },
  { id: 'upperThresh', type: 'int', title: 'Upper RSI Threshold', defval: 55, min: 1, max: 99 },
  { id: 'lowerThresh', type: 'int', title: 'Lower RSI Threshold', defval: 45, min: 1, max: 99 },
  { id: 'upperColor', type: 'color', title: 'Upper Level Color', defval: defaultInputs.upperColor },
  { id: 'lowerColor', type: 'color', title: 'Lower Level Color', defval: defaultInputs.lowerColor },
  { id: 'zoneGreen', type: 'color', title: 'Zone Fill: RSI Above Upper', defval: defaultInputs.zoneGreen },
  { id: 'zoneRed', type: 'color', title: 'Zone Fill: RSI Below Lower', defval: defaultInputs.zoneRed },
  { id: 'zoneGrey', type: 'color', title: 'Zone Fill: RSI Between', defval: defaultInputs.zoneGrey },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Upper Level (RSI Cross Above)', color: defaultInputs.upperColor, lineWidth: 2, style: 'stepline' },
  { id: 'plot1', title: 'Lower Level (RSI Cross Below)', color: defaultInputs.lowerColor, lineWidth: 2, style: 'stepline' },
];

export const metadata = {
  title: 'RSI Zone Step Lines',
  shortTitle: 'RSI Zone Step Lines',
  overlay: true,
};

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;

export function calculate(
  bars: Bar[],
  inputs: Partial<RsiZoneStepLinesInputs> = {},
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const rsi = ta.rsi(getSourceSeries(bars, cfg.rsiSource), cfg.rsiLength).toArray().map((v) => v ?? NaN);

  const upperPlot: { time: number; value: number; color: string }[] = [];
  const lowerPlot: { time: number; value: number; color: string }[] = [];
  const zoneColors: string[] = [];
  const markers: MarkerData[] = [];
  let upperLevel = NaN; // var float upperLevel = na
  let lowerLevel = NaN; // var float lowerLevel = na
  let prev = NaN; // rsiValue on the last bar where it was not na (ta.crossover / crossunder)
  for (let i = 0; i < n; i++) {
    const t = bars[i].time;
    const close = bars[i].close;
    const r = rsi[i];
    // ta.crossover(rsiValue, upperThresh) / ta.crossunder(rsiValue, lowerThresh), compared exactly (no 1e-10 tolerance)
    const crossUp = r > cfg.upperThresh && prev <= cfg.upperThresh;
    const crossDown = r < cfg.lowerThresh && prev >= cfg.lowerThresh;
    if (!isNaN(r)) prev = r;
    if (crossUp) upperLevel = close;
    if (crossDown) lowerLevel = close;

    // zoneColor = rsiValue > upperThresh ? zoneGreen : rsiValue < lowerThresh ? zoneRed : zoneGrey
    zoneColors.push(gt(r, cfg.upperThresh) ? cfg.zoneGreen : lt(r, cfg.lowerThresh) ? cfg.zoneRed : cfg.zoneGrey);
    upperPlot.push({ time: t, value: upperLevel, color: cfg.upperColor });
    lowerPlot.push({ time: t, value: lowerLevel, color: cfg.lowerColor });

    // plotshape(crossUp ? close : na, "Cross Above Upper", shape.circle, location.absolute, size = size.tiny, color = upperColor)
    if (crossUp) {
      markers.push({ time: t, position: 'atPriceMiddle', price: close, shape: 'circle', color: cfg.upperColor, size: 'tiny', id: 'shape0' });
    }
    // plotshape(crossDown ? close : na, "Cross Below Lower", shape.circle, location.absolute, size = size.tiny, color = lowerColor)
    if (crossDown) {
      markers.push({ time: t, position: 'atPriceMiddle', price: close, shape: 'circle', color: cfg.lowerColor, size: 'tiny', id: 'shape1' });
    }
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: { plot0: upperPlot, plot1: lowerPlot },
    // fill(pUpper, pLower, color = zoneColor, title = "RSI Zone")
    fills: [{ plot1: 'plot0', plot2: 'plot1', options: { title: 'RSI Zone' }, colors: zoneColors }],
    markers,
  };
}

export const RsiZoneStepLines = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
};
