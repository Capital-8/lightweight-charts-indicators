/**
 * DeltaFlow Volume Profile
 *
 * On the last bar, the price range (highest high and lowest low) of the last LookBack + 1 bars is cut into "Bins"
 * levels of equal height. Each bar adds its volume to every level whose middle is within one level height of its
 * close, as buy volume (close >= open) or sell volume (close < open). Drawn to the right of the last bar (from bar
 * index last + 100 + Offset, towards the left): per level a bar of the total volume (0 to 100, % of the largest level)
 * coloured by the delta of buy and sell percentages (gradient from the sell colour at -30 % to the buy colour at
 * +30 %), the buy and sell bars with their percentages, a delta label box ("Δ x%"), a heat map band across the
 * look-back window, and a box with the volume on the largest level (PoC).
 *
 * The box borders and the PoC text use the chart background / foreground colours (`chart.bg_color` /
 * `chart.fg_color`): they come from the chart context (dark theme colours without it).
 *
 * Reference: "DeltaFlow Volume Profile [BigBeluga]" by BigBeluga
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © BigBeluga
 */

import {
  str, color, box, resetDrawings, setDrawingBar,
  type IndicatorResult, type InputConfig, type PlotConfig, type Bar,
} from 'oakscriptjs';
import type { BoxData } from '../types';
import { barInterval, barTime } from '../bar-time';
import { backgroundColorOf, foregroundColorOf, type ChartContext } from '../chart-context';

export interface DeltaflowVolumeProfileInputs {
  lookBack: number;
  binsAmount: number;
  offset: number;
  deltaHeatMap: boolean;
  deltaDisplay: boolean;
  volumeBars: boolean;
  pocDisplay: boolean;
  pocColor: string;
  bullColor: string;
  bearColor: string;
}

export const defaultInputs: DeltaflowVolumeProfileInputs = {
  lookBack: 200,
  binsAmount: 30,
  offset: 5,
  deltaHeatMap: true,
  deltaDisplay: true,
  volumeBars: true,
  pocDisplay: true,
  pocColor: '#00B7FF',
  bullColor: '#089981',
  bearColor: '#E6961E',
};

export const inputConfig: InputConfig[] = [
  { id: 'lookBack', type: 'int', title: 'LookBack', defval: 200 },
  { id: 'binsAmount', type: 'int', title: 'Bins', defval: 30, min: 10, max: 100 },
  { id: 'offset', type: 'int', title: 'offset', defval: 5 },
  { id: 'deltaHeatMap', type: 'bool', title: 'Delta Heat Map', defval: true, group: 'Features' },
  { id: 'deltaDisplay', type: 'bool', title: 'Delta', defval: true, group: 'Features' },
  { id: 'volumeBars', type: 'bool', title: 'Volume Bars', defval: true, group: 'Features' },
  { id: 'pocDisplay', type: 'bool', title: '', defval: true, inline: 'poc', group: 'Features' },
  { id: 'pocColor', type: 'color', title: 'PoC Color', defval: '#00B7FF', inline: 'poc', group: 'Features' },
  { id: 'bullColor', type: 'color', title: 'Volume +/-', defval: '#089981', inline: 'vol' },
  { id: 'bearColor', type: 'color', title: '', defval: '#E6961E', inline: 'vol' },
];

/** plot(na) */
export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Plot', color: '#2962FF', lineWidth: 1 },
];

export const metadata = {
  title: 'DeltaFlow Volume Profile [BigBeluga]',
  shortTitle: 'DeltaFlow Volume Profile [BigBeluga]',
  overlay: true,
};

/** Pine comparisons: a <= b when a - b <= 1e-10 */
const EPS = 1e-10;

