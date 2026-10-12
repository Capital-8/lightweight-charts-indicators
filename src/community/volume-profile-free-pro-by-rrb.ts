/**
 * Volume Profile Free Pro (25 Levels Value Area VWAP)
 *
 * Volume profile of a fixed price range [min level, max level] cut in up to 25 levels. The profile covers the last
 * `range` bars before the current bar, skipping the `start bar` most recent ones. The volume of a bar goes to the
 * level of its source price: to the buy volume of the level when close >= open, else to its sell volume ("Show
 * Total Volume": all volume is buy volume and the sell levels are hidden).
 * The profile is drawn on the left of the zero line (on its right with "Flip Levels Horizontally"): each level is a
 * buy plot and a sell plot (a horizontal segment of 100 bars moved by an offset), the side cover hides the part
 * past the zero line. The length of a level is floor(volume / max volume * 100) bars; the sell segment is stacked
 * on the buy segment (side by side view: both start at the zero line and the base is the larger of the max buy and
 * max sell volume).
 * POC = level with the largest volume, developing POC = the second one found by the scan. Value area: from the POC,
 * the two levels above or the two levels below with the larger volume are added until the value area holds the
 * given percent of the total volume. In "vwap" mode the developing POC, value area high and low are replaced by the
 * VWAP and the VWAP +- standard deviation of the source over the VWAP length.
 *
 * All the outputs are those of the last bar: the plots show their last 100 (levels), 150 (side cover) or 1 (zero
 * line) values moved by the offset of the last bar, the level markers are on one bar.
 *
 * Limits of the port:
 * - "Highlight Range Background" uses the current time, as the original: the range of the background is the bars
 *   whose age (current time - bar time) is in (start bar, start bar + range] bar periods. The port reads the current
 *   time from the chart context (third argument of calculate, `now`) and uses the clock of the computer without it.
 *   The bar period is the chart timeframe (from the context, else from the bars): minutes on intraday bars, days,
 *   weeks, months of 30 days.
 * - "vwap" mode: the VWAP restarts on each trading day, so on daily and higher bars it restarts on every bar. On
 *   intraday bars the port needs the exchange time zone and session of the chart context; without them it throws
 *   an Error.
 * - A range that reads more than 5,000 bars back (start bar + range length - 1 > 5000, the max_bars_back of the
 *   original) is a runtime error of the original: the port throws the same message.
 * - Static plot settings keep the values of the default inputs: line width of the levels (12; the original computes
 *   it from "Level Width", "Level Width Multiplier" and "Compensate Level Width for Log Scale"), of the side cover
 *   (12, "Side Cover Density") and of the zero line (2), histogram base of the side cover (-80: min level - N
 *   levels) and of the zero line (0: min level).
 *
 * Reference: "Volume Profile Free Pro by RRB" by RagingRocketBull
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 */

import {
  ta, color, barInterval, barTime, getSourceSeries,
  type IndicatorResult, type InputConfig, type PlotConfig, type Bar, type SourceType,
} from 'oakscriptjs';
import { executeScript, ta as scriptTa } from 'oakscriptjs/script';
import type { MarkerData, BgColorData } from '../types';
import { nowOf, type ChartContext } from '../chart-context';
import { chartTimeframe } from '../anchor-period';

export type VolumeProfileProColorName = '' | 'black' | 'silver' | 'gray' | 'white' | 'maroon' | 'red' | 'purple'
  | 'fuchsia' | 'green' | 'lime' | 'olive' | 'yellow' | 'navy' | 'blue' | 'teal' | 'aqua' | 'orange';

