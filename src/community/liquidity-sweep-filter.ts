/**
 * Liquidity Sweep Filter [AlgoAlpha]
 *
 * Trend: `basis` is the SMA of the EMA of the source ('Length'), `deviation` the EMA (3 x 'Length') of
 * |close - basis| times 'Multiplier'. The trend turns up when the close is above basis + deviation and down when it
 * is below basis - deviation. The lower band is plotted in an uptrend, the upper band in a downtrend, with a label
 * shape on each turn.
 *
 * Liquidity levels: in a downtrend each swing high (a high above the highs of the bar before and after) below the
 * upper band starts a line; in an uptrend each swing low above the lower band does. The line colour is more opaque
 * when the volume of the swing bar is high in the range of the last int('Length' x 'Multiplier') bars (`nvol`,
 * 0 to 100). A line grows to the right until the price passes it (a sweep) or the band crosses it. The volumes of
 * the lines swept on one bar are added: a label on the band shows the sum, and characters mark the sweep under the
 * low / above the high (a filled triangle when the sum of the `nvol` values is above 'Major Sweep Threshold').
 *
 * Volume profile (last bar): the bars since the last trend change are split in 'Resolution' price rows; each row
 * is a box whose width is the volume of the bars that touch it ('Scale' bars for the largest row), drawn 7 bars
 * after the last bar, with a bounding box from the first bar of the trend.
 *
 * Chart values read: the chart foreground colour (bounding box, text of the trend shapes). Without a chart context
 * it is the dark theme colour #DBDBDB. The 6 alert conditions of the script have no output.
 *
 * Reference: "Liquidity Sweep Filter [AlgoAlpha]" by AlgoAlpha
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © AlgoAlpha
 */

import {
  ta, Series, getSourceSeries, color, str, callsite, barTime,
  type IndicatorResult, type InputConfig, type PlotConfig, type Bar, type SourceType,
} from 'oakscriptjs';
import type { BoxData, LabelData, LineDrawingData, MarkerData, TableData } from '../types';
import { foregroundColorOf, type ChartContext } from '../chart-context';

export interface LiquiditySweepFilterInputs {
  /** Length of the trend bands */
  len: number;
  /** Multiplier of the band deviation */
  mult: number;
  src: SourceType;
  /** Major Sweep Threshold (0 to 100) */
  majorSweepThresh: number;
  showMajor: boolean;
  showMinor: boolean;
  showProfile: boolean;
  showBounds: boolean;
  /** Resolution: number of rows of the volume profile */
  res: number;
  /** Scale: width in bars of the largest profile row */
  scale: number;
  /** Dismiss No Volume Warning */
  dismiss: boolean;
  bullColor: string;
  bearColor: string;
  profileColor: string;
}

export const defaultInputs: LiquiditySweepFilterInputs = {
  len: 12,
  mult: 2.0,
  src: 'close',
  majorSweepThresh: 50,
  showMajor: true,
  showMinor: true,
  showProfile: true,
  showBounds: true,
  res: 40,
  scale: 30,
  dismiss: false,
  bullColor: '#00ffbb',
  bearColor: '#ff1100',
  profileColor: '#787B86',
};

const TREND = 'Trend Settings';
const PROFILE = 'Profile Settings';
const APPEARANCE = 'Appearance Settings';

