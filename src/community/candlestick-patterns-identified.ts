/**
 * Candlestick Patterns Identified
 *
 * Marks 15 candlestick patterns with shapes and text: Doji (body at most `dojiSize` of the range), Bearish / Bullish
 * Harami, Bearish / Bullish Engulfing, Piercing Line, Bullish Belt (open = low under the lowest low of the 10
 * previous bars), Bullish / Bearish Kicker, Hanging Man, Evening / Morning Star, Shooting Star, Hammer and Inverted
 * Hammer. Most patterns also need a trend: the open `trend` bars back above (bullish) or below (bearish) the open.
 * Bullish patterns are drawn below the bar, bearish patterns and the Doji above the bar.
 * Alerts (alertcondition, `alerts` of the result): one per pattern ('Doji' ... 'Inverted Hammer'), true on its bars.
 *
 * Reference: "Candlestick Patterns Identified" by repo32
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © repo32
 */

import { ta, Series, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { MarkerData } from '../types';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

export interface CandlestickPatternsIdentifiedInputs {
  /** Trend in bars: the open this many bars back is compared with the open */
  trend: number;
  /** Doji size: largest body as a fraction of the bar range */
  dojiSize: number;
  bullColor: string;
  bearColor: string;
  dojiColor: string;
  bullText: string;
  bearText: string;
  dojiText: string;
}

export const defaultInputs: CandlestickPatternsIdentifiedInputs = {
  trend: 5,
  dojiSize: 0.05,
  bullColor: color.lime,
  bearColor: color.red,
  dojiColor: color.white,
  bullText: color.lime,
  bearText: color.red,
  dojiText: color.white,
};

export const inputConfig: InputConfig[] = [
  { id: 'trend', type: 'int', title: 'Trend in Bars', defval: 5, min: 1 },
  { id: 'dojiSize', type: 'float', title: 'Doji size', defval: 0.05, min: 0.01 },
  { id: 'bullColor', type: 'color', title: 'Bullish Arrow Color', defval: color.lime },
  { id: 'bearColor', type: 'color', title: 'Bearish Arrow Color', defval: color.red },
  { id: 'dojiColor', type: 'color', title: 'Other(i.e. Doji) Symbol Color', defval: color.white },
  { id: 'bullText', type: 'color', title: 'Bullish Text Color', defval: color.lime },
  { id: 'bearText', type: 'color', title: 'Bearish Text Color', defval: color.red },
  { id: 'dojiText', type: 'color', title: 'Other(i.e. Doji) Text Color', defval: color.white },
];

/** No plot(): the outputs are the markers of the 15 plotshape calls */
export const plotConfig: PlotConfig[] = [];

export const metadata = {
  title: 'Candlestick Patterns Identified',
  shortTitle: 'Candlestick Patterns Identified',
  overlay: true,
};

/** Pine float comparisons: a > b only when a - b > 1e-10, a == b within 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const ge = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(b - a > EPS);
const le = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(a - b > EPS);
const eq = (a: number, b: number) => !isNaN(a) && !isNaN(b) && Math.abs(a - b) <= EPS;

export function calculate(
  bars: Bar[],
  inputs: Partial<CandlestickPatternsIdentifiedInputs> = {},
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[] } & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const trend = cfg.trend;
  // ta.lowest(10) = lowest low of 10 bars
  const lowest10 = ta.lowest(new Series(bars, (b) => b.low), 10).toArray().map((v) => v ?? NaN);

  const markers: MarkerData[] = [];
  // One flag per bar for each pattern, in the order of the plotshape / alertcondition calls (shape<k> / alert<k>)
  const flags: boolean[][] = alertConditions.map(() => []);
  for (let i = 0; i < n; i++) {
    const b = bars[i];
    const { open, high, low, close } = b;
    const p1 = i >= 1 ? bars[i - 1] : null;
    const p2 = i >= 2 ? bars[i - 2] : null;
    const open1 = p1 ? p1.open : NaN;
    const close1 = p1 ? p1.close : NaN;
    const high1 = p1 ? p1.high : NaN;
    const low1 = p1 ? p1.low : NaN;
    const open2 = p2 ? p2.open : NaN;
    const close2 = p2 ? p2.close : NaN;
    const high2 = p2 ? p2.high : NaN;
    const openT = i >= trend ? bars[i - trend].open : NaN; // open[trend]
    const t = b.time;
    const bull = (k: number, text: string, on: boolean) => {
      flags[k].push(on);
      if (on) markers.push({ id: `shape${k}`, time: t, position: 'belowBar', shape: 'arrowUp', color: cfg.bullColor, text, textColor: cfg.bullText, size: 'auto' });
    };
    const bear = (k: number, text: string, on: boolean) => {
      flags[k].push(on);
      if (on) markers.push({ id: `shape${k}`, time: t, position: 'aboveBar', shape: 'arrowDown', color: cfg.bearColor, text, textColor: cfg.bearText, size: 'auto' });
    };

    // plotshape(doji, "Doji", shape.cross, location.abovebar (default), dojiColor, textcolor = dojiText, text = "Doji")
    const doji = le(Math.abs(open - close), (high - low) * cfg.dojiSize);
    flags[0].push(doji);
    if (doji) markers.push({ id: 'shape0', time: t, position: 'aboveBar', shape: 'cross', color: cfg.dojiColor, text: 'Doji', textColor: cfg.dojiText, size: 'auto' });

    const bearHarami = gt(close1, open1) && gt(open, close) && le(open, close1) && le(open1, close)
      && lt(open - close, close1 - open1) && lt(openT, open);
    bear(1, 'Bearish\nHarami', bearHarami);

    const bullHarami = gt(open1, close1) && gt(close, open) && le(close, open1) && le(close1, open)
      && lt(close - open, open1 - close1) && gt(openT, open);
    bull(2, 'Bullish\nHarami', bullHarami);

    const bearEng = gt(close1, open1) && gt(open, close) && ge(open, close1) && ge(open1, close)
      && gt(open - close, close1 - open1) && lt(openT, open);
    bear(3, 'Bearish\nEngulfing', bearEng);

    // The Pine text is "Bullish\nEngulfling"
    const bullEng = gt(open1, close1) && gt(close, open) && ge(close, open1) && ge(close1, open)
      && gt(close - open, open1 - close1) && gt(openT, open);
    bull(4, 'Bullish\nEngulfling', bullEng);

    const piercing = lt(close1, open1) && lt(open, low1) && gt(close, close1 + (open1 - close1) / 2) && lt(close, open1)
      && gt(openT, open);
    bull(5, 'Piercing\nLine', piercing);

    // lower = ta.lowest(10)[1]
    const lower = i >= 1 ? lowest10[i - 1] : NaN;
    const bullBelt = eq(low, open) && lt(open, lower) && lt(open, close) && gt(close, (high1 - low1) / 2 + low1)
      && gt(openT, open);
    bull(6, 'Bullish\nBelt', bullBelt);

    const bullKick = gt(open1, close1) && ge(open, open1) && gt(close, open) && gt(openT, open);
    bull(7, 'Bullish\nKicker', bullKick);

    const bearKick = lt(open1, close1) && le(open, open1) && le(close, open) && lt(openT, open);
    bear(8, 'Bearish\nKicker', bearKick);

    const hangingMan = gt(high - low, 4 * Math.abs(open - close)) && ge((close - low) / (0.001 + high - low), 0.75)
      && ge((open - low) / (0.001 + high - low), 0.75) && lt(openT, open) && lt(high1, open) && lt(high2, open);
    bear(9, 'Hanging\nMan', hangingMan);

    const eveningStar = gt(close2, open2) && gt(Math.min(open1, close1), close2) && lt(open, Math.min(open1, close1))
      && lt(close, open);
    bear(10, 'Evening\nStar', eveningStar);

    const morningStar = lt(close2, open2) && lt(Math.max(open1, close1), close2) && gt(open, Math.max(open1, close1))
      && gt(close, open);
    bull(11, 'Morning\nStar', morningStar);

    const shootingStar = lt(open1, close1) && gt(open, close1) && ge(high - Math.max(open, close), Math.abs(open - close) * 3)
      && le(Math.min(close, open) - low, Math.abs(open - close));
    bear(12, 'Shooting\nStar', shootingStar);

    // plotshape(hammer, "Hammer", location.belowbar, shape.diamond, dojiColor, textcolor = dojiText, text = "H")
    const hammer = gt(high - low, 3 * Math.abs(open - close)) && gt((close - low) / (0.001 + high - low), 0.6)
      && gt((open - low) / (0.001 + high - low), 0.6);
    flags[13].push(hammer);
    if (hammer) markers.push({ id: 'shape13', time: t, position: 'belowBar', shape: 'diamond', color: cfg.dojiColor, text: 'H', textColor: cfg.dojiText, size: 'auto' });

    const invHammer = gt(high - low, 3 * Math.abs(open - close)) && gt((high - close) / (0.001 + high - low), 0.6)
      && gt((high - open) / (0.001 + high - low), 0.6);
    flags[14].push(invHammer);
    if (invHammer) markers.push({ id: 'shape14', time: t, position: 'belowBar', shape: 'diamond', color: cfg.dojiColor, text: 'IH', textColor: cfg.dojiText, size: 'auto' });
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {},
    markers,
    // alertcondition(<pattern>, "<name>", "<name> detected") for each of the 15 patterns
    alerts: alertStates(alertConditions, bars, flags),
  };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  'Doji', 'Bearish Harami', 'Bullish Harami', 'Bearish Engulfing', 'Bullish Engulfing', 'Piercing Line', 'Bullish Belt',
  'Bullish Kicker', 'Bearish Kicker', 'Hanging Man', 'Evening Star', 'Morning Star', 'Shooting Star', 'Hammer',
  'Inverted Hammer',
].map((title, k) => ({ id: `alert${k}`, title, message: `${title} detected` }));

export const CandlestickPatternsIdentified = { calculate, metadata, defaultInputs, inputConfig, plotConfig, alertConditions };
