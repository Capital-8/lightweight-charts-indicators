/**
 * Reversal Candlestick Structure [LuxAlgo]
 *
 * Finds 16 candlestick patterns and keeps those that appear against the short-term trend.
 * The trend is read from the stochastic of the close over "Trend Length" bars and from a smoothed copy of it, which
 * moves towards 100 when the stochastic is above 50 and towards 0 when it is below 50 (factor 2 / ("Warmup Length" +
 * 1)). The trend is up when both are at or above "Threshold", down when both are at or below 100 - "Threshold".
 * A bullish pattern (hammer, inverted hammer, bullish engulfing, rising three, three white soldiers, morning star,
 * bullish harami, tweezer bottom) gets a label under the bar when the trend is down; a bearish pattern (hanging
 * man, shooting star, bearish engulfing, falling three, three black crows, evening star, bearish harami, tweezer
 * top) gets a label above the bar when the trend is up. At most 500 labels are kept.
 *
 * Bars are coloured while a trend is on (bear colour in an up trend, bull colour in a down trend, with a gradient
 * from the smoothed stochastic when "Use Gradient" is on). The dashboard lists, per pattern, the share of its
 * occurrences that came against the trend.
 *
 * The patterns compare prices rounded to the symbol tick: the port takes the tick from the chart context (0.01
 * without one).
 *
 * Reference: "Reversal Candlestick Structure [LuxAlgo]" by LuxAlgo
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © LuxAlgo
 */

