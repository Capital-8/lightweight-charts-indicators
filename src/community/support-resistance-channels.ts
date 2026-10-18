/**
 * Support Resistance Channels
 *
 * Pivot-based S/R channel detection. Collects pivot highs/lows,
 * groups nearby pivots into channels based on max width.
 * Each channel is scored by pivot count + price touches.
 * The strongest channels of the last bar are drawn as boxes (Pine: extend.both).
 * Color: resistance (price below), support (price above), in channel.
 *
 * Alerts (alertcondition, `alerts` of the result): 'Resistance Broken' / 'Support Broken' on the bars whose close,
 * outside every channel, crosses above the top / below the bottom of a channel (the triangles of "Show Broken
 * Support/Resistance").
 *
 * Reference: "Support Resistance Channels" by LonesomeTheBlue
 */

import { ta, Series, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { MarkerData, BoxData } from '../types';
import { barTime } from '../bar-time';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

export interface SupportResistanceChannelsInputs {
  prd: number;
  ppsrc: 'High/Low' | 'Close/Open';
  channelW: number;
  minStrength: number;
  maxNumSR: number;
  loopback: number;
  resCol: string;
  supCol: string;
  inchCol: string;
  showPP: boolean;
  showSRBroken: boolean;
  showMA1: boolean;
  ma1Len: number;
  ma1Type: 'SMA' | 'EMA';
  showMA2: boolean;
  ma2Len: number;
  ma2Type: 'SMA' | 'EMA';
}

// Pine v6 colors: color.new(color.red, 75), color.new(color.lime, 75), color.new(color.gray, 75)
export const defaultInputs: SupportResistanceChannelsInputs = {
  prd: 10,
  ppsrc: 'High/Low',
  channelW: 5,
  minStrength: 1,
  maxNumSR: 6,
  loopback: 290,
  resCol: '#F2364540',
  supCol: '#00E67640',
  inchCol: '#787B8640',
  showPP: false,
  showSRBroken: false,
  showMA1: false,
  ma1Len: 50,
  ma1Type: 'SMA',
  showMA2: false,
  ma2Len: 200,
  ma2Type: 'SMA',
};

export const inputConfig: InputConfig[] = [
  { id: 'prd', type: 'int', title: 'Pivot Period', defval: 10, min: 4, max: 30 },
  { id: 'ppsrc', type: 'string', title: 'Source', defval: 'High/Low', options: ['High/Low', 'Close/Open'] },
  { id: 'channelW', type: 'int', title: 'Maximum Channel Width %', defval: 5, min: 1, max: 8 },
  { id: 'minStrength', type: 'int', title: 'Minimum Strength', defval: 1, min: 1 },
  { id: 'maxNumSR', type: 'int', title: 'Maximum Number of S/R', defval: 6, min: 1, max: 10 },
  { id: 'loopback', type: 'int', title: 'Loopback Period', defval: 290, min: 100, max: 400 },
  { id: 'resCol', type: 'color', title: 'Resistance Color', defval: '#F2364540' },
  { id: 'supCol', type: 'color', title: 'Support Color', defval: '#00E67640' },
  { id: 'inchCol', type: 'color', title: 'Color When Price in Channel', defval: '#787B8640' },
  { id: 'showPP', type: 'bool', title: 'Show Pivot Points', defval: false },
  { id: 'showSRBroken', type: 'bool', title: 'Show Broken Support/Resistance', defval: false },
  { id: 'showMA1', type: 'bool', title: 'MA 1', defval: false },
  { id: 'ma1Len', type: 'int', title: 'MA 1 Length', defval: 50 },
  { id: 'ma1Type', type: 'string', title: 'MA 1 Type', defval: 'SMA', options: ['SMA', 'EMA'] },
  { id: 'showMA2', type: 'bool', title: 'MA 2', defval: false },
  { id: 'ma2Len', type: 'int', title: 'MA 2 Length', defval: 200 },
  { id: 'ma2Type', type: 'string', title: 'MA 2 Type', defval: 'SMA', options: ['SMA', 'EMA'] },
];

// Pine: plot(ma1, color = not na(ma1) ? color.blue : na), plot(ma2, color = not na(ma2) ? color.red : na)
export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'MA 1', color: '#2962FF', lineWidth: 1 },
  { id: 'plot1', title: 'MA 2', color: '#F23645', lineWidth: 1 },
];

export const metadata = {
  title: 'Support Resistance Channels',
  shortTitle: 'SRchannel',
  overlay: true,
};

