/**
 * Swing Volume Profiles [LuxAlgo]
 *
 * A volume profile between each pair of consecutive swing points (pivot highs / lows with `ppLen` bars on each
 * side), drawn when the second swing is confirmed.
 * - The price range of the bars between the two swings is cut in `vpLev` rows. The volume of a bar is shared between
 *   the rows it touches (volume * row height / bar range for each row).
 * - Rows are boxes whose length follows their volume; the rows of the value area (the rows around the row with the
 *   most volume that hold `isVA` % of the volume) take the first colour, the others the second one.
 * - Point of control: a thin box at the middle of the row with the most volume, with an option to extend it until
 *   the last bar, or until a bar crosses or touches it.
 * - Value area high and low: two lines over the profile, with an optional fill between them.
 * - Developing point of control: a step line over the `ppLen` bars after the swing (the row with the most volume of
 *   these bars, bar after bar), continued up to the last bar.
 * - Unfilled liquidity: the rows with less than `liqT` % of the largest row become boxes that start at the last bar
 *   of the profile that touched the row and run to the right until a bar trades through their middle (then they are
 *   deleted).
 * - A label at the swing (or at the profile / value area high and low) with the profile statistics as tooltip, and
 *   optionally the price, the price change and the volume as text.
 * - On the last bar, the same profile for the bars since the last swing.
 * - alert() calls (`alertCalls`, once per bar) when the close crosses the original's point of control, value area
 *   high or value area low level of the bar (each with its Show input). As in the original these levels are, before
 *   the last bar, the rows of the last profile (POC: row 0, the POC row is only kept on the last bar) over the range
 *   of the bar and the bar before it.
 * "Present" mode only draws the profiles confirmed in the last `back` bars. At most 500 boxes, 500 lines and 500
 * labels are kept (the oldest are removed, by the rules of the library drawing registry).
 *
 * Chart values (third argument): the symbol tick for the prices of the texts (without it 0.01) and the chart
 * foreground colour for the labels (without it #DBDBDB, a dark chart).
 *
 * Reference: "Swing Volume Profiles [LuxAlgo]" by LuxAlgo
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © LuxAlgo
 */

import {
  ta, str, array, callsite, Series, box, line, label, linefill, resetDrawings, setDrawingBar, holdDrawing,
  type IndicatorResult, type InputConfig, type PlotConfig, type Bar,
} from 'oakscriptjs';
import type { AlertCall, BoxData, LabelData, LineDrawingData, LinefillData } from '../types';
import { barInterval, barTime } from '../bar-time';
import { foregroundColorOf, mintickOf, tickerOf, type ChartContext } from '../chart-context';

/** The original makes alert() calls */
export const hasAlertFunction = true;

export interface SwingVolumeProfilesInputs {
  mode: 'Present' | 'Historical';
  back: number;
  ppLen: number;
  vpShw: boolean;
  vpTVC: string;
  vpVVC: string;
  vpB: boolean;
  vpBC: string;
  pcShw: boolean;
  pcC: string;
  dpcS: boolean;
  dpcC: string;
  pcE: 'Until Last Bar' | 'Until Bar Cross' | 'Until Bar Touch' | 'None';
  /** Value area volume, in % */
  isVA: number;
  vhShw: boolean;
  vaHC: string;
  vlShw: boolean;
  vaLC: string;
  vaB: boolean;
  vaBC: string;
  liqUF: boolean;
  /** Unfilled liquidity threshold, in % of the largest row */
  liqT: number;
  liqC: string;
  ppLev: 'Swing High/Low' | 'Profile High/Low' | 'Value Area High/Low';
  ppLS: 'Tiny' | 'Small' | 'Normal';
  ppP: boolean;
  ppC: boolean;
  ppV: boolean;
  vpLev: number;
  vpPlc: 'Right' | 'Left';
  /** Profile width, in % of the profile length */
  vpWth: number;
}

export const defaultInputs: SwingVolumeProfilesInputs = {
  mode: 'Present',
  back: 300,
  ppLen: 47,
  vpShw: true,
  vpTVC: 'rgba(251, 192, 45, 0.35)',
  vpVVC: 'rgba(67, 70, 81, 0.35)',
  vpB: false,
  vpBC: 'rgba(41, 98, 255, 0.05)',
  pcShw: true,
  pcC: '#ff0000',
  dpcS: true,
  dpcC: '#ff0000',
  pcE: 'None',
  isVA: 68,
  vhShw: true,
  vaHC: '#2962ff',
  vlShw: true,
  vaLC: '#2962ff',
  vaB: false,
  vaBC: 'rgba(41, 98, 255, 0.11)',
  liqUF: true,
  liqT: 21,
  liqC: 'rgba(0, 188, 212, 0.1)',
  ppLev: 'Swing High/Low',
  ppLS: 'Small',
  ppP: false,
  ppC: false,
  ppV: false,
  vpLev: 27,
  vpPlc: 'Left',
  vpWth: 50,
};

