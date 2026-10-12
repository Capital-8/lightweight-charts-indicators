/**
 * ICT Seek & Destroy Profile [TFO]
 *
 * Three sessions in New York time: Asia (2000-0300), London (0300-0830) and New York (0830-1600). Each session is
 * drawn as a box from its first bar, growing with the high and the low of its bars. When a session ends its high,
 * low and last close are kept, and the New York range (high - low) is added to a list.
 *
 * "Potential S&D Day" (a label at the London high): London ended after Asia and took both sides of the Asian range.
 * "Valid S&D Day" (a label at the New York high): New York ended after London, after a warning of the same day, and
 * met one of the selected criteria: the New York range inside the London range, outside it on both sides, the New
 * York close inside it, or the New York range not above its standard deviation (population, over all New York
 * sessions) times the factor. A table on the last bar gives the session count, the warnings, the successes and the
 * success rate; during a warning (until the next New York session ends) its title cell shows the warning message.
 *
 * The session test is the bar open time in the session, as `time(timeframe.period, session, "America/New_York")`.
 *
 * Reference: "ICT Seek & Destroy Profile [TFO]" by tradeforopp
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © tradeforopp
 */

import {
  timeframe, time as pineTime, box, label, table, resetDrawings, setDrawingBar, varDrawing, drawingOutputs,
  type Box, type IndicatorResult, type InputConfig, type PlotConfig, type Bar,
} from 'oakscriptjs';
import { chartTimeframe } from '../anchor-period';
import type { ChartContext } from '../chart-context';

type TablePositionName = 'Bottom Center' | 'Bottom Left' | 'Bottom Right' | 'Middle Center' | 'Middle Left'
  | 'Middle Right' | 'Top Center' | 'Top Left' | 'Top Right';

export interface IctSeekDestroyProfileInputs {
  /** Asia session (New York time) */
  as_am: string;
  askz_color: string;
  /** London session (New York time) */
  lo_am: string;
  ldkz_color: string;
  /** New York session (New York time) */
  ny_am: string;
  nykz_color: string;
  crt_inside_day: boolean;
  crt_outside_day: boolean;
  crt_close_in_lo: boolean;
  crt_sd_limit: boolean;
  sd_limit: number;
  show_snd_pre: boolean;
  snd_pre_color: string;
  show_snd_day: boolean;
  snd_day_color: string;
  show_wrn_table: boolean;
  wrn_msg: string;
  wrn_text: string;
  wrn_bg: string;
  show_stat_table: boolean;
  table_position: TablePositionName;
  table_size: 'Auto' | 'Tiny' | 'Small' | 'Normal' | 'Large' | 'Huge';
  table_text: string;
  table_bg: string;
  table_frame: string;
  table_border: string;
  table_border_width: number;
  table_frame_width: number;
}

export const defaultInputs: IctSeekDestroyProfileInputs = {
  as_am: '2000-0300',
  askz_color: 'rgba(41, 98, 255, 0.2)',
  lo_am: '0300-0830',
  ldkz_color: 'rgba(255, 235, 59, 0.2)',
  ny_am: '0830-1600',
  nykz_color: 'rgba(76, 175, 80, 0.2)',
  crt_inside_day: true,
  crt_outside_day: true,
  crt_close_in_lo: true,
  crt_sd_limit: true,
  sd_limit: 1.0,
  show_snd_pre: true,
  snd_pre_color: '#F23645',
  show_snd_day: true,
  snd_day_color: '#089981',
  show_wrn_table: true,
  wrn_msg: 'Potential S&D Day',
  wrn_text: '#FFFFFF',
  wrn_bg: '#F23645',
  show_stat_table: true,
  table_position: 'Top Right',
  table_size: 'Auto',
  table_text: '#363A45',
  table_bg: '#FFFFFF',
  table_frame: '#363A45',
  table_border: '#363A45',
  table_border_width: 1,
  table_frame_width: 2,
};

const G_KZS = 'Killzones';
const G_CRT = 'Success Criteria';
const G_SND = 'Labels';
const G_WRN = 'Warning';
const G_STY = 'Statistics';

