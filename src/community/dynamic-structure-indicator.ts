/**
 * Dynamic Structure Indicator
 *
 * ATR(14)-based S/R zone detection using fractal swing highs/lows.
 * Zones are defined by wick-to-body range, filtered by maxZoneSize * ATR.
 * Potential zones must see significant price movement (atrMovement * ATR)
 * before becoming active. Active zones get resistance and support plot pairs.
 * Previous zones (flipped S/R) are also plotted. Zone violation resets.
 *
 * Alerts (alertcondition, `alerts` of the result): '[DSI] Alert!' (any of the four below), '[DSI] Resistance Alert'
 * (high >= resistance body level), '[DSI] Support Alert' (low <= support body level), '[DSI] Resistance Breakout'
 * (close >= resistance wick level) and '[DSI] Support Breakout' (close <= support wick level). The levels are those of
 * the original's zone rules (its res1 / res2 / sup1 / sup2, computed on their own below, starting at 0 as there;
 * barstate.isconfirmed from the chart context, the third argument), not the zones this port draws.
 *
 * Reference: "Dynamic Structure Indicator" (community)
 */

import { ta, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';
import { lastBarConfirmedOf, type ChartContext } from '../chart-context';

export interface DynamicStructureIndicatorInputs {
  atrMovement: number;
  lookback: number;
  maxZoneSize: number;
  newStructureReset: number;
  drawPreviousStructure: boolean;
}

export const defaultInputs: DynamicStructureIndicatorInputs = {
  atrMovement: 1.0,
  lookback: 25,
  maxZoneSize: 2.5,
  newStructureReset: 25,
  drawPreviousStructure: true,
};

export const inputConfig: InputConfig[] = [
  { id: 'atrMovement', type: 'float', title: 'ATR Movement', defval: 1.0, min: 0.1, step: 0.1 },
  { id: 'lookback', type: 'int', title: 'Lookback', defval: 25, min: 1 },
  { id: 'maxZoneSize', type: 'float', title: 'Max Zone Size (ATR)', defval: 2.5, min: 0.1, step: 0.1 },
  { id: 'newStructureReset', type: 'int', title: 'New Structure Reset', defval: 25, min: 1 },
  { id: 'drawPreviousStructure', type: 'bool', title: 'Draw Previous Structure', defval: true },
];

export const plotConfig: PlotConfig[] = [
  { id: 'r1', title: 'Resistance 1', color: '#EF5350', lineWidth: 1 },
  { id: 'r2', title: 'Resistance 2', color: '#EF5350', lineWidth: 1 },
  { id: 's1', title: 'Support 1', color: '#26A69A', lineWidth: 1 },
  { id: 's2', title: 'Support 2', color: '#26A69A', lineWidth: 1 },
  { id: 'pr1', title: 'Prev Resistance 1', color: '#26A69A', lineWidth: 1 },
  { id: 'pr2', title: 'Prev Resistance 2', color: '#26A69A', lineWidth: 1 },
  { id: 'ps1', title: 'Prev Support 1', color: '#EF5350', lineWidth: 1 },
  { id: 'ps2', title: 'Prev Support 2', color: '#EF5350', lineWidth: 1 },
];

export const metadata = {
  title: 'Dynamic Structure Indicator',
  shortTitle: 'DSI',
  overlay: true,
};

interface Zone {
  top: number;    // upper boundary (wick)
  bottom: number; // lower boundary (body)
  startIdx: number;
  active: boolean;
  potential: boolean; // waiting for ATR movement confirmation
  potentialHigh: number;
  potentialLow: number;
}

/**
 * The original's zone levels per bar (res1 / res2 / sup1 / sup2: wick and body of the current resistance and support,
 * 0 until the first zone), from its rules: fractal swing high / low, a zone no larger than maxZoneSize x ATR, taken
 * once price moved atrMovement x the saved ATR away from it; searching again after a confirmed close beyond it.
 */
function originalLevels(bars: Bar[], cfg: DynamicStructureIndicatorInputs, atr: number[], lastBarOpen: boolean) {
  const n = bars.length;
  const res1: number[] = [], res2: number[] = [], sup1: number[] = [], sup2: number[] = [];
  const hb = bars.map((b) => (b.open > b.close ? b.open : b.close));
  const lb = bars.map((b) => (b.open > b.close ? b.close : b.open));
  const at = (a: number[], i: number) => (i >= 0 ? a[i] : NaN);
  let r1v = 0, r2v = 0, s1v = 0, s2v = 0;
  let lookRes = true, lookSup = true;
  let prevRes1 = 0, prevRes2 = 0, prevSup1 = 0, prevSup2 = 0;
  let atrSaved = 0, potR1 = 0, potR2 = 0, potS1 = 0, potS2 = 0;
  let supCount = 0, resCount = 0;
  for (let i = 0; i < n; i++) {
    const { high, low, close } = bars[i];
    const confirmed = !(lastBarOpen && i === n - 1);
    // ta.highest(high, lookback) / ta.lowest(low, lookback): na until lookback bars exist
    let hh = NaN, ll = NaN;
    if (i >= cfg.lookback - 1) {
      hh = -Infinity; ll = Infinity;
      for (let j = i - cfg.lookback + 1; j <= i; j++) { hh = Math.max(hh, bars[j].high); ll = Math.min(ll, bars[j].low); }
    }
    const high1 = i > 0 ? bars[i - 1].high : NaN;
    const low1 = i > 0 ? bars[i - 1].low : NaN;
    if (high1 === hh && high < high1 && lookRes) {
      const r1 = high1;
      const r2 = at(hb, i - 2) > at(hb, i - 1) ? at(hb, i - 2) : hb[i] > at(hb, i - 1) ? hb[i] : at(hb, i - 1);
      if ((r1 - r2) / atr[i] <= cfg.maxZoneSize) {
        lookRes = false; potR1 = r1; potR2 = r2; atrSaved = atr[i];
      }
    }
    if (low1 === ll && low > low1 && lookSup) {
      const s1 = low1;
      const s2 = at(lb, i - 2) < at(lb, i - 1) ? at(lb, i - 2) : lb[i] < at(lb, i - 1) ? lb[i] : at(lb, i - 1);
      if ((s2 - s1) / atr[i] <= cfg.maxZoneSize) {
        lookSup = false; potS1 = s1; potS2 = s2; atrSaved = atr[i];
      }
    }
    if (close > potR1 && confirmed) { potR1 = NaN; potR2 = NaN; }
    if (close < potS1 && confirmed) { potS1 = NaN; potS2 = NaN; }
    if (potR1 - low >= atrSaved * cfg.atrMovement) {
      prevRes1 = isNaN(prevRes1) ? potR1 : prevRes1;
      prevRes2 = isNaN(prevRes2) ? potR2 : prevRes2;
      r1v = potR1; r2v = potR2; potR1 = NaN; potR2 = NaN;
    }
    if (high - potS1 >= atrSaved * cfg.atrMovement) {
      prevSup1 = isNaN(prevSup1) ? potS1 : prevSup1;
      prevSup2 = isNaN(prevSup2) ? potS2 : prevSup2;
      s1v = potS1; s2v = potS2; potS1 = NaN; potS2 = NaN;
    }
    if (close >= r1v && confirmed) { lookRes = true; lookSup = true; resCount++; }
    if (close <= s1v && confirmed) { lookSup = true; lookRes = true; supCount++; }
    if ((close > r1v && isNaN(prevRes1) && confirmed) || prevRes1 === 0 || supCount >= cfg.newStructureReset) {
      prevRes1 = r1v; prevRes2 = r2v; supCount = 0;
    }
    if ((close < s1v && isNaN(prevSup1) && confirmed) || prevSup1 === 0 || resCount >= cfg.newStructureReset) {
      prevSup1 = s1v; prevSup2 = s2v; resCount = 0;
    }
    if (close < prevRes2 && confirmed) { prevRes1 = NaN; prevRes2 = NaN; }
    if (close > prevSup2 && confirmed) { prevSup1 = NaN; prevSup2 = NaN; }
    res1.push(r1v); res2.push(r2v); sup1.push(s1v); sup2.push(s2v);
  }
  return { res1, res2, sup1, sup2 };
}

export function calculate(
  bars: Bar[],
  inputs: Partial<DynamicStructureIndicatorInputs> = {},
  chart?: ChartContext,
): IndicatorResult & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const lb = cfg.lookback;

  const atrArr = ta.atr(bars, 14).toArray();

  // alertResistance = high >= res2, alertSupport = low <= sup2, alertResistanceBO = close >= res1,
  // alertSupportBO = close <= sup1 (the original's levels)
  const atrNum = atrArr.map((v) => v ?? NaN);
  const { res1, res2, sup1, sup2 } = originalLevels(bars, cfg, atrNum, !lastBarConfirmedOf(chart));
  const lv = {
    resAlert: bars.map((b, i) => b.high >= res2[i]),
    supAlert: bars.map((b, i) => b.low <= sup2[i]),
    resBo: bars.map((b, i) => b.close >= res1[i]),
    supBo: bars.map((b, i) => b.close <= sup1[i]),
  };

  // Output arrays
  const r1Arr: number[] = new Array(n).fill(NaN);
  const r2Arr: number[] = new Array(n).fill(NaN);
  const s1Arr: number[] = new Array(n).fill(NaN);
  const s2Arr: number[] = new Array(n).fill(NaN);
  const pr1Arr: number[] = new Array(n).fill(NaN);
  const pr2Arr: number[] = new Array(n).fill(NaN);
  const ps1Arr: number[] = new Array(n).fill(NaN);
  const ps2Arr: number[] = new Array(n).fill(NaN);

  // Active zones
  let resZone: Zone | null = null;
  let supZone: Zone | null = null;
  let prevResZone: Zone | null = null;
  let prevSupZone: Zone | null = null;

  // Helper: rolling highest/lowest
  function highest(arr: Bar[], idx: number, period: number, field: 'high' | 'low' | 'close'): number {
    let max = -Infinity;
    const start = Math.max(0, idx - period + 1);
    for (let j = start; j <= idx; j++) max = Math.max(max, arr[j][field]);
    return max;
  }
  function lowest(arr: Bar[], idx: number, period: number, field: 'high' | 'low' | 'close'): number {
    let min = Infinity;
    const start = Math.max(0, idx - period + 1);
    for (let j = start; j <= idx; j++) min = Math.min(min, arr[j][field]);
    return min;
  }

  const warmup = Math.max(14, lb + 1);

  for (let i = warmup; i < n; i++) {
    const atr = atrArr[i] ?? 0;
    if (atr === 0) continue;

    const close = bars[i].close;
    const high = bars[i].high;
    const low = bars[i].low;

    // Fractal swing high detection:
    // high[1] == highest(high, lookback) at [1] AND high < high[1]
    if (i >= 2) {
      const prevHigh = bars[i - 1].high;
      const highestHigh = highest(bars, i - 1, lb, 'high');

      if (prevHigh === highestHigh && high < prevHigh) {
        // Swing high found at bar i-1
        const wickTop = bars[i - 1].high;
        const bodyTop = Math.max(bars[i - 1].open, bars[i - 1].close);
        const zoneSize = wickTop - bodyTop;

        if (zoneSize <= cfg.maxZoneSize * atr && zoneSize > 0) {
          // Create potential resistance zone
          const zone: Zone = {
            top: wickTop,
            bottom: bodyTop,
            startIdx: i - 1,
            active: false,
            potential: true,
            potentialHigh: high,
            potentialLow: low,
          };

          // Save current resistance as previous if it exists
          if (resZone && resZone.active && cfg.drawPreviousStructure) {
            prevSupZone = { ...resZone, active: true, potential: false, potentialHigh: 0, potentialLow: 0 };
          }
          resZone = zone;
        }
      }

      // Fractal swing low detection:
      // low[1] == lowest(low, lookback) at [1] AND low > low[1]
      const prevLow = bars[i - 1].low;
      const lowestLow = lowest(bars, i - 1, lb, 'low');

      if (prevLow === lowestLow && low > prevLow) {
        // Swing low found at bar i-1
        const wickBottom = bars[i - 1].low;
        const bodyBottom = Math.min(bars[i - 1].open, bars[i - 1].close);
        const zoneSize = bodyBottom - wickBottom;

        if (zoneSize <= cfg.maxZoneSize * atr && zoneSize > 0) {
          // Create potential support zone
          const zone: Zone = {
            top: bodyBottom,
            bottom: wickBottom,
            startIdx: i - 1,
            active: false,
            potential: true,
            potentialHigh: high,
            potentialLow: low,
          };

          // Save current support as previous if it exists
          if (supZone && supZone.active && cfg.drawPreviousStructure) {
            prevResZone = { ...supZone, active: true, potential: false, potentialHigh: 0, potentialLow: 0 };
          }
          supZone = zone;
        }
      }
    }

    // Check potential zones for ATR movement confirmation
    if (resZone && resZone.potential) {
      resZone.potentialLow = Math.min(resZone.potentialLow, low);
      if (resZone.top - resZone.potentialLow >= cfg.atrMovement * atr) {
        resZone.active = true;
        resZone.potential = false;
      }
      // Reset if too many bars without confirmation
      if (i - resZone.startIdx > cfg.newStructureReset && !resZone.active) {
        resZone = null;
      }
    }

    if (supZone && supZone.potential) {
      supZone.potentialHigh = Math.max(supZone.potentialHigh, high);
      if (supZone.potentialHigh - supZone.bottom >= cfg.atrMovement * atr) {
        supZone.active = true;
        supZone.potential = false;
      }
      // Reset if too many bars without confirmation
      if (i - supZone.startIdx > cfg.newStructureReset && !supZone.active) {
        supZone = null;
      }
    }

    // Zone violation checks
    if (resZone && resZone.active && close > resZone.top) {
      // Resistance violated - becomes previous support
      if (cfg.drawPreviousStructure) {
        prevSupZone = { ...resZone };
      }
      resZone = null;
    }

    if (supZone && supZone.active && close < supZone.bottom) {
      // Support violated - becomes previous resistance
      if (cfg.drawPreviousStructure) {
        prevResZone = { ...supZone };
      }
      supZone = null;
    }

    // Previous zone violations
    if (prevResZone && close < prevResZone.bottom) {
      prevResZone = null;
    }
    if (prevSupZone && close > prevSupZone.top) {
      prevSupZone = null;
    }

    // Output active zone levels
    if (resZone && resZone.active) {
      r1Arr[i] = resZone.top;
      r2Arr[i] = resZone.bottom;
    }
    if (supZone && supZone.active) {
      s1Arr[i] = supZone.top;
      s2Arr[i] = supZone.bottom;
    }

    // Output previous zone levels (flipped S/R)
    if (cfg.drawPreviousStructure) {
      if (prevResZone && prevResZone.active) {
        // Previous support turned resistance
        ps1Arr[i] = prevResZone.top;
        ps2Arr[i] = prevResZone.bottom;
      }
      if (prevSupZone && prevSupZone.active) {
        // Previous resistance turned support
        pr1Arr[i] = prevSupZone.top;
        pr2Arr[i] = prevSupZone.bottom;
      }
    }
  }

  const makePlot = (arr: number[]) =>
    arr.map((v, i) => ({ time: bars[i].time, value: isNaN(v) ? NaN : v }));

  // Fill colors
  const resFillColors = bars.map((_b, i) => {
    if (isNaN(r1Arr[i]) || isNaN(r2Arr[i])) return 'transparent';
    return bars[i].close > r2Arr[i] ? 'rgba(239,83,80,0.08)' : 'rgba(239,83,80,0.15)';
  });

  const supFillColors = bars.map((_b, i) => {
    if (isNaN(s1Arr[i]) || isNaN(s2Arr[i])) return 'transparent';
    return bars[i].close < s1Arr[i] ? 'rgba(38,166,154,0.08)' : 'rgba(38,166,154,0.15)';
  });

  const prevResFillColors = bars.map((_b, i) => {
    if (isNaN(ps1Arr[i]) || isNaN(ps2Arr[i])) return 'transparent';
    return 'rgba(239,83,80,0.06)';
  });

  const prevSupFillColors = bars.map((_b, i) => {
    if (isNaN(pr1Arr[i]) || isNaN(pr2Arr[i])) return 'transparent';
    return 'rgba(38,166,154,0.06)';
  });

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {
      r1: makePlot(r1Arr),
      r2: makePlot(r2Arr),
      s1: makePlot(s1Arr),
      s2: makePlot(s2Arr),
      pr1: makePlot(pr1Arr),
      pr2: makePlot(pr2Arr),
      ps1: makePlot(ps1Arr),
      ps2: makePlot(ps2Arr),
    },
    fills: [
      { plot1: 'r1', plot2: 'r2', options: { color: 'rgba(239,83,80,0.15)' }, colors: resFillColors },
      { plot1: 's1', plot2: 's2', options: { color: 'rgba(38,166,154,0.15)' }, colors: supFillColors },
      { plot1: 'ps1', plot2: 'ps2', options: { color: 'rgba(239,83,80,0.06)' }, colors: prevResFillColors },
      { plot1: 'pr1', plot2: 'pr2', options: { color: 'rgba(38,166,154,0.06)' }, colors: prevSupFillColors },
    ],
    alerts: alertStates(alertConditions, bars, [
      bars.map((_, i) => lv.resAlert[i] || lv.supAlert[i] || lv.resBo[i] || lv.supBo[i]),
      lv.resAlert, lv.supAlert, lv.resBo, lv.supBo,
    ]),
  };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: '[DSI] Alert!', message: 'DSI alert for {{ticker}}' },
  { id: 'alert1', title: '[DSI] Resistance Alert', message: 'Price has entered current potential resistance zone for {{ticker}}' },
  { id: 'alert2', title: '[DSI] Support Alert', message: 'Price has entered current potential support zone for {{ticker}}' },
  { id: 'alert3', title: '[DSI] Resistance Breakout', message: 'Price has broken past potential resistance zone for {{ticker}}' },
  { id: 'alert4', title: '[DSI] Support Breakout', message: 'Price has broken past potential support zone for {{ticker}}' },
];

export const DynamicStructureIndicator = { calculate, metadata, defaultInputs, inputConfig, plotConfig, alertConditions };
