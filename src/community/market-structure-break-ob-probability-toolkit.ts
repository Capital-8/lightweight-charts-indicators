/**
 * Market Structure Break & OB Probability Toolkit [LuxAlgo]
 *
 * Market structure break (MSB): a close that crosses above the latest pivot high (or below the latest pivot low)
 * while the z-score of the price change (change of the close against its 50-bar average and standard deviation) is
 * beyond "MSB Momentum Z-Score". A line goes from the pivot bar to the break bar, with the text "MSB" at its middle.
 *
 * Order block: the latest opposite candle among the 10 bars before the break (the break bar itself when there is
 * none) gives a box from its high to its low, a dashed line at its middle and a quality score next to it:
 * min(100, |z-score| x 20 + volume percent rank (100 bars) x 0.5). A score above 80 is a high probability zone
 * (brighter colours). Box, line and score follow the current bar (15 and 18 bars ahead) until the price goes through
 * the block (low below the bottom of a bullish block, high above the top of a bearish block); then they turn grey
 * and stop on that bar ("Historical"), or are removed ("Present"). "Extend Broken OBs" keeps the two latest broken
 * blocks growing for 50 bars. Only the latest "Max Active OBs" blocks are kept.
 *
 * Dashboard: share of the breaks whose block was broken later ("Reliability") and the number of live high
 * probability blocks.
 *
 * Sessions: a box over the range of each enabled session, with its name.
 * The session hours are read in the exchange time zone, given by the optional third argument (see
 * src/chart-context.ts); without it they are read in UTC.
 *
 * At most 500 lines, 500 labels and 500 boxes are kept (the oldest are removed first).
 *
 * Reference: "Market Structure Break & OB Probability Toolkit [LuxAlgo]" by LuxAlgo
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © LuxAlgo
 */

import {
  ta, math, str, color, time as pineTime, timeframe, Series, box, line, label, resetDrawings, setDrawingBar, varDrawing,
  type DrawingVariable, type IndicatorResult, type InputConfig, type PlotConfig, type Bar,
} from 'oakscriptjs';
import type { BoxData, LabelData, LineDrawingData, TableData, TableCellData } from '../types';
import { barInterval, barTime } from '../bar-time';
import { chartTimeframe } from '../anchor-period';
import { timezoneOf, type ChartContext } from '../chart-context';

export interface MarketStructureBreakObProbabilityToolkitInputs {
  showStatsInput: boolean;
  dashboardPositionInput: 'Top Right' | 'Bottom Right' | 'Bottom Left';
  dashboardSizeInput: 'Tiny' | 'Small' | 'Normal' | 'Large' | 'Huge';
  /** Bars on each side of a pivot */
  pivotLenInput: number;
  msbZScoreInput: number;
  modeInput: 'Historical' | 'Present';
  obCountInput: number;
  extendBrokenInput: boolean;
  hideOverlapsInput: boolean;
  showSessionsInput: boolean;
  showLondonInput: boolean;
  londonSessInput: string;
  londonColInput: string;
  showNYInput: boolean;
  nySessInput: string;
  nyColInput: string;
  showTokyoInput: boolean;
  tokyoSessInput: string;
  tokyoColInput: string;
  showSydneyInput: boolean;
  sydneySessInput: string;
  sydneyColInput: string;
}

export const defaultInputs: MarketStructureBreakObProbabilityToolkitInputs = {
  showStatsInput: true,
  dashboardPositionInput: 'Top Right',
  dashboardSizeInput: 'Small',
  pivotLenInput: 7,
  msbZScoreInput: 0.5,
  modeInput: 'Historical',
  obCountInput: 10,
  extendBrokenInput: false,
  hideOverlapsInput: false,
  showSessionsInput: true,
  showLondonInput: false,
  londonSessInput: '0800-1700:1234567',
  londonColInput: '#3B82F6',
  showNYInput: false,
  nySessInput: '1300-2200:1234567',
  nyColInput: '#F97316',
  showTokyoInput: false,
  tokyoSessInput: '0000-0900:1234567',
  tokyoColInput: '#F43F5E',
  showSydneyInput: false,
  sydneySessInput: '2100-0600:1234567',
  sydneyColInput: '#EAB308',
};

