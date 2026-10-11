/**
 * RSI Swing Indicator v2
 *
 * Draws swings on the price from the extremes of the RSI. A swing high starts when the RSI reaches the overbought
 * level after an oversold phase, a swing low when it reaches the oversold level after an overbought phase. While
 * the phase lasts, the swing point follows each new high (or new low) of the price. Each swing has a label above
 * or below its bar ("HH" / "LH" for a high, "HL" / "LL" for a low, compared with the swing of the same side
 * before) and a line to the swing before it.
 *
 * As in the original, at most 50 labels and 50 lines are kept (the oldest are removed).
 *
 * Reference: "RSI Swing Indicator" by MrDinasty (BalintDavid)
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © BalintDavid
 */

import { ta, getSourceSeries, type IndicatorResult, type InputConfig, type PlotConfig, type Bar, type SourceType } from 'oakscriptjs';
import type { LabelData, LineDrawingData } from '../types';

export interface RsiSwingIndicatorV2Inputs {
  rsiSource: SourceType;
  rsiLength: number;
  rsiOverbought: number;
  rsiOversold: number;
}

export const defaultInputs: RsiSwingIndicatorV2Inputs = {
  rsiSource: 'close',
  rsiLength: 7,
  rsiOverbought: 70,
  rsiOversold: 30,
};

export const inputConfig: InputConfig[] = [
  { id: 'rsiSource', type: 'source', title: 'RSI Source', defval: 'close' },
  { id: 'rsiLength', type: 'int', title: 'RSI Length', defval: 7 },
  { id: 'rsiOverbought', type: 'int', title: 'RSI Overbought', defval: 70, min: 51, max: 100 },
  { id: 'rsiOversold', type: 'int', title: 'RSI Oversold', defval: 30, min: 1, max: 49 },
];

export const plotConfig: PlotConfig[] = [];

export const metadata = {
  title: 'RSI Swing Indicator',
  shortTitle: 'RSI Swing Indicator',
  overlay: true,
};

/** Default max_labels_count / max_lines_count */
const MAX_OBJECTS = 50;

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const lt = (a: number, b: number) => b - a > EPS;
const ge = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(b - a > EPS);
const le = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(a - b > EPS);

const RED = '#FF5252';
const GREEN = '#4CAF50';
const BLUE = '#2196F3';
const TEXT = '#363A45';

interface Lb {
  x: number;
  y: number;
  text: string;
  above: boolean;
}
interface Ln {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export function calculate(
  bars: Bar[],
  inputs: Partial<RsiSwingIndicatorV2Inputs> = {},
): Omit<IndicatorResult, 'labels' | 'lines'> & { labels: LabelData[]; lines: LineDrawingData[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const rsi = ta.rsi(getSourceSeries(bars, cfg.rsiSource), cfg.rsiLength).toArray().map((v) => v ?? NaN);

  // Drawings in creation order: when a creation brings the count above max + 5, the oldest are removed until max
  // remain. The objects held by the script variables are always the two newest of each kind.
  const labels: Lb[] = [];
  const lines: Ln[] = [];
  const limit = (list: unknown[]) => {
    if (list.length > MAX_OBJECTS + 5) list.splice(0, list.length - MAX_OBJECTS);
  };

  let laststate = 0;
  let hh = NaN;
  let ll = NaN;
  let labelll: Lb | null = null;
  let labelhh: Lb | null = null;
  let lineUp: Ln | null = null;
  let lineDown: Ln | null = null;
  let lastHhPrice = 0;
  let lastLlPrice = 0;

  for (let i = 0; i < n; i++) {
    const { high, low } = bars[i];
    if (i === 0) {
      hh = low;
      ll = high;
    }
    const isOverbought = ge(rsi[i], cfg.rsiOverbought);
    const isOversold = le(rsi[i], cfg.rsiOversold);

    const obLabelText = () => (lt(lastHhPrice, high) ? 'HH' : 'LH');
    const osLabelText = () => (lt(lastLlPrice, low) ? 'HL' : 'LL');
    const moveOversold = () => {
      if (labelll) {
        labelll.x = i;
        labelll.y = low;
        labelll.text = osLabelText();
      }
      if (lineDown) {
        lineDown.x1 = i;
        lineDown.y1 = low;
      }
    };
    const moveOverbought = () => {
      if (labelhh) {
        labelhh.x = i;
        labelhh.y = high;
        labelhh.text = obLabelText();
      }
      if (lineUp) {
        lineUp.x1 = i;
        lineUp.y1 = high;
      }
    };

    // From oversold straight to overbought: a new swing high
    if (laststate === 2 && isOverbought) {
      hh = high;
      labelhh = { x: i, y: NaN, text: obLabelText(), above: true };
      labels.push(labelhh);
      limit(labels);
      lastLlPrice = labelll ? labelll.y : NaN;
      lineUp = { x1: i, y1: high, x2: labelll ? labelll.x : NaN, y2: labelll ? labelll.y : NaN };
      lines.push(lineUp);
      limit(lines);
    }
    // From overbought straight to oversold: a new swing low
    if (laststate === 1 && isOversold) {
      ll = low;
      labelll = { x: i, y: NaN, text: osLabelText(), above: false };
      labels.push(labelll);
      limit(labels);
      lastHhPrice = labelhh ? labelhh.y : NaN;
      lineDown = { x1: i, y1: high, x2: labelhh ? labelhh.x : NaN, y2: labelhh ? labelhh.y : NaN };
      lines.push(lineDown);
      limit(lines);
    }

    if (isOverbought) {
      if (ge(high, hh)) {
        hh = high;
        moveOverbought();
      }
      laststate = 1;
    }
    if (isOversold) {
      if (le(low, ll)) {
        ll = low;
        moveOversold();
      }
      laststate = 2;
    }
    // The four checks that follow in the original repeat the same move: one check per state is enough
    if (laststate === 1 && le(hh, high)) {
      hh = high;
      moveOverbought();
    }
    if (laststate === 2 && ge(ll, low)) {
      ll = low;
      moveOversold();
    }
  }

  const T = (index: number) => bars[index].time;
  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {},
    labels: labels.map((l) => ({
      time: T(l.x), price: l.y, text: l.text, color: l.above ? RED : GREEN, textColor: TEXT,
      style: l.above ? 'label_down' as const : 'label_up' as const, size: 'tiny' as const,
      yloc: l.above ? 'abovebar' as const : 'belowbar' as const,
    })),
    // a line with an na coordinate is not drawn
    lines: lines.filter((l) => !isNaN(l.x2) && !isNaN(l.y2)).map((l) => ({
      time1: T(l.x1), price1: l.y1, time2: T(l.x2), price2: l.y2, color: BLUE, width: 1,
    })),
  };
}

export const RsiSwingIndicatorV2 = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
};
