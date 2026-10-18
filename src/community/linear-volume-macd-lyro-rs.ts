/**
 * Linear Volume MACD | Lyro RS
 *
 * A MACD of volume-weighted EMAs: fast / slow = ema(src * volume, len) / ema(volume, len), macd = fast - slow,
 * signal = ema(macd, signal length), hist = macd - signal. The plotted histogram is the linear regression of hist
 * (Linear Regression and Strong/Weak Trend modes) or hist itself (Volume MACD mode), with SMA +- 1 and 2 standard
 * deviation bands (stdev multiplier / 2 and stdev multiplier). The histogram and bar colour is up / down: by the
 * sign of the regression (Linear Regression), by the regression rising or not (Strong/Weak Trend) or by the sign of
 * hist (Volume MACD). The background is coloured beyond the 2-stdev bands, in the indicator pane and on the price
 * pane.
 * Alerts (alertcondition, `alerts` of the result): bull / bear state of each signal type (var states, set only while
 * that type is selected, 0 before).
 *
 * Reference: "Linear Volume MACD | Lyro RS" by LyroRS
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © LyroRS
 */

import { ta, Series, getSourceSeries, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar, type SourceType } from 'oakscriptjs';
import type { BarColorData, BgColorData } from '../types';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

export interface LinearVolumeMacdLyroRsInputs {
  src: SourceType;
  sigType: 'Linear Regression' | 'Strong/Weak Trend' | 'Volume MACD';
  fastLength: number;
  slowLength: number;
  signalLength: number;
  /** Linear regression length */
  lrLength: number;
  stdevLength: number;
  /** Multiplier of the 2-stdev bands (the 1-stdev bands use half of it) */
  stdevMult: number;
  colMode: 'Classic' | 'Mystic' | 'Accented' | 'Royal';
  /** Use the custom up / down colours instead of the palette */
  cpyn: boolean;
  cpUpC: string;
  cpDnC: string;
}

export const defaultInputs: LinearVolumeMacdLyroRsInputs = {
  src: 'close',
  sigType: 'Linear Regression',
  fastLength: 12,
  slowLength: 21,
  signalLength: 5,
  lrLength: 35,
  stdevLength: 200,
  stdevMult: 2,
  colMode: 'Mystic',
  cpyn: true,
  cpUpC: '#00ff00',
  cpDnC: '#ff0000',
};

const CORE = '𝗖𝗢𝗥𝗘';
const STDEV = '𝗦𝗧𝗗𝗘𝗩 𝗕𝗔𝗡𝗗𝗦';
const COLORS = '𝗖𝗢𝗟𝗢𝗥𝗦';

export const inputConfig: InputConfig[] = [
  { id: 'src', type: 'source', title: 'Source', defval: 'close' },
  { id: 'sigType', type: 'string', title: 'Signal Type', defval: 'Linear Regression', options: ['Linear Regression', 'Strong/Weak Trend', 'Volume MACD'], group: CORE },
  { id: 'fastLength', type: 'int', title: 'Fast Length', defval: 12, group: CORE },
  { id: 'slowLength', type: 'int', title: 'Slow Length', defval: 21, group: CORE },
  { id: 'signalLength', type: 'int', title: 'Signal Smoothing', defval: 5, group: CORE },
  { id: 'lrLength', type: 'int', title: 'LR Length', defval: 35, group: CORE },
  { id: 'stdevLength', type: 'int', title: 'Stdev Length', defval: 200, group: STDEV },
  { id: 'stdevMult', type: 'float', title: 'Stdev Multiplier', defval: 2, group: STDEV },
  { id: 'colMode', type: 'string', title: 'Custom Color Palette', defval: 'Mystic', options: ['Classic', 'Mystic', 'Accented', 'Royal'], group: COLORS, inline: 'drop', display: 'none' },
  { id: 'cpyn', type: 'bool', title: 'Use Custom Palette', defval: true, group: COLORS, display: 'none' },
  { id: 'cpUpC', type: 'color', title: 'Custom Up', defval: '#00ff00', group: COLORS, inline: 'Custom Palette', display: 'none' },
  { id: 'cpDnC', type: 'color', title: 'Custom Down', defval: '#ff0000', group: COLORS, inline: 'Custom Palette', display: 'none' },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Zero Line', color: String(color.new('#787B86', 50)), lineWidth: 1 },
  { id: 'plot1', title: 'Histogram', color: '#00ff00', lineWidth: 1, style: 'columns' },
  { id: 'plot2', title: '-2 Stdev', color: String(color.new('#00ff00', 50)), lineWidth: 1 },
  { id: 'plot3', title: '-1 Stdev', color: String(color.new('#00ff00', 50)), lineWidth: 1 },
  { id: 'plot4', title: '+2 Stdev', color: String(color.new('#ff0000', 50)), lineWidth: 1 },
  { id: 'plot5', title: '+1 Stdev', color: String(color.new('#ff0000', 50)), lineWidth: 1 },
];

