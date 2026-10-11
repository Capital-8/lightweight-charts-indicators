/**
 * Power Of 3 ICT 01 [TradingFinder] AMD ICT & SMC Accumulations
 *
 * Three sessions of the New York day: accumulation (19:00 to 01:00), manipulation (01:00 to 07:00) and distribution
 * (07:00 to 13:00), each read in the "America/New_York" time zone. On charts of 60 minutes or less, each session
 * gets a box from its first bar to the bar after its last bar, between the highest high and the lowest low of these
 * bars, and a label with its name above the middle of the box. The 500 latest boxes and labels are kept.
 *
 * As in the original, a session that is already running on the first bar of the chart has no box, and its low
 * starts at 0.
 *
 * The chart timeframe is `chart.timeframe` of the optional third argument; without it, it is read from the bar
 * spacing.
 *
 * Reference: "Power Of 3 ICT 01 [TradingFinder] AMD ICT & SMC Accumulations" by TradingFinder
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © TFlab
 */

import { color, time as pineTime, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import { chartTimeframe } from '../anchor-period';
import type { BoxData, LabelData } from '../types';
import type { ChartContext } from '../chart-context';

export interface PowerOf3Ict01AmdIctSmcAccumulationsInputs {
  showAccumulation: boolean;
  accumulationSes: string;
  accumulationColor: string;
  showManipulation: boolean;
  manipulationSes: string;
  manipulationColor: string;
  showDistribution: boolean;
  distributionSes: string;
  distributionColor: string;
}

export const defaultInputs: PowerOf3Ict01AmdIctSmcAccumulationsInputs = {
  showAccumulation: true,
  accumulationSes: '1900-0100',
  accumulationColor: '#8bbcfc',
  showManipulation: true,
  manipulationSes: '0100-0700',
  manipulationColor: '#F0B884',
  showDistribution: true,
  distributionSes: '0700-1300',
  distributionColor: '#0CC1C0',
};

export const inputConfig: InputConfig[] = [
  { id: 'showAccumulation', type: 'bool', title: 'Accumulation ', defval: true, group: 'Accumulation ' },
  { id: 'accumulationSes', type: 'session', title: '', defval: '1900-0100', inline: 'Accumulation', group: 'Accumulation ' },
  { id: 'accumulationColor', type: 'color', title: 'Color', defval: '#8bbcfc', inline: 'Accumulation', group: 'Accumulation ' },
  { id: 'showManipulation', type: 'bool', title: 'Manipulation ', defval: true, group: 'Manipulation ' },
  { id: 'manipulationSes', type: 'session', title: '', defval: '0100-0700', inline: 'Manipulation', group: 'Manipulation ' },
  { id: 'manipulationColor', type: 'color', title: 'Color', defval: '#F0B884', inline: 'Manipulation', group: 'Manipulation ' },
  { id: 'showDistribution', type: 'bool', title: 'Distribution ', defval: true, group: 'Distribution ' },
  { id: 'distributionSes', type: 'session', title: '', defval: '0700-1300', inline: 'Distribution', group: 'Distribution ' },
  { id: 'distributionColor', type: 'color', title: 'Color', defval: '#0CC1C0', inline: 'Distribution', group: 'Distribution ' },
];

export const plotConfig: PlotConfig[] = [];

export const metadata = {
  title: 'Power Of 3 ICT 01 [TradingFinder] AMD ICT & SMC Accumulations',
  shortTitle: 'TFlab AMD',
  overlay: true,
};

/** indicator(max_boxes_count = 500, max_labels_count = 500) */
const MAX_OBJECTS = 500;
const TIMEZONE = 'America/New_York';
/** color.rgb(34, 101, 155): box border and label text */
const BLUE = String(color.rgb(34, 101, 155));
/** color.rgb(255, 255, 255, 100): label background */
const NO_BACKGROUND = String(color.rgb(255, 255, 255, 100));

interface Bx { left: number; top: number; right: number; bottom: number; bg: string; deleted: boolean }
interface Lb { x: number; y: number; text: string; deleted: boolean }

export function calculate(
  bars: Bar[],
  inputs: Partial<PowerOf3Ict01AmdIctSmcAccumulationsInputs> = {},
  chart?: ChartContext,
): IndicatorResult & { boxes: BoxData[]; labels: LabelData[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  // str.tonumber(timeframe.period) <= 60: minutes only ("D", "W", "30S" are not numbers)
  const period = chartTimeframe(bars, chart);
  const drawn = /^\d+$/.test(period) && Number(period) <= 60;
  const unit = n > 0 && bars[0].time >= 1e12 ? 1 : 1000;

  // Live drawings in creation order: when a creation brings the count above max + 5, the oldest are deleted until
  // max remain. An object held by a `var` variable of the script is never deleted by this limit, but it counts.
  const held = new Set<object>();
  const limit = <T extends { deleted: boolean }>(list: T[]) => {
    if (list.length <= MAX_OBJECTS + 5) return;
    for (let k = 0; k < list.length && list.length > MAX_OBJECTS; ) {
      if (held.has(list[k])) k++;
      else list.splice(k, 1)[0].deleted = true;
    }
  };
  const hold = <T extends object>(before: T | null, now: T): T => {
    if (before) held.delete(before);
    held.add(now);
    return now;
  };
  const boxes: Bx[] = [];
  const labels: Lb[] = [];

  /** LowHighDetector(On, Color, Text) */
  const detector = (session: string, css: string, text: string) => {
    const bg = String(color.new(css, 85));
    let bar = 0;
    let high = 0;
    let low = 0;
    let box: Bx | null = null;
    let label: Lb | null = null;
    let prevOn = NaN; // On[1] is na on the first bar

    return (i: number) => {
      // math.sign(nz(time(timeframe.period, session, "America/New_York")))
      const on = pineTime.inSession(bars[i].time * unit, session, TIMEZONE) ? 1 : 0;
      const b = bars[i];
      if (prevOn === 0 && on === 1) {
        bar = i;
        high = b.high;
        low = b.low;
      } else if (prevOn === 1 || on === 1) {
        high = Math.max(b.high, high);
        low = Math.min(b.low, low);
      }

      if (on > prevOn && drawn) {
        const bx: Bx = { left: i, top: high, right: i, bottom: low, bg, deleted: false };
        boxes.push(bx);
        box = hold(box, bx);
        limit(boxes);
        // int(math.avg(Bar, bar_index))
        const lb: Lb = { x: Math.trunc((bar + i) / 2), y: high, text, deleted: false };
        labels.push(lb);
        label = hold(label, lb);
        limit(labels);
      }
      if (prevOn === 1 || on === 1) {
        if (box && !box.deleted) {
          box.top = high;
          box.bottom = low;
          box.right = i;
        }
        if (label && !label.deleted) {
          // math.round(math.avg(Bar, bar_index)): a half rounds up
          label.x = Math.floor((bar + i) / 2 + 0.5);
          label.y = high;
        }
      }
      prevOn = on;
    };
  };

  const steps: Array<(i: number) => void> = [];
  if (cfg.showAccumulation) steps.push(detector(cfg.accumulationSes, cfg.accumulationColor, 'Accumulation'));
  if (cfg.showManipulation) steps.push(detector(cfg.manipulationSes, cfg.manipulationColor, 'Manipulation'));
  if (cfg.showDistribution) steps.push(detector(cfg.distributionSes, cfg.distributionColor, 'Distribution'));
  for (let i = 0; i < n; i++) for (const step of steps) step(i);

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {},
    boxes: boxes.map((b) => ({
      time1: bars[b.left].time, price1: b.top, time2: bars[b.right].time, price2: b.bottom, bgColor: b.bg,
      borderColor: BLUE, borderStyle: 'dotted' as const,
    })),
    labels: labels.map((l) => ({
      time: bars[l.x].time, price: l.y, text: l.text, color: NO_BACKGROUND, textColor: BLUE, style: 'label_down' as const,
      size: 'normal' as const,
    })),
  };
}

export const PowerOf3Ict01AmdIctSmcAccumulations = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
};