const G_VP = 'Swing Volume Profiles';
const G_PC = 'Point of Control (POC)';
const G_VA = 'Value Area (VA)';
const G_LQ = 'Liquidity Levels / Voids';
const G_LB = 'Profile Stats';
const G_OT = 'Volume Profile Others';

export const inputConfig: InputConfig[] = [
  { id: 'mode', type: 'string', title: 'Mode', defval: 'Present', options: ['Present', 'Historical'], inline: 'MOD' },
  { id: 'back', type: 'int', title: '    # Bars', defval: 300, min: 100, max: 5000, step: 10, inline: 'MOD' },
  { id: 'ppLen', type: 'int', title: 'Swing Detection Length', defval: 47, min: 1, group: G_VP,
    tooltip: 'The Swing High Low indicator is used to determine and anticipate potential changes in market price and reversals\n'
      + "'Swing Volume Profiles [LuxAlgo]' aims at highliting the trading activity at specified price levels between two Swing Levels" },
  { id: 'vpShw', type: 'bool', title: 'Swing Volume Profiles', defval: true, inline: 'BB3', group: G_VP,
    tooltip: 'Common Interest Profile (Total Volume) - displays total trading activity over a specified time period at specific price levels' },
  { id: 'vpTVC', type: 'color', title: '', defval: 'rgba(251, 192, 45, 0.35)', inline: 'BB3', group: G_VP },
  { id: 'vpVVC', type: 'color', title: '', defval: 'rgba(67, 70, 81, 0.35)', inline: 'BB3', group: G_VP },
  { id: 'vpB', type: 'bool', title: 'Profile Range Background Fill', defval: false, inline: 'BG', group: G_VP },
  { id: 'vpBC', type: 'color', title: '', defval: 'rgba(41, 98, 255, 0.05)', inline: 'BG', group: G_VP },
  { id: 'pcShw', type: 'bool', title: 'Point of Control (PoC)', defval: true, inline: 'PoC', group: G_PC,
    tooltip: 'Point of Control (POC) - The price level for the time period with the highest traded volume' },
  { id: 'pcC', type: 'color', title: '', defval: '#ff0000', inline: 'PoC', group: G_PC },
  { id: 'dpcS', type: 'bool', title: 'Developing PoC    ', defval: true, inline: 'dPoC', group: G_PC,
    tooltip: 'Developing Point of Control, displays how POC is changing during the active market session' },
  { id: 'dpcC', type: 'color', title: '', defval: '#ff0000', inline: 'dPoC', group: G_PC },
  { id: 'pcE', type: 'string', title: 'Extend PoC', defval: 'None',
    options: ['Until Last Bar', 'Until Bar Cross', 'Until Bar Touch', 'None'], group: G_PC },
  { id: 'isVA', type: 'float', title: 'Value Area Volume %', defval: 68, min: 0, max: 100, group: G_VA,
    tooltip: 'Value Area (VA) – The range of price levels in which a specified percentage of all volume was traded during the time period' },
  { id: 'vhShw', type: 'bool', title: 'Value Area High (VAH)', defval: true, inline: 'VAH', group: G_VA,
    tooltip: 'Value Area High (VAH) - The highest price level within the value area' },
  { id: 'vaHC', type: 'color', title: '', defval: '#2962ff', inline: 'VAH', group: G_VA },
  { id: 'vlShw', type: 'bool', title: 'Value Area Low (VAL) ', defval: true, inline: 'VAL', group: G_VA,
    tooltip: 'Value Area Low (VAL) - The lowest price level within the value area' },
  { id: 'vaLC', type: 'color', title: '', defval: '#2962ff', inline: 'VAL', group: G_VA },
  { id: 'vaB', type: 'bool', title: 'Value Area (VA) Background Fill', defval: false, inline: 'vBG', group: G_VA },
  { id: 'vaBC', type: 'color', title: '', defval: 'rgba(41, 98, 255, 0.11)', inline: 'vBG', group: G_VA },
  { id: 'liqUF', type: 'bool', title: 'Unfilled Liquidity, Thresh', defval: true, inline: 'UFL', group: G_LQ },
  { id: 'liqT', type: 'int', title: '', defval: 21, inline: 'UFL', group: G_LQ },
  { id: 'liqC', type: 'color', title: '', defval: 'rgba(0, 188, 212, 0.1)', inline: 'UFL', group: G_LQ },
  { id: 'ppLev', type: 'string', title: 'Position', defval: 'Swing High/Low',
    options: ['Swing High/Low', 'Profile High/Low', 'Value Area High/Low'], inline: 'ppLS', group: G_LB },
  { id: 'ppLS', type: 'string', title: 'Size', defval: 'Small', options: ['Tiny', 'Small', 'Normal'], inline: 'ppLS', group: G_LB },
  { id: 'ppP', type: 'bool', title: 'Price', defval: false, inline: 'Levels', group: G_LB },
  { id: 'ppC', type: 'bool', title: 'Price Change', defval: false, inline: 'Levels', group: G_LB },
  { id: 'ppV', type: 'bool', title: 'Cumulative Volume', defval: false, inline: 'Levels', group: G_LB },
  { id: 'vpLev', type: 'int', title: 'Number of Rows', defval: 27, min: 10, max: 100, step: 1, group: G_OT },
  { id: 'vpPlc', type: 'string', title: 'Placment', defval: 'Left', options: ['Right', 'Left'], group: G_OT },
  { id: 'vpWth', type: 'int', title: 'Profile Width %', defval: 50, min: 0, max: 100, group: G_OT },
];

