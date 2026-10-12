/**
 * VWAP Volume Profile [BigBeluga]
 *
 * A volume profile of the VWAP (`ta.vwap(close)`, restarting each trading day) over the last "period" bars, drawn on
 * the last bar. The price range of the window (highest high to lowest low) is cut into "bins" rows. Each bar of the
 * window has a signed volume: its volume divided by the highest volume of the last 1,000 bars, times 20, positive
 * when the VWAP is above the VWAP of 2 bars back and negative otherwise. A row adds the signed volumes (each one
 * truncated to an integer) of the bars whose VWAP is inside the row widened by one row on each side; its box starts
 * "offset" bars after the last bar and is as many bars long as that sum (to the left for a negative sum). Colours: a
 * gradient of the up colour for positive sums and of the down colour for negative sums, against the largest /
 * smallest sum of the rows computed so far (the rows are computed from the bottom). The +VWAP / -VWAP point of
 * control boxes mark the last row that was the largest / smallest so far, from "period" bars back to the profile,
 * with the total raw volume of that row. A background box covers the window. The VWAP line (up colour when the VWAP
 * is above the VWAP of 5 bars back) and the candles in that colour are drawn on the last "period" bars.
 *
 * The bar colours of the original are hidden (display.none): not ported. On intraday bars the VWAP needs the
 * exchange time zone and session of the chart context (third argument); without them the port throws an Error. On
 * daily and higher bars each bar is its own VWAP period (the close). The box borders use the chart background colour
 * (`chart.bg_color`, from the chart context).
 *
 * Reference: "VWAP Volume Profile [BigBeluga]" by BigBeluga
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © BigBeluga
 */

import {
  taCore, color, str, box, label, resetDrawings, setDrawingBar, drawingOutputs,
  type Box, type IndicatorResult, type InputConfig, type PlotConfig, type Bar,
} from 'oakscriptjs';
import { executeScript, ta as scriptTa, close as scriptClose } from 'oakscriptjs/script';
import type { BoxData, LabelData, PlotCandleData } from '../types';
import { barInterval } from '../bar-time';
import { backgroundColorOf, type ChartContext } from '../chart-context';

export interface VwapVolumeProfileInputs {
  period: number;
  offset: number;
  bins: number;
  pocType: '+VWAP' | '-VWAP' | '+/-VWAP';
  upCol: string;
  dnCol: string;
  bgCol: string;
}

export const defaultInputs: VwapVolumeProfileInputs = {
  period: 250,
  offset: 10,
  bins: 50,
  pocType: '+/-VWAP',
  upCol: '#42bda8',
  dnCol: '#ffb950',
  // color.rgb(5, 38, 82, 80) as an input default: alpha 0.2
  bgCol: 'rgba(5, 38, 82, 0.2)',
};

export const inputConfig: InputConfig[] = [
  { id: 'period', type: 'int', title: 'period', defval: 250 },
  { id: 'offset', type: 'int', title: 'offset', defval: 10 },
  { id: 'bins', type: 'int', title: 'bins', defval: 50 },
  { id: 'pocType', type: 'string', title: 'POC', defval: '+/-VWAP', options: ['+VWAP', '-VWAP', '+/-VWAP'] },
  { id: 'upCol', type: 'color', title: '+/-', defval: '#42bda8', inline: 'col' },
  { id: 'dnCol', type: 'color', title: '', defval: '#ffb950', inline: 'col' },
  { id: 'bgCol', type: 'color', title: '', defval: 'rgba(5, 38, 82, 0.2)', inline: 'col' },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'VWAP', color: '#2962ff', lineWidth: 3, forceOverlay: true },
];

export const metadata = {
  title: 'VWAP Volume Profile [BigBeluga]',
  shortTitle: 'VWAP Volume Profile [BigBeluga]',
  overlay: true,
};

/** indicator(max_boxes_count = 500) */
const MAX_BOXES = 500;
const DAY_SECONDS = 86400;
/** Pine v6 default box text colour */
const WHITE = '#FFFFFF';

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const ge = (a: number, b: number) => !Number.isNaN(a) && !Number.isNaN(b) && !(b - a > EPS);
const le = (a: number, b: number) => !Number.isNaN(a) && !Number.isNaN(b) && !(a - b > EPS);

/** array.max / array.min: na elements are skipped */
const arrMax = (a: number[]) => a.reduce((m, v) => (Number.isNaN(v) ? m : Number.isNaN(m) || v > m ? v : m), NaN);
const arrMin = (a: number[]) => a.reduce((m, v) => (Number.isNaN(v) ? m : Number.isNaN(m) || v < m ? v : m), NaN);

/** ta.vwap(close) with the default anchor (a new period on each trading day) */
function vwapOf(bars: Bar[], chart?: ChartContext): number[] {
  const interval = barInterval(bars);
  if (interval > 0 && interval < DAY_SECONDS) {
    if (chart?.timezone === undefined || chart.session === undefined) {
      throw new Error(
        'VWAP Volume Profile: on intraday bars ta.vwap resets on each trading day, which needs the exchange time zone '
        + 'and session of the chart context; without a chart context it works on daily and higher timeframes only.',
      );
    }
    let vwap: number[] = [];
    executeScript(() => {
      vwap = scriptTa.vwap(scriptClose).toArray().map((v) => v ?? NaN);
    }, bars, {}, chart);
    return vwap;
  }
  // daily and higher bars: one bar per period, sum(close * volume) / sum(volume) (0 / 0 = na without volume)
  return bars.map((b) => (b.close * (b.volume ?? NaN)) / (b.volume ?? NaN));
}

