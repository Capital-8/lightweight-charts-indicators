/**
 * Absorption Bubbles
 *
 * The volume is scaled by its standard deviation over the lookback period (scaledVol = volume / stdev). With the
 * threshold t, five bands give five bubble sizes: [t, t + 1) tiny, [t + 1, t + 2) small, [t + 2, t + 3) normal,
 * [t + 3, t + 6) large and >= t + 6 huge. A bubble (circle) is drawn at the middle of the bar range
 * ((high + low) / 2) when that middle is in the upper wick (green gradient, selling absorption) or in the lower wick
 * (red gradient, buying absorption). The colour goes from a dark tone to a bright one as scaledVol goes from 0 to 8;
 * on a white chart background the dark end is fully transparent. Bars whose middle is inside the body with
 * scaledVol > t + 2 are coloured bright green (bull bar) or light red (bear bar).
 *
 * The chart background colour comes from the chart context (third argument); without it the dark theme value is used.
 *
 * Alerts (as the original's alertcondition calls): buying absorption (a bubble in the lower wick), selling absorption
 * (a bubble in the upper wick) and any absorption, on confirmed bars only (`barstate.isconfirmed`: the last bar only
 * when the chart context says it is closed, `lastBarConfirmed`; true without a context).
 *
 * Reference: "Absorption Bubbles" by profitprotrading
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © profitprotrading
 */

import { ta, Series, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { BarColorData, MarkerData, PineSize } from '../types';
import { backgroundColorOf, lastBarConfirmedOf, type ChartContext } from '../chart-context';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

export interface AbsorptionBubblesInputs {
  showDots: boolean;
  /** Absorption threshold (t) */
  limitFactor: number;
  /** Standard deviation length of the volume */
  lookbackperiod: number;
}

export const defaultInputs: AbsorptionBubblesInputs = {
  showDots: true,
  limitFactor: 0.1,
  lookbackperiod: 100,
};

export const inputConfig: InputConfig[] = [
  { id: 'showDots', type: 'bool', title: 'Show Bubbles?', defval: true, group: 'Absorption Bubbles' },
  { id: 'limitFactor', type: 'float', title: 'Absorption Threshold', defval: 0.1, min: 0.1, step: 0.1, group: 'Absorption Bubbles' },
  { id: 'lookbackperiod', type: 'int', title: 'Lookback Period', defval: 100, group: 'Absorption Bubbles' },
];

// No plot(): the outputs are plotshape markers and bar colours
export const plotConfig: PlotConfig[] = [];

export const metadata = {
  title: 'Absorption Bubbles',
  shortTitle: 'Absorption Bubbles',
  overlay: true,
};

export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'Buying Absorption', message: 'Absorption detected: Buyers absorbed selling pressure' },
  { id: 'alert1', title: 'Selling Absorption', message: 'Absorption detected: Sellers absorbed buying pressure' },
  { id: 'alert2', title: 'Absorption (Any)', message: 'Absorption detected: Buying or Selling absorption event' },
];

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const ge = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(b - a > EPS);
const le = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(a - b > EPS);

/** True when a colour is opaque white (`chart.bg_color == color.white`) */
function isWhite(c: string): boolean {
  const s = c.trim().toUpperCase();
  if (s === '#FFF' || s === '#FFFFFF' || s === '#FFFFFFFF' || s === 'WHITE') return true;
  const m = /^RGBA?\(\s*255\s*,\s*255\s*,\s*255\s*(?:,\s*([\d.]+)\s*)?\)$/.exec(s);
  return m !== null && (m[1] === undefined || Number(m[1]) === 1);
}

