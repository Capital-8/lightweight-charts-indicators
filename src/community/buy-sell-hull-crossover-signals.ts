/**
 * Buy/Sell Hull Crossover Signals (Fast & Slow)
 *
 * A fast and a slow Hull moving average of the source. A ribbon fill between them is green when the fast HMA is at
 * or above the slow HMA, else red. BUY / SELL triangles mark the crossovers / crossunders of the fast HMA over the
 * slow HMA; an optional background shows the regime (fast above slow: green, else red).
 *
 * Last bar: with 'Confirm signals on bar close' a signal needs a closed bar. The port reads the state of the last bar
 * from the optional third argument (see src/chart-context.ts); without it every bar is taken as closed.
 *
 * Reference: "Buy/Sell Hull Crossover Signals (Fast & Slow)" by VibeAlgos
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 */

import { ta, getSourceSeries, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar, type SourceType, type Series } from 'oakscriptjs';
import type { MarkerData, BgColorData } from '../types';
import { lastBarConfirmedOf, type ChartContext } from '../chart-context';

export interface BuySellHullCrossoverSignalsInputs {
  /** Fast HMA length */
  fastLen: number;
  /** Slow HMA length */
  slowLen: number;
  /** Source */
  src: SourceType;
  /** Signals only on confirmed (closed) bars */
  confirmOnClose: boolean;
  /** Show the BUY / SELL triangles */
  showLabels: boolean;
  /** Colour the background by regime */
  showBg: boolean;
  /** Show the ribbon fill between the HMAs */
  showRibbon: boolean;
  /** Transparency of the ribbon fill (0-100) */
  ribbonOpacity: number;
  bullRibbonBase: string;
  bearRibbonBase: string;
}

export const defaultInputs: BuySellHullCrossoverSignalsInputs = {
  fastLen: 20,
  slowLen: 55,
  src: 'close',
  confirmOnClose: true,
  showLabels: true,
  showBg: false,
  showRibbon: true,
  ribbonOpacity: 86,
  bullRibbonBase: color.green,
  bearRibbonBase: color.red,
};

export const inputConfig: InputConfig[] = [
  { id: 'fastLen', type: 'int', title: 'Fast HMA Length', defval: 20, min: 1 },
  { id: 'slowLen', type: 'int', title: 'Slow HMA Length', defval: 55, min: 1 },
  { id: 'src', type: 'source', title: 'Source', defval: 'close' },
  { id: 'confirmOnClose', type: 'bool', title: 'Confirm signals on bar close (reduces repaint)', defval: true },
  { id: 'showLabels', type: 'bool', title: 'Show Buy/Sell labels', defval: true },
  { id: 'showBg', type: 'bool', title: 'Color background by regime', defval: false },
  { id: 'showRibbon', type: 'bool', title: 'Show ribbon/cloud between HMAs', defval: true },
  { id: 'ribbonOpacity', type: 'int', title: 'Ribbon opacity (0–100)', defval: 86, min: 0, max: 100 },
  { id: 'bullRibbonBase', type: 'color', title: 'Bull ribbon color', defval: color.green },
  { id: 'bearRibbonBase', type: 'color', title: 'Bear ribbon color', defval: color.red },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Fast HMA', color: color.green, lineWidth: 2 },
  { id: 'plot1', title: 'Slow HMA', color: color.red, lineWidth: 2 },
];

export const metadata = {
  title: 'HMA Crossover Signals (Fast & Slow)',
  shortTitle: 'HMA Xover Signals',
  overlay: true,
};

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const ge = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(b - a > EPS);

export function calculate(
  bars: Bar[],
  inputs: Partial<BuySellHullCrossoverSignalsInputs> = {},
  chart?: ChartContext,
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[]; bgColors: BgColorData[] } {
  // barstate.isconfirmed: every bar is closed, except the last one when the chart context says that it is still open
  const lastBarOpen = !lastBarConfirmedOf(chart);
  const barIsConfirmed = (index: number) => !(lastBarOpen && index === bars.length - 1);
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const src = getSourceSeries(bars, cfg.src);

  const hmaFast = A(ta.hma(src, cfg.fastLen));
  const hmaSlow = A(ta.hma(src, cfg.slowLen));

  const fastCol = String(color.new(color.green, 0));
  const slowCol = String(color.new(color.red, 0));
  const bullRibbon = String(color.new(cfg.bullRibbonBase, cfg.ribbonOpacity));
  const bearRibbon = String(color.new(cfg.bearRibbonBase, cfg.ribbonOpacity));
  const bgBull = String(color.new(color.green, 90));
  const bgBear = String(color.new(color.red, 90));

  const markers: MarkerData[] = [];
  const bgColors: BgColorData[] = [];
  const ribbon: string[] = new Array(n);
  // ta.crossover / ta.crossunder compare with the last bar where both values were not na; exact comparisons (no
  // tolerance)
  let prevF = NaN;
  let prevS = NaN;
  for (let i = 0; i < n; i++) {
    const f = hmaFast[i];
    const s = hmaSlow[i];
    const both = !isNaN(f) && !isNaN(s);
    const rawLong = both && f > s && prevF <= prevS;
    const rawShort = both && f < s && prevF >= prevS;
    if (both) {
      prevF = f;
      prevS = s;
    }
    // longSignal = rawLong and (not confirmOnClose or barstate.isconfirmed)
    const confirmed = !cfg.confirmOnClose || barIsConfirmed(i);
    const longSignal = rawLong && confirmed;
    const shortSignal = rawShort && confirmed;

    // ribbonColor = hmaFast >= hmaSlow ? bull : bear; fill colour = showRibbon ? ribbonColor : na
    ribbon[i] = cfg.showRibbon ? (ge(f, s) ? bullRibbon : bearRibbon) : 'transparent';

    const t = bars[i].time;
    if (cfg.showLabels && longSignal) {
      markers.push({ time: t, position: 'belowBar', shape: 'triangleUp', color: fastCol, size: 'tiny', text: 'BUY', textColor: color.white });
    }
    if (cfg.showLabels && shortSignal) {
      markers.push({ time: t, position: 'aboveBar', shape: 'triangleDown', color: slowCol, size: 'tiny', text: 'SELL', textColor: color.white });
    }
    // bgcolor(showBg ? (hmaFast > hmaSlow ? green 90 : red 90) : na)
    if (cfg.showBg) bgColors.push({ time: t, color: gt(f, s) ? bgBull : bgBear });
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {
      plot0: bars.map((b, i) => ({ time: b.time, value: hmaFast[i], color: fastCol })),
      plot1: bars.map((b, i) => ({ time: b.time, value: hmaSlow[i], color: slowCol })),
    },
    fills: [{ plot1: 'plot0', plot2: 'plot1', options: { title: 'HMA Ribbon/Cloud' }, colors: ribbon }],
    markers,
    bgColors,
  };
}

export const BuySellHullCrossoverSignals = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
};
