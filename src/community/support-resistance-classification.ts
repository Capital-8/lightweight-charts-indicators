/**
 * Support Resistance Classification (VR)
 *
 * Nine level sets (type, length, multiplier, higher timeframe): the SMA, the upper / lower Bollinger band, the
 * previous high / low of a higher timeframe (`request.security` of the value one bar back, lookahead on), the swing
 * highs / lows of the visible chart, or the Fibonacci pivot point levels of the timeframe. On the last visible bar
 * (`chart.right_visible_bar_time`) every level inside the visible price range (highest high and lowest low from the
 * first visible bar, `chart.left_visible_bar_time`) is drawn as a line extended to the left, coloured green below
 * the close and red above it, with a transparency that grows with the number of times the close broke the level
 * since the first visible bar (100 % after "fade" breaks). A label to the right gives the rank of the level (1 = the
 * fewest breaks) and its timeframe. Two boxes mark the top and bottom 5 % of the visible range. Optional plots ("show
 * values" A to E) show the values of chosen sets; optional swing markers.
 *
 * The visible range comes from the chart context (`leftVisibleBarTime` / `rightVisibleBarTime`; all the bars
 * without it): the output changes when the chart is scrolled or zoomed (`usesVisibleRange`). The chart timeframe,
 * time zone and session (higher-timeframe periods) come from the chart context too.
 *
 * The plot style of each "show values" group follows its chosen set in the original (circles for a Fibonacci set,
 * a line otherwise); the plot styles here are those of the default choices (A to D lines, E circles).
 *
 * Reference: "Support Resistance Classification (VR) [LuxAlgo]" by LuxAlgo
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © LuxAlgo
 */

import {
  taCore, str, color, timeframe, box, label, line, mapToChart, resetDrawings, setDrawingBar, varDrawing,
  type Box, type Label, type IndicatorResult, type InputConfig, type PlotConfig, type Bar,
} from 'oakscriptjs';
import type { BoxData, LabelData, LineDrawingData } from '../types';
import { barInterval, barTime } from '../bar-time';
import { visibleRangeOf, type ChartContext } from '../chart-context';
import { chartTimeframe, higherTimeframeBars, periodChanges } from '../anchor-period';

type SetType = 'NONE' | 'SMA' | 'Upper' | 'Lower' | 'Previous High' | 'Previous Low' | 'Swings' | 'Fibonacci';

export interface SupportResistanceClassificationInputs {
  fade: number;
  opt: 'value' | 'line';
  colU: string;
  colD: string;
  left: number;
  right: number;
  showPP: boolean;
  chc1: SetType; len1: number; mlt1: number; res1: string;
  chc2: SetType; len2: number; mlt2: number; res2: string;
  chc3: SetType; len3: number; mlt3: number; res3: string;
  chc4: SetType; len4: number; mlt4: number; res4: string;
  chc5: SetType; len5: number; mlt5: number; res5: string;
  chc6: SetType; len6: number; mlt6: number; res6: string;
  chc7: SetType; len7: number; mlt7: number; res7: string;
  chc8: SetType; len8: number; mlt8: number; res8: string;
  chc9: SetType; len9: number; mlt9: number; res9: string;
  pick1: boolean; choice1: number;
  pick2: boolean; choice2: number;
  pick3: boolean; choice3: number;
  pick4: boolean; choice4: number;
  pick5: boolean; choice5: number;
}

