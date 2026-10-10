/**
 * Range Filter Buy and Sell 5min - guikroth version
 *
 * A range filter: the smoothed average range is an EMA (length 2 * period - 1) of the EMA (length period) of the
 * absolute bar-to-bar change of the source, times a multiplier. The filter follows the source but only moves when
 * the source leaves the band of that width around it. The filter line, a high and a low target band (filter +-
 * range) and the bars are coloured by the direction of the filter. A Buy label is drawn when the source is above a
 * rising filter after a sell state, a Sell label in the opposite case.
 *
 * Reference: "Range Filter Buy and Sell 5min" by PHVNTOM_TRADER (original script by DonovanWall, adapted by
 * guikroth)
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 */

import {
  ta, compare, color, Series, getSourceSeries, type IndicatorResult, type InputConfig, type PlotConfig, type Bar, type SourceType,
} from 'oakscriptjs';
import type { MarkerData, BarColorData } from '../types';

export interface RangeFilterBuySell5minInputs {
  /** Source */
  src: SourceType;
  /** Sampling Period */
  per: number;
  /** Range Multiplier */
  mult: number;
}

export const defaultInputs: RangeFilterBuySell5minInputs = {
  src: 'close',
  per: 100,
  mult: 3.0,
};

export const inputConfig: InputConfig[] = [
  { id: 'src', type: 'source', title: 'Source', defval: 'close' },
  { id: 'per', type: 'int', title: 'Sampling Period', defval: 100, min: 1 },
  { id: 'mult', type: 'float', title: 'Range Multiplier', defval: 3.0, min: 0.1 },
];

// Colours of the original Pine version
const UP_COLOR = '#FFFFFF';
const MID_COLOR = '#90bff9';
const DOWN_COLOR = '#2962FF';
const HIGH_TARGET = String(color.new(UP_COLOR, 70));
const LOW_TARGET = String(color.new(DOWN_COLOR, 70));
const HIGH_FILL = String(color.new(UP_COLOR, 90));
const LOW_FILL = String(color.new(DOWN_COLOR, 90));
const BUY_COLOR = String(color.new('#aaaaaa', 20));
const SELL_COLOR = String(color.new(DOWN_COLOR, 20));

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Range Filter', color: DOWN_COLOR, lineWidth: 2 },
  { id: 'plot1', title: 'High Target', color: HIGH_TARGET, lineWidth: 1 },
  { id: 'plot2', title: 'Low Target', color: LOW_TARGET, lineWidth: 1 },
];

export const metadata = {
  title: 'Range Filter Buy and Sell 5min',
  shortTitle: 'Range Filter',
  overlay: true,
};

export function calculate(
  bars: Bar[],
  inputs: Partial<RangeFilterBuySell5minInputs> = {},
): IndicatorResult & { markers: MarkerData[]; barColors: BarColorData[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const src = A(getSourceSeries(bars, cfg.src));
  const nz = (v: number) => (Number.isFinite(v) ? v : 0);

  // smoothrng(x, t, m): ta.ema(ta.ema(math.abs(x - x[1]), t), t * 2 - 1) * m
  const absChange = src.map((v, i) => (i > 0 ? Math.abs(v - src[i - 1]) : NaN));
  const avrng = ta.ema(Series.fromArray(bars, absChange), cfg.per);
  const smrng = A(ta.ema(avrng, cfg.per * 2 - 1)).map((v) => v * cfg.mult);

  const filt: number[] = new Array(n);
  const upward: number[] = new Array(n);
  const downward: number[] = new Array(n);
  const hband: number[] = new Array(n);
  const lband: number[] = new Array(n);
  const markers: MarkerData[] = [];
  const barColors: BarColorData[] = [];
  const filtColors: string[] = new Array(n);
  let condIni = 0;
  for (let i = 0; i < n; i++) {
    const x = src[i];
    const r = smrng[i];
    // rngfilt(x, r)
    const prev = i > 0 ? nz(filt[i - 1]) : 0;
    filt[i] = compare.gt(x, prev)
      ? (compare.lt(x - r, prev) ? prev : x - r)
      : (compare.gt(x + r, prev) ? prev : x + r);

    // Filter direction
    const f1 = i > 0 ? filt[i - 1] : NaN;
    const up1 = i > 0 ? nz(upward[i - 1]) : 0;
    const dn1 = i > 0 ? nz(downward[i - 1]) : 0;
    upward[i] = compare.gt(filt[i], f1) ? up1 + 1 : compare.lt(filt[i], f1) ? 0 : up1;
    downward[i] = compare.lt(filt[i], f1) ? dn1 + 1 : compare.gt(filt[i], f1) ? 0 : dn1;

    hband[i] = filt[i] + r;
    lband[i] = filt[i] - r;

    const s1 = i > 0 ? src[i - 1] : NaN;
    const above = compare.gt(x, filt[i]);
    const below = compare.lt(x, filt[i]);
    const rising = compare.gt(x, s1);
    const falling = compare.lt(x, s1);
    const longCond = (above && rising && upward[i] > 0) || (above && falling && upward[i] > 0);
    const shortCond = (below && falling && downward[i] > 0) || (below && rising && downward[i] > 0);

    filtColors[i] = upward[i] > 0 ? UP_COLOR : downward[i] > 0 ? DOWN_COLOR : MID_COLOR;
    barColors.push({ time: bars[i].time, color: longCond ? UP_COLOR : shortCond ? DOWN_COLOR : MID_COLOR });

    // CondIni := longCond ? 1 : shortCond ? -1 : CondIni[1]
    const condPrev = condIni;
    condIni = longCond ? 1 : shortCond ? -1 : condPrev;
    if (longCond && condPrev === -1) {
      markers.push({
        time: bars[i].time, position: 'belowBar', shape: 'labelUp', color: BUY_COLOR, text: 'Buy', textColor: UP_COLOR, size: 'small',
      });
    }
    if (shortCond && condPrev === 1) {
      markers.push({
        time: bars[i].time, position: 'aboveBar', shape: 'labelDown', color: SELL_COLOR, text: 'Sell', textColor: UP_COLOR, size: 'small',
      });
    }
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {
      plot0: bars.map((b, i) => ({ time: b.time, value: filt[i], color: filtColors[i] })),
      plot1: bars.map((b, i) => ({ time: b.time, value: hband[i] })),
      plot2: bars.map((b, i) => ({ time: b.time, value: lband[i] })),
    },
    fills: [
      { plot1: 'plot1', plot2: 'plot0', options: { color: HIGH_FILL, title: 'High Target Range' } },
      { plot1: 'plot2', plot2: 'plot0', options: { color: LOW_FILL, title: 'Low Target Range' } },
    ],
    markers,
    barColors,
  };
}

export const RangeFilterBuySell5min = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
};
