/**
 * Smart Money Concepts Probability (Expo)
 *
 * The script follows an upper level (the running highest high, reset to each new pivot high) and a lower level (the
 * running lowest low, reset to each new pivot low); pivots have "Structure Period" bars on each side. A new high
 * above the upper level is a bullish structure: "CHoCH" when the structure before was bearish, then "SMS" and
 * "BMS" for the next ones, which also need the level to have been flat for the "Structure Response" bars (the
 * structure period when the option is off). New lows below the lower level are the bearish structures. Each one
 * draws a line at the broken level and a text at its middle.
 *
 * Probability: at every structure the script counts how often each kind of structure (CHoCH, SMS, BMS, per side)
 * was followed by a reversal or by a continuation. The two labels at the current upper and lower levels give these
 * shares for the next move, and the table counts how often the more likely move happened (win / loss).
 *
 * Premium & Discount: on the last bar, lines at the upper and lower levels and three boxes (the top 10 % to 25 % of
 * the range, the bottom 10 % to 25 %, and the middle 10 %), from the bar of the latest level.
 *
 * At most 500 lines and 500 labels are kept (the oldest are removed first).
 * Chart values read from the optional third argument: the foreground and background colours of the chart, used by
 * the two labels and the table. Without them the port uses #DBDBDB and #0F0F0F (dark chart).
 * Alerts (alert() calls, `alertCalls` of the result, once per bar close): on every bar where the structure changes,
 * the ticker, the chart timeframe and the two probability texts, each line when its input of the group "Any alert()
 * function call" is on (no call when all three are off).
 *
 * Reference: "Smart Money Concepts Probability (Expo)" by Zeiierman
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © Zeiierman
 */

