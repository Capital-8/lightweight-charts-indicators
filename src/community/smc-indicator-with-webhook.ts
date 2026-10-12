/**
 * Simple SMC Indicator (SMC Indicator With Webhook)
 *
 * Fractal highs and lows: a bar whose high is above the highs of the `Fractal Periods` bars after it and above the
 * bars before it (up to 4 equal highs just before it are allowed), marked with a triangle on the fractal bar. The
 * latest fractal high / low is a liquidity level: the first bar that trades through it draws a "Swept" line and label,
 * and the extreme bar between the fractal and the sweep (lowest low after a high sweep, highest high after a low
 * sweep) becomes the target of a market structure shift: the first close through that level draws an "MSS" line and
 * label. Fair value gaps (three-bar gaps after a bar in the direction of the gap) are drawn as boxes. All of this runs
 * on confirmed bars only (an open last bar draws nothing new).
 *
 * The background shows four sessions, read in the America/New_York time zone. "Only Draw In Session" limits the
 * drawings and the fractal marks to bars inside a drawn session. The webhook alerts (alert() calls with a JSON message)
 * have no output in the port.
 *
 * Reference: "Simple SMC Indicator" by sunwoo101
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © sunwoo101
 */

import {
  timeframe, time as pineTime, line, label, box, resetDrawings, setDrawingBar,
  type IndicatorResult, type InputConfig, type PlotConfig, type Bar,
} from 'oakscriptjs';
import type { BgColorData, BoxData, LabelData, LineDrawingData, MarkerData } from '../types';
import { barInterval, barTime } from '../bar-time';
import { chartTimeframe } from '../anchor-period';
import { lastBarConfirmedOf, type ChartContext } from '../chart-context';

export interface SmcIndicatorWithWebhookInputs {
  onlyDrawInSession: boolean;
  drawFractals: boolean;
  fractalPeriod: number;
  fractalHighColor: string;
  fractalLowColor: string;
  drawLQSweeps: boolean;
  sweepColor: string;
  drawMSS: boolean;
  bullishMSSColor: string;
  bearishMSSColor: string;
  drawFVG: boolean;
  bullishFVGColor: string;
  bearishFVGColor: string;
  /** Name in the alert messages (alerts have no output in the port) */
  alertName: string;
  sweepAlerts: boolean;
  MSSAlerts: boolean;
  FVGAlerts: boolean;
  drawSession1: boolean;
  session1: string;
  session1Color: string;
  drawSession2: boolean;
  session2: string;
  session2Color: string;
  drawSession3: boolean;
  session3: string;
  session3Color: string;
  drawSession4: boolean;
  session4: string;
  session4Color: string;
}

export const defaultInputs: SmcIndicatorWithWebhookInputs = {
  onlyDrawInSession: false,
  drawFractals: true,
  fractalPeriod: 2,
  fractalHighColor: 'rgba(255, 255, 255, 0.5)',
  fractalLowColor: 'rgba(255, 255, 255, 0.5)',
  drawLQSweeps: true,
  sweepColor: '#FFFFFF',
  drawMSS: true,
  bullishMSSColor: '#2962FF',
  bearishMSSColor: '#FF5252',
  drawFVG: true,
  bullishFVGColor: 'rgba(255, 255, 255, 0.5)',
  bearishFVGColor: 'rgba(255, 255, 255, 0.5)',
  alertName: '1m XAUUSD',
  sweepAlerts: true,
  MSSAlerts: true,
  FVGAlerts: true,
  drawSession1: true,
  session1: '2100-0100',
  session1Color: 'rgba(156, 39, 176, 0.2)',
  drawSession2: true,
  session2: '0300-0600',
  session2Color: 'rgba(255, 235, 59, 0.2)',
  drawSession3: true,
  session3: '0800-1000',
  session3Color: 'rgba(41, 98, 255, 0.2)',
  drawSession4: true,
  session4: '1100-1300',
  session4Color: 'rgba(255, 152, 0, 0.2)',
};

