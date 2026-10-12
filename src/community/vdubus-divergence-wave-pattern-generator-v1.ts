/**
 * Vdubus Divergence Wave Pattern Generator V1 ("Vdubus Pattern Gen V2 [Restored & Refined]")
 *
 * Two zigzag engines (fast and slow pivot scales) keep the last 10 price pivots (pivot highs and pivot lows of
 * `depth` bars on each side, in the order found). On each new pivot with at least 5 pivots kept, the last five are
 * the points X, A, B, C, D of a pattern, checked against the momentum waves: the pivot highs / lows of the MACD
 * histogram (3 bars each side, last 10 kept).
 * - Standard reversal: momentum highs falling over the last 3 (bearish) or lows rising (bullish), drawn when the
 *   shape is a head and shoulders (B beyond X and D) or a selected harmonic name (from the XB / XA ratio)
 * - Climax reversal: the middle momentum wave is the extreme of the last 3
 * - Rounded top / bottom: 4 momentum waves in a row falling (rising): a label only
 * - Predator: no standard reversal, D beyond X and the last momentum wave above (below) the one before: thicker lines
 * A pattern draws its four legs (lines), two light fills (X-A / X-B and B-C / B-D), a label at D and an optional
 * target box from D to C over 20 bars. An optional table shows which side has the larger last momentum wave.
 * At most 500 lines, 500 labels and 500 boxes are kept.
 *
 * Reference: "Vdubus Divergence Wave Pattern Generator V1" by vdubus
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © Bespoke_Analysis_Engine
 */

import {
  ta, Series, color, line, label, box, linefill, resetDrawings, setDrawingBar,
  type IndicatorResult, type InputConfig, type PlotConfig, type Bar,
} from 'oakscriptjs';
import type { BoxData, LabelData, LineDrawingData, LinefillData, TableData, TablePosition } from '../types';
import { barInterval, barTime } from '../bar-time';

export interface VdubusDivergenceWavePatternGeneratorV1Inputs {
  fastDepth: number;
  showFastLines: boolean;
  showFastFills: boolean;
  showFastLbl: boolean;
  slowDepth: number;
  showSlowLines: boolean;
  showSlowFills: boolean;
  showSlowLbl: boolean;
  showTgtBox: boolean;
  fastLen: number;
  slowLen: number;
  sigLen: number;
  lookback: number;
  colBear: string;
  colBull: string;
  colClimax: string;
  colRound: string;
  colPred: string;
  showStandard: boolean;
  showClimax: boolean;
  showRounded: boolean;
  showPred: boolean;
  showGartley: boolean;
  showBat: boolean;
  showButterfly: boolean;
  showCrab: boolean;
  showDeep: boolean;
  showHS: boolean;
  errTol: number;
  showDash: boolean;
  dashPos: 'Top Right' | 'Bottom Right' | 'Top Left' | 'Bottom Left';
  textSize: 'Small' | 'Normal' | 'Large';
}

export const defaultInputs: VdubusDivergenceWavePatternGeneratorV1Inputs = {
  fastDepth: 9,
  showFastLines: false,
  showFastFills: true,
  showFastLbl: false,
  slowDepth: 24,
  showSlowLines: true,
  showSlowFills: true,
  showSlowLbl: true,
  showTgtBox: false,
  fastLen: 21,
  slowLen: 34,
  sigLen: 5,
  lookback: 3,
  colBear: '#FF5252',
  colBull: '#4CAF50',
  colClimax: '#FF9800',
  colRound: '#311B92',
  colPred: '#9C27B0',
  showStandard: true,
  showClimax: true,
  showRounded: true,
  showPred: true,
  showGartley: false,
  showBat: false,
  showButterfly: false,
  showCrab: false,
  showDeep: false,
  showHS: true,
  errTol: 0.15,
  showDash: false,
  dashPos: 'Bottom Right',
  textSize: 'Small',
};

const G_FAST = 'Fast Structure (Entry Geometry)';
const G_SLOW = 'Slow Structure (Macro Context)';
const G_TGT = 'Target Projections';
const G_MACD = 'Momentum Physics (Smoothed Defaults)';
const G_STYLE = 'Style & Colors';
const G_PATS = 'Pattern Filters';
const G_HARM = 'Harmonic Shape Selectors';
const G_DASH = 'Confluence Dashboard';