export function calculate(
  bars: Bar[],
  inputs: Partial<VwapVolumeProfileInputs> = {},
  chart?: ChartContext,
): Omit<IndicatorResult, 'boxes' | 'labels'> & {
  boxes: BoxData[]; labels: LabelData[]; plotCandles: Record<string, PlotCandleData[]>;
} {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const period = Math.trunc(cfg.period);
  const offset = Math.trunc(cfg.offset);
  const bins = Math.trunc(cfg.bins);
  const pocType = cfg.pocType === '+VWAP' ? 1 : cfg.pocType === '-VWAP' ? 2 : 3;
  const upCol = cfg.upCol;
  const dnCol = cfg.dnCol;
  const last = n - 1;

  const high = bars.map((b) => b.high);
  const low = bars.map((b) => b.low);
  const volume = bars.map((b) => b.volume ?? NaN);
  const vwap = vwapOf(bars, chart);
  const src = vwap;

  // get_vol(): volume / ta.highest(volume, 1000) * 20, signed by src > src[2]
  const volMax = taCore.highest(volume, 1000);
  const volume_ = volume.map((v, i) => ((i >= 2 && gt(src[i], src[i - 2])) ? v : -v) / volMax[i] * 20);
  // get_grid()
  const hh = taCore.highest(high, period);
  const ll = taCore.lowest(low, period);

  resetDrawings({ box: MAX_BOXES });
  try {
    for (let i = 0; i < n; i++) {
      setDrawingBar(i, i === last);
      if (i !== last) continue;
      // get_vol(): ta.cum(volume) < 1 on the last bar
      let cum = 0;
      for (const v of volume) cum += Number.isNaN(v) ? 0 : v;
      if (cum < 1) {
        label.new(i, (bars[i].high + bars[i].low) / 2, 'No Volume Data Provided', 'bar_index', 'price', undefined,
          undefined, undefined, 'huge');
      }
      const H = hh[i];
      const L = ll[i];
      const step = (H - L) / bins;
      const x = i + offset;
      const vp: Array<Box | null> = new Array(bins).fill(null);
      const volume1 = new Array<number>(bins).fill(0);
      const volume2 = new Array<number>(bins).fill(0);
      let posPoc: Box | null = null;
      let negPoc: Box | null = null;
      const bgBorder = backgroundColorOf(chart);
      for (let r = 0; r < bins; r++) {
        const lo = L + step * r;
        const hi = lo + step;
        for (let j = 0; j <= period - 1; j++) {
          const k = i - j;
          const source = k >= 0 ? src[k] : NaN;
          const value = k >= 0 ? Math.trunc(volume_[k]) : NaN;
          if (ge(source, lo - step) && le(source, hi + step)) {
            volume1[r] = volume1[r] + value;
            volume2[r] = volume2[r] + (k >= 0 ? volume[k] : NaN);
          }
        }
        const v1 = volume1[r];
        const bgCol = v1 > 0
          ? color.from_gradient(v1, 0, arrMax(volume1), String(color.new(upCol, 90)), upCol)
          : color.from_gradient(v1, arrMin(volume1), 0, dnCol, String(color.new(dnCol, 90)));
        if (vp[r] === null) {
          vp[r] = box.new(x, hi, x + v1, lo, bgBorder, undefined, undefined, undefined, undefined, bgCol,
            undefined, undefined, WHITE, undefined, undefined, undefined, undefined, true);
        }
        // Pocs
        const pocBox = (text: string) => {
          const b = box.new(i - period, hi, x, lo, undefined, undefined, undefined, undefined, undefined, undefined,
            undefined, 'normal', undefined, undefined, undefined, undefined, undefined, true);
          box.set_bgcolor(b, String(color.new(bgCol, 90)));
          box.set_border_color(b, String(color.new(bgCol, 50)));
          box.set_text(b, text + str.tostring(volume2[r], 'volume'));
          box.set_text_color(b, bgCol);
          box.set_text_halign(b, 'left');
          return b;
        };
        if (v1 === arrMax(volume1) && (pocType === 1 || pocType === 3)) {
          if (posPoc) box.delete(posPoc);
          posPoc = pocBox('+VWAP: ');
        }
        if (v1 === arrMin(volume1) && (pocType === 2 || pocType === 3)) {
          if (negPoc) box.delete(negPoc);
          negPoc = pocBox('-VWAP: ');
        }
      }
      // Bg Box
      box.new(i - period, H, x, L, 'transparent', undefined, undefined, undefined, undefined, cfg.bgCol,
        undefined, undefined, WHITE);
    }
  } finally {
    setDrawingBar(null);
  }
  const drawn = drawingOutputs(bars);
  resetDrawings();

  // vwap_col on the last "period" bars, na before
  const inWindow = (i: number) => last - i < period;
  const colOf = (i: number) => (inWindow(i) ? (i >= 5 && gt(vwap[i], vwap[i - 5]) ? upCol : dnCol) : 'transparent');
  const plot0 = bars.map((b, i) => ({
    time: b.time,
    value: inWindow(i) && Number.isFinite(vwap[i]) ? vwap[i] : NaN,
    color: colOf(i),
  }));
  const candles: PlotCandleData[] = bars.map((b, i) => {
    const c = colOf(i);
    return { time: b.time, open: b.open, high: b.high, low: b.low, close: b.close, color: c, wickColor: c,
      borderColor: c, forceOverlay: true };
  });

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: { plot0 },
    plotCandles: { candlesColor: candles },
    boxes: drawn.boxes ?? [],
    labels: drawn.labels ?? [],
  };
}

export const VwapVolumeProfile = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
};