export const defaultInputs: SupportResistanceClassificationInputs = {
  fade: 5,
  opt: 'line',
  colU: '#00E676',
  colD: '#FF5252',
  left: 10,
  right: 1,
  showPP: false,
  chc1: 'SMA', len1: 50, mlt1: 2, res1: 'D',
  chc2: 'SMA', len2: 100, mlt2: 2, res2: 'D',
  chc3: 'SMA', len3: 20, mlt3: 2, res3: 'W',
  chc4: 'Previous High', len4: 20, mlt4: 2, res4: 'W',
  chc5: 'Previous Low', len5: 20, mlt5: 2, res5: 'W',
  chc6: 'Upper', len6: 20, mlt6: 2, res6: 'D',
  chc7: 'Lower', len7: 20, mlt7: 2, res7: 'D',
  chc8: 'Swings', len8: 20, mlt8: 2, res8: 'D',
  chc9: 'Fibonacci', len9: 20, mlt9: 2, res9: 'W',
  pick1: false, choice1: 1,
  pick2: false, choice2: 3,
  pick3: false, choice3: 5,
  pick4: false, choice4: 7,
  pick5: false, choice5: 9,
};

const SET_GROUP = 'SET (N° – Type – Length – Mult – HTF)';
const SET_OPTIONS: SetType[] = ['NONE', 'SMA', 'Upper', 'Lower', 'Previous High', 'Previous Low', 'Swings', 'Fibonacci'];

const setInputs = (): InputConfig[] => {
  const out: InputConfig[] = [];
  for (let e = 1; e <= 9; e++) {
    const d = defaultInputs as unknown as Record<string, string | number>;
    const inline = String(e);
    out.push(
      { id: `chc${e}`, type: 'string', title: String(e), defval: d[`chc${e}`], options: SET_OPTIONS, group: SET_GROUP, inline },
      { id: `len${e}`, type: 'int', title: '', defval: d[`len${e}`], group: SET_GROUP, inline },
      { id: `mlt${e}`, type: 'float', title: '', defval: d[`mlt${e}`], group: SET_GROUP, inline },
      { id: `res${e}`, type: 'timeframe', title: '', defval: d[`res${e}`], group: SET_GROUP, inline },
    );
  }
  return out;
};

const pickInputs = (): InputConfig[] => {
  const out: InputConfig[] = [];
  const names = ['A', 'B', 'C', 'D', 'E'];
  for (let k = 1; k <= 5; k++) {
    const d = defaultInputs as unknown as Record<string, number>;
    const inline = String(k);
    out.push(
      { id: `pick${k}`, type: 'bool', title: names[k - 1], defval: false, group: 'show values', inline },
      { id: `choice${k}`, type: 'int', title: '', defval: d[`choice${k}`], min: 1, max: 9, group: 'show values', inline },
    );
  }
  return out;
};

export const inputConfig: InputConfig[] = [
  { id: 'fade', type: 'int', title: 'fade', defval: 5, tooltip: 'After x breaks\nthe line is invisible' },
  { id: 'opt', type: 'string', title: 'value', defval: 'line', options: ['value', 'line'] },
  { id: 'colU', type: 'color', title: '              ', defval: '#00E676', inline: 'c' },
  { id: 'colD', type: 'color', title: '', defval: '#FF5252', inline: 'c' },
  { id: 'left', type: 'int', title: 'left', defval: 10, min: 1, max: 20, group: 'Swings settings' },
  { id: 'right', type: 'int', title: 'right', defval: 1, min: 1, max: 10, group: 'Swings settings' },
  { id: 'showPP', type: 'bool', title: 'show', defval: false, group: 'Swings settings' },
  ...setInputs(),
  ...pickInputs(),
];

// v5 colours of the "show values" plots: color.blue, yellow, purple, orange, white
const PLOT_GROUPS: Array<{ name: string; color: string; style: 'line' | 'circles' }> = [
  { name: 'A', color: '#2962FF', style: 'line' },
  { name: 'B', color: '#FFEB3B', style: 'line' },
  { name: 'C', color: '#9C27B0', style: 'line' },
  { name: 'D', color: '#FF9800', style: 'line' },
  { name: 'E', color: '#FFFFFF', style: 'circles' },
];

/** 11 plots per group (one per pivot level; the first one for the other types), display.pane */
export const plotConfig: PlotConfig[] = PLOT_GROUPS.flatMap((g, k) =>
  Array.from({ length: 11 }, (_v, j) => ({
    id: `plot${k * 11 + j}`, title: g.name, color: g.color, lineWidth: 1, style: g.style, display: 'pane' as const,
  })));