export const inputConfig: InputConfig[] = [
  {
    id: 'len', type: 'int', title: 'Length', defval: 12, min: 1, group: TREND,
    tooltip: 'The number of periods used for trend calculations. A longer length creates a smoother and longer term signal',
  },
  {
    id: 'mult', type: 'float', title: 'Multiplier', defval: 2.0, min: 0.1, step: 0.1, group: TREND,
    tooltip: 'Multiplier for the standard deviation calculation. Higher values create wider bands and makes the indicator more resistant to noise',
  },
  {
    id: 'src', type: 'source', title: 'Source', defval: 'close', group: TREND,
    tooltip: 'The price data used for calculations. Close is most common, but you can also use open, high, low, hl2 (high+low)/2, hlc3 (high+low+close)/3, or ohlc4 (open+high+low+close)/4',
  },
  {
    id: 'majorSweepThresh', type: 'float', title: 'Major Sweep Threshold', defval: 50, min: 0, group: TREND,
    tooltip: "Threshold value that determines what constitutes a major liquidation sweep. Higher values mean only larger price movements will be considered major sweeps. Can only be 0-100, larger values will make it harder for sweeps to be considered 'major'",
  },
  {
    id: 'showMajor', type: 'bool', title: 'Show Major Liquidations', defval: true, group: TREND,
    tooltip: 'Toggle the display of major liquidation levels. These represent significant price levels where large position liquidations occurred',
  },
  {
    id: 'showMinor', type: 'bool', title: 'Show Minor Liquidations', defval: true, group: TREND,
    tooltip: 'Toggle the display of minor liquidation levels. These represent smaller price levels where position liquidations occurred',
  },
  {
    id: 'showProfile', type: 'bool', title: 'Show Volume Profile', defval: true, group: PROFILE,
    tooltip: 'Toggle the display of the volume profile visualization. When enabled, shows the distribution of trading volume across price levels',
  },
  {
    id: 'showBounds', type: 'bool', title: 'Show Bounding Box', defval: true, group: PROFILE,
    tooltip: "Toggle the display of the bounding box around the volume profile. Helps to clearly define the profile's boundaries",
  },
  {
    id: 'res', type: 'int', title: 'Resolution', defval: 40, min: 1, group: PROFILE,
    tooltip: 'Number of bars in the volume profile. Higher values create more detailed profiles but may increase visual noise. Each bar represents a price range where volume occurred',
  },
  {
    id: 'scale', type: 'int', title: 'Scale', defval: 30, min: 1, group: PROFILE,
    tooltip: 'Controls the horizontal width of the volume profile display. Higher values make the profile wider and more visible, while lower values make it more compact',
  },
  {
    id: 'dismiss', type: 'bool', title: 'Dismiss No Volume Warning', defval: false, group: APPEARANCE,
    tooltip: 'Dismisses a warning that pops up when there is no volume data for the ticker',
  },
  {
    id: 'bullColor', type: 'color', title: 'Bullish Color', defval: '#00ffbb', group: APPEARANCE,
    tooltip: 'Color used for bullish trends and indicators. This color appears when price action or indicators suggest upward momentum',
  },
  {
    id: 'bearColor', type: 'color', title: 'Bearish Color', defval: '#ff1100', group: APPEARANCE,
    tooltip: 'Color used for bearish trends and indicators. This color appears when price action or indicators suggest downward momentum',
  },
  {
    id: 'profileColor', type: 'color', title: 'Profile Color', defval: '#787B86', group: APPEARANCE,
    tooltip: 'Color of the volume profile visualization. This shows the distribution of trading volume across different price levels',
  },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Downtrend Line', color: 'rgba(255, 17, 0, 0.7)', lineWidth: 3, style: 'linebr' },
  { id: 'plot1', title: 'Uptrend Line', color: 'rgba(0, 255, 187, 0.7)', lineWidth: 3, style: 'linebr' },
];

export const metadata = {
  title: 'Liquidity Sweep Filter [AlgoAlpha]',
  shortTitle: 'AlgoAlpha - Liquidity Filter',
  overlay: true,
};

/** indicator(max_lines_count = 500, max_boxes_count = 500, max_labels_count = 500) */
const MAX_LINES = 500;
const MAX_LABELS = 500;

/** Pine float comparisons: a > b only when a - b > 1e-10, a == b within 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const eq = (a: number, b: number) => Math.abs(a - b) <= EPS;

interface LevelLine {
  dead: boolean;
  x1: number;
  x2: number;
  y: number;
  color: string;
}

/**
 * The drawing count limit of Pine: when a creation brings the count above max + 5, the oldest objects are deleted
 * until max remain.
 */
function register<T extends { dead: boolean }>(list: T[], obj: T, max: number): T {
  list.push(obj);
  if (list.length > max + 5) {
    for (const old of list.splice(0, list.length - max)) old.dead = true;
  }
  return obj;
}

