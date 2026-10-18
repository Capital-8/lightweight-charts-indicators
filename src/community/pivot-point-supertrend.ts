/**
 * Pivot Point SuperTrend
 *
 * SuperTrend around a centre line built from pivot points: each new pivot high or low moves the
 * centre by center = (center * 2 + pivot) / 3. The bands are center -/+ Factor * ATR, trailed like
 * a SuperTrend. Buy / Sell on a trend change, optional pivot labels, centre line and
 * support / resistance levels.
 * Alerts (alertcondition, `alerts` of the result): 'Buy Signal' / 'Sell Signal' on a trend change up / down, and
 * 'Trend Changed' on either.
 *
 * Reference: "Pivot Point SuperTrend" by LonesomeTheBlue
 */

import { ta, Series, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { MarkerData } from '../types';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

export interface PivotPointSupertrendInputs {
  pivotLen: number;
  atrFactor: number;
  atrLen: number;
  showPivot: boolean;
  showLabel: boolean;
  showCl: boolean;
  showSr: boolean;
}

export const defaultInputs: PivotPointSupertrendInputs = {
  pivotLen: 2,
  atrFactor: 3,
  atrLen: 10,
  showPivot: false,
  showLabel: true,
  showCl: false,
  showSr: false,
};

export const inputConfig: InputConfig[] = [
  { id: 'pivotLen', type: 'int', title: 'Pivot Point Period', defval: 2, min: 1, max: 50 },
  { id: 'atrFactor', type: 'float', title: 'ATR Factor', defval: 3, min: 1, step: 0.1 },
  { id: 'atrLen', type: 'int', title: 'ATR Period', defval: 10, min: 1 },
  { id: 'showPivot', type: 'bool', title: 'Show Pivot Points', defval: false },
  { id: 'showLabel', type: 'bool', title: 'Show Buy/Sell Labels', defval: true },
  { id: 'showCl', type: 'bool', title: 'Show PP Center Line', defval: false },
  { id: 'showSr', type: 'bool', title: 'Show Support/Resistance', defval: false },
];

// Pine v4 colour constants
const LIME = '#00E676';
const RED = '#FF5252';
const BLUE = '#2196F3';

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'PP SuperTrend', color: LIME, lineWidth: 2 },
  { id: 'plot1', title: 'Center Line', color: BLUE, lineWidth: 1 },
  { id: 'plot2', title: 'Support', color: LIME, lineWidth: 1, style: 'circles' },
  { id: 'plot3', title: 'Resistance', color: RED, lineWidth: 1, style: 'circles' },
];

export const metadata = {
  title: 'Pivot Point SuperTrend',
  shortTitle: 'PPST',
  overlay: true,
};

