/**
 * Breaker Blocks with Signals [LuxAlgo]
 *
 * Swings are pivots with "Length" bars on the left and one bar on the right, joined in a zigzag (points A to E from
 * old to new). A bullish market structure shift is a close above the latest swing high D. When the low E before it
 * is below the low C, the first rising candle found from D back to C becomes the bullish breaker block (+BB): a box
 * over that candle (or its body, or two candles), extended while the block lives, with its dashed centre line. The
 * bearish block (-BB) is the mirrored case. Only one block lives at a time, and blocks are only searched on the last
 * 2,001 bars.
 *
 * While the block lives: a close through its far side mitigates it; a candle that opens between the centre line and
 * the near side and closes beyond that side gives a signal (arrow); a close between the centre line and the far side
 * cancels the block (cross), or with "Stop at first break of center line" off it can be reset by a close beyond the
 * near side ("R"). With "Enable TP" three target lines are drawn at the given reward ratios of the block height, and
 * a dot marks each target reached after a signal. The two swings C and E are drawn as lines, and the first two
 * earlier swings beyond the current bar as premium / discount areas; "Highlight Swing Breaks" marks their breaks.
 * "Only when E is in Premium/Discount Array" keeps the blocks whose swing E is in the right half of the range from
 * A, and can show that range. At most 500 labels are kept.
 *
 * Reference: "Breaker Blocks with Signals [LuxAlgo]" by LuxAlgo
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © LuxAlgo
 */

