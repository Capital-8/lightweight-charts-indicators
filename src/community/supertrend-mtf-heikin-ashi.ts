/**
 * Supertrend MTF Heikin Ashi
 *
 * Two Supertrend lines computed on Heikin Ashi bars: one on the chart timeframe (bands at the Heikin Ashi hl2 -+
 * ATR Factor * the ATR of the Heikin Ashi bars, trend flips when the Heikin Ashi close crosses the band of the bar
 * before) and one on a higher timeframe. The higher timeframe values are those of the previous completed Heikin Ashi
 * bar of that timeframe (`high[1]` with lookahead, no repaint); its trend logic runs on the chart bars. Circles mark
 * the trend changes of the higher timeframe line. The line colour is na on the bar of a trend change.
 *
 * Higher timeframe "Auto": 1 -> 5, 3 / 5 -> 15, 15 -> 60, 30 / 45 -> 120, 60 -> 240, 120 / 180 -> 240, 240 -> D,
 * D -> W, W -> 5W, else D. The Heikin Ashi bars of the higher timeframe are built from the chart bars (periods of
 * the exchange calendar of the chart context, else the UTC rule of anchor-period.ts). A timeframe below the chart
 * timeframe needs lower-timeframe data: the port throws an Error.
 *
 * Alerts (alertcondition, `alerts` of the result): 'Supertrend Trend Up' / 'Supertrend  Trend Down' on the trend
 * changes of the chart timeframe line, 'Supertrend HTF Trend Up' / 'Supertrend HTF Trend Down' on those of the higher
 * timeframe line.
 *
 * Reference: "Supertrend MTF Heikin Ashi" by LonesomeTheBlue
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © LonesomeTheBlue
 */

import { taCore, timeframe, heikinAshi, mapToChart, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import { chartTimeframe, higherTimeframeBars } from '../anchor-period';
import type { ChartContext } from '../chart-context';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

export interface SupertrendMtfHeikinAshiInputs {
  /** HTF Method: the higher timeframe from the chart timeframe ("Auto") or the timeframe input */
  mode: 'Auto' | 'User Defined';
  /** Higher timeframe when the method is "User Defined" */
  htfUser: string;
  /** ATR factor */
  mult: number;
  /** ATR period */
  period: number;
}

export const defaultInputs: SupertrendMtfHeikinAshiInputs = {
  mode: 'Auto',
  htfUser: '5',
  mult: 2.0,
  period: 7,
};

export const inputConfig: InputConfig[] = [
  { id: 'mode', type: 'string', title: 'HTF Method', defval: 'Auto', options: ['Auto', 'User Defined'] },
  { id: 'htfUser', type: 'timeframe', title: 'Time Frame (if HTF Method=User Defined)', defval: '5' },
  { id: 'mult', type: 'float', title: 'ATR Factor', defval: 2.0, min: 0.5, max: 100, step: 0.1 },
  { id: 'period', type: 'int', title: 'ATR Period', defval: 7, min: 1, max: 100 },
];

const LIME = '#00E676';
const RED = '#FF5252';
const BLUE = '#2196F3';

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'SuperTrend', color: LIME, lineWidth: 2 },
  { id: 'plot1', title: 'Supertrend HTF', color: BLUE, lineWidth: 3 },
  { id: 'plot2', title: 'Supertrend HTF Trend Up', color: BLUE, lineWidth: 4, style: 'circles' },
  { id: 'plot3', title: 'Supertrend HTF Trend Down', color: RED, lineWidth: 4, style: 'circles' },
];

export const metadata = {
  title: 'Supertrend MTF Heikin Ashi',
  shortTitle: 'Supertrend MTF Heikin Ashi',
  overlay: true,
};

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;

/** v4 `timeframe.period` of a chart timeframe ("60", "D", "W", ...) */
function v4Period(tf: string): string {
  const info = timeframe.info(tf);
  if (info.isdaily || info.isweekly || info.ismonthly) {
    const unit = info.isdaily ? 'D' : info.isweekly ? 'W' : 'M';
    return info.multiplier === 1 ? unit : `${info.multiplier}${unit}`;
  }
  return info.period;
}

/** The higher timeframe of the "Auto" method */
function autoTimeframe(period: string): string {
  const map: Record<string, string> = {
    '1': '5', '3': '15', '5': '15', '15': '60', '30': '120', '45': '120', '60': '240', '120': '240', '180': '240',
    '240': 'D', D: 'W', W: '5W',
  };
  return map[period] ?? 'D';
}

/** Supertrend state of one line: the bands follow the close of the bar before, the trend the bands of the bar before */
function supertrend(
  n: number, hl2: (i: number) => number, atr: (i: number) => number, closeOf: (i: number) => number, mult: number,
): { trend: number[]; trailing: number[] } {
  const trend: number[] = new Array(n);
  const trailing: number[] = new Array(n);
  let tUp = NaN;
  let tDown = NaN;
  let prevTrend = NaN;
  for (let i = 0; i < n; i++) {
    const up = hl2(i) - mult * atr(i);
    const dn = hl2(i) + mult * atr(i);
    const c = closeOf(i);
    const c1 = i > 0 ? closeOf(i - 1) : NaN;
    const prevUp = tUp;
    const prevDown = tDown;
    // TUp := c[1] > TUp[1] ? max(Up, TUp[1]) : Up; TDown := c[1] < TDown[1] ? min(Dn, TDown[1]) : Dn
    tUp = gt(c1, prevUp) ? Math.max(up, prevUp) : up;
    tDown = lt(c1, prevDown) ? Math.min(dn, prevDown) : dn;
    // Trend := c > TDown[1] ? 1 : c < TUp[1] ? -1 : nz(Trend[1], 1)
    const t = gt(c, prevDown) ? 1 : lt(c, prevUp) ? -1 : Number.isNaN(prevTrend) ? 1 : prevTrend;
    trend[i] = t;
    trailing[i] = t === 1 ? tUp : tDown;
    prevTrend = t;
  }
  return { trend, trailing };
}

