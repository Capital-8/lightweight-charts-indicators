/**
 * Infinite EMA with Alpha Control
 *
 * Two recursive EMAs (slow and fast) with alpha = 2 / (length + 1), started at the source on the first bar and
 * updated only on the bars where bar_index is a multiple of the update interval (they hold their value between
 * updates). Each line is coloured bullish / bearish / neutral by the close above / below / equal to it; a cloud
 * between them takes the slow bullish colour when the fast EMA is above the slow EMA, else the slow bearish colour.
 * Optional background shading, and triangles one bar back on the crossovers of the fast EMA over / under the slow
 * EMA (one Style output per signal size, as the original).
 * Alerts (alertcondition, `alerts` of the result): 'Bullish EMA Crossover' / 'Bearish EMA Crossover', true on the bar
 * where the fast EMA crosses over / under the slow EMA (with the fast EMA enabled).
 *
 * Reference: "Infinite EMA with Alpha Control" by Sesilya
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 */

import { color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { BgColorData, MarkerData, PineSize } from '../types';
import { barInterval, barTime } from '../bar-time';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

export interface InfiniteEmaWithAlphaControlInputs {
  /** Slow EMA length (N) */
  emaLength: number;
  /** Update interval (bars): the EMAs update when bar_index % interval == 0 */
  updateInterval: number;
  sourceType: 'close' | 'open' | 'high' | 'low' | 'hl2' | 'hlc3' | 'ohlc4';
  /** Slow EMA line width (the plot width is static: default 2) */
  emaLineWidth: number;
  enableFastEMA: boolean;
  /** Fast EMA length (N) */
  fastEMALength: number;
  /** Fast EMA line width (the plot width is static: default 2) */
  fastEmaLineWidth: number;
  slowBullColor: string;
  slowBearColor: string;
  slowNeutralColor: string;
  fastBullColor: string;
  fastBearColor: string;
  fastNeutralColor: string;
  enableBgColor: boolean;
  bgBullColor: string;
  bgBearColor: string;
  bgNeutralColor: string;
  /** Flat channel threshold (%): not used by the script */
  flatChannelThreshold: number;
  /** Fill transparency (color.new transparency; above 100 is fully transparent) */
  fillAlpha: number;
  showCrossoverSignals: boolean;
  bullishSignalColor: string;
  bearishSignalColor: string;
  signalSize: 'tiny' | 'small' | 'normal' | 'large';
}

export const defaultInputs: InfiniteEmaWithAlphaControlInputs = {
  emaLength: 200,
  updateInterval: 1,
  sourceType: 'close',
  emaLineWidth: 2,
  enableFastEMA: true,
  fastEMALength: 50,
  fastEmaLineWidth: 2,
  slowBullColor: '#00D4FF',
  slowBearColor: '#FF6B6B',
  slowNeutralColor: '#A855F7',
  fastBullColor: '#00FF88',
  fastBearColor: '#FF4081',
  fastNeutralColor: '#FFC107',
  enableBgColor: false,
  bgBullColor: String(color.new('#00D4FF', 95)),
  bgBearColor: String(color.new('#FF6B6B', 95)),
  bgNeutralColor: String(color.new('#A855F7', 95)),
  flatChannelThreshold: 0.4,
  fillAlpha: 85,
  showCrossoverSignals: true,
  bullishSignalColor: '#00FF88',
  bearishSignalColor: '#FF4081',
  signalSize: 'small',
};

export const inputConfig: InputConfig[] = [
  { id: 'emaLength', type: 'int', title: 'Slow EMA length (N) - ♾️ Infinite support', defval: 200, min: 1 },
  { id: 'updateInterval', type: 'int', title: 'Update Interval bars', defval: 1, min: 1 },
  { id: 'sourceType', type: 'string', title: 'EMA Source', defval: 'close', options: ['close', 'open', 'high', 'low', 'hl2', 'hlc3', 'ohlc4'] },
  { id: 'emaLineWidth', type: 'int', title: 'EMA Line Width', defval: 2, min: 1, max: 5 },
  { id: 'enableFastEMA', type: 'bool', title: 'Enable Fast EMA', defval: true },
  { id: 'fastEMALength', type: 'int', title: 'Fast EMA length (N) - ♾️ Infinite support', defval: 50, min: 1 },
  { id: 'fastEmaLineWidth', type: 'int', title: 'Fast EMA Line Width', defval: 2, min: 1, max: 5 },
  { id: 'slowBullColor', type: 'color', title: 'Slow EMA Bullish Color', defval: '#00D4FF' },
  { id: 'slowBearColor', type: 'color', title: 'Slow EMA Bearish Color', defval: '#FF6B6B' },
  { id: 'slowNeutralColor', type: 'color', title: 'Slow EMA Neutral Color', defval: '#A855F7' },
  { id: 'fastBullColor', type: 'color', title: 'Fast EMA Bullish Color', defval: '#00FF88' },
  { id: 'fastBearColor', type: 'color', title: 'Fast EMA Bearish Color', defval: '#FF4081' },
  { id: 'fastNeutralColor', type: 'color', title: 'Fast EMA Neutral Color', defval: '#FFC107' },
  { id: 'enableBgColor', type: 'bool', title: 'Enable Background Shading', defval: false },
  { id: 'bgBullColor', type: 'color', title: 'Bullish Background', defval: defaultInputs.bgBullColor },
  { id: 'bgBearColor', type: 'color', title: 'Bearish Background', defval: defaultInputs.bgBearColor },
  { id: 'bgNeutralColor', type: 'color', title: 'Neutral Background', defval: defaultInputs.bgNeutralColor },
  { id: 'flatChannelThreshold', type: 'float', title: 'Flat Channel Threshold (%)', defval: 0.4, step: 0.1 },
  { id: 'fillAlpha', type: 'int', title: 'Fill Transparency (0-255)', defval: 85, min: 0, max: 255 },
  { id: 'showCrossoverSignals', type: 'bool', title: 'Show Crossover Signals', defval: true },
  { id: 'bullishSignalColor', type: 'color', title: 'Bullish Signal Color', defval: '#00FF88' },
  { id: 'bearishSignalColor', type: 'color', title: 'Bearish Signal Color', defval: '#FF4081' },
  { id: 'signalSize', type: 'string', title: 'Signal Size', defval: 'small', options: ['tiny', 'small', 'normal', 'large'] },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Slow EMA', color: '#00D4FF', lineWidth: 2 },
  { id: 'plot1', title: 'Fast EMA', color: '#00FF88', lineWidth: 2 },
];

export const metadata = {
  title: 'Infinite EMA',
  shortTitle: 'Infinite EMA',
  overlay: true,
};

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;

export function calculate(
  bars: Bar[],
  inputs: Partial<InfiniteEmaWithAlphaControlInputs> = {},
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[]; bgColors: BgColorData[] } & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const interval = barInterval(bars);
  const source = (b: Bar) => {
    switch (cfg.sourceType) {
      case 'close': return b.close;
      case 'open': return b.open;
      case 'high': return b.high;
      case 'low': return b.low;
      case 'hl2': return (b.high + b.low) / 2;
      case 'hlc3': return (b.high + b.low + b.close) / 3;
      default: return (b.open + b.high + b.low + b.close) / 4;
    }
  };

  const slowAlpha = 2.0 / (cfg.emaLength + 1.0);
  const fastAlpha = 2.0 / (cfg.fastEMALength + 1.0);
  const slow: number[] = new Array(n);
  const fast: number[] = new Array(n);
  for (let i = 0; i < n; i++) {
    const x = source(bars[i]);
    if (i === 0) {
      slow[i] = x;
      fast[i] = x;
    } else if (i % cfg.updateInterval === 0) {
      // nz(slowEMA[1], inData)
      const ps = isNaN(slow[i - 1]) ? x : slow[i - 1];
      const pf = isNaN(fast[i - 1]) ? x : fast[i - 1];
      slow[i] = slowAlpha * x + (1 - slowAlpha) * ps;
      fast[i] = fastAlpha * x + (1 - fastAlpha) * pf;
    } else {
      slow[i] = slow[i - 1];
      fast[i] = fast[i - 1];
    }
  }

  const trendColor = (c: number, ema: number, bull: string, bear: string, neutral: string) =>
    (gt(c, ema) ? bull : lt(c, ema) ? bear : neutral);
  const fillBull = String(color.new(cfg.slowBullColor, cfg.fillAlpha));
  const fillBear = String(color.new(cfg.slowBearColor, cfg.fillAlpha));

  const plot0 = bars.map((b, i) => ({
    time: b.time, value: slow[i],
    color: trendColor(b.close, slow[i], cfg.slowBullColor, cfg.slowBearColor, cfg.slowNeutralColor),
  }));
  const plot1 = bars.map((b, i) => ({
    time: b.time, value: cfg.enableFastEMA ? fast[i] : NaN,
    color: trendColor(b.close, fast[i], cfg.fastBullColor, cfg.fastBearColor, cfg.fastNeutralColor),
  }));
  // fill(plotSlowEMA, plotFastEMA, enableFastEMA ? (fastEMA > slowEMA ? bull : bear) : na)
  const fills = [{
    plot1: 'plot0', plot2: 'plot1',
    colors: bars.map((_b, i) => (cfg.enableFastEMA ? (gt(fast[i], slow[i]) ? fillBull : fillBear) : 'transparent')),
  }];

  const bgColors: BgColorData[] = [];
  if (cfg.enableBgColor) {
    for (let i = 0; i < n; i++) {
      const c = bars[i].close;
      const col = cfg.enableFastEMA
        ? (gt(fast[i], slow[i]) ? cfg.bgBullColor : cfg.bgBearColor)
        : trendColor(c, slow[i], cfg.bgBullColor, cfg.bgBearColor, cfg.bgNeutralColor);
      bgColors.push({ time: bars[i].time, color: col });
    }
  }

  // ta.crossover / ta.crossunder(fastEMA, slowEMA) compare exactly; plotshape(..., offset = -1): drawn one bar back
  // bullish_cross = enableFastEMA and ta.crossover(fastEMA, slowEMA); bearish_cross: ta.crossunder
  const bullishCross: boolean[] = [];
  const bearishCross: boolean[] = [];
  for (let i = 0; i < n; i++) {
    bullishCross.push(cfg.enableFastEMA && i > 0 && fast[i] > slow[i] && fast[i - 1] <= slow[i - 1]);
    bearishCross.push(cfg.enableFastEMA && i > 0 && fast[i] < slow[i] && fast[i - 1] >= slow[i - 1]);
  }
  const markers: MarkerData[] = [];
  if (cfg.enableFastEMA && cfg.showCrossoverSignals) {
    const size = cfg.signalSize as PineSize;
    // One plotshape per size: "Bullish Cross Tiny" ... "Large" (shape0-3), "Bearish Cross Tiny" ... (shape4-7)
    const sizeIndex = Math.max(0, (['tiny', 'small', 'normal', 'large'] as const).indexOf(cfg.signalSize));
    for (let i = 1; i < n; i++) {
      const time = barTime(bars, i - 1, interval);
      if (bullishCross[i]) {
        markers.push({ time, position: 'belowBar', shape: 'triangleUp', color: cfg.bullishSignalColor, size, id: `shape${sizeIndex}` });
      }
      if (bearishCross[i]) {
        markers.push({ time, position: 'aboveBar', shape: 'triangleDown', color: cfg.bearishSignalColor, size, id: `shape${4 + sizeIndex}` });
      }
    }
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: { plot0, plot1 },
    fills,
    bgColors,
    markers,
    alerts: alertStates(alertConditions, bars, [bullishCross, bearishCross]),
  };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'Bullish EMA Crossover', message: 'Fast EMA crossed above Slow EMA - Bullish signal!' },
  { id: 'alert1', title: 'Bearish EMA Crossover', message: 'Fast EMA crossed below Slow EMA - Bearish signal!' },
];

export const InfiniteEmaWithAlphaControl = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  alertConditions,
};