const DASHBOARD_GROUP = 'Dashboard';
const MS_GROUP = 'Market Structure';
const VISUALS_GROUP = 'Visuals';
const OB_GROUP = 'Order Blocks';
const SESSIONS_GROUP = 'Sessions';

export const inputConfig: InputConfig[] = [
  { id: 'showStatsInput', type: 'bool', title: 'Show Advanced Analytics', defval: true, group: DASHBOARD_GROUP },
  {
    id: 'dashboardPositionInput', type: 'string', title: 'Position', defval: 'Top Right',
    options: ['Top Right', 'Bottom Right', 'Bottom Left'], group: DASHBOARD_GROUP,
  },
  {
    id: 'dashboardSizeInput', type: 'string', title: 'Size', defval: 'Small',
    options: ['Tiny', 'Small', 'Normal', 'Large', 'Huge'], group: DASHBOARD_GROUP,
  },
  { id: 'pivotLenInput', type: 'int', title: 'Pivot Lookback', defval: 7, min: 1, group: MS_GROUP },
  { id: 'msbZScoreInput', type: 'float', title: 'MSB Momentum Z-Score', defval: 0.5, min: 0.1, step: 0.1, group: MS_GROUP },
  { id: 'modeInput', type: 'string', title: 'Display Mode', defval: 'Historical', options: ['Historical', 'Present'], group: VISUALS_GROUP },
  { id: 'obCountInput', type: 'int', title: 'Max Active OBs', defval: 10, min: 1, max: 100, group: OB_GROUP },
  { id: 'extendBrokenInput', type: 'bool', title: 'Extend Broken OBs', defval: false, group: OB_GROUP },
  { id: 'hideOverlapsInput', type: 'bool', title: 'Hide Overlapping OBs', defval: false, group: OB_GROUP },
  { id: 'showSessionsInput', type: 'bool', title: 'Show Session Ranges', defval: true, group: SESSIONS_GROUP },
  { id: 'showLondonInput', type: 'bool', title: 'London Session', defval: false, group: SESSIONS_GROUP },
  { id: 'londonSessInput', type: 'session', title: 'London Time', defval: '0800-1700:1234567', group: SESSIONS_GROUP },
  { id: 'londonColInput', type: 'color', title: 'London Color', defval: '#3B82F6', group: SESSIONS_GROUP, inline: 'London' },
  { id: 'showNYInput', type: 'bool', title: 'New York Session', defval: false, group: SESSIONS_GROUP },
  { id: 'nySessInput', type: 'session', title: 'New York Time', defval: '1300-2200:1234567', group: SESSIONS_GROUP },
  { id: 'nyColInput', type: 'color', title: 'New York Color', defval: '#F97316', group: SESSIONS_GROUP, inline: 'NY' },
  { id: 'showTokyoInput', type: 'bool', title: 'Tokyo Session', defval: false, group: SESSIONS_GROUP },
  { id: 'tokyoSessInput', type: 'session', title: 'Tokyo Time', defval: '0000-0900:1234567', group: SESSIONS_GROUP },
  { id: 'tokyoColInput', type: 'color', title: 'Tokyo Color', defval: '#F43F5E', group: SESSIONS_GROUP, inline: 'Tokyo' },
  { id: 'showSydneyInput', type: 'bool', title: 'Sydney Session', defval: false, group: SESSIONS_GROUP },
  { id: 'sydneySessInput', type: 'session', title: 'Sydney Time', defval: '2100-0600:1234567', group: SESSIONS_GROUP },
  { id: 'sydneyColInput', type: 'color', title: 'Sydney Color', defval: '#EAB308', group: SESSIONS_GROUP, inline: 'Sydney' },
];

export const plotConfig: PlotConfig[] = [];

export const metadata = {
  title: 'Market Structure Break & OB Probability Toolkit [LuxAlgo]',
  shortTitle: 'LuxAlgo - Market Structure Break & OB Probability Toolkit',
  overlay: true,
};

