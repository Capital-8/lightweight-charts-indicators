/**
 * Pure Price Action ICT Tools [LuxAlgo]
 *
 * Price action tools computed on the last 2,000 bars only (calc_bars_count of the original):
 * - Swings: a short-term swing low (high) is a bar whose low (high) is below (above) the bar before and not above
 *   (below) the bar after. An intermediate-term swing is a short-term swing that is the lowest (highest) of three
 *   consecutive short-term swings; a long-term swing is the same among the intermediate-term swings. Every
 *   short-term swing gets a dot label; only the swings of the chosen term are coloured.
 * - Market structures: when the close goes through the last swing of the chosen term, a line from the swing to the
 *   bar, with the text 'MSS' when the direction changes, 'BOS' otherwise.
 * - Buyside & sellside liquidity: three or more zigzag highs (lows) within ATR(10) / margin of the new swing high
 *   (low) make a level: a line from the first of them, a dotted extension until the price goes through the zone,
 *   and a text.
 * - Liquidity voids: a gap between the low and the high of two bars back that is wider than ATR(200) times the
 *   threshold, drawn as 13 stacked boxes. Each slice is extended until the price reaches its middle.
 * - Order & breaker blocks: when the close goes above the last swing high, a bullish order block is made from the
 *   bar with the lowest low since the swing (the mirror for a bearish block). A block whose far side is broken
 *   becomes a breaker block; a breaker block that is broken again is removed. The last blocks are drawn on the last
 *   bar, with times as coordinates.
 *
 * Drawings are kept up to 500 lines, 500 labels and 500 boxes (the oldest are removed). Boxes that never get
 * coordinates count in the 500 but are not drawn: they are not in the result.
 *
 * Limits of the port:
 * - The right side of the order / breaker blocks is the current time (the clock of the computer), as the original
 *   does with timenow: the result changes with the call time.
 * - The tooltip of the swing labels is the price rounded to the symbol price tick in the original. Bars carry no
 *   symbol info: the port uses a tick of 0.01.
 * - The text of a liquidity void uses the chart foreground colour. The port has no chart theme and uses the
 *   foreground colour of a dark chart (#DBDBDB).
 *
 * Reference: "Pure Price Action ICT Tools [LuxAlgo]" by LuxAlgo
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © LuxAlgo
 */