export const inputConfig: InputConfig[] = [
  { id: 'as_am', type: 'session', title: 'Asia', defval: '2000-0300', inline: 'ASKZ', group: G_KZS },
  { id: 'askz_color', type: 'color', title: '', defval: 'rgba(41, 98, 255, 0.2)', inline: 'ASKZ', group: G_KZS },
  { id: 'lo_am', type: 'session', title: 'London', defval: '0300-0830', inline: 'LOKZ', group: G_KZS },
  { id: 'ldkz_color', type: 'color', title: '', defval: 'rgba(255, 235, 59, 0.2)', inline: 'LOKZ', group: G_KZS },
  { id: 'ny_am', type: 'session', title: 'New York', defval: '0830-1600', inline: 'NYKZ', group: G_KZS },
  { id: 'nykz_color', type: 'color', title: '', defval: 'rgba(76, 175, 80, 0.2)', inline: 'NYKZ', group: G_KZS },
  { id: 'crt_inside_day', type: 'bool', title: 'NY Stays Within London Range', defval: true, group: G_CRT, tooltip: 'The New York range is contained within the London range' },
  { id: 'crt_outside_day', type: 'bool', title: 'NY Exceeds London High & Low', defval: true, group: G_CRT, tooltip: 'The New York range exceeds both the high and low of the London range' },
  { id: 'crt_close_in_lo', type: 'bool', title: 'NY Closes Within London Range', defval: true, group: G_CRT, tooltip: 'The New York range closes within the London range' },
  { id: 'crt_sd_limit', type: 'bool', title: 'NY Range Too Small', defval: true, inline: 'SD', group: G_CRT, tooltip: 'The New York range will be compared to the standard deviation of its historical ranges, multiplied by this factor' },
  { id: 'sd_limit', type: 'float', title: '', defval: 1.0, inline: 'SD', group: G_CRT },
  { id: 'show_snd_pre', type: 'bool', title: 'Potential S&D Day', defval: true, inline: 'PRE', group: G_SND, tooltip: 'If London took both sides of the Asian range, this label will be generated' },
  { id: 'snd_pre_color', type: 'color', title: '', defval: '#F23645', inline: 'PRE', group: G_SND },
  { id: 'show_snd_day', type: 'bool', title: 'Successful S&D Day', defval: true, inline: 'POST', group: G_SND, tooltip: 'If New York met any of the selected success criteria, this label will populate' },
  { id: 'snd_day_color', type: 'color', title: '', defval: '#089981', inline: 'POST', group: G_SND },
  { id: 'show_wrn_table', type: 'bool', title: 'Show Warning', defval: true, group: G_WRN, tooltip: 'Display the custom warning message when it is a potential S&D day (for the duration of the NY session)' },
  { id: 'wrn_msg', type: 'string', title: 'Warning Message', defval: 'Potential S&D Day', group: G_WRN },
  { id: 'wrn_text', type: 'color', title: 'Text Color', defval: '#FFFFFF', group: G_WRN },
  { id: 'wrn_bg', type: 'color', title: 'Table Background', defval: '#F23645', group: G_WRN },
  { id: 'show_stat_table', type: 'bool', title: 'Show Statistics Table', defval: true, group: G_STY },
  {
    id: 'table_position', type: 'string', title: 'Table Position', defval: 'Top Right', group: G_STY,
    options: ['Bottom Center', 'Bottom Left', 'Bottom Right', 'Middle Center', 'Middle Left', 'Middle Right', 'Top Center', 'Top Left', 'Top Right'],
  },
  { id: 'table_size', type: 'string', title: 'Text Size', defval: 'Auto', options: ['Auto', 'Tiny', 'Small', 'Normal', 'Large', 'Huge'], group: G_STY },
  { id: 'table_text', type: 'color', title: 'Text', defval: '#363A45', group: G_STY },
  { id: 'table_bg', type: 'color', title: 'Table Background', defval: '#FFFFFF', group: G_STY },
  { id: 'table_frame', type: 'color', title: 'Table Frame', defval: '#363A45', group: G_STY },
  { id: 'table_border', type: 'color', title: 'Table Border', defval: '#363A45', group: G_STY },
  { id: 'table_border_width', type: 'int', title: 'Table Border Width', defval: 1, group: G_STY },
  { id: 'table_frame_width', type: 'int', title: 'Table Frame Width', defval: 2, group: G_STY },
];