export const metadata = {
  title: 'Support Resistance Classification (VR) [LuxAlgo]',
  shortTitle: 'LuxAlgo - Support Resistance Classification (VR)',
  overlay: true,
};

/** The output depends on the visible bars of the chart (`chart.left_visible_bar_time` / `right_visible_bar_time`) */
export const usesVisibleRange = true;

/** indicator(max_lines_count = 500); labels and boxes keep the default maximum of 50 */
const MAX_LINES = 500;

/** Pine float comparisons: a > b only when a - b > 1e-10, a >= b when a - b >= -1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const ge = (a: number, b: number) => a - b >= -EPS;

const PIVOT_NAMES = ['P', 'R1', 'S1', 'R2', 'S2', 'R3', 'S3', 'R4', 'S4', 'R5', 'S5'];

interface Piv { b: number; p: number }

/** Inclusive Pine `for i = from to to` (counts down when from > to; an na bound runs nothing) */
function forTo(from: number, to: number, body: (i: number) => void): void {
  if (Number.isNaN(from) || Number.isNaN(to)) return;
  if (from <= to) for (let i = from; i <= to; i++) body(i);
  else for (let i = from; i >= to; i--) body(i);
}

export function calculate(
  bars: Bar[],
  inputs: Partial<SupportResistanceClassificationInputs> = {},
  chart?: ChartContext,
): Omit<IndicatorResult, 'boxes' | 'labels' | 'lines'> & { boxes: BoxData[]; labels: LabelData[]; lines: LineDrawingData[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const c = cfg as unknown as Record<string, unknown>;
  const n = bars.length;
  const lastBarIndex = n - 1;
  const fade = cfg.fade;
  const fromR = cfg.opt === 'value';
  const leftLen = Math.trunc(cfg.left);
  const rightLen = Math.trunc(cfg.right);
  const toMs = chart?.timeUnit === 'ms' ? 1 : 1000;
  const { leftTime, rightTime } = visibleRangeOf(bars, chart);
  const timeOf = (i: number) => bars[i].time * toMs;
  const close = bars.map((b) => b.close);
  const closeAt = (i: number, k: number) => (i - k >= 0 && i - k < n ? close[i - k] : NaN);

  const chartTf = n > 1 || chart?.timeframe ? chartTimeframe(bars, chart) : '';
  const chartSec = chartTf === '' ? NaN : timeframe.in_seconds(chartTf);
  const secondsOf = (res: string) => (res.trim() === '' ? chartSec : timeframe.in_seconds(res));

  /** The value of `bs` of the original on a set of bars */
  const bsOf = (b: Bar[], chc: SetType, len: number, mlt: number): number[] => {
    const cl = b.map((x) => x.close);
    switch (chc) {
      case 'SMA': return taCore.sma(cl, len) as number[];
      case 'Swings': return b.map(() => NaN);
      case 'Previous High': return b.map((x) => x.high);
      case 'Previous Low': return b.map((x) => x.low);
      default: {
        const [, u, l] = taCore.bb(cl, len, mlt) as number[][];
        return chc === 'Upper' ? u : chc === 'Lower' ? l : b.map(() => NaN);
      }
    }
  };

  interface SetState {
    e: number; chc: SetType; len: number; res: string;
    act: boolean; htf: boolean; pp: boolean; hl: boolean;
    sBs: number[]; tfChange: boolean[]; bsChange: number[]; levels: number[][] | null;
    arrPP: number[];
  }
  const sets: SetState[] = [];
  for (let e = 1; e <= 9; e++) {
    const chc = c[`chc${e}`] as SetType;
    const len = Math.trunc(c[`len${e}`] as number);
    const mlt = c[`mlt${e}`] as number;
    const res = c[`res${e}`] as string;
    const act = chc !== 'NONE';
    const resSec = secondsOf(res);
    const htf = resSec >= chartSec;
    const pp = chc === 'Fibonacci';
    let sBs = bars.map(() => NaN);
    if (htf && act) {
      // request.security(syminfo.tickerid, res, bs[1], lookahead = barmerge.lookahead_on)
      if (res.trim() === '' || resSec === chartSec) {
        const bs = bsOf(bars, chc, len, mlt);
        sBs = bs.map((_v, i) => (i > 0 ? bs[i - 1] : NaN));
      } else {
        const { htf: hb, group, latest } = higherTimeframeBars(bars, res, chart);
        const bs = bsOf(hb, chc, len, mlt);
        sBs = mapToChart(bs.map((_v, g) => (g > 0 ? bs[g - 1] : NaN)), group, latest, true, false);
      }
    }
    let tfChange: boolean[] = [];
    let bsChange: number[] = [];
    let levels: number[][] | null = null;
    if (act && htf && chc !== 'Swings') {
      tfChange = periodChanges(bars, res, chart);
      bsChange = taCore.barssince(tfChange) as number[];
      if (pp) {
        // ta.pivot_point_levels(chc, timeframe.change(res))
        levels = taCore.pivot_point_levels(chc, tfChange, false, bars.map((b) => b.high), bars.map((b) => b.low),
          close) as number[][];
      }
    }
    sets.push({
      e, chc, len, res, act, htf, pp, hl: chc === 'Previous High' || chc === 'Previous Low',
      sBs, tfChange, bsChange, levels, arrPP: new Array<number>(11).fill(0),
    });
  }

  const ph = taCore.pivothigh(bars.map((b) => b.high), leftLen, rightLen) as number[];
  const pl = taCore.pivotlow(bars.map((b) => b.low), leftLen, rightLen) as number[];
  const truthy = (v: number) => !Number.isNaN(v) && v !== 0;

  resetDrawings({ line: MAX_LINES });
  const topBox = varDrawing<Box>();
  const btmBox = varDrawing<Box>();
  const pivH: Piv[] = [];
  const pivL: Piv[] = [];
  let highest = NaN;
  let lowest = NaN;
  let sBix = NaN;

  const plotValues: number[][] = Array.from({ length: 55 }, () => new Array<number>(n).fill(NaN));
  const picks = [1, 2, 3, 4, 5].map((k) => ({ pick: c[`pick${k}`] as boolean, choice: Math.trunc(c[`choice${k}`] as number) }));

  for (let i = 0; i < n; i++) {
    setDrawingBar(i, i === lastBarIndex);
    const b = bars[i];
    const time = timeOf(i);
    if (i === 0) {
      topBox.value = box.new(NaN, NaN, NaN, NaN, 'transparent', 1, 'solid', 'left', 'bar_index', String(color.new('#FF5252', 90)));
      btmBox.value = box.new(NaN, NaN, NaN, NaN, 'transparent', 1, 'solid', 'left', 'bar_index', String(color.new('#00E676', 90)));
    }

    if (time === leftTime) {
      highest = b.high;
      lowest = b.high;
      sBix = i;
      pivH.unshift({ b: i, p: b.high });
      pivL.unshift({ b: i, p: b.high });
    }
    if (time > leftTime) {
      if (gt(b.high, highest)) highest = b.high;
      if (gt(lowest, b.low)) lowest = b.low;
      if (time <= rightTime) {
        if (truthy(ph[i])) {
          forTo(pivH.length - 1, 0, (k) => {
            if (ge(ph[i], pivH[k].p)) pivH.splice(k, 1);
          });
          pivH.unshift({ b: i - rightLen, p: ph[i] });
        }
        if (truthy(pl[i])) {
          forTo(pivL.length - 1, 0, (k) => {
            if (ge(pivL[k].p, pl[i])) pivL.splice(k, 1);
          });
          pivL.unshift({ b: i - rightLen, p: pl[i] });
        }
      }
    }

    const isRight = time === rightTime;
    const lab: Array<{ lb: Label; gr: number }> = [];
    const aGrade: number[] = [];
    const inRange = (p: number) => ge(highest, p) && ge(p, lowest);
    const gradeOf = (breaks: number) => Math.min(100, Math.round((100 / fade) * breaks));
    /** Breaks of a level: crossings of the close away from its side at the right visible bar */
    const countBreaks = (above: boolean, count: number, level: (d: number) => number) => {
      let pos = 1;
      let breaks = 0;
      forTo(0, count, (d) => {
        const v = level(d);
        const cl = closeAt(i, d);
        if (pos === 1 && (above ? gt(cl, v) : gt(v, cl))) {
          breaks += 1;
          pos = 0;
        }
        if (pos === 0 && (above ? gt(v, cl) : gt(cl, v))) pos = 1;
      });
      return breaks;
    };
    const draw = (e: number, p: number, col: string, text: string, tooltip: string, grade: number) => {
      line.new(i - 1, p, i + 8, p, 'bar_index', 'left', col);
      const lb = label.new(i + 8 + e * 5, p, text, 'bar_index', 'price', 'transparent', 'label_left', col, 'small',
        undefined, tooltip);
      lab.unshift({ lb, gr: grade });
      aGrade.unshift(grade);
    };

    for (const s of sets) {
      if (!s.act) continue;
      const chartRes = s.res === '';
      const shown = chartRes ? 'chart' : s.res;
      const text = (chartRes ? '' : '(') + s.res + (chartRes ? '' : ')');
      if (s.pp && s.htf) {
        if (s.tfChange[i]) for (let k = 0; k < 11; k++) s.arrPP[k] = s.levels![k][i];
        if (isRight) {
          for (let k = 0; k < 11; k++) {
            const p = s.arrPP[k];
            if (!inRange(p)) continue;
            const count = fromR ? Math.min(lastBarIndex - sBix, s.bsChange[i]) : lastBarIndex - sBix;
            const breaks = countBreaks(gt(p, b.close), count, () => p);
            const grade = gradeOf(breaks);
            const col = String(color.new(gt(b.close, p) ? cfg.colU : cfg.colD, grade));
            draw(s.e, p, col, text, str.format('N°{0} – HTF: {1} \n{2} ({3})', s.e, shown, PIVOT_NAMES[k], 'Fib.'), grade);
          }
        }
      } else if (s.chc !== 'Swings' && s.htf) {
        // setLine(e, sBs, chc, len, res): `var float val` takes sBs on every bar
        const val = s.sBs[i];
        const count = s.hl && fromR ? Math.min(lastBarIndex - sBix, s.bsChange[i]) : lastBarIndex - sBix;
        if (isRight && ge(highest, val) && ge(val, lowest)) {
          const level = (d: number) => (s.hl ? val : fromR ? (i - d >= 0 ? s.sBs[i - d] : NaN) : val);
          const breaks = countBreaks(gt(val, b.close), count, level);
          const grade = gradeOf(breaks);
          const col = String(color.new(gt(b.close, val) ? cfg.colU : cfg.colD, grade));
          const tooltip = str.format('N°{0} – HTF: {1} \n{2}', s.e, shown, s.chc) + (s.hl ? '' : ', len ' + str.tostring(s.len));
          draw(s.e, val, col, text, tooltip, grade);
        }
      } else if (s.chc === 'Swings' && isRight) {
        for (const [list, above, base] of [[pivH, true, cfg.colD], [pivL, false, cfg.colU]] as Array<[Piv[], boolean, string]>) {
          if (list.length === 0) throw new Error('Index 0 is out of bounds, array size is 0');
          for (const p of list) {
            if (!inRange(p.p)) continue;
            const breaks = countBreaks(above, lastBarIndex - sBix, () => p.p);
            const grade = gradeOf(breaks);
            const col = String(color.new(base, grade));
            draw(s.e, p.p, col, '', 'N°' + str.tostring(s.e) + ' Swings', grade);
          }
        }
      }
    }

    if (isRight) {
      box.set_lefttop(topBox.value!, i - 1, highest);
      box.set_rightbottom(topBox.value!, i + 8, highest - ((highest - lowest) / 20));
      box.set_lefttop(btmBox.value!, i - 1, lowest + ((highest - lowest) / 20));
      box.set_rightbottom(btmBox.value!, i + 8, lowest);
      // rank of each grade among the distinct grades (ascending)
      const arr = [...aGrade].sort((x, y) => x - y);
      if (arr.length > 1) {
        let lastValue = arr[arr.length - 1];
        for (let j = arr.length - 2; j >= 0; j--) {
          if (Math.abs(arr[j] - lastValue) <= EPS) arr.splice(j, 1);
          lastValue = arr[j];
        }
      }
      if (lab.length > 1) {
        for (const l of lab) {
          const rank = arr.findIndex((g) => Math.abs(g - l.gr) <= EPS) + 1;
          label.set_text(l.lb, str.tostring(rank) + ' ' + (label.get_text(l.lb) ?? ''));
        }
      }
      // label.new() without a text colour: #363A45 in a v5 script
      if (cfg.showPP) {
        for (const list of [pivH, pivL]) {
          if (list.length === 0) throw new Error('Index 0 is out of bounds, array size is 0');
          for (const p of list) {
            label.new(p.b, p.p, '', 'bar_index', 'price', undefined, 'label_right', '#363A45', 'tiny');
            line.new(p.b, p.p, i + 8, p.p);
          }
        }
      }
    }

    // plots(pick, choice)
    picks.forEach(({ pick, choice }, g) => {
      if (!pick) return;
      const s = sets[choice - 1];
      if (s === undefined) throw new Error(`Index ${choice - 1} is out of bounds, array size is 9`);
      if (!s.pp) {
        plotValues[g * 11][i] = s.sBs[i];
      } else {
        for (let k = 0; k < 11; k++) plotValues[g * 11 + k][i] = s.arrPP[k];
      }
    });
  }
  setDrawingBar(null);

  const interval = barInterval(bars);
  const T = (index: number) => barTime(bars, index, interval);
  const col = (v: unknown) => (v === null || v === undefined || v === '' ? 'transparent' : String(v));
  const plots: Record<string, Array<{ time: number; value: number }>> = {};
  plotValues.forEach((vals, k) => {
    plots[`plot${k}`] = bars.map((b, i) => ({ time: b.time, value: Number.isFinite(vals[i]) ? vals[i] : NaN }));
  });
  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots,
    // an object with an na coordinate is not drawn
    lines: line.all().filter((l) => ![l.x1, l.x2, l.y1, l.y2].some((v) => Number.isNaN(v))).map((l) => ({
      time1: T(l.x1), price1: l.y1, time2: T(l.x2), price2: l.y2,
      ...(l.color === undefined ? {} : { color: col(l.color) }),
      ...(l.extend && l.extend !== 'none' ? { extend: l.extend } : {}),
    })),
    boxes: box.all().filter((x) => ![x.left, x.right, x.top, x.bottom].some((v) => Number.isNaN(v))).map((x) => ({
      time1: T(x.left), price1: x.top, time2: T(x.right), price2: x.bottom,
      bgColor: col(x.bgcolor), borderColor: col(x.border_color), extend: 'left' as const,
    })),
    labels: label.all().filter((l) => !Number.isNaN(l.x) && !Number.isNaN(l.y)).map((l) => ({
      time: T(l.x), price: l.y, text: l.text ?? '', style: l.style as LabelData['style'], size: l.size as LabelData['size'],
      ...(l.color === undefined ? {} : { color: col(l.color) }),
      ...(l.textcolor === undefined ? {} : { textColor: col(l.textcolor) }),
      ...(l.tooltip ? { tooltip: l.tooltip } : {}),
    })),
  };
}

export const SupportResistanceClassification = { calculate, metadata, defaultInputs, inputConfig, plotConfig };
