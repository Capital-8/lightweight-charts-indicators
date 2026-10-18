/**
 * Dual RSI Smoother
 *
 * Two RSIs of the close (lengths 5 and 6) are smoothed with an SMA (6 and 13 bars) and stretched around 50
 * (x 1.25 and x 1.3), clamped to 0..100. The second line is green when the sum of both lines is below 55. Buy dots
 * are drawn 5 points below the first line when both lines are low (or the second line is more than 30 points above
 * the first); sell dots 5 points above it when the first line is high and more than 12 points above the second, or
 * above 95.
 * Alerts (alertcondition, `alerts` of the result): 'Green Dot Alert' / 'Red Dot Alert', true on the bars with a buy /
 * sell dot.
 *
 * Reference: "Dual RSI Smoother" by TheUltimator5
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © TheUltimator5
 */

import { ta, Series, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { MarkerData } from '../types';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

export interface DualRsiSmootherInputs {
  rsiLength1: number;
  rsiLength2: number;
  /** SMA length of RSI 1 */
  rsiSmoothLen1: number;
  /** SMA length of RSI 2 */
  rsiSmoothLen2: number;
  /** Colour of RSI 2 when the sum of both lines is 55 or more */
  line1Color: string;
  /** Colour of RSI 1 */
  line2Color: string;
  /** Colour of RSI 2 when the sum of both lines is below 55 */
  highlightColor: string;
  buyDotColor: string;
  sellDotColor: string;
}

export const defaultInputs: DualRsiSmootherInputs = {
  rsiLength1: 5,
  rsiLength2: 6,
  rsiSmoothLen1: 6,
  rsiSmoothLen2: 13,
  line1Color: 'rgb(255, 0, 217)',
  line2Color: 'rgb(0, 200, 255)',
  highlightColor: color.lime,
  buyDotColor: 'rgb(109, 244, 113)',
  sellDotColor: color.red,
};

export const inputConfig: InputConfig[] = [
  { id: 'rsiLength1', type: 'int', title: 'RSI Length 1', defval: 5 },
  { id: 'rsiLength2', type: 'int', title: 'RSI Length 2', defval: 6 },
  { id: 'rsiSmoothLen1', type: 'int', title: 'Smooth Length RSI 1', defval: 6 },
  { id: 'rsiSmoothLen2', type: 'int', title: 'Smooth Length RSI 2', defval: 13 },
  { id: 'line1Color', type: 'color', title: 'Slow RSI Line Color', defval: 'rgb(255, 0, 217)' },
  { id: 'line2Color', type: 'color', title: 'Fast RSI Line Color', defval: 'rgb(0, 200, 255)' },
  { id: 'highlightColor', type: 'color', title: 'Buy Line Highlight Color', defval: color.lime },
  { id: 'buyDotColor', type: 'color', title: 'Buy Dot Color', defval: 'rgb(109, 244, 113)' },
  { id: 'sellDotColor', type: 'color', title: 'Sell Dot Color', defval: color.red },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'RSI1', color: 'rgb(0, 200, 255)', lineWidth: 2 },
  { id: 'plot1', title: 'RSI2', color: 'rgb(255, 0, 217)', lineWidth: 2 },
];

export const metadata = {
  title: 'Dual RSI Smoother',
  shortTitle: 'Dual RSI Smoother',
  overlay: false,
};

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const ge = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(b - a > EPS);

export function calculate(
  bars: Bar[],
  inputs: Partial<DualRsiSmootherInputs> = {},
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[] } & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const close = Series.fromArray(bars, bars.map((b) => b.close));

  const smoothed1 = A(ta.sma(ta.rsi(close, cfg.rsiLength1), cfg.rsiSmoothLen1));
  const smoothed2 = A(ta.sma(ta.rsi(close, cfg.rsiLength2), cfg.rsiSmoothLen2));
  // math.min(100, math.max(0, (x - 50) * k + 50)): na stays na
  const amp1 = smoothed1.map((x) => Math.min(100, Math.max(0, (x - 50) * 1.25 + 50)));
  const amp2 = smoothed2.map((x) => Math.min(100, Math.max(0, (x - 50) * 1.3 + 50)));

  const plot0: { time: number; value: number; color: string }[] = [];
  const plot1: { time: number; value: number; color: string }[] = [];
  const markers: MarkerData[] = [];
  const greenFlags: boolean[] = [], redFlags: boolean[] = [];
  // plotchar(series, location = location.absolute, char = "•", size = size.tiny, color = c): the 4 plotchar
  // outputs are char0..char3 in declaration order
  const dot = (time: number, price: number, c: string, id: string) => {
    markers.push({ time, position: 'atPriceMiddle', price, shape: 'circle', color: 'transparent', text: '•',
      textColor: c, size: 'tiny', id });
  };
  for (let i = 0; i < n; i++) {
    const a1 = amp1[i];
    const a2 = amp2[i];
    const t = bars[i].time;
    const sum = a1 + a2;
    // rsi2Color = sum < 55 ? highlightColor : sum >= 50 ? line1Color : color.blue (na sum: color.blue)
    const rsi2Color = lt(sum, 55) ? cfg.highlightColor : ge(sum, 50) ? cfg.line1Color : color.blue;
    plot0.push({ time: t, value: a1, color: cfg.line2Color });
    plot1.push({ time: t, value: a2, color: rsi2Color });

    const highlightCondition1 = lt(a1, 30) && lt(a2, 35);
    const highlightCondition2 = gt(a2 - a1, 30);
    const highlightCondition3 = lt(a2, 25) && lt(a1, 22);
    const highlightBackground = highlightCondition1 || highlightCondition2;
    if (highlightBackground) dot(t, a1 - 5, cfg.buyDotColor, 'char0');
    if (highlightCondition3) dot(t, a1 - 5, cfg.buyDotColor, 'char1');
    const top1 = gt(a1, 75) && gt(a1 - a2, 12);
    const top2 = gt(a1, 95);
    if (top1) dot(t, a1 + 5, cfg.sellDotColor, 'char2');
    if (top2) dot(t, a1 + 5, cfg.sellDotColor, 'char3');
    greenFlags.push(highlightBackground || highlightCondition3);
    redFlags.push(top1 || top2);
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: { plot0, plot1 },
    markers,
    // alertcondition(highlightBackground or highlightCondition3) / alertcondition(highlightConditionTop1 or ...Top2)
    alerts: alertStates(alertConditions, bars, [greenFlags, redFlags]),
  };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'Green Dot Alert', message: 'Green Dot (Buy) condition triggered' },
  { id: 'alert1', title: 'Red Dot Alert', message: 'Red Dot (Sell) condition triggered' },
];

export const DualRsiSmoother = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  alertConditions,
};