export const metadata = {
  title: 'Linear Volume MACD | Lyro RS',
  shortTitle: 'Linear Volume MACD | 𝓛𝔂𝓻𝓸 𝓡𝓢',
  overlay: false,
};

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const ge = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(b - a > EPS);
const le = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(a - b > EPS);

const PALETTES: Record<LinearVolumeMacdLyroRsInputs['colMode'], [string, string]> = {
  Classic: ['#00E676', '#880E4F'],
  Mystic: ['#30FDCF', '#E117B7'],
  Accented: ['#9618F7', '#FF0078'],
  Royal: ['#FFC107', '#673AB7'],
};

export function calculate(
  bars: Bar[],
  inputs: Partial<LinearVolumeMacdLyroRsInputs> = {},
): IndicatorResult & { barColors: BarColorData[]; bgColors: BgColorData[] } & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  // Plain divisions can give +-infinity: oakscriptjs averages get NaN (Pine skips infinity like na)
  const S = (a: number[]) => Series.fromArray(bars, a.map((v) => (Number.isFinite(v) ? v : NaN)));
  const [upC, dnC] = cfg.cpyn ? [cfg.cpUpC, cfg.cpDnC] : PALETTES[cfg.colMode];

  const src = A(getSourceSeries(bars, cfg.src));
  const vol = bars.map((b) => b.volume ?? NaN);
  const pv = S(src.map((v, i) => v * vol[i]));
  const volS = S(vol);
  // fast_ma = ta.ema(src * volume, fast_length) / ta.ema(volume, fast_length)
  const fastNum = A(ta.ema(pv, cfg.fastLength));
  const fastDen = A(ta.ema(volS, cfg.fastLength));
  const slowNum = A(ta.ema(pv, cfg.slowLength));
  const slowDen = A(ta.ema(volS, cfg.slowLength));
  const macd = bars.map((_b, i) => fastNum[i] / fastDen[i] - slowNum[i] / slowDen[i]);
  const signal = A(ta.ema(S(macd), cfg.signalLength));
  const hist = macd.map((m, i) => m - signal[i]);
  const macdLr = A(ta.linreg(S(hist), cfg.lrLength, 0));

  // stdv_bands(sig_type == "Volume MACD" ? hist : macd_lr, stdev_length, mult)
  const histType = cfg.sigType === 'Volume MACD' ? hist : macdLr;
  const htS = S(histType);
  const base = A(ta.sma(htS, cfg.stdevLength));
  const sd = A(ta.stdev(htS, cfg.stdevLength));
  const dev1 = sd.map((v) => (cfg.stdevMult / 2) * v);
  const dev2 = sd.map((v) => cfg.stdevMult * v);
  const u1 = base.map((b, i) => b + dev1[i]);
  const l1 = base.map((b, i) => b - dev1[i]);
  const u2 = base.map((b, i) => b + dev2[i]);
  const l2 = base.map((b, i) => b - dev2[i]);

  // var color pc = na: the histogram and bar colour by the signal type
  const pc: (string | null)[] = new Array(n);
  let cur: string | null = null;
  // var int lr_s = 0, swt_s = 0, vmacd_s = 0: the signal state of each type (alerts)
  const lrS: number[] = new Array(n);
  const swtS: number[] = new Array(n);
  const vmS: number[] = new Array(n);
  let lr = 0, swt = 0, vm = 0;
  for (let i = 0; i < n; i++) {
    if (cfg.sigType === 'Linear Regression') {
      if (gt(macdLr[i], 0)) { cur = upC; lr = 1; }
      if (lt(macdLr[i], 0)) { cur = dnC; lr = -1; }
    } else if (cfg.sigType === 'Strong/Weak Trend') {
      // Both branches (macd_lr >= 0 or not, na included): macd_lr[1] < macd_lr ? UpC : DnC
      const prev = i > 0 ? macdLr[i - 1] : NaN;
      const up = lt(prev, macdLr[i]);
      cur = up ? upC : dnC;
      swt = up ? 1 : -1;
    } else {
      if (ge(hist[i], 0)) { cur = upC; vm = 1; }
      else if (le(hist[i], 0)) { cur = dnC; vm = -1; }
    }
    pc[i] = cur;
    lrS[i] = lr;
    swtS[i] = swt;
    vmS[i] = vm;
  }

  const fin = (v: number) => (Number.isFinite(v) ? v : NaN);
  const zeroCol = String(color.new('#787B86', 50));
  const upBand = String(color.new(upC, 50));
  const dnBand = String(color.new(dnC, 50));
  const upFill = String(color.new(upC, 75));
  const dnFill = String(color.new(dnC, 75));

  const barColors: BarColorData[] = [];
  const bgColors: BgColorData[] = [];
  for (let i = 0; i < n; i++) {
    const t = bars[i].time;
    // barcolor(pc, title = "Bar Color")
    if (pc[i] !== null) barColors.push({ time: t, color: pc[i] as string, id: 'barcolor0' });
    // bgcolor(hist_type > u2 ? color.new(DnC, 75) : hist_type < l2 ? color.new(UpC, 75) : na), in the indicator pane
    // and again with force_overlay = true on the price pane
    const bg = gt(histType[i], u2[i]) ? dnFill : lt(histType[i], l2[i]) ? upFill : null;
    if (bg !== null) {
      bgColors.push({ time: t, color: bg, id: 'bgcolor0' });
      bgColors.push({ time: t, color: bg, forceOverlay: true, id: 'bgcolor1' });
    }
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {
      plot0: bars.map((b) => ({ time: b.time, value: 0, color: zeroCol })),
      // plot(hist_type, "Histogram", style = plot.style_columns, color = pc)
      plot1: bars.map((b, i) => ({ time: b.time, value: fin(histType[i]), color: pc[i] ?? 'transparent' })),
      plot2: bars.map((b, i) => ({ time: b.time, value: fin(l2[i]), color: upBand })),
      plot3: bars.map((b, i) => ({ time: b.time, value: fin(l1[i]), color: upBand })),
      plot4: bars.map((b, i) => ({ time: b.time, value: fin(u2[i]), color: dnBand })),
      plot5: bars.map((b, i) => ({ time: b.time, value: fin(u1[i]), color: dnBand })),
    },
    fills: [
      // fill(pl2, pl1, color.new(UpC, 75)); fill(pu2, pu1, color.new(DnC, 75))
      { plot1: 'plot2', plot2: 'plot3', colors: new Array<string>(n).fill(upFill) },
      { plot1: 'plot4', plot2: 'plot5', colors: new Array<string>(n).fill(dnFill) },
      // fill(pu1, zline, color.new(DnC, 75)); fill(pl1, zline, color.new(UpC, 75))
      { plot1: 'plot5', plot2: 'plot0', colors: new Array<string>(n).fill(dnFill) },
      { plot1: 'plot3', plot2: 'plot0', colors: new Array<string>(n).fill(upFill) },
    ],
    barColors,
    bgColors,
    alerts: alertStates(alertConditions, bars, [
      lrS.map((v) => v === 1), lrS.map((v) => v === -1),
      swtS.map((v) => v === 1), swtS.map((v) => v === -1),
      vmS.map((v) => v === 1), vmS.map((v) => v === -1),
    ]),
  };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'Linear Volume MACD - Linear Regression Bull', message: 'Linear Volume MACD, linear regression mode is bullish {{exchange}}:{{ticker}}' },
  { id: 'alert1', title: 'Linear Volume MACD - Linear Regression Bearish', message: 'Linear Volume MACD, linear regression mode is bearish {{exchange}}:{{ticker}}' },
  { id: 'alert2', title: 'Linear Volume MACD - Strong/Weak Trend Bull', message: 'Linear Volume MACD, strong/weak trend mode is bullish {{exchange}}:{{ticker}}' },
  { id: 'alert3', title: 'Linear Volume MACD - Strong/Weak Trend Bearish', message: 'Linear Volume MACD, strong/weak trend mode is bearish {{exchange}}:{{ticker}}' },
  { id: 'alert4', title: 'Linear Volume MACD - Volume MACD Bull', message: 'Linear Volume MACD, volume MACD mode is bullish {{exchange}}:{{ticker}}' },
  { id: 'alert5', title: 'Linear Volume MACD - Volume MACD Bearish', message: 'Linear Volume MACD, volume MACD mode is bearish {{exchange}}:{{ticker}}' },
];

export const LinearVolumeMacdLyroRs = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  alertConditions,
};
