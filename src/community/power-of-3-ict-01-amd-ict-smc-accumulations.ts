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

import {
  box, label, color, time as pineTime, timeframe, resetDrawings, setDrawingBar, varDrawing, type Box, type Label,
  type IndicatorResult, type InputConfig, type PlotConfig, type Bar,
} from 'oakscriptjs';
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
  // bar size for the clock-change rule of the session test (intraday bars)
  const barMs = period !== '' && timeframe.info(period).isintraday ? timeframe.in_seconds(period) * 1000 : undefined;

  // Drawings in the registry of the library: limits of the script, the latest box and label of each session held by
  // their `var` variables
  resetDrawings({ box: MAX_OBJECTS, label: MAX_OBJECTS });

  /** LowHighDetector(On, Color, Text) */
  const detector = (session: string, css: string, text: string) => {
    const bg = String(color.new(css, 85));
    let bar = 0;
    let high = 0;
    let low = 0;
    const sessionBox = varDrawing<Box>();
    const sessionLabel = varDrawing<Label>();
    let prevOn = NaN; // On[1] is na on the first bar

    return (i: number) => {
      // math.sign(nz(time(timeframe.period, session, "America/New_York")))
      const on = pineTime.inSession(bars[i].time * unit, session, TIMEZONE, barMs) ? 1 : 0;
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
        sessionBox.value = box.new(i, high, i, low, BLUE, undefined, 'dotted', undefined, 'bar_index', bg);
        // int(math.avg(Bar, bar_index))
        sessionLabel.value = label.new(Math.trunc((bar + i) / 2), high, text, 'bar_index');
      }
      if (prevOn === 1 || on === 1) {
        // the setters do nothing on a deleted object
        if (sessionBox.value) {
          box.set_top(sessionBox.value, high);
          box.set_bottom(sessionBox.value, low);
          box.set_right(sessionBox.value, i);
        }
        if (sessionLabel.value) {
          // math.round(math.avg(Bar, bar_index)): a half rounds up
          label.set_x(sessionLabel.value, Math.floor((bar + i) / 2 + 0.5));
          label.set_y(sessionLabel.value, high);
        }
      }
      prevOn = on;
    };
  };

  const steps: Array<(i: number) => void> = [];
  if (cfg.showAccumulation) steps.push(detector(cfg.accumulationSes, cfg.accumulationColor, 'Accumulation'));
  if (cfg.showManipulation) steps.push(detector(cfg.manipulationSes, cfg.manipulationColor, 'Manipulation'));
  if (cfg.showDistribution) steps.push(detector(cfg.distributionSes, cfg.distributionColor, 'Distribution'));
  for (let i = 0; i < n; i++) {
    setDrawingBar(i, i === n - 1);
    for (const step of steps) step(i);
  }
  setDrawingBar(null);

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {},
    boxes: box.all().map((b) => ({
      time1: bars[b.left].time, price1: b.top, time2: bars[b.right].time, price2: b.bottom, bgColor: String(b.bgcolor),
      borderColor: BLUE, borderStyle: 'dotted' as const,
    })),
    labels: label.all().map((l) => ({
      time: bars[l.x].time, price: l.y, text: l.text ?? '', color: NO_BACKGROUND, textColor: BLUE, style: 'label_down' as const,
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
