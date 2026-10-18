/**
 * ICT Killzones [LuxAlgo]
 *
 * Highlights four intraday sessions ("killzones", hours of the fixed time zone UTC-5): New York 07:00-09:00, London
 * Open 02:00-05:00, London Close 10:00-12:00 and Asian 20:00-00:00. A bar is in a killzone when it opens inside it
 * (PineScript `time(timeframe.period, session, "UTC-5")`). Each killzone gets a background colour and a label with
 * its name at the highest high of the zone, placed at the middle time of the zone (a time between two bars is drawn
 * on the next bar, as the original: the port gives the time of that bar).
 *
 * Retracements: when a bar opens a run of killzone bars (any of the four), seven levels are drawn between the high
 * and the low of the run (0, 0.236, 0.382, 0.5, 0.618, 0.782 and 1 by default, from the low; "Reverse" counts
 * from the high). They grow with the run, and with "Extend" they follow the bars until the next run starts. A level
 * that is switched off is not drawn. At most 500 lines and 500 labels are kept.
 *
 * Reference: "ICT Killzones [LuxAlgo]" by LuxAlgo
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © LuxAlgo
 */

import {
  color, line, label, time as pineTime, resetDrawings, setDrawingBar, varDrawing, drawingOutputs, barInterval,
  type Label, type Line, type IndicatorResult, type InputConfig, type PlotConfig, type Bar,
} from 'oakscriptjs';
import type { BgColorData, LabelData, LineDrawingData } from '../types';

export interface IctKillzonesInputs {
  showNy: boolean;
  nyCss: string;
  showLdno: boolean;
  ldnoCss: string;
  showLdnc: boolean;
  ldncCss: string;
  showAsia: boolean;
  asiaCss: string;
  showFibs: boolean;
  extend: boolean;
  reverse: boolean;
  fib0: boolean;
  fib0Value: number;
  fib0Css: string;
  fib236: boolean;
  fib236Value: number;
  fib236Css: string;
  fib382: boolean;
  fib382Value: number;
  fib382Css: string;
  fib5: boolean;
  fib5Value: number;
  fib5Css: string;
  fib618: boolean;
  fib618Value: number;
  fib618Css: string;
  fib782: boolean;
  fib782Value: number;
  fib782Css: string;
  fib1: boolean;
  fib1Value: number;
  fib1Css: string;
}

export const defaultInputs: IctKillzonesInputs = {
  showNy: true,
  nyCss: 'rgba(255, 93, 0, 0.2)',
  showLdno: true,
  ldnoCss: 'rgba(0, 188, 212, 0.2)',
  showLdnc: true,
  ldncCss: 'rgba(33, 87, 243, 0.2)',
  showAsia: true,
  asiaCss: 'rgba(233, 30, 99, 0.2)',
  showFibs: true,
  extend: true,
  reverse: false,
  fib0: true,
  fib0Value: 0,
  fib0Css: '#787B86',
  fib236: true,
  fib236Value: 0.236,
  fib236Css: '#FFEB3B',
  fib382: true,
  fib382Value: 0.382,
  fib382Css: '#E040FB',
  fib5: true,
  fib5Value: 0.5,
  fib5Css: '#FF9800',
  fib618: true,
  fib618Value: 0.618,
  fib618Css: '#2962FF',
  fib782: true,
  fib782Value: 0.782,
  fib782Css: '#4CAF50',
  fib1: true,
  fib1Value: 1,
  fib1Css: '#787B86',
};

const KZ = 'Killzones';
const RET = 'Killzones Retracements';

