/**
 * Crosby Ratio | QuantumResearch
 *
 * The slope angle of an SMA of a 5-bar average of the Heikin-Ashi close (ohlc4): Crosby ratio =
 * atan2(100 * (ma - ma[1]), length * atr(length)) * 180 / (2 * pi). The script's atan2 keeps its last angle (start 0)
 * when no branch applies (an na argument or a zero x and y), so the warm-up bars before the ATR show 0. The line fades
 * from transparent at 0 to the up colour at +3 and to the down colour at -3; gradient zones at 13.464..20.285 and
 * -18.25..-9.472, a zero line, and a price-pane background when the ratio is above 18 / below -15.
 *
 * Last bar: on an open bar the Heikin-Ashi close of the previous bar is used. The port reads the state of the last
 * bar from the optional third argument (see src/chart-context.ts); without it every bar is taken as closed.
 *
 * Reference: "Crosby Ratio | QuantumResearch " by QuantumResearch
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © Rocheur
 */

import { ta, Series, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { BgColorData } from '../types';
import { lastBarConfirmedOf, type ChartContext } from '../chart-context';

type ColorMode = 'Classic' | 'Classic2' | 'Classic3' | 'Classic4' | 'Classic5' | 'Classic6' | 'Classic7' | 'Classic8';

export interface CrosbyRatioQuantumresearchInputs {
  /** Colour mode (up / down colour pair) */
  colMode: ColorMode;
  /** SMA and ATR length */
  length: number;
  /** Upper threshold (an input of the script that it does not use: the background uses 18) */
  upperThreshold: number;
  /** Lower threshold (an input of the script that it does not use: the background uses -15) */
  lowerThreshold: number;
  showBgcolor: boolean;
}

export const defaultInputs: CrosbyRatioQuantumresearchInputs = {
  colMode: 'Classic2',
  length: 30,
  upperThreshold: 18.0,
  lowerThreshold: -15.0,
  showBgcolor: true,
};

const MODES: ColorMode[] = ['Classic', 'Classic2', 'Classic3', 'Classic4', 'Classic5', 'Classic6', 'Classic7', 'Classic8'];

export const inputConfig: InputConfig[] = [
  { id: 'colMode', type: 'string', title: 'Color mode', defval: 'Classic2', options: MODES, group: 'Visual | 𝙌𝙪𝙖𝙣𝙩𝙪𝙢𝙍𝙚𝙨𝙚𝙖𝙧𝙘𝙝' },
  { id: 'length', type: 'int', title: 'Length', defval: 30, min: 1, group: 'Settings' },
  { id: 'upperThreshold', type: 'float', title: 'Upper Threshold', defval: 18.0, group: 'Thresholds' },
  { id: 'lowerThreshold', type: 'float', title: 'Lower Threshold', defval: -15.0, group: 'Thresholds' },
  { id: 'showBgcolor', type: 'bool', title: 'Show Background Color', defval: true, group: 'Plot' },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Upper Zone Bottom', color: color.blue, lineWidth: 1, display: 'none' },
  { id: 'plot1', title: 'Upper Zone Top', color: color.blue, lineWidth: 1, display: 'none' },
  { id: 'plot2', title: 'Lower Zone Top', color: color.blue, lineWidth: 1, display: 'none' },
  { id: 'plot3', title: 'Lower Zone Bottom', color: color.blue, lineWidth: 1, display: 'none' },
  { id: 'plot4', title: 'Crosby Ratio', color: '#10cab8', lineWidth: 2 },
];

export const metadata = {
  title: 'Crosby Ratio | QuantumResearch ',
  shortTitle: 'Crosby Ratio | QuantumResearch ',
  overlay: false,
};

/** Pine float comparisons: a > b only when a - b > 1e-10, a == b within 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const ge = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(b - a > EPS);
const eq = (a: number, b: number) => !isNaN(a) && !isNaN(b) && Math.abs(a - b) <= EPS;

/** No colour (Pine color(na)): from_gradient treats alpha 0 as na */
const NA_COLOR = '#00000000';

function modeColors(mode: ColorMode): [string, string] {
  switch (mode) {
    case 'Classic': return [color.rgb(0, 255, 187), color.rgb(255, 0, 157)];
    case 'Classic2': return ['#10cab8', color.blue];
    case 'Classic3': return ['#5ffae0', '#c22ed0'];
    case 'Classic4': return ['#ffbb00', '#770737'];
    case 'Classic5': return ['#9618f7', '#ff0078'];
    case 'Classic6': return ['#dee2e6', '#495057'];
    case 'Classic7': return ['#049ef7', color.white];
    case 'Classic8': return ['#00ffdd', '#ff0095'];
    default: throw new Error(`Unknown color mode ${String(mode)}`);
  }
}

export function calculate(
  bars: Bar[],
  inputs: Partial<CrosbyRatioQuantumresearchInputs> = {},
  chart?: ChartContext,
): IndicatorResult & { bgColors: BgColorData[] } {
  // barstate.isconfirmed: every bar is closed, except the last one when the chart context says that it is still open
  const lastBarOpen = !lastBarConfirmedOf(chart);
  const barIsConfirmed = (index: number) => !(lastBarOpen && index === bars.length - 1);
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const { length } = cfg;
  const [colUp1, colDn1] = modeColors(cfg.colMode);

  const atr = ta.atr(bars, length).toArray().map((v) => v ?? NaN);
  // Hclose = Heikin_ashi_close[barstate.isconfirmed ? 0 : 1]: on an open last bar, the value of the bar before
  const haClose = bars.map((b) => (b.open + b.low + b.close + b.high) / 4);
  const hclose = haClose.map((v, i) => (barIsConfirmed(i) ? v : i > 0 ? haClose[i - 1] : NaN));
  // math.avg(Hclose, Hclose[1], ..., Hclose[4]): na when one is na
  const smooth = hclose.map((_v, i) => (i >= 4
    ? (hclose[i] + hclose[i - 1] + hclose[i - 2] + hclose[i - 3] + hclose[i - 4]) / 5 : NaN));
  const ma = ta.sma(Series.fromArray(bars, smooth), length).toArray().map((v) => v ?? NaN);

  // atan2(y, x) with `var float angle = 0.0`: the angle is kept when no branch is taken
  let angle = 0.0;
  const crosby: number[] = new Array(n);
  for (let i = 0; i < n; i++) {
    const height = i > 0 ? ma[i] - ma[i - 1] : NaN;
    const y = 100 * height;
    const x = length * atr[i];
    if (gt(x, 0)) angle = Math.atan(y / x);
    else if (lt(x, 0) && ge(y, 0)) angle = Math.atan(y / x) + Math.PI;
    else if (lt(x, 0) && lt(y, 0)) angle = Math.atan(y / x) - Math.PI;
    else if (eq(x, 0) && gt(y, 0)) angle = Math.PI / 2;
    else if (eq(x, 0) && lt(y, 0)) angle = -Math.PI / 2;
    crosby[i] = (angle * 180) / (2 * Math.PI);
  }

  const P = (v: number) => bars.map((b) => ({ time: b.time, value: v }));
  const plot4 = bars.map((b, i) => {
    const c = crosby[i];
    // Crosby_ratio > 0 ? from_gradient(c, 0, 3, color(na), col_up1) : from_gradient(c, -3, 0, col_dn1, color(na))
    const col = gt(c, 0)
      ? color.from_gradient(c, 0, 3, NA_COLOR, colUp1)
      : color.from_gradient(c, -3, 0, colDn1, NA_COLOR);
    return { time: b.time, value: c, color: String(col) };
  });

  const bgColors: BgColorData[] = [];
  if (cfg.showBgcolor) {
    for (let i = 0; i < n; i++) {
      const c = gt(crosby[i], 18) ? colUp1 : lt(crosby[i], -15) ? colDn1 : null;
      if (c) bgColors.push({ time: bars[i].time, color: c, forceOverlay: true });
    }
  }

  const fillUp = String(color.new(colUp1, 75));
  const fillDn = String(color.new(colDn1, 75));
  const k = (v: number) => new Array<number>(n).fill(v);
  const c = (v: string) => new Array<string>(n).fill(v);

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {
      plot0: P(13.464),
      plot1: P(20.285),
      plot2: P(-9.472),
      plot3: P(-18.25),
      plot4,
    },
    hlines: [{ value: 0, options: { title: 'Zero Line', color: String(color.new('#917373', 59)), linestyle: 'dashed' } }],
    fills: [
      // fill(h1, h2, 20.285, 13.464, na, color.new(col_up1, 75))
      { plot1: 'plot0', plot2: 'plot1',
        gradient: { topValue: k(20.285), bottomValue: k(13.464), topColor: c('transparent'), bottomColor: c(fillUp) } },
      // fill(h3, h4, -9.472, -18.250, color.new(col_dn1, 75), na)
      { plot1: 'plot2', plot2: 'plot3',
        gradient: { topValue: k(-9.472), bottomValue: k(-18.25), topColor: c(fillDn), bottomColor: c('transparent') } },
    ],
    bgColors,
  };
}

export const CrosbyRatioQuantumresearch = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
};
