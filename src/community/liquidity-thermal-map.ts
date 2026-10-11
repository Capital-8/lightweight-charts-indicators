/**
 * Liquidity Thermal Map [BigBeluga]
 *
 * A heat map of the volume traded at each price of the last `period` bars (100, 300 or 600 bars with 'Profile
 * Depth'). The range from the lowest low to the highest high of the period is cut in 31 levels. For each level the
 * volume of the bars whose close is less than one step away from the middle of the level is summed. The band
 * between two levels is filled with a colour that grows with its share of the largest sum: the 'Upper Liquidity
 * Color' when the close is at or below the level, else the 'Lower Liquidity Color'; the band with the largest sum is
 * the strongest. With 'Hide Active Candle Color' the bands that hold the open, the close, hl2 or hlc3 of the bar
 * are not coloured. 'Thermal Sensitivity' sets the share from which a band gets a colour (0.5, 0.25 or 0).
 *
 * On the last bar:
 * - the same bands are drawn again on the 10 bars after the last bar (invisible lines with a fill between them);
 * - a ladder of 31 boxes (25 to 35 bars after the last bar), green below the close and red above, fading away from
 *   the level of the close; the box of the level with the largest sum starts 10 bars after the last bar, is opaque
 *   and shows that sum;
 * - three labels 40 bars after the last bar: the volume below the close ('BUY LIQ'), the volume above it
 *   ('SELL LIQ'), each with its share, and their difference ('Imbalance').
 *
 * As the original script (calc_bars_count = 1500), only the last 1,500 bars are calculated: the bars before have no
 * value and the history of the script starts on the first of these bars.
 *
 * Chart values read: the chart foreground colour (text of the 'Imbalance' label). Without a chart context it is the
 * dark theme colour #DBDBDB.
 *
 * Reference: "Liquidity Thermal Map [BigBeluga]" by BigBeluga
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © BigBeluga
 */