export const inputConfig: InputConfig[] = [
  { id: 'showNy', type: 'bool', title: 'New York', defval: true, inline: 'ny', group: KZ },
  { id: 'nyCss', type: 'color', title: '', defval: defaultInputs.nyCss, inline: 'ny', group: KZ },
  { id: 'showLdno', type: 'bool', title: 'London Open', defval: true, inline: 'ldno', group: KZ },
  { id: 'ldnoCss', type: 'color', title: '', defval: defaultInputs.ldnoCss, inline: 'ldno', group: KZ },
  { id: 'showLdnc', type: 'bool', title: 'London Close', defval: true, inline: 'ldnc', group: KZ },
  { id: 'ldncCss', type: 'color', title: '', defval: defaultInputs.ldncCss, inline: 'ldnc', group: KZ },
  { id: 'showAsia', type: 'bool', title: 'Asian', defval: true, inline: 'asia', group: KZ },
  { id: 'asiaCss', type: 'color', title: '', defval: defaultInputs.asiaCss, inline: 'asia', group: KZ },
  { id: 'showFibs', type: 'bool', title: 'Show Retracements', defval: true, group: RET },
  { id: 'extend', type: 'bool', title: 'Extend', defval: true, group: RET },
  { id: 'reverse', type: 'bool', title: 'Reverse', defval: false, group: RET },
  { id: 'fib0', type: 'bool', title: '', defval: true, inline: '0', group: RET },
  { id: 'fib0Value', type: 'float', title: '', defval: 0, inline: '0', group: RET },
  { id: 'fib0Css', type: 'color', title: '', defval: '#787B86', inline: '0', group: RET },
  { id: 'fib236', type: 'bool', title: '', defval: true, inline: '0', group: RET },
  { id: 'fib236Value', type: 'float', title: '', defval: 0.236, inline: '0', group: RET },
  { id: 'fib236Css', type: 'color', title: '', defval: '#FFEB3B', inline: '0', group: RET },
  { id: 'fib382', type: 'bool', title: '', defval: true, inline: '382', group: RET },
  { id: 'fib382Value', type: 'float', title: '', defval: 0.382, inline: '382', group: RET },
  { id: 'fib382Css', type: 'color', title: '', defval: '#E040FB', inline: '382', group: RET },
  { id: 'fib5', type: 'bool', title: '', defval: true, inline: '382', group: RET },
  { id: 'fib5Value', type: 'float', title: '', defval: 0.5, inline: '382', group: RET },
  { id: 'fib5Css', type: 'color', title: '', defval: '#FF9800', inline: '382', group: RET },
  { id: 'fib618', type: 'bool', title: '', defval: true, inline: '618', group: RET },
  { id: 'fib618Value', type: 'float', title: '', defval: 0.618, inline: '618', group: RET },
  { id: 'fib618Css', type: 'color', title: '', defval: '#2962FF', inline: '618', group: RET },
  { id: 'fib782', type: 'bool', title: '', defval: true, inline: '618', group: RET },
  { id: 'fib782Value', type: 'float', title: '', defval: 0.782, inline: '618', group: RET },
  { id: 'fib782Css', type: 'color', title: '', defval: '#4CAF50', inline: '618', group: RET },
  { id: 'fib1', type: 'bool', title: '', defval: true, inline: '1', group: RET },
  { id: 'fib1Value', type: 'float', title: '', defval: 1, inline: '1', group: RET },
  { id: 'fib1Css', type: 'color', title: '', defval: '#787B86', inline: '1', group: RET },
];

export const plotConfig: PlotConfig[] = [];

export const metadata = {
  title: 'ICT Killzones [LuxAlgo]',
  shortTitle: 'ICT Killzones [LuxAlgo]',
  overlay: true,
};

/** indicator(max_lines_count = 500, max_labels_count = 500) */
const MAX_OBJECTS = 500;
/** Time zone of the killzone sessions */
const TZ = 'UTC-5';

