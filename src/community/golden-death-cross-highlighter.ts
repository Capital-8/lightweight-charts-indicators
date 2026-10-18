/**
 * Golden/Death Cross Highlighter
 *
 * A fast and a slow SMA of the close. A golden cross (fast crosses above slow) starts the golden state, a death cross
 * (fast crosses below slow) starts the death state. The background is yellow in the golden state when the close is
 * above both MAs and red in the death state when the close is below both MAs (transparency from the inputs).
 * Alerts (alertcondition, `alerts` of the result): 'Golden Cross' and 'Death Cross', on the bars of the crosses.
 *
 * Reference: "Golden/Death Cross Highlighter" by dripvesting
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 */

import { ta, Series, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { BgColorData } from '../types';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

export type GoldenDeathCrossHighlighterLineStyle = 'Solid' | 'Dashed' | 'Dotted';

export interface GoldenDeathCrossHighlighterInputs {
  fastLength: number;
  slowLength: number;
  /** Transparency (0-100) of the golden state background */
  goldenOpacity: number;
  /** Transparency (0-100) of the death state background */
  deathOpacity: number;
  fastMAColor: string;
  slowMAColor: string;
  /** Line width of the fast MA (static plot width: the port keeps the default 2) */
  fastMAWidth: number;
  /** Line width of the slow MA (static plot width: the port keeps the default 2) */
  slowMAWidth: number;
  /** Solid = line, Dashed = line with breaks, Dotted = circles (static plot style: the port keeps the default) */
  fastMAStyle: GoldenDeathCrossHighlighterLineStyle;
  /** Solid = line, Dashed = line with breaks, Dotted = circles (static plot style: the port keeps the default) */
  slowMAStyle: GoldenDeathCrossHighlighterLineStyle;
}

export const defaultInputs: GoldenDeathCrossHighlighterInputs = {
  fastLength: 50,
  slowLength: 200,
  goldenOpacity: 90,
  deathOpacity: 90,
  fastMAColor: color.blue,
  slowMAColor: color.red,
  fastMAWidth: 2,
  slowMAWidth: 2,
  fastMAStyle: 'Solid',
  slowMAStyle: 'Solid',
};

const STYLES: GoldenDeathCrossHighlighterLineStyle[] = ['Solid', 'Dashed', 'Dotted'];

export const inputConfig: InputConfig[] = [
  { id: 'fastLength', type: 'int', title: 'Fast MA Length', defval: 50 },
  { id: 'slowLength', type: 'int', title: 'Slow MA Length', defval: 200 },
  { id: 'goldenOpacity', type: 'int', title: 'Golden Cross Highlight Opacity', defval: 90, min: 0, max: 100 },
  { id: 'deathOpacity', type: 'int', title: 'Death Cross Highlight Opacity', defval: 90, min: 0, max: 100 },
  { id: 'fastMAColor', type: 'color', title: 'Fast MA Color', defval: color.blue },
  { id: 'slowMAColor', type: 'color', title: 'Slow MA Color', defval: color.red },
  { id: 'fastMAWidth', type: 'int', title: 'Fast MA Width', defval: 2, min: 1, max: 4 },
  { id: 'slowMAWidth', type: 'int', title: 'Slow MA Width', defval: 2, min: 1, max: 4 },
  { id: 'fastMAStyle', type: 'string', title: 'Fast MA Style', defval: 'Solid', options: STYLES },
  { id: 'slowMAStyle', type: 'string', title: 'Slow MA Style', defval: 'Solid', options: STYLES },
];

// Plot widths and styles come from inputs in Pine (f_lineStyle: "Dashed" -> plot.style_linebr, "Dotted" ->
// plot.style_circles, else plot.style_line); PlotConfig is static, so the default inputs are used.
export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Fast MA', color: color.blue, lineWidth: 2, style: 'line' },
  { id: 'plot1', title: 'Slow MA', color: color.red, lineWidth: 2, style: 'line' },
];

export const metadata = {
  title: 'Golden/Death Cross Highlighter',
  shortTitle: 'Golden/Death Cross Highlighter',
  overlay: true,
};

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;

export function calculate(
  bars: Bar[],
  inputs: Partial<GoldenDeathCrossHighlighterInputs> = {},
): IndicatorResult & { bgColors: BgColorData[] } & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const close = Series.fromArray(bars, bars.map((b) => b.close));
  const fastMASeries = ta.sma(close, cfg.fastLength);
  const slowMASeries = ta.sma(close, cfg.slowLength);
  const fastMA = A(fastMASeries);
  const slowMA = A(slowMASeries);
  const goldenCross = A(ta.crossover(fastMASeries, slowMASeries));
  const deathCross = A(ta.crossunder(fastMASeries, slowMASeries));

  const goldenColor = String(color.new(color.yellow, cfg.goldenOpacity));
  const deathColor = String(color.new(color.red, cfg.deathOpacity));
  const bgColors: BgColorData[] = [];
  let inGoldenCross = false;
  let inDeathCross = false;
  bars.forEach((b, i) => {
    if (goldenCross[i]) {
      inGoldenCross = true;
      inDeathCross = false;
    } else if (deathCross[i]) {
      inGoldenCross = false;
      inDeathCross = true;
    }
    const bullishCondition = inGoldenCross && gt(b.close, fastMA[i]) && gt(b.close, slowMA[i]);
    const bearishCondition = inDeathCross && lt(b.close, fastMA[i]) && lt(b.close, slowMA[i]);
    if (bullishCondition) bgColors.push({ time: b.time, color: goldenColor });
    else if (bearishCondition) bgColors.push({ time: b.time, color: deathColor });
  });

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {
      plot0: bars.map((b, i) => ({ time: b.time, value: fastMA[i], color: cfg.fastMAColor })),
      plot1: bars.map((b, i) => ({ time: b.time, value: slowMA[i], color: cfg.slowMAColor })),
    },
    bgColors,
    // alertcondition(goldenCross, "Golden Cross") / alertcondition(deathCross, "Death Cross")
    alerts: alertStates(alertConditions, bars, [goldenCross.map((v) => !!v), deathCross.map((v) => !!v)]),
  };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'Golden Cross', message: 'Golden Cross Detected!' },
  { id: 'alert1', title: 'Death Cross', message: 'Death Cross Detected!' },
];

export const GoldenDeathCrossHighlighter = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  alertConditions,
};