export interface VolumeProfileFreeProByRrbInputs {
  showBuyLevels: boolean;
  showSellLevels: boolean;
  showZero: boolean;
  showPoc: boolean;
  /** Show the developing POC (VWAP in "vwap" mode) */
  showPoc2: boolean;
  /** Show the value area high / low (VWAP high / low in "vwap" mode) */
  showVa: boolean;
  showCover: boolean;
  /** Dim the zones outside the value area */
  dimNvaZones: boolean;
  /** Buy and sell levels both start at the zero line */
  sideView: boolean;
  /** All volume is shown as buy volume, the sell levels are hidden */
  totalVolumeMode: boolean;
  /** Draw the levels to the right of the zero line instead of the left */
  flipLevels: boolean;
  /** Background colour on the bars of the range */
  highlightBackground: boolean;
  /** Level width from the log ratio of adjacent levels (static plot setting: not used by the port) */
  adjustWidth: boolean;
  numLevels: number;
  maxLevel: number;
  minLevel: number;
  /** Price distance subtracted from the value area high level */
  spacing: number;
  /** Range length in bars */
  range: number;
  /** Bars between the current bar and the end of the range */
  startBar: number;
  levelsMode: 'va' | 'vwap';
  vpSrc: SourceType;
  vwapSrc: SourceType;
  vwapLen: number;
  stddev: number;
  vaPercent: number;
  anchor: 'cur bar' | 'range start' | 'range end';
  zeroOffset: number;
  adjZeroOffset: number;
  coverOffset: number;
  pocOffset: number;
  vaOffset: number;
  /** Level price inside its price step, in percent (50 = middle) */
  levelShift: number;
  /** Static plot setting: not used by the port */
  lineWidth: number;
  /** Static plot setting: not used by the port */
  widthMultiplier: number;
  /** Static plot setting: not used by the port */
  zeroWidth: number;
  /** Static plot setting: not used by the port */
  coverWidth: number;
  /** Side cover extended by this number of levels above and below */
  coverExtHeight: number;
  buyTransp: number;
  sellTransp: number;
  /** Not used by the original */
  nonVaTransp: number;
  pocCol: VolumeProfileProColorName;
  poc2Col: VolumeProfileProColorName;
  vaHighCol: VolumeProfileProColorName;
  vaLowCol: VolumeProfileProColorName;
  vwapCol: VolumeProfileProColorName;
  vwapHighCol: VolumeProfileProColorName;
  vwapLowCol: VolumeProfileProColorName;
}

export const defaultInputs: VolumeProfileFreeProByRrbInputs = {
  showBuyLevels: true,
  showSellLevels: true,
  showZero: true,
  showPoc: true,
  showPoc2: true,
  showVa: true,
  showCover: true,
  dimNvaZones: false,
  sideView: false,
  totalVolumeMode: false,
  flipLevels: false,
  highlightBackground: false,
  adjustWidth: false,
  numLevels: 25,
  maxLevel: 1000,
  minLevel: 0,
  spacing: 10,
  range: 1000,
  startBar: 0,
  levelsMode: 'va',
  vpSrc: 'close',
  vwapSrc: 'hlc3',
  vwapLen: 100,
  stddev: 2,
  vaPercent: 70,
  anchor: 'cur bar',
  zeroOffset: 80,
  adjZeroOffset: 0,
  coverOffset: 0,
  pocOffset: -40,
  vaOffset: -40,
  levelShift: 50,
  lineWidth: 12,
  widthMultiplier: 200,
  zeroWidth: 2,
  coverWidth: 12,
  coverExtHeight: 2,
  buyTransp: 30,
  sellTransp: 40,
  nonVaTransp: 70,
  pocCol: '',
  poc2Col: '',
  vaHighCol: '',
  vaLowCol: '',
  vwapCol: '',
  vwapHighCol: '',
  vwapLowCol: '',
};

const COLOR_OPTIONS = ['', 'black', 'silver', 'gray', 'white', 'maroon', 'red', 'purple', 'fuchsia', 'green', 'lime',
  'olive', 'yellow', 'navy', 'blue', 'teal', 'aqua', 'orange'];