export function calculate(bars: Bar[], inputs: Partial<IctKillzonesInputs> = {}): IndicatorResult & {
  bgColors: BgColorData[]; labels: LabelData[]; lines: LineDrawingData[];
} {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  // bar times in ms (the unit of PineScript `time`)
  const ms = n > 0 && bars[0].time >= 1e12;
  const tMs = bars.map((b) => (ms ? b.time : b.time * 1000));
  const barMs = n > 1 ? barInterval(bars) * (ms ? 1 : 1000) : undefined;
  const inKz = (i: number, session: string) => pineTime.inSession(tMs[i], session, TZ, barMs);

  resetDrawings({ line: MAX_OBJECTS, label: MAX_OBJECTS });

  // fib_values(): `var fibs = array.from(...)`, an na value for a level that is off
  const fibs = [
    cfg.fib0 ? cfg.fib0Value : NaN, cfg.fib236 ? cfg.fib236Value : NaN, cfg.fib382 ? cfg.fib382Value : NaN,
    cfg.fib5 ? cfg.fib5Value : NaN, cfg.fib618 ? cfg.fib618Value : NaN, cfg.fib782 ? cfg.fib782Value : NaN,
    cfg.fib1 ? cfg.fib1Value : NaN,
  ];
  const fibCss = [cfg.fib0Css, cfg.fib236Css, cfg.fib382Css, cfg.fib5Css, cfg.fib618Css, cfg.fib782Css, cfg.fib1Css];
  // avg(val, max, min)
  const avg = (val: number, max: number, min: number) =>
    cfg.reverse ? val * min + (1 - val) * max : val * max + (1 - val) * min;

  // display_retracements(session): `var lines` (a var array: its lines are not held), `var float max / min`
  let lines: Line[] = [];
  let rMax = NaN;
  let rMin = NaN;
  let rPrev = false;
  const displayRetracements = (i: number, session: boolean) => {
    const b = bars[i];
    if (session && !rPrev) {
      rMax = b.high;
      rMin = b.low;
      lines = fibCss.map((c) => line.new(i, NaN, NaN, NaN, 'bar_index', 'none', c));
    }
    if (session || cfg.extend) {
      if (session) {
        rMax = Math.max(b.high, rMax);
        rMin = Math.min(b.low, rMin);
      }
      lines.forEach((lvl, k) => {
        const y = avg(fibs[k], rMax, rMin);
        line.set_y1(lvl, y);
        line.set_xy2(lvl, i, y);
      });
    }
    rPrev = session;
  };

  // labels(session, css, txt): one call site per killzone, each with its `var label lbl`, `var float max`,
  // `var int anchor`
  const labels = (css: string, txt: string) => {
    const lbl = varDrawing<Label>();
    let max = NaN;
    let anchor = NaN;
    let prev = false;
    const c = color.rgb(color.r(css), color.g(css), color.b(css));
    return (i: number, session: boolean) => {
      const b = bars[i];
      if (session && !prev) {
        max = b.high;
        anchor = tMs[i];
        lbl.value = label.new(anchor, max, txt, 'bar_time', 'price', '#FFFFFF00', 'label_down', c, 'small');
      }
      if (session && lbl.value) {
        max = Math.max(b.high, max);
        label.set_x(lbl.value, Math.trunc((tMs[i] + anchor) / 2));
        label.set_y(lbl.value, max);
      }
      prev = session;
    };
  };
  const nyLabel = labels(cfg.nyCss, 'New York');
  const ldnoLabel = labels(cfg.ldnoCss, 'London Open');
  const ldncLabel = labels(cfg.ldncCss, 'London Close');
  const asiaLabel = labels(cfg.asiaCss, 'Asian');

  const bgColors: BgColorData[] = [];
  for (let i = 0; i < n; i++) {
    setDrawingBar(i, i === n - 1);
    const ny = cfg.showNy && inKz(i, '0700-0900');
    const ldnOpen = cfg.showLdno && inKz(i, '0200-0500');
    const ldnClose = cfg.showLdnc && inKz(i, '1000-1200');
    const asian = cfg.showAsia && inKz(i, '2000-0000');

    if (cfg.showFibs) displayRetracements(i, ldnOpen || ldnClose || ny || asian);

    nyLabel(i, ny);
    ldnoLabel(i, ldnOpen);
    ldncLabel(i, ldnClose);
    asiaLabel(i, asian);

    // four bgcolor() calls, in this order (the later one on top); ids bgcolor0..bgcolor3
    const t = bars[i].time;
    if (ny) bgColors.push({ time: t, color: cfg.nyCss, id: 'bgcolor0' });
    if (ldnOpen) bgColors.push({ time: t, color: cfg.ldnoCss, id: 'bgcolor1' });
    if (ldnClose) bgColors.push({ time: t, color: cfg.ldncCss, id: 'bgcolor2' });
    if (asian) bgColors.push({ time: t, color: cfg.asiaCss, id: 'bgcolor3' });
  }
  setDrawingBar(null);

  const out = drawingOutputs(bars, ms ? 'ms' : 's');
  // A label time between two bars is drawn on the next bar: give it the time of that bar
  const atOrAfter = (time: number) => {
    let lo = 0;
    let hi = n - 1;
    if (n === 0 || time > bars[n - 1].time) return time;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (bars[mid].time >= time) hi = mid;
      else lo = mid + 1;
    }
    return bars[lo].time;
  };

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {},
    bgColors,
    lines: out.lines ?? [],
    labels: (out.labels ?? []).map((l) => ({ ...l, time: atOrAfter(l.time) })),
  };
}

export const IctKillzones = { calculate, metadata, defaultInputs, inputConfig, plotConfig };
