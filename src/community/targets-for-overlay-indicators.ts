/**
 * Targets For Overlay Indicators [LuxAlgo]
 *
 * Two target setups on one source (an overlay indicator or a price): a crossover target when the close crosses over
 * the source, and a crossunder target when the close crosses under it. A new target is set at the close plus (above
 * price target) or minus a distance: a currency amount, a percentage (the original adds the close to it), a number of
 * 50-bar ATRs or a number of ticks. The target is drawn as a vertical line from the close to the target and a
 * horizontal line that is extended bar by bar until the high (low for a target below the price; the close without
 * "Evaluate Wicks") goes beyond it; a "Target" label follows the end of the line and takes the full target colour
 * when the target is reached. Options: wait until the current target is reached before a new one, and a new target
 * as soon as one is reached. Candles take the colour of the latest new target until a target is reached. A dashboard
 * counts the targets and the reached ones; without any target (e.g. the default source, the close itself) it shows a
 * message instead.
 *
 * As the original: "New Target When Reached" of the crossunder target deletes the label of the crossover target.
 *
 * Alerts (alertcondition, `alerts` of the result): 'Target 1 New' / 'Target 2 New' on the bars where a target of the
 * setup is set, 'Target 1 Reached' / 'Target 2 Reached' on the bars where its active target is reached.
 *
 * Chart values read: the symbol tick (`syminfo.mintick`: "Ticks" distance and the label tooltips).
 *
 * Reference: "Targets For Overlay Indicators [LuxAlgo]" by LuxAlgo
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © LuxAlgo
 */

import {
  taCore, getSourceSeries, color, str, math, line, label, table, resetDrawings, setDrawingBar, drawingOutputs,
  type IndicatorResult, type InputConfig, type PlotConfig, type Bar, type Label, type Line, type SourceType,
} from 'oakscriptjs';
import type { BarColorData, LabelData, LineDrawingData, TableData } from '../types';
import { mintickOf, type ChartContext } from '../chart-context';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

type Distance = 'Currencies' | '%' | 'ATR' | 'Ticks';
const DISTANCES = ['Currencies', '%', 'ATR', 'Ticks'];
const STYLES = ['──', '- - -', '· · ·'];

export interface TargetsForOverlayIndicatorsInputs {
  source: SourceType;
  showLabels: boolean;
  candleColoring: boolean;
  enableTarget1: boolean;
  isLong1: boolean;
  waitTarget1: boolean;
  newTarget1: boolean;
  useWicks1: boolean;
  distTarget1: number;
  distOptions1: Distance;
  target1Css: string;
  target1Style: string;
  enableTarget2: boolean;
  isLong2: boolean;
  waitTarget2: boolean;
  newTarget2: boolean;
  useWicks2: boolean;
  distTarget2: number;
  distOptions2: Distance;
  target2Css: string;
  target2Style: string;
  showDash: boolean;
  dashLoc: 'Top Right' | 'Bottom Right' | 'Bottom Left';
  textSize: 'Tiny' | 'Small' | 'Normal';
}

export const defaultInputs: TargetsForOverlayIndicatorsInputs = {
  source: 'close',
  showLabels: true,
  candleColoring: true,
  enableTarget1: true,
  isLong1: true,
  waitTarget1: false,
  newTarget1: false,
  useWicks1: true,
  distTarget1: 3,
  distOptions1: 'ATR',
  target1Css: '#089981',
  target1Style: '- - -',
  enableTarget2: true,
  isLong2: false,
  waitTarget2: false,
  newTarget2: false,
  useWicks2: true,
  distTarget2: 3,
  distOptions2: 'ATR',
  target2Css: '#f23645',
  target2Style: '- - -',
  showDash: true,
  dashLoc: 'Top Right',
  textSize: 'Normal',
};

function targetInputs(k: 1 | 2): InputConfig[] {
  const g = k === 1 ? 'Crossover Source' : 'Crossunder Source';
  return [
    { id: `enableTarget${k}`, type: 'bool', title: k === 1 ? 'Show Crossover Target' : 'Show Crossunder Target', defval: true, group: g },
    { id: `isLong${k}`, type: 'bool', title: 'Above Price Target', defval: k === 1, inline: 'enable', group: g },
    { id: `waitTarget${k}`, type: 'bool', title: 'Wait Until Reached', defval: false, group: g },
    { id: `newTarget${k}`, type: 'bool', title: 'New Target When Reached', defval: false, group: g },
    { id: `useWicks${k}`, type: 'bool', title: 'Evaluate Wicks', defval: true, group: g },
    { id: `distTarget${k}`, type: 'float', title: 'Target Distance From Price', defval: 3, inline: 'dist1', group: g },
    { id: `distOptions${k}`, type: 'string', title: '', defval: 'ATR', options: DISTANCES, inline: 'dist1', group: g },
    { id: `target${k}Css`, type: 'color', title: 'Target Color ', defval: k === 1 ? '#089981' : '#f23645', inline: 'style', group: g },
    { id: `target${k}Style`, type: 'string', title: '    Levels Style', defval: '- - -', options: STYLES, inline: 'style', group: g },
  ];
}

