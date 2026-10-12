/**
 * Fibo Levels with Volume Profile and Targets [ChartPrime]
 *
 * Everything is drawn on the last bar, for the current week (the current month on daily and higher charts):
 * - Six Fibonacci levels from the previous bar of the "Fibo Timeframe": pivot PP = (H + L + C) / 3 of that bar (H and
 *   C raised and L lowered by a small band), then PP +- 0.382, 0.618 and 1 times the range H - L. Each level is a
 *   thin box from the start of the week (month) to one day after the last bar (three days on charts of 60 minutes
 *   and more).
 * - A volume profile between the lowest and the highest level, in "Volume Levels" rows: each close since the start
 *   of the week (month) is counted in its row, and the width of a row is that count. The colour goes from the bear
 *   colour (no close) to the bull colour (most closes). As in the original, the volume written in a row is not the
 *   volume of the counted bars: each counted close adds the volume of the bar `row index` bars back.
 * - "POC": a box on the row with the highest written volume.
 * - A target arrow and a "Possible Target" label: when up-bar volume is above down-bar volume the target is the
 *   +0.618 level (price above the middle) or the +0.382 level (below); else the -0.382 level (above) or the -0.618
 *   level (below).
 *
 * The band is half of min(0.3 * ATR(30), 0.3 % of the close) of 20 bars ago.
 *
 * Fibo Timeframe: the bars of that timeframe are built from the chart bars (periods from the UTC calendar and the
 * bars, see src/anchor-period.ts); the levels use the bar before the latest completed bar of that timeframe (every
 * chart bar is taken as a closed bar). A timeframe below the chart timeframe needs data that the bars do not carry:
 * the port throws an Error. Two limits of bars built from the chart bars: a period that does not start on a chart
 * bar (months on a weekly chart) is made of whole chart bars, and the close of a daily bar of a stock can differ
 * from the close of its last intraday bar; the levels then differ from the original.
 *
 * Chart values (third argument): the port reads the chart foreground colour (text of the "POC" box; without it:
 * #DBDBDB, a dark chart).
 *
 * Periods and the chart context (optional third argument of calculate): with the exchange time zone and the session
 * of the symbol (`timezone`, `session`) the periods are those of the exchange calendar (its trading days, holidays
 * and session hours), and a bar of a higher timeframe is complete on the chart bar whose close reaches the end of
 * its period, see src/anchor-period.ts.
 * Without them the port uses the UTC calendar and the bars, as described in this header. `timeframe`, when given,
 * is the chart timeframe; without it the chart timeframe is read from the bar spacing.
 *
 * Reference: "Fibo Levels with Volume Profile and Targets [ChartPrime]" by ChartPrime
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © ChartPrime
 */