export const inputConfig: InputConfig[] = [
  { id: 'showBuyLevels', type: 'bool', title: 'Show Buy Levels', defval: true },
  { id: 'showSellLevels', type: 'bool', title: 'Show Sell Levels', defval: true },
  { id: 'showZero', type: 'bool', title: 'Show Zero Line', defval: true },
  { id: 'showPoc', type: 'bool', title: 'Show POC Level', defval: true },
  { id: 'showPoc2', type: 'bool', title: 'Show Developing POC/VWAP Level', defval: true },
  { id: 'showVa', type: 'bool', title: 'Show Value Area/VWAP High/Low Levels', defval: true },
  { id: 'showCover', type: 'bool', title: 'Show Side Cover', defval: true },
  { id: 'dimNvaZones', type: 'bool', title: 'Dim Non Value Area Zones', defval: false },
  { id: 'sideView', type: 'bool', title: 'Side By Side View', defval: false },
  { id: 'totalVolumeMode', type: 'bool', title: 'Show Total Volume', defval: false },
  { id: 'flipLevels', type: 'bool', title: 'Flip Levels Horizontally', defval: false },
  { id: 'highlightBackground', type: 'bool', title: 'Highlight Range Background', defval: false },
  { id: 'adjustWidth', type: 'bool', title: 'Compensate Level Width for Log Scale', defval: false },
  { id: 'numLevels', type: 'int', title: 'Num Levels [0..25]', defval: 25, min: 0, max: 25 },
  { id: 'maxLevel', type: 'float', title: 'Max Price Level (0 - Disabled)', defval: 1000, min: 0 },
  { id: 'minLevel', type: 'float', title: 'Min Price Level (0 - Disabled)', defval: 0, min: 0 },
  { id: 'spacing', type: 'float', title: 'Vertical Spacing', defval: 10, min: 0 },
  { id: 'range', type: 'int', title: 'VP Range Length (Bars)', defval: 1000, min: 0 },
  { id: 'startBar', type: 'int', title: 'VP Range Start Bar (0-Based)', defval: 0, min: 0 },
  { id: 'levelsMode', type: 'string', title: 'Value Area/VWAP Mode', defval: 'va', options: ['va', 'vwap'] },
  { id: 'vpSrc', type: 'source', title: 'Volume Profile Source', defval: 'close' },
  { id: 'vwapSrc', type: 'source', title: 'VWAP Source', defval: 'hlc3' },
  { id: 'vwapLen', type: 'int', title: 'VWAP Length', defval: 100, min: 1 },
  { id: 'stddev', type: 'float', title: 'VWAP Standard Deviation', defval: 2, min: 0.1 },
  { id: 'vaPercent', type: 'float', title: 'Value Area % Of Total Volume', defval: 70, min: 0, max: 100 },
  { id: 'anchor', type: 'string', title: 'Zero Line Anchor Point', defval: 'cur bar', options: ['cur bar', 'range start', 'range end'] },
  { id: 'zeroOffset', type: 'int', title: 'Zero Line Offset', defval: 80 },
  { id: 'adjZeroOffset', type: 'int', title: 'Zero Line Offset Adjustment (Depending on Scale)', defval: 0 },
  { id: 'coverOffset', type: 'int', title: 'Cover Offset (Relative to Zero Line)', defval: 0 },
  { id: 'pocOffset', type: 'int', title: 'POC Line Offset (Relative to Zero Line)', defval: -40 },
  { id: 'vaOffset', type: 'int', title: 'VA High/Low Lines Offset (Relative to Zero Line)', defval: -40 },
  { id: 'levelShift', type: 'int', title: 'Level Vertical Shift % (50% - middle)', defval: 50, min: 0, max: 100 },
  { id: 'lineWidth', type: 'int', title: 'Level Width', defval: 12 },
  { id: 'widthMultiplier', type: 'float', title: 'Level Width Multiplier', defval: 200, min: 0 },
  { id: 'zeroWidth', type: 'int', title: 'Zero Line Width', defval: 2 },
  { id: 'coverWidth', type: 'int', title: 'Side Cover Density', defval: 12 },
  { id: 'coverExtHeight', type: 'int', title: 'Extend Cover by N Levels Up/Down/Right', defval: 2 },
  { id: 'buyTransp', type: 'int', title: 'Buy Level Transparency', defval: 30, min: 0, max: 100 },
  { id: 'sellTransp', type: 'int', title: 'Sell Level Transparency', defval: 40, min: 0, max: 100 },
  { id: 'nonVaTransp', type: 'int', title: 'Non Value Area Level Transparency', defval: 70, min: 0, max: 100 },
  { id: 'pocCol', type: 'string', title: 'POC Level Color', defval: '', options: COLOR_OPTIONS },
  { id: 'poc2Col', type: 'string', title: 'Developing POC Color', defval: '', options: COLOR_OPTIONS },
  { id: 'vaHighCol', type: 'string', title: 'VA High Level Color', defval: '', options: COLOR_OPTIONS },
  { id: 'vaLowCol', type: 'string', title: 'VA Low Level Color', defval: '', options: COLOR_OPTIONS },
  { id: 'vwapCol', type: 'string', title: 'VWAP Level Color', defval: '', options: COLOR_OPTIONS },
  { id: 'vwapHighCol', type: 'string', title: 'VWAP High Level Color', defval: '', options: COLOR_OPTIONS },
  { id: 'vwapLowCol', type: 'string', title: 'VWAP Low Level Color', defval: '', options: COLOR_OPTIONS },
];