export function calculate(
  bars: Bar[],
  inputs: Partial<AbsorptionBubblesInputs> = {},
  chart?: ChartContext,
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[]; barColors: BarColorData[]; alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const t = cfg.limitFactor;
  const whiteChart = isWhite(backgroundColorOf(chart));
  const upFrom = whiteChart ? color.new(color.green, 100) : color.rgb(35, 73, 35, 15);
  const upTo = color.rgb(0, 217, 0, 70);
  const dnFrom = whiteChart ? color.new(color.red, 100) : color.rgb(77, 34, 34, 15);
  const dnTo = color.rgb(219, 0, 0, 70);
  const bullBarColor = String(color.rgb(0, 255, 0));
  const bearBarColor = String(color.rgb(255, 132, 132));
  // Sizes of the five bands (condA .. condE)
  const sizes: PineSize[] = ['tiny', 'small', 'normal', 'large', 'huge'];

  const volume = new Series(bars, (b) => b.volume ?? NaN);
  const volStDev = ta.stdev(volume, cfg.lookbackperiod).toArray();

  const markers: MarkerData[] = [];
  const barColors: BarColorData[] = [];
  // barstate.isconfirmed: every bar is closed, except the last one when the chart context says that it is still open
  const lastConfirmed = lastBarConfirmedOf(chart);
  const buyFlags: boolean[] = [], sellFlags: boolean[] = [], anyFlags: boolean[] = [];
  for (let i = 0; i < bars.length; i++) {
    const b = bars[i];
    const midPrice = (b.high + b.low) / 2;
    // A plain division: x / 0 is +-infinity (0 / 0 na); the comparisons use the infinite value
    const scaledVol = (b.volume ?? NaN) / (volStDev[i] ?? NaN);

    const cond = [
      cfg.showDots && ge(scaledVol, t) && lt(scaledVol, t + 1),
      cfg.showDots && ge(scaledVol, t + 1) && lt(scaledVol, t + 2),
      cfg.showDots && ge(scaledVol, t + 2) && lt(scaledVol, t + 3),
      cfg.showDots && ge(scaledVol, t + 3) && lt(scaledVol, t + 6),
      cfg.showDots && ge(scaledVol, t + 6),
    ];

    const bullBar = gt(b.close, b.open);
    const bearBar = lt(b.close, b.open);
    const topBody = Math.max(b.open, b.close);
    const lowBody = Math.min(b.open, b.close);
    const validUp = ge(midPrice, topBody) && le(midPrice, b.high);
    const validDn = le(midPrice, lowBody) && ge(midPrice, b.low);

    // alertcondition((condA or ... or condE) and validDn / validUp / (validUp or validDn) and barstate.isconfirmed)
    const confirmed = i < bars.length - 1 || lastConfirmed;
    const anyCond = cond.some((c) => c);
    buyFlags.push(anyCond && validDn && confirmed);
    sellFlags.push(anyCond && validUp && confirmed);
    anyFlags.push(anyCond && (validUp || validDn) && confirmed);

    // plotshape(condX and validUp ? midPrice : na, "", shape.circle, location.absolute, gradUp, size = ...):
    // the five upper-wick series first, then the five lower-wick series
    if (!isNaN(midPrice)) {
      for (let k = 0; k < 5; k++) {
        if (cond[k] && validUp) {
          markers.push({ time: b.time, position: 'atPriceMiddle', price: midPrice, shape: 'circle',
            color: String(color.from_gradient(scaledVol, 0, 8, upFrom, upTo)), size: sizes[k], id: `shape${k}` });
        }
      }
      for (let k = 0; k < 5; k++) {
        if (cond[k] && validDn) {
          markers.push({ time: b.time, position: 'atPriceMiddle', price: midPrice, shape: 'circle',
            color: String(color.from_gradient(scaledVol, 0, 8, dnFrom, dnTo)), size: sizes[k], id: `shape${k + 5}` });
        }
      }
    }

    const insideBody = gt(midPrice, lowBody) && lt(midPrice, topBody);
    const heavyVolBody = gt(scaledVol, t + 2);
    // barcolor(insideBody and heavyVolBody and bullBar ? color.rgb(0, 255, 0) : na), then the same for bearBar
    if (insideBody && heavyVolBody && bullBar) barColors.push({ time: b.time, color: bullBarColor, id: 'barcolor0' });
    if (insideBody && heavyVolBody && bearBar) barColors.push({ time: b.time, color: bearBarColor, id: 'barcolor1' });
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {},
    markers,
    barColors,
    alerts: alertStates(alertConditions, bars, [buyFlags, sellFlags, anyFlags]),
  };
}

export const AbsorptionBubbles = { calculate, metadata, defaultInputs, inputConfig, plotConfig, alertConditions };
