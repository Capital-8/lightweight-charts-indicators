/**
 * ICT Implied Fair Value Gap (IFVG)
 *
 * Three-candle pattern where the middle candle has the largest body and the shadows of the outer candles overlap
 * by less than a gap: a bullish IFVG when the lower shadow of the current candle and the upper shadow of the candle
 * two bars back are both larger than the threshold (as a share of the current range) and the middle of the lower
 * shadow is above the middle of the upper shadow of the first candle (the bearish IFVG mirrors it). Each IFVG draws
 * a zone box and its average line from the first candle to `extension` bars after the current one; the average of
 * the latest zone is plotted, coloured once the zone is more than `extension` bars old when "Extend Averages" is on.
 * Alerts (alertcondition, `alerts` of the result): 'Bullish IFVG' and 'Bearish IFVG', true on the bar of each IFVG
 * (whether or not its side is shown).
 *
 * Reference: "ICT Implied Fair Value Gap (IFVG) [LuxAlgo]" by LuxAlgo
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © LuxAlgo
 */

import { taCore, compare, line, box, resetDrawings, setDrawingBar, drawingOutputs, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

export interface IctImpliedFairValueGapInputs {
  /** Shadow threshold (%) */
  thr: number;
  /** Bars after the current bar that the boxes and lines reach */
  ext: number;
  /** Colour the average plots after the zone */
  extAvg: boolean;
  showBull: boolean;
  bullZone: string;
  bullAvg: string;
  showBear: boolean;
  bearZone: string;
  bearAvg: string;
}

export const defaultInputs: IctImpliedFairValueGapInputs = {
  thr: 30,
  ext: 8,
  extAvg: false,
  showBull: true,
  bullZone: 'rgba(49, 121, 245, 0.5)',
  bullAvg: '#3179f5',
  showBear: true,
  bearZone: 'rgba(255, 93, 0, 0.5)',
  bearAvg: '#ff5d00',
};

export const inputConfig: InputConfig[] = [
  { id: 'thr', type: 'float', title: 'Shadow Threshold %', defval: 30, min: 0, max: 100 },
  { id: 'ext', type: 'int', title: 'IFVG Extension', defval: 8 },
  { id: 'extAvg', type: 'bool', title: 'Extend Averages', defval: false },
  { id: 'showBull', type: 'bool', title: 'Bullish IFVG', defval: true, group: 'Style', inline: 'bull' },
  { id: 'bullZone', type: 'color', title: '', defval: 'rgba(49, 121, 245, 0.5)', group: 'Style', inline: 'bull' },
  { id: 'bullAvg', type: 'color', title: '', defval: '#3179f5', group: 'Style', inline: 'bull' },
  { id: 'showBear', type: 'bool', title: 'Bearish IFVG', defval: true, group: 'Style', inline: 'bear' },
  { id: 'bearZone', type: 'color', title: '', defval: 'rgba(255, 93, 0, 0.5)', group: 'Style', inline: 'bear' },
  { id: 'bearAvg', type: 'color', title: '', defval: '#ff5d00', group: 'Style', inline: 'bear' },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Bullish IFVG Average', color: '#3179f5', lineWidth: 1 },
  { id: 'plot1', title: 'Bearish IFVG Average', color: '#ff5d00', lineWidth: 1 },
];

export const metadata = {
  title: 'ICT Implied Fair Value Gap (IFVG) [LuxAlgo]',
  shortTitle: 'ICT Implied Fair Value Gap (IFVG) [LuxAlgo]',
  overlay: true,
};

/** indicator(max_lines_count = 500, max_boxes_count = 500) */
const MAX_OBJECTS = 500;

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'Bullish IFVG', message: 'Bullish IFVG detected' },
  { id: 'alert1', title: 'Bearish IFVG', message: 'Bearish IFVG detected' },
];

