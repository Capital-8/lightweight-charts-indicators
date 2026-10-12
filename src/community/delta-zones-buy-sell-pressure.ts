/**
 * Delta Zones Buy/Sell Pressure
 *
 * Bar delta: (open - low) - (high - close) (or, when it is 0, (high - open) - (close - low)). A positive delta at or
 * above "Standard Deviation" times its standard deviation (over the positive deltas of "Standard Deviation Lookback"
 * bars) is buy pressure (triangle below the bar); a negative delta at or below the mirror threshold is sell pressure
 * (triangle above the bar). Each pressure bar draws a zone: from the low to the middle of the lower wick for buy
 * pressure, from the middle of the upper wick to the high for sell pressure. The latest "Max Boxes Visible" zones per
 * side are kept; they run to 5 bars after the current bar while no new zone appears (optionally deleted when a close
 * breaks them).
 *
 * Higher timeframe zones (off by default): the same delta on the bars of "Higher Timeframe" (strictly above the
 * chart timeframe), drawn when a pressure bar of that timeframe completes, with a label; the latest "Max HTF Boxes
 * Visible" per side are kept. The bars of that timeframe are built from the chart bars (periods from the UTC calendar
 * and the bars, or the exchange calendar of the chart context, see src/anchor-period.ts); a completed bar shows from
 * the chart bar that completes it (no lookahead).
 *
 * ZigZag (off by default): the zigzag of the ZigLib library by DevLucem (its function is ported below: a swing is
 * confirmed when the new extreme of "Depth" bars has held for "Backstep" bars, with a "Deviation" in ticks), drawn as
 * lines between the pivots, and an optional volume profile of each zigzag leg: the volume of each bar spread over
 * "Number of levels" price rows in proportion to the overlap of its range, the value area (the rows with the most
 * volume up to "Value Area %"), the point of control (POC, dashed line), low volume rows (LVN border) and a dotted
 * line at the start of the leg. The profile of the running leg is redrawn on each bar; the latest "Max finalized
 * profiles" are kept per side.
 *
 * Chart context (optional third argument of calculate): the symbol tick (`syminfo.mintick`, zigzag deviation), the
 * chart foreground colour (`chart.fg_color`, profile text and borders with "Auto-adapt"), the chart timeframe, and
 * the exchange time zone and session for the higher timeframe periods. Without it the port uses a tick of 0.01, the
 * dark theme colour #DBDBDB, the timeframe of the bar spacing and the UTC calendar.
 *
 * Reference: "Delta Zones Buy/Sell Pressure" by NathanTradeus
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Library: "ZigLib" by DevLucem (Mozilla Public License 2.0), function zigzag()
 */

import {
  ta, array, math, str, color, timeframe, mapToChart, Series, line, box, label, resetDrawings, setDrawingBar,
  drawingOutputs,
  type IndicatorResult, type InputConfig, type PlotConfig, type Bar, type Box, type Label, type Line,
} from 'oakscriptjs';
import type { BoxData, LabelData, LineDrawingData, MarkerData } from '../types';
import { mintickOf, foregroundColorOf, type ChartContext } from '../chart-context';
import { chartTimeframe, higherTimeframeBars } from '../anchor-period';

export interface DeltaZonesBuySellPressureInputs {
  stddevlevel: number;
  stddevlookback: number;
  showBuyBoxes: boolean;
  showSellBoxes: boolean;
  buyBoxColor: string;
  sellBoxColor: string;
  buyBoxBorderColor: string;
  sellBoxBorderColor: string;
  boxBorderWidth: number;
  maxCurrentBoxes: number;
  deleteOnClose: boolean;
  showHTFBoxes: boolean;
  htfTimeframe: string;
  hideCurrentOnHTF: boolean;
  htfBuyBorderColor: string;
  htfSellBorderColor: string;
  htfBuyFillColor: string;
  htfSellFillColor: string;
  htfBorderWidth: number;
  showHTFLabels: boolean;
  maxHTFBoxes: number;
  showLinesPA: boolean;
  depth: number;
  deviation: number;
  backstep: number;
  lineThickness: number;
  bullColor: string;
  bearColor: string;
  lineTransparency: number;
  repaintLines: boolean;
  extendLines: boolean;
  enableVolumeProfile: boolean;
  profileMode: 'Bullish only' | 'Bearish only' | 'Both';
  vpBins: number;
  valueAreaPct: number;
  maxBarWidthBars: number;
  showVolLabels: boolean;
  lvnThreshold: number;
  showPOC: boolean;
  showDivider: boolean;
  maxProfilesKeep: number;
  useAutoTheme: boolean;
  lvnBorderColor: string;
  normalBorderColor: string;
  labelTextColor: string;
  colorValueAreaBull: string;
  colorNormalBull: string;
  pocColorBull: string;
  dividerColorBull: string;
  colorValueAreaBear: string;
  colorNormalBear: string;
  pocColorBear: string;
  dividerColorBear: string;
  atrLength: number;
  atrMultiplier: number;
  minLegBars: number;
}

// Colour constants of Pine version 6 and the input defaults (input colours keep an alpha of 2 decimals)
const GREEN = '#4CAF50';
const RED = '#F23645';
const GRAY = '#787B86';
/** Default box text colour of a version 6 script (white) */
const BOX_TEXT = '#FFFFFF';
/** color.black */
const BLACK = '#363A45';

