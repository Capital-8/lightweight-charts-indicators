/**
 * Bernoulli Process - Binary Entropy Function
 *
 * A measurement of the close (and optionally of log(volume)) over `len` bars (value, SMA, change, momentum,
 * acceleration, contribution, %-change, log volatility or Ehlers UltimateSmoother) is ranked over `avg` bars; its
 * percent rank r gives the binary entropy term r * log2(r) - (1 - r) * log2(1 - r), summed over `len` bars.
 * "Bernoulli Purest" first passes the measurement through a normal CDF. The columns are coloured by the trade band,
 * with darker colours when the percent rank of the result is extreme and an OBV based DI difference disagrees.
 * Triangles mark the extreme percent ranks.
 * Alerts (alertcondition, `alerts` of the result): 'Alert on Down Triangle' (the percent rank crosses above
 * 100 - limit) and 'Alert on Up Triangle' (it crosses below the limit).
 *
 * Reference: "Bernoulli Process - Binary Entropy Function" by kocurekc
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 */

import { ta, math, fixnan, Series, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { MarkerData } from '../types';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

const TYPES = ['Value', 'SMA', 'Change', '%-Change', 'Momentum', 'Acceleration', 'Contribution', 'Volatility',
  'Elher_smoother'] as const;
type MeasureType = typeof TYPES[number];

export interface BernoulliProcessEntropyInputs {
  /** Entropy length */
  len: number;
  /** Trade band (confirmation) */
  trange: number;
  /** Averaging (percent rank) length */
  avg: number;
  /** Measurement type */
  type: MeasureType;
  /** ADX-DI length */
  diLen: number;
  /** Percent rank limit */
  vPR: number;
  /** Include the close */
  bc: boolean;
  /** Include the volume */
  vc: boolean;
  /** Print the price and volume bands */
  pb: boolean;
  /** Print the OBV-ADX DI difference when it moves opposite to the Bernoulli value */
  pobv: boolean;
  /** Extra highlighting */
  xc: boolean;
  /** Bernoulli Purest: measurement through a normal CDF */
  xn: boolean;
  /** CDF smoother */
  smo: number;
}

export const defaultInputs: BernoulliProcessEntropyInputs = {
  len: 22,
  trange: 0.67,
  avg: 88,
  type: 'Contribution',
  diLen: 11,
  vPR: 5,
  bc: true,
  vc: false,
  pb: false,
  pobv: false,
  xc: true,
  xn: false,
  smo: 3,
};

export const inputConfig: InputConfig[] = [
  { id: 'len', type: 'int', title: 'Entropy Length', defval: 22 },
  { id: 'trange', type: 'float', title: 'Trade Band - confirmation', defval: 0.67 },
  { id: 'avg', type: 'int', title: 'Averaging Length', defval: 88 },
  { id: 'type', type: 'string', title: 'Measurement Type', defval: 'Contribution', options: [...TYPES] },
  { id: 'diLen', type: 'int', title: 'ADX-DI Length', defval: 11 },
  { id: 'vPR', type: 'int', title: 'Percent Rank Limit', defval: 5 },
  { id: 'bc', type: 'bool', title: 'Include Source', defval: true },
  { id: 'vc', type: 'bool', title: 'Include Volume', defval: false },
  { id: 'pb', type: 'bool', title: 'Print Bands', defval: false },
  { id: 'pobv', type: 'bool', title: 'Print OBV-ADX', defval: false },
  { id: 'xc', type: 'bool', title: 'Extra Highlighting', defval: true },
  { id: 'xn', type: 'bool', title: 'Bernoulli Purest', defval: false },
  { id: 'smo', type: 'int', title: 'Probability Smoother', defval: 3, min: 1 },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'DI Difference', color: '#2962FF', lineWidth: 1, style: 'columns' },
  { id: 'plot1', title: 'Bernoulli', color: '#787B86', lineWidth: 1, style: 'columns' },
  { id: 'plot2', title: 'price', color: '#2962FF', lineWidth: 1 },
  { id: 'plot3', title: 'volume', color: '#FF9800', lineWidth: 1 },
];

export const metadata = {
  title: 'Bernoulli - V3',
  shortTitle: 'Bernoulli',
  overlay: false,
};

type Arr = number[];