export function calculate(bars: Bar[], inputs: Partial<SupportResistanceChannelsInputs> = {}): Omit<IndicatorResult, 'markers'> & { boxes: BoxData[]; markers: MarkerData[] } & { alerts: AlertConditionState[] } {
  const {
    prd, ppsrc, channelW, minStrength, maxNumSR, loopback,
    resCol, supCol, inchCol, showPP, showSRBroken,
    showMA1, ma1Len, ma1Type, showMA2, ma2Len, ma2Type,
  } = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const maxnumsr = maxNumSR - 1;
  const lastSR = Math.min(9, maxnumsr);

  // Moving averages: na when disabled
  const closeSeries = new Series(bars, (b) => b.close);
  const maPlot = (show: boolean, len: number, type: 'SMA' | 'EMA') => {
    const arr = show ? (type === 'SMA' ? ta.sma(closeSeries, len) : ta.ema(closeSeries, len)).toArray() : [];
    return bars.map((b, i) => ({ time: b.time, value: show ? (arr[i] ?? NaN) : NaN }));
  };

  // Pivot source
  const src1Series = ppsrc === 'High/Low'
    ? new Series(bars, (b) => b.high)
    : new Series(bars, (_b) => Math.max(_b.close, _b.open));
  const src2Series = ppsrc === 'High/Low'
    ? new Series(bars, (b) => b.low)
    : new Series(bars, (_b) => Math.min(_b.close, _b.open));

  // Detect pivots
  const phArr = ta.pivothigh(src1Series, prd, prd).toArray();
  const plArr = ta.pivotlow(src2Series, prd, prd).toArray();

  // Highest/lowest over 300 bars for channel width calculation (na for the first 299 bars)
  const highSeries = new Series(bars, (b) => b.high);
  const lowSeries = new Series(bars, (b) => b.low);
  const highestArr = ta.highest(highSeries, 300).toArray();
  const lowestArr = ta.lowest(lowSeries, 300).toArray();

  // Collect pivot values and locations, pruning old ones beyond loopback
  const pivotVals: number[] = [];
  const pivotLocs: number[] = [];

  // S/R state: 10 channels * 2 (hi, lo)
  const srLevels: number[] = new Array(20).fill(0);

  const boxes: BoxData[] = [];
  const markers: MarkerData[] = [];
  const resistanceFlags: boolean[] = [];
  const supportFlags: boolean[] = [];

  for (let i = 0; i < n; i++) {
    const ph = phArr[i];
    const pl = plArr[i];
    // Pine bool(x): false for na and 0
    const isPh = ph != null && !isNaN(ph) && ph !== 0;
    const isPl = pl != null && !isNaN(pl) && pl !== 0;

    // Pine: plotshape(bool(ph) and showpp, text = 'H', style = shape.labeldown, color = na,
    //   textcolor = color.red, location = location.abovebar, offset = -prd) (and 'L' with color.lime)
    if (showPP && i - prd >= 0) {
      if (isPh) markers.push({ time: bars[i - prd].time, position: 'aboveBar', shape: 'labelDown', color: 'transparent', text: 'H', textColor: '#F23645' });
      if (isPl) markers.push({ time: bars[i - prd].time, position: 'belowBar', shape: 'labelUp', color: 'transparent', text: 'L', textColor: '#00E676' });
    }

    if (isPh || isPl) {
      pivotVals.unshift(isPh ? ph! : pl!);
      pivotLocs.unshift(i);

      // Remove old pivots beyond loopback
      while (pivotVals.length > 0) {
        const lastIdx = pivotVals.length - 1;
        if (i - pivotLocs[lastIdx] > loopback) {
          pivotVals.pop();
          pivotLocs.pop();
        } else {
          break;
        }
      }

      // Channel width; na (no pivot fits a channel) while highest/lowest(300) are na
      const prdhighest = highestArr[i] ?? NaN;
      const prdlowest = lowestArr[i] ?? NaN;
      const cwidth = (prdhighest - prdlowest) * channelW / 100;

      // Build S/R channels from current pivots
      // For each pivot, find a channel (hi, lo) that groups nearby pivots
      const supres: number[] = []; // [strength, hi, lo] per pivot

      for (let x = 0; x < pivotVals.length; x++) {
        let lo = pivotVals[x];
        let hi = lo;
        let numpp = 0;
        for (let y = 0; y < pivotVals.length; y++) {
          const cpp = pivotVals[y];
          const wdth = cpp <= hi ? hi - cpp : cpp - lo;
          if (wdth <= cwidth) {
            if (cpp <= hi) {
              lo = Math.min(lo, cpp);
            } else {
              hi = Math.max(hi, cpp);
            }
            numpp += 20;
          }
        }
        supres.push(numpp, hi, lo);
      }

      // Add bar-touch strength
      for (let x = 0; x < pivotVals.length; x++) {
        const h = supres[x * 3 + 1];
        const l = supres[x * 3 + 2];
        let s = 0;
        for (let y = 0; y <= Math.min(i, loopback); y++) {
          const barIdx = i - y;
          if ((bars[barIdx].high <= h && bars[barIdx].high >= l) ||
              (bars[barIdx].low <= h && bars[barIdx].low >= l)) {
            s++;
          }
        }
        supres[x * 3] += s;
      }

      // Reset SR levels
      srLevels.fill(0);
      const stren: number[] = new Array(10).fill(0);

      // Get strongest SRs
      let src = 0;
      for (let x = 0; x < pivotVals.length; x++) {
        let stv = -1;
        let stl = -1;
        for (let y = 0; y < pivotVals.length; y++) {
          if (supres[y * 3] > stv && supres[y * 3] >= minStrength * 20) {
            stv = supres[y * 3];
            stl = y;
          }
        }
        if (stl >= 0) {
          const hh = supres[stl * 3 + 1];
          const ll = supres[stl * 3 + 2];
          srLevels[src * 2] = hh;
          srLevels[src * 2 + 1] = ll;
          stren[src] = supres[stl * 3];

          // Zero out overlapping channels
          for (let y = 0; y < pivotVals.length; y++) {
            if ((supres[y * 3 + 1] <= hh && supres[y * 3 + 1] >= ll) ||
                (supres[y * 3 + 2] <= hh && supres[y * 3 + 2] >= ll)) {
              supres[y * 3] = -1;
            }
          }

          src++;
          if (src >= 10) break;
        }
      }

      // Sort by strength as written in Pine: stren[y] takes stren[x], but stren[x] does not take the old
      // stren[y] (no full swap of the strengths); the S/R levels are swapped (changeit).
      for (let x = 0; x <= 8; x++) {
        for (let y = x + 1; y <= 9; y++) {
          if (stren[y] > stren[x]) {
            stren[y] = stren[x];
            const tmpHi = srLevels[y * 2];
            srLevels[y * 2] = srLevels[x * 2];
            srLevels[x * 2] = tmpHi;
            const tmpLo = srLevels[y * 2 + 1];
            srLevels[y * 2 + 1] = srLevels[x * 2 + 1];
            srLevels[x * 2 + 1] = tmpLo;
          }
        }
      }
    }

    // Break signals (only when the close is not inside any channel); close[1] is na on the first bar
    const close = bars[i].close;
    const prevClose = i > 0 ? bars[i - 1].close : NaN;
    let notInChannel = true;
    for (let x = 0; x <= lastSR; x++) {
      if (close <= srLevels[x * 2] && close >= srLevels[x * 2 + 1]) {
        notInChannel = false;
      }
    }
    let resistanceBroken = false;
    let supportBroken = false;
    if (notInChannel) {
      for (let x = 0; x <= lastSR; x++) {
        if (prevClose <= srLevels[x * 2] && close > srLevels[x * 2]) {
          resistanceBroken = true;
        }
        if (prevClose >= srLevels[x * 2 + 1] && close < srLevels[x * 2 + 1]) {
          supportBroken = true;
        }
      }
    }
    resistanceFlags.push(resistanceBroken);
    supportFlags.push(supportBroken);
    // Pine: plotshape(showsrbroken and resistancebroken, style = shape.triangleup, location = location.belowbar,
    //   color = color.new(color.lime, 0), size = size.tiny) (triangledown, abovebar, color.red for supportbroken)
    if (showSRBroken && resistanceBroken) {
      markers.push({ time: bars[i].time, position: 'belowBar', shape: 'triangleUp', color: '#00E676', size: 'tiny' });
    }
    if (showSRBroken && supportBroken) {
      markers.push({ time: bars[i].time, position: 'aboveBar', shape: 'triangleDown', color: '#F23645', size: 'tiny' });
    }
  }

  // Boxes of the last bar. Pine deletes and redraws them on every bar:
  // box.new(left = bar_index, right = bar_index + 1, extend = extend.both), so only the boxes of the last bar are
  // visible; the right edge is on the bar after the last bar and extend.both draws them across the whole chart.
  if (n > 0) {
    const lastClose = bars[n - 1].close;
    for (let x = 0; x <= lastSR; x++) {
      const hi = srLevels[x * 2];
      const lo = srLevels[x * 2 + 1];
      if (hi === 0) continue; // Pine get_color: na colour (no box) when the level is 0
      const col = hi > lastClose && lo > lastClose ? resCol : hi < lastClose && lo < lastClose ? supCol : inchCol;
      boxes.push({
        time1: bars[n - 1].time,
        price1: hi,
        time2: barTime(bars, n),
        price2: lo,
        bgColor: col,
        borderColor: col,
        borderWidth: 1,
        extend: 'both',
      });
    }
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: { 'plot0': maPlot(showMA1, ma1Len, ma1Type), 'plot1': maPlot(showMA2, ma2Len, ma2Type) },
    boxes,
    markers,
    // alertcondition(resistancebroken, 'Resistance Broken') / alertcondition(supportbroken, 'Support Broken')
    alerts: alertStates(alertConditions, bars, [resistanceFlags, supportFlags]),
  };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'Resistance Broken', message: 'Resistance Broken' },
  { id: 'alert1', title: 'Support Broken', message: 'Support Broken' },
];

export const SupportResistanceChannels = { calculate, metadata, defaultInputs, inputConfig, plotConfig, alertConditions };