const BULL_COLOR = '#089981';
const BEAR_COLOR = '#F23645';
const HPZ_BULL = '#1DE9B6';
const HPZ_BEAR = '#FF5252';
/** color.gray */
const NEUTRAL_COLOR = '#787B86';
const DATA = '#DBDBDB';
const HEADERS = '#808080';
const BACKGROUND = '#161616';
const BORDERS = '#2E2E2E';

/** indicator(max_boxes_count = 500, max_lines_count = 500, max_labels_count = 500) */
const MAX_OBJECTS = 500;

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const ge = (a: number, b: number) => a - b >= -EPS;
const le = (a: number, b: number) => b - a >= -EPS;

interface Bx {
  left: number;
  top: number;
  right: number;
  bottom: number;
  border: string;
  bg: string;
  style: 'dashed' | 'dotted';
}
interface Ln {
  x1: number;
  x2: number;
  y: number;
  color: string;
  dashed: boolean;
}
interface Lb {
  x: number;
  y: number;
  text: string;
  color: string;
  textColor: string;
  style: 'label_down' | 'label_up' | 'none';
  size: 'small' | 'tiny';
  align: 'center' | 'left';
}
/**
 * Live drawings of one kind, in creation order, kept by the drawing registry of the library: each object of the
 * script has an object of the registry, which applies the limit of the script (max_*_count) with the rules of the
 * original platform. An object that a `var` variable of the script refers to (the latest box and label of each
 * session) is not deleted by the limit, but it counts.
 */
class Live<T extends object, R extends object> {
  private readonly data = new Map<R, T>();
  private readonly refs = new WeakMap<T, R>();
  private readonly vars = new Map<string, DrawingVariable<R>>();
  constructor(private readonly make: (o: T) => R, private readonly live: () => R[], private readonly del: (ref: R) => void) {}
  add(o: T): T {
    const ref = this.make(o);
    this.data.set(ref, o);
    this.refs.set(o, ref);
    return o;
  }
  /** `x.delete()` of the script (no effect on an object already deleted) */
  remove(o: T): void {
    const ref = this.refs.get(o);
    if (ref) this.del(ref);
  }
  /** The `var` variable `name` now refers to `o` (the object it referred to before can be deleted) */
  hold(name: string, o: T): T {
    let v = this.vars.get(name);
    if (!v) {
      v = varDrawing<R>();
      this.vars.set(name, v);
    }
    v.value = this.refs.get(o);
    return o;
  }
  /** The objects alive, in creation order */
  get items(): T[] {
    return this.live().map((ref) => this.data.get(ref)!);
  }
}

interface OrderBlock {
  box: Bx;
  label: Lb;
  poc: Ln;
  top: number;
  bottom: number;
  isBull: boolean;
  isHPZ: boolean;
  mitigated: boolean;
  mitigationBar: number;
}

