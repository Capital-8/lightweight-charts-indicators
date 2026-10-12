/**
 * Liquidity Trendline With Signals
 *
 * Trendlines on pivots (highs and lows with `Period` bars on each side), drawn as a band of two lines with a fill:
 * - Down trendline (resistance): two pivot highs, the newer one lower. It is accepted after a breakout of any
 *   trendline (the "broken" state, shared by both sides), or when the two newest pivot highs are both below the two
 *   pivot highs before them. The script then walks back from the current bar along the line (moving its end one bar
 *   back and one slope step down per bar, as the original); a low above that end drops the trendline. Else the band
 *   is drawn: the line through the two pivots and a second line `Padding` x min(ATR(200) / 10, close / 1000) below,
 *   with a fill of 75 % transparency.
 * - Up trendline (support): the same on pivot lows, the newer one higher, the second line above.
 * - While a band is active, both lines are extended to the current bar by one slope step per bar (the slope of the
 *   line as it is at that bar). A low above the resistance line ("Breaking Up") or a high below the upper line of
 *   the support band ("Breaking Down") ends the band (its lines stay where they are) and sets the "broken" state.
 * - "Show Breakouts" draws the two breakouts as triangles one bar back (offset -1).
 * At most 500 lines are kept (and 500 fills).
 *
 * Reference: "Liquidity Trendline With Signals [StratifyTrade]" by BigBeluga
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © StratifyTrade
 */

import {
  ta, Series, color, line, linefill, resetDrawings, setDrawingBar, drawingOutputs,
  type IndicatorResult, type InputConfig, type PlotConfig, type Bar, type Line,
} from 'oakscriptjs';
import type { MarkerData } from '../types';

export interface LiquidityTrendlineWithSignalsInputs {
  /** Pivot lookback (bars on each side) */
  len: number;
  /** Colour of the up trendlines (support) */
  cup: string;
  /** Colour of the down trendlines (resistance) */
  cdn: string;
  /** Distance of the second line, in units of min(ATR(200) / 10, close / 1000) */
  space: number;
  /** Show the breakout triangles */
  shs: boolean;
}

export const defaultInputs: LiquidityTrendlineWithSignalsInputs = {
  len: 5,
  cup: '#0044ff',
  cdn: '#ff2b00',
  space: 2,
  shs: true,
};

export const inputConfig: InputConfig[] = [
  { id: 'len', type: 'int', title: 'Period  ', defval: 5, tooltip: 'Lookback period', inline: 'a', group: 'SETTINGS' },
  { id: 'cup', type: 'color', title: '', defval: '#0044ff', inline: 'a', group: 'SETTINGS' },
  { id: 'cdn', type: 'color', title: '', defval: '#ff2b00', inline: 'a', group: 'SETTINGS' },
  { id: 'space', type: 'float', title: 'Padding', defval: 2, step: 0.1, tooltip: 'Padding distance', inline: 'b', group: 'SETTINGS' },
  { id: 'shs', type: 'bool', title: 'Show Breakouts', defval: true, inline: 'z', group: 'SETTINGS' },
];

export const plotConfig: PlotConfig[] = [];

export const metadata = {
  title: 'Liquidity Trendline With Signals [StratifyTrade]',
  shortTitle: 'StratifyTrade - Liquidity Trendline With Signals',
  overlay: true,
};

/** indicator(max_lines_count = 500) */
const MAX_LINES = 500;

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;

interface Store {
  src: number;
  n: number;
}

/** method slope(line ln): (y2 - y1) / (x2 - x1) */
const slope = (ln: Line) => (line.get_y2(ln) - line.get_y1(ln)) / (line.get_x2(ln) - line.get_x1(ln));