export function calculate(
  bars: Bar[],
  inputs: Partial<DeltaflowVolumeProfileInputs> = {},
  chart?: ChartContext,
): Omit<IndicatorResult, 'boxes'> & { boxes: BoxData[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const lookBack = Math.trunc(cfg.lookBack);
  const bins = Math.trunc(cfg.binsAmount);
  const bg = backgroundColorOf(chart);
  const fg = foregroundColorOf(chart);

  resetDrawings({ box: 500 });
  const plot0 = bars.map((b) => ({ time: b.time, value: NaN }));

  if (n > 0) {
    const last = n - 1;
    setDrawingBar(last, true);
    const at = (i: number) => (last - i >= 0 ? bars[last - i] : undefined);

    // MaxMin: high[i] and low[i] for i = 0 to lookBack (na before the first bar is skipped by max / min)
    let top = -Infinity;
    let bot = Infinity;
    for (let i = 0; i <= lookBack; i++) {
      const b = at(i);
      if (!b) continue;
      top = Math.max(top, b.high);
      bot = Math.min(bot, b.low);
    }
    if (top === -Infinity) top = NaN;
    if (bot === Infinity) bot = NaN;
    const step = (top - bot) / bins;

    const volumeArr = new Array<number>(bins).fill(0);
    const bearVolume = new Array<number>(bins).fill(0);
    const bullVolume = new Array<number>(bins).fill(0);
    for (let i = 0; i <= lookBack; i++) {
      const b = at(i);
      const price = b ? b.close : NaN;
      const isBear = b ? b.close - b.open < -EPS : false;
      const voll = b ? (b.volume ?? NaN) : NaN;
      for (let k = 0; k < bins; k++) {
        const lower = bot + step * k;
        const mid = lower + step / 2;
        if (Math.abs(mid - price) - step <= EPS) {
          volumeArr[k] += voll;
          if (isBear) bearVolume[k] += voll;
          else bullVolume[k] += voll;
        }
      }
    }
    // array.max skips na
    const finite = volumeArr.filter((v) => !isNaN(v));
    const maxVol = finite.length ? Math.max(...finite) : NaN;

    const start = last + 100 + cfg.offset;
    for (let i = 0; i < bins; i++) {
      const value = volumeArr[i];
      const lower = bot + step * i;
      const upper = lower + step;
      const mid = lower + step / 2;
      const vol = Math.trunc(value / maxVol * 100);
      const bullV = Math.floor(bullVolume[i] / maxVol * 100);
      const bearV = Math.floor(bearVolume[i] / maxVol * 100);
      const size = start - start - vol;
      let bullsPercent = Math.abs(bullV / size * 100);
      const bearsPercent = Math.abs(bearV / size * 100);
      bullsPercent = bullsPercent - 100 > EPS ? 100 : bullsPercent;
      const delta = bullsPercent - bearsPercent;
      const deltaColor = color.from_gradient(delta, -30, 30, cfg.bearColor, cfg.bullColor);

      if (cfg.deltaHeatMap) {
        box.new(start - lookBack - 50 - vol, upper, start, lower, bg, 0, undefined, undefined, undefined,
          color.from_gradient(vol, 0, 100, color.new(deltaColor, 100), color.new(deltaColor, 70)));
      }
      if (Math.abs(vol - 100) <= EPS && cfg.pocDisplay) {
        box.new(start - lookBack - 50 - vol, upper, start, lower, cfg.pocColor, 1, undefined, undefined, undefined,
          'transparent', str.tostring(value, 'volume'), undefined, fg);
      }
      if (cfg.deltaDisplay) {
        box.new(start + 15, upper, start, lower, bg, 1, undefined, undefined, undefined, color.new(deltaColor, 80),
          'Δ ' + str.tostring(delta, 'percent'), undefined, deltaColor);
      }
      box.new(start - vol, upper, start, lower, bg, 1, undefined, undefined, undefined, color.new(deltaColor, 50));
      if (cfg.volumeBars) {
        box.new(start - bullV, mid, start, lower, bg, 1, undefined, undefined, undefined, cfg.bullColor,
          str.tostring(bullsPercent, 'percent'), undefined, undefined, 'right');
        box.new(start - bearV, upper, start, mid, bg, 1, undefined, undefined, undefined, cfg.bearColor,
          str.tostring(bearsPercent, 'percent'), undefined, undefined, 'right');
      }
    }
    setDrawingBar(null);
  }

  const interval = barInterval(bars);
  const T = (index: number) => barTime(bars, index, interval);
  const col = (c: unknown) => (c === null || c === undefined || c === '' ? 'transparent' : String(c));
  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: { plot0 },
    // a box with an na coordinate is not drawn
    boxes: box.all().filter((b) => ![b.left, b.right, b.top, b.bottom].some((v) => isNaN(v))).map((b) => ({
      time1: T(b.left), price1: b.top, time2: T(b.right), price2: b.bottom,
      bgColor: col(b.bgcolor), borderColor: col(b.border_color), borderWidth: b.border_width,
      ...(b.text ? { text: b.text, textColor: b.text_color === undefined ? '#FFFFFF' : col(b.text_color) } : {}),
      ...(b.text_halign && b.text_halign !== 'center' ? { textHAlign: b.text_halign } : {}),
    })),
  };
}

export const DeltaflowVolumeProfile = { calculate, metadata, defaultInputs, inputConfig, plotConfig };