import { ta, str, color, array, timeframe, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { BoxData, LabelData, LineDrawingData } from '../types';
import { barInterval, barTime } from '../bar-time';
import { chartTimeframe, higherTimeframeBars, periodChanges } from '../anchor-period';
import { foregroundColorOf, type ChartContext } from '../chart-context';

export interface FiboLevelsWithVolumeProfileAndTargetsInputs {
  /** Fibo Timeframe: a timeframe higher than the chart timeframe */
  time: string;
  /** Volume Type: the volume written in the profile rows */
  voldata: 'Bear' | 'Bull' | 'All';
  /** Volume Levels: number of rows of the profile */
  levs: number;
  /** Show Volume */
  showVolume: boolean;
  /** Profile colour of the row with the most closes */
  bull: string;
  /** Profile colour of a row without a close */
  bear: string;
  /** Show Levels */
  showlevels: boolean;
  /** Colour of the levels below the pivot */
  bull1: string;
  /** Colour of the levels above the pivot */
  bear1: string;
  /** Show Target */
  showTarget: boolean;
  /** Colour of an upward target */
  bull2: string;
  /** Colour of a downward target */
  bear2: string;
  /** Show POC */
  showPoc: boolean;
}

export const defaultInputs: FiboLevelsWithVolumeProfileAndTargetsInputs = {
  time: 'D',
  voldata: 'All',
  levs: 12,
  showVolume: true,
  bull: '#42F07FA6',
  bear: '#F374514D',
  showlevels: true,
  bull1: '#49F1F126',
  bear1: '#FF525226',
  showTarget: true,
  bull2: '#00E676',
  bear2: '#E60000',
  showPoc: true,
};

const CORE = '➞ Main Core Settings 🔸';
const VISUAL = '➞ Visuals Settings🔸';

export const inputConfig: InputConfig[] = [
  { id: 'time', type: 'timeframe', title: 'Fibo Timeframe', defval: 'D', options: ['120', '240', '480', '720', 'D', 'W', 'M'], group: CORE, tooltip: 'Choose a Higher Timeframe than Chart Timeframe' },
  { id: 'voldata', type: 'string', title: 'Volume Type', defval: 'All', options: ['Bear', 'Bull', 'All'], group: CORE, tooltip: 'Choose Volume Type to Show in Boxes' },
  { id: 'levs', type: 'int', title: 'Volume Levels', defval: 12, group: CORE, tooltip: 'Number of the Volume levels to check' },
  { id: 'showVolume', type: 'bool', title: 'Show Volume ❓  ', defval: true, inline: '01', group: VISUAL },
  { id: 'bull', type: 'color', title: '', defval: '#42F07FA6', inline: '01', group: VISUAL },
  { id: 'bear', type: 'color', title: '', defval: '#F374514D', inline: '01', group: VISUAL },
  { id: 'showlevels', type: 'bool', title: 'Show Levels ❓    ', defval: true, inline: '02', group: VISUAL },
  { id: 'bull1', type: 'color', title: '', defval: '#49F1F126', inline: '02', group: VISUAL },
  { id: 'bear1', type: 'color', title: '', defval: '#FF525226', inline: '02', group: VISUAL },
  { id: 'showTarget', type: 'bool', title: 'Show Target ❓    ', defval: true, inline: '03', group: VISUAL },
  { id: 'bull2', type: 'color', title: '', defval: '#00E676', inline: '03', group: VISUAL },
  { id: 'bear2', type: 'color', title: '', defval: '#E60000', inline: '03', group: VISUAL },
  { id: 'showPoc', type: 'bool', title: 'Show POC ❓    ', defval: true, inline: '04', group: VISUAL },
];

export const plotConfig: PlotConfig[] = [];

export const metadata = {
  title: 'Fibo Levels with Volume Profile [ChartPrime]',
  shortTitle: 'FIVP [ChartPrime]',
  overlay: true,
};

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;

/**
 * request.security(syminfo.tickerid, tf, ...) without lookahead: the bars of timeframe `tf` built from the chart
 * bars, and for each chart bar the index of the latest completed bar of that timeframe (-1: none yet).
 */
function timeframeBars(bars: Bar[], tf: string, context?: ChartContext): { htf: Bar[]; latest: number[] } {
  const chart = chartTimeframe(bars, context);
  if (tf.trim() === '' || chart === '' || timeframe.in_seconds(tf) === timeframe.in_seconds(chart)) {
    return { htf: bars, latest: bars.map((_b, i) => i) };
  }
  if (timeframe.in_seconds(tf) < timeframe.in_seconds(chart)) {
    throw new Error(`Fibo Levels with Volume Profile: the timeframe "${tf}" is lower than the chart timeframe "${chart}": the chart bars do not have that data`);
  }
  // The periods and the bars that complete them: the exchange calendar of the chart context (time zone and
  // session), else the UTC calendar rule; grouped and completed by the library (see anchor-period.ts)
  const { htf, latest } = higherTimeframeBars(bars, tf, context);
  return { htf, latest };
}

export function calculate(
  bars: Bar[],
  inputs: Partial<FiboLevelsWithVolumeProfileAndTargetsInputs> = {},
  chart?: ChartContext,
): IndicatorResult & { boxes: BoxData[]; lines: LineDrawingData[]; labels: LabelData[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const boxes: BoxData[] = [];
  const lines: LineDrawingData[] = [];
  const labels: LabelData[] = [];
  const result = () => ({
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {},
    boxes,
    lines,
    labels,
  });
  if (n === 0) return result();

  const last = n - 1;
  const levs = cfg.levs;
  const ms = bars[0].time >= 1e12;
  const interval = barInterval(bars);
  const tf = chartTimeframe(bars, chart);
  const tfInfo = timeframe.info(tf);

  // band = math.min(ta.atr(30) * 0.3, close * (0.3 / 100))[20] / 2
  const atr = ta.atr(bars, 30).toArray();
  const band = last >= 20 ? Math.min((atr[last - 20] ?? NaN) * 0.3, bars[last - 20].close * (0.3 / 100)) / 2 : NaN;

  // request.security(syminfo.tickerid, TIME, high[1] / low[1] / close[1]): the bar before the latest completed bar
  const { htf, latest } = timeframeBars(bars, cfg.time, chart);
  const k = latest[last] - 1;
  const FH = (k >= 0 ? htf[k].high : NaN) + band;
  const FL = (k >= 0 ? htf[k].low : NaN) - band;
  const FC = (k >= 0 ? htf[k].close : NaN) + band;

  // Start of the current week (month on daily and higher charts): timeframe.change(TF) is false on the first bar
  const changes = periodChanges(bars, tfInfo.isdwm ? 'M' : 'W', chart);
  let newWeekBarIndex = NaN;
  for (let i = last; i >= 1; i--) {
    if (changes[i]) {
      newWeekBarIndex = i;
      break;
    }
  }

  // TF2 = timeframe.multiplier < 60 ? "1D" : "3D"; EXTIME in the unit of the bar times
  const extSeconds = timeframe.in_seconds(tfInfo.multiplier < 60 ? '1D' : '3D');
  const EXTIME = ms ? extSeconds * 1000 : extSeconds;
  const anchorTime = bars[last].time + EXTIME;
  // anchorBarsBack = bar_index - (time - anchorTime) / (1000 * timeframe.in_seconds(timeframe.period))
  const anchorBarsBack = last + extSeconds / timeframe.in_seconds(tf);

  let BAR1 = Math.floor(last - newWeekBarIndex);
  if (BAR1 > 5000) BAR1 = 3500;

  const PP = (FH + FL + FC) / 3;
  const Fibo = [
    PP + 0.382 * (FH - FL), PP - 0.382 * (FH - FL), PP + 0.618 * (FH - FL), PP - 0.618 * (FH - FL),
    PP + (FH - FL), PP - (FH - FL),
  ];
  const FT = Fibo[4];
  const FB = Fibo[5];
  const step = (FT - FB) / levs;
  const VPlevels: number[] = [];
  for (let i = 0; i <= levs; i++) VPlevels.push(FB + step * i);

  // if barstate.islast
  const Points: number[] = new Array(levs).fill(0);
  const Volumes: number[] = new Array(levs).fill(0);
  const BUllV: number[] = new Array(levs).fill(0);
  const BEARV: number[] = new Array(levs).fill(0);
  const TotalVolume: number[] = [];
  const Greenvolume: number[] = [];
  const redvolume: number[] = [];
  const volumeBack = (back: number) => (last - back >= 0 ? bars[last - back].volume ?? NaN : NaN);
  // for i = 0 to BAR1: the closes since the start of the week (month)
  if (isNaN(BAR1)) throw new Error('Fibo Levels with Volume Profile: the bars have no start of a week (month on daily and higher charts)');
  const SCR: number[] = [];
  for (let i = 0; i <= BAR1; i++) SCR.push(bars[last - i].close);

  const xTime = (index: number) => (index <= last ? bars[Math.max(index, 0)].time : barTime(bars, index, interval));
  if (cfg.showlevels && !isNaN(newWeekBarIndex)) {
    for (let i = 0; i < Fibo.length; i++) {
      const upper = i === 0 || i === 2 || i === 4;
      const css = upper ? cfg.bear1 : cfg.bull1;
      const y1 = Fibo[i] + band / 2;
      const y2 = Fibo[i] - band / 2;
      if (isNaN(y1) || isNaN(y2)) continue;
      boxes.push({
        time1: bars[newWeekBarIndex].time, price1: y1, time2: anchorTime, price2: y2,
        bgColor: css, borderColor: String(color.new(css, 60)), borderWidth: 1,
      });
    }
  }

  for (let i = 0; i < SCR.length; i++) {
    const open = bars[last - i].open;
    for (let x = 0; x <= VPlevels.length - 2; x++) {
      if (gt(SCR[i], VPlevels[x]) && lt(SCR[i], VPlevels[x + 1])) {
        Points[x] += 1;
        // as in the original: the volume of the bar x bars back (the row index), not of bar i
        Volumes[x] += volumeBack(x);
        if (gt(SCR[i], open)) BUllV[x] += volumeBack(x);
        if (lt(SCR[i], open)) BEARV[x] += volumeBack(x);
        break;
      }
    }
    if (gt(SCR[i], open)) Greenvolume.push(volumeBack(i));
    if (lt(SCR[i], open)) redvolume.push(volumeBack(i));
    TotalVolume.push(volumeBack(i));
  }
  const total = array.sum(TotalVolume);
  const GR = array.sum(Greenvolume) / total;
  const RR = array.sum(redvolume) / total;

  if (cfg.showVolume) {
    const maxPoints = array.max(Points);
    for (let i = 0; i < Points.length; i++) {
      const shown = cfg.voldata === 'All' ? Volumes[i] : cfg.voldata === 'Bear' ? BEARV[i] : BUllV[i];
      const css = String(color.from_gradient(Points[i], 0, maxPoints, cfg.bear, cfg.bull));
      const y1 = VPlevels[i + 1] + band / 2;
      const y2 = VPlevels[i] + band / 2;
      if (isNaN(y1) || isNaN(y2)) continue;
      boxes.push({
        time1: xTime(Math.trunc(anchorBarsBack - Points[i])), price1: y1, time2: xTime(Math.trunc(anchorBarsBack)), price2: y2,
        borderColor: css, bgColor: css, text: str.tostring(shown, 'volume'), textColor: '#FFFFFF',
      });
    }
  }

  if (cfg.showPoc && !isNaN(newWeekBarIndex)) {
    const MaxVID = array.indexof(Volumes, array.max(Volumes));
    if (MaxVID < 0) throw new Error(`Index ${MaxVID} is out of bounds, array size is ${VPlevels.length}`);
    const y1 = VPlevels[MaxVID] + band / 2;
    const y2 = VPlevels[MaxVID + 1] + band / 2;
    if (!isNaN(y1) && !isNaN(y2)) {
      boxes.push({
        time1: bars[newWeekBarIndex].time, price1: y1, time2: anchorTime, price2: y2,
        borderColor: '#E0F2E93A', borderStyle: 'solid', bgColor: String(color.new('#586161', 75)),
        text: 'POC', textColor: foregroundColorOf(chart), textHAlign: 'center', textVAlign: 'center',
      });
    }
  }

  const scr = bars[last].close;
  const MID = (FB + FT) / 2;
  if (lt(scr, FT) && gt(scr, FB) && cfg.showTarget) {
    const up = gt(GR, RR);
    const css = up ? cfg.bull2 : cfg.bear2;
    const target = gt(scr, MID) ? Fibo[up ? 2 : 1] : lt(scr, MID) ? Fibo[up ? 0 : 3] : NaN;
    const hl2Prev = last >= 1 ? (bars[last - 1].high + bars[last - 1].low) / 2 : NaN;
    if (!isNaN(target)) {
      if (!isNaN(hl2Prev)) {
        lines.push({
          time1: xTime(last + 3), price1: hl2Prev, time2: xTime(last + 10), price2: target,
          color: css, style: 'arrow_right', width: 1,
        });
      }
      labels.push({
        time: xTime(last + 10), price: target, text: 'Possible Target ', style: 'label_lower_left',
        color: String(color.new(css, 70)), textColor: '#FFFFFF', size: 'small',
      });
    }
  }

  return result();
}

export const FiboLevelsWithVolumeProfileAndTargets = { calculate, metadata, defaultInputs, inputConfig, plotConfig };