import { ta, str, math, color, Series, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { BarColorData, LabelData, TableCellData, TableData } from '../types';
import { mintickOf, type ChartContext } from '../chart-context';

type LabelSize = 'tiny' | 'small' | 'normal' | 'large' | 'huge' | 'auto';

export interface ReversalCandlestickStructureInputs {
  hammerTog: boolean;
  ihammerTog: boolean;
  bulleTog: boolean;
  r3Tog: boolean;
  twsTog: boolean;
  mstarTog: boolean;
  bullhTog: boolean;
  btmTweezTog: boolean;
  hmanTog: boolean;
  sstarTog: boolean;
  beareTog: boolean;
  f3Tog: boolean;
  tbcTog: boolean;
  estarTog: boolean;
  bearhTog: boolean;
  topTweezTog: boolean;
  /** Bars of the stochastic */
  length: number;
  /** Level of the stochastic and of its smoothed copy for a trend (0 to 100) */
  threshold: number;
  /** Smoothing length of the stochastic */
  smooth: number;
  bcTog: boolean;
  bullColor: string;
  bearColor: string;
  useGradient: boolean;
  txtSize: LabelSize;
  showDash: boolean;
  dashLoc: 'Top Right' | 'Bottom Right' | 'Bottom Left';
  textSize: 'Tiny' | 'Small' | 'Normal';
}

export const defaultInputs: ReversalCandlestickStructureInputs = {
  hammerTog: true,
  ihammerTog: true,
  bulleTog: true,
  r3Tog: true,
  twsTog: true,
  mstarTog: true,
  bullhTog: true,
  btmTweezTog: true,
  hmanTog: true,
  sstarTog: true,
  beareTog: true,
  f3Tog: true,
  tbcTog: true,
  estarTog: true,
  bearhTog: true,
  topTweezTog: true,
  length: 14,
  threshold: 80,
  smooth: 20,
  bcTog: true,
  bullColor: '#089981',
  bearColor: '#f23645',
  useGradient: true,
  txtSize: 'tiny',
  showDash: false,
  dashLoc: 'Bottom Right',
  textSize: 'Tiny',
};

const PATTERNS = '\u2002\u2002\u2002\u2002Bullish Patterns\u2002\u2002\u2002\u2002\u2002\u2002\u2002\u2002\u2002\u2002\u2002\u2002\u2002\u2002\u2002Bearish Patterns';

const TOOLTIPS = {
  hammer: 'The Hammer pattern appears at the bottom of a downtrend. It is identified by a small upper wick (or no upper wick) with a small body, and an elongated lower wick whose length is 2X greater than the candle body’s width.',
  ihammer: 'The Inverted Hammer pattern appears at the bottom of a downtrend. It is identified by a small lower wick (or no lower wick) with a small body, and an elongated upper wick whose length is 2X greater than the candle body’s width.',
  hman: 'The Hanging Man pattern appears at the top of an uptrend. It is identified by a small upper wick (or no upper wick) with a small body, and an elongated lower wick whose length is 2X greater than the candle body’s width.',
  sstar: 'The Shooting Star pattern appears at the top of an uptrend. It is identified by a small lower wick (or no lower wick) with a small body, and an elongated upper wick whose length is 2X greater than the candle body’s width.',
  bulle: 'The Bullish Engulfing pattern appears at the bottom of a downtrend. It is a 2 bar pattern, identified by a large bullish candle body fully encapsulating (opening lower and closing higher) the previous small (bearish) candle body.',
  beare: 'The Bearish Engulfing pattern appears at the top of a downtrend. It is a 2 bar pattern, identified by a large bearish candle body fully encapsulating (opening higher and closing lower) the previous small (bullish) candle body.',
  r3: 'The Rising Three Method Pattern is an indicator of continuation for the current trend. It is a 5 bar pattern, identified by an initial full-bodied bullish candle, followed by 3 bearish candles that trade within the high and low of the initial candle, followed by another full-bodied bullish candle closing above the high of the initial candle.',
  f3: 'The Falling Three Method Pattern is an indicator of continuation for the current trend. It is a 5 bar pattern, identified by an initial full-bodied bearish candle, followed by 3 bullish candles that trade within the high and low of the initial candle, followed by another full-bodied bearish candle closing below the low of the initial candle.',
  tws: 'The Three White Soldiers Pattern appears at the bottom of a downtrend. It is identified by 3 full-bodied bullish candles, each opening within the body and closing below the high, of the previous candle.',
  tbc: 'The Three Black Crows Pattern appears at the top of an uptrend. It is identified by 3 full-bodied bearish candles, each open within the body and closing below the low, of the previous candle.',
  mstar: 'The Morning Star Pattern appears at the bottom of a downtrend. It is a 3 bar pattern, identified by a full-bodied bearish candle, followed by a small-bodied bearish candle, followed by a full-bodied bullish candle that closes above the halfway point of the first candle.',
  estar: 'The Evening Star Pattern appears at the top of an uptrend. It is a 3 bar pattern, identified by a full-bodied bullish candle, followed by a small-bodied bullish candle, followed by a full-bodied bearish candle that closes below the halfway point of the first candle.',
  bullh: 'The Bullish Harami Pattern appears at the bottom of a downtrend. It is a 2 bar pattern, identified by an initial bearish candle, followed by a small bullish candle whose range is entirely contained within the body of the initial candle.',
  bearh: 'The Bearish Harami Pattern appears at the top of an uptrend. It is a 2 bar pattern, identified by an initial bullish candle, followed by a small bearish candle whose range is entirely contained within the body of the initial candle.',
  tweezerTop: 'The Tweezer Top bearish reversal candlestick pattern is identified by an initial bullish candle, followed by a bearish candle, both having equal highs.',
  tweezerBtm: 'The Tweezer Bottom bullish reversal candlestick pattern is identified by an initial bearish candle, followed by a bullish candle, both having equal lows.',
};

export const inputConfig: InputConfig[] = [
  { id: 'hammerTog', type: 'bool', title: 'Hammer\u2002\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0\u2006\u2006\u2006\u2006\u2002\u2002\u2002\u2002\u2002', defval: true, group: PATTERNS, inline: '1' },
  { id: 'ihammerTog', type: 'bool', title: 'Inverted Hammer\u2002\u2002\u2002', defval: true, group: PATTERNS, inline: '2' },
  { id: 'bulleTog', type: 'bool', title: 'Bullish Engulfing\u2002\u2002\u2002\u2002', defval: true, group: PATTERNS, inline: '3' },
  { id: 'r3Tog', type: 'bool', title: 'Rising 3\u2002\u2002\u2002\u2006\u2006\u2006\u2006\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0\u2006\u2002\u2002\u2002', defval: true, group: PATTERNS, inline: '4' },
  { id: 'twsTog', type: 'bool', title: '3 White Soldiers\u2002\u2002\u2006\u2002\u2002', defval: true, group: PATTERNS, inline: '5' },
  { id: 'mstarTog', type: 'bool', title: 'Morning Star\u2002\u2002\u2002\u00a0\u00a0\u2006\u2002\u2002\u2002', defval: true, group: PATTERNS, inline: '6' },
  { id: 'bullhTog', type: 'bool', title: 'Bullish Harami\u2002\u2002\u2002\u2002\u2002\u2002', defval: true, group: PATTERNS, inline: '7' },
  { id: 'btmTweezTog', type: 'bool', title: 'Tweezer Bottom\u2002\u2002\u2002\u2002', defval: true, group: PATTERNS, inline: '8' },
  { id: 'hmanTog', type: 'bool', title: 'Hanging Man', defval: true, group: PATTERNS, inline: '1' },
  { id: 'sstarTog', type: 'bool', title: 'Shooting Star', defval: true, group: PATTERNS, inline: '2' },
  { id: 'beareTog', type: 'bool', title: 'Bearish Engulfing', defval: true, group: PATTERNS, inline: '3' },
  { id: 'f3Tog', type: 'bool', title: 'Falling 3', defval: true, group: PATTERNS, inline: '4' },
  { id: 'tbcTog', type: 'bool', title: '3 Black Crows', defval: true, group: PATTERNS, inline: '5' },
  { id: 'estarTog', type: 'bool', title: 'Evening Star', defval: true, group: PATTERNS, inline: '6' },
  { id: 'bearhTog', type: 'bool', title: 'Bearish Harami', defval: true, group: PATTERNS, inline: '7' },
  { id: 'topTweezTog', type: 'bool', title: 'Tweezer Top', defval: true, group: PATTERNS, inline: '8' },
  { id: 'length', type: 'int', title: 'Trend Length', defval: 14, min: 2, group: 'Reversal Detection' },
  { id: 'threshold', type: 'float', title: 'Threshold', defval: 80, min: 0, max: 100, group: 'Reversal Detection' },
  { id: 'smooth', type: 'float', title: 'Warmup Length', defval: 20, min: 1, group: 'Reversal Detection' },
  { id: 'bcTog', type: 'bool', title: 'Color Candles', defval: true, group: 'Style', tooltip: 'Color Candles to visualize minor trend.' },
  { id: 'bullColor', type: 'color', title: 'Bull Color\u2006\u2006', defval: '#089981', group: 'Style' },
  { id: 'bearColor', type: 'color', title: 'Bear Color', defval: '#f23645', group: 'Style' },
  { id: 'useGradient', type: 'bool', title: 'Use Gradient', defval: true, group: 'Style' },
  {
    id: 'txtSize', type: 'string', title: 'Label Size', defval: 'tiny', options: ['tiny', 'small', 'normal', 'large', 'huge', 'auto'],
    group: 'Style', inline: '3',
  },
  { id: 'showDash', type: 'bool', title: 'Show Dashboard', defval: false, group: 'Dashboard' },
  {
    id: 'dashLoc', type: 'string', title: 'Location', defval: 'Bottom Right',
    options: ['Top Right', 'Bottom Right', 'Bottom Left'], group: 'Dashboard',
  },
  { id: 'textSize', type: 'string', title: 'Size', defval: 'Tiny', options: ['Tiny', 'Small', 'Normal'], group: 'Dashboard' },
];

export const plotConfig: PlotConfig[] = [];

export const metadata = {
  title: 'Reversal Candlestick Structure [LuxAlgo]',
  shortTitle: 'LuxAlgo - Reversal Candlestick Structure',
  overlay: true,
};

/** indicator(max_labels_count = 500) */
const MAX_LABELS = 500;

/** Pine float comparisons: equal within 1e-10; na compares false */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const ge = (a: number, b: number) => a - b >= -EPS;
const le = (a: number, b: number) => b - a >= -EPS;
const eq = (a: number, b: number) => Math.abs(a - b) <= EPS;

export function calculate(
  bars: Bar[],
  inputs: Partial<ReversalCandlestickStructureInputs> = {},
  chart?: ChartContext,
): Omit<IndicatorResult, 'labels' | 'tables' | 'barColors'> & { labels: LabelData[]; tables: TableData[]; barColors: BarColorData[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const mintick = mintickOf(chart);
  const { threshold, bullColor, bearColor } = cfg;
  const roundTick = (v: number) => math.round_to_mintick(v, mintick) as number;

  // Trend detection
  const close = new Series(bars, (b) => b.close);
  const k = ta.stoch(close, close, close, Math.trunc(cfg.length)).toArray();
  const alpha = 2 / (cfg.smooth + 1);
  const nz = (v: number) => (Number.isFinite(v) ? v : 0);
  let smoothK = 0;
  const isBullish: boolean[] = new Array(n);
  const isBearish: boolean[] = new Array(n);

  // Candle measurements
  const high = bars.map((b) => b.high);
  const low = bars.map((b) => b.low);
  const open = bars.map((b) => b.open);
  const cls = bars.map((b) => b.close);
  const rc = bars.map((b) => lt(b.close, b.open)); // red candle
  const gc = bars.map((b) => gt(b.close, b.open)); // green candle
  const cTop = bars.map((b) => Math.max(b.open, b.close));
  const cBot = bars.map((b) => Math.min(b.open, b.close));
  const bodWidth = bars.map((_, i) => cTop[i] - cBot[i]);
  // a bar without a range: 0 / 0 is na
  const hwPer = bars.map((b, i) => ((b.high - cTop[i]) / (b.high - b.low)) * 100);
  const lwPer = bars.map((b, i) => ((cBot[i] - b.low) / (b.high - b.low)) * 100);
  const bPer = bars.map((b, i) => (bodWidth[i] / (b.high - b.low)) * 100);
  const doji = bars.map((b) => eq(roundTick(b.close), roundTick(b.open)));
  /** `x[k]`: na (false) before the first bar */
  const at = <T>(arr: T[], i: number, back: number, na: T): T => (i - back >= 0 ? arr[i - back] : na);
  const num = (arr: number[], i: number, back: number) => at(arr, i, back, NaN);
  const flag = (arr: boolean[], i: number, back: number) => at(arr, i, back, false);

  /** count(condition, filter): occurrences of a pattern, and those against the trend */
  const counter = () => {
    let reversals = 0;
    let total = 0;
    return {
      add(condition: boolean, filter: boolean): boolean {
        reversals += condition && filter ? 1 : 0;
        total += condition ? 1 : 0;
        return condition && filter;
      },
      percent: () => (reversals / total) * 100,
      total: () => total,
    };
  };
  const cHammer = counter();
  const cInvHammer = counter();
  const cRising3 = counter();
  const cBullEngulfing = counter();
  const cSoldiers = counter();
  const cMStar = counter();
  const cBullHarami = counter();
  const cTweezerBtm = counter();
  const cSStar = counter();
  const cHMan = counter();
  const cFalling3 = counter();
  const cBearEngulfing = counter();
  const cCrows = counter();
  const cEStar = counter();
  const cBearHarami = counter();
  const cTweezerTop = counter();

  // Live labels in creation order: when a creation brings the count above max + 5, the oldest are deleted until max remain
  interface Lb { x: number; y: number; text: string; up: boolean; tooltip: string }
  const labels: Lb[] = [];
  const newLabel = (x: number, up: boolean, text: string, tooltip: string) => {
    labels.push({ x, y: up ? low[x] : high[x], text, up, tooltip });
    if (labels.length > MAX_LABELS + 5) labels.splice(0, labels.length - MAX_LABELS);
  };

  const barColors: BarColorData[] = [];
  const fadedBear = color.new(bearColor, 80);
  const fadedBull = color.new(bullColor, 80);

  for (let i = 0; i < n; i++) {
    const kv = k[i] ?? NaN;
    smoothK = gt(kv, 50) ? smoothK + nz(100 - smoothK) * alpha : lt(kv, 50) ? smoothK + nz(0 - smoothK) * alpha : nz(kv);
    const bullishNow = ge(kv, threshold) && ge(smoothK, threshold);
    const bearishNow = le(kv, 100 - threshold) && le(smoothK, 100 - threshold);
    isBullish[i] = bullishNow;
    isBearish[i] = bearishNow;

    const hammerShape = gt(lwPer[i], bPer[i] * 2) && lt(bPer[i], 50) && lt(hwPer[i], 2) && !doji[i];
    const starShape = gt(hwPer[i], bPer[i] * 2) && lt(bPer[i], 50) && lt(lwPer[i], 2) && !doji[i];
    const high4 = num(high, i, 4);
    const low4 = num(low, i, 4);
    const inside4 = (back: number) => le(num(cTop, i, back), high4) && ge(num(cBot, i, back), low4);

    // Bullish patterns
    const hammer = cHammer.add(hammerShape, bearishNow);
    const invHammer = cInvHammer.add(starShape, bearishNow);
    const rising3 = cRising3.add(
      flag(gc, i, 4) && gt(num(bPer, i, 4), 50)
        && flag(rc, i, 3) && inside4(3) && flag(rc, i, 2) && inside4(2) && flag(rc, i, 1) && inside4(1)
        && gc[i] && gt(cls[i], high4) && gt(bPer[i], 50),
      flag(isBearish, i, 4),
    );
    const bullEngulfing = cBullEngulfing.add(
      flag(rc, i, 1) && gc[i] && gt(bodWidth[i], num(bodWidth, i, 1) / 2) && lt(open[i], num(cls, i, 1))
        && gt(cTop[i], num(cTop, i, 1)) && !rising3 && !flag(doji, i, 1),
      flag(isBearish, i, 1),
    );
    const soldiers = cSoldiers.add(
      flag(gc, i, 2) && gt(num(bPer, i, 2), 70)
        && flag(gc, i, 1) && gt(num(bPer, i, 1), 70) && ge(num(cBot, i, 1), num(cBot, i, 2))
        && le(num(cBot, i, 1), num(cTop, i, 2)) && gt(num(cls, i, 1), num(high, i, 2))
        && gc[i] && gt(bPer[i], 70) && ge(cBot[i], num(cBot, i, 1)) && le(cBot[i], num(cTop, i, 1)) && gt(cls[i], num(high, i, 1)),
      flag(isBearish, i, 3),
    );
    const hl2Back2 = (num(high, i, 2) + num(low, i, 2)) / 2;
    const mStar = cMStar.add(
      flag(rc, i, 2) && gt(num(bPer, i, 2), 80)
        && flag(rc, i, 1) && lt(num(bodWidth, i, 1), num(bodWidth, i, 2) / 2) && lt(num(open, i, 1), num(cls, i, 2))
        && gc[i] && gt(cls[i], hl2Back2),
      bearishNow,
    );
    const bullHarami = cBullHarami.add(
      gc[i] && le(high[i], num(cTop, i, 1)) && ge(low[i], num(cBot, i, 1)) && flag(rc, i, 1),
      bearishNow,
    );
    const tweezerBtm = cTweezerBtm.add(
      eq(roundTick(low[i]) - roundTick(num(low, i, 1)), 0) && gc[i] && flag(rc, i, 1),
      flag(isBearish, i, 1),
    );

    // Bearish patterns
    const sStar = cSStar.add(starShape, bullishNow);
    const hMan = cHMan.add(hammerShape, bullishNow);
    const falling3 = cFalling3.add(
      flag(rc, i, 4) && gt(num(bPer, i, 4), 50)
        && flag(gc, i, 3) && inside4(3) && flag(gc, i, 2) && inside4(2) && flag(gc, i, 1) && inside4(1)
        && rc[i] && lt(cls[i], low4) && gt(bPer[i], 50),
      flag(isBullish, i, 4),
    );
    const bearEngulfing = cBearEngulfing.add(
      flag(gc, i, 1) && rc[i] && gt(bodWidth[i], num(bodWidth, i, 1) / 2) && gt(open[i], num(cls, i, 1))
        && lt(cBot[i], num(cBot, i, 1)) && !falling3 && !flag(doji, i, 1),
      flag(isBullish, i, 1),
    );
    const crows = cCrows.add(
      flag(rc, i, 2) && gt(num(bPer, i, 2), 70)
        && flag(rc, i, 1) && gt(num(bPer, i, 1), 70) && le(num(cTop, i, 1), num(cTop, i, 2))
        && ge(num(cTop, i, 1), num(cBot, i, 2)) && lt(num(cls, i, 1), num(low, i, 2))
        && rc[i] && gt(bPer[i], 70) && le(cTop[i], num(cTop, i, 1)) && ge(cTop[i], num(cBot, i, 1)) && lt(cls[i], num(low, i, 1)),
      flag(isBullish, i, 3),
    );
    const eStar = cEStar.add(
      flag(gc, i, 2) && gt(num(bPer, i, 2), 80)
        && flag(gc, i, 1) && lt(num(bodWidth, i, 1), num(bodWidth, i, 2) / 2) && gt(num(open, i, 1), num(cls, i, 2))
        && rc[i] && lt(cls[i], hl2Back2),
      bullishNow,
    );
    const bearHarami = cBearHarami.add(
      rc[i] && le(high[i], num(cTop, i, 1)) && ge(low[i], num(cBot, i, 1)) && flag(gc, i, 1),
      bullishNow,
    );
    const tweezerTop = cTweezerTop.add(
      eq(roundTick(high[i]) - roundTick(num(high, i, 1)), 0) && rc[i] && flag(gc, i, 1),
      flag(isBullish, i, 1),
    );

    // Labels, in the order of the original (the bullish engulfing label is created twice there)
    if (hammer && cfg.hammerTog) newLabel(i, true, 'H', TOOLTIPS.hammer);
    if (invHammer && cfg.ihammerTog) newLabel(i, true, 'IH', TOOLTIPS.ihammer);
    if (sStar && cfg.sstarTog) newLabel(i, false, 'SS', TOOLTIPS.sstar);
    if (hMan && cfg.hmanTog) newLabel(i, false, 'HM', TOOLTIPS.hman);
    if (rising3 && cfg.r3Tog) newLabel(i, true, 'R3', TOOLTIPS.r3);
    if (falling3 && cfg.f3Tog) newLabel(i, false, 'F3', TOOLTIPS.f3);
    if (bullEngulfing && cfg.bulleTog) newLabel(i, true, 'EG▲', TOOLTIPS.bulle);
    if (bullEngulfing && cfg.bulleTog) newLabel(i, true, 'EG▲', TOOLTIPS.bulle);
    if (tweezerBtm && cfg.btmTweezTog) newLabel(i, true, 'TB', TOOLTIPS.tweezerBtm);
    if (bearEngulfing && cfg.beareTog) newLabel(i, false, 'EG▼', TOOLTIPS.beare);
    if (soldiers && cfg.twsTog) newLabel(i, true, '3WS', TOOLTIPS.tws);
    if (crows && cfg.tbcTog) newLabel(i, false, '3BC', TOOLTIPS.tbc);
    if (mStar && cfg.mstarTog) newLabel(i, true, 'MS', TOOLTIPS.mstar);
    if (eStar && cfg.estarTog) newLabel(i, false, 'ES', TOOLTIPS.estar);
    if (bullHarami && cfg.bullhTog) newLabel(i, true, 'H▲', TOOLTIPS.bullh);
    if (bearHarami && cfg.bearhTog) newLabel(i, false, 'H▼', TOOLTIPS.bearh);
    if (tweezerTop && cfg.topTweezTog) newLabel(i, false, 'TT', TOOLTIPS.tweezerTop);

    // Candle colouring
    if (cfg.bcTog) {
      let css: string | null = null;
      if (cfg.useGradient) {
        if (bullishNow) css = String(color.from_gradient(smoothK, threshold, 100, fadedBear, bearColor));
        else if (bearishNow) css = String(color.from_gradient(smoothK, 0, 100 - threshold, bullColor, fadedBull));
      } else {
        css = bullishNow ? bearColor : bearishNow ? bullColor : null;
      }
      if (css !== null) barColors.push({ time: bars[i].time, color: css });
    }
  }

  // Dashboard (var t = table.new(...): the table exists without a cell when the dashboard is off)
  const cells: TableCellData[] = [];
  if (cfg.showDash && n > 0) {
    const textSize = cfg.textSize.toLowerCase() as 'tiny' | 'small' | 'normal';
    const white = String(color.white);
    const cell = (column: number, row: number, text: string, extra: Partial<TableCellData> = {}) => {
      cells.push({ column, row, text, textColor: white, textSize, ...extra });
    };
    cell(0, 0, 'Bullish', { bgColor: String(color.new(bullColor, 50)) });
    cell(2, 0, 'Bearish', { bgColor: String(color.new(bearColor, 50)) });
    cell(0, 1, 'Pattern');
    cell(1, 1, 'Reversals %');
    cell(2, 1, 'Pattern');
    cell(3, 1, 'Reversals %');
    const stat = (on: boolean, column: number, row: number, name: string, c: ReturnType<typeof counter>) => {
      if (!on) return;
      cell(column, row, name, { textHAlign: 'left' });
      cell(column + 1, row, str.tostring(nz(c.percent()), 'percent'), { tooltip: `Pattern Count:${str.tostring(c.total())}` });
    };
    stat(cfg.hammerTog, 0, 2, 'Hammer (H)', cHammer);
    stat(cfg.ihammerTog, 0, 3, 'Inverted Hammer (IH)', cInvHammer);
    stat(cfg.bulleTog, 0, 4, 'Bullish Engulfing (EG▲)', cBullEngulfing);
    stat(cfg.r3Tog, 0, 5, 'Rising 3 (R3)', cRising3);
    stat(cfg.twsTog, 0, 6, '3 White Soldiers (3WS)', cSoldiers);
    stat(cfg.mstarTog, 0, 7, 'Morning Star (MS)', cMStar);
    stat(cfg.bullhTog, 0, 8, 'Bull Harami (H▲)', cBullHarami);
    stat(cfg.btmTweezTog, 0, 9, 'Tweezer Bottom (TB)', cTweezerBtm);
    stat(cfg.hmanTog, 2, 2, 'Hanging Man (HM)', cHMan);
    stat(cfg.sstarTog, 2, 3, 'Shooting Star (SS)', cSStar);
    stat(cfg.beareTog, 2, 4, 'Bear Engulfing (EG▼)', cBearEngulfing);
    stat(cfg.f3Tog, 2, 5, 'Falling 3 (F3)', cFalling3);
    stat(cfg.tbcTog, 2, 6, '3 Black Crows (3BC)', cCrows);
    stat(cfg.estarTog, 2, 7, 'Evening Star (ES)', cEStar);
    stat(cfg.bearhTog, 2, 8, 'Bear Harami (H▼)', cBearHarami);
    stat(cfg.topTweezTog, 2, 9, 'Tweezer Top (TT)', cTweezerTop);
  }
  const tables: TableData[] = n === 0 ? [] : [{
    position: cfg.dashLoc === 'Bottom Left' ? 'bottom_left' : cfg.dashLoc === 'Top Right' ? 'top_right' : 'bottom_right',
    columns: 4, rows: 10, cells,
    ...(cfg.showDash ? { merges: [{ startColumn: 0, startRow: 0, endColumn: 1, endRow: 0 }, { startColumn: 2, startRow: 0, endColumn: 3, endRow: 0 }] } : {}),
    bgColor: '#1e222d', borderColor: '#373a46', borderWidth: 1, frameColor: '#373a46', frameWidth: 1,
  }];

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {},
    labels: labels.map((l) => ({
      time: bars[l.x].time, price: l.y, text: l.text, color: 'transparent', textColor: l.up ? bullColor : bearColor,
      style: l.up ? 'label_up' as const : 'label_down' as const, size: cfg.txtSize, tooltip: l.tooltip,
    })),
    tables,
    barColors,
  };
}

export const ReversalCandlestickStructure = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
};