export const plotConfig: PlotConfig[] = [];

export const metadata = {
  title: 'ICT Seek & Destroy Profile [TFO]',
  shortTitle: 'S&D Profile [TFO]',
  overlay: true,
};

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const ge = (a: number, b: number) => b - a <= EPS;
const le = (a: number, b: number) => a - b <= EPS;

const SESSION_TZ = 'America/New_York';

export function calculate(bars: Bar[], inputs: Partial<IctSeekDestroyProfileInputs> = {}, chart?: ChartContext): IndicatorResult {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const tf = chartTimeframe(bars, chart);
  const barMs = tf === '' ? undefined : timeframe.in_seconds(tf) * 1000;
  const msOf = (t: number) => (t < 1e12 ? t * 1000 : t);
  const inSession = (t: number, session: string) => pineTime.inSession(msOf(t), session, SESSION_TZ, barMs);

  // indicator(max_boxes_count = 500, max_labels_count = 500)
  resetDrawings({ box: 500, label: 500 });

  let sessions = 0;
  let lastSndPre = 0;
  let lastSndDay = 0;
  let totalSndWrn = 0;
  let totalSndDay = 0;
  const nykzBox = varDrawing<Box>();
  const lokzBox = varDrawing<Box>();
  const askzBox = varDrawing<Box>();
  let lastNewNy = NaN;
  let lastNyHigh = NaN;
  let lastNyLow = NaN;
  let lastNyClose = NaN;
  let lastNewLo = NaN;
  let lastLoHigh = NaN;
  let lastLoLow = NaN;
  let lastNewAs = NaN;
  let lastAsHigh = NaN;
  let lastAsLow = NaN;
  const nyRange: number[] = [];

  // manual_stdev(): population standard deviation of the New York ranges
  const manualStdev = () => {
    const size = nyRange.length;
    const mean = size > 0 ? nyRange.reduce((a, b) => a + b, 0) / size : NaN;
    let accum = 0.0;
    for (const r of nyRange) accum += Math.pow(r - mean, 2);
    return Math.sqrt(accum / size);
  };

  /** One session: the box starts on its first bar and grows with the bars of the session */
  const runSession = (inside: boolean, wasInside: boolean, holder: { value: Box | undefined }, name: string,
    css: string, i: number) => {
    if (!inside) return false;
    const b = bars[i];
    if (!wasInside) {
      holder.value = box.new(i, b.high, i, b.low, css, undefined, undefined, undefined, undefined, css, name,
        undefined, css);
      return true;
    }
    const bx = holder.value!;
    let top = box.get_top(bx);
    let bot = box.get_bottom(bx);
    if (gt(b.high, top)) top = b.high;
    if (lt(b.low, bot)) bot = b.low;
    box.set_rightbottom(bx, i, bot);
    box.set_top(bx, top);
    return false;
  };

  let prevNy = false;
  let prevLo = false;
  let prevAs = false;
  // the box held on the bar before (`nykz_box[1]`, ...)
  let prevNyBox: Box | undefined;
  let prevLoBox: Box | undefined;
  let prevAsBox: Box | undefined;

  for (let i = 0; i < n; i++) {
    setDrawingBar(i, i === n - 1);
    const t = bars[i].time;
    const nykz = inSession(t, cfg.ny_am);
    const lokz = inSession(t, cfg.lo_am);
    const askz = inSession(t, cfg.as_am);

    if (runSession(nykz, prevNy, nykzBox, 'New York', cfg.nykz_color, i)) sessions += 1;
    runSession(lokz, prevLo, lokzBox, 'London', cfg.ldkz_color, i);
    runSession(askz, prevAs, askzBox, 'Asia', cfg.askz_color, i);

    const close1 = i >= 1 ? bars[i - 1].close : NaN;
    if (!nykz && prevNy) {
      lastNyHigh = prevNyBox ? box.get_top(prevNyBox) : NaN;
      lastNyLow = prevNyBox ? box.get_bottom(prevNyBox) : NaN;
      lastNyClose = close1;
      lastNewNy = i;
      nyRange.push(lastNyHigh - lastNyLow);
    }
    if (!lokz && prevLo) {
      lastLoHigh = prevLoBox ? box.get_top(prevLoBox) : NaN;
      lastLoLow = prevLoBox ? box.get_bottom(prevLoBox) : NaN;
      lastNewLo = i;
    }
    if (!askz && prevAs) {
      lastAsHigh = prevAsBox ? box.get_top(prevAsBox) : NaN;
      lastAsLow = prevAsBox ? box.get_bottom(prevAsBox) : NaN;
      lastNewAs = i;
    }

    let sndDayWrn = false;
    if (lastNewLo > lastNewAs && gt(lastLoHigh, lastAsHigh) && lt(lastLoLow, lastAsLow) && lastSndPre < lastNewLo) {
      sndDayWrn = true;
      lastSndPre = i;
      totalSndWrn += 1;
    }

    let sndDayValid = false;
    if (lastNewNy > lastNewLo && lastSndPre > lastNewAs && lastSndDay < lastNewNy) {
      const outsideDay = cfg.crt_outside_day ? ge(lastNyHigh, lastLoHigh) && le(lastNyLow, lastLoLow) : false;
      const insideDay = cfg.crt_inside_day ? lt(lastNyHigh, lastLoHigh) && gt(lastNyLow, lastLoLow) : false;
      const closeInsideLo = cfg.crt_close_in_lo ? lt(lastNyClose, lastLoHigh) && gt(lastNyClose, lastLoLow) : false;
      const stdev = cfg.crt_sd_limit ? le(lastNyHigh - lastNyLow, manualStdev() * cfg.sd_limit) : false;
      if (outsideDay || insideDay || closeInsideLo || stdev) {
        sndDayValid = true;
        lastSndDay = i;
        totalSndDay += 1;
      }
    }

    if (cfg.show_snd_pre && sndDayWrn) {
      label.new(i, lastLoHigh, 'Potential S&D Day', 'bar_index', 'price', cfg.snd_pre_color, undefined, cfg.wrn_text);
    }
    if (cfg.show_snd_day && sndDayValid) {
      label.new(i, lastNyHigh, 'Valid S&D Day', 'bar_index', 'price', cfg.snd_day_color, undefined, cfg.wrn_text);
    }

    prevNy = nykz;
    prevLo = lokz;
    prevAs = askz;
    prevNyBox = nykzBox.value;
    prevLoBox = lokzBox.value;
    prevAsBox = askzBox.value;
  }

  // var stats = table.new(...); the cells are written on the last bar
  if (n > 0) {
    const position = cfg.table_position.toLowerCase().replace(' ', '_') as 'top_right';
    const stats = table.new(position, 10, 10, cfg.table_bg, cfg.table_frame, cfg.table_frame_width, cfg.table_border,
      cfg.table_border_width);
    const size = cfg.table_size.toLowerCase();
    const cell = (column: number, row: number, text: string, textColor: string, bg?: string) =>
      table.cell(stats, column, row, text, undefined, undefined, textColor, undefined, undefined, size, bg);
    if (cfg.show_stat_table) {
      cell(0, 1, 'Seek & Destroy Profile', cfg.table_text);
      cell(0, 2, 'Total Sessions', cfg.table_text);
      cell(1, 2, String(sessions), cfg.table_text);
      cell(0, 3, 'Warnings Given', cfg.table_text);
      cell(1, 3, String(totalSndWrn), cfg.table_text);
      cell(0, 4, 'Warning Success', cfg.table_text);
      cell(1, 4, String(totalSndDay), cfg.table_text);
      cell(0, 5, 'Warning Success Rate', cfg.table_text);
      // float division (0 / 0 is na: "NaN%")
      const rate = Math.round(totalSndDay / totalSndWrn * 100);
      cell(1, 5, (Number.isFinite(rate) ? String(rate) : 'NaN') + '%', cfg.table_text);
    }
    if (cfg.show_wrn_table && lastSndPre > lastNewNy) {
      cell(0, 1, cfg.wrn_msg, cfg.wrn_text, cfg.wrn_bg);
    }
  }
  setDrawingBar(null);

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {},
    ...drawingOutputs(bars),
  };
}

export const IctSeekDestroyProfile = { calculate, metadata, defaultInputs, inputConfig, plotConfig };
