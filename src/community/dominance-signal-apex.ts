/**
 * Dominance Signal Apex
 *
 * A Heikin-Ashi body state (bull when the HA close is above the HA open, bear when below) that is cleared when the
 * stack of four 2-pole super smoothers of the close (5 / 8 / 13 / 21) stops being ordered (bull: rising order,
 * bear: falling order). A Hull MA of the source is drawn lime when rising, red otherwise. Circles mark the bars of a
 * bull state with a rising HMA (below the bar) and of a bear state with a falling HMA (above the bar); their colour
 * fades from the start transparency to the end transparency over `steps` bars of the state.
 * The script also computes super-smoother bands of high / low that it never draws: they are not ported.
 *
 * Last bar: the bull / bear state changes on a closed bar only. The port reads the state of the last bar from the
 * optional third argument (see src/chart-context.ts); without it every bar is taken as closed.
 *
 * Reference: "Dominance Signal Apex [CHE]]" by chervolino
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © chervolino
 */

import {
  ta, Series, getSourceSeries, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar, type SourceType,
} from 'oakscriptjs';
import type { MarkerData } from '../types';
import { lastBarConfirmedOf, type ChartContext } from '../chart-context';

export interface DominanceSignalApexInputs {
  showShapes: boolean;
  bullColor: string;
  bearColor: string;
  /** Transparency at the start of a state (0 = opaque, 100 = transparent) */
  startAlpha: number;
  /** Transparency after the fade */
  endAlpha: number;
  /** Bars to fade from the start to the end transparency */
  steps: number;
  /** Length of the high / low smoothing (bands, not drawn) */
  smootherLength: number;
  /** Band multiplier (bands, not drawn) */
  bandMultiplier: number;
  /** Hull MA source */
  src: SourceType;
  /** Hull MA length */
  length: number;
}

export const defaultInputs: DominanceSignalApexInputs = {
  showShapes: true,
  bullColor: '#00ff0a',
  bearColor: '#ff0000',
  startAlpha: 100,
  endAlpha: 30,
  steps: 8,
  smootherLength: 21,
  bandMultiplier: 1.0,
  src: 'close',
  length: 50,
};

const SIGNALS = 'Signals';
const BANDS = 'Bands';
const HMA = 'HMA Filter';

export const inputConfig: InputConfig[] = [
  { id: 'showShapes', type: 'bool', title: 'Show Markers', defval: true, group: SIGNALS, inline: 'sig_vis', tooltip: 'Toggle marker rendering.' },
  { id: 'bullColor', type: 'color', title: 'Bull', defval: '#00ff0a', group: SIGNALS, inline: 'sig_col', tooltip: 'Base color for bullish markers.' },
  { id: 'bearColor', type: 'color', title: 'Bear', defval: '#ff0000', group: SIGNALS, inline: 'sig_col', tooltip: 'Base color for bearish markers.' },
  { id: 'startAlpha', type: 'int', title: 'Start Alpha', defval: 100, min: 0, max: 100, group: SIGNALS, inline: 'fade', tooltip: '0=opaque, 100=transparent at state start.' },
  { id: 'endAlpha', type: 'int', title: 'End Alpha', defval: 30, min: 0, max: 100, group: SIGNALS, inline: 'fade', tooltip: '0=opaque, 100=transparent after fade.' },
  { id: 'steps', type: 'int', title: 'Steps', defval: 8, min: 1, max: 30, group: SIGNALS, inline: 'fade', tooltip: 'Bars to fade from start to end alpha.' },
  { id: 'smootherLength', type: 'int', title: 'Smoother Length', defval: 21, min: 2, group: BANDS, inline: 'bands', tooltip: 'Length for high/low smoothing.' },
  { id: 'bandMultiplier', type: 'float', title: 'Band Multiplier', defval: 1.0, min: 0.0, step: 0.1, group: BANDS, inline: 'bands', tooltip: 'Multiplier for band offset.' },
  { id: 'src', type: 'source', title: 'Source', defval: 'close', group: HMA, inline: 'hma', tooltip: 'Input for Hull MA filter.' },
  { id: 'length', type: 'int', title: 'Length', defval: 50, min: 1, group: HMA, inline: 'hma', tooltip: 'Hull MA length.' },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'HMA', color: String(color.new(color.lime, 50)), lineWidth: 4 },
];

export const metadata = {
  title: 'Dominance Signal Apex [CHE]]',
  shortTitle: 'DomApex',
  overlay: true,
};

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const nz = (x: number) => (isNaN(x) ? 0 : x);