const PA = 'Price Action';
export const inputConfig: InputConfig[] = [
  { id: 'onlyDrawInSession', type: 'bool', title: 'Only Draw In Session', defval: false, group: PA },
  { id: 'drawFractals', type: 'bool', title: 'Draw Fractal Highs/Lows', defval: true, group: PA },
  { id: 'fractalPeriod', type: 'int', title: 'Fractal Periods', defval: 2, min: 1 },
  { id: 'fractalHighColor', type: 'color', title: 'Fractal High Color', defval: 'rgba(255, 255, 255, 0.5)', group: PA },
  { id: 'fractalLowColor', type: 'color', title: 'Fractal Low Color', defval: 'rgba(255, 255, 255, 0.5)', group: PA },
  { id: 'drawLQSweeps', type: 'bool', title: 'Draw Liquidity Sweeps', defval: true, group: PA },
  { id: 'sweepColor', type: 'color', title: 'Sweep Color', defval: '#FFFFFF', group: PA },
  { id: 'drawMSS', type: 'bool', title: 'Draw MSS', defval: true, group: PA },
  { id: 'bullishMSSColor', type: 'color', title: 'Bullish MSS Color', defval: '#2962FF', group: PA },
  { id: 'bearishMSSColor', type: 'color', title: 'Bearish MSS Color', defval: '#FF5252', group: PA },
  { id: 'drawFVG', type: 'bool', title: 'Draw FVG', defval: true, group: PA },
  { id: 'bullishFVGColor', type: 'color', title: 'Bullish FVG Color', defval: 'rgba(255, 255, 255, 0.5)', group: PA },
  { id: 'bearishFVGColor', type: 'color', title: 'Bearish FVG Color', defval: 'rgba(255, 255, 255, 0.5)', group: PA },
  { id: 'alertName', type: 'string', title: 'Alert Name', defval: '1m XAUUSD' },
  { id: 'sweepAlerts', type: 'bool', title: 'Sweep Alerts', defval: true, group: 'Alerts' },
  { id: 'MSSAlerts', type: 'bool', title: 'MSS Alerts', defval: true, group: 'Alerts' },
  { id: 'FVGAlerts', type: 'bool', title: 'FVG Alerts', defval: true, group: 'Alerts' },
  { id: 'drawSession1', type: 'bool', title: 'Draw Session 1', defval: true, group: 'Session' },
  { id: 'session1', type: 'session', title: 'Session 1', defval: '2100-0100', group: 'Session' },
  { id: 'session1Color', type: 'color', title: 'Session 1 Color', defval: 'rgba(156, 39, 176, 0.2)', group: 'Session' },
  { id: 'drawSession2', type: 'bool', title: 'Draw Session 2', defval: true, group: 'Session' },
  { id: 'session2', type: 'session', title: 'Session 2', defval: '0300-0600', group: 'Session' },
  { id: 'session2Color', type: 'color', title: 'Session 2 Color', defval: 'rgba(255, 235, 59, 0.2)', group: 'Session' },
  { id: 'drawSession3', type: 'bool', title: 'Draw Session 3', defval: true, group: 'Session' },
  { id: 'session3', type: 'session', title: 'Session 3', defval: '0800-1000', group: 'Session' },
  { id: 'session3Color', type: 'color', title: 'Session 3 Color', defval: 'rgba(41, 98, 255, 0.2)', group: 'Session' },
  { id: 'drawSession4', type: 'bool', title: 'Draw Session 4', defval: true, group: 'Session' },
  { id: 'session4', type: 'session', title: 'Session 4', defval: '1100-1300', group: 'Session' },
  { id: 'session4Color', type: 'color', title: 'Session 4 Color', defval: 'rgba(255, 152, 0, 0.2)', group: 'Session' },
];

export const plotConfig: PlotConfig[] = [];

export const metadata = {
  title: 'Simple SMC Indicator',
  shortTitle: 'Simple SMC Indicator',
  overlay: true,
};

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const ge = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(b - a > EPS);
const le = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(a - b > EPS);

/** Pine `if x` with an int x: na and 0 are false */
const truthy = (x: number) => !isNaN(x) && x !== 0;

