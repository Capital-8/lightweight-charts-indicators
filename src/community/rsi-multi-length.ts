/**
 * RSI Multi Length [LuxAlgo]
 *
 * RSIs of every length from the Minimum Length to the Maximum Length (N lengths), each from running averages of
 * the source change and of its absolute value with alpha = 1 / length: rsi = 50 * num / den + 50. The average of
 * the N RSIs is drawn with a gradient colour between a lower and an upper channel. The upper channel moves toward
 * the average by the share of RSIs above the overbought level, the lower channel by the share of RSIs below the
 * oversold level. Two areas show these shares in percent (from 0 up for overbought, from 100 down for oversold),
 * and a table on the last bar gives them as text.
 *
 * Reference: "RSI Multi Length [LuxAlgo]" by LuxAlgo
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © LuxAlgo
 */

import {
  str, color, getSourceSeries, type IndicatorResult, type InputConfig, type PlotConfig, type Bar, type SourceType,
} from 'oakscriptjs';
import type { TableData } from '../types';

export interface RSIMultiLengthInputs {
  /** Maximum RSI length */
  max: number;
  /** Minimum RSI length */
  min: number;
  /** Overbought level */
  overbought: number;
  /** Oversold level */
  oversold: number;
  /** Source */
  src: SourceType;
  /** Gradient colour of the average RSI at the lower channel */
  rsiAvgDnCss: string;
  /** Gradient colour of the average RSI at the upper channel */
  rsiAvgUpCss: string;
  /** Upper channel colour */
  upperCss: string;
  /** Lower channel colour */
  lowerCss: string;
  /** Overbought area colour */
  obArea: string;
  /** Oversold area colour */
  osArea: string;
}

export const defaultInputs: RSIMultiLengthInputs = {
  max: 20,
  min: 10,
  overbought: 70,
  oversold: 30,
  src: 'close',
  rsiAvgDnCss: '#ff5d00',
  rsiAvgUpCss: '#2157f3',
  upperCss: '#0cb51a',
  lowerCss: '#ff1100',
  // color.new(#0cb51a, 70) / color.new(#ff1100, 70) as input defaults: alpha 0.3 (byte 77)
  obArea: 'rgba(12, 181, 26, 0.3)',
  osArea: 'rgba(255, 17, 0, 0.3)',
};

export const inputConfig: InputConfig[] = [
  { id: 'max', type: 'int', title: 'Maximum Length', defval: 20 },
  { id: 'min', type: 'int', title: 'Minimum Length', defval: 10 },
  { id: 'overbought', type: 'float', title: 'overbought', defval: 70, step: 10 },
  { id: 'oversold', type: 'float', title: 'oversold', defval: 30, step: 10 },
  { id: 'src', type: 'source', title: 'src', defval: 'close' },
  { id: 'rsiAvgDnCss', type: 'color', title: 'Average RSI Gradient', defval: '#ff5d00', group: 'Style', inline: 'inline1' },
  { id: 'rsiAvgUpCss', type: 'color', title: '', defval: '#2157f3', group: 'Style', inline: 'inline1' },
  { id: 'upperCss', type: 'color', title: 'Upper Level', defval: '#0cb51a', group: 'Style' },
  { id: 'lowerCss', type: 'color', title: 'Lower Level', defval: '#ff1100', group: 'Style' },
  { id: 'obArea', type: 'color', title: 'Overbought Area', defval: 'rgba(12, 181, 26, 0.3)', group: 'Style' },
  { id: 'osArea', type: 'color', title: 'Oversold Area', defval: 'rgba(255, 17, 0, 0.3)', group: 'Style' },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Average Multi Length RSI', color: '#2157f3', lineWidth: 1 },
  { id: 'plot1', title: 'Upper Channel', color: '#0cb51a', lineWidth: 1 },
  { id: 'plot2', title: 'Lower Channel', color: '#ff1100', lineWidth: 1 },
  { id: 'plot3', title: 'Overbought Area', color: 'transparent', lineWidth: 1 },
  { id: 'plot4', title: 'Oversold Area', color: 'transparent', lineWidth: 1 },
  { id: 'plot5', title: 'Upper', color: 'transparent', lineWidth: 1, display: 'none' },
  { id: 'plot6', title: 'Lower', color: 'transparent', lineWidth: 1, display: 'none' },
];

export const metadata = {
  title: 'RSI Multi Length [LuxAlgo]',
  shortTitle: 'RSI Multi Length [LuxAlgo]',
  overlay: false,
};

const GRAY = '#787B86';

