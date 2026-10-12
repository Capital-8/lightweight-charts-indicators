/**
 * Volume / Open Interest Footprint - By Leviathan
 *
 * A "footprint" bar of the visible range of the chart: the price range of the visible bars (highest high / lowest
 * low, read on the bar before) is cut into `Resolution` rows, and the volume of each visible bar is spread over the
 * rows it covers: the body volume (body / (2 * wicks + body) of the volume) goes to the up side of green bars and
 * the down side of red bars, the wick volume half to each side. With the source "Open Interest" the change of open
 * interest of the bar (rising: up side, falling: down side) is spread over its body. The rows are drawn as boxes
 * with the volume as text, coloured by the percent rank of the row: Up/Down (two columns), Total or Delta, to the
 * right of the last bar (Offset bars after it, Width bars wide) or from the start of the visible range; optional
 * boxes from the start of the visible range for the rows with a positive delta. The profile is drawn when the
 * visible range ends (on the bar after it) or on the last bar when it is visible (without that last bar).
 *
 * Other symbols: the open interest of the Binance perpetual of the base currency (BINANCE:<base>USDT.P_OI; daily
 * values on an intraday futures chart) and, with "Aggregate Volume", the volume of the selected symbols on the chart
 * timeframe (divided by their close with "RQC"). The base currency (syminfo.basecurrency) is `basecurrency` of the
 * chart context (see `basecurrencyOf` for a context without it).
 *
 * Reference: "Volume / Open Interest Footprint - By Leviathan" by LeviathanCapital
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © LeviathanCapital
 */