export const defaultInputs: DeltaZonesBuySellPressureInputs = {
  stddevlevel: 3.5,
  stddevlookback: 20,
  showBuyBoxes: true,
  showSellBoxes: true,
  buyBoxColor: 'rgba(76, 175, 80, 0.17)',
  sellBoxColor: 'rgba(242, 54, 69, 0.17)',
  buyBoxBorderColor: GREEN,
  sellBoxBorderColor: RED,
  boxBorderWidth: 1,
  maxCurrentBoxes: 3,
  deleteOnClose: false,
  showHTFBoxes: false,
  htfTimeframe: '60',
  hideCurrentOnHTF: true,
  htfBuyBorderColor: '#00BCD4',
  htfSellBorderColor: '#FF9800',
  htfBuyFillColor: 'rgba(0, 188, 212, 0.08)',
  htfSellFillColor: 'rgba(255, 152, 0, 0.08)',
  htfBorderWidth: 2,
  showHTFLabels: true,
  maxHTFBoxes: 2,
  showLinesPA: false,
  depth: 12,
  deviation: 5,
  backstep: 2,
  lineThickness: 1,
  bullColor: '#00E676',
  bearColor: RED,
  lineTransparency: 0,
  repaintLines: true,
  extendLines: false,
  enableVolumeProfile: false,
  profileMode: 'Bullish only',
  vpBins: 30,
  valueAreaPct: 0.7,
  maxBarWidthBars: 20,
  showVolLabels: false,
  lvnThreshold: 0.25,
  showPOC: true,
  showDivider: true,
  maxProfilesKeep: 5,
  useAutoTheme: true,
  lvnBorderColor: '#FF7043',
  normalBorderColor: 'rgba(120, 123, 134, 0.3)',
  labelTextColor: GRAY,
  colorValueAreaBull: 'rgba(38, 166, 154, 0.22)',
  colorNormalBull: 'rgba(92, 107, 192, 0.17)',
  pocColorBull: 'rgba(255, 179, 0, 0.95)',
  dividerColorBull: 'rgba(120, 123, 134, 0.4)',
  colorValueAreaBear: 'rgba(239, 83, 80, 0.22)',
  colorNormalBear: 'rgba(171, 71, 188, 0.17)',
  pocColorBear: 'rgba(255, 179, 0, 0.95)',
  dividerColorBear: 'rgba(120, 123, 134, 0.4)',
  atrLength: 14,
  atrMultiplier: 6,
  minLegBars: 8,
};

const G1 = '1. Delta Zones — General';
const G2 = '2. Delta Zones — Current TF Boxes';
const G3 = '3. HTF Boxes — Activation';
const G4 = '4. HTF Boxes — Appearance';
const G5A = '5A. ZigZag — Price Action';
const G5B = '5B. Volume Profile';
const G5C = '5C. Volume Profile — Bullish Colors';
const G5D = '5D. Volume Profile — Bearish Colors';
const G5E = '5E. Volume Profile — Impulse Size Filter (ATR)';
const d = defaultInputs;