export function calculate(
  bars: Bar[],
  inputs: Partial<LiquidityTrendlineWithSignalsInputs> = {},
): IndicatorResult & { markers: MarkerData[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const len = Math.trunc(cfg.len);
  const space = cfg.space;
  const cup = cfg.cup;
  const cdn = cfg.cdn;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);

  const ph = A(ta.pivothigh(new Series(bars, (b) => b.high), len, len));
  const pl = A(ta.pivotlow(new Series(bars, (b) => b.low), len, len));
  const atr = A(ta.atr(bars, 200));

  resetDrawings({ line: MAX_LINES });

  const upbin: Store[] = [];
  const dnbin: Store[] = [];
  const upln: Line[] = [];
  const dnln: Line[] = [];
  let broken = false;
  // `var bool valid` of each `if` block (assigned before every read)
  let validUp = false;
  let validDn = false;
  const plup: boolean[] = new Array(n).fill(false);
  const pldn: boolean[] = new Array(n).fill(false);

  for (let i = 0; i < n; i++) {
    setDrawingBar(i, i === n - 1);
    const b = bars[i];
    // vol() = math.min(atr * 0.1, close * (0.1 / 100))
    const vol = () => Math.min(atr[i] * 0.1, b.close * (0.1 / 100));
    const newLine = (x1: number, y1: number, x2: number, y2: number, c: string) =>
      line.new(x1, y1, x2, y2, 'bar_index', 'none', c);

    // if ph (na and 0 are false)
    if (!isNaN(ph[i]) && ph[i] !== 0) {
      let remove = false;
      upbin.unshift({ src: bars[i - len].high, n: i - len });
      if (upbin.length > 1) {
        const current = upbin[0];
        const before = upbin[1];
        if (lt(current.src, before.src)) {
          if (broken) {
            validUp = true;
          } else {
            validUp = false;
            if (upbin.length > 3) {
              const pastold = upbin[3];
              const pastcur = upbin[2];
              const now = upbin[1];
              const late = upbin[0];
              validUp = lt(now.src, pastcur.src) && lt(now.src, pastold.src)
                && lt(late.src, pastcur.src) && lt(late.src, pastold.src);
            }
          }
          if (validUp) {
            upln.unshift(newLine(before.n, before.src, current.n, current.src, cdn));
            upln.unshift(newLine(before.n, before.src - vol() * space, current.n, current.src - vol() * space, cdn));
            const ln = upln[1];
            for (let k = 0; k <= i - before.n; k++) {
              const s = slope(ln);
              line.set_x2(ln, i - k);
              line.set_y2(ln, line.get_y2(ln) - s);
              if (gt(bars[i - k].low, line.get_y2(ln))) {
                remove = true;
                break;
              }
            }
            line.delete(upln[0]);
            line.delete(upln[1]);
            upln.length = 0;
            if (remove) {
              upbin.length = 0;
              broken = true;
            } else {
              upln.unshift(newLine(before.n, before.src, current.n, current.src, cdn));
              upln.unshift(newLine(before.n, before.src - vol() * space, current.n, current.src - vol() * space, cdn));
              linefill.new(upln[0], upln[1], String(color.new(cdn, 75)));
              upbin.length = 0;
              broken = false;
            }
          }
        }
      }
    }

    if (upln.length > 1) {
      const btm = upln[0];
      const top = upln[1];
      if (gt(b.low, line.get_y2(top))) {
        upln.length = 0;
        broken = true;
        upbin.length = 0;
        plup[i] = true;
      }
      if (upln.length > 1) {
        const slup = slope(top);
        const sldn = slope(btm);
        line.set_x2(top, i);
        line.set_y2(top, line.get_y2(top) + slup);
        line.set_x2(btm, i);
        line.set_y2(btm, line.get_y2(btm) + sldn);
      }
    }

    // if pl
    if (!isNaN(pl[i]) && pl[i] !== 0) {
      let remove = false;
      dnbin.unshift({ src: bars[i - len].low, n: i - len });
      if (dnbin.length > 1) {
        const current = dnbin[0];
        const before = dnbin[1];
        if (gt(current.src, before.src)) {
          if (broken) {
            validDn = true;
          } else {
            validDn = false;
            if (dnbin.length > 3) {
              const pastold = dnbin[3];
              const pastcur = dnbin[2];
              const now = dnbin[1];
              const late = dnbin[0];
              validDn = gt(now.src, pastcur.src) && gt(now.src, pastold.src)
                && gt(late.src, pastcur.src) && gt(late.src, pastold.src);
            }
          }
          if (validDn) {
            dnln.unshift(newLine(before.n, before.src, current.n, current.src, cup));
            dnln.unshift(newLine(before.n, before.src + vol() * space, current.n, current.src + vol() * space, cup));
            const ln = dnln[1];
            for (let k = 0; k <= i - before.n; k++) {
              const s = slope(ln);
              line.set_x2(ln, i - k);
              line.set_y2(ln, line.get_y2(ln) - s);
              if (lt(bars[i - k].high, line.get_y2(ln))) {
                remove = true;
                break;
              }
            }
            line.delete(dnln[0]);
            line.delete(dnln[1]);
            dnln.length = 0;
            if (remove) {
              dnbin.length = 0;
              broken = true;
            } else {
              dnln.unshift(newLine(before.n, before.src, current.n, current.src, cup));
              dnln.unshift(newLine(before.n, before.src + vol() * space, current.n, current.src + vol() * space, cup));
              linefill.new(dnln[0], dnln[1], String(color.new(cup, 75)));
              dnbin.length = 0;
              broken = false;
            }
          }
        }
      }
    }

    if (dnln.length > 1) {
      const btm = dnln[0];
      const top = dnln[1];
      if (lt(b.high, line.get_y2(btm))) {
        dnln.length = 0;
        broken = true;
        dnbin.length = 0;
        pldn[i] = true;
      }
      if (dnln.length > 1) {
        const slup = slope(top);
        const sldn = slope(btm);
        line.set_x2(top, i);
        line.set_y2(top, line.get_y2(top) + slup);
        line.set_x2(btm, i);
        line.set_y2(btm, line.get_y2(btm) + sldn);
      }
    }
  }
  setDrawingBar(null);

  // plotshape(pldn and shs ? b.h[1] : na, offset = -1, location.abovebar) / plotshape(plup and shs ? b.l[1] : na,
  // offset = -1, location.belowbar): the value is read as a bool (na and 0 draw nothing); drawn on the bar before
  const markers: MarkerData[] = [];
  if (cfg.shs) {
    for (let i = 1; i < n; i++) {
      const prev = bars[i - 1];
      if (pldn[i] && !isNaN(prev.high) && prev.high !== 0) {
        markers.push({ time: prev.time, position: 'aboveBar', shape: 'triangleDown', color: cdn, size: 'tiny' });
      }
      if (plup[i] && !isNaN(prev.low) && prev.low !== 0) {
        markers.push({ time: prev.time, position: 'belowBar', shape: 'triangleUp', color: cup, size: 'tiny' });
      }
    }
  }

  const out = drawingOutputs(bars);
  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {},
    markers,
    lines: out.lines ?? [],
    linefills: out.linefills ?? [],
  };
}

export const LiquidityTrendlineWithSignals = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
};