import { ta, color, Series, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { BoxData, LabelData, LineDrawingData } from '../types';
import { barInterval, barTime } from '../bar-time';

export interface BreakerBlocksWithSignalsInputs {
  /** Bars on the left of a swing */
  len: number;
  breakerCandleOnlyBody: boolean;
  breakerCandle2Last: boolean;
  tillFirstBreak: boolean;
  onlyWhenInPDarray: boolean;
  showPDarray: boolean;
  showBreaks: boolean;
  showSPD: boolean;
  pdTxtCss: string;
  pdSCss: string;
  iTP: boolean;
  tpCss: string;
  r1a: number;
  r2a: number;
  r1b: number;
  r2b: number;
  r1c: number;
  r2c: number;
  cBBplusA: string;
  cBBplusB: string;
  cSwingBl: string;
  cBBminA: string;
  cBBminB: string;
  cSwingBr: string;
}

export const defaultInputs: BreakerBlocksWithSignalsInputs = {
  len: 5,
  breakerCandleOnlyBody: false,
  breakerCandle2Last: false,
  tillFirstBreak: true,
  onlyWhenInPDarray: false,
  showPDarray: false,
  showBreaks: false,
  showSPD: true,
  pdTxtCss: '#B2B5BE',
  pdSCss: '#B2B5BE',
  iTP: false,
  tpCss: '#2157F3',
  r1a: 1,
  r2a: 2,
  r1b: 1,
  r2b: 3,
  r1c: 1,
  r2c: 4,
  cBBplusA: 'rgba(12, 181, 26, 0.07)',
  cBBplusB: 'rgba(12, 181, 26, 0.15)',
  cSwingBl: 'rgba(255, 82, 82, 0.15)',
  cBBminA: 'rgba(255, 17, 0, 0.05)',
  cBBminB: 'rgba(255, 17, 0, 0.15)',
  cSwingBr: 'rgba(0, 137, 123, 0.15)',
};

const G_BULL = 'Colours    +BB                   Last Swings';
const G_BEAR = 'Colours    -BB                   Last Swings';

export const inputConfig: InputConfig[] = [
  { id: 'len', type: 'int', title: '      Length', defval: 5, min: 1, max: 10, inline: 'MS', group: 'Market Structure' },
  { id: 'breakerCandleOnlyBody', type: 'bool', title: 'Use only candle body', defval: false, group: 'Breaker Block' },
  { id: 'breakerCandle2Last', type: 'bool', title: 'Use 2 candles instead of 1', defval: false, group: 'Breaker Block' },
  { id: 'tillFirstBreak', type: 'bool', title: 'Stop at first break of center line', defval: true, group: 'Breaker Block' },
  { id: 'onlyWhenInPDarray', type: 'bool', title: 'Only when E is in Premium/Discount Array', defval: false, group: 'PD array' },
  { id: 'showPDarray', type: 'bool', title: 'show Premium/Discount Zone', defval: false, group: 'PD array' },
  { id: 'showBreaks', type: 'bool', title: 'Highlight Swing Breaks', defval: false, group: 'PD array' },
  { id: 'showSPD', type: 'bool', title: 'Show Swings/PD Arrays', defval: true, group: 'PD array' },
  { id: 'pdTxtCss', type: 'color', title: 'Text Color', defval: '#B2B5BE', group: 'PD array' },
  { id: 'pdSCss', type: 'color', title: 'Swing Line Color', defval: '#B2B5BE', group: 'PD array' },
  { id: 'iTP', type: 'bool', title: 'Enable TP', defval: false, inline: 'RR', group: 'TP' },
  { id: 'tpCss', type: 'color', title: '', defval: '#2157F3', inline: 'RR', group: 'TP' },
  { id: 'r1a', type: 'float', title: 'R:R 1', defval: 1, min: 1, max: 1, inline: 'RR1', group: 'TP' },
  { id: 'r2a', type: 'float', title: ':', defval: 2, min: 0.2, step: 0.1, inline: 'RR1', group: 'TP' },
  { id: 'r1b', type: 'float', title: 'R:R 2', defval: 1, min: 1, max: 1, inline: 'RR2', group: 'TP' },
  { id: 'r2b', type: 'float', title: ':', defval: 3, min: 0.2, step: 0.1, inline: 'RR2', group: 'TP' },
  { id: 'r1c', type: 'float', title: 'R:R 3', defval: 1, min: 1, max: 1, inline: 'RR3', group: 'TP' },
  { id: 'r2c', type: 'float', title: ':', defval: 4, min: 0.2, step: 0.1, inline: 'RR3', group: 'TP' },
  { id: 'cBBplusA', type: 'color', title: '      ', defval: 'rgba(12, 181, 26, 0.07)', inline: 'bl', group: G_BULL },
  { id: 'cBBplusB', type: 'color', title: '', defval: 'rgba(12, 181, 26, 0.15)', inline: 'bl', group: G_BULL },
  { id: 'cSwingBl', type: 'color', title: '        ', defval: 'rgba(255, 82, 82, 0.15)', inline: 'bl', group: G_BULL },
  { id: 'cBBminA', type: 'color', title: '      ', defval: 'rgba(255, 17, 0, 0.05)', inline: 'br', group: G_BEAR },
  { id: 'cBBminB', type: 'color', title: '', defval: 'rgba(255, 17, 0, 0.15)', inline: 'br', group: G_BEAR },
  { id: 'cSwingBr', type: 'color', title: '        ', defval: 'rgba(0, 137, 123, 0.15)', inline: 'br', group: G_BEAR },
];

export const plotConfig: PlotConfig[] = [];

export const metadata = {
  title: 'Breaker Blocks with Signals [LuxAlgo]',
  shortTitle: 'Breaker Blocks with Signals [LuxAlgo]',
  overlay: true,
};

/** indicator(max_labels_count = 500) */
const MAX_LABELS = 500;
/** Size of the zigzag arrays */
const ZZ_SIZE = 50;
/** Blocks are searched while last_bar_index - bar_index <= 2000 */
const LOOKBACK = 2000;

const ARROW_UP = '▲';
const ARROW_DOWN = '▼';
const DOT = '●';
const CROSS = '❌';

const SILVER = '#B2B5BE';
const YELLOW = '#FFEB3B';
const LIME = '#00E676';
const ORANGE = '#FF9800';
const BLUE = '#2962FF';
const RED = '#FF5252';
const TP_HIT = '#FF00DD';
const BREAK = '#C00000';

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;

type LabStyle = 'label_center' | 'label_up' | 'label_down' | 'label_lower_left' | 'label_upper_left';
type LabSize = 'small' | 'normal' | 'large';

interface Bx {
  left: number;
  top: number;
  right: number;
  bottom: number;
  bg: string;
  text?: string;
  textColor?: string;
  textVAlign?: 'top' | 'center' | 'bottom';
  /** small text, aligned right, monospace */
  styled?: boolean;
  deleted: boolean;
}
interface Ln {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  color: string;
  dashed: boolean;
}
interface Lb {
  x: number;
  y: number;
  text: string;
  textColor: string;
  style: LabStyle;
  size: LabSize;
  deleted: boolean;
}

export function calculate(
  bars: Bar[],
  inputs: Partial<BreakerBlocksWithSignalsInputs> = {},
): Omit<IndicatorResult, 'boxes' | 'labels' | 'lines'> & { boxes: BoxData[]; labels: LabelData[]; lines: LineDrawingData[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const last = n - 1;
  const len = Math.trunc(cfg.len);
  const { breakerCandleOnlyBody: onlyBody, breakerCandle2Last: twoLast, tillFirstBreak, onlyWhenInPDarray, showPDarray, showBreaks, showSPD } = cfg;
  const { pdTxtCss, pdSCss, tpCss } = cfg;
  /** method notransp() */
  const notransp = (css: string) => String(color.rgb(color.r(css), color.g(css), color.b(css)));

  const phArr = ta.pivothigh(new Series(bars, (b) => b.high), len, 1).toArray();
  const plArr = ta.pivotlow(new Series(bars, (b) => b.low), len, 1).toArray();

  const H = (i: number) => (i >= 0 ? bars[i].high : NaN);
  const L = (i: number) => (i >= 0 ? bars[i].low : NaN);
  const O = (i: number) => (i >= 0 ? bars[i].open : NaN);
  const C = (i: number) => (i >= 0 ? bars[i].close : NaN);
  const MX = (i: number) => Math.max(C(i), O(i));
  const MN = (i: number) => Math.min(C(i), O(i));

  // Labels in creation order: when a creation brings the count above max + 5, the oldest are deleted until max
  // remain. A deleted label ignores later changes. (Boxes and lines never reach their limit.)
  const labels: Lb[] = [];
  const newLabel = (x: number, y: number, text: string, textColor: string, style: LabStyle, size: LabSize): Lb => {
    const o = { x, y, text, textColor, style, size, deleted: false };
    labels.push(o);
    if (labels.length > MAX_LABELS + 5) for (const old of labels.splice(0, labels.length - MAX_LABELS)) old.deleted = true;
    return o;
  };
  const deleteLabel = (o: Lb) => {
    if (o.deleted) return;
    o.deleted = true;
    labels.splice(labels.indexOf(o), 1);
  };
  const box = (): Bx => ({ left: NaN, top: NaN, right: NaN, bottom: NaN, bg: 'transparent', deleted: false });
  const line = (css: string, dashed = false): Ln => ({ x1: NaN, y1: NaN, x2: NaN, y2: NaN, color: css, dashed });

  // var block BB: the only block, made on the first bar (its drawings have no place yet)
  const boxA = box();
  const boxB: Bx = { ...box(), styled: true };
  const bbLine = line(SILVER, true);
  const pd = [
    { box: box(), line: line(pdSCss), lab: null as Lb | null, broken: false },
    { box: box(), line: line(pdSCss), lab: null as Lb | null, broken: false },
  ];
  const swing = [
    { line: line(pdSCss), broken: false },
    { line: line(pdSCss), broken: false },
  ];
  const tp = [
    { line: line(tpCss), hit: false },
    { line: line(tpCss), hit: false },
    { line: line(tpCss), hit: false },
  ];
  let hl: Lb | null = null;
  let aLabels: Lb[] = [];
  let pdBoxA: Bx | null = null;
  let pdBoxB: Bx | null = null;
  let bbDir = 0; // na before the first block
  let broken = false;
  let mitigated = false;
  let scalp = false;

  // var ZZ aZZ: direction, bar and price of the latest swings (newest first)
  const zzD: number[] = new Array(ZZ_SIZE).fill(0);
  const zzX: number[] = new Array(ZZ_SIZE).fill(0);
  const zzY: number[] = new Array(ZZ_SIZE).fill(NaN);
  const inOut = (d: number, x: number, y: number) => {
    zzD.unshift(d);
    zzX.unshift(x);
    zzY.unshift(y);
    zzD.pop();
    zzX.pop();
    zzY.pop();
  };
  let mssDir = 0;

  for (let i = 0; i < n; i++) {
    const b = bars[i];
    const { open, high, low, close } = b;
    if (i === 0) {
      pd[0].lab = newLabel(NaN, NaN, '', '#FFFFFF', 'label_down', 'normal');
      pd[1].lab = newLabel(NaN, NaN, '', '#FFFFFF', 'label_down', 'normal');
      hl = newLabel(NaN, NaN, '', pdTxtCss, 'label_down', 'normal');
    }
    /** createLab(): a label on the current bar */
    const createLab = (s: 'c' | 'u' | 'd', y: number, css: string, text: string, size: LabSize = 'small') => {
      aLabels.unshift(newLabel(i, y, text, css, s === 'c' ? 'label_center' : s === 'u' ? 'label_up' : 'label_down', size));
    };
    const setLab = (o: Lb | null, change: (o: Lb) => void) => {
      if (o && !o.deleted) change(o);
    };

    // draw(): zigzag
    const x2 = i - 1;
    const ph = phArr[i] ?? NaN;
    const pl = plArr[i] ?? NaN;
    if (!isNaN(ph) && ph !== 0) {
      const y2 = i >= 1 ? bars[i - 1].high : 0;
      if (zzD[0] < 1) inOut(1, x2, y2);
      else if (zzD[0] === 1 && gt(ph, zzY[0])) {
        zzX[0] = x2;
        zzY[0] = y2;
      }
    }
    if (!isNaN(pl) && pl !== 0) {
      const y2 = i >= 1 ? bars[i - 1].low : 0;
      if (zzD[0] > -1) inOut(-1, x2, y2);
      else if (zzD[0] === -1 && lt(pl, zzY[0])) {
        zzX[0] = x2;
        zzY[0] = y2;
      }
    }
    const iH = zzD[2] === 1 ? 2 : 1;
    const iL = zzD[2] === -1 ? 2 : 1;
    const per = last - i <= LOOKBACK;

    /** A new breaker block from a market structure shift (up: bullish) */
    const shift = (up: boolean, iS: number) => {
      const Ex = zzX[iS - 1];
      const Ey = zzY[iS - 1];
      const Dx = zzX[iS];
      const Cx = zzX[iS + 1];
      const Cy = zzY[iS + 1];
      const Bx = zzX[iS + 2];
      const Ax = zzX[iS + 3];
      const Ay = zzY[iS + 3];
      // 50 % of the range from A to the body extreme of B and D
      const aBody = up ? MN(Ax) : MX(Ax);
      const yy = up ? Math.max(MX(Bx), MX(Dx)) : Math.min(MN(Bx), MN(Dx));
      const mid = up ? aBody + (yy - aBody) / 2 : aBody - (aBody - yy) / 2;
      const isOK = !onlyWhenInPDarray
        || (up ? lt(Ay, Cy) && lt(Ay, Ey) && lt(Ey, mid) : gt(Ay, Cy) && gt(Ay, Ey) && gt(Ey, mid));
      if (!(up ? lt(Ey, Cy) : gt(Ey, Cy)) || Cx === Dx || !isOK) return;

      // From the swing D back to the swing C: the first candle in the direction of the shift
      const step = Dx >= Cx ? -1 : 1;
      for (let k = Dx; step < 0 ? k >= Cx : k <= Cx; k += step) {
        const sameDir = (j: number) => (up ? gt(C(j), O(j)) : lt(C(j), O(j)));
        if (!sameDir(k)) continue;
        // reset the previous swing areas
        for (const p of pd) {
          p.box.left = NaN;
          p.box.top = NaN;
          p.line.x1 = NaN;
          p.line.y1 = NaN;
          setLab(p.lab, (o) => {
            o.x = NaN;
            o.y = NaN;
          });
        }
        let idx = k;
        let prT = onlyBody ? MX(k) : H(k);
        let prB = onlyBody ? MN(k) : L(k);
        if (twoLast && sameDir(k - 1)) {
          const t2 = onlyBody ? MX(k - 1) : H(k - 1);
          const b2 = onlyBody ? MN(k - 1) : L(k - 1);
          if (gt(t2, prT) || lt(b2, prB)) idx -= 1;
          prT = Math.max(prT, t2);
          prB = Math.min(prB, b2);
        }

        const avg = (prB + prT) / 2;
        while (aLabels.length > 0) deleteLabel(aLabels.pop()!);
        if (pdBoxA) pdBoxA.deleted = true;
        if (pdBoxB) pdBoxB.deleted = true;
        bbDir = up ? 1 : -1;
        const cssB = up ? cfg.cBBplusB : cfg.cBBminB;
        Object.assign(boxA, { left: idx, top: prT, right: i, bottom: prB, bg: up ? cfg.cBBplusA : cfg.cBBminA });
        Object.assign(boxB, {
          left: i, top: prT, right: i + 8, bottom: prB, bg: cssB, text: up ? '+BB' : '-BB', textColor: notransp(cssB),
          textVAlign: up ? 'bottom' : 'top',
        });
        Object.assign(bbLine, { x1: i, y1: avg, x2: i, y2: avg });

        if (showSPD) {
          Object.assign(swing[0].line, { x1: Cx, y1: Cy, x2: i, y2: Cy });
          swing[0].broken = false;
          Object.assign(swing[1].line, { x1: Ex, y1: Ey, x2: i, y2: Ey });
          swing[1].broken = false;
          setLab(hl, (o) => {
            o.x = Ex;
            o.y = Ey;
            o.style = up ? 'label_up' : 'label_down';
            o.text = up ? 'LL' : 'HH';
            if (!up) o.textColor = pdTxtCss;
          });
        }
        for (const t of tp) t.hit = false;
        broken = false;
        mitigated = false;
        scalp = false;
        pd[0].broken = false;
        pd[1].broken = false;

        if (onlyWhenInPDarray && showPDarray) {
          const premium = { bg: String(color.rgb(248, 153, 132, 90)), text: String(color.rgb(248, 153, 132, 25)) };
          const discount = { bg: String(color.rgb(132, 248, 171, 90)), text: String(color.rgb(132, 248, 171, 25)) };
          const zone = up ? discount : premium;
          pdBoxA = {
            left: Ax, top: up ? mid : aBody, right: Ex + 1, bottom: up ? aBody : mid, bg: zone.bg,
            text: up ? 'Discount PD Array' : 'Premium PD Array', textColor: zone.text, textVAlign: 'center', styled: true, deleted: false,
          };
          pdBoxB = { left: Ax, top: up ? yy : mid, right: Ex + 1, bottom: up ? mid : yy, bg: (up ? premium : discount).bg, deleted: false };
        }

        // Previous swings beyond the current bar
        let cnt = 0;
        let ref = up ? high : low;
        for (let c = 0; c <= ZZ_SIZE - 2; c++) {
          const getX = zzX[c];
          const getY = zzY[c];
          if ((up ? gt(getY, ref) : lt(getY, ref)) && zzD[c] === (up ? 1 : -1) && showSPD) {
            const getY2 = (up ? H(getX) - MN(getX) : MX(getX) - L(getX)) / 4;
            const edge = up ? getY - getY2 : getY + getY2;
            const take = cnt === 0 || (cnt === 1 && (up ? gt(edge, ref) : lt(edge, ref)));
            if (take) {
              const p = pd[cnt];
              Object.assign(p.box, { left: getX, top: up ? getY : edge, right: i, bottom: up ? edge : getY, bg: up ? cfg.cSwingBl : cfg.cSwingBr });
              Object.assign(p.line, { x1: getX, y1: getY, x2: i, y2: getY });
              setLab(p.lab, (o) => {
                o.x = getX;
                o.y = getY;
                o.size = 'small';
                o.textColor = pdTxtCss;
                o.text = up ? 'Premium PD Array' : 'Discount PD Array';
                o.style = up ? 'label_lower_left' : 'label_upper_left';
              });
              if (cnt === 0) ref = getY;
              cnt += 1;
            }
          }
          if (cnt === 2) break;
        }

        // Targets
        if (cfg.iTP) {
          const height = prT - prB;
          const ratios = [cfg.r2a / cfg.r1a, cfg.r2b / cfg.r1b, cfg.r2c / cfg.r1c];
          tp.forEach((t, j) => {
            const e = up ? prT + height * ratios[j] : prB - height * ratios[j];
            Object.assign(t.line, { x1: i, y1: e, x2: i + 20, y2: e });
          });
        }
        createLab(up ? 'u' : 'd', up ? low : high, notransp(cssB), up ? ARROW_UP : ARROW_DOWN, 'large');
        break;
      }
    };

    if (gt(close, zzY[iH]) && zzD[iH] === 1 && mssDir < 1 && per) {
      shift(true, iH);
      mssDir = 1;
    } else if (lt(close, zzY[iL]) && zzD[iL] === -1 && mssDir > -1 && per) {
      shift(false, iL);
      mssDir = -1;
    }

    // The life of the block
    if (bbDir !== 0) {
      const up = bbDir === 1;
      const top = boxB.top;
      const btm = boxB.bottom;
      const avg = bbLine.y2;
      const near = up ? top : btm; // the side of the signals
      const far = up ? btm : top; // the side of the mitigation
      const beyond = (a: number, level: number) => (up ? gt(a, level) : lt(a, level)); // in the direction of the block
      const behind = (a: number, level: number) => (up ? lt(a, level) : gt(a, level));
      const l1 = swing[0].line.y2;
      const l2 = swing[1].line.y2;
      const targets = tp.map((t) => t.line.y2);
      const s = up ? 'u' : 'd';
      const extreme = up ? low : high;

      if (!mitigated) {
        if (behind(close, far)) {
          mitigated = true;
          if (up) createLab('u', low, YELLOW, DOT);
          else if (showBreaks) createLab('d', high, notransp(cfg.cBBminB), DOT);
          boxB.right = i;
          bbLine.x2 = i;
        } else {
          boxB.right = i + 8;
          bbLine.x2 = i + 8;
        }
        for (const t of tp) t.line.x2 = i;

        if (i > boxB.left) {
          if (!broken) {
            if (scalp) {
              tp.forEach((t, j) => {
                if (!t.hit && behind(open, targets[j]) && beyond(up ? high : low, targets[j])) {
                  t.hit = true;
                  createLab('c', targets[j], TP_HIT, DOT);
                }
              });
            }
            if (beyond(open, avg) && behind(open, near) && beyond(close, near)) {
              for (const t of tp) t.hit = false;
              scalp = true;
              createLab(s, extreme, up ? LIME : ORANGE, up ? ARROW_UP : ARROW_DOWN, 'normal');
            } else if (behind(close, avg) && beyond(close, far)) {
              broken = true;
              scalp = false;
              createLab(s, extreme, up ? ORANGE : RED, CROSS);
            }
          } else if (!tillFirstBreak && beyond(close, near)) {
            // reset
            broken = false;
            scalp = true;
            createLab(s, extreme, BLUE, 'R', 'normal');
          }
        }
      }

      // Breaks of the two swings
      [l1, l2].forEach((level, j) => {
        if (swing[j].broken) return;
        swing[j].line.x2 = i;
        if (behind(close, level)) {
          swing[j].broken = true;
          if (showBreaks) createLab('c', extreme, BREAK, DOT);
        }
      });
      // Breaks of the swing areas
      for (const p of pd) {
        if (p.broken) continue;
        p.box.right = i;
        p.line.x2 = i;
        if (beyond(close, up ? p.box.top : p.box.bottom) && i > p.box.left) {
          p.broken = true;
          if (showBreaks) createLab('c', up ? high : low, BREAK, DOT);
        }
      }
    }
  }

  const interval = barInterval(bars);
  const T = (index: number) => barTime(bars, index, interval);
  const drawn = (...v: number[]) => v.every((value) => !isNaN(value));
  // creation order of the boxes and lines of the original
  const allBoxes = [boxA, boxB, pd[0].box, pd[1].box, pdBoxA, pdBoxB].filter((o): o is Bx => o !== null && !o.deleted);
  const allLines = [bbLine, pd[0].line, pd[1].line, swing[0].line, swing[1].line, tp[0].line, tp[1].line, tp[2].line];
  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {},
    // an object with an na coordinate is not drawn
    boxes: allBoxes.filter((o) => drawn(o.left, o.top, o.right, o.bottom)).map((o) => ({
      time1: T(o.left), price1: o.top, time2: T(o.right), price2: o.bottom, bgColor: o.bg, borderColor: 'transparent',
      ...(o.text !== undefined ? { text: o.text, textColor: o.textColor, textVAlign: o.textVAlign } : {}),
      ...(o.styled ? { textSize: 'small' as const, textHAlign: 'right' as const, fontFamily: 'monospace' as const } : {}),
    })),
    lines: allLines.filter((o) => drawn(o.x1, o.y1, o.x2, o.y2)).map((o) => ({
      time1: T(o.x1), price1: o.y1, time2: T(o.x2), price2: o.y2, color: o.color,
      ...(o.dashed ? { style: 'dashed' as const } : {}),
    })),
    labels: labels.filter((o) => drawn(o.x, o.y)).map((o) => ({
      time: T(o.x), price: o.y, text: o.text, color: 'transparent', textColor: o.textColor, style: o.style, size: o.size,
    })),
  };
}

export const BreakerBlocksWithSignals = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
};