export function calculate(
  bars: Bar[],
  inputs: Partial<SmcIndicatorWithWebhookInputs> = {},
  chart?: ChartContext,
): Omit<IndicatorResult, 'markers' | 'bgColors' | 'lines' | 'labels' | 'boxes'> & {
  markers: MarkerData[]; bgColors: BgColorData[]; lines: LineDrawingData[]; labels: LabelData[]; boxes: BoxData[];
} {
  const cfg = { ...defaultInputs, ...inputs };
  const n = Math.trunc(cfg.fractalPeriod);
  const count = bars.length;
  const H = (i: number) => (i >= 0 ? bars[i].high : NaN);
  const L = (i: number) => (i >= 0 ? bars[i].low : NaN);

  // time(timeframe.period, sess, "America/New_York"): the session test, with the bar duration for the clock changes
  const tf = chartTimeframe(bars, chart);
  const barMs = tf === '' ? undefined : timeframe.in_seconds(tf) * 1000;
  const isSess = (t: number, sess: string) => pineTime.inSession(t * 1000, sess, 'America/New_York', barMs);
  const lastConfirmed = lastBarConfirmedOf(chart);

  resetDrawings({ line: 50, label: 50, box: 50 });
  const bgColors: BgColorData[] = [];
  const markers: MarkerData[] = [];
  const interval = barInterval(bars);
  const T = (index: number) => barTime(bars, index, interval);

  let fractalHighBarIndex = NaN;
  let fractalLowBarIndex = NaN;
  let bullishMSSTargetBarIndex = NaN;
  let bearishMSSTargetBarIndex = NaN;

  for (let i = 0; i < count; i++) {
    setDrawingBar(i, i === count - 1);
    const b = bars[i];
    const s1 = isSess(b.time, cfg.session1);
    const s2 = isSess(b.time, cfg.session2);
    const s3 = isSess(b.time, cfg.session3);
    const s4 = isSess(b.time, cfg.session4);
    const backgroundColor = s1 ? cfg.session1Color : s2 ? cfg.session2Color : s3 ? cfg.session3Color : cfg.session4Color;
    const isSession = s1 || s2 || s3 || s4;
    const drawSession = (s1 && cfg.drawSession1) || (s2 && cfg.drawSession2) || (s3 && cfg.drawSession3)
      || (s4 && cfg.drawSession4);
    if (isSession && drawSession) bgColors.push({ time: b.time, color: backgroundColor });
    const sessionDraw = !cfg.onlyDrawInSession || drawSession;

    let highFound = false;
    let lowFound = false;
    const confirmed = i < count - 1 || lastConfirmed;
    if (confirmed) {
      // Fractal high (bar i - n)
      const hn = H(i - n);
      let downF = true;
      const up = [true, true, true, true, true];
      for (let k = 1; k <= n; k++) {
        downF = downF && lt(H(i - (n - k)), hn);
        up[0] = up[0] && lt(H(i - (n + k)), hn);
        up[1] = up[1] && (le(H(i - (n + 1)), hn) && lt(H(i - (n + k + 1)), hn));
        up[2] = up[2] && (le(H(i - (n + 1)), hn) && le(H(i - (n + 2)), hn) && lt(H(i - (n + k + 2)), hn));
        up[3] = up[3] && (le(H(i - (n + 1)), hn) && le(H(i - (n + 2)), hn) && le(H(i - (n + 3)), hn)
          && lt(H(i - (n + k + 3)), hn));
        up[4] = up[4] && (le(H(i - (n + 1)), hn) && le(H(i - (n + 2)), hn) && le(H(i - (n + 3)), hn)
          && le(H(i - (n + 4)), hn) && lt(H(i - (n + k + 4)), hn));
      }
      highFound = downF && (up[0] || up[1] || up[2] || up[3] || up[4]);
      if (highFound) fractalHighBarIndex = i - n;

      // Fractal low (bar i - n)
      const ln = L(i - n);
      let downL = true;
      const dn = [true, true, true, true, true];
      for (let k = 1; k <= n; k++) {
        downL = downL && gt(L(i - (n - k)), ln);
        dn[0] = dn[0] && gt(L(i - (n + k)), ln);
        dn[1] = dn[1] && (ge(L(i - (n + 1)), ln) && gt(L(i - (n + k + 1)), ln));
        dn[2] = dn[2] && (ge(L(i - (n + 1)), ln) && ge(L(i - (n + 2)), ln) && gt(L(i - (n + k + 2)), ln));
        dn[3] = dn[3] && (ge(L(i - (n + 1)), ln) && ge(L(i - (n + 2)), ln) && ge(L(i - (n + 3)), ln)
          && gt(L(i - (n + k + 3)), ln));
        dn[4] = dn[4] && (ge(L(i - (n + 1)), ln) && ge(L(i - (n + 2)), ln) && ge(L(i - (n + 3)), ln)
          && ge(L(i - (n + 4)), ln) && gt(L(i - (n + k + 4)), ln));
      }
      lowFound = downL && (dn[0] || dn[1] || dn[2] || dn[3] || dn[4]);
      if (lowFound) fractalLowBarIndex = i - n;

      // BSL sweep
      if (truthy(fractalHighBarIndex)) {
        const level = H(fractalHighBarIndex);
        if (gt(b.high, level)) {
          if (cfg.drawLQSweeps && sessionDraw) {
            line.new(fractalHighBarIndex, level, i, level, 'bar_index', 'none', cfg.sweepColor, 'solid', 1);
            label.new(fractalHighBarIndex, NaN, 'Swept', 'bar_index', 'abovebar', undefined, 'none', cfg.sweepColor, 'small');
          }
          // Find MSS target
          let lowestLowOffset = 1;
          for (let k = 1; k <= i - fractalHighBarIndex; k++) {
            if (lt(L(i - k), L(i - lowestLowOffset))) lowestLowOffset = k;
          }
          bearishMSSTargetBarIndex = i - lowestLowOffset;
          fractalHighBarIndex = NaN;
        }
      }

      // SSL sweep
      if (truthy(fractalLowBarIndex)) {
        const level = L(fractalLowBarIndex);
        if (lt(b.low, level)) {
          if (cfg.drawLQSweeps && sessionDraw) {
            line.new(fractalLowBarIndex, level, i, level, 'bar_index', 'none', cfg.sweepColor, 'solid', 1);
            label.new(fractalLowBarIndex, NaN, 'Swept', 'bar_index', 'belowbar', undefined, 'none', cfg.sweepColor, 'small');
          }
          let highestHighOffset = 1;
          for (let k = 1; k <= i - fractalLowBarIndex; k++) {
            if (gt(H(i - k), H(i - highestHighOffset))) highestHighOffset = k;
          }
          bullishMSSTargetBarIndex = i - highestHighOffset;
          fractalLowBarIndex = NaN;
        }
      }

      // Bearish MSS
      if (truthy(bearishMSSTargetBarIndex)) {
        const level = L(bearishMSSTargetBarIndex);
        if (lt(b.close, level)) {
          if (cfg.drawMSS && sessionDraw) {
            line.new(bearishMSSTargetBarIndex, level, i, level, 'bar_index', 'none', cfg.bearishMSSColor, 'solid', 2);
            label.new(i, NaN, 'MSS', 'bar_index', 'abovebar', undefined, 'none', cfg.bearishMSSColor, 'normal');
          }
          bearishMSSTargetBarIndex = NaN;
        }
      }

      // Bullish MSS
      if (truthy(bullishMSSTargetBarIndex)) {
        const level = H(bullishMSSTargetBarIndex);
        if (gt(b.close, level)) {
          if (cfg.drawMSS && sessionDraw) {
            line.new(bullishMSSTargetBarIndex, level, i, level, 'bar_index', 'none', cfg.bullishMSSColor, 'solid', 2);
            label.new(i, NaN, 'MSS', 'bar_index', 'belowbar', undefined, 'none', cfg.bullishMSSColor, 'normal');
          }
          bullishMSSTargetBarIndex = NaN;
        }
      }

      // Bullish FVG
      if (i >= 2) {
        const p1 = bars[i - 1];
        if (gt(b.low, H(i - 2)) && gt(p1.close, p1.open) && sessionDraw && cfg.drawFVG) {
          box.new(i - 2, b.low, i, H(i - 2), cfg.bullishFVGColor, 1, 'solid', 'none', 'bar_index', cfg.bullishFVGColor);
        }
        // Bearish FVG
        if (lt(b.high, L(i - 2)) && lt(p1.close, p1.open) && sessionDraw && cfg.drawFVG) {
          box.new(i - 2, b.high, i, L(i - 2), cfg.bearishFVGColor, 1, 'solid', 'none', 'bar_index', cfg.bearishFVGColor);
        }
      }
    }

    // plotshape(..., offset = -fractalPeriod)
    if (cfg.drawFractals && highFound && sessionDraw && i - n >= 0) {
      markers.push({ time: bars[i - n].time, position: 'aboveBar', shape: 'triangleDown', color: cfg.fractalHighColor, size: 'tiny' });
    }
    if (cfg.drawFractals && lowFound && sessionDraw && i - n >= 0) {
      markers.push({ time: bars[i - n].time, position: 'belowBar', shape: 'triangleUp', color: cfg.fractalLowColor, size: 'tiny' });
    }
  }
  setDrawingBar(null);

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {},
    markers,
    bgColors,
    lines: line.all().map((l) => ({
      time1: T(l.x1), price1: l.y1, time2: T(l.x2), price2: l.y2, color: String(l.color), width: l.width ?? 1,
    })),
    labels: label.all().map((l) => ({
      time: T(l.x), price: l.y, text: l.text ?? '', style: 'none' as const, yloc: l.yloc,
      textColor: String(l.textcolor), size: l.size as LabelData['size'],
    })),
    boxes: box.all().map((x) => ({
      time1: T(x.left), price1: x.top, time2: T(x.right), price2: x.bottom,
      bgColor: String(x.bgcolor), borderColor: String(x.border_color),
    })),
  };
}

export const SmcIndicatorWithWebhook = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
};