export function calculate(bars: Bar[], inputs: Partial<RSIMultiLengthInputs> = {}): IndicatorResult & { tables: TableData[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const maxLen = Math.trunc(cfg.max);
  const minLen = Math.trunc(cfg.min);
  const N = maxLen - minLen + 1;
  if (N < 0) throw new Error(`Invalid value of the 'size' argument (${N}) in the 'array.new_float' function. It must be >= 0.`);
  const src = getSourceSeries(bars, cfg.src).toArray().map((v) => v ?? NaN);
  const nz = (v: number, r = 0) => (isNaN(v) ? r : v);

  // var num = array.new_float(N, 0); var den = array.new_float(N, 0)
  const num = new Array<number>(N).fill(0);
  const den = new Array<number>(N).fill(0);
  // for i = min to max (counts down when min > max)
  const lengths: number[] = [];
  for (let l = minLen; minLen <= maxLen ? l <= maxLen : l >= maxLen; l += minLen <= maxLen ? 1 : -1) lengths.push(l);

  const avgRsi: number[] = new Array(n);
  const buyMa: number[] = new Array(n);
  const sellMa: number[] = new Array(n);
  const overbuyArr: number[] = new Array(n);
  const oversellArr: number[] = new Array(n);
  for (let i = 0; i < n; i++) {
    const diff = nz(i > 0 ? src[i] - src[i - 1] : NaN);
    let k = 0;
    let overbuy = 0;
    let oversell = 0;
    let avg = 0;
    for (const l of lengths) {
      if (k >= N) throw new Error(`Index ${k} is out of bounds, array size is ${N}`);
      const alpha = 1 / l;
      const numRma = alpha * diff + (1 - alpha) * num[k];
      const denRma = alpha * Math.abs(diff) + (1 - alpha) * den[k];
      // 0 / 0 is na (a flat start): the average is na on that bar
      const rsi = (50 * numRma) / denRma + 50;
      avg += rsi;
      overbuy = rsi - cfg.overbought > 1e-10 ? overbuy + 1 : overbuy;
      oversell = cfg.oversold - rsi > 1e-10 ? oversell + 1 : oversell;
      num[k] = numRma;
      den[k] = denRma;
      k += 1;
    }
    const a = avg / N;
    avgRsi[i] = a;
    overbuyArr[i] = overbuy;
    oversellArr[i] = oversell;
    // buy_rsi_ma := nz(buy_rsi_ma[1] + overbuy / N * (avg_rsi - buy_rsi_ma[1]), avg_rsi)
    const pb = i > 0 ? buyMa[i - 1] : NaN;
    const ps = i > 0 ? sellMa[i - 1] : NaN;
    buyMa[i] = nz(pb + (overbuy / N) * (a - pb), a);
    sellMa[i] = nz(ps + (oversell / N) * (a - ps), a);
  }

  // css = color.from_gradient(avg_rsi, sell_rsi_ma, buy_rsi_ma, rsi_avg_dn_css, rsi_avg_up_css)
  const css = bars.map((_b, i) => color.from_gradient(avgRsi[i], sellMa[i], buyMa[i], cfg.rsiAvgDnCss, cfg.rsiAvgUpCss));
  const cssStr = css.map((c) => (c == null ? 'transparent' : String(c)));
  const overColor = String(color.new(cfg.obArea, 100));
  const underColor = String(color.new(cfg.osArea, 100));

  const P = (f: (i: number) => number, col: (i: number) => string) =>
    bars.map((b, i) => ({ time: b.time, value: f(i), color: col(i) }));

  const tables: TableData[] = [];
  if (n > 0) {
    // if barstate.islast: the table of the last bar
    const last = n - 1;
    tables.push({
      position: 'top_right', columns: 2, rows: 2,
      cells: [
        { column: 0, row: 0, text: 'Overbought', textColor: GRAY, bgColor: 'transparent', textSize: 'auto' },
        { column: 1, row: 0, text: 'Oversold', textColor: GRAY, bgColor: 'transparent', textSize: 'auto' },
        { column: 0, row: 1, text: str.tostring((overbuyArr[last] / N) * 100, '#.##') + ' %', textColor: '#26a69a',
          bgColor: String(color.new('#26a69a', 80)), textSize: 'auto' },
        { column: 1, row: 1, text: str.tostring((oversellArr[last] / N) * 100, '#.##') + ' %', textColor: '#ef5350',
          bgColor: String(color.new('#ef5350', 80)), textSize: 'auto' },
      ],
    });
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {
      plot0: P((i) => avgRsi[i], (i) => cssStr[i]),
      plot1: P((i) => buyMa[i], () => cfg.upperCss),
      plot2: P((i) => sellMa[i], () => cfg.lowerCss),
      plot3: P((i) => (overbuyArr[i] / N) * 100, () => overColor),
      plot4: P((i) => 100 - (oversellArr[i] / N) * 100, () => underColor),
      plot5: P(() => 100, () => 'transparent'),
      plot6: P(() => 0, () => 'transparent'),
    },
    hlines: [{ value: 50, options: { title: 'Level', color: String(color.new(GRAY, 50)), linestyle: 'dashed' } }],
    fills: [
      // fill(per_over, lower, ob_area)
      { plot1: 'plot3', plot2: 'plot6', options: { title: 'Plots Background', color: cfg.obArea } },
      // fill(upper, per_under, os_area)
      { plot1: 'plot5', plot2: 'plot4', options: { title: 'Plots Background', color: cfg.osArea } },
      // fill(up, dn, color.new(css, 90))
      { plot1: 'plot1', plot2: 'plot2', options: { title: 'Plots Background' },
        colors: css.map((c) => String(color.new(c as string, 90))) },
    ],
    tables,
  };
}

export const RSIMultiLength = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
};