import { ta, Series, color, str, barTime, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { BoxData, LabelData, LineDrawingData, LinefillData } from '../types';
import { foregroundColorOf, type ChartContext } from '../chart-context';

export interface LiquidityThermalMapInputs {
  /** Profile Depth: the number of bars of the profile (100, 300 or 600) */
  profileType: 'Shallow Profile' | 'Balanced Profile' | 'Deep Profile';
  /** Thermal Sensitivity: the share of the largest volume from which a band gets a colour (0.5, 0.25 or 0) */
  sensitivityMode: 'High Contrast' | 'Balanced' | 'Smooth';
  /** Upper Liquidity Color */
  pocCol1: string;
  /** Lower Liquidity Color */
  pocCol2: string;
  /** Hide Active Candle Color */
  removeCol: boolean;
}

export const defaultInputs: LiquidityThermalMapInputs = {
  profileType: 'Balanced Profile',
  sensitivityMode: 'Balanced',
  pocCol1: '#BD2B2B',
  pocCol2: '#29B453',
  removeCol: true,
};

export const inputConfig: InputConfig[] = [
  {
    id: 'profileType', type: 'string', title: 'Profile Depth', defval: 'Balanced Profile',
    options: ['Shallow Profile', 'Balanced Profile', 'Deep Profile'],
    tooltip: 'Controls how much historical data is used to build the liquidity profile.\n\n'
      + 'Shallow Profile  → Short-term structure\n'
      + 'Balanced Profile → Medium-term structure\n'
      + 'Deep Profile     → Broad structural distribution',
  },
  {
    id: 'sensitivityMode', type: 'string', title: 'Thermal Sensitivity', defval: 'Balanced',
    options: ['High Contrast', 'Balanced', 'Smooth'],
    tooltip: 'Controls heatmap intensity.\n\n'
      + 'High Contrast → Strong color separation\n'
      + 'Balanced      → Default behavior\n'
      + 'Smooth        → Softer gradient blending',
  },
  {
    id: 'pocCol1', type: 'color', title: 'Upper Liquidity Color', defval: '#BD2B2B',
    tooltip: 'Color used for liquidity located above current price.\nTypically represents overhead resistance zones.',
  },
  {
    id: 'pocCol2', type: 'color', title: 'Lower Liquidity Color', defval: '#29B453',
    tooltip: 'Color used for liquidity located below current price.\nTypically represents structural support zones.',
  },
  {
    id: 'removeCol', type: 'bool', title: 'Hide Active Candle Color', defval: true,
    tooltip: 'Removes heatmap coloring around the active candle\nto improve real-time price visibility.',
  },
];

/** Number of levels */
const BINS = 31;
/** colorNA of the script: the colour of the plots, the lines and the label backgrounds (not visible) */
const COLOR_NA = '#44444400';
/** calc_bars_count of the script */
const CALC_BARS = 1500;

export const plotConfig: PlotConfig[] = [
  ...Array.from({ length: BINS }, (_, k): PlotConfig => ({ id: `plot${k}`, title: `Level ${k}`, color: COLOR_NA, lineWidth: 1 })),
  { id: 'plot31', title: 'Highest', color: COLOR_NA, lineWidth: 1 },
];

export const metadata = {
  title: 'Liquidity Thermal Map [BigBeluga]',
  shortTitle: 'Liquidity Thermal Map [BigBeluga]',
  overlay: true,
};

/** Pine float comparisons: a > b only when a - b > 1e-10, a == b within 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const ge = (a: number, b: number) => a - b >= -EPS;
const le = (a: number, b: number) => b - a >= -EPS;
const eq = (a: number, b: number) => Math.abs(a - b) <= EPS;

type Point = { time: number; value: number };

export function calculate(
  bars: Bar[],
  inputs: Partial<LiquidityThermalMapInputs> = {},
  chart?: ChartContext,
): IndicatorResult & { lines: LineDrawingData[]; boxes: BoxData[]; labels: LabelData[]; linefills: LinefillData[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const { pocCol1, pocCol2, removeCol } = cfg;
  const period = cfg.profileType === 'Shallow Profile' ? 100 : cfg.profileType === 'Balanced Profile' ? 300 : 600;
  const min = cfg.sensitivityMode === 'High Contrast' ? 0.5 : cfg.sensitivityMode === 'Balanced' ? 0.25 : 0.0;
  // chart.fg_color
  const chartFg = foregroundColorOf(chart);
  const n = bars.length;

  // calc_bars_count: the script runs on the last 1,500 bars only
  const start = Math.max(0, n - CALC_BARS);
  const calcBars = bars.slice(start);
  const m = calcBars.length;
  const H = ta.highest(Series.fromArray(calcBars, calcBars.map((b) => b.high)), period).toArray().map((v) => v ?? NaN);
  const L = ta.lowest(Series.fromArray(calcBars, calcBars.map((b) => b.low)), period).toArray().map((v) => v ?? NaN);

  const plots: Point[][] = Array.from({ length: BINS + 1 }, () => []);
  const fillColors: string[][] = Array.from({ length: BINS }, () => []);
  for (let i = 0; i < start; i++) {
    for (const p of plots) p.push({ time: bars[i].time, value: NaN });
    for (const f of fillColors) f.push('transparent');
  }

  const lines: LineDrawingData[] = [];
  const boxes: BoxData[] = [];
  const labels: LabelData[] = [];
  const linefills: LinefillData[] = [];

  for (let j = 0; j < m; j++) {
    const { time, open, high, low, close } = calcBars[j];
    const hl2 = (high + low) / 2;
    const hlc3 = (high + low + close) / 3;
    const step = (H[j] - L[j]) / BINS;

    const levels: number[] = new Array(BINS).fill(NaN);
    const volBins: number[] = new Array(BINS).fill(0);
    for (let i = 0; i < BINS; i++) {
      const ll = L[j] + step * i;
      const mid = ll + step / 2;
      levels[i] = ll;
      for (let k = 0; k <= period - 1; k++) {
        // close[k], volume[k]: na before the first calculated bar
        const c = j - k >= 0 ? calcBars[j - k].close : NaN;
        if (lt(Math.abs(c - mid), step)) volBins[i] += j - k >= 0 ? calcBars[j - k].volume ?? NaN : NaN;
      }
    }
    // array.max skips na values
    const binValues = volBins.filter((v) => !Number.isNaN(v));
    const binMax = binValues.length > 0 ? Math.max(...binValues) : NaN;

    const inBand = (x: number, loww: number, upp: number) => ge(x, loww) && le(x, upp);
    const gradient = (number: number): string => {
      const val = volBins[number] / binMax;
      const loww = levels[number];
      const upp = levels[number + 1 > 29 ? 29 : number + 1];
      let pocCol = le(close, loww) ? pocCol1 : pocCol2;
      if (removeCol && (inBand(open, loww, upp) || inBand(close, loww, upp) || inBand(hl2, loww, upp) || inBand(hlc3, loww, upp))) {
        pocCol = COLOR_NA;
      }
      const col = eq(volBins[number], binMax)
        ? color.new(pocCol, 20)
        : color.from_gradient(val, min, 1, COLOR_NA, color.new(pocCol, 50));
      return col === null || col === undefined || Number.isNaN(col as unknown as number) ? 'transparent' : String(col);
    };

    for (let i = 0; i < BINS; i++) plots[i].push({ time, value: levels[i] });
    plots[BINS].push({ time, value: H[j] });
    for (let i = 0; i < BINS; i++) fillColors[i].push(gradient(i));

    if (j !== m - 1) continue;

    // barstate.islast: labels, the ladder of boxes, the bands after the last bar
    const barIndex = start + j;
    const lastIdx = BINS - 1;
    let buyVol = 0.0;
    let sellVol = 0.0;
    let splitIdx = Math.trunc(Math.floor((close - L[j]) / step));
    splitIdx = Math.max(0, Math.min(lastIdx, splitIdx));
    for (let i = 0; i <= lastIdx; i++) {
      const mid = L[j] + step * i + step / 2;
      if (lt(mid, close)) buyVol += volBins[i];
      else sellVol += volBins[i];
    }
    const totalVol = buyVol + sellVol;
    const buyPct = gt(totalVol, 0) ? buyVol / totalVol : 0;
    const sellPct = gt(totalVol, 0) ? sellVol / totalVol : 0;
    const imbalance = gt(sellVol, 0) ? buyVol - sellVol : NaN;
    const vol = (v: number) => str.tostring(v, 'volume');
    const labelTime = barTime(bars, barIndex + 40);

    labels.push({
      time: labelTime, price: L[j] + (close - L[j]) / 2,
      text: `BUY LIQ\n${vol(buyVol)}\n${str.tostring(buyPct * 100, '#.0')}%`,
      style: 'label_left', textColor: pocCol2, color: COLOR_NA,
      tooltip: `Liquidity Below Price\n\nTotal Volume Below Current Price:\n${vol(buyVol)}\n\nRepresents accumulated volume Below Current Price`,
    });
    labels.push({
      time: labelTime, price: close + (H[j] - close) / 2,
      text: `SELL LIQ\n${vol(sellVol)}\n${str.tostring(sellPct * 100, '#.0')}%`,
      style: 'label_left', textColor: pocCol1, color: COLOR_NA,
      tooltip: `Liquidity Above Price\n\nTotal Volume Above Current Price:\n${vol(sellVol)}\n\nRepresents accumulated volume Above Current Price`,
    });
    labels.push({
      time: labelTime, price: H[j] + step,
      text: `Imbalance: ${vol(imbalance)}`,
      style: 'label_left', textColor: chartFg, color: COLOR_NA,
      tooltip: `Liquidity Imbalance\n\nDifference Between Below and Above Liquidity:\n${vol(imbalance)}\n\nPositive → More liquidity below price\nNegative → More liquidity above price.`,
    });

    for (let i = 0; i <= lastIdx; i++) {
      const ll = L[j] + step * i;
      const hh = ll + step;
      const mid = ll + step / 2;
      const baseCol = gt(close, mid) ? pocCol2 : pocCol1;
      const dist = Math.abs(i - splitIdx);
      const maxDist = Math.max(splitIdx, lastIdx - splitIdx);
      const fade = maxDist > 0 ? dist / maxDist : 0.0;
      const alpha = Math.trunc(10 + fade * 85);
      const isMax = eq(volBins[i], binMax);
      // Without coordinates (no highest / lowest yet) the box is not drawn
      if (Number.isNaN(hh) || Number.isNaN(ll)) continue;
      boxes.push({
        time1: barTime(bars, barIndex + (isMax ? 10 : 25)), price1: hh, time2: barTime(bars, barIndex + 35), price2: ll,
        bgColor: isMax ? baseCol : String(color.new(baseCol, alpha)), borderColor: 'transparent', textColor: '#FFFFFF',
        ...(isMax ? { text: `>${vol(binMax)}<` } : {}),
      });
    }

    for (let i = 0; i <= 29; i++) {
      const level1 = levels[i];
      const level2 = levels[i + 1];
      if (Number.isNaN(level1) || Number.isNaN(level2)) continue;
      const l1: LineDrawingData = { time1: time, price1: level1, time2: barTime(bars, barIndex + 10), price2: level1, color: COLOR_NA };
      const l2: LineDrawingData = { time1: time, price1: level2, time2: barTime(bars, barIndex + 10), price2: level2, color: COLOR_NA };
      lines.push(l1, l2);
      linefills.push({ line1: l1, line2: l2, color: gradient(i) });
    }
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: Object.fromEntries(plots.map((p, k) => [`plot${k}`, p])),
    fills: fillColors.map((colors, k) => ({ plot1: `plot${k}`, plot2: `plot${k + 1}`, colors })),
    lines,
    boxes,
    labels,
    linefills,
  };
}

export const LiquidityThermalMap = { calculate, metadata, defaultInputs, inputConfig, plotConfig };