/** Named colours of the original (Pine v3 palette) */
const NAMED: Record<string, string> = {
  black: '#000000', silver: '#C0C0C0', gray: '#808080', white: '#FFFFFF', maroon: '#800000', red: '#FF0000',
  purple: '#800080', fuchsia: '#FF00FF', green: '#008000', lime: '#00FF00', olive: '#808000', yellow: '#FFFF00',
  navy: '#000080', blue: '#0000FF', teal: '#008080', aqua: '#00FFFF', orange: '#FF7F00',
};

/** Max number of levels */
const MAX_LEVELS = 25;
/** Base width of the levels: 100 % = 100 bars (Pine show_last of the level plots) */
const LENGTH = 100;
const EXT_LENGTH = 50;
const COVER_LENGTH = LENGTH + EXT_LENGTH;

const POC_TEXT = '_ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _';
const TEXT_UNDER = '_'.repeat(92);
const TEXT_UPPER = '‾'.repeat(92);
const LINE_BLOCK = '\n'.repeat(26);

export const plotConfig: PlotConfig[] = [
  ...Array.from({ length: MAX_LEVELS }, (_, j): PlotConfig => ({
    id: `plot${j}`, title: `Sell Volume ${j + 1}`, color: String(color.new(NAMED.red, 40)), lineWidth: 12, style: 'line',
  })),
  ...Array.from({ length: MAX_LEVELS }, (_, j): PlotConfig => ({
    id: `plot${MAX_LEVELS + j}`, title: `Buy Volume ${j + 1}`, color: String(color.new(NAMED.green, 30)), lineWidth: 12, style: 'line',
  })),
  { id: 'plot50', title: 'Side Cover', color: NAMED.white, lineWidth: 12, style: 'histogram', histbase: -80 },
  // v3 plot without transp: default transparency 35
  { id: 'plot51', title: 'Zero Line', color: String(color.new(NAMED.black, 35)), lineWidth: 2, style: 'histogram', histbase: 0 },
];

export const metadata = {
  title: 'Volume Profile Free Pro by RRB',
  shortTitle: 'VolumeProfileFree_Pro_RRB',
  overlay: true,
};

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const ge = (a: number, b: number) => !Number.isNaN(a) && !Number.isNaN(b) && !(b - a > EPS);
const le = (a: number, b: number) => !Number.isNaN(a) && !Number.isNaN(b) && !(a - b > EPS);
const eq = (a: number, b: number) => Math.abs(a - b) <= EPS;
/** Pine na(): na and +-infinity */
const isNa = (v: number) => !Number.isFinite(v);

