/**
 * CM_TotalConsecutive_Up_Down_V2
 *
 * Histograms of the bars since the close was last above (red, "Price Down") / below (lime, "Price Up") the midpoint
 * (hl2) of the bar before, or the close of the bar before when "Use Midpoint" is off or the midpoint count is 0 / na.
 * Optional lines over the four counts (midpoint and close based, down and up): their highest over a lookback, their
 * standard deviation times a multiple, their moving average (each drawn only where non-zero). A dashed yellow
 * horizontal line at the "Horizontal Line" level.
 *
 * Version 1 plots have a default transparency of 35: the plot colours have an alpha of 0.65.
 *
 * Reference: "CM_TotalConsecutive_Up_Down_V2" by ChrisMoody
 */

import { ta, Series, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';

export interface BullsBearsInputs {
  useMidpoint: boolean;
  showHighestMidpoint: boolean;
  showHighestClose: boolean;
  showStdevMidpoint: boolean;
  showStdevClose: boolean;
  showMaMidpoint: boolean;
  showMaClose: boolean;
  hlength: number;
  lookbackLength: number;
  stdevLength: number;
  stdevMult: number;
  maLength: number;
}

export const defaultInputs: BullsBearsInputs = {
  useMidpoint: true,
  showHighestMidpoint: false,
  showHighestClose: false,
  showStdevMidpoint: false,
  showStdevClose: false,
  showMaMidpoint: false,
  showMaClose: false,
  hlength: 4,
  lookbackLength: 50,
  stdevLength: 50,
  stdevMult: 2,
  maLength: 20,
};

export const inputConfig: InputConfig[] = [
  { id: 'useMidpoint', type: 'bool', title: 'Check = Use Midpoint, UnCheck = Use Prev Close', defval: true },
  { id: 'showHighestMidpoint', type: 'bool', title: 'Highest Bar Look Back Period - Using Midpoint?', defval: false },
  { id: 'showHighestClose', type: 'bool', title: 'Highest Bar Look Back Period - Using Close?', defval: false },
  { id: 'showStdevMidpoint', type: 'bool', title: 'Standard Dev - Using Midpoint?', defval: false },
  { id: 'showStdevClose', type: 'bool', title: 'Standard Dev - Using Close?', defval: false },
  { id: 'showMaMidpoint', type: 'bool', title: 'Moving Average - Using Midpoint?', defval: false },
  { id: 'showMaClose', type: 'bool', title: 'Moving Average - Using Close?', defval: false },
  { id: 'hlength', type: 'int', title: 'Horizontal Line', defval: 4, min: 1 },
  { id: 'lookbackLength', type: 'int', title: 'Highest Bar Look Back Period', defval: 50, min: 1 },
  { id: 'stdevLength', type: 'int', title: 'Standard Dev Length', defval: 50, min: 1 },
  { id: 'stdevMult', type: 'int', title: 'Standard Dev Multiple', defval: 2, min: 1 },
  { id: 'maLength', type: 'int', title: 'Moving Average length', defval: 20, min: 1 },
];

// Colour constants of Pine version 1, with the default plot transparency of that version (35)
const V1 = (hex: string) => String(color.new(hex, 35));
const RED = V1('#FF0000');
const LIME = V1('#00FF00');

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Price Down Based On Midpoint or Close', color: RED, lineWidth: 3, style: 'histogram' },
  { id: 'plot1', title: 'Price Up Based On Midpoint or Close', color: LIME, lineWidth: 3, style: 'histogram' },
  { id: 'plot2', title: 'Highest Down Bar Lookback - Midpoint', color: RED, lineWidth: 4 },
  { id: 'plot3', title: 'Highest Up Bar Lookback - Midpoint', color: LIME, lineWidth: 4 },
  { id: 'plot4', title: 'Highest Down Bar Lookback - Close', color: RED, lineWidth: 4 },
  { id: 'plot5', title: 'Highest Up Bar Lookback - Close', color: LIME, lineWidth: 4 },
  { id: 'plot6', title: 'StdDev of Down Bars - Midpoint', color: RED, lineWidth: 4 },
  { id: 'plot7', title: 'StdDev of Up Bars - Midpoint', color: LIME, lineWidth: 4 },
  { id: 'plot8', title: 'StdDev of Down Bars - Close', color: RED, lineWidth: 4 },
  { id: 'plot9', title: 'StdDev of Up Bars - Close', color: LIME, lineWidth: 4 },
  { id: 'plot10', title: 'MA of Down Bars - Midpoint', color: RED, lineWidth: 4 },
  { id: 'plot11', title: 'MA of Up Bars - Midpoint', color: LIME, lineWidth: 4 },
  { id: 'plot12', title: 'MA of Down Bars - Close', color: RED, lineWidth: 4 },
  { id: 'plot13', title: 'MA of Up Bars - Close', color: LIME, lineWidth: 4 },
];

