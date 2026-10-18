/**
 * Relative Strength Heatmap
 *
 * Twenty RSIs of the source, with lengths round((len + step * k) * mult) for k = 0..19. Each RSI is drawn as a
 * one-unit tile (an area from k to k + 1) coloured by its value with a ten-step palette (Viridis, Jet, ...). Two
 * lines count the RSIs above 70 and below 30. When 10 or more RSIs are above 70 (below 30) the price pane background
 * takes the colour of the first (last) RSI tile at 90 % transparency (two layers, as the original).
 * Alerts (alertcondition, `alerts` of the result): 'RSI Heatmap Strong Bull' (10 or more RSIs above 70) and 'RSI
 * Heatmap Strong Bear' (10 or more RSIs below 30).
 *
 * Reference: "Relative Strength Heatmap [BackQuant]" by BackQuant
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © BackQuant
 */

import {
  ta, Series, getSourceSeries, color,
  type IndicatorResult, type InputConfig, type PlotConfig, type Bar, type SourceType,
} from 'oakscriptjs';
import type { BgColorData } from '../types';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

export type HeatmapPalette = 'Viridis' | 'Jet' | 'Plasma' | 'Custom Heat' | 'Gray' | 'Cividis' | 'Inferno' | 'Magma'
  | 'Turbo' | 'Rainbow';

export interface RelativeStrengthHeatmapInputs {
  /** Heatmap colour palette */
  palType: HeatmapPalette;
  /** RS period (length of the first RSI) */
  len: number;
  /** Added to each successive RSI length */
  step: number;
  /** Multiplies each RSI length after the step */
  mult: number;
  /** Calculation source */
  src: SourceType;
  show1: boolean;
  show2: boolean;
  show3: boolean;
  show4: boolean;
  /** Show the counts of RSIs > 70 and < 30 */
  showCount: boolean;
}

export const defaultInputs: RelativeStrengthHeatmapInputs = {
  palType: 'Viridis',
  len: 1,
  step: 2,
  mult: 1.0,
  src: 'close',
  show1: true,
  show2: true,
  show3: true,
  show4: true,
  showCount: true,
};

const PALETTES: HeatmapPalette[] = ['Viridis', 'Jet', 'Plasma', 'Custom Heat', 'Gray', 'Cividis', 'Inferno', 'Magma',
  'Turbo', 'Rainbow'];
const PLT_TT = 'RSIs are broken up into 4 groups. Turning this off with remove 5 tiles.';

export const inputConfig: InputConfig[] = [
  { id: 'palType', type: 'string', title: 'Heatmap Color Palette', defval: 'Viridis', options: PALETTES },
  { id: 'len', type: 'int', title: 'RS Period', defval: 1, group: 'Calculation Settings', inline: 'Calculation Settings' },
  { id: 'step', type: 'int', title: 'RSI Step', defval: 2, group: 'Calculation Settings', tooltip: 'Adds this amount to each successive RSI length.' },
  { id: 'mult', type: 'float', title: 'RSI Multiplier', defval: 1.0, group: 'Calculation Settings', tooltip: 'Multiplies each generated RSI length after the step is applied.' },
  { id: 'src', type: 'source', title: 'Calculation Source', defval: 'close', group: 'Calculation Settings', inline: 'Calculation Settings' },
  { id: 'show1', type: 'bool', title: 'Show Group 1', defval: true, group: 'Plotting and Coloring Settings', inline: 'inline_plotting', tooltip: PLT_TT },
  { id: 'show2', type: 'bool', title: 'Show Group 2', defval: true, group: 'Plotting and Coloring Settings', inline: 'inline_plotting', tooltip: PLT_TT },
  { id: 'show3', type: 'bool', title: 'Show Group 3', defval: true, group: 'Plotting and Coloring Settings', inline: 'inline_plotting', tooltip: PLT_TT },
  { id: 'show4', type: 'bool', title: 'Show Group 4', defval: true, group: 'Plotting and Coloring Settings', inline: 'inline_plotting', tooltip: PLT_TT },
  { id: 'showCount', type: 'bool', title: 'Show Bull and Bear Count', defval: true, group: 'Plotting and Coloring Settings', tooltip: 'This is the static count of all RSIs > 70 (White Line), and RSIs<30 (Black Line)' },
];

export const plotConfig: PlotConfig[] = [
  ...Array.from({ length: 20 }, (_v, k): PlotConfig => ({
    id: `plot${k}`, title: `RSI ${k + 1}`, color: '#2962ff', lineWidth: 1, style: 'area', histbase: k,
  })),
  { id: 'plot20', title: 'RSI > 70 Count', color: color.white, lineWidth: 4 },
  { id: 'plot21', title: 'RSI < 30 Count', color: color.black, lineWidth: 4 },
];

export const metadata = {
  title: 'Relative Strength Heatmap [BackQuant]',
  shortTitle: 'Relative Strength Heatmap [BackQuant]',
  overlay: false,
};

/**
 * Palette colours of the ten bands, from the lowest RSI band to the highest. The bands start at 10, 20, ... 90,
 * except Custom Heat (15, 30, 45, 55, 60, 70, 80, 90; nine colours).
 */
