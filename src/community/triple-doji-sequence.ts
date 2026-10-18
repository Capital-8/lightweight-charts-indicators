/**
 * Triple Doji Sequence
 *
 * A bar is a doji with a dominant upper wick when its upper wick is larger than its body and than the 200-bar SMA of
 * the upper wick times the dominant multiple, its body is below the SMA of the body times the body multiple and its
 * lower wick is below the SMA of the lower wick times the recessive multiple (the mirror rule gives a dominant lower
 * wick). The signal needs 1, 2 or 3 consecutive dojis (the highest enabled count wins) with the same dominant wick
 * for 2 and 3. A star above the bar marks an upper wick doji (sell), a star below the bar a lower wick doji (buy).
 *
 * Alerts (alert() calls, `alertCalls` of the result, once per bar close): "Buy Doji Signal" on a buy star and
 * "Sell Doji Signal" on a sell star, on confirmed bars only (`barstate.isconfirmed`: the last bar only when the chart
 * context says it is closed, `lastBarConfirmed`, true without a context).
 *
 * Reference: "Triple Doji Sequence" by Marc_Thiart
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 */

import { ta, Series, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { AlertCall, MarkerData } from '../types';
import { lastBarConfirmedOf, type ChartContext } from '../chart-context';

/** The original makes alert() calls */
export const hasAlertFunction = true;

export interface TripleDojiSequenceInputs {
  /** Signal on a single doji */
  doji1Enabled: boolean;
  /** Signal on 2 consecutive dojis */
  doji2Enabled: boolean;
  /** Signal on 3 consecutive dojis */
  doji3Enabled: boolean;
  /** The dominant wick is above its SMA times this multiple */
  dominantWickMultiple: number;
  /** The recessive wick is below its SMA times this multiple */
  recessiveWickMultiple: number;
  /** The body is below its SMA times this multiple */
  bodyMultiple: number;
}

export const defaultInputs: TripleDojiSequenceInputs = {
  doji1Enabled: true,
  doji2Enabled: false,
  doji3Enabled: false,
  dominantWickMultiple: 3.0,
  recessiveWickMultiple: 1.0,
  bodyMultiple: 0.6,
};

export const inputConfig: InputConfig[] = [
  { id: 'doji1Enabled', type: 'bool', title: 'Doji 1', defval: true },
  { id: 'doji2Enabled', type: 'bool', title: 'Doji 2', defval: false },
  { id: 'doji3Enabled', type: 'bool', title: 'Doji 3', defval: false },
  { id: 'dominantWickMultiple', type: 'float', title: 'Dominant Wick Multiple', defval: 3.0, min: 1.0, max: 10.0, step: 0.1 },
  { id: 'recessiveWickMultiple', type: 'float', title: 'Recessive Wick Multiple', defval: 1.0, min: 0.1, max: 10.0, step: 0.1 },
  { id: 'bodyMultiple', type: 'float', title: 'Body Multiple', defval: 0.6, min: 0.1, max: 10.0, step: 0.1 },
];

// Only markers (plotchar): no line plots
export const plotConfig: PlotConfig[] = [];

export const metadata = {
  title: 'Triple Doji Sequence',
  shortTitle: 'Trip Doji',
  overlay: true,
};

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;

const STAR = '\u{1F31F}';

export function calculate(
  bars: Bar[],
  inputs: Partial<TripleDojiSequenceInputs> = {},
  chart?: ChartContext,
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[]; alertCalls: AlertCall[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);

  const body = bars.map((b) => Math.abs(b.close - b.open));
  const upperWick = bars.map((b) => Math.abs(Math.max(b.open, b.close) - b.high));
  const lowerWick = bars.map((b) => Math.abs(Math.min(b.open, b.close) - b.low));
  const atrUpper = A(ta.sma(Series.fromArray(bars, upperWick), 200));
  const atrLower = A(ta.sma(Series.fromArray(bars, lowerWick), 200));
  const atrBody = A(ta.sma(Series.fromArray(bars, body), 200));

  const upperDom: boolean[] = new Array(n);
  const lowerDom: boolean[] = new Array(n);
  for (let i = 0; i < n; i++) {
    upperDom[i] = gt(upperWick[i], body[i]) && gt(upperWick[i], atrUpper[i] * cfg.dominantWickMultiple)
      && lt(body[i], atrBody[i] * cfg.bodyMultiple) && lt(lowerWick[i], atrLower[i] * cfg.recessiveWickMultiple);
    lowerDom[i] = gt(lowerWick[i], body[i]) && gt(lowerWick[i], atrLower[i] * cfg.dominantWickMultiple)
      && lt(body[i], atrBody[i] * cfg.bodyMultiple) && lt(upperWick[i], atrUpper[i] * cfg.recessiveWickMultiple);
  }

  const markers: MarkerData[] = [];
  const alertCalls: AlertCall[] = [];
  const lastConfirmed = lastBarConfirmedOf(chart);
  // history before bar 0 is na: false
  const up = (k: number) => k >= 0 && upperDom[k];
  const lo = (k: number) => k >= 0 && lowerDom[k];
  const doji = (k: number) => up(k) || lo(k);
  for (let i = 0; i < n; i++) {
    const cur = doji(i);
    const prev1 = doji(i - 1);
    const prev2 = doji(i - 2);
    const prev1Same = (up(i) && up(i - 1)) || (lo(i) && lo(i - 1));
    const prev2Same = (up(i) && up(i - 1) && up(i - 2)) || (lo(i) && lo(i - 1) && lo(i - 2));
    const seq1 = cfg.doji1Enabled && cur;
    const seq2 = cfg.doji2Enabled && cur && prev1 && prev1Same;
    const seq3 = cfg.doji3Enabled && cur && prev1 && prev2 && prev2Same;
    const finalSignal = seq3 || (seq2 && !cfg.doji3Enabled) || (seq1 && !cfg.doji2Enabled && !cfg.doji3Enabled);
    const time = bars[i].time;
    // plotchar(final_signal and upper_wick_dominant, 'Sell Signal', '🌟', location.abovebar, color.red, size.tiny)
    if (finalSignal && up(i)) {
      markers.push({ id: 'char0', time, position: 'aboveBar', shape: 'circle', color: 'transparent', text: STAR, textColor: color.red, size: 'tiny' });
    }
    // plotchar(final_signal and lower_wick_dominant, 'Buy Signal', '🌟', location.belowbar, color.green, size.tiny)
    if (finalSignal && lo(i)) {
      markers.push({ id: 'char1', time, position: 'belowBar', shape: 'circle', color: 'transparent', text: STAR, textColor: color.green, size: 'tiny' });
    }
    // barstate.isconfirmed: every historical bar, the last bar when it is closed
    const confirmed = i < n - 1 || lastConfirmed;
    // if final_signal and lower_wick_dominant and barstate.isconfirmed: alert("Buy Doji Signal", once per bar close)
    if (finalSignal && lo(i) && confirmed) alertCalls.push({ time, message: 'Buy Doji Signal', freq: 'once_per_bar_close' });
    // if final_signal and upper_wick_dominant and barstate.isconfirmed: alert("Sell Doji Signal", once per bar close)
    if (finalSignal && up(i) && confirmed) alertCalls.push({ time, message: 'Sell Doji Signal', freq: 'once_per_bar_close' });
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {},
    markers,
    alertCalls,
  };
}

export const TripleDojiSequence = { calculate, metadata, defaultInputs, inputConfig, plotConfig, hasAlertFunction };