export const plotConfig: PlotConfig[] = [];

export const metadata = {
  title: 'Swing Volume Profiles [LuxAlgo]',
  shortTitle: 'LuxAlgo - Swing Volume Profiles',
  overlay: true,
};

/** indicator(max_boxes_count = 500, max_labels_count = 500, max_lines_count = 500) */
const MAX_OBJECTS = 500;
const NO_COLOR = '#00000000';

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const ge = (a: number, b: number) => a - b > -EPS;
/** math.sign(a) != math.sign(b): false with an na side */
const signsDiffer = (a: number, b: number) => !isNaN(a) && !isNaN(b) && Math.sign(a) !== Math.sign(b);

type Bx = ReturnType<typeof box.new>;
type Ln = ReturnType<typeof line.new>;
/** Pine type liquidity */
interface Liquidity { b: boolean[]; bx: Bx[] }

export function calculate(
  bars: Bar[],
  inputs: Partial<SwingVolumeProfilesInputs> = {},
  chart?: ChartContext,
): IndicatorResult & {
  boxes: BoxData[]; lines: LineDrawingData[]; labels: LabelData[]; linefills: LinefillData[]; alertCalls: AlertCall[];
} {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const { vpShw, vpTVC, vpVVC, vpB, vpBC, pcShw, pcC, dpcS, dpcC, pcE, vhShw, vaHC, vlShw, vaLC, vaB, vaBC, liqUF, liqC, ppLev, ppP,
    ppC, ppV, vpPlc } = cfg;
  const back = Math.trunc(cfg.back);
  const ppLen = Math.trunc(cfg.ppLen);
  const vpLev = Math.trunc(cfg.vpLev);
  const isVA = cfg.isVA / 100;
  const liqT = cfg.liqT / 100;
  const vpWth = cfg.vpWth / 100;
  const ppS = cfg.ppLS === 'Tiny' ? 'tiny' : cfg.ppLS === 'Small' ? 'small' : 'normal';
  const fg = foregroundColorOf(chart);
  const MINTICK = mintickOf(chart);
  const tick = (v: number) => str.tostring(v, 'mintick', MINTICK);
  const vol = (v: number) => str.tostring(v, 'volume');
  const pct = (v: number) => str.tostring(v, '#.##');
  const last = n - 1; // last_bar_index

  const H = (i: number) => (i >= 0 && i < n ? bars[i].high : NaN);
  const L = (i: number) => (i >= 0 && i < n ? bars[i].low : NaN);
  const C = (i: number) => (i >= 0 && i < n ? bars[i].close : NaN);
  const V = (i: number) => (i >= 0 && i < n ? bars[i].volume ?? NaN : NaN);
  /** nz(volume) of a bar (na before the first bar) */
  const NZV = (i: number) => (i >= 0 && i < n ? (isNaN(V(i)) ? 0 : V(i)) : NaN);

  // Drawings live in the library registry (max_boxes_count, max_lines_count, max_labels_count = 500; boxes made with na
  // coordinates count too)
  resetDrawings({ box: MAX_OBJECTS, line: MAX_OBJECTS, label: MAX_OBJECTS });
  const newBox = (left: number, top: number, right: number, bottom: number, border: string, bg: string, borderStyle: 'solid' | 'dotted' = 'solid') =>
    box.new(left, top, right, bottom, border, 1, borderStyle, 'none', 'bar_index', bg);
  const newLine = (x1: number, y1: number, x2: number, y2: number, css: string) =>
    line.new(x1, y1, x2, y2, 'bar_index', 'none', css, 'solid', 2);
  const newLabel = (x: number, y: number, text: string, color: string, style: 'label_down' | 'label_up', size: string, tooltip: string) =>
    label.new(x, y, text, 'bar_index', 'price', color, style, fg, size, 'center', tooltip);
  /** math.avg(box.get_bottom(), box.get_top()): na for a deleted box */
  const middle = (bx: Bx) => (box.get_bottom(bx) + box.get_top(bx)) / 2;

  const phArr = ta.pivothigh(new Series(bars, (b) => b.high), ppLen, ppLen).toArray();
  const plArr = ta.pivotlow(new Series(bars, (b) => b.low), ppLen, ppLen).toArray();
  const highestSite = callsite.highest();
  const lowestSite = callsite.lowest();

  // var pivotPoint pp
  const pp = { x: NaN, x1: NaN, h: NaN, l: NaN, s: '' };
  const aPOC: Bx[] = [];
  let dPCa: Ln[] = [];
  let laP = 0;
  let lbP = 0;
  // var dpcL = 0: only set on the last bar; the alert levels of every bar (POC, VAH, VAL)
  let dpcLVar = 0;
  const pocLevel: number[] = [];
  const vahLevel: number[] = [];
  const valLevel: number[] = [];
  let ersten = NaN;
  // var aLIQ = array.new<liquidity>(1, ...)
  const aLIQ: Liquidity[] = [{ b: new Array<boolean>(vpLev).fill(false), bx: [] }];

  /**
   * f_calcHL(_l, _c = true, _o) at bar t: highest high, lowest low of the bars _o .. _o + _l back, and the volume
   * of the bars _o .. _o + _l - 1 back
   */
  const calcHL = (t: number, len: number, o: number): [number, number, number] => {
    let l = L(t - o);
    let h = H(t - o);
    let v = 0;
    if (!isNaN(len)) {
      // for x = 0 to _l - 1 (counts down when _l is 0)
      const end = len - 1;
      const step = end >= 0 ? 1 : -1;
      for (let x = 0; step > 0 ? x <= end : x >= end; x += step) {
        l = Math.min(L(t - o - x), l);
        h = Math.max(H(t - o - x), h);
        v += V(t - o - x);
      }
    }
    // low[_o + _l]: an na offset reads the current bar
    const far = isNaN(len) ? t : t - o - len;
    l = Math.min(L(far), l);
    h = Math.max(H(far), h);
    return [h, l, v];
  };

  /** for pLev = from to to by step: add the volume of bar `i` to the rows it touches */
  const addVolume = (vs: number[], i: number, from: number, to: number, step: number) => {
    const h = H(i);
    const l = L(i);
    let row = 0;
    for (let pLev = from; pLev - to <= EPS; pLev += step) {
      if (ge(h, pLev) && lt(l, pLev + step)) {
        vs[row] = vs[row] + NZV(i) * (Math.abs(h - l) <= EPS ? 1 : step / (h - l));
      }
      row += 1;
      if (!(step > 0)) break;
    }
  };

  /** Value area around row `poc`: sets laP / lbP */
  const valueArea = (vs: number[], poc: number) => {
    const ttV = array.sum(vs) * isVA;
    let va = vs[poc];
    laP = poc;
    lbP = poc;
    while (lt(va, ttV)) {
      if (lbP === 0 && laP === vpLev - 1) break;
      let vaP = 0;
      if (laP < vpLev - 1) vaP = vs[laP + 1];
      let vbP = 0;
      if (lbP > 0) vbP = vs[lbP - 1];
      if (Math.abs(vbP) <= EPS && Math.abs(vaP) <= EPS) break;
      if (ge(vaP, vbP)) {
        va += vaP;
        laP += 1;
      } else {
        va += vbP;
        lbP -= 1;
      }
    }
  };

  /** Liquidity boxes of all sets: deleted when the bar trades through their middle, else extended to the bar */
  const sweep = (set: Liquidity, t: number, right: number) => {
    // for no = (qBX > 0 ? qBX - 1 : na) to 0
    for (let no = set.bx.length - 1; no >= 0; no--) {
      if (no < set.bx.length) {
        const cBX = set.bx[no];
        const mBX = middle(cBX);
        if (signsDiffer(C(t - 1) - mBX, L(t) - mBX) || signsDiffer(C(t - 1) - mBX, H(t) - mBX)) {
          box.delete(cBX);
          set.bx.splice(no, 1);
        } else box.set_right(cBX, right);
      }
    }
  };


  for (let t = 0; t < n; t++) {
    setDrawingBar(t, t === last);
    const per = cfg.mode === 'Present' ? last - t <= back : true;
    const nzV = NZV(t);
    // volumeProfile aVP / aVPa: new on every bar
    const aVPvs: number[] = new Array(vpLev + 1).fill(0);
    const aVPavs: number[] = new Array(vpLev + 1).fill(0);

    const ppH = phArr[t] ?? NaN;
    const ppL = plArr[t] ?? NaN;
    if (!isNaN(ppH)) {
      pp.h = ppH;
      pp.s = 'H';
    }
    if (!isNaN(ppL)) {
      pp.l = ppL;
      pp.s = 'L';
    }
    const go = !isNaN(ppH) || !isNaN(ppL);
    if (go) {
      pp.x1 = pp.x;
      pp.x = t;
    }
    let vpLen = pp.x - pp.x1;

    let pHst = NaN;
    let pLst = NaN;
    let volumeSum = NaN;
    let pHta = NaN;
    let pLta = NaN;
    if (go) {
      [pHst, pLst, volumeSum] = calcHL(t, vpLen, ppLen);
      [pHta, pLta] = calcHL(t, ppLen, 0);
    }
    let pStp = (pHst - pLst) / vpLev;
    const pSpa = (pHta - pLta) / vpLev;

    if (go && nzV !== 0 && gt(pStp, 0) && t > vpLen && vpLen > 0 && per) {
      for (const l of dPCa) line.delete(l);
      dPCa = [];

      for (let bIt = 1; bIt <= vpLen; bIt++) addVolume(aVPvs, t - (bIt + ppLen), pLst, pHst, pStp);

      const vsMax = array.max(aVPvs);
      const pcL = array.indexof(aVPvs, vsMax);
      valueArea(aVPvs, pcL);

      const cLIQ: Liquidity = { b: new Array<boolean>(vpLev).fill(false), bx: [] };
      aLIQ.unshift(cLIQ);

      for (let l = vpLev - 1; l >= 0; l--) {
        if (vpShw) {
          const width = Math.trunc((aVPvs[l] / vsMax) * vpLen * vpWth);
          const sbI = vpPlc === 'Right' ? t - width : t - vpLen;
          const ebI = vpPlc === 'Right' ? t : sbI + width;
          const css = l >= lbP && l <= laP ? vpTVC : vpVVC;
          newBox(sbI - ppLen, pLst + (l + 0.1) * pStp, ebI - ppLen, pLst + (l + 0.9) * pStp, css, css);
        }
        if (liqUF) {
          if (lt(aVPvs[l] / vsMax, liqT)) {
            cLIQ.b[l] = true;
            cLIQ.bx.unshift(newBox(t - ppLen, pLst + (l + 0.0) * pStp, t - ppLen, pLst + (l + 1.0) * pStp, 'transparent', liqC));
          } else {
            cLIQ.bx.unshift(newBox(NaN, NaN, NaN, NaN, '', ''));
            cLIQ.b[l] = false;
          }
        }
      }

      // Left edge of each liquidity box: the latest bar of the profile that touched its middle
      for (let bIt = 0; bIt <= vpLen; bIt++) {
        const i = t - (bIt + ppLen);
        for (let no = 0; no <= cLIQ.bx.length - 1; no++) {
          if (cLIQ.b[no]) {
            const cBX = cLIQ.bx[no];
            const mBX = middle(cBX);
            if (signsDiffer(C(i - 1) - mBX, L(i) - mBX) || signsDiffer(C(i - 1) - mBX, H(i) - mBX)
              || signsDiffer(C(i - 1) - mBX, C(i) - mBX)) {
              box.set_left(cBX, i);
              cLIQ.b[no] = false;
            }
          }
        }
      }

      // The bars after the swing: liquidity boxes, developing point of control
      for (let bI = ppLen; bI >= 0; bI--) {
        const i = t - bI;
        sweep(cLIQ, i, i);

        if (dpcS) {
          addVolume(aVPavs, i, pLta, pHta, pSpa);
          const level = pLta + (array.indexof(aVPavs, array.max(aVPavs)) + 0.5) * pSpa;
          if (bI === ppLen) {
            ersten = (H(t - ppLen) + L(t - ppLen)) / 2;
          } else {
            dPCa.push(newLine(i - 1, ersten, i, level, dpcC));
            ersten = level;
          }
        }
      }

      if (vpB) newBox(t - ppLen - vpLen, pHst, t - ppLen, pLst, vpBC, vpBC, 'dotted');
      if (pcShw) aPOC.push(newBox(t - ppLen - vpLen, pLst + (pcL + 0.4) * pStp, t - ppLen, pLst + (pcL + 0.6) * pStp, pcC, pcC));

      const vahY = pLst + (laP + 1.0) * pStp;
      const valY = pLst + (lbP + 0.0) * pStp;
      const vah = newLine(t - ppLen - vpLen, vahY, t - ppLen, vahY, vhShw ? vaHC : NO_COLOR);
      const val = newLine(t - ppLen - vpLen, valY, t - ppLen, valY, vlShw ? vaLC : NO_COLOR);
      if (vaB) linefill.new(vah, val, vaBC);

      const statTip = '\n -Traded Volume : ' + vol(volumeSum) + ' (' + str.tostring(vpLen - 1) + ' bars)'
        + '\n  *Average Volume/Bar : ' + vol(volumeSum / (vpLen - 1))
        + '\n\nProfile High : ' + tick(pHst) + ' ↑ %' + pct(((pHst - pLst) / pLst) * 100)
        + '\nProfile Low : ' + tick(pLst) + ' ↓ %' + pct(((pHst - pLst) / pHst) * 100)
        + '\n -Point Of Control : ' + tick(pLst + (pcL + 0.5) * pStp)
        + '\n\nValue Area High : ' + tick(vahY)
        + '\nValue Area Low : ' + tick(valY)
        + '\n -Value Area Width : %' + pct(((vahY - valY) / (pHst - pLst)) * 100)
        + '\n\nNumber of Bars (Profile) : ' + str.tostring(vpLen);
      const volText = ppV ? (ppP || ppC ? '\n' : '') + vol(volumeSum) : '';
      const upChange = ppC ? (ppP ? ' ↑ %' : '↑ %') + pct(((pp.h - pp.l) * 100) / pp.l) : '';
      const dnChange = ppC ? (ppP ? ' ↓ %' : '↓ %') + pct(((pp.h - pp.l) * 100) / pp.h) : '';

      if (ppLev !== 'Swing High/Low') {
        const uPl = ppLev === 'Value Area High/Low' ? vahY : pHst;
        const lPl = ppLev === 'Value Area High/Low' ? valY : pLst;
        const uTx = (ppP ? tick(uPl) : '') + (!isNaN(ppH) ? upChange + volText : '');
        const lTx = (ppP ? tick(lPl) : '') + (!isNaN(ppL) ? dnChange + volText : '');
        // b.i[ppLen] - vpLen / 2: a float division; the bar index of the label is its integer part
        const x = Math.trunc(t - ppLen - vpLen / 2);
        newLabel(x, uPl, uTx, NO_COLOR, 'label_down', ppS,
          ' Profile High : ' + tick(pHst) + '\n %' + pct(((pHst - pLst) / pLst) * 100) + ' higher than the Profile Low' + statTip);
        newLabel(x, lPl, lTx, NO_COLOR, 'label_up', ppS,
          ' Profile Low : ' + tick(pLst) + '\n %' + pct(((pHst - pLst) / pHst) * 100) + ' lower than the Profile High' + statTip);
      } else {
        const plain = !ppP && !ppC && !ppV;
        if (!isNaN(ppH)) {
          newLabel(t - ppLen, pp.h, (ppP ? tick(pp.h) : '') + upChange + volText, plain ? fg : NO_COLOR, 'label_down', plain ? 'tiny' : ppS,
            'Swing High : ' + tick(pp.h) + '\n -Price Change : %' + pct(((pp.h - pp.l) * 100) / pp.l) + statTip);
        }
        if (!isNaN(ppL)) {
          newLabel(t - ppLen, pp.l, (ppP ? tick(pp.l) : '') + dnChange + volText, plain ? fg : NO_COLOR, 'label_up', plain ? 'tiny' : ppS,
            'Swing Low : ' + tick(pp.l) + '\n -Price Change : %' + pct(((pp.h - pp.l) * 100) / pp.h) + statTip);
        }
      }
    }

    // f_checkBreaches(aPOC, pcE)
    if (pcShw && pcE !== 'None') {
      const qBX = aPOC.length;
      for (let no = 0; no <= qBX - 1; no++) {
        if (no < aPOC.length) {
          const cBX = aPOC[no];
          const mBX = middle(cBX);
          const ced = signsDiffer(C(t - 1) - mBX, C(t) - mBX);
          const ted = signsDiffer(C(t - 1) - mBX, L(t) - mBX) || signsDiffer(C(t - 1) - mBX, H(t) - mBX);
          if (ced && pcE === 'Until Bar Cross') aPOC.splice(no, 1);
          else if (ted && pcE === 'Until Bar Touch') aPOC.splice(no, 1);
          else box.set_right(cBX, t);
        }
      }
    }

    for (const set of aLIQ) sweep(set, t, t);

    // The profile in progress, on the last bar
    const isLast = t === last;
    vpLen = isLast ? last - pp.x + ppLen : 1;
    const length = vpLen > 0 ? vpLen + 1 : 1;
    pHst = highestSite(H(t), length);
    pLst = lowestSite(L(t), length);
    pStp = (pHst - pLst) / vpLev;

    if (isLast && nzV !== 0 && vpLen > 0 && gt(pStp, 0)) {
      const [, , volumeLast] = calcHL(t, vpLen, 0);
      // var arrays dVP.vp, dPOC and dLIQ are empty before the last bar
      const dPOC: Ln[] = [];
      for (let bI = vpLen; bI >= 1; bI--) {
        addVolume(aVPvs, t - bI, pLst, pHst, pStp);
        if (dpcS) {
          const level = () => pLst + (array.indexof(aVPvs, array.max(aVPvs)) + 0.5) * pStp;
          if (bI === last - pp.x) {
            if (dPCa.length > 0) {
              const prev = dPCa[dPCa.length - 1];
              dPOC.push(newLine(t - bI, line.get_y2(prev), t - bI + 1, level(), dpcC));
            }
          } else if (bI < last - pp.x) {
            if (dPOC.length > 0) {
              const prev = dPOC[dPOC.length - 1];
              dPOC.push(newLine(t - bI, line.get_y2(prev), t - bI + 1, level(), dpcC));
            }
          }
        }
      }

      const vsMax = array.max(aVPvs);
      const dpcL = array.indexof(aVPvs, vsMax);
      dpcLVar = dpcL;
      valueArea(aVPvs, dpcL);

      const flags: boolean[] = [];
      const liq: Bx[] = [];
      for (let l = 0; l <= vpLev - 1; l++) {
        if (vpShw) {
          const width = Math.trunc((aVPvs[l] / vsMax) * vpLen * vpWth);
          const sbI = vpPlc === 'Right' ? t - width : t - vpLen;
          const ebI = vpPlc === 'Right' ? t : sbI + width;
          const css = l >= lbP && l <= laP ? vpTVC : vpVVC;
          newBox(sbI, pLst + (l + 0.1) * pStp, ebI, pLst + (l + 0.9) * pStp, css, css);
        }
        if (liqUF) {
          if (lt(aVPvs[l] / vsMax, liqT)) {
            flags.unshift(true);
            liq.unshift(newBox(t, pLst + (l + 0.0) * pStp, t, pLst + (l + 1.0) * pStp, 'transparent', liqC));
          } else {
            liq.unshift(newBox(NaN, NaN, NaN, NaN, '', ''));
            flags.unshift(false);
          }
        }
      }

      for (let bI = 0; bI <= vpLen; bI++) {
        const i = t - bI;
        for (let no = 0; no <= liq.length - 1; no++) {
          if (flags[no]) {
            const cBX = liq[no];
            const mBX = middle(cBX);
            if (signsDiffer(C(i - 1) - mBX, L(i) - mBX) || signsDiffer(C(i - 1) - mBX, H(i) - mBX)
              || signsDiffer(C(i - 1) - mBX, C(i) - mBX)) {
              box.set_left(cBX, i);
              flags[no] = false;
            }
          }
        }
      }

      if (vpB) newBox(t - vpLen, pHst, t, pLst, vpBC, vpBC);
      if (pcShw && !dpcS) newBox(t - vpLen, pLst + (dpcL + 0.4) * pStp, t, pLst + (dpcL + 0.6) * pStp, pcC, pcC);

      const vahY = pLst + (laP + 1.0) * pStp;
      const valY = pLst + (lbP + 0.0) * pStp;
      // f_drawLineX / f_drawLabelX: `var id = line.new(...)` / `label.new(...)`, held by the variable
      const vah = holdDrawing(newLine(t - vpLen, vahY, t, vahY, vhShw ? vaHC : NO_COLOR));
      const val = holdDrawing(newLine(t - vpLen, valY, t, valY, vlShw ? vaLC : NO_COLOR));
      if (vaB) linefill.new(vah, val, vaBC);

      if (ppLev !== 'Swing High/Low') {
        const close = C(t);
        const statTip = '\n -Traded Volume : ' + vol(volumeLast) + ' (' + str.tostring(vpLen - 1) + ' bars)'
          + '\n  *Average Volume/Bar : ' + vol(volumeLast / (vpLen - 1))
          + '\n\nProfile High : ' + tick(pHst) + ' ↑ %' + pct(((pHst - pLst) / pLst) * 100)
          + '\nProfile Low : ' + tick(pLst) + ' ↓ %' + pct(((pHst - pLst) / pHst) * 100)
          + '\n -Point Of Control : ' + tick(pLst + (dpcL + 0.5) * pStp)
          + '\n\nValue Area High : ' + tick(vahY)
          + '\nValue Area Low : ' + tick(valY)
          + '\n -Value Area Width : %' + pct(((vahY - valY) / (pHst - pLst)) * 100)
          + '\n\nNumber of Bars (Profile) : ' + str.tostring(vpLen)
          + (ppC ? '\n\n*price change caculated based on last swing high/low and last price' : '');
        const uPl = ppLev === 'Value Area High/Low' ? vahY : pHst;
        const lPl = ppLev === 'Value Area High/Low' ? valY : pLst;
        const volText = ppV ? (ppP || ppC ? '\n' : '') + vol(volumeLast) : '';
        const uTx = (ppP ? tick(uPl) : '')
          + (pp.s === 'L' ? (ppC ? (ppP ? ' ↑ %' : '↑ %') + pct(((close - pp.l) * 100) / pp.l) + '*' : '') + volText : '');
        const lTx = (ppP ? tick(lPl) : '')
          + (pp.s === 'H' ? (ppC ? (ppP ? ' ↓ %' : '↓ %') + pct(((pp.h - close) * 100) / pp.h) + '*' : '') + volText : '');
        const x = Math.trunc(t - vpLen / 2);
        holdDrawing(newLabel(x, uPl, uTx, NO_COLOR, 'label_down', ppS,
          'Profile High : ' + tick(pHst) + '\n %' + pct(((pHst - pLst) / pLst) * 100) + ' higher than the Profile Low' + statTip));
        holdDrawing(newLabel(x, lPl, lTx, NO_COLOR, 'label_up', ppS,
          'Profile Low : ' + tick(pLst) + '\n %' + pct(((pHst - pLst) / pHst) * 100) + ' lower than the Profile High' + statTip));
      }
    }

    // Alert levels: pLst + (dpcL + 0.50) * pStp, pLst + (laP + 1.00) * pStp, pLst + (lbP + 0.00) * pStp
    pocLevel.push(pLst + (dpcLVar + 0.5) * pStp);
    vahLevel.push(pLst + (laP + 1.0) * pStp);
    valLevel.push(pLst + (lbP + 0.0) * pStp);
  }

  setDrawingBar(null);

  // if ta.cross(close, level) and show: alert(syminfo.ticker + ' : Swings Volume Profile : ...' + str.tostring(close,
  // format.mintick)); ta.cross compares exactly, na is false
  const tickerTxt = tickerOf(chart);
  const alertCalls: AlertCall[] = [];
  const crossed = (lv: number[], t: number) => {
    if (t < 1) return false;
    const c = C(t), c1 = C(t - 1), v = lv[t], v1 = lv[t - 1];
    return (c > v && c1 <= v1) || (c < v && c1 >= v1);
  };
  for (let t = 0; t < n; t++) {
    const tail = ', price ' + tick(C(t));
    const time = bars[t].time as number;
    if (crossed(pocLevel, t) && pcShw) {
      alertCalls.push({ time, message: tickerTxt + ' : Swings Volume Profile : Price touches/crosses Point Of Control Line' + tail, freq: 'once_per_bar' });
    }
    if (crossed(vahLevel, t) && vhShw) {
      alertCalls.push({ time, message: tickerTxt + ' : Swings Volume Profile : Price touches/crosses Value Area High Line' + tail, freq: 'once_per_bar' });
    }
    if (crossed(valLevel, t) && vlShw) {
      alertCalls.push({ time, message: tickerTxt + ' : Swings Volume Profile : Price touches/crosses Value Area Low Line' + tail, freq: 'once_per_bar' });
    }
  }

  const interval = barInterval(bars);
  const T = (index: number) => barTime(bars, index, interval);
  const lineData = (l: Ln): LineDrawingData => ({
    time1: T(l.x1), price1: l.y1, time2: T(l.x2), price2: l.y2, color: String(l.color), width: 2,
  });
  const drawn = (l: Ln) => !isNaN(l.y1) && !isNaN(l.y2);
  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {},
    // an object with an na coordinate is not drawn
    boxes: box.all().filter((b) => !isNaN(b.left) && !isNaN(b.top) && !isNaN(b.bottom) && !isNaN(b.right)).map((b) => ({
      time1: T(b.left), price1: b.top, time2: T(b.right), price2: b.bottom, bgColor: String(b.bgcolor), borderColor: String(b.border_color),
      ...(b.border_style === 'dotted' ? { borderStyle: 'dotted' as const } : {}),
    })),
    lines: line.all().filter(drawn).map(lineData),
    labels: label.all().map((l) => ({
      time: T(l.x), price: l.y, text: l.text ?? '', color: String(l.color), textColor: fg,
      style: l.style as 'label_down' | 'label_up', size: l.size as 'tiny' | 'small' | 'normal',
      textAlign: 'center' as const, tooltip: l.tooltip ?? '',
    })),
    linefills: linefill.all().filter((f) => drawn(f.line1) && drawn(f.line2))
      .map((f) => ({ line1: lineData(f.line1), line2: lineData(f.line2), color: vaBC })),
    alertCalls,
  };
}

export const SwingVolumeProfiles = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  hasAlertFunction,
};