const DAY_SECONDS = 86400;
/** max_bars_back of the original study() */
const MAX_BARS_BACK = 5000;

/** tf_to_mins(): minutes of one bar of the chart timeframe (days, weeks, months of 30 days) */
function timeframeMinutes(tf: string): number {
  const m = /^(\d*)([SDWM]?)$/.exec(tf);
  if (!m) return NaN;
  const mult = m[1] === '' ? 1 : Number(m[1]);
  switch (m[2]) {
    case 'D': return mult * 24 * 60;
    case 'W': return mult * 7 * 24 * 60;
    case 'M': return mult * 30 * 24 * 60;
    default: return mult; // intraday: the interval multiplier
  }
}

export function calculate(
  bars: Bar[],
  inputs: Partial<VolumeProfileFreeProByRrbInputs> = {},
  chart?: ChartContext,
): Omit<IndicatorResult, 'markers' | 'bgColors'> & { markers: MarkerData[]; bgColors: BgColorData[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const last = n - 1;
  const interval = barInterval(bars);

  const plots: Record<string, { time: number; value: number; color?: string }[]> = Object.fromEntries(
    plotConfig.map((p) => [p.id, [] as { time: number; value: number; color?: string }[]]),
  );
  const markers: MarkerData[] = [];
  const bgColors: BgColorData[] = [];
  const result = () => ({
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots,
    markers,
    bgColors,
  });
  if (n === 0) return result();

  // "vwap" mode on intraday bars: the daily restart of the VWAP needs the exchange time zone and session
  const intradayVwap = cfg.levelsMode === 'vwap' && interval > 0 && interval < DAY_SECONDS;
  if (intradayVwap && (chart?.timezone === undefined || chart.session === undefined)) {
    throw new Error(
      'Volume Profile Free Pro: the "vwap" mode works on daily and higher timeframes only: on intraday bars the VWAP '
      + 'resets on each trading day, which needs the exchange time zone and session.',
    );
  }

  // Show Total Volume: no sell levels
  const showSellLevels = cfg.totalVolumeMode ? false : cfg.showSellLevels;
  const numLevels = cfg.numLevels;

  // ---- Range highlight: bars whose age is in (start_bar, start_bar + range] bar periods ----
  if (cfg.highlightBackground) {
    const timenow = nowOf(chart);
    const barRange = 1000 * 60 * timeframeMinutes(chartTimeframe(bars, chart));
    const firstTime = (cfg.startBar + cfg.range) * barRange;
    const lastTime = cfg.startBar * barRange;
    const bg = String(color.new(NAMED.aqua, 80));
    for (const b of bars) {
      const timeRange = timenow - b.time * 1000;
      if (le(timeRange, firstTime) && gt(timeRange, lastTime)) bgColors.push({ time: b.time, color: bg });
    }
  }

  // ---- Profile of the last bar ----
  const ph = cfg.maxLevel;
  const pl = cfg.minLevel;
  const h = numLevels > 0 ? (ph - pl) / numLevels : 0;
  let isValidRange = numLevels > 0 && cfg.range > 0 && le(cfg.minLevel, cfg.maxLevel);

  const vpSrc = getSourceSeries(bars, cfg.vpSrc).toArray().map((v) => v ?? NaN);
  const isValid = (price: number) => {
    const minCond = eq(cfg.minLevel, 0) || (gt(cfg.minLevel, 0) && le(cfg.minLevel, price));
    const maxCond = eq(cfg.maxLevel, 0) || (gt(cfg.maxLevel, 0) && le(price, cfg.maxLevel));
    return minCond && maxCond;
  };

  // buy / sell volume of the levels 1..25 (index 0 is not used)
  const buyVol = new Array<number>(MAX_LEVELS + 1).fill(0);
  const sellVol = new Array<number>(MAX_LEVELS + 1).fill(0);
  if (isValidRange) {
    // vp_src[i] with i above max_bars_back (5000): the original stops on the first bar (runtime error RE10008)
    if (cfg.startBar + cfg.range - 1 > MAX_BARS_BACK) {
      throw new Error(
        `Error on bar 0: The script attempts to reference historical data that is too far from the current bar (${Math.max(cfg.startBar, MAX_BARS_BACK + 1)} bars back). `
        + `The history-referencing length for the expression must be a value between 0 and ${MAX_BARS_BACK}.`,
      );
    }
    for (let i = cfg.startBar; i <= cfg.startBar + cfg.range - 1; i++) {
      const bi = last - i;
      // price = vp_src[i]: na before the first bar
      const price = bi >= 0 ? vpSrc[bi] : NaN;
      let k = NaN;
      if (isValid(price)) {
        for (let j = 1; j <= numLevels; j++) {
          if (lt(price, pl + h * j)) {
            k = j;
            break;
          }
        }
      }
      if (!Number.isNaN(k) && k <= MAX_LEVELS) {
        const b = bars[bi];
        const dir = cfg.totalVolumeMode ? 1 : Math.sign(b.close - b.open);
        const volume = b.volume ?? NaN;
        if (dir >= 0) buyVol[k] += volume;
        if (dir < 0) sellVol[k] += volume;
      }
    }
  }
  const totalVolumes = (group: number) => (group >= 1 && group <= numLevels ? buyVol[group] + sellVol[group] : 0);

  // Max / total volumes, POC and developing POC
  let maxBuyVol = 0;
  let maxSellVol = 0;
  let maxVol = 0;
  let maxVol2 = 0;
  let totalVol = 0;
  let pocIndex = 0;
  let poc2Index = 0;
  let pocLevel = 0;
  let poc2Level = 0;
  const shift = (cfg.levelShift / 100) * h;
  if (isValidRange) {
    for (let i = 1; i <= numLevels; i++) {
      const bv = buyVol[i];
      if (lt(maxBuyVol, bv)) maxBuyVol = bv;
      const sv = sellVol[i];
      if (lt(maxSellVol, sv)) maxSellVol = sv;
      totalVol = totalVol + bv + sv;
      if (lt(maxVol2, bv + sv)) {
        if (lt(maxVol, bv + sv)) {
          maxVol2 = maxVol;
          poc2Index = pocIndex;
          maxVol = bv + sv;
          pocIndex = i;
        } else {
          maxVol2 = bv + sv;
          poc2Index = i;
        }
      }
    }
    if (cfg.sideView) maxVol = Math.max(maxBuyVol, maxSellVol);
    pocLevel = pl + (pocIndex - 1) * h + shift;
    poc2Level = poc2Index > 0 ? pl + (poc2Index - 1) * h + shift : 0;
  }

  // Value area
  const vaLimit = (totalVol * cfg.vaPercent) / 100;
  const midIndex = numLevels / 2;
  let vaVol = totalVolumes(pocIndex);
  let vaHigh = pocIndex;
  let vaLow = pocIndex;
  let vaHighLevel = 0;
  let vaLowLevel = 0;
  isValidRange = isValidRange && gt(vaVol, 0);
  if (isValidRange) {
    for (let i = 1; i <= numLevels; i++) {
      const aboveVol = totalVolumes(vaHigh + 1) + totalVolumes(vaHigh + 2);
      const belowVol = totalVolumes(vaLow - 1) + totalVolumes(vaLow - 2);
      if (vaHigh <= numLevels) {
        if (gt(aboveVol, belowVol)
          || (eq(aboveVol, belowVol) && le(Math.abs(vaHigh + 2 - midIndex), Math.abs(vaLow - 2 - midIndex)))) {
          vaHigh += 2;
          vaVol += aboveVol;
        }
      }
      if (vaLow > 0) {
        if (lt(aboveVol, belowVol)
          || (eq(aboveVol, belowVol) && gt(Math.abs(vaHigh + 2 - midIndex), Math.abs(vaLow - 2 - midIndex)))) {
          vaLow -= 2;
          vaVol += belowVol;
        }
      }
      if (ge(vaVol, vaLimit) || (vaLow <= 0 && vaHigh > numLevels)) break;
    }
    vaHigh = vaHigh > numLevels ? numLevels : vaHigh;
    vaLow = vaLow <= 0 ? 1 : vaLow;
    vaHighLevel = pl + vaHigh * h - cfg.spacing;
    vaLowLevel = pl + (vaLow - 1) * h;
  }

  // VWAP mode: developing POC -> VWAP, value area high / low -> VWAP +- stdev * multiplier
  if (cfg.levelsMode === 'vwap') {
    const src = getSourceSeries(bars, cfg.vwapSrc);
    // vwap(): a new anchor on each trading day of the exchange on intraday bars, on every bar on daily and higher
    // bars (script API; one bar alone is its own anchor)
    let vwap: (number | null | undefined)[] = [];
    const vwapChart = { ...chart, timeframe: chartTimeframe(bars, chart) || '1D' };
    executeScript(() => { vwap = scriptTa.vwap(src).toArray(); }, bars, {}, vwapChart);
    const vwapLevel = vwap[last] ?? NaN;
    const sd = ta.stdev(src, cfg.vwapLen).toArray()[last] ?? NaN;
    const vwapStdev = sd * cfg.stddev;
    poc2Level = vwapLevel;
    vaHighLevel = vwapLevel + vwapStdev;
    vaLowLevel = vwapLevel - vwapStdev;
  }

  // Level lengths in bars: floor(volume / max volume * 100); sell stacked on buy (not in the side by side view)
  const buyLen = new Array<number>(MAX_LEVELS + 1).fill(0);
  const sellLen = new Array<number>(MAX_LEVELS + 1).fill(0);
  if (gt(maxVol, 0)) {
    const flag = cfg.sideView ? 0 : 1;
    for (let j = 1; j <= MAX_LEVELS; j++) {
      buyLen[j] = Math.floor((buyVol[j] / maxVol) * LENGTH);
      sellLen[j] = Math.floor(((sellVol[j] + flag * buyVol[j]) / maxVol) * LENGTH);
    }
  }

  // Offsets
  const dir = cfg.flipLevels ? 1 : -1;
  const rangeOffset = cfg.anchor === 'cur bar' ? 0 : cfg.anchor === 'range start' ? cfg.startBar : cfg.startBar + cfg.range - 1;
  const zOffset = cfg.zeroOffset - rangeOffset;
  const lOffset = dir === 1 ? zOffset : zOffset + LENGTH;
  const adjZOffset = zOffset - dir * cfg.adjZeroOffset;
  const cOffset = (dir === 1 ? zOffset : zOffset + COVER_LENGTH) - dir * cfg.coverOffset;
  const pocOffset = zOffset - dir * cfg.pocOffset;
  const vaOffset = zOffset - dir * cfg.vaOffset;

  // ---- Plots: the last `showLast` values moved by the offset of the last bar ----
  const shown = (value: number, offset: number, showLast: number, col?: string) => {
    const pts: { time: number; value: number; color?: string }[] = [];
    if (Number.isNaN(value)) return pts;
    for (let i = Math.max(0, n - showLast); i < n; i++) {
      if (i + offset < 0) continue;
      const time = barTime(bars, i + offset, interval);
      pts.push(col === undefined ? { time, value } : { time, value, color: col });
    }
    return pts;
  };
  const sellColor = String(color.new(NAMED.red, cfg.sellTransp));
  const buyColor = String(color.new(NAMED.green, cfg.buyTransp));
  for (let j = 1; j <= MAX_LEVELS; j++) {
    const level = pl + (j - 1) * h + shift;
    plots[`plot${j - 1}`] = shown(showSellLevels && numLevels >= j ? level : NaN, lOffset + dir * sellLen[j], LENGTH, sellColor);
    plots[`plot${MAX_LEVELS + j - 1}`] = shown(cfg.showBuyLevels && numLevels >= j ? level : NaN, lOffset + dir * buyLen[j], LENGTH, buyColor);
  }
  // Side cover: histogram from c_base to c_top; zero line: histogram from min level to max level
  const cHeight = h * cfg.coverExtHeight;
  plots.plot50 = shown(cfg.showCover ? ph + cHeight : NaN, cOffset, COVER_LENGTH);
  plots.plot51 = shown(cfg.showZero ? ph : NaN, adjZOffset, 1);

  // ---- Level markers on one bar (plotshape, location.absolute, show_last = 1) ----
  const shape = (
    on: boolean, price: number, offset: number,
    marker: Pick<MarkerData, 'position' | 'shape' | 'color' | 'text' | 'textColor'>,
  ) => {
    if (!on || isNa(price) || last + offset < 0) return;
    markers.push({ time: barTime(bars, last + offset, interval), price, size: 'auto', ...marker });
  };
  const named = (name: string, def: string) => NAMED[name] ?? def;
  const pocCol = named(cfg.pocCol, NAMED.black);
  let poc2Col = named(cfg.poc2Col, NAMED.silver);
  let vaHighCol = named(cfg.vaHighCol, NAMED.red);
  let vaLowCol = named(cfg.vaLowCol, NAMED.green);
  if (cfg.levelsMode === 'vwap') {
    poc2Col = named(cfg.vwapCol, NAMED.orange);
    vaHighCol = named(cfg.vwapHighCol, NAMED.fuchsia);
    vaLowCol = named(cfg.vwapLowCol, NAMED.lime);
  }
  shape(cfg.showPoc && gt(pocLevel, 0), pocLevel, pocOffset, {
    position: 'atPriceMiddle', shape: 'circle', color: NAMED.black, text: POC_TEXT, textColor: pocCol,
  });
  shape(cfg.showPoc2 && gt(poc2Level, 0), poc2Level, pocOffset, {
    position: 'atPriceMiddle', shape: 'circle', color: NAMED.silver, text: POC_TEXT, textColor: poc2Col,
  });
  // Zones outside the value area: white labels, plotshape transp = 20 (shape and text)
  const zoneColor = String(color.new(NAMED.white, 20));
  shape(cfg.showVa && cfg.dimNvaZones && gt(vaHighLevel, 0), vaHighLevel, vaOffset, {
    position: 'atPriceTop', shape: 'labelDown', color: zoneColor, text: LINE_BLOCK + TEXT_UNDER, textColor: zoneColor,
  });
  shape(cfg.showVa && cfg.dimNvaZones && gt(vaLowLevel, 0), vaLowLevel, vaOffset, {
    position: 'atPriceBottom', shape: 'labelUp', color: zoneColor, text: TEXT_UPPER + LINE_BLOCK,
    textColor: String(color.new(vaLowCol, 20)),
  });
  shape(cfg.showVa && gt(vaHighLevel, 0), vaHighLevel, vaOffset, {
    position: 'atPriceMiddle', shape: 'circle', color: NAMED.red, text: TEXT_UNDER, textColor: vaHighCol,
  });
  shape(cfg.showVa && gt(vaLowLevel, 0) && !cfg.dimNvaZones, vaLowLevel, vaOffset, {
    position: 'atPriceMiddle', shape: 'circle', color: NAMED.green, text: TEXT_UNDER, textColor: vaLowCol,
  });

  return result();
}

export const VolumeProfileFreeProByRrb = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
};