import { taCore, color, str, math, array, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { BoxData } from '../types';
import {
  symbolBarsOf, basecurrencyOf, symbolTypeOf, foregroundColorOf, visibleRangeOf, type ChartContext, type SymbolRequest,
} from '../chart-context';
import { otherSymbolChart, securityOtherValues } from '../other-symbol';
import { chartTimeframe, timeAfterLastBar } from '../anchor-period';

export interface VolumeOpenInterestFootprintByLeviathanInputs {
  /** 'Volume' or 'Open Interest' */
  voltype: string;
  /** Resolution (rows) */
  res: number;
  /** 'Total', 'Up/Down' or 'Delta' */
  ntype: string;
  /** Positioning: 'Right' or 'Left' */
  pos: string;
  /** Offset (bars) */
  st1: number;
  /** Width (bars) */
  wid: number;
  /** Positive delta levels */
  sr: boolean;
  /** Aggregate volume */
  aggr: boolean;
  /** Chart pair volume in the aggregation */
  A0: boolean;
  A1B: boolean;
  A2B: boolean;
  A3B: boolean;
  A4B: boolean;
  A5B: boolean;
  A6B: boolean;
  A7B: boolean;
  A8B: boolean;
  A1: string;
  A1t: boolean;
  A2: string;
  A2t: boolean;
  A3: string;
  A3t: boolean;
  A4: string;
  A4t: boolean;
  A5: string;
  A5t: boolean;
  A6: string;
  A6t: boolean;
  A7: string;
  A7t: boolean;
  A8: string;
  A8t: boolean;
  /** Node text size: 'Tiny', 'Small', 'Normal', 'Large' or 'Auto' */
  ndsize: string;
  /** Node text position: 'Left', 'Right' or 'Center' */
  ndpos: string;
  netcol1: string;
  netcol2: string;
  netcol3: string;
  netcol4: string;
  totcol1: string;
  totcol2: string;
  pdlcol: string;
  /** Total based colouring */
  hmopt: boolean;
}

export const defaultInputs: VolumeOpenInterestFootprintByLeviathanInputs = {
  voltype: 'Volume',
  res: 20,
  ntype: 'Up/Down',
  pos: 'Right',
  st1: 30,
  wid: 40,
  sr: false,
  aggr: false,
  A0: true,
  A1B: false,
  A2B: false,
  A3B: false,
  A4B: false,
  A5B: false,
  A6B: false,
  A7B: false,
  A8B: false,
  A1: 'BINANCE:BTCUSDTPERP',
  A1t: false,
  A2: 'BYBIT:BTCUSDT.P',
  A2t: false,
  A3: 'OKX:BTCUSDT.P',
  A3t: false,
  A4: 'BINGX:BTCUSDT',
  A4t: false,
  A5: 'BITGET:BTCUSDT.P',
  A5t: false,
  A6: 'PHEMEX:BTCUSDT.P',
  A6t: false,
  A7: 'MEXC:BTCUSDT.P',
  A7t: false,
  A8: 'WOONETWORK:BTCUSDT.P',
  A8t: false,
  ndsize: 'Small',
  ndpos: 'Center',
  netcol1: '#FF525200',
  netcol2: '#f7525f',
  netcol3: '#4CAF4F00',
  netcol4: '#81c784',
  totcol1: '#2195F300',
  totcol2: '#2962FF',
  pdlcol: '#2195F342',
  hmopt: true,
};

const t1 = 'Choose the data that will be analyzed and displayed in the bar';
const t2 = 'Resolution is the number of rows displayed in a bar. Increasing it will provide more granular data and vice versa. You might need to decrease the resolution when viewing larger ranges';
const t3 = 'Total (Total Volume or Total Open Interest Increase), Up/Down (Buy/Sell Volume or OI Increase/Decrease), Delta (Buy Volume - Sell Volume or OI Increase - OI Decrease)';
const t4 = 'This input moves the bar to the right for N number of bars';
const t5 = 'This input defines the width of the footprint bar (in number of bars)';
const t6 = 'Choose location where the bar is positioned (relative to the visible range)';
const gA = 'Volume Aggregation';
const gS = 'Additional Settings';

export const inputConfig: InputConfig[] = [
  { id: 'voltype', type: 'string', title: 'Source', defval: 'Volume', options: ['Volume', 'Open Interest'], tooltip: t1 },
  { id: 'res', type: 'int', title: 'Resolution', defval: 20, min: 5, tooltip: t2 },
  { id: 'ntype', type: 'string', title: 'Type', defval: 'Up/Down', options: ['Total', 'Up/Down', 'Delta'], tooltip: t3 },
  { id: 'pos', type: 'string', title: 'Positioning', defval: 'Right', options: ['Right', 'Left'], tooltip: t6 },
  { id: 'st1', type: 'int', title: 'Offset', defval: 30, tooltip: t4 },
  { id: 'wid', type: 'int', title: 'Width', defval: 40, tooltip: t5 },
  { id: 'sr', type: 'bool', title: 'Positive Delta Levels', defval: false },
  { id: 'aggr', type: 'bool', title: 'Aggregate Volume', defval: false, group: gA },
  { id: 'A0', type: 'bool', title: '   CHART PAIR', defval: true, group: gA },
  { id: 'A1B', type: 'bool', title: '', defval: false, inline: 'a1', group: gA },
  { id: 'A2B', type: 'bool', title: '', defval: false, inline: 'a2', group: gA },
  { id: 'A3B', type: 'bool', title: '', defval: false, inline: 'a3', group: gA },
  { id: 'A4B', type: 'bool', title: '', defval: false, inline: 'a4', group: gA },
  { id: 'A5B', type: 'bool', title: '', defval: false, inline: 'a5', group: gA },
  { id: 'A6B', type: 'bool', title: '', defval: false, inline: 'a6', group: gA },
  { id: 'A7B', type: 'bool', title: '', defval: false, inline: 'a7', group: gA },
  { id: 'A8B', type: 'bool', title: '', defval: false, inline: 'a8', group: gA },
  // input.symbol: a ticker id ("EXCHANGE:SYMBOL")
  { id: 'A1', type: 'string', title: '', defval: 'BINANCE:BTCUSDTPERP', inline: 'a1', group: gA },
  { id: 'A1t', type: 'bool', title: 'RQC', defval: false, inline: 'a1', group: gA },
  { id: 'A2', type: 'string', title: '', defval: 'BYBIT:BTCUSDT.P', inline: 'a2', group: gA },
  { id: 'A2t', type: 'bool', title: 'RQC', defval: false, inline: 'a2', group: gA },
  { id: 'A3', type: 'string', title: '', defval: 'OKX:BTCUSDT.P', inline: 'a3', group: gA },
  { id: 'A3t', type: 'bool', title: 'RQC', defval: false, inline: 'a3', group: gA },
  { id: 'A4', type: 'string', title: '', defval: 'BINGX:BTCUSDT', inline: 'a4', group: gA },
  { id: 'A4t', type: 'bool', title: 'RQC', defval: false, inline: 'a4', group: gA },
  { id: 'A5', type: 'string', title: '', defval: 'BITGET:BTCUSDT.P', inline: 'a5', group: gA },
  { id: 'A5t', type: 'bool', title: 'RQC', defval: false, inline: 'a5', group: gA },
  { id: 'A6', type: 'string', title: '', defval: 'PHEMEX:BTCUSDT.P', inline: 'a6', group: gA },
  { id: 'A6t', type: 'bool', title: 'RQC', defval: false, inline: 'a6', group: gA },
  { id: 'A7', type: 'string', title: '', defval: 'MEXC:BTCUSDT.P', inline: 'a7', group: gA },
  { id: 'A7t', type: 'bool', title: 'RQC', defval: false, inline: 'a7', group: gA },
  { id: 'A8', type: 'string', title: '', defval: 'WOONETWORK:BTCUSDT.P', inline: 'a8', group: gA },
  { id: 'A8t', type: 'bool', title: 'RQC', defval: false, inline: 'a8', group: gA },
  { id: 'ndsize', type: 'string', title: 'Node Text Size', defval: 'Small', options: ['Tiny', 'Small', 'Normal', 'Large', 'Auto'], group: gS },
  { id: 'ndpos', type: 'string', title: 'Node Text Position', defval: 'Center', options: ['Left', 'Right', 'Center'], group: gS },
  { id: 'netcol1', type: 'color', title: 'Negative Cold/Hot', defval: '#FF525200', inline: 'n', group: gS },
  { id: 'netcol2', type: 'color', title: '', defval: '#f7525f', inline: 'n', group: gS },
  { id: 'netcol3', type: 'color', title: 'Positive Cold/Hot ', defval: '#4CAF4F00', inline: 'p', group: gS },
  { id: 'netcol4', type: 'color', title: '', defval: '#81c784', inline: 'p', group: gS },
  { id: 'totcol1', type: 'color', title: 'Total Cold/Hot    ', defval: '#2195F300', inline: 't', group: gS },
  { id: 'totcol2', type: 'color', title: '', defval: '#2962FF', inline: 't', group: gS },
  { id: 'pdlcol', type: 'color', title: 'Positive Delta Color', defval: '#2195F342', group: gS },
  { id: 'hmopt', type: 'bool', title: 'Total Based Coloring', defval: true, group: gS },
];

export const plotConfig: PlotConfig[] = [];

export const metadata = {
  title: 'Volume / Open Interest Footprint - By Leviathan',
  shortTitle: 'Volume / OI Footprint - By Leviathan',
  overlay: true,
};

/** The footprint is the profile of the visible bars: calculate again when the user scrolls or zooms */
export const usesVisibleRange = true;

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const nz = (x: number) => (Number.isFinite(x) ? x : 0);

type Cfg = VolumeOpenInterestFootprintByLeviathanInputs;
const AGGREGATED = [1, 2, 3, 4, 5, 6, 7, 8] as const;

/** The other symbols the inputs need: the open interest (source "Open Interest") and the aggregated symbols */
function requests(cfg: Cfg, chartTf: string, chart?: ChartContext): Array<SymbolRequest & { k: number }> {
  const out: Array<SymbolRequest & { k: number }> = [];
  if (cfg.voltype === 'Open Interest') {
    // timeframe = syminfo.type == "futures" and timeframe.isintraday ? "1D" : timeframe.period
    const intraday = chartTf !== '' && !/[DWM]$/.test(chartTf);
    const tf = symbolTypeOf(chart) === 'futures' && intraday ? '1D' : chartTf;
    out.push({ symbol: `BINANCE:${basecurrencyOf(chart)}USDT.P_OI`, timeframe: tf, k: 0 });
  }
  if (cfg.aggr) {
    for (const k of AGGREGATED) {
      if (cfg[`A${k}B`]) out.push({ symbol: cfg[`A${k}`], timeframe: chartTf, k });
    }
  }
  return out;
}

/**
 * Bars of other symbols the indicator reads: the open interest symbol with the source "Open Interest" (an app gives
 * an empty array for a symbol that does not exist: ignore_invalid_symbol), the selected symbols with "Aggregate
 * Volume", on the chart timeframe.
 */
export function requiredSymbols(inputs: Partial<Cfg> = {}, chart?: ChartContext): SymbolRequest[] {
  return requests({ ...defaultInputs, ...inputs }, chartTimeframe([], chart), chart).map(({ symbol, timeframe }) => ({ symbol, timeframe }));
}

const SIZES: Record<string, 'tiny' | 'small' | 'normal' | 'large' | 'auto'> = {
  Tiny: 'tiny', Small: 'small', Normal: 'normal', Large: 'large', Auto: 'auto',
};
const ALIGNS: Record<string, 'left' | 'right' | 'center'> = { Left: 'left', Right: 'right', Center: 'center' };

export function calculate(
  bars: Bar[],
  inputs: Partial<Cfg> = {},
  chart?: ChartContext,
): IndicatorResult & { boxes: BoxData[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const result = (boxes: BoxData[]) => ({
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {},
    boxes,
  });
  if (n === 0) return result([]);
  const resolution = Math.trunc(cfg.res);
  const toMs = chart?.timeUnit === 'ms' ? 1 : 1000;

  // other symbols
  const chartTf = chartTimeframe(bars, chart);
  const reqs = requests(cfg, chartTf, chart);
  const other = symbolBarsOf(reqs.map(({ symbol, timeframe }) => ({ symbol, timeframe })), chart);
  let deltaOi: number[] = new Array<number>(n).fill(NaN);
  const aggVol: number[][] = [];
  reqs.forEach((r, j) => {
    const ob = other[j];
    if (r.k === 0) {
      // request.security(openInterestTicker, timeframe, close - close[1], ignore_invalid_symbol = true)
      deltaOi = securityOtherValues(bars, ob, r.timeframe === chartTf ? '' : r.timeframe,
        ob.map((x, i) => (i > 0 ? x.close - ob[i - 1].close : NaN)), otherSymbolChart(bars, chart), { other: chart?.symbolInfo?.(r.symbol) });
    } else {
      // request.security(Ak, timeframe.period, Akt ? volume / close : volume)
      const rqc = cfg[`A${r.k as (typeof AGGREGATED)[number]}t`];
      aggVol.push(securityOtherValues(bars, ob, '', ob.map((x) => (rqc ? (x.volume ?? NaN) / x.close : (x.volume ?? NaN))),
        otherSymbolChart(bars, chart), { other: chart?.symbolInfo?.(r.symbol) }));
    }
  });
  // data = aggr ? (A0 ? volume : 0) + A1vol + ... : volume; vol(): deltaOi with the source "Open Interest"
  const dV = bars.map((b, i) => {
    if (cfg.voltype === 'Open Interest') return deltaOi[i];
    if (!cfg.aggr) return b.volume ?? NaN;
    let data = cfg.A0 ? (b.volume ?? NaN) : 0;
    for (const v of aggVol) data = data + v[i];
    return data;
  });

  // visible range: chart.left_visible_bar_time / chart.right_visible_bar_time (ms)
  const { leftTime: startTime, rightTime: endTime } = visibleRangeOf(bars, chart);
  const timeMs = (i: number) => bars[i].time * toMs;
  const inZoneArr = bars.map((_, i) => timeMs(i) >= startTime && timeMs(i) <= endTime);
  // barsInSession := inZone ? barsInSession + 1 : barsInSession; profHigh = ta.highest(high, barsInSession + 1)[1]
  const lengths: number[] = [];
  let count = 0;
  for (let i = 0; i < n; i++) {
    if (inZoneArr[i]) count++;
    lengths.push(count + 1);
  }
  const highest = Array.from(taCore.highest(bars.map((b) => b.high), lengths) as ArrayLike<number>, (v) => v ?? NaN);
  const lowest = Array.from(taCore.lowest(bars.map((b) => b.low), lengths) as ArrayLike<number>, (v) => v ?? NaN);

  const vpGreen = new Array<number>(resolution).fill(0);
  const vpRed = new Array<number>(resolution).fill(0);
  const vpDelta = new Array<number>(resolution).fill(0);
  const vpTotal = new Array<number>(resolution).fill(0);
  const zoneBounds = new Array<number>(resolution).fill(0);
  const ltf: Array<[number, number, number, number, number]> = []; // open, high, low, close, volume of the zone bars

  // get_vol(y11, y12, y21, y22, height, vol): the part of vol on the overlap of the two ranges
  const getVol = (y11: number, y12: number, y21: number, y22: number, height: number, vol: number) =>
    nz((Math.max(Math.min(Math.max(y11, y12), Math.max(y21, y22)) - Math.max(Math.min(y11, y12), Math.min(y21, y22)), 0) * vol) / height);
  const profileAdd = (o: number, h: number, l: number, c: number, v: number, g: number) => {
    for (let i = 0; i <= vpGreen.length - 1; i++) {
      const zoneTop = zoneBounds[i];
      const zoneBot = zoneTop - g;
      const bodyTop = Math.max(c, o);
      const bodyBot = Math.min(c, o);
      const itsgreen = !lt(c, o);
      const topwick = h - bodyTop;
      const bottomwick = bodyBot - l;
      const body = bodyTop - bodyBot;
      const bodyvol = (body * v) / (2 * topwick + 2 * bottomwick + body);
      const topwickvol = (2 * topwick * v) / (2 * topwick + 2 * bottomwick + body);
      const bottomwickvol = (2 * bottomwick * v) / (2 * topwick + 2 * bottomwick + body);
      if (cfg.voltype === 'Volume') {
        const wicks = getVol(zoneBot, zoneTop, bodyTop, h, topwick, topwickvol) / 2 + getVol(zoneBot, zoneTop, bodyBot, l, bottomwick, bottomwickvol) / 2;
        vpGreen[i] = vpGreen[i] + (itsgreen ? getVol(zoneBot, zoneTop, bodyBot, bodyTop, body, bodyvol) : 0) + wicks;
        vpRed[i] = vpRed[i] + (itsgreen ? 0 : getVol(zoneBot, zoneTop, bodyBot, bodyTop, body, bodyvol)) + wicks;
        vpDelta[i] = vpGreen[i] - vpRed[i];
        vpTotal[i] = vpGreen[i] + vpRed[i];
      } else if (cfg.voltype === 'Open Interest') {
        if (gt(v, 0)) {
          vpGreen[i] = vpGreen[i] + getVol(zoneBot, zoneTop, bodyBot, bodyTop, body, v);
          vpDelta[i] = vpGreen[i] - vpRed[i];
          vpTotal[i] = vpGreen[i];
        }
        if (lt(v, 0)) vpRed[i] = vpRed[i] + getVol(zoneBot, zoneTop, bodyBot, bodyTop, body, -v);
      }
    }
  };

  const fg = foregroundColorOf(chart);
  const textSize = SIZES[cfg.ndsize];
  const textHAlign = ALIGNS[cfg.ndpos];
  const lastIndex = n - 1;
  /** Time of bar index x (after the last bar: the times of the following bars) */
  const T = (x: number) => (x <= lastIndex ? bars[Math.max(x, 0)].time : timeAfterLastBar(bars, x - lastIndex, chart));
  let profileBoxes: BoxData[] = [];

  let inZonePrev = false;
  let zoneStartIndex = 0;
  let zoneStart = 0;
  for (let i = 0; i < n; i++) {
    const inZone = inZoneArr[i];
    const newSession = inZone && !inZonePrev;
    const endSession = !inZone && inZonePrev;
    if (newSession) zoneStartIndex = i;
    const lookback = i - zoneStart;
    const profHigh = i > 0 ? highest[i - 1] : NaN;
    const profLow = i > 0 ? lowest[i - 1] : NaN;
    const isLast = i === lastIndex;
    const update = endSession || (isLast && inZone);
    // st = chart.right_visible_bar_time == time or pos == 'Left' ? st1 : -2 * wid
    const st = timeMs(i) === endTime || cfg.pos === 'Left' ? cfg.st1 : -2 * cfg.wid;

    // calcSession(update)
    vpGreen.fill(0);
    vpRed.fill(0);
    vpDelta.fill(0);
    if (i > lookback && update) {
      const gap = (profHigh - profLow) / resolution;
      for (let r = 0; r <= resolution - 1; r++) zoneBounds[r] = profHigh - gap * r;
      for (const [o, h, l, c, v] of ltf) profileAdd(o, h, l, c, v, gap);
    }

    // drawNewZone(update)
    if (update && gt(array.sum(vpGreen) + array.sum(vpRed), 0)) {
      const gap = (profHigh - profLow) / resolution;
      const leftMax = zoneStartIndex;
      profileBoxes = [];
      const node = (left: number, top: number, right: number, bottom: number, col: string, text: string) => {
        profileBoxes.push({
          time1: T(left), price1: top, time2: T(right), price2: bottom, bgColor: col, borderWidth: 0, text,
          textSize, textColor: fg, textHAlign,
        });
      };
      for (let r = 0; r <= vpRed.length - 1; r++) {
        const vrpct = array.percentrank(vpGreen, r) / 100;
        const vgpct = array.percentrank(vpRed, r) / 100;
        const dpct = array.percentrank(vpDelta, r) / 100;
        const tpct = array.percentrank(vpTotal, r) / 100;
        const rcol = color.from_gradient(cfg.hmopt ? vrpct : tpct, 0, 1, cfg.netcol1, cfg.netcol2);
        const gcol = color.from_gradient(cfg.hmopt ? vgpct : tpct, 0, 1, cfg.netcol3, cfg.netcol4);
        const dgcol = color.from_gradient(dpct, 0, 1, cfg.netcol3, cfg.netcol4);
        const drcol = color.from_gradient(dpct, 0.1, 1, cfg.netcol2, cfg.netcol1);
        const upvol = math.round(vpGreen[r], 0);
        const downvol = math.round(vpRed[r], 0);
        const delta = upvol - downvol;
        const totvol = str.tostring(cfg.voltype === 'Volume' ? upvol + downvol : upvol, 'volume');
        const totvolcol = color.from_gradient(vrpct, 0, 1, cfg.totcol1, cfg.totcol2);
        const deltavol = str.tostring(upvol - downvol, 'volume');
        const gvol = str.tostring(upvol, 'volume');
        const rvol = str.tostring(downvol, 'volume');
        const right = cfg.pos === 'Right';
        const base = right ? i : Math.trunc(leftMax);
        const top = zoneBounds[r] - 0;
        const bottom = zoneBounds[r] - gap + 0;
        const positive = gt(delta, 0) && cfg.sr;
        if (cfg.ntype === 'Total') {
          node(base + st, top, base + (st + cfg.wid), bottom, totvolcol, totvol);
          if (positive) node(right ? Math.trunc(leftMax) + st : base + (st + cfg.wid), top, i + st, bottom, cfg.pdlcol, '');
        }
        if (cfg.ntype === 'Up/Down') {
          node(base + st, top, base + (st + cfg.wid), bottom, rcol, rvol);
          node(base + (st + cfg.wid), top, base + (st + cfg.wid * 2), bottom, gcol, gvol);
          if (positive) node(right ? Math.trunc(leftMax) + st : base + (st + cfg.wid * 2), top, i + st, bottom, cfg.pdlcol, '');
        }
        if (cfg.ntype === 'Delta') {
          node(base + st, top, base + (st + cfg.wid), bottom, gt(delta, 0) ? dgcol : drcol, deltavol);
          if (positive) node(right ? Math.trunc(leftMax) + st : base + (st + cfg.wid), top, i + st, bottom, cfg.pdlcol, '');
        }
      }
    }

    // resetProfile(newSession)
    if (newSession) {
      vpGreen.fill(0);
      vpRed.fill(0);
      ltf.length = 0;
    }
    // if inZone: updateIntra(dO, dH, dL, dC, dV)
    const b = bars[i];
    if (inZone) ltf.push([b.open, b.high, b.low, b.close, dV[i]]);
    if (newSession) zoneStart = i;
    inZonePrev = inZone;
  }

  return result(profileBoxes);
}

export const VolumeOpenInterestFootprintByLeviathan = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  requiredSymbols,
  usesVisibleRange,
};