import { ta, color, str, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import { barTime } from '../bar-time';
import type { BoxData, LabelData, LineDrawingData } from '../types';

type Term = 'Short Term' | 'Intermediate Term' | 'Long Term';
type OnOff = 'Enabled' | 'Disabled';

export interface PurePriceActionIctToolsInputs {
  /** Market Structures */
  msShow: boolean;
  /** Detection */
  msTerm: Term;
  /** Market Structure Labels */
  msTextT: OnOff;
  /** Line Style */
  msLineStyle: 'Solid' | 'Dashed' | 'Dotted';
  msBullColor: string;
  msBearColor: string;
  /** Order & Breaker Blocks */
  obbShow: boolean;
  /** Detection */
  obbTerm: Term;
  /** Last Bullish Blocks */
  obbBullLast: number;
  /** Last Bearish Blocks */
  obbBearLast: number;
  /** Use Candle Body */
  obbUseBodyT: OnOff;
  obbBullColor: string;
  obbBullBreakColor: string;
  obbBearColor: string;
  obbBearBreakColor: string;
  /** Buyside & Sellside Liquidity */
  liqBuySell: boolean;
  /** Detection */
  liqTerm: Term;
  /** Margin */
  liqMar: number;
  cLIQ_B: string;
  cLIQ_S: string;
  /** Visible Levels */
  visLiq: number;
  /** Liquidity Voids */
  lqVoid: boolean;
  /** Threshold Multiplier */
  lqThresh: number;
  /** Mode */
  lqMode: 'Present' | 'Historical';
  lqPeriod: number;
  cLQV_B: string;
  cLQV_S: string;
  /** Liquidity Void Labels */
  lqTextT: OnOff;
  /** Swing Highs/Lows */
  swShow: boolean;
  /** Detection */
  swTerm: Term;
  /** Label Size */
  swSwingsSZ: 'Tiny' | 'Small' | 'Normal';
  swBullColor: string;
  swBearColor: string;
}

export const defaultInputs: PurePriceActionIctToolsInputs = {
  msShow: true,
  msTerm: 'Intermediate Term',
  msTextT: 'Enabled',
  msLineStyle: 'Solid',
  msBullColor: '#089981',
  msBearColor: '#f23645',
  obbShow: true,
  obbTerm: 'Long Term',
  obbBullLast: 3,
  obbBearLast: 3,
  obbUseBodyT: 'Enabled',
  obbBullColor: 'rgba(8, 153, 129, 0.27)',
  obbBullBreakColor: 'rgba(242, 54, 69, 0.59)',
  obbBearColor: 'rgba(242, 54, 69, 0.27)',
  obbBearBreakColor: 'rgba(8, 153, 129, 0.59)',
  liqBuySell: true,
  liqTerm: 'Intermediate Term',
  liqMar: 6.9,
  cLIQ_B: '#089981',
  cLIQ_S: '#f23645',
  visLiq: 3,
  lqVoid: true,
  lqThresh: 0.75,
  lqMode: 'Present',
  lqPeriod: 360,
  cLQV_B: 'rgba(178, 181, 190, 0.25)',
  cLQV_S: 'rgba(93, 96, 107, 0.25)',
  lqTextT: 'Disabled',
  swShow: true,
  swTerm: 'Long Term',
  swSwingsSZ: 'Tiny',
  swBullColor: '#089981',
  swBearColor: '#f23645',
};

const msGroup = 'Market Structures';
const obbGroup = 'Order & Breaker Blocks';
const liqGroup = 'Buyside & Sellside Liquidity';
const liqGrp = 'Liquidity Voids';
const swGroup = 'Swing Highs/Lows';
const TERMS = ['Short Term', 'Intermediate Term', 'Long Term'];
const ON_OFF = ['Enabled', 'Disabled'];

export const inputConfig: InputConfig[] = [
  { id: 'msShow', type: 'bool', title: 'Market Structures', defval: true, group: msGroup },
  { id: 'msTerm', type: 'string', title: '  Detection', defval: 'Intermediate Term', options: TERMS, group: msGroup },
  { id: 'msTextT', type: 'string', title: '  Market Structure Labels', defval: 'Enabled', options: ON_OFF, group: msGroup },
  { id: 'msLineStyle', type: 'string', title: '  Line Style', defval: 'Solid', options: ['Solid', 'Dashed', 'Dotted'], group: msGroup },
  { id: 'msBullColor', type: 'color', title: '  Line Colors, Bullish', defval: '#089981', group: msGroup, inline: 'MS' },
  { id: 'msBearColor', type: 'color', title: 'Bearish', defval: '#f23645', group: msGroup, inline: 'MS' },
  { id: 'obbShow', type: 'bool', title: 'Order & Breaker Blocks', defval: true, group: obbGroup },
  { id: 'obbTerm', type: 'string', title: '  Detection', defval: 'Long Term', options: TERMS, group: obbGroup },
  { id: 'obbBullLast', type: 'int', title: '  Last Bullish Blocks', defval: 3, min: 0, group: obbGroup },
  { id: 'obbBearLast', type: 'int', title: '  Last Bearish Blocks', defval: 3, min: 0, group: obbGroup },
  { id: 'obbUseBodyT', type: 'string', title: '  Use Candle Body', defval: 'Enabled', options: ON_OFF, group: obbGroup },
  { id: 'obbBullColor', type: 'color', title: '  Bullish OB ', defval: 'rgba(8, 153, 129, 0.27)', inline: 'bullC', group: obbGroup },
  { id: 'obbBullBreakColor', type: 'color', title: 'Bullish Break ', defval: 'rgba(242, 54, 69, 0.59)', inline: 'bullC', group: obbGroup },
  { id: 'obbBearColor', type: 'color', title: '  Bearish OB', defval: 'rgba(242, 54, 69, 0.27)', inline: 'bearC', group: obbGroup },
  { id: 'obbBearBreakColor', type: 'color', title: 'Bearish Break', defval: 'rgba(8, 153, 129, 0.59)', inline: 'bearC', group: obbGroup },
  { id: 'liqBuySell', type: 'bool', title: 'Buyside & Sellside Liquidity', defval: true, group: liqGroup },
  { id: 'liqTerm', type: 'string', title: '  Detection', defval: 'Intermediate Term', options: TERMS, group: liqGroup },
  { id: 'liqMar', type: 'float', title: '  Margin', defval: 6.9, min: 4, max: 9, step: 0.1, group: liqGroup },
  { id: 'cLIQ_B', type: 'color', title: '  Line Colors, Buyside', defval: '#089981', inline: 'LIQ', group: liqGroup },
  { id: 'cLIQ_S', type: 'color', title: 'Sellside', defval: '#f23645', inline: 'LIQ', group: liqGroup },
  { id: 'visLiq', type: 'int', title: '  Visible Levels', defval: 3, min: 1, max: 50, group: liqGroup },
  { id: 'lqVoid', type: 'bool', title: 'Liquidity Voids', defval: true, group: liqGrp },
  { id: 'lqThresh', type: 'float', title: '  Threshold Multiplier', defval: 0.75, min: 0.05, step: 0.05, group: liqGrp },
  { id: 'lqMode', type: 'string', title: '  Mode', defval: 'Present', options: ['Present', 'Historical'], inline: 'MD', group: liqGrp },
  { id: 'lqPeriod', type: 'int', title: ' ', defval: 360, inline: 'MD', group: liqGrp },
  { id: 'cLQV_B', type: 'color', title: '  Bullish Zones', defval: 'rgba(178, 181, 190, 0.25)', inline: 'void', group: liqGrp },
  { id: 'cLQV_S', type: 'color', title: ' Bearish Zones', defval: 'rgba(93, 96, 107, 0.25)', inline: 'void', group: liqGrp },
  { id: 'lqTextT', type: 'string', title: '  Liquidity Void Labels', defval: 'Disabled', options: ON_OFF, group: liqGrp },
  { id: 'swShow', type: 'bool', title: 'Swing Highs/Lows', defval: true, group: swGroup },
  { id: 'swTerm', type: 'string', title: '  Detection', defval: 'Long Term', options: TERMS, group: swGroup },
  { id: 'swSwingsSZ', type: 'string', title: '  Label Size', defval: 'Tiny', options: ['Tiny', 'Small', 'Normal'], group: swGroup },
  { id: 'swBullColor', type: 'color', title: '  Label Colors, Bullish', defval: '#089981', group: swGroup, inline: 'MS' },
  { id: 'swBearColor', type: 'color', title: 'Bearish', defval: '#f23645', group: swGroup, inline: 'MS' },
];

export const plotConfig: PlotConfig[] = [];

export const metadata = {
  title: 'Pure Price Action ICT Tools [LuxAlgo]',
  shortTitle: 'LuxAlgo - Pure Price Action ICT Tools',
  overlay: true,
};

/** calc_bars_count: the script runs on the last 2,000 bars */
const CALC_BARS = 2000;
/** chart.fg_color of a dark chart (the port has no chart theme) */
const CHART_FG = '#DBDBDB';
/** syminfo.mintick is not available to the port (Bar has no symbol info) */
const MINTICK = 0.01;
/** max_lines_count, max_labels_count, max_boxes_count */
const MAX_COUNT = 500;
/** Size of the zigzag arrays */
const MAX_SIZE = 50;
const NA_COLOR = 'transparent';

/** Pine float comparisons: a > b only when a - b > 1e-10, a == b within 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const ge = (a: number, b: number) => a - b >= -EPS;
const le = (a: number, b: number) => b - a >= -EPS;
const eq = (a: number, b: number) => Math.abs(a - b) <= EPS;
const ne = (a: number, b: number) => Math.abs(a - b) > EPS;

interface Ln {
  x1: number; y1: number; x2: number; y2: number;
  /** xloc.bar_time: x values are times (ms); else bar indexes */
  byTime: boolean;
  color: string; style?: 'dashed' | 'dotted'; dead: boolean;
}
interface Bx {
  left: number; top: number; right: number; bottom: number;
  byTime: boolean;
  border: string; bg: string;
  text?: string; textSize?: 'tiny'; textColor?: string; hAlign?: 'left' | 'right'; vAlign?: 'top' | 'bottom';
  dead: boolean;
}
interface Lb {
  x: number; y: number; style: 'label_up' | 'label_down'; textColor: string; size: 'tiny' | 'small' | 'normal' | 'large';
  tooltip: string; dead: boolean;
}