export const inputConfig: InputConfig[] = [
  { id: 'stddevlevel', type: 'float', title: 'Standard Deviation', defval: d.stddevlevel, step: 0.5, group: G1 },
  { id: 'stddevlookback', type: 'int', title: 'Standard Deviation Lookback', defval: d.stddevlookback, group: G1 },
  { id: 'showBuyBoxes', type: 'bool', title: 'Show Buy Boxes', defval: d.showBuyBoxes, group: G2 },
  { id: 'showSellBoxes', type: 'bool', title: 'Show Sell Boxes', defval: d.showSellBoxes, group: G2 },
  { id: 'buyBoxColor', type: 'color', title: 'Buy Fill Color', defval: d.buyBoxColor, group: G2 },
  { id: 'sellBoxColor', type: 'color', title: 'Sell Fill Color', defval: d.sellBoxColor, group: G2 },
  { id: 'buyBoxBorderColor', type: 'color', title: 'Buy Border Color', defval: d.buyBoxBorderColor, group: G2 },
  { id: 'sellBoxBorderColor', type: 'color', title: 'Sell Border Color', defval: d.sellBoxBorderColor, group: G2 },
  { id: 'boxBorderWidth', type: 'int', title: 'Border Width', defval: d.boxBorderWidth, min: 1, max: 5, group: G2 },
  { id: 'maxCurrentBoxes', type: 'int', title: 'Max Boxes Visible', defval: d.maxCurrentBoxes, min: 1, max: 20, group: G2 },
  { id: 'deleteOnClose', type: 'bool', title: 'Delete Box When Price Breaks Zone', defval: d.deleteOnClose, group: G2 },
  { id: 'showHTFBoxes', type: 'bool', title: 'Enable HTF Boxes', defval: d.showHTFBoxes, group: G3 },
  { id: 'htfTimeframe', type: 'timeframe', title: 'Higher Timeframe', defval: d.htfTimeframe, group: G3 },
  { id: 'hideCurrentOnHTF', type: 'bool', title: 'Hide Current TF Boxes When HTF Active', defval: d.hideCurrentOnHTF, group: G3 },
  { id: 'htfBuyBorderColor', type: 'color', title: 'HTF Buy Border Color', defval: d.htfBuyBorderColor, group: G4 },
  { id: 'htfSellBorderColor', type: 'color', title: 'HTF Sell Border Color', defval: d.htfSellBorderColor, group: G4 },
  { id: 'htfBuyFillColor', type: 'color', title: 'HTF Buy Fill Color', defval: d.htfBuyFillColor, group: G4 },
  { id: 'htfSellFillColor', type: 'color', title: 'HTF Sell Fill Color', defval: d.htfSellFillColor, group: G4 },
  { id: 'htfBorderWidth', type: 'int', title: 'HTF Border Width', defval: d.htfBorderWidth, min: 1, max: 5, group: G4 },
  { id: 'showHTFLabels', type: 'bool', title: 'Show HTF Labels', defval: d.showHTFLabels, group: G4 },
  { id: 'maxHTFBoxes', type: 'int', title: 'Max HTF Boxes Visible', defval: d.maxHTFBoxes, min: 1, max: 10, group: G4 },
  { id: 'showLinesPA', type: 'bool', title: 'Enable ZigZag Lines', defval: d.showLinesPA, group: G5A,
    tooltip: 'Draws lines between ZigZag pivots. Tip: for a cleaner view, consider hiding the price candles (eye icon next to the symbol, or right-click → Visual Order) and leaving only the ZigZag lines visible.' },
  { id: 'depth', type: 'int', title: 'Depth', defval: d.depth, min: 1, group: G5A },
  { id: 'deviation', type: 'int', title: 'Deviation', defval: d.deviation, min: 1, group: G5A },
  { id: 'backstep', type: 'int', title: 'Backstep', defval: d.backstep, min: 2, group: G5A },
  { id: 'lineThickness', type: 'int', title: 'Line Thickness', defval: d.lineThickness, min: 1, max: 4, group: G5A },
  { id: 'bullColor', type: 'color', title: 'Bullish Color', defval: d.bullColor, group: G5A },
  { id: 'bearColor', type: 'color', title: 'Bearish Color', defval: d.bearColor, group: G5A },
  { id: 'lineTransparency', type: 'int', title: 'Line Transparency', defval: d.lineTransparency, group: G5A },
  { id: 'repaintLines', type: 'bool', title: 'Repaint Lines', defval: d.repaintLines, group: G5A },
  { id: 'extendLines', type: 'bool', title: 'Extend Lines', defval: d.extendLines, group: G5A },
  { id: 'enableVolumeProfile', type: 'bool', title: 'Enable Live Volume Profile', defval: d.enableVolumeProfile, group: G5B,
    tooltip: 'Profiles each ZigZag impulse with volume LIVE (while it\'s still developing, without waiting for the pivot to be confirmed). Independent of the lines toggle in section 5A.' },
  { id: 'profileMode', type: 'string', title: 'Profile which legs', defval: d.profileMode, options: ['Bullish only', 'Bearish only', 'Both'], group: G5B },
  { id: 'vpBins', type: 'int', title: 'Number of levels (rows)', defval: d.vpBins, min: 5, max: 60, group: G5B },
  { id: 'valueAreaPct', type: 'float', title: 'Value Area %', defval: d.valueAreaPct, min: 0.1, max: 0.95, step: 0.05, group: G5B },
  { id: 'maxBarWidthBars', type: 'int', title: 'Max bar length (bars)', defval: d.maxBarWidthBars, min: 5, group: G5B },
  { id: 'showVolLabels', type: 'bool', title: 'Show volume labels', defval: d.showVolLabels, group: G5B },
  { id: 'lvnThreshold', type: 'float', title: 'LVN threshold (fraction of max bin volume)', defval: d.lvnThreshold, min: 0.05, max: 0.9, step: 0.05, group: G5B },
  { id: 'showPOC', type: 'bool', title: 'Show POC line', defval: d.showPOC, group: G5B },
  { id: 'showDivider', type: 'bool', title: 'Show profile start divider', defval: d.showDivider, group: G5B },
  { id: 'maxProfilesKeep', type: 'int', title: 'Max finalized profiles to keep on chart (per side)', defval: d.maxProfilesKeep, min: 1, max: 15, group: G5B },
  { id: 'useAutoTheme', type: 'bool', title: 'Auto-adapt text/border/divider to chart theme', defval: d.useAutoTheme, group: G5B,
    tooltip: 'When on, volume labels, normal-level borders and the divider line use chart.fg_color — automatically black on a light chart background and white on a dark one. Turn off to use the fixed colors below instead.' },
  { id: 'lvnBorderColor', type: 'color', title: 'LVN border color', defval: d.lvnBorderColor, group: G5B },
  { id: 'normalBorderColor', type: 'color', title: 'Normal level border color (used when auto-adapt is off)', defval: d.normalBorderColor, group: G5B },
  { id: 'labelTextColor', type: 'color', title: 'Volume label text color (used when auto-adapt is off)', defval: d.labelTextColor, group: G5B },
  { id: 'colorValueAreaBull', type: 'color', title: 'Value Area color', defval: d.colorValueAreaBull, group: G5C },
  { id: 'colorNormalBull', type: 'color', title: 'Normal node color', defval: d.colorNormalBull, group: G5C },
  { id: 'pocColorBull', type: 'color', title: 'POC line color', defval: d.pocColorBull, group: G5C },
  { id: 'dividerColorBull', type: 'color', title: 'Profile start divider color (used when auto-adapt is off)', defval: d.dividerColorBull, group: G5C },
  { id: 'colorValueAreaBear', type: 'color', title: 'Value Area color', defval: d.colorValueAreaBear, group: G5D },
  { id: 'colorNormalBear', type: 'color', title: 'Normal node color', defval: d.colorNormalBear, group: G5D },
  { id: 'pocColorBear', type: 'color', title: 'POC line color', defval: d.pocColorBear, group: G5D },
  { id: 'dividerColorBear', type: 'color', title: 'Profile start divider color (used when auto-adapt is off)', defval: d.dividerColorBear, group: G5D },
  { id: 'atrLength', type: 'int', title: 'ATR Length', defval: d.atrLength, min: 1, group: G5E },
  { id: 'atrMultiplier', type: 'float', title: 'Minimum leg range (× ATR) to profile', defval: d.atrMultiplier, min: 0.1, step: 0.1, group: G5E },
  { id: 'minLegBars', type: 'int', title: 'Minimum leg duration (bars) to profile', defval: d.minLegBars, min: 1, group: G5E },
];