/** super_smoother_2pole(x, len): sm := c1 * (x + nz(x[1])) * 0.5 + c2 * nz(sm[1]) + c3 * nz(sm[2]) */
function superSmoother2Pole(x: number[], len: number): number[] {
  const f = (1.414 * Math.PI) / Math.max(len, 1);
  const a = Math.exp(-f);
  const c2 = 2.0 * a * Math.cos(f);
  const c3 = -a * a;
  const c1 = 1.0 - c2 - c3;
  const sm: number[] = new Array(x.length);
  for (let i = 0; i < x.length; i++) {
    const x1 = i > 0 ? x[i - 1] : NaN;
    const sm1 = i > 0 ? sm[i - 1] : NaN;
    const sm2 = i > 1 ? sm[i - 2] : NaN;
    sm[i] = c1 * (x[i] + nz(x1)) * 0.5 + c2 * nz(sm1) + c3 * nz(sm2);
  }
  return sm;
}

export function calculate(
  bars: Bar[],
  inputs: Partial<DominanceSignalApexInputs> = {},
  chart?: ChartContext,
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[] } {
  // barstate.isconfirmed: every bar is closed, except the last one when the chart context says that it is still open
  const lastBarOpen = !lastBarConfirmedOf(chart);
  const barIsConfirmed = (index: number) => !(lastBarOpen && index === bars.length - 1);
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const close = bars.map((b) => b.close);

  const ss5 = superSmoother2Pole(close, 5);
  const ss8 = superSmoother2Pole(close, 8);
  const ss13 = superSmoother2Pole(close, 13);
  const ss21 = superSmoother2Pole(close, 21);
  const bullish = bars.map((_b, i) => lt(ss5[i], ss8[i]) && lt(ss8[i], ss13[i]) && lt(ss13[i], ss21[i]));
  const bearish = bars.map((_b, i) => gt(ss5[i], ss8[i]) && gt(ss8[i], ss13[i]) && gt(ss13[i], ss21[i]));

  const hma = A(ta.hma(getSourceSeries(bars, cfg.src), cfg.length));

  let stateBull = false;
  let stateBear = false;
  let bullCount = NaN;
  let bearCount = NaN;
  let haOpenPrev = NaN;
  let haClosePrev = NaN;
  const denom = Math.max(cfg.steps - 1, 1);
  // bull_alpha = int(math.round(clamp(start + (end - start) * min(count - 1, steps - 1) / denom))), 0 when na
  const alphaOf = (count: number) => {
    if (isNaN(count)) return 0;
    const t = Math.min(count - 1, cfg.steps - 1) / denom;
    const f = cfg.startAlpha + (cfg.endAlpha - cfg.startAlpha) * t;
    return Math.round(Math.max(0.0, Math.min(100.0, f)));
  };

  const plot0: { time: number; value: number; color: string }[] = [];
  const markers: MarkerData[] = [];
  for (let i = 0; i < n; i++) {
    const b = bars[i];
    const haClose = (b.open + b.high + b.low + b.close) / 4.0;
    // ha_open := na(ha_open[1]) ? (open + close) / 2.0 : (ha_open[1] + ha_close[1]) / 2.0
    const haOpen = isNaN(haOpenPrev) ? (b.open + b.close) / 2.0 : (haOpenPrev + haClosePrev) / 2.0;
    haOpenPrev = haOpen;
    haClosePrev = haClose;
    const haDelta = haClose - haOpen;
    const confirmed = barIsConfirmed(i);

    // if barstate.isconfirmed: the state updates below
    if (confirmed && gt(haDelta, 0)) {
      stateBull = true;
      stateBear = false;
    }
    if (confirmed && lt(haDelta, 0)) {
      stateBear = true;
      stateBull = false;
    }
    const bullish1 = i > 0 && bullish[i - 1];
    const bearish1 = i > 0 && bearish[i - 1];
    if (confirmed && stateBull && !bullish[i] && bullish1) stateBull = false;
    if (confirmed && stateBear && !bearish[i] && bearish1) stateBear = false;

    const hma1 = i > 0 ? hma[i - 1] : NaN;
    const isHmaUp = gt(hma[i], hma1);
    const isHmaDown = lt(hma[i], hma1);
    plot0.push({ time: b.time, value: hma[i], color: String(color.new(isHmaUp ? color.lime : color.red, 50)) });

    bullCount = stateBull ? (isNaN(bullCount) ? 1 : bullCount + 1) : NaN;
    bearCount = stateBear ? (isNaN(bearCount) ? 1 : bearCount + 1) : NaN;
    // color.new(c, 100) is transparent: no shape drawn
    const bullAlpha = alphaOf(bullCount);
    const bearAlpha = alphaOf(bearCount);
    if (cfg.showShapes && stateBull && isHmaUp && bullAlpha < 100) {
      markers.push({ time: b.time, position: 'belowBar', shape: 'circle', color: String(color.new(cfg.bullColor, bullAlpha)), size: 'tiny' });
    }
    if (cfg.showShapes && stateBear && isHmaDown && bearAlpha < 100) {
      markers.push({ time: b.time, position: 'aboveBar', shape: 'circle', color: String(color.new(cfg.bearColor, bearAlpha)), size: 'tiny' });
    }
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: { plot0 },
    markers,
  };
}

export const DominanceSignalApex = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
};