import { ta, math, str, color, Series, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { AlertCall, BoxData, LabelData, LineDrawingData, LinefillData, TableData } from '../types';
import { barInterval, barTime } from '../bar-time';
import { backgroundColorOf, foregroundColorOf, tickerOf, type ChartContext } from '../chart-context';
import { chartTimeframe } from '../anchor-period';

/** The original makes alert() calls */
export const hasAlertFunction = true;

export interface SmartMoneyConceptsProbabilityInputs {
  /** Pivot period: bars on each side */
  prd: number;
  /** Use the response period below (else the pivot period) */
  s1: boolean;
  resp: number;
  bull: boolean;
  /** Line colour of the bullish structures */
  bull2: string;
  /** Text colour of the bullish structures */
  bull3: string;
  bear: boolean;
  bear2: string;
  bear3: string;
  showPD: boolean;
  prem: string;
  disc: string;
  hlloc: 'Left' | 'Right';
  /** Alert text options (no output) */
  alertTicker: boolean;
  alertTimeframe: boolean;
  alertProbability: boolean;
}

export const defaultInputs: SmartMoneyConceptsProbabilityInputs = {
  prd: 20,
  s1: true,
  resp: 7,
  bull: true,
  bull2: '#08EC7E',
  bull3: '#08EC7E',
  bear: true,
  bear2: '#FF2222',
  bear3: '#FF2222',
  showPD: true,
  prem: 'rgba(255, 34, 34, 0.2)',
  disc: 'rgba(8, 236, 126, 0.2)',
  hlloc: 'Right',
  alertTicker: true,
  alertTimeframe: true,
  alertProbability: true,
};

const ALERT_GROUP = 'Any alert() function call';

export const inputConfig: InputConfig[] = [
  { id: 'prd', type: 'int', title: 'Structure Period', defval: 20, min: 1 },
  { id: 's1', type: 'bool', title: 'Structure Response  ', defval: true, inline: 'resp' },
  { id: 'resp', type: 'int', title: '', defval: 7, min: 1, inline: 'resp' },
  { id: 'bull', type: 'bool', title: 'Bullish Structure     ', defval: true, inline: 'Bullish' },
  { id: 'bull2', type: 'color', title: '', defval: '#08EC7E', inline: 'Bullish' },
  { id: 'bull3', type: 'color', title: '', defval: '#08EC7E', inline: 'Bullish' },
  { id: 'bear', type: 'bool', title: 'Bearish Structure    ', defval: true, inline: 'Bearish' },
  { id: 'bear2', type: 'color', title: '', defval: '#FF2222', inline: 'Bearish' },
  { id: 'bear3', type: 'color', title: '', defval: '#FF2222', inline: 'Bearish' },
  { id: 'showPD', type: 'bool', title: 'Premium & Discount', defval: true, inline: 'pd' },
  { id: 'prem', type: 'color', title: '', defval: 'rgba(255, 34, 34, 0.2)', inline: 'pd' },
  { id: 'disc', type: 'color', title: '', defval: 'rgba(8, 236, 126, 0.2)', inline: 'pd' },
  { id: 'hlloc', type: 'string', title: '', defval: 'Right', options: ['Left', 'Right'], inline: 'pd' },
  { id: 'alertTicker', type: 'bool', title: 'Ticker ID', defval: true, group: ALERT_GROUP },
  { id: 'alertTimeframe', type: 'bool', title: 'Timeframe', defval: true, group: ALERT_GROUP },
  { id: 'alertProbability', type: 'bool', title: 'Probability Percentage', defval: true, group: ALERT_GROUP },
];

export const plotConfig: PlotConfig[] = [];

export const metadata = {
  title: 'Smart Money Concepts Probability (Expo)',
  shortTitle: 'Smart Money Concepts Probability (Expo)',
  overlay: true,
};

/** color.gray, color.green, color.red */
const GRAY = '#787B86';
const GREEN = '#4CAF50';
const RED = '#FF5252';
/** indicator(max_labels_count = 500, max_lines_count = 500) */
const MAX_OBJECTS = 500;

/** Pine float comparisons: a > b only when a - b > 1e-10, a == b within 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const eq = (a: number, b: number) => Math.abs(a - b) <= EPS;

interface Ln {
  x1: number;
  x2: number;
  y: number;
  color: string;
}
interface Lb {
  x: number;
  y: number;
  text: string;
  textColor: string;
  style: 'label_down' | 'label_up' | 'label_left';
}

export function calculate(
  bars: Bar[],
  inputs: Partial<SmartMoneyConceptsProbabilityInputs> = {},
  chart?: ChartContext,
): Omit<IndicatorResult, 'boxes' | 'labels' | 'lines' | 'linefills' | 'tables'> & {
  boxes: BoxData[];
  labels: LabelData[];
  lines: LineDrawingData[];
  linefills: LinefillData[];
  tables: TableData[];
  alertCalls: AlertCall[];
} {
  const cfg = { ...defaultInputs, ...inputs };
  // chart.bg_color / chart.fg_color
  const CHART_BG = backgroundColorOf(chart);
  const CHART_FG = foregroundColorOf(chart);
  const n = bars.length;
  const prd = Math.trunc(cfg.prd);
  const back = cfg.s1 ? Math.trunc(cfg.resp) : prd;

  const pvtHiArr = ta.pivothigh(new Series(bars, (b) => b.high), prd, prd).toArray();
  const pvtLoArr = ta.pivotlow(new Series(bars, (b) => b.low), prd, prd).toArray();

  // Live drawings in creation order. Limit: when a creation brings the count above max + 5, the oldest are deleted
  // until max remain; an object held by a `var` variable (the two level lines and the two probability labels, made
  // on the first bar) is never deleted by the limit, but it counts.
  const held = new Set<object>();
  const lines: Ln[] = [];
  const labels: Lb[] = [];
  const add = <T extends object>(list: T[], o: T): T => {
    list.push(o);
    if (list.length > MAX_OBJECTS + 5) {
      for (let k = 0; k < list.length && list.length > MAX_OBJECTS; ) {
        if (held.has(list[k])) k++;
        else list.splice(k, 1);
      }
    }
    return o;
  };

  // var objects of the first bar, in the order of the script
  const hi: Ln = { x1: NaN, x2: NaN, y: NaN, color: cfg.bear2 };
  const lo: Ln = { x1: NaN, x2: NaN, y: NaN, color: cfg.bull2 };
  const prob1: Lb = { x: NaN, y: NaN, text: '', textColor: CHART_FG, style: 'label_left' };
  const prob2: Lb = { x: NaN, y: NaN, text: '', textColor: CHART_FG, style: 'label_left' };
  if (n > 0) {
    for (const l of [hi, lo]) held.add(add<Ln>(lines, l));
    for (const l of [prob1, prob2]) held.add(add<Lb>(labels, l));
  }

  // matrix.new<float>(9, 4, 0.0)
  const vals: number[][] = Array.from({ length: 9 }, () => [0, 0, 0, 0]);
  const txt = ['', ''];
  const UpH: number[] = new Array(n).fill(NaN);
  const DnH: number[] = new Array(n).fill(NaN);
  let Up = NaN;
  let Dn = NaN;
  let iUp = NaN;
  let iDn = NaN;
  let pos = 0;
  const at = (x: number[], i: number) => (i >= 0 ? x[i] : NaN);
  // alert() calls: syminfo.ticker and timeframe.period (v5: "D" for 1D) of the messages
  const alertCalls: AlertCall[] = [];
  const ticker = tickerOf(chart);
  const period = chartTimeframe(bars, chart).replace(/^1([DWM])$/, '$1');
  const alertOn = [cfg.alertTicker, cfg.alertTimeframe, cfg.alertProbability];
  const createLabel = (x: number, y: number, text: string, col: string, down: boolean) => {
    add<Lb>(labels, { x, y, text, textColor: col, style: down ? 'label_down' : 'label_up' });
  };

  for (let i = 0; i < n; i++) {
    const bar = bars[i];
    const Up1 = Up;
    const Dn1 = Dn;
    const iUp1 = iUp;
    const iDn1 = iDn;
    const pos1 = i > 0 ? pos : NaN;

    // Pivots
    Up = math.max(Up1, bar.high) as number;
    Dn = math.min(Dn1, bar.low) as number;
    const pvtHi = pvtHiArr[i] ?? NaN;
    const pvtLo = pvtLoArr[i] ?? NaN;
    if (!isNaN(pvtHi) && pvtHi !== 0) Up = pvtHi;
    if (!isNaN(pvtLo) && pvtLo !== 0) Dn = pvtLo;
    UpH[i] = Up;
    DnH[i] = Dn;

    // Structure
    if (gt(Up, Up1)) {
      iUp = i;
      const centerBull = math.round((iUp1 + i) / 2);
      const flat = eq(Up1, at(UpH, i - back));
      const draw = (text: string) => {
        if (!cfg.bull) return;
        createLabel(centerBull, Up1, text, cfg.bull3, true);
        add<Ln>(lines, { x1: iUp1, x2: i, y: Up1, color: cfg.bull2 });
      };
      if (pos <= 0) {
        draw('CHoCH');
        pos = 1;
        vals[6][0] += 1;
      } else if (pos === 1 && flat) {
        draw('SMS');
        pos = 2;
        vals[6][1] += 1;
      } else if (pos > 1 && flat) {
        draw('BMS');
        pos += 1;
        vals[6][2] += 1;
      }
    } else if (lt(Up, Up1)) {
      iUp = i - prd;
    }
    if (lt(Dn, Dn1)) {
      iDn = i;
      const centerBear = math.round((iDn1 + i) / 2);
      const flat = eq(Dn1, at(DnH, i - back));
      const draw = (text: string) => {
        if (!cfg.bear) return;
        createLabel(centerBear, Dn1, text, cfg.bear3, false);
        add<Ln>(lines, { x1: iDn1, x2: i, y: Dn1, color: cfg.bear2 });
      };
      if (pos >= 0) {
        draw('CHoCH');
        pos = -1;
        vals[7][0] += 1;
      } else if (pos === -1 && flat) {
        draw('SMS');
        pos = -2;
        vals[7][1] += 1;
      } else if (pos < -1 && flat) {
        draw('BMS');
        pos -= 1;
        vals[7][2] += 1;
      }
    } else if (gt(Dn, Dn1)) {
      iDn = i - prd;
    }

    // Probability calculation: if ta.change(pos)
    if (!isNaN(pos1) && pos !== pos1) {
      // Results: was the more likely move the one that happened?
      if ((pos > 0 && pos1 > 0) || (pos < 0 && pos1 < 0)) {
        if (lt(vals[8][0], vals[8][1])) vals[8][2] += 1;
        else vals[8][3] += 1;
      } else if (gt(vals[8][0], vals[8][1])) {
        vals[8][2] += 1;
      } else {
        vals[8][3] += 1;
      }

      // Score calculation (the counts are read before the updates)
      const [buC0, , buC1] = vals[0];
      const [buS0, , buS1] = vals[1];
      const [buB0, , buB1] = vals[2];
      const [beC0, , beC1] = vals[3];
      const [beS0, , beS1] = vals[4];
      const [beB0, , beB1] = vals[5];
      const [tbuC, tbuS, tbuB] = vals[6];
      const [tbeC, tbeS, tbeB] = vals[7];
      const set = (row: number, col: number, count: number, total: number) => {
        vals[row][col] = count + 1;
        vals[row][col + 1] = math.round(((count + 1) / total) * 100, 2);
      };
      // Bull
      if ((pos1 === 1 || pos1 === 0) && pos < 0) set(0, 0, buC0, tbuC);
      if ((pos1 === 1 || pos1 === 0) && pos === 2) set(0, 2, buC1, tbuC);
      if (pos1 === 2 && pos < 0) set(1, 0, buS0, tbuS);
      if (pos1 === 2 && pos > 2) set(1, 2, buS1, tbuS);
      if (pos1 > 2 && pos < 0) set(2, 0, buB0, tbuB);
      if (pos1 > 2 && pos > pos1) set(2, 2, buB1, tbuB);
      // Bear
      if ((pos1 === -1 || pos1 === 0) && pos > 0) set(3, 0, beC0, tbeC);
      if ((pos1 === -1 || pos1 === 0) && pos === -2) set(3, 2, beC1, tbeC);
      if (pos1 === -2 && pos > 0) set(4, 0, beS0, tbeS);
      if (pos1 === -2 && pos < -2) set(4, 2, beS1, tbeS);
      if (pos1 < -2 && pos > 0) set(5, 0, beB0, tbeB);
      if (pos1 < -2 && pos < pos1) set(5, 2, beB1, tbeB);

      // Current(pos)
      const row = pos === 1 ? 0 : pos === 2 ? 1 : pos > 2 ? 2 : pos === -1 ? 3 : pos === -2 ? 4 : pos < -2 ? 5 : -1;
      const name = row < 0 ? '' : row === 0 || row === 3 ? 'SMS: ' : 'BMS: ';
      const val1 = row < 0 ? NaN : vals[row][1];
      const val2 = row < 0 ? NaN : vals[row][3];
      txt[0] = 'CHoCH: ' + str.tostring(val1, 'percent');
      txt[1] = name + str.tostring(val2, 'percent');
      vals[8][0] = val1;
      vals[8][1] = val2;

      // if array.includes(alert_bool, true): alert(array.join(output, '\n'), alert.freq_once_per_bar_close)
      if (alertOn.includes(true)) {
        const parts = [ticker, period, txt.join('\n')].filter((_, k) => alertOn[k]);
        alertCalls.push({ time: bar.time as number, message: parts.join('\n'), freq: 'once_per_bar_close' });
      }
    }
  }

  // Last bar: premium & discount, probability labels, table
  const boxes: Array<{ left: number; top: number; right: number; bottom: number; bg: string }> = [];
  let fillColor = 'transparent';
  if (n > 0) {
    const b = n - 1;
    if (cfg.showPD) {
      const loc = (cfg.hlloc === 'Left' ? math.min(iUp, iDn) : math.max(iUp, iDn)) as number;
      hi.x1 = loc;
      hi.x2 = b;
      hi.y = Up;
      lo.x1 = loc;
      lo.x2 = b;
      lo.y = Dn;
      fillColor = String(color.new(GRAY, 90));
      const range = Up - Dn;
      boxes.push(
        { left: loc, top: Up - range * 0.1, right: b, bottom: Up - range * 0.25, bg: cfg.prem },
        { left: loc, top: Dn + range * 0.25, right: b, bottom: Dn + range * 0.1, bg: cfg.disc },
        { left: loc, top: Up - range * 0.45, right: b, bottom: Dn + range * 0.45, bg: String(color.new(GRAY, 80)) },
      );
    }
    prob1.x = b;
    prob1.y = Up;
    prob1.text = pos < 0 ? txt[0] : txt[1];
    prob2.x = b;
    prob2.y = Dn;
    prob2.text = pos > 0 ? txt[0] : txt[1];
  }

  const W = vals[8][2];
  const L = vals[8][3];
  const WR = math.round((W / (W + L)) * 100, 2);
  const tblVals = ['WIN: ' + str.tostring(W), 'LOSS: ' + str.tostring(L), 'Profitability: ' + str.tostring(WR, 'percent')];
  const tblCol = [GREEN, RED, CHART_FG];
  const table: TableData = {
    position: 'top_right',
    columns: 2,
    rows: 3,
    frameColor: String(color.new(GRAY, 50)),
    frameWidth: 3,
    borderColor: CHART_BG,
    borderWidth: -2,
    cells: n > 0 ? tblVals.map((text, row) => ({
      column: 0, row, text, textHAlign: 'center' as const, bgColor: CHART_BG, textColor: tblCol[row], textSize: 'auto' as const,
    })) : [],
  };

  const interval = barInterval(bars);
  const T = (index: number) => barTime(bars, index, interval);
  const drawn = (l: Ln) => !isNaN(l.x1) && !isNaN(l.x2) && !isNaN(l.y);
  const lineOut = (l: Ln): LineDrawingData => ({ time1: T(l.x1), price1: l.y, time2: T(l.x2), price2: l.y, color: l.color });
  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {},
    // an object with an na coordinate is not drawn
    lines: lines.filter(drawn).map(lineOut),
    linefills: drawn(hi) && drawn(lo) ? [{ line1: lineOut(hi), line2: lineOut(lo), color: fillColor }] : [],
    boxes: boxes.filter((x) => !isNaN(x.left) && !isNaN(x.top) && !isNaN(x.bottom)).map((x) => ({
      time1: T(x.left), price1: x.top, time2: T(x.right), price2: x.bottom, bgColor: x.bg, borderColor: 'transparent',
    })),
    labels: labels.filter((l) => !isNaN(l.x) && !isNaN(l.y)).map((l) => ({
      time: T(l.x), price: l.y, text: l.text, color: 'transparent', textColor: l.textColor, style: l.style,
    })),
    tables: [table],
    alertCalls,
  };
}

export const SmartMoneyConceptsProbability = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  hasAlertFunction,
};