const COLOURS: Record<HeatmapPalette, string[]> = {
  Viridis: ['#440154', '#472878', '#3b528b', '#2c728e', '#21918c', '#28ae80', '#5ec962', '#aadc32', '#d5e21a', '#fde725'],
  Jet: ['#00007f', '#0000ff', '#007fff', '#00ffff', '#7fff7f', '#ffff00', '#ffbf00', '#ff7f00', '#ff0000', '#7f0000'],
  Plasma: ['#0d0887', '#41049d', '#6a00a8', '#8f0da4', '#b12a90', '#cc4778', '#e16462', '#f2844b', '#fca636', '#fcfdbf'],
  'Custom Heat': ['#004466', '#006688', '#00a0a0', '#cccccc', '#ffd480', '#ffb347', '#ff7f24', '#ff4500', '#b22222'],
  Gray: ['#ffffff', '#f0f0f0', '#e0e0e0', '#d0d0d0', '#c0c0c0', '#a0a0a0', '#808080', '#606060', '#404040', '#000000'],
  Cividis: ['#00204c', '#173067', '#36476f', '#4b5d6b', '#62735f', '#7b884c', '#979935', '#b6ba19', '#d4d322', '#fdea45'],
  Inferno: ['#000004', '#1b0c41', '#3b0f70', '#641a80', '#8c2981', '#b5367a', '#de4968', '#f66e5b', '#fe9f6d', '#fcfdbf'],
  Magma: ['#000004', '#180f3d', '#3b0f70', '#5e177f', '#7f2482', '#a02a7d', '#c13672', '#de4968', '#f66e5b', '#fbfbbf'],
  Turbo: ['#30123b', '#4145ad', '#2f6db3', '#2488c7', '#1fa3c2', '#35b893', '#84c341', '#d1c93c', '#f9a31b', '#f0600a'],
  Rainbow: ['#0000ff', '#0040ff', '#0080ff', '#00c0ff', '#00ff80', '#40ff00', '#80ff00', '#ffc000', '#ff8000', '#ff0000'],
};
const LIMITS_10 = [10, 20, 30, 40, 50, 60, 70, 80, 90];
const LIMITS_HEAT = [15, 30, 45, 55, 60, 70, 80, 90];

/** Pine float comparisons: a < b only when b - a > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;

/** coloring(rs, type): the first band whose limit is above v; na (all comparisons false) gives the last colour */
function coloring(v: number, type: HeatmapPalette): string {
  const cols = COLOURS[type];
  if (!cols) return color.white;
  const limits = type === 'Custom Heat' ? LIMITS_HEAT : LIMITS_10;
  for (let j = 0; j < limits.length; j++) {
    if (lt(v, limits[j])) return cols[j];
  }
  return cols[cols.length - 1];
}

export function calculate(
  bars: Bar[],
  inputs: Partial<RelativeStrengthHeatmapInputs> = {},
): IndicatorResult & { bgColors: BgColorData[] } & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const src = Series.fromArray(bars, getSourceSeries(bars, cfg.src).toArray().map((v) => v ?? NaN));

  // rsK = ta.rsi(src, int(math.round((len + step * k) * mult)))
  const rs: number[][] = [];
  for (let k = 0; k < 20; k++) {
    const length = Math.trunc(Math.round((cfg.len + cfg.step * k) * cfg.mult));
    rs.push(ta.rsi(src, length).toArray().map((v) => v ?? NaN));
  }

  const shows = [cfg.show1, cfg.show2, cfg.show3, cfg.show4];
  const plots: Record<string, { time: number; value: number; color?: string }[]> = {};
  // plot(series = showG ? k + 1 : na, title = "RSI k+1", color = coloring(rsK, pal_type), style.area, histbase = k)
  for (let k = 0; k < 20; k++) {
    const on = shows[Math.floor(k / 5)];
    plots[`plot${k}`] = bars.map((b, i) => ({ time: b.time, value: on ? k + 1 : NaN, color: coloring(rs[k][i], cfg.palType) }));
  }

  const bullCount: number[] = new Array(n);
  const bearCount: number[] = new Array(n);
  for (let i = 0; i < n; i++) {
    let bull = 0;
    let bear = 0;
    for (let k = 0; k < 20; k++) {
      bull += gt(rs[k][i], 70) ? 1 : 0;
      bear += lt(rs[k][i], 30) ? 1 : 0;
    }
    bullCount[i] = bull;
    bearCount[i] = bear;
  }
  plots.plot20 = bars.map((b, i) => ({ time: b.time, value: cfg.showCount ? bullCount[i] : NaN }));
  plots.plot21 = bars.map((b, i) => ({ time: b.time, value: cfg.showCount ? bearCount[i] : NaN }));

  // bgcolor(strongBull ? color.new(coloring(rs1), 90) : na, force_overlay = true) twice, then the same for
  // strongBear with rs20: four layers in the Pine order
  const bgColors: BgColorData[] = [];
  for (let i = 0; i < n; i++) {
    const t = bars[i].time;
    if (bullCount[i] >= 10) {
      const c = String(color.new(coloring(rs[0][i], cfg.palType), 90));
      bgColors.push({ time: t, color: c, forceOverlay: true, id: 'bgcolor0' }, { time: t, color: c, forceOverlay: true, id: 'bgcolor1' });
    }
    if (bearCount[i] >= 10) {
      const c = String(color.new(coloring(rs[19][i], cfg.palType), 90));
      bgColors.push({ time: t, color: c, forceOverlay: true, id: 'bgcolor2' }, { time: t, color: c, forceOverlay: true, id: 'bgcolor3' });
    }
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots,
    bgColors,
    // strongBull = bullCount >= 10, strongBear = bearCount >= 10
    alerts: alertStates(alertConditions, bars, [bullCount.map((c) => c >= 10), bearCount.map((c) => c >= 10)]),
  };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'RSI Heatmap Strong Bull', message: 'RSI heatmap strongly overbought cluster {{exchange}}:{{ticker}}' },
  { id: 'alert1', title: 'RSI Heatmap Strong Bear', message: 'RSI heatmap strongly oversold cluster {{exchange}}:{{ticker}}' },
];

export const RelativeStrengthHeatmap = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  alertConditions,
};