export const inputConfig: InputConfig[] = [
  { id: 'source', type: 'source', title: 'source', defval: 'close' },
  { id: 'showLabels', type: 'bool', title: 'Show Target Labels', defval: true },
  { id: 'candleColoring', type: 'bool', title: 'Candle Coloring', defval: true },
  ...targetInputs(1),
  ...targetInputs(2),
  { id: 'showDash', type: 'bool', title: 'Show Dashboard', defval: true, group: 'Dashboard' },
  { id: 'dashLoc', type: 'string', title: 'Location', defval: 'Top Right', options: ['Top Right', 'Bottom Right', 'Bottom Left'], group: 'Dashboard' },
  { id: 'textSize', type: 'string', title: 'Size', defval: 'Normal', options: ['Tiny', 'Small', 'Normal'], group: 'Dashboard' },
];

export const plotConfig: PlotConfig[] = [];

export const metadata = {
  title: 'Targets For Overlay Indicators [LuxAlgo]',
  shortTitle: 'LuxAlgo - Targets For Overlay Indicators',
  overlay: true,
};

/** indicator(max_lines_count = 500, max_labels_count = 500) */
const MAX_OBJECTS = 500;

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const nz = (v: number) => (Number.isNaN(v) ? 0 : v);

interface Target {
  value: number;
  reached: boolean;
  active: boolean;
  v?: Line;
  h?: Line;
  lbl?: Label;
}

const lineStyle = (s: string): 'solid' | 'dashed' | 'dotted' => (s === '- - -' ? 'dashed' : s === '· · ·' ? 'dotted' : 'solid');

