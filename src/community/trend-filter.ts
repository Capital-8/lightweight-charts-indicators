/**
 * Trend Filter (2-pole)
 *
 * Two-pole filter of the close: f1 = f1[1] + alpha * (close - f1[1]), f2 = f2[1] + beta * (f1 - f2[1]) with
 * omega = 2 * pi / length, alpha = damping * omega, beta = omega^2 (na previous values count as 0).
 * The filter rises when it is above its value 2 bars back and falls when it is below; a counter counts the rising
 * (or falling) bars in a row. The line colour goes from the neutral colour to the up (down) colour as the counter
 * goes from 0 to 15. After `ris_fal` rising (falling) bars a circle is drawn ATR(200) * bands below (above) the
 * filter. Optional signals: a triangle when the counter crosses above `ris_fal`, drawn on the previous bar.
 * Optional bar colours with the line colour.
 *
 * Last bar: a signal triangle needs a closed bar. The port reads the state of the last bar from the optional third
 * argument (see src/chart-context.ts); without it every bar is taken as closed.
 *
 * Reference: "Trend Filter (2-pole) [BigBeluga]" by BigBeluga
 * Licence: Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International, as the original Pine script (https://creativecommons.org/licenses/by-nc-sa/4.0/).
 */

import { ta, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { MarkerData, BarColorData } from '../types';
import { lastBarConfirmedOf, type ChartContext } from '../chart-context';

export interface TrendFilterInputs {
  /** Length of the filter */
  length: number;
  /** Damping factor */
  damping: number;
  /** Rising and falling bars in a row before a circle */
  risFal: number;
  /** ATR(200) multiplier of the circle distance */
  bands: number;
  /** Up colour */
  upCol: string;
  /** Down colour */
  dnCol: string;
  /** Neutral colour */
  neutralCol: string;
  /** Colour the bars */
  barCol: boolean;
  /** Show the signal triangles */
  signals: boolean;
}

export const defaultInputs: TrendFilterInputs = {
  length: 20,
  damping: 0.9,
  risFal: 5,
  bands: 1.0,
  upCol: color.lime,
  dnCol: color.red,
  neutralCol: color.yellow,
  barCol: false,
  signals: false,
};

export const inputConfig: InputConfig[] = [
  { id: 'length', type: 'int', title: 'Length', defval: 20 },
  { id: 'damping', type: 'float', title: 'Damping', defval: 0.9, min: 0.1, max: 1.0, step: 0.01 },
  { id: 'risFal', type: 'int', title: 'Rising and Falling', defval: 5 },
  { id: 'bands', type: 'float', title: 'Bands', defval: 1.0, min: 0.5, step: 0.1 },
  { id: 'upCol', type: 'color', title: '↑', defval: color.lime },
  { id: 'dnCol', type: 'color', title: '↓', defval: color.red },
  { id: 'neutralCol', type: 'color', title: '〜', defval: color.yellow },
  { id: 'barCol', type: 'bool', title: 'BarColor', defval: false },
  { id: 'signals', type: 'bool', title: 'Signals', defval: false },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Two-Pole Filter', color: color.yellow, lineWidth: 3 },
];

export const metadata = {
  title: 'Trend Filter (2-pole)',
  shortTitle: 'Trend Filter',
  overlay: true,
};

export function calculate(bars: Bar[], inputs: Partial<TrendFilterInputs> = {}, chart?: ChartContext): Omit<IndicatorResult, 'markers'> & {
  markers: MarkerData[];
  barColors: BarColorData[];
} {
  // barstate.isconfirmed: every bar is closed, except the last one when the chart context says that it is still open
  const lastBarOpen = !lastBarConfirmedOf(chart);
  const barIsConfirmed = (index: number) => !(lastBarOpen && index === bars.length - 1);
  const { length, damping, risFal, bands, upCol, dnCol, neutralCol, barCol, signals } = { ...defaultInputs, ...inputs };
  const n = bars.length;

  // atr = ta.atr(200) * bands
  const atrArr = ta.atr(bars, 200).toArray().map((v) => (v ?? NaN) * bands);

  // two_pole_filter(close, length, damping)
  const omega = 2.0 * Math.PI / length;
  const alpha = damping * omega;
  const beta = Math.pow(omega, 2);
  const tpf: number[] = new Array(n);
  let f1 = NaN;
  let f2 = NaN;
  for (let i = 0; i < n; i++) {
    const f1Prev = isNaN(f1) ? 0 : f1;
    f1 = f1Prev + alpha * (bars[i].close - f1Prev);
    const f2Prev = isNaN(f2) ? 0 : f2;
    f2 = f2Prev + beta * (f1 - f2Prev);
    tpf[i] = f2;
  }

  const plot0: { time: number; value: number; color?: string }[] = [];
  const markers: MarkerData[] = [];
  const barColors: BarColorData[] = [];
  const colArr: string[] = new Array(n);

  let rising = 0;
  let falling = 0;
  let prevRising = NaN;
  let prevFalling = NaN;
  for (let i = 0; i < n; i++) {
    // up = tp_f > tp_f[2]; dn = tp_f < tp_f[2] (false while tp_f[2] is na)
    const prev2 = i >= 2 ? tpf[i - 2] : NaN;
    const up = tpf[i] > prev2;
    const dn = tpf[i] < prev2;
    if (up) {
      rising += 1;
      falling = 0;
    }
    if (dn) {
      rising = 0;
      falling += 1;
    }
    const col: string = String(up
      ? color.from_gradient(rising, 0, 15, neutralCol, upCol)
      : dn
        ? color.from_gradient(falling, 0, 15, neutralCol, dnCol)
        : neutralCol);
    colArr[i] = col;

    plot0.push({ time: bars[i].time, value: tpf[i], color: col });

    // plotshape(falling >= ris_fal ? tp_f + atr : na, "Falling", shape.circle, location.absolute, color = color)
    const atr = atrArr[i];
    if (falling >= risFal && !isNaN(atr)) {
      markers.push({ time: bars[i].time, position: 'atPriceMiddle', price: tpf[i] + atr, shape: 'circle', color: col });
    }
    // plotshape(rising >= ris_fal ? tp_f - atr : na, "Rising", shape.circle, location.absolute, color = color)
    if (rising >= risFal && !isNaN(atr)) {
      markers.push({ time: bars[i].time, position: 'atPriceMiddle', price: tpf[i] - atr, shape: 'circle', color: col });
    }

    // sig_up = ta.crossover(rising, ris_fal) and barstate.isconfirmed and signals
    const sigUp = signals && barIsConfirmed(i) && !isNaN(prevRising) && rising > risFal && prevRising <= risFal;
    const sigDn = signals && barIsConfirmed(i) && !isNaN(prevFalling) && falling > risFal && prevFalling <= risFal;
    // plotshape(sig_dn ? tp_f[1] + atr : na, "Falling", shape.triangledown, location.absolute, color = color,
    //   size = size.tiny, offset = -1): drawn on the previous bar
    if (sigDn && i >= 1 && !isNaN(atr)) {
      markers.push({
        time: bars[i - 1].time, position: 'atPriceMiddle', price: tpf[i - 1] + atr, shape: 'triangleDown',
        color: col, size: 'tiny',
      });
    }
    if (sigUp && i >= 1 && !isNaN(atr)) {
      markers.push({
        time: bars[i - 1].time, position: 'atPriceMiddle', price: tpf[i - 1] - atr, shape: 'triangleUp',
        color: col, size: 'tiny',
      });
    }

    // barcolor(bar_col ? color : na)
    if (barCol) barColors.push({ time: bars[i].time, color: col });

    prevRising = rising;
    prevFalling = falling;
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: { plot0 },
    markers,
    barColors,
  };
}

export const TrendFilter = { calculate, metadata, defaultInputs, inputConfig, plotConfig };