export function calculate(
  bars: Bar[],
  inputs: Partial<IctImpliedFairValueGapInputs> = {},
): IndicatorResult & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const thr = cfg.thr / 100;
  const ext = cfg.ext;
  const { gt } = compare;
  const o = (i: number) => (i >= 0 ? bars[i].open : NaN);
  const h = (i: number) => (i >= 0 ? bars[i].high : NaN);
  const l = (i: number) => (i >= 0 ? bars[i].low : NaN);
  const c = (i: number) => (i >= 0 ? bars[i].close : NaN);
  const body = (i: number) => Math.abs(c(i) - o(i));

  const bullIfvg: boolean[] = new Array(n).fill(false);
  const bearIfvg: boolean[] = new Array(n).fill(false);
  const bullAvgSeries: number[] = new Array(n);
  const bearAvgSeries: number[] = new Array(n);
  let bullIfvgAvg = NaN; // var float bull_ifvg_avg = na
  let bearIfvgAvg = NaN;

  resetDrawings({ line: MAX_OBJECTS, box: MAX_OBJECTS });
  for (let i = 0; i < n; i++) {
    setDrawingBar(i, i === n - 1);
    const r = h(i) - l(i);
    const b = body(i);
    const midBody = gt(body(i - 1), Math.max(b, body(i - 2)));

    // Bullish IFVG
    const bullTop = (Math.min(c(i), o(i)) + l(i)) / 2;
    const bullBtm = (Math.max(c(i - 2), o(i - 2)) + h(i - 2)) / 2;
    const bull = midBody
      && compare.lt(l(i), h(i - 2))
      && gt((Math.min(c(i), o(i)) - l(i)) / r, thr)
      && gt((h(i - 2) - Math.max(c(i - 2), o(i - 2))) / r, thr)
      && gt(bullTop, bullBtm);

    // Bearish IFVG
    const bearTop = (Math.min(c(i - 2), o(i - 2)) + l(i - 2)) / 2;
    const bearBtm = (Math.max(c(i), o(i)) + h(i)) / 2;
    const bear = midBody
      && gt(h(i), l(i - 2))
      && gt((h(i) - Math.max(c(i), o(i))) / r, thr)
      && gt((Math.min(c(i - 2), o(i - 2)) - l(i - 2)) / r, thr)
      && gt(bearTop, bearBtm);
    bullIfvg[i] = bull;
    bearIfvg[i] = bear;

    if (bull && cfg.showBull) {
      bullIfvgAvg = (bullTop + bullBtm) / 2;
      box.new(i - 2, bullTop, i + ext, bullBtm, cfg.bullAvg, undefined, undefined, undefined, undefined, cfg.bullZone,
        undefined, undefined, '#363A45');
      line.new(i - 2, bullIfvgAvg, i + ext, bullIfvgAvg, 'bar_index', undefined, cfg.bullAvg);
    }
    if (bear && cfg.showBear) {
      bearIfvgAvg = (bearTop + bearBtm) / 2;
      box.new(i - 2, bearTop, i + ext, bearBtm, cfg.bearAvg, undefined, undefined, undefined, undefined, cfg.bearZone,
        undefined, undefined, '#363A45');
      line.new(i - 2, bearIfvgAvg, i + ext, bearIfvgAvg, 'bar_index', undefined, cfg.bearAvg);
    }
    bullAvgSeries[i] = bullIfvgAvg;
    bearAvgSeries[i] = bearIfvgAvg;
  }
  setDrawingBar(null);

  // plot(bull_ifvg_avg, color = ta.barssince(bull_ifvg) > ext and extAvg ? bullAvg : na)
  const bullSince = taCore.barssince(bullIfvg);
  const bearSince = taCore.barssince(bearIfvg);
  const v = (x: number) => (Number.isFinite(x) ? x : NaN);
  const plot0 = bars.map((bar, i) => ({
    time: bar.time, value: v(bullAvgSeries[i]),
    color: gt(bullSince[i], ext) && cfg.extAvg ? cfg.bullAvg : 'transparent',
  }));
  const plot1 = bars.map((bar, i) => ({
    time: bar.time, value: v(bearAvgSeries[i]),
    color: gt(bearSince[i], ext) && cfg.extAvg ? cfg.bearAvg : 'transparent',
  }));

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: { plot0, plot1 },
    ...drawingOutputs(bars),
    // alertcondition(bull_ifvg, 'Bullish IFVG') / alertcondition(bear_ifvg, 'Bearish IFVG')
    alerts: alertStates(alertConditions, bars, [bullIfvg, bearIfvg]),
  };
}

export const IctImpliedFairValueGap = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  alertConditions,
};