export function calculate(
  bars: Bar[],
  inputs: Partial<TargetsForOverlayIndicatorsInputs> = {},
  chart?: ChartContext,
): Omit<IndicatorResult, 'lines' | 'labels' | 'tables' | 'barColors'> & {
  lines: LineDrawingData[]; labels: LabelData[]; tables: TableData[]; barColors: BarColorData[];
} & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const mintick = mintickOf(chart);
  const close = bars.map((b) => b.close);
  const high = bars.map((b) => b.high);
  const low = bars.map((b) => b.low);
  const source = getSourceSeries(bars, cfg.source).toArray().map((v) => v ?? NaN);
  // ta.atr(50) of the "ATR" distance
  const atr = taCore.atr(50, high, low, close);

  /** One target setup: condition and distance of every bar */
  const setup = (k: 1 | 2) => {
    const g = cfg as unknown as Record<string, unknown>;
    const distTarget = Number(g[`distTarget${k}`]);
    const option = g[`distOptions${k}`] as Distance;
    const dist = close.map((cl, i) => (option === 'Currencies' ? distTarget
      : option === '%' ? cl + (distTarget / 100) * cl
        : option === 'ATR' ? nz(atr[i]) * distTarget
          : mintick * distTarget));
    return {
      cond: k === 1 ? taCore.crossover(close, source) : taCore.crossunder(close, source),
      dist,
      enable: Boolean(g[`enableTarget${k}`]),
      isLong: Boolean(g[`isLong${k}`]),
      useWicks: Boolean(g[`useWicks${k}`]),
      wait: Boolean(g[`waitTarget${k}`]),
      newTarget: Boolean(g[`newTarget${k}`]),
      css: String(g[`target${k}Css`]),
      style: lineStyle(String(g[`target${k}Style`])),
      // var target = target.new(reached = true, active = false)
      obj: { value: NaN, reached: true, active: false } as Target,
      count: 0,
      countReached: 0,
      // isNewTarget<k> / isTgReached<k> of every bar
      isNew: new Array<boolean>(n).fill(false),
      isReached: new Array<boolean>(n).fill(false),
    };
  };
  const t1 = setup(1);
  const t2 = setup(2);

  resetDrawings({ line: MAX_OBJECTS, label: MAX_OBJECTS });
  const tableSize = cfg.textSize === 'Tiny' ? 'tiny' : cfg.textSize === 'Small' ? 'small' : 'normal';
  const position = cfg.dashLoc === 'Bottom Left' ? 'bottom_left' : cfg.dashLoc === 'Top Right' ? 'top_right' : 'bottom_right';
  const barColors: BarColorData[] = [];
  const WHITE = '#FFFFFF';
  let css: string | null = null; // var color css = na
  let tb: ReturnType<typeof table.new> | undefined;

  try {
    for (let i = 0; i < n; i++) {
      setDrawingBar(i, i === n - 1);
      const bar = bars[i];
      for (const t of [t1, t2]) {
        const o = t.obj;
        if (o.active && o.reached === false) {
          if (o.h) line.set_x2(o.h, i);
          if (o.lbl) label.set_x(o.lbl, i);
        }
        const price = t.isLong ? (t.useWicks ? bar.high : bar.close) : (t.useWicks ? bar.low : bar.close);
        if ((t.isLong ? gt(price, o.value) : lt(price, o.value)) && o.active) {
          o.reached = true;
          o.active = false;
          t.countReached += 1;
          t.isReached[i] = true;
          css = null;
          if (o.lbl) label.set_color(o.lbl, t.css);
        }
        if (t.enable && ((t.cond[i] && (t.wait ? t.obj.reached : true)) || (t.newTarget && t.obj.reached))) {
          const targetValue = bar.close + (t.isLong ? t.dist[i] : -t.dist[i]);
          // "Delete label if reached and creating new target": the crossunder setup deletes the label of the
          // crossover target, as the original
          if (t.newTarget && t.obj.reached && cfg.showLabels && t1.obj.lbl) label.delete(t1.obj.lbl);
          const created: Target = { value: targetValue, reached: false, active: true };
          t.obj = created;
          if (cfg.showLabels) {
            created.lbl = label.new(i, targetValue, 'Target', 'bar_index', 'price', String(color.new(t.css, 50)),
              'label_left', WHITE, 'tiny', undefined, str.tostring(targetValue, 'mintick', mintick, chart?.pricescale));
          }
          css = t.css;
          // set_target(): vertical line from the close, horizontal line at the target
          created.v = line.new(i, bar.close, i, targetValue, 'bar_index', undefined, t.css, t.style);
          created.h = line.new(i, targetValue, i, targetValue, 'bar_index', undefined, t.css, t.style);
          t.count += 1;
          t.isNew[i] = true;
        }
      }
      if (cfg.candleColoring && css !== null) barColors.push({ time: bar.time, color: css });

      if (i === 0) {
        // var tb = table.new(...)
        tb = table.new(position, 3, 4, '#1e222d', '#373a46', 1, '#373a46', 1);
      }
      if (cfg.showDash && tb) {
        const cell = (col: number, row: number, text: string) => table.cell(tb!, col, row, text, undefined, undefined,
          WHITE, undefined, undefined, tableSize);
        if (i === 0) {
          if (t1.enable || t2.enable) {
            cell(0, 0, '');
            cell(1, 0, 'Count');
            cell(2, 0, 'Target\nReached');
            cell(0, 3, 'Total');
          }
          if (t1.enable) cell(0, 1, 'Target 1');
          if (t2.enable) cell(0, 2, 'Target 2');
        }
        if (i === n - 1) {
          const totT = t1.count + t2.count;
          const totR = t1.countReached + t2.countReached;
          if (totT === 0) {
            table.clear(tb, 0, 0, 2, 3);
            cell(0, 0, 'Please Select another input source from the "Source" setting.');
          } else {
            const rate = (r: number, t: number) => str.format('{0} ({1}%)', r, math.round((100 / t) * r, 1));
            if (t1.enable) {
              cell(1, 1, str.tostring(t1.count));
              cell(2, 1, rate(t1.countReached, t1.count));
            }
            if (t2.enable) {
              cell(1, 2, str.tostring(t2.count));
              cell(2, 2, rate(t2.countReached, t2.count));
            }
            if (t1.enable || t2.enable) {
              cell(1, 3, str.tostring(totT));
              cell(2, 3, rate(totR, totT));
            }
          }
        }
      }
    }
  } finally {
    setDrawingBar(null);
  }
  const drawn = drawingOutputs(bars);
  resetDrawings();

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {},
    barColors,
    lines: drawn.lines ?? [],
    labels: drawn.labels ?? [],
    tables: drawn.tables ?? [],
    alerts: alertStates(alertConditions, bars, [t1.isNew, t1.isReached, t2.isNew, t2.isReached]),
  };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'Target 1 New', message: 'Target 1 New' },
  { id: 'alert1', title: 'Target 1 Reached', message: 'Target 1 Reached' },
  { id: 'alert2', title: 'Target 2 New', message: 'Target 2 New' },
  { id: 'alert3', title: 'Target 2 Reached', message: 'Target 2 Reached' },
];

export const TargetsForOverlayIndicators = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  alertConditions,
};