export const inputConfig: InputConfig[] = [
  { id: 'fastDepth', type: 'int', title: 'Fast Pattern Scale (ZigZag)', defval: 9, group: G_FAST },
  { id: 'showFastLines', type: 'bool', title: 'Show Fast Lines', defval: false, group: G_FAST },
  { id: 'showFastFills', type: 'bool', title: 'Show Fast Fills', defval: true, group: G_FAST },
  { id: 'showFastLbl', type: 'bool', title: 'Show Fast Labels', defval: false, group: G_FAST },
  { id: 'slowDepth', type: 'int', title: 'Slow Pattern Scale (ZigZag)', defval: 24, group: G_SLOW },
  { id: 'showSlowLines', type: 'bool', title: 'Show Slow Lines', defval: true, group: G_SLOW },
  { id: 'showSlowFills', type: 'bool', title: 'Show Slow Fills', defval: true, group: G_SLOW },
  { id: 'showSlowLbl', type: 'bool', title: 'Show Slow Labels', defval: true, group: G_SLOW },
  {
    id: 'showTgtBox', type: 'bool', title: 'Show Target Box (Prev H/L)', defval: false, group: G_TGT,
    tooltip: 'Draws target box to the previous structural High/Low (Point C).',
  },
  { id: 'fastLen', type: 'int', title: 'Fast Length', defval: 21, group: G_MACD },
  { id: 'slowLen', type: 'int', title: 'Slow Length', defval: 34, group: G_MACD },
  { id: 'sigLen', type: 'int', title: 'Signal Length', defval: 5, group: G_MACD },
  { id: 'lookback', type: 'int', title: 'Momentum Pivot Lookback', defval: 3, group: G_MACD },
  { id: 'colBear', type: 'color', title: 'Bearish Standard', defval: '#FF5252', group: G_STYLE },
  { id: 'colBull', type: 'color', title: 'Bullish Standard', defval: '#4CAF50', group: G_STYLE },
  { id: 'colClimax', type: 'color', title: 'Climax (Trap)', defval: '#FF9800', group: G_STYLE },
  { id: 'colRound', type: 'color', title: 'Rounded Top/Bottom', defval: '#311B92', group: G_STYLE },
  { id: 'colPred', type: 'color', title: 'Predator (Hidden)', defval: '#9C27B0', group: G_STYLE },
  { id: 'showStandard', type: 'bool', title: 'Show Standard Reversals', defval: true, group: G_PATS },
  { id: 'showClimax', type: 'bool', title: 'Show Climax Reversals', defval: true, group: G_PATS },
  { id: 'showRounded', type: 'bool', title: 'Show Rounded Patterns', defval: true, group: G_PATS },
  { id: 'showPred', type: 'bool', title: 'Show Predator (Hidden)', defval: true, group: G_PATS },
  { id: 'showGartley', type: 'bool', title: 'Gartley', defval: false, group: G_HARM },
  { id: 'showBat', type: 'bool', title: 'Bat', defval: false, group: G_HARM },
  { id: 'showButterfly', type: 'bool', title: 'Butterfly', defval: false, group: G_HARM },
  { id: 'showCrab', type: 'bool', title: 'Crab', defval: false, group: G_HARM },
  { id: 'showDeep', type: 'bool', title: 'Deep/Shark', defval: false, group: G_HARM },
  { id: 'showHS', type: 'bool', title: 'Head & Shoulders', defval: true, group: G_HARM },
  { id: 'errTol', type: 'float', title: 'Harmonic Tolerance', defval: 0.15, min: 0.01, max: 0.5, group: G_HARM },
  { id: 'showDash', type: 'bool', title: 'Show Dashboard', defval: false, group: G_DASH },
  { id: 'dashPos', type: 'string', title: 'Position', defval: 'Bottom Right', options: ['Top Right', 'Bottom Right', 'Top Left', 'Bottom Left'], group: G_DASH },
  { id: 'textSize', type: 'string', title: 'Size', defval: 'Small', options: ['Small', 'Normal', 'Large'], group: G_DASH },
];

export const plotConfig: PlotConfig[] = [];

export const metadata = {
  title: 'Vdubus Pattern Gen V2 [Restored & Refined]',
  shortTitle: 'Vdubus Gen V2',
  overlay: true,
};

