/**
 * Maket Strat Absorption Bubbles
 *
 * The volume is scaled by its standard deviation over the lookback period (scaledVol = volume / stdev, 0 when the
 * stdev is 0 or na). With the threshold t, five bands give five bubble sizes: [t, t + 1), [t + 1, t + 2),
 * [t + 2, t + 3), [t + 3, t + 6) and >= t + 6. A bubble (circle) is drawn at the middle of the bar range
 * ((high + low) / 2): dark red when the middle is in the upper wick (selling absorption), dark green when it is in
 * the lower wick (buying absorption). Bars whose middle is inside the body with scaledVol > t + 2 are coloured green
 * (bull bar) or red (bear bar).
 * Alerts (alertcondition, `alerts` of the result): buying, selling and any absorption bubble, on closed bars (the
 * chart context says when the last bar is still open; fallback: closed). The bubbles of the alerts do not depend on
 * the band of the bubble: any band, with the middle in the lower / upper wick.
 *
 * Reference: "Maket Strat Absorption Bubbles" by samb817
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 */

import { ta, Series, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { BarColorData, MarkerData, PineSize } from '../types';
import { lastBarConfirmedOf, type ChartContext } from '../chart-context';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

export interface MaketStratAbsorptionBubblesInputs {
  showDots: boolean;
  /** Absorption threshold (t) */
  limitFactor: number;
  /** Standard deviation length of the volume */
  lookbackperiod: number;
}

export const defaultInputs: MaketStratAbsorptionBubblesInputs = {
  showDots: true,
  limitFactor: 0.1,
  lookbackperiod: 100,
};

export const inputConfig: InputConfig[] = [
  { id: 'showDots', type: 'bool', title: 'Show Bubbles?', defval: true },
  { id: 'limitFactor', type: 'float', title: 'Absorption Threshold', defval: 0.1, min: 0.1, step: 0.1 },
  { id: 'lookbackperiod', type: 'int', title: 'Lookback Period', defval: 100 },
];

// No plot(): the outputs are plotshape markers and bar colours
export const plotConfig: PlotConfig[] = [];

export const metadata = {
  title: 'Maket Strat Absorption Bubbles',
  shortTitle: 'Maket Strat Absorption Bubbles',
  overlay: true,
};

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const ge = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(b - a > EPS);
const le = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(a - b > EPS);
const ne = (a: number, b: number) => !isNaN(a) && !isNaN(b) && Math.abs(a - b) > EPS;

export function calculate(
  bars: Bar[],
  inputs: Partial<MaketStratAbsorptionBubblesInputs> = {},
  chart?: ChartContext,
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[]; barColors: BarColorData[] } & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const t = cfg.limitFactor;
  const bullBubbleColor = String(color.rgb(0, 120, 0));
  const bearBubbleColor = String(color.rgb(150, 0, 0));
  const bullBarColor = String(color.rgb(0, 180, 0));
  const bearBarColor = String(color.rgb(180, 0, 0));
  // Sizes of the five bands (condA .. condE)
  const sizes: PineSize[] = ['small', 'normal', 'large', 'huge', 'huge'];

  const volume = new Series(bars, (b) => b.volume ?? NaN);
  const volStDev = ta.stdev(volume, cfg.lookbackperiod).toArray();

  const markers: MarkerData[] = [];
  const barColors: BarColorData[] = [];
  // barstate.isconfirmed: every bar but a last bar that is still open
  const lastConfirmed = lastBarConfirmedOf(chart);
  const buyFlags: boolean[] = [], sellFlags: boolean[] = [], anyFlags: boolean[] = [];
  for (let i = 0; i < bars.length; i++) {
    const b = bars[i];
    const volData = b.volume ?? NaN;
    const midPrice = (b.high + b.low) / 2;
    const sd = volStDev[i] ?? NaN;
    // scaledVol = volStDev != 0 ? volData / volStDev : 0 (na != 0 is false)
    const scaledVol = ne(sd, 0) ? volData / sd : 0;

    const cond = [
      cfg.showDots && ge(scaledVol, t) && lt(scaledVol, t + 1),
      cfg.showDots && ge(scaledVol, t + 1) && lt(scaledVol, t + 2),
      cfg.showDots && ge(scaledVol, t + 2) && lt(scaledVol, t + 3),
      cfg.showDots && ge(scaledVol, t + 3) && lt(scaledVol, t + 6),
      cfg.showDots && ge(scaledVol, t + 6),
    ];

    const bullBar = gt(b.close, b.open);
    const bearBar = lt(b.close, b.open);
    const topWick = b.high;
    const topBody = Math.max(b.open, b.close);
    const lowBody = Math.min(b.open, b.close);
    const bottomWick = b.low;
    const upperZone = ge(midPrice, topBody) && le(midPrice, topWick);
    const lowerZone = le(midPrice, lowBody) && ge(midPrice, bottomWick);
    const validUp = upperZone;
    const validDn = lowerZone;
    // buyingAbsorption = anyBubble and validDn; sellingAbsorption = anyBubble and validUp (alerts: and isconfirmed)
    const anyBubble = cond.some(Boolean);
    const confirmed = i < bars.length - 1 || lastConfirmed;
    buyFlags.push(anyBubble && validDn && confirmed);
    sellFlags.push(anyBubble && validUp && confirmed);
    anyFlags.push(anyBubble && (validUp || validDn) && confirmed);

    // plotshape(condX and validUp ? midPrice : na, style = shape.circle, location = location.absolute, ...):
    // the five selling series first, then the five buying series
    if (!isNaN(midPrice)) {
      for (let k = 0; k < 5; k++) {
        if (cond[k] && validUp) {
          markers.push({ time: b.time, id: `shape${k}`, position: 'atPriceMiddle', price: midPrice, shape: 'circle',
            color: bearBubbleColor, size: sizes[k] });
        }
      }
      for (let k = 0; k < 5; k++) {
        if (cond[k] && validDn) {
          markers.push({ time: b.time, id: `shape${5 + k}`, position: 'atPriceMiddle', price: midPrice, shape: 'circle',
            color: bullBubbleColor, size: sizes[k] });
        }
      }
    }

    const insideBody = gt(midPrice, lowBody) && lt(midPrice, topBody);
    const heavyVolBody = gt(scaledVol, t + 2);
    // barcolor(insideBody and heavyVolBody and bullBar ? color.rgb(0, 180, 0) : na), then the same for bearBar
    if (insideBody && heavyVolBody && bullBar) barColors.push({ time: b.time, color: bullBarColor });
    if (insideBody && heavyVolBody && bearBar) barColors.push({ time: b.time, color: bearBarColor });
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {},
    markers,
    barColors,
    alerts: alertStates(alertConditions, bars, [buyFlags, sellFlags, anyFlags]),
  };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'Maket Strat Buying Absorption Bubble',
    message: 'Maket Strat Absorption Bubbles: Buying absorption bubble detected. Buyers may be absorbing selling pressure.' },
  { id: 'alert1', title: 'Maket Strat Selling Absorption Bubble',
    message: 'Maket Strat Absorption Bubbles: Selling absorption bubble detected. Sellers may be absorbing buying pressure.' },
  { id: 'alert2', title: 'Maket Strat Absorption Bubble', message: 'Maket Strat Absorption Bubbles: Absorption bubble detected.' },
];

export const MaketStratAbsorptionBubbles = { calculate, metadata, defaultInputs, inputConfig, plotConfig, alertConditions };