export function calculate(
  bars: Bar[],
  inputs: Partial<MarketStructureBreakObProbabilityToolkitInputs> = {},
  chart?: ChartContext,
): Omit<IndicatorResult, 'boxes' | 'labels' | 'lines' | 'tables'> & {
  boxes: BoxData[];
  labels: LabelData[];
  lines: LineDrawingData[];
  tables: TableData[];
} {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const pivotLen = Math.trunc(cfg.pivotLenInput);
  const obCount = Math.trunc(cfg.obCountInput);
  const present = cfg.modeInput === 'Present';

  // Core calculations
  const closeS = new Series(bars, (b) => b.close);
  const priceChangeS = ta.change(closeS);
  const priceChange = priceChangeS.toArray();
  const avgChange = ta.sma(priceChangeS, 50).toArray();
  const stdChange = ta.stdev(priceChangeS, 50).toArray();
  const volPercent = ta.percentrank(new Series(bars, (b) => b.volume ?? NaN), 100).toArray();
  const phArr = ta.pivothigh(new Series(bars, (b) => b.high), pivotLen, pivotLen).toArray();
  const plArr = ta.pivotlow(new Series(bars, (b) => b.low), pivotLen, pivotLen).toArray();

  // Live drawings in the registry of the library (max_boxes_count / max_lines_count / max_labels_count), placed by
  // bar index
  resetDrawings({ box: MAX_OBJECTS, line: MAX_OBJECTS, label: MAX_OBJECTS });
  const boxes = new Live((b: Bx) => box.new(b.left, b.top, b.right, b.bottom), box.all, box.delete);
  const lines = new Live((l: Ln) => line.new(l.x1, l.y, l.x2, l.y), line.all, line.delete);
  const labels = new Live((l: Lb) => label.new(l.x, l.y, l.text), label.all, label.delete);

  // drawSession(): one state per call. time(timeframe.period, sessStr) reads the hours in the exchange time zone
  const timezone = timezoneOf(chart);
  // bar size for the clock-change rule of the session test (intraday bars)
  const chartTf = chartTimeframe(bars, chart);
  const barMs = chartTf !== '' && timeframe.info(chartTf).isintraday ? timeframe.in_seconds(chartTf) * 1000 : undefined;
  const session = (show: boolean, sessStr: string, col: string, name: string) => {
    let sBox: Bx | null = null;
    let sLabel: Lb | null = null;
    let sHigh = NaN;
    let sLow = NaN;
    let inSession1 = false;
    const tms = (i: number) => (bars[i].time < 1e11 ? bars[i].time * 1000 : bars[i].time);
    return (i: number) => {
      const inSession = pineTime.inSession(tms(i), sessStr, timezone, barMs);
      const isStart = inSession && !inSession1;
      inSession1 = inSession;
      if (!(show && inSession)) return;
      const bar = bars[i];
      if (isStart) {
        sHigh = bar.high;
        sLow = bar.low;
        sBox = boxes.hold(`box ${name}`, boxes.add({
          left: i, top: sHigh, right: i, bottom: sLow, border: col, bg: String(color.new(col, 92)), style: 'dotted',
        }));
        sLabel = labels.hold(`label ${name}`, labels.add({
          x: i, y: sHigh, text: name, color: '', textColor: col, style: 'none', size: 'small', align: 'center',
        }));
      } else {
        sHigh = math.max(sHigh, bar.high) as number;
        sLow = math.min(sLow, bar.low) as number;
        if (sBox) {
          sBox.top = sHigh;
          sBox.bottom = sLow;
          sBox.right = i;
        }
        if (sLabel && sBox) {
          sLabel.x = math.round((sBox.left + i) / 2);
          sLabel.y = sHigh;
        }
      }
    };
  };
  const sessions = [
    session(cfg.showLondonInput, cfg.londonSessInput, cfg.londonColInput, 'London'),
    session(cfg.showNYInput, cfg.nySessInput, cfg.nyColInput, 'New York'),
    session(cfg.showTokyoInput, cfg.tokyoSessInput, cfg.tokyoColInput, 'Tokyo'),
    session(cfg.showSydneyInput, cfg.sydneySessInput, cfg.sydneyColInput, 'Sydney'),
  ];
  const anySession = cfg.showLondonInput || cfg.showNYInput || cfg.showTokyoInput || cfg.showSydneyInput;

  let lastPh = NaN;
  let lastPl = NaN;
  let lastPhIdx = NaN;
  let lastPlIdx = NaN;
  const obArray: OrderBlock[] = [];
  let totalMitigated = 0;
  let totalObs = 0;

  for (let i = 0; i < n; i++) {
    setDrawingBar(i, i === n - 1);
    const bar = bars[i];
    const close1 = i > 0 ? bars[i - 1].close : NaN;
    const momentumZ = ((priceChange[i] ?? NaN) - (avgChange[i] ?? NaN)) / (stdChange[i] ?? NaN);
    const ph = phArr[i] ?? NaN;
    const pl = plArr[i] ?? NaN;
    if (!isNaN(ph)) {
      lastPh = ph;
      lastPhIdx = i - pivotLen;
    }
    if (!isNaN(pl)) {
      lastPl = pl;
      lastPlIdx = i - pivotLen;
    }

    // Session ranges
    if (cfg.showSessionsInput && anySession) for (const s of sessions) s(i);

    // Market structure breaks
    const isMSBBull = gt(bar.close, lastPh) && le(close1, lastPh) && gt(momentumZ, cfg.msbZScoreInput);
    const isMSBBear = lt(bar.close, lastPl) && ge(close1, lastPl) && lt(momentumZ, -cfg.msbZScoreInput);

    if (isMSBBull) {
      lines.add({ x1: lastPhIdx, x2: i, y: lastPh, color: BULL_COLOR, dashed: false });
      labels.add({
        x: math.round((lastPhIdx + i) / 2), y: lastPh, text: 'MSB', color: String(color.new(BULL_COLOR, 100)),
        textColor: BULL_COLOR, style: 'label_down', size: 'small', align: 'center',
      });
    }
    if (isMSBBear) {
      lines.add({ x1: lastPlIdx, x2: i, y: lastPl, color: BEAR_COLOR, dashed: false });
      labels.add({
        x: math.round((lastPlIdx + i) / 2), y: lastPl, text: 'MSB', color: String(color.new(BEAR_COLOR, 100)),
        textColor: BEAR_COLOR, style: 'label_up', size: 'small', align: 'center',
      });
    }

    // Order block
    if (isMSBBull || isMSBBear) {
      let obIdx = 0;
      for (let k = 1; k <= 10 && i - k >= 0; k++) {
        const b = bars[i - k];
        if ((isMSBBull && lt(b.close, b.open)) || (isMSBBear && gt(b.close, b.open))) {
          obIdx = k;
          break;
        }
      }
      const obTop = bars[i - obIdx].high;
      const obBottom = bars[i - obIdx].low;
      const obPOC = (obTop + obBottom) / 2;

      // Quality score (0-100)
      const score = math.min(100, Math.abs(momentumZ) * 20 + (volPercent[i] ?? NaN) * 0.5) as number;
      const isHPZ = gt(score, 80);
      const baseColor = isMSBBull ? BULL_COLOR : BEAR_COLOR;
      const hpzColor = isMSBBull ? HPZ_BULL : HPZ_BEAR;

      let overlapping = false;
      if (cfg.hideOverlapsInput) {
        for (const o of obArray) {
          if (!o.mitigated && ((le(obTop, o.top) && ge(obTop, o.bottom)) || (le(obBottom, o.top) && ge(obBottom, o.bottom)))) {
            overlapping = true;
            break;
          }
        }
      }

      if (!overlapping) {
        const c = isHPZ ? hpzColor : baseColor;
        const obBox = boxes.add({
          left: i - obIdx, top: obTop, right: i + 15, bottom: obBottom, border: String(color.new(c, isHPZ ? 40 : 60)),
          bg: String(color.new(c, isHPZ ? 80 : 85)), style: 'dashed',
        });
        const poc = lines.add({ x1: i - obIdx, x2: i + 15, y: obPOC, color: String(color.new(c, isHPZ ? 40 : 70)), dashed: true });
        const obLabel = labels.add({
          x: i + 18, y: obPOC, text: str.tostring(score, '#') + '%', color: String(color.new(baseColor, 100)),
          textColor: isHPZ ? hpzColor : baseColor, style: 'none', size: 'tiny', align: 'left',
        });
        obArray.push({ box: obBox, label: obLabel, poc, top: obTop, bottom: obBottom, isBull: isMSBBull, isHPZ, mitigated: false, mitigationBar: 0 });
      }

      if (isMSBBull) lastPh = NaN;
      else lastPl = NaN;
      totalObs += 1;
    }

    // Dynamic management. A deleted object ignores later changes.
    if (obArray.length > 0) {
      const drop = (ob: OrderBlock) => {
        boxes.remove(ob.box);
        labels.remove(ob.label);
        lines.remove(ob.poc);
      };
      const setEnd = (ob: OrderBlock, right: number, labelX: number) => {
        ob.box.right = right;
        ob.label.x = labelX;
        ob.poc.x2 = right;
      };
      let mitCount = 0;
      for (let k = obArray.length - 1; k >= 0; k--) {
        const ob = obArray[k];
        if (!ob.mitigated) {
          setEnd(ob, i + 15, i + 18);
          const isMitigated = ob.isBull ? lt(bar.low, ob.bottom) : gt(bar.high, ob.top);
          if (isMitigated) {
            ob.mitigated = true;
            ob.mitigationBar = i;
            totalMitigated += 1;
            if (present) {
              drop(ob);
            } else {
              ob.box.bg = String(color.new(NEUTRAL_COLOR, 90));
              ob.box.border = String(color.new(NEUTRAL_COLOR, 70));
              ob.label.textColor = String(color.new(NEUTRAL_COLOR, 50));
              ob.poc.color = String(color.new(NEUTRAL_COLOR, 80));
              // a broken block is not extended
              setEnd(ob, i, i);
            }
          }
        } else {
          mitCount += 1;
          const shouldExtend = cfg.extendBrokenInput && mitCount <= 2 && i - ob.mitigationBar <= 50;
          if (present) drop(ob);
          else if (shouldExtend) setEnd(ob, i + 15, i + 18);
          else setEnd(ob, ob.mitigationBar, ob.mitigationBar);
        }
      }
      if (obArray.length > obCount) drop(obArray.shift()!);
    }
  }
  setDrawingBar(null);

  // Analytics dashboard: the table always exists; its cells are written on the last bar
  const size = ({ Tiny: 'tiny', Small: 'small', Normal: 'normal', Large: 'large', Huge: 'huge' } as const)[cfg.dashboardSizeInput];
  const cells: TableCellData[] = [];
  const show = cfg.showStatsInput && n > 0;
  if (show) {
    const efficiency = totalObs > 0 ? (totalMitigated / totalObs) * 100 : 0;
    const hpzs = obArray.filter((o) => o.isHPZ && !o.mitigated).length;
    const cell = (column: number, row: number, text: string, textColor: string, textHAlign: 'left' | 'center' | 'right', height = 0) => {
      cells.push({ column, row, text, textColor, textSize: size, textHAlign, height });
    };
    const divider = (row: number) => cell(0, row, '━━━━━━━━━━━━━━', BORDERS, 'center', 0.5);
    cell(0, 0, 'Statistics', DATA, 'center');
    divider(1);
    cell(0, 2, 'Reliability', HEADERS, 'left');
    cell(1, 2, str.tostring(efficiency, '#.#') + '%', gt(efficiency, 50) ? BULL_COLOR : BEAR_COLOR, 'right');
    divider(3);
    cell(0, 4, 'HP-OB Count', HEADERS, 'left');
    cell(1, 4, str.tostring(hpzs), DATA, 'right');
  }
  const table: TableData = {
    position: cfg.dashboardPositionInput === 'Bottom Left' ? 'bottom_left'
      : cfg.dashboardPositionInput === 'Bottom Right' ? 'bottom_right' : 'top_right',
    columns: 2,
    rows: 5,
    cells,
    ...(show ? { merges: [0, 1, 3].map((row) => ({ startColumn: 0, startRow: row, endColumn: 1, endRow: row })) } : {}),
    bgColor: BACKGROUND,
    borderWidth: 0,
    frameColor: BORDERS,
    frameWidth: 1,
  };

  const interval = barInterval(bars);
  const T = (index: number) => barTime(bars, index, interval);
  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {},
    boxes: boxes.items.map((b) => ({
      time1: T(b.left), price1: b.top, time2: T(b.right), price2: b.bottom, bgColor: b.bg, borderColor: b.border,
      borderWidth: 1, borderStyle: b.style,
    })),
    lines: lines.items.map((l) => ({
      time1: T(l.x1), price1: l.y, time2: T(l.x2), price2: l.y, color: l.color, width: 1, ...(l.dashed ? { style: 'dashed' as const } : {}),
    })),
    labels: labels.items.map((l) => ({
      time: T(l.x), price: l.y, text: l.text, ...(l.color ? { color: l.color } : {}), textColor: l.textColor, style: l.style,
      size: l.size, textAlign: l.align,
    })),
    tables: [table],
  };
}

export const MarketStructureBreakObProbabilityToolkit = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
};