/** indicator(max_lines_count = 500, max_labels_count = 500, max_boxes_count = 500) */
const MAX_OBJECTS = 500;
/** color.white, color.black, color.green, color.red of this version of the language */
const WHITE = '#FFFFFF';
const BLACK = '#363A45';
const GREEN = '#4CAF50';
const RED = '#FF5252';

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const ge = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(b - a > EPS);
const le = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(a - b > EPS);

export function calculate(
  bars: Bar[],
  inputs: Partial<VdubusDivergenceWavePatternGeneratorV1Inputs> = {},
): Omit<IndicatorResult, 'lines' | 'labels' | 'boxes' | 'linefills' | 'tables'> & {
    lines: LineDrawingData[]; labels: LabelData[]; boxes: BoxData[]; linefills: LinefillData[]; tables: TableData[];
  } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const tol = cfg.errTol;

  // Momentum: pivots of the MACD histogram, newest first, at most 10
  const [, , histS] = ta.macd(new Series(bars, (b) => b.close), cfg.fastLen, cfg.slowLen, cfg.sigLen);
  const hist = A(histS);
  const phMom = A(ta.pivothigh(Series.fromArray(bars, hist), cfg.lookback, cfg.lookback));
  const plMom = A(ta.pivotlow(Series.fromArray(bars, hist), cfg.lookback, cfg.lookback));
  const waveHighs: number[] = [];
  const waveLows: number[] = [];

  const checkStandardBearish = () => waveHighs.length >= 3 && lt(waveHighs[1], waveHighs[2]) && le(waveHighs[0], waveHighs[1]);
  const checkStandardBullish = () => waveLows.length >= 3 && gt(waveLows[1], waveLows[2]) && ge(waveLows[0], waveLows[1]);
  const checkClimaxBearish = () => waveHighs.length >= 3 && ge(waveHighs[1], waveHighs[2]) && lt(waveHighs[0], waveHighs[1]);
  const checkClimaxBullish = () => waveLows.length >= 3 && le(waveLows[1], waveLows[2]) && gt(waveLows[0], waveLows[1]);
  const checkRoundedBearish = () => waveHighs.length >= 4
    && gt(waveHighs[3], waveHighs[2]) && gt(waveHighs[2], waveHighs[1]) && gt(waveHighs[1], waveHighs[0]);
  const checkRoundedBullish = () => waveLows.length >= 4
    && lt(waveLows[3], waveLows[2]) && lt(waveLows[2], waveLows[1]) && lt(waveLows[1], waveLows[0]);
  const checkBearishPredator = () => waveHighs.length >= 2 && gt(waveHighs[0], waveHighs[1]);
  const checkBullishPredator = () => waveLows.length >= 2 && lt(waveLows[0], waveLows[1]);

  // f_getHarmonicName(xB_ratio, xD_ratio, isBullish)
  const harmonicName = (xb: number, xd: number): string => {
    if (lt(Math.abs(xb - 0.618), tol) && lt(Math.abs(xd - 0.786), tol)) return 'Gartley';
    if (ge(xb, 0.382 - tol) && le(xb, 0.5 + tol) && lt(Math.abs(xd - 0.886), tol)) return 'Bat';
    if (lt(Math.abs(xb - 0.786), tol) && ge(xd, 1.27 - tol) && le(xd, 1.618 + tol)) return 'Butterfly';
    if (ge(xb, 0.382 - tol) && le(xb, 0.618 + tol) && lt(Math.abs(xd - 1.618), tol)) return 'Crab';
    if (gt(xd, 1.0)) return 'Deep Pattern';
    return 'Retracement';
  };
  const selected = (name: string) => (name === 'Gartley' && cfg.showGartley) || (name === 'Bat' && cfg.showBat)
    || (name === 'Butterfly' && cfg.showButterfly) || (name === 'Crab' && cfg.showCrab)
    || (name === 'Deep Pattern' && cfg.showDeep) || name === 'Retracement';

  resetDrawings({ line: MAX_OBJECTS, label: MAX_OBJECTS, box: MAX_OBJECTS });

  // f_drawStruct(indices, values, col, patName, isPredator, isBullish, doLines, doFills, doLbl)
  const drawStruct = (xs: number[], ys: number[], col: string, patName: string, isPredator: boolean, isBullish: boolean,
    doLines: boolean, doFills: boolean, doLbl: boolean) => {
    const xD = xs[0];
    const yD = ys[0];
    if (doLines || doFills) {
      const [xC, xB, xA, xX] = [xs[1], xs[2], xs[3], xs[4]];
      const [yC, yB, yA, yX] = [ys[1], ys[2], ys[3], ys[4]];
      const w = isPredator ? 2 : 1;
      if (doLines) {
        line.new(xX, yX, xA, yA, 'bar_index', 'none', col, 'solid', w);
        line.new(xA, yA, xB, yB, 'bar_index', 'none', col, 'solid', w);
        line.new(xB, yB, xC, yC, 'bar_index', 'none', col, 'solid', w);
        line.new(xC, yC, xD, yD, 'bar_index', 'none', col, 'solid', w);
      }
      if (doFills) {
        const clear = String(color.new(col, 100));
        const lXa = line.new(xX, yX, xA, yA, 'bar_index', 'none', clear, 'solid', 0);
        const lXb = line.new(xX, yX, xB, yB, 'bar_index', 'none', clear, 'solid', 0);
        const lBc = line.new(xB, yB, xC, yC, 'bar_index', 'none', clear, 'solid', 0);
        const lBd = line.new(xB, yB, xD, yD, 'bar_index', 'none', clear, 'solid', 0);
        linefill.new(lXa, lXb, String(color.new(col, 92)));
        linefill.new(lBc, lBd, String(color.new(col, 92)));
      }
    }
    if (doLbl) {
      label.new(xD, yD, patName, 'bar_index', 'price', col, isBullish ? 'label_up' : 'label_down', WHITE, 'small');
    }
    if (cfg.showTgtBox) {
      const yC = ys[1];
      const top = isBullish ? yC : yD;
      const bottom = isBullish ? yD : yC;
      box.new(xD, top, xD + 20, bottom, String(color.new(col, 80)), undefined, undefined, undefined, undefined,
        String(color.new(col, 95)));
    }
  };

  // f_runEngine(depth, doLines, doFills, doLbl): one zigzag per call site
  const engine = (depth: number, doLines: boolean, doFills: boolean, doLbl: boolean) => {
    const zzP: number[] = [];
    const zzL: number[] = [];
    const ph = A(ta.pivothigh(new Series(bars, (b) => b.high), depth, depth));
    const pl = A(ta.pivotlow(new Series(bars, (b) => b.low), depth, depth));
    const push = (value: number, i: number) => {
      zzP.unshift(value);
      zzL.unshift(i - depth);
      if (zzP.length > 10) {
        zzP.pop();
        zzL.pop();
      }
    };
    const ratio = () => {
      const xaLen = Math.abs(zzP[3] - zzP[4]);
      const abLen = Math.abs(zzP[2] - zzP[3]);
      return gt(xaLen, 0) ? abLen / xaLen : 0.0;
    };
    return (i: number) => {
      if (!isNaN(ph[i])) {
        push(ph[i], i);
        if (zzP.length >= 5) {
          const yD = zzP[0];
          const yX = zzP[4];
          const yB = zzP[2];
          const rawName = harmonicName(ratio(), 1.27);
          const isHS = cfg.showHS && gt(yB, yX) && gt(yB, yD);
          const shouldDraw = isHS || selected(rawName);
          if (cfg.showStandard && checkStandardBearish() && shouldDraw) {
            drawStruct(zzL, zzP, cfg.colBear, isHS ? 'Bearish H&S' : 'Bearish ' + rawName, false, false, doLines, doFills, doLbl);
          }
          if (cfg.showClimax && checkClimaxBearish()) {
            drawStruct(zzL, zzP, cfg.colClimax, 'CLIMAX REVERSAL', false, false, doLines, doFills, doLbl);
          }
          if (cfg.showRounded && checkRoundedBearish() && doLbl) {
            label.new(i - depth, yD, 'ROUNDED TOP', 'bar_index', 'price', cfg.colRound, 'label_down', BLACK, 'small');
          }
          if (cfg.showPred && !checkStandardBearish() && lt(yD, yX) && checkBearishPredator()) {
            drawStruct(zzL, zzP, cfg.colPred, '🦖 PREDATOR', true, false, doLines, doFills, doLbl);
          }
        }
      }
      if (!isNaN(pl[i])) {
        push(pl[i], i);
        if (zzP.length >= 5) {
          const yD = zzP[0];
          const yX = zzP[4];
          const yB = zzP[2];
          const rawName = harmonicName(ratio(), 1.27);
          const isInvHS = cfg.showHS && lt(yB, yX) && lt(yB, yD);
          const shouldDraw = isInvHS || selected(rawName);
          if (cfg.showStandard && checkStandardBullish() && shouldDraw) {
            drawStruct(zzL, zzP, cfg.colBull, isInvHS ? 'Bullish Inv H&S' : 'Bullish ' + rawName, false, true, doLines, doFills, doLbl);
          }
          if (cfg.showClimax && checkClimaxBullish()) {
            drawStruct(zzL, zzP, cfg.colClimax, 'CLIMAX REVERSAL', false, true, doLines, doFills, doLbl);
          }
          if (cfg.showRounded && checkRoundedBullish() && doLbl) {
            label.new(i - depth, yD, 'ROUNDED BOTTOM', 'bar_index', 'price', cfg.colRound, 'label_up', BLACK, 'small');
          }
          if (cfg.showPred && !checkStandardBullish() && gt(yD, yX) && checkBullishPredator()) {
            drawStruct(zzL, zzP, cfg.colPred, '🦖 PREDATOR', true, true, doLines, doFills, doLbl);
          }
        }
      }
    };
  };

  const fast = engine(cfg.fastDepth, cfg.showFastLines, cfg.showFastFills, cfg.showFastLbl);
  const slow = engine(cfg.slowDepth, cfg.showSlowLines, cfg.showSlowFills, cfg.showSlowLbl);
  for (let i = 0; i < n; i++) {
    setDrawingBar(i, i === n - 1);
    if (!isNaN(phMom[i])) {
      waveHighs.unshift(phMom[i]);
      if (waveHighs.length > 10) waveHighs.pop();
    }
    if (!isNaN(plMom[i])) {
      waveLows.unshift(plMom[i]);
      if (waveLows.length > 10) waveLows.pop();
    }
    fast(i);
    slow(i);
  }
  setDrawingBar(null);

  // Dashboard: `var table d` made on the first bar, its cells set on the last bar
  const tables: TableData[] = [];
  if (cfg.showDash && n > 0) {
    const pos: TablePosition = cfg.dashPos === 'Top Right' ? 'top_right' : cfg.dashPos === 'Bottom Right' ? 'bottom_right'
      : cfg.dashPos === 'Top Left' ? 'top_left' : 'bottom_left';
    const sz = cfg.textSize === 'Small' ? 'small' : cfg.textSize === 'Large' ? 'large' : 'normal';
    const lastBull = waveLows.length > 0 ? waveLows[0] : 0.0;
    const lastBear = waveHighs.length > 0 ? waveHighs[0] : 0.0;
    const bulls = gt(Math.abs(lastBull), Math.abs(lastBear));
    tables.push({
      position: pos, columns: 2, rows: 2, bgColor: String(color.new(BLACK, 50)), borderColor: WHITE, borderWidth: 1,
      cells: [
        { column: 0, row: 0, text: 'Opposing Force', textColor: WHITE, textSize: sz },
        { column: 1, row: 0, text: bulls ? 'Bulls Strong' : 'Bears Strong', textColor: WHITE, bgColor: bulls ? GREEN : RED, textSize: sz },
      ],
    });
  }

  const interval = barInterval(bars);
  const T = (index: number) => barTime(bars, index, interval);
  const lineData = (ln: { x1: number; y1: number; x2: number; y2: number; color?: unknown; width?: number }): LineDrawingData => ({
    time1: T(ln.x1), price1: ln.y1, time2: T(ln.x2), price2: ln.y2, color: String(ln.color), width: ln.width ?? 1,
  });
  const alive = new Set(line.all());
  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {},
    lines: line.all().map(lineData),
    // a linefill whose line was deleted by the line limit is not drawn
    linefills: linefill.all().filter((f) => alive.has(f.line1) && alive.has(f.line2))
      .map((f) => ({ line1: lineData(f.line1), line2: lineData(f.line2), color: String(f.color) })),
    labels: label.all().map((lb) => ({
      time: T(lb.x), price: lb.y, text: lb.text ?? '', color: String(lb.color), textColor: String(lb.textcolor),
      style: lb.style as 'label_up' | 'label_down', size: 'small' as const,
    })),
    boxes: box.all().map((b) => ({
      time1: T(b.left), price1: b.top, time2: T(b.right), price2: b.bottom,
      borderColor: String(b.border_color), bgColor: String(b.bgcolor),
    })),
    tables,
  };
}

export const VdubusDivergenceWavePatternGeneratorV1 = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
};