export const plotConfig: PlotConfig[] = [];

export const metadata = {
  title: 'Delta Zones Buy/Sell Pressure',
  shortTitle: 'Delta Zones Buy/Sell Pressure',
  overlay: true,
};

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const ge = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(b - a > EPS);
const le = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(a - b > EPS);
/** Pine `x != 0`: false when x is na or within 1e-10 of 0 */
const nonZero = (x: number) => !isNaN(x) && Math.abs(x) > EPS;

interface Delta {
  hup: boolean[];
  hdn: boolean[];
  buyTop: number[];
  buyBot: number[];
  sellTop: number[];
  sellBot: number[];
}

/** deltaHunting(lvl, lbk) on a series of bars */
function deltaHunting(bars: Bar[], lvl: number, lbk: number): Delta {
  const pos: number[] = [];
  const neg: number[] = [];
  for (const b of bars) {
    const upD = (b.open - b.low) - (b.high - b.close);
    const dnD = (b.high - b.open) - (b.close - b.low);
    const delta = nonZero(upD) ? upD : nonZero(dnD) ? dnD : NaN;
    pos.push(gt(delta, 0) ? delta : NaN);
    neg.push(lt(delta, 0) ? delta : NaN);
  }
  const A = (s: Series) => s.toArray().map((v) => (v === null || v === undefined ? NaN : v));
  const sdPos = A(ta.stdev(Series.fromArray(bars, pos), lbk));
  const sdNeg = A(ta.stdev(Series.fromArray(bars, neg), lbk));
  return {
    hup: pos.map((p, i) => ge(p, sdPos[i] * lvl)),
    hdn: neg.map((v, i) => le(v, sdNeg[i] * -lvl)),
    buyTop: bars.map((b) => (le(b.open, b.close) ? (b.open + b.low) / 2 : (b.close + b.low) / 2)),
    buyBot: bars.map((b) => b.low),
    sellTop: bars.map((b) => b.high),
    sellBot: bars.map((b) => (lt(b.open, b.close) ? (b.close + b.high) / 2 : (b.open + b.high) / 2)),
  };
}

/** chart.point: time in ms, bar index, price */
interface Point {
  time: number;
  index: number;
  price: number;
}

/**
 * ZigLib.zigzag(low, high, depth, deviation, backstep) of DevLucem: direction (1 up, -1 down) and the previous /
 * current pivot points of each bar.
 */
function zigzag(bars: Bar[], depth: number, deviation: number, backstep: number, mintick: number, ms: (t: number) => number):
  { direction: number[]; z1: Point[]; z2: Point[] } {
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => (v === null || v === undefined ? NaN : v));
  const hb = A(ta.highestbars(new Series(bars, (b) => b.high), depth));
  const lb = A(ta.lowestbars(new Series(bars, (b) => b.low), depth));
  const dev = deviation * mintick;
  // c[i]: _high[-ta.highestbars(depth)] - _high > deviation * mintick (x[na] reads the current bar)
  const cH: boolean[] = [];
  const cL: boolean[] = [];
  for (let i = 0; i < n; i++) {
    const hiAt = isNaN(hb[i]) ? bars[i].high : bars[i + hb[i]].high;
    const loAt = isNaN(lb[i]) ? bars[i].low : bars[i + lb[i]].low;
    cH.push(gt(hiAt - bars[i].high, dev));
    cL.push(gt(bars[i].low - loAt, dev));
  }
  // ta.barssince(cond): bars since the last bar where cond was true (na before)
  const barssince = (cond: (i: number) => boolean) => {
    const out: number[] = [];
    let last = -1;
    for (let i = 0; i < n; i++) {
      if (cond(i)) last = i;
      out.push(last < 0 ? NaN : i - last);
    }
    return out;
  };
  // not c[1]: c[1] is na on the first bar (an na bool is false in a condition)
  const hr = barssince((i) => i > 0 && !cH[i - 1]);
  const lr = barssince((i) => i > 0 && !cL[i - 1]);
  const bs = barssince((i) => !gt(hr[i], lr[i]));
  const direction = bs.map((v) => (ge(v, backstep) ? -1 : 1));

  const now = (i: number, price: number): Point => ({ time: ms(bars[i].time), index: i, price });
  let z: Point | null = null;
  let z1: Point | null = null;
  let z2: Point | null = null;
  const out1: Point[] = [];
  const out2: Point[] = [];
  for (let i = 0; i < n; i++) {
    const b = bars[i];
    if (i === 0) {
      z = now(0, b.low);
      z1 = now(0, b.low);
      z2 = now(0, b.high);
    }
    // ta.change(direction): na on the first bar
    if (i > 0 && direction[i] !== direction[i - 1]) {
      z1 = { ...z2! };
      z2 = { ...z! };
    }
    if (direction[i] > 0) {
      if (gt(b.high, z2!.price)) {
        z2 = now(i, b.high);
        z = now(i, b.low);
      }
      if (lt(b.low, z!.price)) z = now(i, b.low);
    }
    if (direction[i] < 0) {
      if (lt(b.low, z2!.price)) {
        z2 = now(i, b.low);
        z = now(i, b.high);
      }
      if (gt(b.high, z!.price)) z = now(i, b.high);
    }
    out1.push({ ...z1! });
    out2.push({ ...z2! });
  }
  return { direction, z1: out1, z2: out2 };
}

