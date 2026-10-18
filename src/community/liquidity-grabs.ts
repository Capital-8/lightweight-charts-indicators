/**
 * Liquidity Grabs (Flux Charts)
 *
 * Detects liquidity grabs by tracking pivot highs/lows as liquidity zones,
 * then flagging bars where price wicks beyond a zone but closes back inside.
 * Bubble size (small / medium / large circles) = floor(min(wick / body / WBR, 3)), a plain division (a bar with no
 * body: wick / 0 is +infinity, a large grab); a size of 0 draws nothing. A cooldown prevents rapid-fire bubbles. As in the original, detection
 * (and the zones it keeps) only runs on the confirmed bars of the last 5000 (the last bar counts when the chart
 * context gives it as closed).
 *
 * Alerts (alertcondition, `alerts` of the result): 'Buyside Liquidity Grab @ {{ticker}}' and 'Sellside Liquidity
 * Grab @ {{ticker}}' on the bars with a grab of that side, as in the original also when the cooldown hides its
 * bubble.
 *
 * Reference: "Liquidity Grabs | Flux Charts" by fluxchart
 */

import { ta, Series, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';
import { lastBarConfirmedOf, type ChartContext } from '../chart-context';

export interface LiquidityGrabsInputs {
  pivotLength: number;
  wbr: number;
  cooldown: number;
  zoneCount: number;
}

export const defaultInputs: LiquidityGrabsInputs = {
  pivotLength: 25,
  wbr: 0.5,
  cooldown: 3,
  zoneCount: 5,
};

export const inputConfig: InputConfig[] = [
  { id: 'pivotLength', type: 'int', title: 'Pivot Length', defval: 25, min: 1 },
  { id: 'wbr', type: 'float', title: 'Wick-Body Ratio', defval: 0.5, min: 0.1, step: 0.1 },
  { id: 'cooldown', type: 'int', title: 'Cooldown Bars', defval: 3, min: 0 },
  { id: 'zoneCount', type: 'int', title: 'Liquidity Zone Count', defval: 5, min: 1 },
];

export const plotConfig: PlotConfig[] = [
  // plot(..., buysideColorGrab (#f2364680) / sellsideColorGrab (#08998180), bubbleSize (5) / int(5 * 1.5) / 5 * 2,
  //   plot.style_circles)
  { id: 'buySm', title: 'Buyside Liq Grab Small', color: '#f2364680', lineWidth: 5, style: 'circles' },
  { id: 'buyMd', title: 'Buyside Liq Grab Medium', color: '#f2364680', lineWidth: 7, style: 'circles' },
  { id: 'buyLg', title: 'Buyside Liq Grab Large', color: '#f2364680', lineWidth: 10, style: 'circles' },
  { id: 'sellSm', title: 'Sellside Liq Grab Small', color: '#08998180', lineWidth: 5, style: 'circles' },
  { id: 'sellMd', title: 'Sellside Liq Grab Medium', color: '#08998180', lineWidth: 7, style: 'circles' },
  { id: 'sellLg', title: 'Sellside Liq Grab Large', color: '#08998180', lineWidth: 10, style: 'circles' },
];

export const metadata = {
  title: 'Liquidity Grabs',
  shortTitle: 'LiqGrab',
  overlay: true,
};

/** maxDistanceToLastBar: grabs are only detected on the last 5000 bars */
const MAX_DISTANCE_TO_LAST_BAR = 5000;

export function calculate(
  bars: Bar[],
  inputs: Partial<LiquidityGrabsInputs> = {},
  chart?: ChartContext,
): IndicatorResult & { alerts: AlertConditionState[] } {
  const { pivotLength, wbr, cooldown, zoneCount } = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const len = pivotLength;

  const highSeries = new Series(bars, (b) => b.high);
  const lowSeries = new Series(bars, (b) => b.low);
  const highArr = highSeries.toArray();
  const lowArr = lowSeries.toArray();
  const closeArr = bars.map((b) => b.close);
  const openArr = bars.map((b) => b.open);

  // ta.pivothigh(len, len) / ta.pivotlow(len, len): the pivot value on the bar that confirms it (len bars later)
  const pivotHighs = ta.pivothigh(highSeries, len, len).toArray().map((v) => v ?? NaN);
  const pivotLows = ta.pivotlow(lowSeries, len, len).toArray().map((v) => v ?? NaN);

  // Liquidity grab detection
  const buySm: number[] = new Array(n).fill(NaN);
  const buyMd: number[] = new Array(n).fill(NaN);
  const buyLg: number[] = new Array(n).fill(NaN);
  const sellSm: number[] = new Array(n).fill(NaN);
  const sellMd: number[] = new Array(n).fill(NaN);
  const sellLg: number[] = new Array(n).fill(NaN);

  const buysideLiqs: number[] = [];
  const sellsideLiqs: number[] = [];
  // var lastBuysideGrab = 0 / var lastSellsideGrab = 0
  let lastBuysideGrab = 0;
  let lastSellsideGrab = 0;
  const buyFlags: boolean[] = new Array(n).fill(false);
  const sellFlags: boolean[] = new Array(n).fill(false);
  const lastConfirmed = lastBarConfirmedOf(chart);

  for (let i = 0; i < n; i++) {
    // if (last_bar_index - bar_index) < maxDistanceToLastBar and barstate.isconfirmed: detectLiquidityGrab() (and its
    // zone arrays) only runs on the confirmed bars of the last 5000; the other bars draw nothing
    if (!(n - 1 - i < MAX_DISTANCE_TO_LAST_BAR && (i < n - 1 || lastConfirmed))) continue;

    // Add new pivot zones
    if (!isNaN(pivotHighs[i])) {
      buysideLiqs.push(pivotHighs[i]);
      if (buysideLiqs.length > zoneCount) buysideLiqs.shift();
    }
    if (!isNaN(pivotLows[i])) {
      sellsideLiqs.push(pivotLows[i]);
      if (sellsideLiqs.length > zoneCount) sellsideLiqs.shift();
    }

    const hi = highArr[i];
    const lo = lowArr[i];
    const cl = closeArr[i];
    const op = openArr[i];
    const topClose = Math.max(cl, op);
    const botClose = Math.min(cl, op);
    // bodySize = math.abs(close - open); curWBR = wickSize / bodySize, a plain division (x / 0 is +infinity, so a
    // grab bar with no body has size 3; 0 / 0 is na)
    const bodySize = Math.abs(cl - op);
    const sizeOf = (wickSize: number) => {
      const curWBR = wickSize / bodySize;
      // math.floor(math.min(curWBR / WBR, 3))
      return Math.floor(Math.min(curWBR / wbr, 3));
    };

    let grabFound = false;
    let grabBuyside = true;
    let grabSize = 1;
    const toRemove: number[] = [];

    // Check buyside (price wicks above pivot high but closes below)
    for (let j = 0; j < buysideLiqs.length; j++) {
      const liq = buysideLiqs[j];
      if (hi > liq && topClose < liq) {
        grabFound = true;
        grabBuyside = true;
        grabSize = sizeOf(hi - topClose);
        toRemove.push(liq);
        break;
      }
      if (topClose > liq) {
        toRemove.push(liq);
        break;
      }
    }

    // Check sellside (price wicks below pivot low but closes above)
    if (!grabFound) {
      for (let j = 0; j < sellsideLiqs.length; j++) {
        const liq = sellsideLiqs[j];
        if (lo < liq && botClose > liq) {
          grabFound = true;
          grabBuyside = false;
          grabSize = sizeOf(botClose - lo);
          toRemove.push(liq);
          break;
        }
        if (botClose < liq) {
          toRemove.push(liq);
          break;
        }
      }
    }

    // Remove consumed levels
    for (const liq of toRemove) {
      let idx = buysideLiqs.indexOf(liq);
      if (idx !== -1) { buysideLiqs.splice(idx, 1); continue; }
      idx = sellsideLiqs.indexOf(liq);
      if (idx !== -1) sellsideLiqs.splice(idx, 1);
    }

    // liqGrabCooldownOK: bars since the last drawn grab of the side found (buyside when no grab) above the cooldown
    const cooldownOk = grabBuyside ? (i - lastBuysideGrab) > cooldown : (i - lastSellsideGrab) > cooldown;
    // if _grabFound and _grabSize > 0 (na compares false): the size flags of the bar
    if (grabFound && grabSize > 0) {
      // alertcondition((buysideLiqGrabSmall or ...Medium or ...Large) and barstate.isconfirmed, ...): whatever the
      // cooldown
      if (grabBuyside) buyFlags[i] = true;
      else sellFlags[i] = true;

      // plot((buysideLiqGrabSmall and renderingEnabled and liqGrabCooldownOK) ? high : na, ...)
      if (cooldownOk) {
        if (grabBuyside) {
          lastBuysideGrab = i;
          if (grabSize === 1) buySm[i] = hi;
          else if (grabSize === 2) buyMd[i] = hi;
          else buyLg[i] = hi;
        } else {
          lastSellsideGrab = i;
          if (grabSize === 1) sellSm[i] = lo;
          else if (grabSize === 2) sellMd[i] = lo;
          else sellLg[i] = lo;
        }
      }
    }
  }

  const mkPlot = (arr: number[]) => arr.map((v, i) => ({ time: bars[i].time, value: v }));

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {
      'buySm': mkPlot(buySm),
      'buyMd': mkPlot(buyMd),
      'buyLg': mkPlot(buyLg),
      'sellSm': mkPlot(sellSm),
      'sellMd': mkPlot(sellMd),
      'sellLg': mkPlot(sellLg),
    },
    alerts: alertStates(alertConditions, bars, [buyFlags, sellFlags]),
  };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'Buyside Liquidity Grab @ {{ticker}}', message: 'Buyside Liquidity Grab @ {{ticker}}' },
  { id: 'alert1', title: 'Sellside Liquidity Grab @ {{ticker}}', message: 'Sellside Liquidity Grab @ {{ticker}}' },
];

export const LiquidityGrabs = { calculate, metadata, defaultInputs, inputConfig, plotConfig, alertConditions };