export function calculate(
  bars: Bar[],
  inputs: Partial<LiquiditySweepFilterInputs> = {},
  chart?: ChartContext,
): Omit<IndicatorResult, 'markers'> & {
    markers: MarkerData[];
    lines: LineDrawingData[];
    boxes: BoxData[];
    labels: LabelData[];
    tables: TableData[];
  } {
  const cfg = { ...defaultInputs, ...inputs };
  const { len, mult, res, scale } = cfg;
  const thresh = cfg.majorSweepThresh;
  // chart.fg_color
  const chartFg = foregroundColorOf(chart);
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const S = (a: number[]) => Series.fromArray(bars, a);

  const high = bars.map((b) => b.high);
  const low = bars.map((b) => b.low);
  const volume = bars.map((b) => b.volume ?? NaN);
  const volumeSeries = S(volume);

  // basis = ta.sma(ta.ema(src, len), len); deviation = ta.ema(math.abs(close - basis), len * 3) * mult
  const basis = A(ta.sma(ta.ema(getSourceSeries(bars, cfg.src), len), len));
  const deviation = A(ta.ema(S(bars.map((b, i) => Math.abs(b.close - basis[i]))), len * 3)).map((v) => v * mult);
  const upper = basis.map((v, i) => v + deviation[i]);
  const lower = basis.map((v, i) => v - deviation[i]);

  // nvol: the volume in its range of the last int(len * mult) bars, 0 to 100
  const length = Math.trunc(len * mult);
  const lowestVol = A(ta.lowest(volumeSeries, length));
  const highestVol = A(ta.highest(volumeSeries, length));
  const nvol = volume.map((v, i) => ((v - lowestVol[i]) / (highestVol[i] - lowestVol[i])) * 100);

  // var float trend = 0.0
  const trend: number[] = [];
  let trendNow = 0;
  for (let i = 0; i < n; i++) {
    if (gt(bars[i].close, upper[i])) trendNow = 1;
    if (gt(lower[i], bars[i].close)) trendNow = -1;
    trend.push(trendNow);
  }
  const trendSeries = S(trend);
  const zero = S(trend.map(() => 0));
  const bool = (s: unknown) => A(s as Series).map((v) => Boolean(v));
  const trendUp = bool(ta.crossover(trendSeries, zero));
  const trendDown = bool(ta.crossunder(trendSeries, zero));
  const trendCross = bool(ta.cross(trendSeries, zero));
  // timer = ta.barssince(ta.cross(trend, 0))
  const timer = A(ta.barssince(S(trendCross.map((x) => (x ? 1 : 0)))));
  const atr = A(ta.atr(bars, 14));
  // profile_upper = ta.highest(math.max(1, nz(timer))), profile_lower = ta.lowest(...): series length
  const highestSite = callsite.highest();
  const lowestSite = callsite.lowest();

  const allLines: LevelLine[] = [];
  const allLabels: Array<LabelData & { dead: boolean }> = [];
  // Running levels: line, volume and nvol of the swing bar
  const peaks: Array<{ line: LevelLine; vol: number; nvol: number }> = [];
  const valleys: Array<{ line: LevelLine; vol: number; nvol: number }> = [];

  const downLine: Array<{ time: number; value: number; color: string }> = [];
  const upLine: Array<{ time: number; value: number; color: string }> = [];
  const bear30 = String(color.new(cfg.bearColor, 30));
  const bull30 = String(color.new(cfg.bullColor, 30));
  const markers: MarkerData[] = [];
  const bull70 = String(color.new(cfg.bullColor, 70));
  const bear70 = String(color.new(cfg.bearColor, 70));
  const bull50 = String(color.new(cfg.bullColor, 50));
  const bear50 = String(color.new(cfg.bearColor, 50));
  let cumVol = 0;
  let profileUpper = NaN;
  let profileLower = NaN;

  for (let i = 0; i < n; i++) {
    const bar = bars[i];
    cumVol += Number.isNaN(volume[i]) ? 0 : volume[i];
    const prevHigh = i >= 1 ? high[i - 1] : NaN;
    const prevLow = i >= 1 ? low[i - 1] : NaN;
    const peakform = gt(prevHigh, bar.high) && gt(prevHigh, i >= 2 ? high[i - 2] : NaN);
    const valleyform = gt(bar.low, prevLow) && gt(i >= 2 ? low[i - 2] : NaN, prevLow);
    const prevNvol = i >= 1 ? nvol[i - 1] : NaN;
    const prevVol = i >= 1 ? volume[i - 1] : NaN;

    if (trend[i] < 0) {
      if (peakform && gt(upper[i], prevHigh)) {
        const line = register<LevelLine>(allLines, {
          dead: false, x1: i - 1, x2: i, y: prevHigh, color: String(color.new(cfg.bearColor, 100 - prevNvol)),
        }, MAX_LINES);
        peaks.push({ line, vol: prevVol, nvol: prevNvol });
      }
    } else if (trend[i] > 0 && gt(prevLow, lower[i])) {
      if (valleyform) {
        const line = register<LevelLine>(allLines, {
          dead: false, x1: i - 1, x2: i, y: prevLow, color: String(color.new(cfg.bullColor, 100 - prevNvol)),
        }, MAX_LINES);
        valleys.push({ line, vol: prevVol, nvol: prevNvol });
      }
    }

    let bullliq = 0;
    let bearliq = 0;
    let nBullliq = 0;
    let nBearliq = 0;

    // A line deleted by the count limit has an na price: it is never swept and stays in its array
    if (peaks.length > 0) {
      for (let k = peaks.length - 1; k >= 0; k--) {
        const level = peaks[k].line.dead ? NaN : peaks[k].line.y;
        if (gt(bar.high, level) || gt(level, upper[i])) {
          if (gt(bar.high, level)) {
            bearliq += peaks[k].vol;
            nBearliq += peaks[k].nvol;
          }
          peaks.splice(k, 1);
        } else {
          peaks[k].line.x2 = i;
        }
      }
      if (peaks.length > 500) peaks.shift()!.line.dead = true;
    }
    if (valleys.length > 0) {
      for (let k = valleys.length - 1; k >= 0; k--) {
        const level = valleys[k].line.dead ? NaN : valleys[k].line.y;
        if (gt(level, bar.low) || gt(lower[i], level)) {
          if (gt(level, bar.low)) {
            bullliq += valleys[k].vol;
            nBullliq += valleys[k].nvol;
          }
          valleys.splice(k, 1);
        } else {
          valleys[k].line.x2 = i;
        }
      }
      if (valleys.length > 500) valleys.shift()!.line.dead = true;
    }

    if (gt(bullliq, 0)) {
      if ((gt(thresh, nBullliq) && cfg.showMinor) || (gt(nBullliq, thresh) && cfg.showMajor)) {
        register(allLabels, {
          dead: false, time: bar.time, price: lower[i], text: str.tostring(bullliq, 'volume'), color: bull70,
          style: 'label_up', size: 'tiny',
        }, MAX_LABELS);
      }
    }
    if (gt(bearliq, 0)) {
      if ((gt(thresh, nBearliq) && cfg.showMinor) || (gt(nBearliq, thresh) && cfg.showMajor)) {
        register(allLabels, {
          dead: false, time: bar.time, price: upper[i], text: str.tostring(bearliq, 'volume'), color: bear70,
          style: 'label_down', size: 'tiny',
        }, MAX_LABELS);
      }
    }

    const volatility = atr[i] / 2;
    const profileLength = Math.max(1, Number.isNaN(timer[i]) ? 0 : timer[i]);
    profileUpper = highestSite(bar.high, profileLength);
    profileLower = lowestSite(bar.low, profileLength);

    downLine.push({ time: bar.time, value: trend[i] < 0 ? upper[i] : NaN, color: bear30 });
    upLine.push({ time: bar.time, value: trend[i] > 0 ? lower[i] : NaN, color: bull30 });

    // plotchar(..., location.absolute): a character at a price
    const char = (on: boolean, price: number, text: string, textColor: string, size?: 'tiny') => {
      if (on && !Number.isNaN(price)) {
        markers.push({
          time: bar.time, position: 'atPriceMiddle', price, shape: 'circle', color: 'transparent', text, textColor,
          ...(size ? { size } : {}),
        });
      }
    };
    const bullSwept = !Number.isNaN(bullliq) && !eq(bullliq, 0);
    const bearSwept = !Number.isNaN(bearliq) && !eq(bearliq, 0);
    char(bullSwept && gt(nBullliq, thresh), bar.low - volatility, '▲', cfg.bullColor, 'tiny');
    char(bearSwept && gt(nBearliq, thresh), bar.high + volatility, '▼', cfg.bearColor, 'tiny');
    char(bullSwept && gt(nBullliq, 0), bar.low - volatility, '△', cfg.bullColor);
    char(bearSwept && gt(nBearliq, 0), bar.high + volatility, '▽', cfg.bearColor);

    if (trendUp[i] && !Number.isNaN(lower[i])) {
      markers.push({
        time: bar.time, position: 'atPriceBottom', price: lower[i], shape: 'labelUp', color: bull50, text: '▲',
        textColor: chartFg, size: 'small',
      });
    }
    if (trendDown[i] && !Number.isNaN(upper[i])) {
      markers.push({
        time: bar.time, position: 'atPriceTop', price: upper[i], shape: 'labelDown', color: bear50, text: '▼',
        textColor: chartFg, size: 'small',
      });
    }
  }

  // The profile boxes are deleted and made again on every bar: those of the last bar remain
  const boxes: BoxData[] = [];
  const tables: TableData[] = [];
  const last = n - 1;
  const noVolume = n > 0 && eq(cumVol, 0);
  if (n > 0 && !noVolume) {
    const time = (index: number) => barTime(bars, index);
    // start_index = (bar_index - timer) + (end_index > (bar_index - timer) ? 1 : 0); na before the first trend
    const start = Number.isNaN(timer[last]) ? NaN : last - timer[last] + (timer[last] > 0 ? 1 : 0);
    if (!Number.isNaN(start)) {
      // profileCalculation(): rows between the lowest low and the highest high of the bars from start to last
      const hs = high.slice(start, last + 1);
      const ls = low.slice(start, last + 1);
      const vs = volume.slice(start, last + 1);
      const maxx = Math.max(...hs);
      const minn = Math.min(...ls);
      const step = (maxx - minn) / res;
      const tops: number[] = [];
      const bottoms: number[] = [];
      const binlen: number[] = [];
      for (let r = 0; r < res; r++) {
        const bottom = minn + r * step;
        const top = minn + (r + 1) * step;
        let binSize = 0;
        for (let j = 0; j < hs.length; j++) {
          const inBucket = !(gt(ls[j], top) || gt(bottom, hs[j]));
          binSize += inBucket ? vs[j] : 0;
        }
        bottoms.push(bottom);
        tops.push(top);
        binlen.push(binSize);
      }
      // array.max skips na values
      const known = binlen.filter((v) => !Number.isNaN(v));
      const binMax = known.length > 0 ? Math.max(...known) : NaN;
      if (cfg.showProfile) {
        const trendColor = trend[last] > 0 ? cfg.bullColor : cfg.bearColor;
        for (let r = 0; r < res; r++) {
          const right = last + 7 + scale;
          // box left: a float in the script, truncated to a bar index
          const left = Math.trunc(right - (Math.round(binlen[r]) / Math.round(binMax)) * scale);
          const gradient = color.from_gradient(
            Math.sin((binlen[r] * Math.PI) / binMax) * binMax, 0, binMax, trendColor, cfg.profileColor,
          );
          // A box with an na coordinate is not drawn
          if (!Number.isFinite(left) || Number.isNaN(tops[r]) || Number.isNaN(bottoms[r])) continue;
          boxes.push({
            time1: time(left), price1: tops[r], time2: time(right), price2: bottoms[r], borderColor: String(gradient),
            borderWidth: 1, borderStyle: 'solid', bgColor: String(color.new(gradient, 10)),
          });
        }
      }
      if (cfg.showBounds && !Number.isNaN(profileUpper) && !Number.isNaN(profileLower)) {
        boxes.push({
          time1: time(start), price1: profileUpper, time2: time(last + scale + 7), price2: profileLower,
          borderColor: String(color.new(chartFg, 90)), borderWidth: 1, borderStyle: 'solid',
          bgColor: String(color.new(chartFg, 95)),
        });
      }
    }
  }
  // No volume on any bar: the warning (unless dismissed)
  if (noVolume && !cfg.dismiss) {
    tables.push({
      position: 'middle_center', columns: 1, rows: 1,
      cells: [{
        column: 0, row: 0,
        text: '⚠️This ticker does not have volume data, please try another ticker or\n open settings to dismiss this warning',
        width: 80, height: 12, textColor: String(color.new(color.white, 20)), textSize: 'huge',
        bgColor: String(color.new('#747474', 50)),
      }],
    });
  }

  const lines: LineDrawingData[] = allLines.map((ln) => ({
    time1: bars[ln.x1].time, price1: ln.y, time2: bars[ln.x2].time, price2: ln.y, color: ln.color, width: 2,
  }));
  const labels: LabelData[] = allLabels.map(({ dead: _dead, ...label }) => label);

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: { plot0: downLine, plot1: upLine },
    markers,
    lines,
    boxes,
    labels,
    tables,
  };
}

export const LiquiditySweepFilter = { calculate, metadata, defaultInputs, inputConfig, plotConfig };