/** Live drawings of one kind: above max + 5 objects the oldest are deleted until max remain */
class Live<T extends { dead: boolean }> {
  readonly list: T[] = [];
  add(o: T): T {
    this.list.push(o);
    if (this.list.length > MAX_COUNT + 5) for (const old of this.list.splice(0, this.list.length - MAX_COUNT)) old.dead = true;
    return o;
  }
  del(o: T | null | undefined): void {
    if (!o || o.dead) return;
    o.dead = true;
    this.list.splice(this.list.indexOf(o), 1);
  }
}

/** Pine types */
interface IctMs {
  lastPrice: number; midPrice: number; prevPrice: number;
  lastIndex: number; midIndex: number; prevIndex: number;
  lastLabel: Lb | null; midLabel: Lb | null; prevLabel: Lb | null;
  isCrossed: boolean;
}
interface Liq { bx: Bx | null; bxz: Bx | null; bxt: Bx | null; brL: boolean; ln: Ln | null; lne: Ln | null }
interface Ob { top: number; btm: number; loc: number; breaker: boolean; breakLoc: number }
interface Swing { y: number; x: number; crossed: boolean }

export function calculate(
  bars: Bar[],
  inputs: Partial<PurePriceActionIctToolsInputs> = {},
): IndicatorResult & { lines: LineDrawingData[]; boxes: BoxData[]; labels: LabelData[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const ms = n > 0 && bars[0].time >= 1e12;
  const tMs = bars.map((b) => (ms ? b.time : b.time * 1000));
  const start = Math.max(0, n - CALC_BARS);
  const view = bars.slice(start);
  const timenow = Date.now();

  const msText = cfg.msTextT === 'Enabled';
  const obbUseBody = cfg.obbUseBodyT === 'Enabled';
  const lqText = cfg.lqTextT === 'Enabled';
  const liqMar = 10 / cfg.liqMar;
  const { swShow, swTerm, swBullColor, swBearColor, visLiq } = cfg;
  const swSize = cfg.swSwingsSZ === 'Tiny' ? 'tiny' : cfg.swSwingsSZ === 'Small' ? 'small' : cfg.swSwingsSZ === 'Normal' ? 'normal' : 'large';
  const msStyle = cfg.msLineStyle === 'Dotted' ? 'dotted' : cfg.msLineStyle === 'Dashed' ? 'dashed' : undefined;
  const depth = cfg.obbTerm === 'Short Term' ? 1 : cfg.obbTerm === 'Intermediate Term' ? 2 : 3;
  const voidTextCss = String(color.new(CHART_FG, 25));

  const lines = new Live<Ln>();
  const boxes = new Live<Bx>();
  const labels = new Live<Lb>();
  const newLine = (x1: number, y1: number, x2: number, y2: number, byTime: boolean, css: string, style?: 'dashed' | 'dotted') =>
    lines.add({ x1, y1, x2, y2, byTime, color: css, style, dead: false });
  const newBox = (b: Omit<Bx, 'dead' | 'byTime'> & { byTime?: boolean }) => boxes.add({ byTime: false, ...b, dead: false });
  const live = <X extends { dead: boolean }>(o: X | null): o is X => o !== null && !o.dead;

  // History helpers: na before the first computed bar
  const H = (i: number) => (i >= start ? bars[i].high : NaN);
  const L = (i: number) => (i >= start ? bars[i].low : NaN);
  const C = (i: number) => (i >= start ? bars[i].close : NaN);
  const T = (i: number) => (i >= start ? tMs[i] : NaN);
  const MX = (i: number) => (i < start ? NaN : obbUseBody ? Math.max(bars[i].close, bars[i].open) : bars[i].high);
  const MN = (i: number) => (i < start ? NaN : obbUseBody ? Math.min(bars[i].close, bars[i].open) : bars[i].low);

  const atr = ta.atr(view, 10).toArray().map((v) => v ?? NaN);
  const atr200Arr = ta.atr(view, 200).toArray().map((v) => v ?? NaN);

  const ictms = (): IctMs => ({
    lastPrice: NaN, midPrice: NaN, prevPrice: NaN, lastIndex: NaN, midIndex: NaN, prevIndex: NaN,
    lastLabel: null, midLabel: null, prevLabel: null, isCrossed: false,
  });
  const stLow = ictms();
  const stHigh = ictms();
  const itLow = ictms();
  const itHigh = ictms();
  const ltLow = ictms();
  const ltHigh = ictms();
  const stMS = { type: 0 };
  const itMS = { type: 0 };
  const ltMS = { type: 0 };

  const queryPatterns = (lastPrice: number, midPrice: number, prevPrice: number, isSwingHigh: boolean) =>
    isSwingHigh ? lt(prevPrice, midPrice) && ge(midPrice, lastPrice) : gt(prevPrice, midPrice) && le(midPrice, lastPrice);
  const query = (s: IctMs, isSwingHigh: boolean) => queryPatterns(s.lastPrice, s.midPrice, s.prevPrice, isSwingHigh);
  const updatePattern = (s: IctMs, price: number, index: number) => {
    s.isCrossed = false;
    s.prevPrice = s.midPrice;
    s.midPrice = s.lastPrice;
    s.lastPrice = price;
    s.prevIndex = s.midIndex;
    s.midIndex = s.lastIndex;
    s.lastIndex = index;
    s.prevLabel = s.midLabel;
    s.midLabel = s.lastLabel;
  };
  const colour = (lb: Lb | null, css: string) => {
    if (!live(lb)) return;
    lb.size = swSize;
    lb.textColor = css;
  };

  // Previous bar values of the bool series (na on the first computed bar)
  let cITL1: boolean | null = null;
  let cITH1: boolean | null = null;
  let cLTL1: boolean | null = null;
  let cLTH1: boolean | null = null;

  // Buyside & sellside liquidity
  const zzD: number[] = new Array(MAX_SIZE).fill(0);
  const zzX: number[] = new Array(MAX_SIZE).fill(0);
  const zzY: number[] = new Array(MAX_SIZE).fill(NaN);
  const inOut = (d: number, x: number, y: number) => {
    zzD.unshift(d);
    zzX.unshift(x);
    zzY.unshift(y);
    zzD.pop();
    zzX.pop();
    zzY.pop();
  };
  const naLiq = (): Liq => ({ bx: null, bxz: null, bxt: null, brL: false, ln: null, lne: null });
  const bLiqB: Liq[] = [naLiq()];
  const bLiqS: Liq[] = [naLiq()];
  const bLiqV: Bx[] = [];
  let swingHigh1 = NaN;
  let swingLow1 = NaN;
  let bull1 = false;
  let bear1 = false;

  // Order & breaker blocks
  const fractalHigh: Swing[][] = [];
  const fractalLow: Swing[][] = [];
  const topSite: { level: Swing } = { level: { y: NaN, x: NaN, crossed: false } };
  const btmSite: { level: Swing } = { level: { y: NaN, x: NaN, crossed: false } };
  const detectSwings = (id: Swing[][], bull: boolean, site: { level: Swing }): Swing => {
    for (let k = 0; k < depth; k++) {
      const v = id[k];
      if (v.length !== 3) continue;
      const pivot = bull ? Math.max(v[0].y, v[1].y, v[2].y) : Math.min(v[0].y, v[1].y, v[2].y);
      if (!eq(pivot, v[1].y)) continue;
      if (k < depth - 1) {
        id[k + 1].unshift(v[1]);
        if (id[k + 1].length > 3) id[k + 1].pop();
      } else site.level = { y: v[1].y, x: v[1].x, crossed: false };
      v.pop();
      v.pop();
    }
    return site.level;
  };
  const bullishOb: Ob[] = [];
  const bearishOb: Ob[] = [];
  const bxOBB: Bx[] = [];
  const lnOBB: Ln[] = [];

  for (let i = start; i < n; i++) {
    const { open, high, low, close } = bars[i];

    // Swings
    if (queryPatterns(low, L(i - 1), L(i - 2), false)) {
      updatePattern(stLow, L(i - 1), i - 1);
      stLow.lastLabel = labels.add({
        x: stLow.lastIndex, y: stLow.lastPrice, style: 'label_up', textColor: swShow && swTerm === 'Short Term' ? swBearColor : NA_COLOR,
        size: swSize, tooltip: str.tostring(stLow.lastPrice, 'mintick', MINTICK), dead: false,
      });
    }
    if (queryPatterns(high, H(i - 1), H(i - 2), true)) {
      updatePattern(stHigh, H(i - 1), i - 1);
      stHigh.lastLabel = labels.add({
        x: i - 1, y: H(i - 1), style: 'label_down', textColor: swShow && swTerm === 'Short Term' ? swBullColor : NA_COLOR,
        size: swSize, tooltip: str.tostring(H(i - 1), 'mintick', MINTICK), dead: false,
      });
    }

    // `c and c != c[1]`: false while c[1] is na
    const cITL = query(stLow, false);
    if (cITL && cITL1 !== null && cITL !== cITL1) {
      updatePattern(itLow, stLow.midPrice, stLow.midIndex);
      itLow.lastLabel = stLow.midLabel;
      if (swShow && swTerm === 'Intermediate Term') colour(stLow.midLabel, swBearColor);
    }
    const cITH = query(stHigh, true);
    if (cITH && cITH1 !== null && cITH !== cITH1) {
      updatePattern(itHigh, stHigh.midPrice, stHigh.midIndex);
      itHigh.lastLabel = stHigh.midLabel;
      if (swShow && swTerm === 'Intermediate Term') colour(stHigh.midLabel, swBullColor);
    }
    const cLTL = query(itLow, false);
    if (cLTL && cLTL1 !== null && cLTL !== cLTL1) {
      ltLow.isCrossed = false;
      ltLow.lastPrice = itLow.midPrice;
      ltLow.lastIndex = itLow.midIndex;
      if (swShow && swTerm === 'Long Term') colour(itLow.midLabel, swBearColor);
    }
    const cLTH = query(itHigh, true);
    if (cLTH && cLTH1 !== null && cLTH !== cLTH1) {
      ltHigh.isCrossed = false;
      ltHigh.lastPrice = itHigh.midPrice;
      ltHigh.lastIndex = itHigh.midIndex;
      if (swShow && swTerm === 'Long Term') colour(itHigh.midLabel, swBullColor);
    }
    cITL1 = cITL;
    cITH1 = cITH;
    cLTL1 = cLTL;
    cLTH1 = cLTH;

    // Market structures
    const renderStructures = (s: IctMs, isBullish: boolean, structure: { type: number }, css: string) => {
      const condition = isBullish ? gt(close, s.lastPrice) : lt(close, s.lastPrice);
      if (!condition || s.isCrossed) return;
      s.isCrossed = true;
      newLine(s.lastIndex, s.lastPrice, i, s.lastPrice, false, css, msStyle);
      const css73 = String(color.new(css, 73));
      newBox({ left: i, top: s.lastPrice, right: i, bottom: s.lastPrice, border: css73, bg: css73 });
      if (msText) {
        newBox({
          left: s.lastIndex, top: s.lastPrice, right: i, bottom: s.lastPrice, border: NA_COLOR, bg: NA_COLOR,
          text: structure.type === (isBullish ? -1 : 1) ? 'MSS' : 'BOS', textSize: 'tiny', hAlign: 'left',
          vAlign: isBullish ? 'bottom' : 'top', textColor: String(color.new(css, 17)),
        });
      }
      structure.type = isBullish ? 1 : -1;
    };
    if (cfg.msShow) {
      const [lo, hi, structure] = cfg.msTerm === 'Short Term' ? [stLow, stHigh, stMS]
        : cfg.msTerm === 'Intermediate Term' ? [itLow, itHigh, itMS] : [ltLow, ltHigh, ltMS];
      renderStructures(lo, false, structure, cfg.msBearColor);
      renderStructures(hi, true, structure, cfg.msBullColor);
    }

    // Buyside & sellside liquidity
    const margin = atr[i - start] / liqMar;
    const [hiS, loS] = cfg.liqTerm === 'Short Term' ? [stHigh, stLow] : cfg.liqTerm === 'Intermediate Term' ? [itHigh, itLow] : [ltHigh, ltLow];
    const topLQ = cfg.liqBuySell ? { y: hiS.lastPrice, x: hiS.lastIndex } : { y: 0, x: 0 };
    const btmLQ = cfg.liqBuySell ? { y: loS.lastPrice, x: loS.lastIndex } : { y: 0, x: 0 };
    const swingHigh = topLQ.y;
    const swingLow = btmLQ.y;

    const liquidity = (side: 1 | -1, swing: number, x2: number, arr: Liq[], css: string) => {
      const dir = zzD[0];
      const y1 = zzY[0];
      if (side === 1 ? dir < 1 : dir > -1) inOut(side, x2, swing);
      else if (dir === side && (side === 1 ? gt(swing, y1) : lt(swing, y1))) {
        zzX[0] = x2;
        zzY[0] = swing;
      }
      let count = 0;
      let stP = 0;
      let stB = 0;
      let minP = 0;
      let maxP = 10e6;
      for (let k = 0; k < MAX_SIZE; k++) {
        if (zzD[k] !== side) continue;
        const y = zzY[k];
        if (side === 1 ? gt(y, swing + margin) : lt(y, swing - margin)) break;
        if (gt(y, swing - margin) && lt(y, swing + margin)) {
          count += 1;
          stB = zzX[k];
          stP = y;
          if (gt(y, minP)) minP = y;
          if (lt(y, maxP)) maxP = y;
        }
      }
      if (count <= 2) return;
      const getB = arr[0];
      const avg = (minP + maxP) / 2;
      if (live(getB.bx) && eq(stB, getB.bx.left)) {
        getB.bx.top = avg + margin;
        getB.bx.right = i + 10;
        getB.bx.bottom = avg - margin;
      } else {
        const bx = newBox({ left: stB, top: avg + margin, right: i + 10, bottom: avg - margin, border: NA_COLOR, bg: NA_COLOR });
        const bxz = newBox({ left: NaN, top: NaN, right: NaN, bottom: NaN, border: NA_COLOR, bg: NA_COLOR });
        const bxt = newBox({
          left: stB, top: stP, right: i + 10, bottom: stP, border: NA_COLOR, bg: NA_COLOR,
          text: side === 1 ? 'Buyside liquidity' : 'Sellside liquidity', textSize: 'tiny', hAlign: 'left',
          vAlign: side === 1 ? 'bottom' : 'top', textColor: String(color.new(css, 25)),
        });
        const ln = newLine(stB, stP, i - 1, stP, false, String(color.new(css, 0)));
        const lne = newLine(i - 1, stP, NaN, stP, false, String(color.new(css, 0)), 'dotted');
        arr.unshift({ bx, bxz, bxt, brL: false, ln, lne });
      }
      if (arr.length > visLiq) {
        const getLast = arr.pop()!;
        boxes.del(getLast.bx);
        boxes.del(getLast.bxz);
        boxes.del(getLast.bxt);
        lines.del(getLast.ln);
        lines.del(getLast.lne);
      }
    };
    // `x != x[1]` is false while x[1] is na
    if (gt(swingHigh, 0) && ne(swingHigh, swingHigh1)) liquidity(1, swingHigh, topLQ.x, bLiqB, cfg.cLIQ_B);
    if (gt(swingLow, 0) && ne(swingLow, swingLow1)) liquidity(-1, swingLow, btmLQ.x, bLiqS, cfg.cLIQ_S);
    swingHigh1 = swingHigh;
    swingLow1 = swingLow;

    for (const x of bLiqB) {
      if (x.brL) continue;
      if (live(x.lne)) x.lne.x2 = i;
      if (live(x.bx) && gt(high, x.bx.top)) x.brL = true;
    }
    for (const x of bLiqS) {
      if (x.brL) continue;
      if (live(x.lne)) x.lne.x2 = i;
      if (live(x.bx) && lt(low, x.bx.bottom)) x.brL = true;
    }

    // Liquidity voids
    const atr200 = atr200Arr[i - start] * cfg.lqThresh;
    const dispPeriod = cfg.lqMode === 'Present' ? n - 1 - i <= cfg.lqPeriod : true;
    let bull = false;
    let bear = false;
    if (cfg.lqVoid && dispPeriod) {
      bull = gt(low - H(i - 2), atr200) && gt(low, H(i - 2)) && gt(C(i - 1), H(i - 2));
      bear = gt(L(i - 2) - high, atr200) && lt(high, L(i - 2)) && lt(C(i - 1), L(i - 2));
      const slices = 13;
      const slice = (base: number, st: number, k: number, css: string, withText: boolean, vAlign: 'top' | 'bottom') => {
        bLiqV.push(newBox({
          left: i - 2, top: base + k * st, right: i, bottom: base + (k + 1) * st, border: NA_COLOR, bg: css,
          ...(withText ? { text: 'Liquidity Void   ', textSize: 'tiny' as const, hAlign: 'right' as const, vAlign, textColor: NA_COLOR } : {}),
        }));
      };
      if (bull) {
        if (bull1) {
          const st = Math.abs(low - L(i - 1)) / slices;
          for (let k = 0; k < slices; k++) slice(L(i - 1), st, k, cfg.cLQV_B, false, 'bottom');
        } else {
          const st = Math.abs(low - H(i - 2)) / slices;
          for (let k = 0; k < slices; k++) slice(H(i - 2), st, k, cfg.cLQV_B, lqText && k === 0, 'bottom');
        }
      }
      if (bear) {
        if (bear1) {
          const st = Math.abs(H(i - 1) - high) / slices;
          for (let k = 0; k < slices; k++) slice(high, st, k, cfg.cLQV_S, false, 'top');
        } else {
          const st = Math.abs(L(i - 2) - high) / slices;
          for (let k = 0; k < slices; k++) slice(high, st, k, cfg.cLQV_S, lqText && k === slices - 1, 'top');
        }
      }
    }
    // bull[1] / bear[1]: na when the block did not run on the previous bar
    bull1 = bull;
    bear1 = bear;

    for (let bn = bLiqV.length - 1; bn >= 0; bn--) {
      const cb = bLiqV[bn];
      // A deleted box gives na: the signs compare false and nothing is set
      if (cb.dead) continue;
      const ba = (cb.bottom + cb.top) / 2;
      const s1 = Math.sign(C(i - 1) - ba);
      const differs = (v: number) => !Number.isNaN(s1) && s1 !== Math.sign(v - ba);
      if (differs(close) || differs(low) || differs(high)) bLiqV.splice(bn, 1);
      else {
        cb.right = i + 1;
        if (i - cb.left > 21) cb.textColor = voidTextCss;
      }
    }

    // Order & breaker blocks
    if (i === start) {
      for (let k = 0; k < depth; k++) {
        fractalHigh.push([]);
        fractalLow.push([]);
      }
    }
    fractalHigh[0].unshift({ y: high, x: i, crossed: false });
    fractalLow[0].unshift({ y: low, x: i, crossed: false });
    if (fractalHigh[0].length > 3) fractalHigh[0].pop();
    if (fractalLow[0].length > 3) fractalLow[0].pop();
    const top = detectSwings(fractalHigh, true, topSite);
    const btm = detectSwings(fractalLow, false, btmSite);

    if (cfg.obbShow) {
      if (gt(close, top.y) && !top.crossed) {
        top.crossed = true;
        let minima = MX(i - 1);
        let maxima = MN(i - 1);
        let loc = T(i - 1);
        const last = i - top.x - 1;
        for (let k = 1; last >= 1 ? k <= last : k >= last; k += last >= 1 ? 1 : -1) {
          minima = Math.min(MN(i - k), minima);
          if (eq(minima, MN(i - k))) {
            maxima = MX(i - k);
            loc = T(i - k);
          }
        }
        bullishOb.unshift({ top: maxima, btm: minima, loc, breaker: false, breakLoc: NaN });
      }
      if (bullishOb.length > 100) bullishOb.pop();
      for (let k = bullishOb.length - 1; k >= 0; k--) {
        const element = bullishOb[k];
        if (!element.breaker) {
          if (lt(Math.min(close, open), element.btm)) {
            element.breaker = true;
            element.breakLoc = tMs[i];
          }
        } else if (gt(close, element.top)) bullishOb.splice(k, 1);
      }

      if (lt(close, btm.y) && !btm.crossed) {
        btm.crossed = true;
        let minima = MN(i - 1);
        let maxima = MX(i - 1);
        let loc = T(i - 1);
        const last = i - btm.x - 1;
        for (let k = 1; last >= 1 ? k <= last : k >= last; k += last >= 1 ? 1 : -1) {
          maxima = Math.max(MX(i - k), maxima);
          if (eq(maxima, MX(i - k))) {
            minima = MN(i - k);
            loc = T(i - k);
          }
        }
        bearishOb.unshift({ top: maxima, btm: minima, loc, breaker: false, breakLoc: NaN });
      }
      if (bearishOb.length > 100) bearishOb.pop();
      for (let k = bearishOb.length - 1; k >= 0; k--) {
        const element = bearishOb[k];
        if (!element.breaker) {
          if (gt(Math.max(close, open), element.top)) {
            element.breaker = true;
            element.breakLoc = tMs[i];
          }
        } else if (lt(close, element.btm)) bearishOb.splice(k, 1);
      }

      while (bxOBB.length > 0) boxes.del(bxOBB.shift());
      while (lnOBB.length > 0) lines.del(lnOBB.shift());

      if (i === n - 1) {
        const renderBlocks = (id: Ob, css: string, breakCss: string) => {
          const avg = (id.top + id.btm) / 2;
          if (id.breaker) {
            bxOBB.push(newBox({ left: id.loc, top: id.top, right: id.breakLoc, bottom: id.btm, byTime: true, border: css, bg: css }));
            lnOBB.push(newLine(id.breakLoc, id.top, timenow, id.top, true, breakCss));
            lnOBB.push(newLine(id.breakLoc, id.btm, timenow, id.btm, true, breakCss));
          } else {
            bxOBB.push(newBox({ left: id.loc, top: id.top, right: timenow, bottom: id.btm, byTime: true, border: NA_COLOR, bg: css }));
            lnOBB.push(newLine(id.loc, id.top, timenow, id.top, true, css));
            lnOBB.push(newLine(id.loc, id.btm, timenow, id.btm, true, css));
          }
          lnOBB.push(newLine(id.loc, avg, timenow, avg, true, breakCss, 'dotted'));
        };
        for (let k = 0; k < Math.min(cfg.obbBullLast, bullishOb.length); k++) renderBlocks(bullishOb[k], cfg.obbBullColor, cfg.obbBullBreakColor);
        for (let k = 0; k < Math.min(cfg.obbBearLast, bearishOb.length); k++) renderBlocks(bearishOb[k], cfg.obbBearColor, cfg.obbBearBreakColor);
      }
    }
  }

  // Output: a bar index after the last bar is a future bar time; a time coordinate is given as it is
  const X = (x: number, byTime: boolean) => (byTime ? (ms ? x : Math.floor(x / 1000)) : x < n ? bars[x].time : barTime(bars, x));
  const drawn = (...v: number[]) => v.every((x) => !Number.isNaN(x));
  const outLines: LineDrawingData[] = lines.list.filter((l) => drawn(l.x1, l.y1, l.x2, l.y2)).map((l) => ({
    time1: X(l.x1, l.byTime), price1: l.y1, time2: X(l.x2, l.byTime), price2: l.y2, color: l.color,
    ...(l.style ? { style: l.style } : {}),
  }));
  const outBoxes: BoxData[] = boxes.list.filter((b) => drawn(b.left, b.top, b.right, b.bottom)).map((b) => ({
    time1: X(b.left, b.byTime), price1: b.top, time2: X(b.right, b.byTime), price2: b.bottom, borderColor: b.border, bgColor: b.bg,
    ...(b.text !== undefined ? { text: b.text } : {}),
    ...(b.textSize ? { textSize: b.textSize } : {}),
    ...(b.textColor !== undefined ? { textColor: b.textColor } : {}),
    ...(b.hAlign ? { textHAlign: b.hAlign } : {}),
    ...(b.vAlign ? { textVAlign: b.vAlign } : {}),
  }));
  const outLabels: LabelData[] = labels.list.map((l) => ({
    time: bars[l.x].time, price: l.y, text: '⦁', color: NA_COLOR, style: l.style, textColor: l.textColor, size: l.size, tooltip: l.tooltip,
  }));

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {},
    lines: outLines,
    boxes: outBoxes,
    labels: outLabels,
  };
}

export const PurePriceActionIctTools = { calculate, metadata, defaultInputs, inputConfig, plotConfig };