export const metadata = {
  title: 'CM_TotalConsecutive_Up_Down_V2',
  shortTitle: 'CM_TotalConsec_Up_Down_V2',
  overlay: false,
};

/** barssince(cond): 0 on a bar where it is true, then +1 per bar; na until it is first true */
function barssince(cond: boolean[]): number[] {
  const out = new Array<number>(cond.length);
  let last = -1;
  for (let i = 0; i < cond.length; i++) {
    if (cond[i]) last = i;
    out[i] = last < 0 ? NaN : i - last;
  }
  return out;
}

/** A number as a Pine version 1 condition: true when not na and not 0 */
const truthy = (v: number) => !isNaN(v) && v !== 0;

export function calculate(bars: Bar[], inputs: Partial<BullsBearsInputs> = {}): IndicatorResult {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;

  // down_BarC = close > close[1]; up_BarC = close < close[1]; down_BarM = close > hl2[1]; up_BarM = close < hl2[1]
  // (na on bar 0: the comparisons are false)
  const downBarC = bars.map((b, i) => i > 0 && b.close > bars[i - 1].close);
  const upBarC = bars.map((b, i) => i > 0 && b.close < bars[i - 1].close);
  const hl2Prev = (i: number) => (bars[i - 1].high + bars[i - 1].low) / 2;
  const downBarM = bars.map((b, i) => i > 0 && b.close > hl2Prev(i));
  const upBarM = bars.map((b, i) => i > 0 && b.close < hl2Prev(i));

  const bsDownM = barssince(downBarM);
  const bsUpM = barssince(upBarM);
  const bsDownC = barssince(downBarC);
  const bsUpC = barssince(upBarC);

  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const S = (a: number[]) => Series.fromArray(bars, a);
  const sma = (a: number[]) => A(ta.sma(S(a), cfg.maLength));
  const stdev = (a: number[]) => A(ta.stdev(S(a), cfg.stdevLength)).map((v) => v * cfg.stdevMult);
  const highest = (a: number[]) => A(ta.highest(S(a), cfg.lookbackLength));

  const avgDown = sma(bsDownM);
  const avgUp = sma(bsUpM);
  const avgDownC = sma(bsDownC);
  const avgUpC = sma(bsUpC);
  const stdevdm = stdev(bsDownM);
  const stdevum = stdev(bsUpM);
  const stdevdC = stdev(bsDownC);
  const stdevuC = stdev(bsUpC);
  const hbDownM = highest(bsDownM);
  const hbUpM = highest(bsUpM);
  const hbDownC = highest(bsDownC);
  const hbUpC = highest(bsUpC);

  // plot(on and x ? x : na)
  const gated = (on: boolean, x: number[]) => bars.map((b, i) => ({ time: b.time, value: on && truthy(x[i]) ? x[i] : NaN }));

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {
      // plot(dopm and barssince(down_BarM) ? barssince(down_BarM) : barssince(down_BarC))
      plot0: bars.map((b, i) => ({ time: b.time, value: cfg.useMidpoint && truthy(bsDownM[i]) ? bsDownM[i] : bsDownC[i] })),
      plot1: bars.map((b, i) => ({ time: b.time, value: cfg.useMidpoint && truthy(bsUpM[i]) ? bsUpM[i] : bsUpC[i] })),
      plot2: gated(cfg.showHighestMidpoint, hbDownM),
      plot3: gated(cfg.showHighestMidpoint, hbUpM),
      plot4: gated(cfg.showHighestClose, hbDownC),
      plot5: gated(cfg.showHighestClose, hbUpC),
      plot6: gated(cfg.showStdevMidpoint, stdevdm),
      plot7: gated(cfg.showStdevMidpoint, stdevum),
      plot8: gated(cfg.showStdevClose, stdevdC),
      plot9: gated(cfg.showStdevClose, stdevuC),
      plot10: gated(cfg.showMaMidpoint, avgDown),
      plot11: gated(cfg.showMaMidpoint, avgUp),
      plot12: gated(cfg.showMaClose, avgDownC),
      plot13: gated(cfg.showMaClose, avgUpC),
    },
    // hline(hlength, title="Horizontal Line", linestyle=dashed, linewidth=4, color=yellow)
    hlines: [
      { value: cfg.hlength, options: { color: '#FFFF00', linestyle: 'dashed', linewidth: 4, title: 'Horizontal Line' } },
    ],
  };
}

export const BullsBears = { calculate, metadata, defaultInputs, inputConfig, plotConfig };
