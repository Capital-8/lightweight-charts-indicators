/**
 * Al Brooks II.IOI.OO
 *
 * Al Brooks bar sequences. An inside bar has a lower high and a higher low than the previous bar; an outside bar has
 * a higher high and a lower low. ii: two inside bars in a row. OO: two outside bars in a row. ioi: inside bar,
 * outside bar, inside bar (the current bar is inside, the previous bar outside, the bar before it inside). Each
 * pattern has a character above the bar and a light background (90 % transparency) in its colour. Every inside bar
 * gets a blue "I" and every outside bar a red "O" below the bar.
 *
 * Alerts (alertcondition, `alerts` of the result): 'ii Pattern Alert', 'OO Pattern Alert' and 'ioi Pattern Alert', true
 * on the bars of each pattern (whatever the show inputs).
 *
 * The Pine plotchar characters are "ii", "OO" and "ioi"; plotchar draws only the first character ("i", "O", "i").
 *
 * Reference: "Al Brooks II.IOI.OO" (Pine title "Al Brooks 连续模式") by JimmC98
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © JimmC98
 */

import { color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { MarkerData, BgColorData } from '../types';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

export interface AlBrooksIiIoiOoInputs {
  /** 显示 ii 模式 (show the ii pattern) */
  showIi: boolean;
  /** 显示 OO 模式 (show the OO pattern) */
  showOo: boolean;
  /** 显示 ioi 模式 (show the ioi pattern) */
  showIoi: boolean;
  /** ii 模式颜色 (ii pattern colour) */
  colorIi: string;
  /** OO 模式颜色 (OO pattern colour) */
  colorOo: string;
  /** ioi 模式颜色 (ioi pattern colour) */
  colorIoi: string;
}

export const defaultInputs: AlBrooksIiIoiOoInputs = {
  showIi: true,
  showOo: true,
  showIoi: true,
  colorIi: color.green,
  colorOo: color.orange,
  colorIoi: color.purple,
};

export const inputConfig: InputConfig[] = [
  { id: 'showIi', type: 'bool', title: '显示 ii 模式', defval: true },
  { id: 'showOo', type: 'bool', title: '显示 OO 模式', defval: true },
  { id: 'showIoi', type: 'bool', title: '显示 ioi 模式', defval: true },
  { id: 'colorIi', type: 'color', title: 'ii 模式颜色', defval: color.green },
  { id: 'colorOo', type: 'color', title: 'OO 模式颜色', defval: color.orange },
  { id: 'colorIoi', type: 'color', title: 'ioi 模式颜色', defval: color.purple },
];

// No plot(): the outputs are plotchar markers and background colours
export const plotConfig: PlotConfig[] = [];

export const metadata = {
  title: 'Al Brooks 连续模式',
  shortTitle: 'ii/OO/ioi',
  overlay: true,
};

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;

export function calculate(
  bars: Bar[],
  inputs: Partial<AlBrooksIiIoiOoInputs> = {},
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[]; bgColors: BgColorData[] } & { alerts: AlertConditionState[] } {
  const { showIi, showOo, showIoi, colorIi, colorOo, colorIoi } = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const high = (i: number) => (i >= 0 ? bars[i].high : NaN);
  const low = (i: number) => (i >= 0 ? bars[i].low : NaN);

  const bgIi = String(color.new(colorIi, 90));
  const bgOo = String(color.new(colorOo, 90));
  const bgIoi = String(color.new(colorIoi, 90));

  const markers: MarkerData[] = [];
  const bgColors: BgColorData[] = [];
  const iiFlags: boolean[] = [], ooFlags: boolean[] = [], ioiFlags: boolean[] = [];
  for (let i = 0; i < n; i++) {
    const t = bars[i].time;
    const insideBar = lt(high(i), high(i - 1)) && gt(low(i), low(i - 1));
    const outsideBar = gt(high(i), high(i - 1)) && lt(low(i), low(i - 1));
    const insideBar1 = lt(high(i - 1), high(i - 2)) && gt(low(i - 1), low(i - 2));
    const outsideBar1 = gt(high(i - 1), high(i - 2)) && lt(low(i - 1), low(i - 2));
    const insideBar2 = lt(high(i - 2), high(i - 3)) && gt(low(i - 2), low(i - 3));

    const iiPattern = insideBar && insideBar1;
    const ooPattern = outsideBar && outsideBar1;
    const ioiPattern = insideBar && outsideBar1 && insideBar2;
    iiFlags.push(iiPattern);
    ooFlags.push(ooPattern);
    ioiFlags.push(ioiPattern);

    // plotchar(show_ii and ii_pattern, 'ii Pattern', 'ii', location.abovebar, color_ii, size = size.normal)
    if (showIi && iiPattern) {
      markers.push({ id: 'char0', time: t, position: 'aboveBar', shape: 'circle', color: 'transparent', text: 'i', textColor: colorIi,
        size: 'normal' });
    }
    // plotchar(show_oo and oo_pattern, 'OO Pattern', 'OO', location.abovebar, color_oo, size = size.normal)
    if (showOo && ooPattern) {
      markers.push({ id: 'char1', time: t, position: 'aboveBar', shape: 'circle', color: 'transparent', text: 'O', textColor: colorOo,
        size: 'normal' });
    }
    // plotchar(show_ioi and ioi_pattern, 'ioi Pattern', 'ioi', location.abovebar, color_ioi, size = size.small)
    if (showIoi && ioiPattern) {
      markers.push({ id: 'char2', time: t, position: 'aboveBar', shape: 'circle', color: 'transparent', text: 'i', textColor: colorIoi,
        size: 'small' });
    }

    // bgcolor(show_ii and ii_pattern ? color.new(color_ii, 90) : na), then OO, then ioi
    if (showIi && iiPattern) bgColors.push({ id: 'bgcolor0', time: t, color: bgIi });
    if (showOo && ooPattern) bgColors.push({ id: 'bgcolor1', time: t, color: bgOo });
    if (showIoi && ioiPattern) bgColors.push({ id: 'bgcolor2', time: t, color: bgIoi });

    // plotchar(inside_bar, 'Inside Bar', 'I', location.belowbar, color.blue, size = size.tiny)
    if (insideBar) {
      markers.push({ id: 'char3', time: t, position: 'belowBar', shape: 'circle', color: 'transparent', text: 'I', textColor: color.blue,
        size: 'tiny' });
    }
    // plotchar(outside_bar, 'Outside Bar', 'O', location.belowbar, color.red, size = size.tiny)
    if (outsideBar) {
      markers.push({ id: 'char4', time: t, position: 'belowBar', shape: 'circle', color: 'transparent', text: 'O', textColor: color.red,
        size: 'tiny' });
    }
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {},
    markers,
    bgColors,
    // alertcondition(ii_pattern) / (oo_pattern) / (ioi_pattern)
    alerts: alertStates(alertConditions, bars, [iiFlags, ooFlags, ioiFlags]),
  };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'ii Pattern Alert', message: '连续两根Inside Bar出现在 {{ticker}}' },
  { id: 'alert1', title: 'OO Pattern Alert', message: '连续两根Outside Bar出现在 {{ticker}}' },
  { id: 'alert2', title: 'ioi Pattern Alert', message: 'ioi模式出现在 {{ticker}}' },
];

export const AlBrooksIiIoiOo = { calculate, metadata, defaultInputs, inputConfig, plotConfig, alertConditions };