export function calculate(
  bars: Bar[],
  inputs: Partial<DeltaZonesBuySellPressureInputs> = {},
  chart?: ChartContext,
): IndicatorResult & { markers: MarkerData[]; boxes: BoxData[]; labels: LabelData[]; lines: LineDrawingData[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const ms = (t: number) => (t >= 1e12 ? t : t * 1000);
  const mintick = mintickOf(chart);
  const fg = foregroundColorOf(chart);
  const vpBins = cfg.vpBins;

  // timeframe validation: the HTF must be strictly greater than the chart timeframe
  const chartTf = chartTimeframe(bars, chart);
  const htfIsValid = chartTf !== '' && timeframe.in_seconds(cfg.htfTimeframe) > timeframe.in_seconds(chartTf);

  const cur = deltaHunting(bars, cfg.stddevlevel, cfg.stddevlookback);

  // request.security(syminfo.tickerid, htfTimeframe, deltaHunting(...), lookahead_off): the latest completed bar
  let htf: Delta | null = null;
  if (cfg.showHTFBoxes && htfIsValid) {
    const s = higherTimeframeBars(bars, cfg.htfTimeframe, chart);
    const h = deltaHunting(s.htf, cfg.stddevlevel, cfg.stddevlookback);
    const map = (values: number[]) => mapToChart(values, s.group, s.latest, false, false);
    const bool = (values: boolean[]) => map(values.map((v) => (v ? 1 : 0))).map((v) => v === 1);
    htf = {
      hup: bool(h.hup), hdn: bool(h.hdn), buyTop: map(h.buyTop), buyBot: map(h.buyBot), sellTop: map(h.sellTop),
      sellBot: map(h.sellBot),
    };
  }

  const zz = cfg.showLinesPA || cfg.enableVolumeProfile
    ? zigzag(bars, cfg.depth, cfg.deviation, cfg.backstep, mintick, ms) : null;
  const atrValue = cfg.enableVolumeProfile
    ? ta.atr(bars, cfg.atrLength).toArray().map((v) => (v === null || v === undefined ? NaN : v)) : [];

  resetDrawings({ line: 500, label: 500, box: 500 });

  const markers: MarkerData[] = [];
  const showCurrentBoxes = !(cfg.hideCurrentOnHTF && cfg.showHTFBoxes && htfIsValid);

  // pruneBoxes(boxArr, topArr, botArr, maxCount)
  const prune = (boxes: Box[], tops: number[], bots: number[], maxCount: number) => {
    while (boxes.length > maxCount) {
      box.delete(boxes.shift()!);
      tops.shift();
      bots.shift();
    }
  };
  const curBuyBoxes: Box[] = [];
  const curSellBoxes: Box[] = [];
  const curBuyTops: number[] = [];
  const curBuyBots: number[] = [];
  const curSellTops: number[] = [];
  const curSellBots: number[] = [];
  const htfBuyBoxes: Box[] = [];
  const htfSellBoxes: Box[] = [];
  const htfBuyTops: number[] = [];
  const htfBuyBots: number[] = [];
  const htfSellTops: number[] = [];
  const htfSellBots: number[] = [];

  // ZigZag lines
  let zzPrev: Line | null = null;

  // Volume profile state
  const profileBull = cfg.profileMode === 'Bullish only' || cfg.profileMode === 'Both';
  const profileBear = cfg.profileMode === 'Bearish only' || cfg.profileMode === 'Both';
  const effectiveNormalBorder = cfg.useAutoTheme ? String(color.new(fg, 70)) : cfg.normalBorderColor;
  const effectiveLabelColor = cfg.useAutoTheme ? fg : cfg.labelTextColor;
  const effectiveDividerColorBull = cfg.useAutoTheme ? String(color.new(fg, 60)) : cfg.dividerColorBull;
  const effectiveDividerColorBear = cfg.useAutoTheme ? String(color.new(fg, 60)) : cfg.dividerColorBear;

  /** One side of the profile: legs from a confirmed low (bull) or from a confirmed high (bear). */
  interface Side {
    startBar: number; // legStartBar / legTopBar (NaN = na)
    lo: number; // legLow / legLowRunning
    hi: number; // legHigh / legTop
    highArr: number[];
    lowArr: number[];
    volArr: number[];
    liveBars: Box[];
    liveLabels: Label[];
    livePoc: Line | null;
    liveDivider: Line | null;
    liveInitialized: boolean;
    vpBars: Box[];
    vpLabels: Label[];
    pocLines: Array<Line | null>;
    dividers: Array<Line | null>;
  }
  const newSide = (): Side => ({
    startBar: NaN, lo: NaN, hi: NaN, highArr: [], lowArr: [], volArr: [], liveBars: [], liveLabels: [], livePoc: null,
    liveDivider: null, liveInitialized: false, vpBars: [], vpLabels: [], pocLines: [], dividers: [],
  });
  const bull = newSide();
  const bear = newSide();

  /** Finalize the live profile of a side: its objects move to the kept pools, the oldest beyond the limit go. */
  const finalize = (s: Side) => {
    for (const b of s.liveBars) s.vpBars.push(b);
    for (const l of s.liveLabels) s.vpLabels.push(l);
    s.pocLines.push(s.livePoc);
    s.dividers.push(s.liveDivider);
    s.liveBars = [];
    s.liveLabels = [];
    s.livePoc = null;
    s.liveDivider = null;
    s.liveInitialized = false;
    while (s.pocLines.length > cfg.maxProfilesKeep) {
      for (let k = 0; k < vpBins; k++) {
        // array.shift on an empty array is a runtime error
        if (s.vpBars.length === 0) throw new Error('Cannot remove the first element of an empty array.');
        box.delete(s.vpBars.shift()!);
        if (s.vpLabels.length === 0) throw new Error('Cannot remove the first element of an empty array.');
        label.delete(s.vpLabels.shift()!);
      }
      const p = s.pocLines.shift();
      if (p) line.delete(p);
      const dv = s.dividers.shift();
      if (dv) line.delete(dv);
    }
  };
  /** Discard the live profile of a side (never finalized). */
  const discard = (s: Side) => {
    if (!s.liveInitialized) return;
    for (const b of s.liveBars) box.delete(b);
    for (const l of s.liveLabels) label.delete(l);
    s.liveBars = [];
    s.liveLabels = [];
    if (s.livePoc) line.delete(s.livePoc);
    if (s.liveDivider) line.delete(s.liveDivider);
    s.livePoc = null;
    s.liveDivider = null;
    s.liveInitialized = false;
  };
  /** Start a leg at the pivot point, with the bars from the pivot to the current bar (at most 480 back). */
  const start = (s: Side, i: number, p: Point, isBull: boolean) => {
    s.startBar = p.index;
    s.lo = p.price;
    s.hi = p.price;
    s.highArr = [];
    s.lowArr = [];
    s.volArr = [];
    const gap = Math.min(i - s.startBar, 480);
    for (let k = 0; k <= gap; k++) {
      const b = bars[i - (gap - k)];
      s.highArr.push(b.high);
      s.lowArr.push(b.low);
      s.volArr.push(b.volume ?? NaN);
      if (isBull) {
        if (gt(b.high, s.hi)) s.hi = b.high;
      } else if (lt(b.low, s.lo)) {
        s.lo = b.low;
      }
    }
  };
  /** computeProfile(rangeLow, rangeHigh, highArr, lowArr, volArr) */
  const computeProfile = (rangeLow: number, rangeHigh: number, s: Side) => {
    const span = rangeHigh - rangeLow;
    const nBars = s.volArr.length;
    const binVol: number[] = new Array<number>(vpBins).fill(0);
    for (let k = 0; k < nBars; k++) {
      const bh = s.highArr[k];
      const bl = s.lowArr[k];
      const bv = s.volArr[k];
      const barRange = bh - bl;
      for (let b = 0; b < vpBins; b++) {
        const binBot = rangeLow + span * b / vpBins;
        const binTop = rangeLow + span * (b + 1) / vpBins;
        const overlap = Math.max(0, Math.min(bh, binTop) - Math.max(bl, binBot));
        if (gt(barRange, 0) && gt(overlap, 0)) binVol[b] = binVol[b] + bv * (overlap / barRange);
      }
    }
    const maxVol = array.max(binVol);
    const inValueArea: boolean[] = new Array<boolean>(vpBins).fill(false);
    let pocBin = -1;
    if (gt(maxVol, 0)) {
      const totalVol = array.sum(binVol);
      const remaining = array.copy(binVol);
      let cum = 0;
      const target = totalVol * cfg.valueAreaPct;
      for (let k = 0; k < vpBins; k++) {
        if (ge(cum, target)) break;
        const mx = array.max(remaining);
        if (le(mx, 0)) break;
        const idx = array.indexof(remaining, mx);
        inValueArea[idx] = true;
        cum += mx;
        remaining[idx] = -1;
      }
      pocBin = array.indexof(binVol, maxVol);
    }
    return { binVol, inValueArea, maxVol, pocBin };
  };
  /** LIVE REDRAW of one side */
  const redraw = (s: Side, i: number, rangeLow: number, rangeHigh: number, isBull: boolean) => {
    const { binVol, inValueArea, maxVol, pocBin } = computeProfile(rangeLow, rangeHigh, s);
    if (!gt(maxVol, 0)) return;
    const span = rangeHigh - rangeLow;
    const colorVA = isBull ? cfg.colorValueAreaBull : cfg.colorValueAreaBear;
    const colorNormal = isBull ? cfg.colorNormalBull : cfg.colorNormalBear;
    const pocColor = cfg.showPOC ? (isBull ? cfg.pocColorBull : cfg.pocColorBear) : 'transparent';
    const dividerColor = cfg.showDivider ? (isBull ? effectiveDividerColorBull : effectiveDividerColorBear) : 'transparent';
    const x = s.startBar;
    const rows = (draw: (b: number, binTop: number, binBot: number, barLen: number, v: number, fillC: string,
      borderC: string, isLVN: boolean) => void) => {
      for (let b = 0; b < vpBins; b++) {
        const v = binVol[b];
        const binBot = rangeLow + span * b / vpBins;
        const binTop = rangeLow + span * (b + 1) / vpBins;
        const barLen = Math.max(1, math.round(v / maxVol * cfg.maxBarWidthBars));
        const isVA = inValueArea[b];
        const isLVN = lt(v, maxVol * cfg.lvnThreshold);
        draw(b, binTop, binBot, barLen, v, isVA ? colorVA : colorNormal, isLVN ? cfg.lvnBorderColor : effectiveNormalBorder, isLVN);
      }
    };
    const pocBot = rangeLow + span * pocBin / vpBins;
    const pocTop = rangeLow + span * (pocBin + 1) / vpBins;
    const pocMid = (pocBot + pocTop) / 2;
    if (!s.liveInitialized) {
      rows((_b, binTop, binBot, barLen, v, fillC, borderC, isLVN) => {
        s.liveBars.push(box.new(x, binTop, x + barLen, binBot, borderC, isLVN ? 2 : 1, undefined, undefined, undefined, fillC, undefined, undefined, BOX_TEXT));
        s.liveLabels.push(label.new(x, (binTop + binBot) / 2, cfg.showVolLabels ? str.tostring(v, 'volume') : '',
          'bar_index', 'price', 'transparent', 'label_left', effectiveLabelColor, 'small'));
      });
      s.livePoc = line.new(x, pocMid, i, pocMid, 'bar_index', undefined, pocColor, 'dashed', 2);
      s.liveDivider = line.new(x, rangeLow, x, rangeHigh, 'bar_index', undefined, dividerColor, 'dotted', 1);
      s.liveInitialized = true;
    } else {
      rows((b, binTop, binBot, barLen, v, fillC, borderC, isLVN) => {
        const bx = s.liveBars[b];
        box.set_top(bx, binTop);
        box.set_bottom(bx, binBot);
        box.set_right(bx, x + barLen);
        box.set_bgcolor(bx, fillC);
        box.set_border_color(bx, borderC);
        box.set_border_width(bx, isLVN ? 2 : 1);
        const lb = s.liveLabels[b];
        label.set_xy(lb, x, (binTop + binBot) / 2);
        label.set_text(lb, cfg.showVolLabels ? str.tostring(v, 'volume') : '');
        label.set_textcolor(lb, effectiveLabelColor);
      });
      if (s.livePoc) {
        line.set_y1(s.livePoc, pocMid);
        line.set_y2(s.livePoc, pocMid);
        line.set_x2(s.livePoc, i);
        line.set_color(s.livePoc, pocColor);
      }
      if (s.liveDivider) {
        // the bull divider runs to the running high, the bear divider to the running low
        line.set_y2(s.liveDivider, isBull ? rangeHigh : rangeLow);
        line.set_color(s.liveDivider, dividerColor);
      }
    }
  };

  for (let i = 0; i < n; i++) {
    setDrawingBar(i, i === n - 1);
    const b = bars[i];

    // BOXES — CURRENT TF
    if (cfg.showBuyBoxes && showCurrentBoxes) {
      if (cur.hup[i]) {
        curBuyBoxes.push(box.new(i, cur.buyTop[i], i + 5, cur.buyBot[i], cfg.buyBoxBorderColor, cfg.boxBorderWidth,
          undefined, undefined, undefined, cfg.buyBoxColor, undefined, undefined, BOX_TEXT));
        curBuyTops.push(cur.buyTop[i]);
        curBuyBots.push(cur.buyBot[i]);
        prune(curBuyBoxes, curBuyTops, curBuyBots, cfg.maxCurrentBoxes);
      } else if (curBuyBoxes.length > 0) {
        for (let k = curBuyBoxes.length - 1; k >= 0; k--) {
          if (cfg.deleteOnClose && lt(b.close, curBuyBots[k])) {
            box.delete(curBuyBoxes[k]);
            curBuyBoxes.splice(k, 1);
            curBuyTops.splice(k, 1);
            curBuyBots.splice(k, 1);
          } else {
            box.set_right(curBuyBoxes[k], i + 5);
          }
        }
      }
    }
    if (cfg.showSellBoxes && showCurrentBoxes) {
      if (cur.hdn[i]) {
        curSellBoxes.push(box.new(i, cur.sellTop[i], i + 5, cur.sellBot[i], cfg.sellBoxBorderColor, cfg.boxBorderWidth,
          undefined, undefined, undefined, cfg.sellBoxColor, undefined, undefined, BOX_TEXT));
        curSellTops.push(cur.sellTop[i]);
        curSellBots.push(cur.sellBot[i]);
        prune(curSellBoxes, curSellTops, curSellBots, cfg.maxCurrentBoxes);
      } else if (curSellBoxes.length > 0) {
        for (let k = curSellBoxes.length - 1; k >= 0; k--) {
          if (cfg.deleteOnClose && gt(b.close, curSellTops[k])) {
            box.delete(curSellBoxes[k]);
            curSellBoxes.splice(k, 1);
            curSellTops.splice(k, 1);
            curSellBots.splice(k, 1);
          } else {
            box.set_right(curSellBoxes[k], i + 5);
          }
        }
      }
    }

    // BOXES — HTF
    if (htf) {
      const htfBuyNew = cfg.showBuyBoxes && htf.hup[i] && !(i > 0 && htf.hup[i - 1]);
      const htfSellNew = cfg.showSellBoxes && htf.hdn[i] && !(i > 0 && htf.hdn[i - 1]);
      if (htfBuyNew) {
        htfBuyBoxes.push(box.new(i, htf.buyTop[i], i + 500, htf.buyBot[i], cfg.htfBuyBorderColor, cfg.htfBorderWidth,
          undefined, undefined, undefined, cfg.htfBuyFillColor, undefined, undefined, BOX_TEXT));
        htfBuyTops.push(htf.buyTop[i]);
        htfBuyBots.push(htf.buyBot[i]);
        prune(htfBuyBoxes, htfBuyTops, htfBuyBots, cfg.maxHTFBoxes);
        if (cfg.showHTFLabels) {
          label.new(i, htf.buyBot[i], '▲ ' + cfg.htfTimeframe + 'm BUY', 'bar_index', 'price', cfg.htfBuyBorderColor,
            'label_upper_right', BLACK, 'small');
        }
      }
      if (htfSellNew) {
        htfSellBoxes.push(box.new(i, htf.sellTop[i], i + 500, htf.sellBot[i], cfg.htfSellBorderColor, cfg.htfBorderWidth,
          undefined, undefined, undefined, cfg.htfSellFillColor, undefined, undefined, BOX_TEXT));
        htfSellTops.push(htf.sellTop[i]);
        htfSellBots.push(htf.sellBot[i]);
        prune(htfSellBoxes, htfSellTops, htfSellBots, cfg.maxHTFBoxes);
        if (cfg.showHTFLabels) {
          label.new(i, htf.sellTop[i], '▼ ' + cfg.htfTimeframe + 'm SELL', 'bar_index', 'price', cfg.htfSellBorderColor,
            'label_lower_right', BLACK, 'small');
        }
      }
    }
    // Manage active HTF boxes (the arrays are empty without HTF boxes)
    for (let k = htfBuyBoxes.length - 1; k >= 0; k--) {
      if (cfg.deleteOnClose && lt(b.close, htfBuyBots[k])) {
        box.delete(htfBuyBoxes[k]);
        htfBuyBoxes.splice(k, 1);
        htfBuyTops.splice(k, 1);
        htfBuyBots.splice(k, 1);
      } else {
        box.set_right(htfBuyBoxes[k], i + 1);
      }
    }
    for (let k = htfSellBoxes.length - 1; k >= 0; k--) {
      if (cfg.deleteOnClose && gt(b.close, htfSellTops[k])) {
        box.delete(htfSellBoxes[k]);
        htfSellBoxes.splice(k, 1);
        htfSellTops.splice(k, 1);
        htfSellBots.splice(k, 1);
      } else {
        box.set_right(htfSellBoxes[k], i + 1);
      }
    }

    // ARROWS
    if (cur.hup[i]) markers.push({ time: b.time, position: 'belowBar', shape: 'triangleUp', color: GREEN, size: 'tiny' });
    if (cur.hdn[i]) markers.push({ time: b.time, position: 'aboveBar', shape: 'triangleDown', color: RED, size: 'tiny' });

    if (!zz) continue;
    const dir = zz.direction[i];
    const dirPrev = i > 0 ? zz.direction[i - 1] : NaN;
    const z1 = zz.z1[i];
    const z2 = zz.z2[i];

    // SECTION 5A — ZIGZAG LINES (line zz = na on each bar; zz[1] is the line of the bar before)
    let zzLine: Line | null = null;
    if (cfg.showLinesPA) {
      const c = String(color.new(dir > 0 ? cfg.bullColor : cfg.bearColor, cfg.lineTransparency));
      if (cfg.repaintLines) {
        zzLine = line.new(z1.time, z1.price, z2.time, z2.price, 'bar_time', cfg.extendLines ? 'right' : 'none', c,
          'solid', cfg.lineThickness);
        if (dir === dirPrev) {
          if (zzPrev) line.delete(zzPrev);
        } else if (zzPrev) {
          line.set_extend(zzPrev, 'none');
        }
      } else if (i > 0 && dir !== dirPrev) {
        const p1 = zz.z1[i - 1];
        const p2 = zz.z2[i - 1];
        zzLine = line.new(p1.time, p1.price, p2.time, p2.price, 'bar_time', 'none', c, 'solid', cfg.lineThickness);
      }
    }
    zzPrev = zzLine;

    if (!cfg.enableVolumeProfile) continue;
    // PIVOT CONFIRMATION (ta.change(direction): false on the first bar)
    const changed = i > 0 && dir !== dirPrev;
    const justConfirmedLow = changed && dirPrev < 0;
    const justConfirmedHigh = changed && dirPrev > 0;
    if (changed) {
      const p = zz.z2[i - 1];
      if (dirPrev < 0) {
        // CONFIRMED LOW: finalize the bearish leg, start a bullish leg
        if (profileBear && bear.liveInitialized) finalize(bear);
        bear.startBar = NaN;
        discard(bull);
        if (profileBull) start(bull, i, p, true);
      } else {
        // CONFIRMED HIGH: finalize the bullish leg, start a bearish leg
        if (profileBull && bull.liveInitialized) finalize(bull);
        bull.startBar = NaN;
        discard(bear);
        if (profileBear) start(bear, i, p, false);
      }
    }

    // ONGOING DATA COLLECTION
    if (!isNaN(bull.startBar) && !justConfirmedLow) {
      bull.highArr.push(b.high);
      bull.lowArr.push(b.low);
      bull.volArr.push(b.volume ?? NaN);
      if (lt(bull.hi, b.high)) bull.hi = b.high;
    }
    if (!isNaN(bear.startBar) && !justConfirmedHigh) {
      bear.highArr.push(b.high);
      bear.lowArr.push(b.low);
      bear.volArr.push(b.volume ?? NaN);
      if (gt(bear.lo, b.low)) bear.lo = b.low;
    }

    // LIVE REDRAW — BULLISH LEG (low -> running high)
    const atr = atrValue[i];
    const bigBull = ge(bull.hi - bull.lo, cfg.atrMultiplier * atr);
    const longBull = bull.volArr.length >= cfg.minLegBars;
    if (!isNaN(bull.startBar) && gt(bull.hi - bull.lo, 0) && (bull.liveInitialized || (bigBull && longBull))) {
      redraw(bull, i, bull.lo, bull.hi, true);
    }
    // LIVE REDRAW — BEARISH LEG (high -> running low)
    const bigBear = ge(bear.hi - bear.lo, cfg.atrMultiplier * atr);
    const longBear = bear.volArr.length >= cfg.minLegBars;
    if (!isNaN(bear.startBar) && gt(bear.hi - bear.lo, 0) && (bear.liveInitialized || (bigBear && longBear))) {
      redraw(bear, i, bear.lo, bear.hi, false);
    }
  }
  setDrawingBar(null);
  const drawn = drawingOutputs(bars);
  resetDrawings();

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {},
    markers,
    boxes: drawn.boxes ?? [],
    labels: drawn.labels ?? [],
    lines: drawn.lines ?? [],
  };
}

export const DeltaZonesBuySellPressure = { calculate, metadata, defaultInputs, inputConfig, plotConfig };