export function calculate(
  bars: Bar[],
  inputs: Partial<BernoulliProcessEntropyInputs> = {},
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[] } & { alerts: AlertConditionState[] } {
  const { len, trange, avg, type, diLen, vPR, bc, vc, pb, pobv, xc, xn, smo } = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const S = (a: Arr) => Series.fromArray(bars, a);
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const sma = (a: Arr, l: number) => A(ta.sma(S(a), l));
  const change = (a: Arr, l = 1) => A(ta.change(S(a), l));
  const sum = (a: Arr, l: number) => A(math.sum(S(a), l) as Series);
  const back = (a: Arr, i: number, k: number) => (i - k >= 0 ? a[i - k] : NaN);
  const nz = (v: number, r = 0) => (isNaN(v) ? r : v);

  // Ehlers UltimateSmoother: us = src; from bar_index 4 on the 2-pole formula with us[1], us[2]
  const ultimateSmoother = (src: Arr, period: number): Arr => {
    const a1 = Math.exp((-1.414 * Math.PI) / period);
    const c2 = 2.0 * a1 * Math.cos((1.414 * Math.PI) / period);
    const c3 = -a1 * a1;
    const c1 = (1.0 + c2 - c3) / 4.0;
    const us: Arr = new Array(n);
    for (let i = 0; i < n; i++) {
      us[i] = src[i];
      if (i >= 4) {
        us[i] = (1.0 - c1) * src[i] + (2.0 * c1 - c2) * src[i - 1] - (c1 + c3) * src[i - 2]
          + c2 * nz(us[i - 1]) + c3 * nz(us[i - 2]);
      }
    }
    return us;
  };

  // measure(_type, _src, _lbl)
  const measure = (src: Arr, lbl: number): Arr => {
    switch (type) {
      case 'Value': return src.slice();
      case 'SMA': return sma(src, lbl);
      case 'Change': return sma(change(src), lbl);
      case 'Momentum': return sma(change(src, lbl), lbl);
      case 'Acceleration': return sma(change(change(src, lbl), lbl), lbl);
      case 'Contribution': {
        const s = sum(src, lbl);
        return src.map((v, i) => v / s[i]);
      }
      case '%-Change': {
        const ch = change(src);
        return sma(ch.map((c, i) => c / nz(back(src, i, lbl), src[i])), lbl);
      }
      case 'Volatility': {
        const vaa = src.map((v, i) => Math.log(v / nz(back(src, i, 1), v)));
        const vam = sma(vaa, lbl);
        const sq = sum(vaa.map((v, i) => Math.pow(v - vam[i], 2)), lbl);
        return sq.map((v) => Math.sqrt(v / lbl));
      }
      case 'Elher_smoother': return ultimateSmoother(src, lbl);
      default: return new Array(n).fill(0);
    }
  };

  // n_CDF(_src, _len, _smo): normal CDF approximation of the z-score, smoothed
  const nCdf = (src: Arr, l: number, sm: number): Arr => {
    const xBar = sma(src, l);
    const s = sum(src.map((v, i) => Math.pow(v - xBar[i], 2)), l).map((v) => Math.sqrt(v / (l - 1)));
    const cdf = src.map((v, i) => {
      const z = Math.max(Math.min((v - xBar[i]) / s[i], 5.55), -5.55);
      return 1 / (1 + Math.pow(1 - z / 5.555, 1 / 0.1186));
    });
    return sma(cdf, sm);
  };

  // bern(_src, _avg, _len, _xn): sum over _len bars of the binary entropy term of the clamped percent rank
  const bern = (src: Arr): Arr => {
    const pr = A(ta.percentrank(S(src), avg));
    const term = pr.map((p) => {
      const r2 = Math.min(Math.max(p / 100, 0.001), 0.999);
      return ((xn ? -1 : 1) * r2 * Math.log(r2)) / Math.log(2) - ((1 - r2) * Math.log(1 - r2)) / Math.log(2);
    });
    return sum(term, len);
  };

  const close = bars.map((b) => b.close);
  const cr = measure(close, len);
  const vr = measure(bars.map((b) => Math.log(b.volume ?? NaN)), len);
  const cr2 = xn ? nCdf(cr, len, smo) : cr;
  const vr2 = xn ? nCdf(vr, len, smo) : vr;
  const infoc = bc ? bern(cr2) : new Array(n).fill(0);
  const infov = vc ? bern(vr2) : new Array(n).fill(0);
  // info2 = bc and vc ? infoc - infov : xn ? (infoc + infov) / (-len + 1) : infoc + infov
  const info2 = infoc.map((c, i) => (bc && vc ? c - infov[i] : xn ? (c + infov[i]) / (-len + 1) : c + infov[i]));
  const hvp = A(ta.percentrank(S(info2), avg));

  // obv_adx(_len, _lensig): DI difference of the OBV (true range replaced by RMA of the OBV stdev)
  const obv = A(ta.obv(bars));
  const up = change(obv);
  const down = up.map((v) => -v);
  const plusDM = up.map((u, i) => (isNaN(u) ? NaN : u > down[i] && u > 0 ? u : 0));
  const minusDM = down.map((d, i) => (isNaN(d) ? NaN : d > up[i] && d > 0 ? d : 0));
  const trur = A(ta.rma(ta.stdev(S(obv), diLen), diLen));
  const emaP = A(ta.ema(S(plusDM), diLen));
  const emaM = A(ta.ema(S(minusDM), diLen));
  const plus = fixnan(emaP.map((v, i) => (100 * v) / trur[i]));
  const minus = fixnan(emaM.map((v, i) => (100 * v) / trur[i]));
  const diDiff = plus.map((p, i) => p - minus[i]);
  // diDiff2 = math.sign(info2) == math.sign(diDiff) ? 0 : diDiff
  const diDiff2 = diDiff.map((d, i) => (Math.sign(info2[i]) === Math.sign(d) ? 0 : d));

  const markers: MarkerData[] = [];
  const bernPlot: { time: number; value: number; color: string }[] = [];
  const red50 = String(color.new(color.red, 50));
  const green50 = String(color.new(color.green, 50));
  for (let i = 0; i < n; i++) {
    const t = bars[i].time;
    const v = info2[i];
    const h = hvp[i];
    // col1 = info2 > trange ? green : info2 < -trange ? red : gray
    const col1 = v > trange ? color.green : v < -trange ? color.red : color.gray;
    // col2 adds maroon / lime when the percent rank is extreme and the DI difference disagrees
    const col2 = v > trange && h > 100 - vPR && diDiff2[i] !== 0 ? color.maroon
      : v < -trange && h < vPR && diDiff2[i] !== 0 ? color.lime
        : col1;
    bernPlot.push({ time: t, value: v, color: xc ? col2 : col1 });
    const bigMove = Math.abs(v) > Math.abs(trange);
    // green_arrows: triangledown at info2 in red 50; red_arrows: triangleup at info2 in green 50
    if (h > 100 - vPR && bigMove && v >= trange) {
      markers.push({ time: t, position: 'atPriceMiddle', price: v, shape: 'triangleDown', color: red50, size: 'tiny' });
    }
    if (h < vPR && bigMove && v <= trange) {
      markers.push({ time: t, position: 'atPriceMiddle', price: v, shape: 'triangleUp', color: green50, size: 'tiny' });
    }
  }

  // downAlert = hvp[1] < 100 - vPR and hvp > 100 - vPR; upAlert = hvp[1] > vPR and hvp < vPR
  const prevHvp = (i: number) => (i > 0 ? hvp[i - 1] : NaN);
  const downFlags = hvp.map((h, i) => prevHvp(i) < 100 - vPR && h > 100 - vPR);
  const upFlags = hvp.map((h, i) => prevHvp(i) > vPR && h < vPR);

  const bands = pb && bc && vc && !xn;
  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {
      plot0: bars.map((b, i) => ({ time: b.time, value: pobv ? diDiff2[i] / 10 : NaN })),
      plot1: bernPlot,
      plot2: bars.map((b, i) => ({ time: b.time, value: bands ? infoc[i] : NaN })),
      plot3: bars.map((b, i) => ({ time: b.time, value: bands ? -infov[i] : NaN })),
    },
    markers,
    alerts: alertStates(alertConditions, bars, [downFlags, upFlags]),
  };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'Alert on Down Triangle', message: 'Bernoulli Down Triangle!' },
  { id: 'alert1', title: 'Alert on Up Triangle', message: 'Bernoulli Up Triangle!' },
];

export const BernoulliProcessEntropy = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  alertConditions,
};