export function calculate(bars: Bar[], inputs: Partial<PivotPointSupertrendInputs> = {}): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[] } & { alerts: AlertConditionState[] } {
  const { pivotLen: prd, atrFactor: Factor, atrLen: Pd, showPivot, showLabel, showCl, showSr } = { ...defaultInputs, ...inputs };
  const n = bars.length;

  // Pine: float ph = pivothigh(prd, prd), float pl = pivotlow(prd, prd)
  const phArr = ta.pivothigh(new Series(bars, (b) => b.high), prd, prd).toArray();
  const plArr = ta.pivotlow(new Series(bars, (b) => b.low), prd, prd).toArray();
  const atrArr = ta.atr(bars, Pd).toArray();

  // Pine `if ph` / `ph ? ...`: na and 0 are false
  const isPivot = (v: number | null | undefined): v is number => v != null && !isNaN(v) && v !== 0;

  const centerArr: number[] = new Array(n).fill(NaN);
  const trendArr: number[] = new Array(n).fill(0);
  const tslArr: number[] = new Array(n).fill(NaN);
  const supportArr: number[] = new Array(n).fill(NaN);
  const resistanceArr: number[] = new Array(n).fill(NaN);

  let center = NaN;       // var float center = na
  let prevTUp = NaN;      // TUp[1]
  let prevTDown = NaN;    // TDown[1]
  let support = NaN;
  let resistance = NaN;

  for (let i = 0; i < n; i++) {
    const ph = phArr[i];
    const pl = plArr[i];

    // Pine: lastpp = ph ? ph : pl ? pl : na; center := na(center) ? lastpp : (center * 2 + lastpp) / 3
    const lastpp = isPivot(ph) ? ph : isPivot(pl) ? pl : NaN;
    if (isPivot(lastpp)) {
      center = isNaN(center) ? lastpp : (center * 2 + lastpp) / 3;
    }

    const atr = atrArr[i] ?? NaN;
    const Up = center - Factor * atr;
    const Dn = center + Factor * atr;

    // Pine: TUp := close[1] > TUp[1] ? max(Up, TUp[1]) : Up (comparisons with na are false, max with na is na)
    const close1 = i > 0 ? bars[i - 1].close : NaN;
    const TUp = close1 > prevTUp ? Math.max(Up, prevTUp) : Up;
    const TDown = close1 < prevTDown ? Math.min(Dn, prevTDown) : Dn;

    // Pine: Trend := close > TDown[1] ? 1 : close < TUp[1] ? -1 : nz(Trend[1], 1)
    const close = bars[i].close;
    const trend = close > prevTDown ? 1 : close < prevTUp ? -1 : i > 0 ? trendArr[i - 1] : 1;

    centerArr[i] = center;
    trendArr[i] = trend;
    tslArr[i] = trend === 1 ? TUp : TDown;
    prevTUp = TUp;
    prevTDown = TDown;

    // Pine: support := pl ? pl : support[1]; resistance := ph ? ph : resistance[1]
    if (isPivot(pl)) support = pl;
    if (isPivot(ph)) resistance = ph;
    supportArr[i] = support;
    resistanceArr[i] = resistance;
  }

  // Pine: plot(Trailingsl, color = linecolor, linewidth = 2, title = "PP SuperTrend")
  // linecolor = Trend == 1 and nz(Trend[1]) == 1 ? lime : Trend == -1 and nz(Trend[1]) == -1 ? red : na
  // A value with an na colour is kept as a transparent point.
  const plot0 = tslArr.map((v, i) => {
    const t1 = i > 0 ? trendArr[i - 1] : 0;
    const t = trendArr[i];
    const color = t === 1 && t1 === 1 ? LIME : t === -1 && t1 === -1 ? RED : 'transparent';
    return { time: bars[i].time, value: v, color };
  });

  // Pine: plot(showcl ? center : na, color = showcl ? center < hl2 ? blue : red : na)
  const plot1 = centerArr.map((v, i) => {
    if (!showCl) return { time: bars[i].time, value: NaN };
    const hl2 = (bars[i].high + bars[i].low) / 2;
    return { time: bars[i].time, value: v, color: v < hl2 ? BLUE : RED };
  });

  // Pine: plot(showsr and support ? support : na, ..., style = plot.style_circles, offset = -prd)
  // The value computed on bar i is shown on bar i - prd.
  const shifted = (arr: number[]) => bars.map((b, j) => {
    const v = j + prd < n ? arr[j + prd] : NaN;
    return { time: b.time, value: showSr && isPivot(v) ? v : NaN };
  });
  const plot2 = shifted(supportArr);
  const plot3 = shifted(resistanceArr);

  const markers: MarkerData[] = [];
  for (let i = 0; i < n; i++) {
    // Pine: plotshape(ph and showpivot, text="H", style=shape.labeldown, color=na, textcolor=color.red,
    //   location=location.abovebar, offset = -prd); same for pl with "L", textcolor=color.lime, location.belowbar
    if (showPivot && i >= prd) {
      if (isPivot(phArr[i])) {
        markers.push({ time: bars[i - prd].time, position: 'aboveBar', shape: 'labelDown', color: 'transparent', text: 'H', textColor: RED });
      }
      if (isPivot(plArr[i])) {
        markers.push({ time: bars[i - prd].time, position: 'belowBar', shape: 'labelDown', color: 'transparent', text: 'L', textColor: LIME });
      }
    }
    // Pine: bsignal = Trend == 1 and Trend[1] == -1; ssignal = Trend == -1 and Trend[1] == 1
    // plotshape(bsignal and showlabel ? Trailingsl : na, "Buy", location.absolute, shape.labelup, size.tiny, lime,
    //   textcolor = color.black)
    // plotshape(ssignal and showlabel ? Trailingsl : na, "Sell", location.absolute, shape.labeldown, size.tiny, red,
    //   textcolor = color.white)
    // (Pine hides the shape when Trailingsl is na). At the stop price: labelup below it, labeldown above it.
    if (showLabel && i > 0 && !isNaN(tslArr[i])) {
      if (trendArr[i] === 1 && trendArr[i - 1] === -1) {
        markers.push({
          time: bars[i].time, position: 'atPriceBottom', price: tslArr[i], shape: 'labelUp',
          color: LIME, text: 'Buy', textColor: '#000000', size: 'tiny',
        });
      }
      if (trendArr[i] === -1 && trendArr[i - 1] === 1) {
        markers.push({
          time: bars[i].time, position: 'atPriceTop', price: tslArr[i], shape: 'labelDown',
          color: RED, text: 'Sell', textColor: '#FFFFFF', size: 'tiny',
        });
      }
    }
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: { 'plot0': plot0, 'plot1': plot1, 'plot2': plot2, 'plot3': plot3 },
    markers,
    // alertcondition(Trend == 1 and Trend[1] == -1) / (Trend == -1 and Trend[1] == 1) / (change(Trend)); Trend[1] is
    // na on the first bar
    alerts: alertStates(alertConditions, bars, [
      trendArr.map((t, i) => i > 0 && t === 1 && trendArr[i - 1] === -1),
      trendArr.map((t, i) => i > 0 && t === -1 && trendArr[i - 1] === 1),
      trendArr.map((t, i) => i > 0 && t !== trendArr[i - 1]),
    ]),
  };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'Buy Signal', message: 'Buy Signal' },
  { id: 'alert1', title: 'Sell Signal', message: 'Sell Signal' },
  { id: 'alert2', title: 'Trend Changed', message: 'Trend Changed' },
];

export const PivotPointSupertrend = { calculate, metadata, defaultInputs, inputConfig, plotConfig, alertConditions };