export function calculate(
  bars: Bar[],
  inputs: Partial<SupertrendMtfHeikinAshiInputs> = {},
  chart?: ChartContext,
): IndicatorResult & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const v = (x: number) => (Number.isFinite(x) ? x : NaN);

  // Chart timeframe: security(heikinashi(syminfo.tickerid), timeframe.period, high / low / close / atr(Period))
  const ha = heikinAshi(bars);
  const haHigh = ha.map((b) => b.high);
  const haLow = ha.map((b) => b.low);
  const haClose = ha.map((b) => b.close);
  const atr = taCore.atr(cfg.period, haHigh, haLow, haClose);
  const st = supertrend(n, (i) => (haHigh[i] + haLow[i]) / 2, (i) => atr[i], (i) => haClose[i], cfg.mult);

  // Higher timeframe: security(heikinashi(syminfo.tickerid), HTF, x[1], lookahead = barmerge.lookahead_on): the
  // value of the Heikin Ashi bar of the timeframe before the one of the chart bar
  const chartTf = chartTimeframe(bars, chart);
  const htf = cfg.mode === 'Auto' ? autoTimeframe(chartTf === '' ? '' : v4Period(chartTf)) : cfg.htfUser;
  let hHigh: number[];
  let hLow: number[];
  let hClose: number[];
  let hAtr: number[];
  if (htf.trim() === '' || chartTf === '' || timeframe.in_seconds(htf) === timeframe.in_seconds(chartTf)) {
    const prev = (a: number[]) => a.map((_x, i) => (i > 0 ? a[i - 1] : NaN));
    hHigh = prev(haHigh);
    hLow = prev(haLow);
    hClose = prev(haClose);
    hAtr = prev(atr);
  } else {
    if (timeframe.in_seconds(htf) < timeframe.in_seconds(chartTf)) {
      throw new Error(`Supertrend MTF Heikin Ashi: the timeframe "${htf}" is lower than the chart timeframe "${chartTf}": the chart bars do not have that data`);
    }
    const sec = higherTimeframeBars(bars, htf, chart);
    const hha = heikinAshi(sec.htf);
    const hh = hha.map((b) => b.high);
    const hl = hha.map((b) => b.low);
    const hc = hha.map((b) => b.close);
    const ha2 = taCore.atr(cfg.period, hh, hl, hc);
    const toChart = (a: number[]) => mapToChart(a.map((_x, g) => (g > 0 ? a[g - 1] : NaN)), sec.group, sec.latest, true, false);
    hHigh = toChart(hh);
    hLow = toChart(hl);
    hClose = toChart(hc);
    hAtr = toChart(ha2);
  }
  // Uphtf = abs(highhtf + lowhtf) / 2 - (Mult * HTfatr)
  const stH = supertrend(n, (i) => Math.abs(hHigh[i] + hLow[i]) / 2, (i) => hAtr[i], (i) => hClose[i], cfg.mult);

  const plot0 = [];
  const plot1 = [];
  const plot2 = [];
  const plot3 = [];
  const flags: boolean[][] = [[], [], [], []];
  for (let i = 0; i < n; i++) {
    const t = bars[i].time;
    const tr = st.trend[i];
    const tr1 = i > 0 ? st.trend[i - 1] : 0; // nz(Trend[1])
    // linecolor = Trend == 1 and nz(Trend[1]) == 1 ? color.lime : Trend == -1 and nz(Trend[1]) == -1 ? color.red : na
    const col = tr === 1 && tr1 === 1 ? LIME : tr === -1 && tr1 === -1 ? RED : 'transparent';
    plot0.push({ time: t, value: v(st.trailing[i]), color: col });
    const th = stH.trend[i];
    const th1 = i > 0 ? stH.trend[i - 1] : NaN;
    const colH = th === 1 && th1 === 1 ? BLUE : th === -1 && th1 === -1 ? RED : 'transparent';
    plot1.push({ time: t, value: v(stH.trailing[i]), color: colH });
    // TrendHtf == 1 and TrendHtf[1] == -1 ? TrailingslHtf : na (and the reverse)
    plot2.push({ time: t, value: th === 1 && th1 === -1 ? v(stH.trailing[i]) : NaN });
    plot3.push({ time: t, value: th === -1 && th1 === 1 ? v(stH.trailing[i]) : NaN });
    // alertcondition(Trend == 1 and Trend[1] == -1) / (Trend == -1 and Trend[1] == 1), the same with TrendHtf
    // (Trend[1] is na on the first bar: false)
    const trp = i > 0 ? st.trend[i - 1] : NaN;
    flags[0].push(tr === 1 && trp === -1);
    flags[1].push(tr === -1 && trp === 1);
    flags[2].push(th === 1 && th1 === -1);
    flags[3].push(th === -1 && th1 === 1);
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: { plot0, plot1, plot2, plot3 },
    alerts: alertStates(alertConditions, bars, flags),
  };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'Supertrend Trend Up', message: 'Supertrend Trend Up' },
  { id: 'alert1', title: 'Supertrend  Trend Down', message: 'Supertrend Trend Down' },
  { id: 'alert2', title: 'Supertrend HTF Trend Up', message: 'Supertrend HTF Trend Upl' },
  { id: 'alert3', title: 'Supertrend HTF Trend Down', message: 'Supertrend HTF Trend Down' },
];

export const SupertrendMtfHeikinAshi = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  alertConditions,
};
