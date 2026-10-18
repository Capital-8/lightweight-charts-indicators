/**
 * Directional Indicator Crossovers v1
 *
 * Wilder's directional movement with a choice of smoothing (EMA by default, or Wilder's RMA): +DI = 100 *
 * smooth(+DM) / smooth(TR), -DI = 100 * smooth(-DM) / smooth(TR), ADX = 100 * smooth(|+DI - -DI| / (+DI + -DI)).
 * The area between +DI and -DI is shaded green while +DI leads and red while -DI leads; dots at the top / bottom of
 * the pane mark the crossings of +DI over -DI and of -DI over +DI (optionally only while ADX is above a threshold).
 * Alerts (alertcondition, `alerts` of the result): 'Bullish DI Crossover' / 'Bearish DI Crossover' on the bars of
 * those crossings (with the ADX filter when it is on; whether the dots are shown or not).
 *
 * Reference: "Directional Indicator Crossovers v1[JopAlgo]" by JopAlgo
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © 2025 JopAlgo [JopAlgo]. Concept: Directional Movement Index (DMI) and Average Directional
 * Index (ADX) by J. Welles Wilder Jr. (1978).
 */

import { ta, Series, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { MarkerData } from '../types';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

export interface DirectionalIndicatorCrossoversV1Inputs {
  /** DI length */
  dilen: number;
  /** ADX length */
  adxLen: number;
  /** Smoothing: 'EMA' or 'Wilder' (RMA) */
  sMethod: 'EMA' | 'Wilder';
  /** Shade the +DI / -DI control zones */
  showFill: boolean;
  /** Mark the crossovers */
  showMarks: boolean;
  /** Show the ADX line */
  showADX: boolean;
  /** Keep only the crossovers with ADX above the threshold */
  useAdxFilt: boolean;
  adxThr: number;
}

export const defaultInputs: DirectionalIndicatorCrossoversV1Inputs = {
  dilen: 20,
  adxLen: 20,
  sMethod: 'EMA',
  showFill: true,
  showMarks: true,
  showADX: false,
  useAdxFilt: false,
  adxThr: 20.0,
};

export const inputConfig: InputConfig[] = [
  { id: 'dilen', type: 'int', title: 'DI Length', defval: 20, min: 1 },
  { id: 'adxLen', type: 'int', title: 'ADX Length', defval: 20, min: 1 },
  { id: 'sMethod', type: 'string', title: 'Smoothing', defval: 'EMA', options: ['EMA', 'Wilder'] },
  { id: 'showFill', type: 'bool', title: 'Shade Control Zones', defval: true },
  { id: 'showMarks', type: 'bool', title: 'Mark Crossovers', defval: true },
  { id: 'showADX', type: 'bool', title: 'Show ADX Line', defval: false },
  { id: 'useAdxFilt', type: 'bool', title: 'Filter Crossovers by ADX', defval: false },
  { id: 'adxThr', type: 'float', title: 'ADX Threshold', defval: 20.0, min: 0 },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: '+DI', color: color.lime, lineWidth: 2, style: 'stepline' },
  { id: 'plot1', title: '-DI', color: color.red, lineWidth: 2, style: 'stepline' },
  { id: 'plot2', title: 'ADX', color: String(color.new(color.white, 0)), lineWidth: 2, visible: 'showADX' },
];

export const metadata = {
  title: 'Directional Indicator Crossovers v1[JopAlgo]',
  shortTitle: 'DIXV1',
  overlay: false,
};

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const eq = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(a - b > EPS) && !(b - a > EPS);

export function calculate(
  bars: Bar[],
  inputs: Partial<DirectionalIndicatorCrossoversV1Inputs> = {},
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[] } & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const S = (a: number[]) => Series.fromArray(bars, a);
  // smooth(src, len) => sMethod == "EMA" ? ta.ema(src, len) : ta.rma(src, len)
  const smooth = (a: number[], len: number) => A(cfg.sMethod === 'EMA' ? ta.ema(S(a), len) : ta.rma(S(a), len));

  // up = ta.change(high); down = -ta.change(low)
  const plusDM = bars.map((b, i) => {
    const up = i > 0 ? b.high - bars[i - 1].high : NaN;
    const down = i > 0 ? -(b.low - bars[i - 1].low) : NaN;
    return gt(up, down) && gt(up, 0) ? up : 0.0;
  });
  const minusDM = bars.map((b, i) => {
    const up = i > 0 ? b.high - bars[i - 1].high : NaN;
    const down = i > 0 ? -(b.low - bars[i - 1].low) : NaN;
    return gt(down, up) && gt(down, 0) ? down : 0.0;
  });

  // tr = ta.tr (na on the first bar); den = math.max(smooth(tr, dilen), 1e-10) (na with an na argument)
  const tr = A(ta.tr(bars, false));
  const den = smooth(tr, cfg.dilen).map((v) => (isNaN(v) ? NaN : Math.max(v, 1e-10)));
  const sPlus = smooth(plusDM, cfg.dilen);
  const sMinus = smooth(minusDM, cfg.dilen);
  const plusDI = sPlus.map((v, i) => (100.0 * v) / den[i]);
  const minusDI = sMinus.map((v, i) => (100.0 * v) / den[i]);

  // dx = sumDI == 0 ? 0.0 : math.abs(plusDI - minusDI) / sumDI; adx = 100.0 * smooth(dx, adxLen)
  const dx = plusDI.map((p, i) => {
    const sumDI = p + minusDI[i];
    return eq(sumDI, 0) ? 0.0 : Math.abs(p - minusDI[i]) / sumDI;
  });
  const adx = smooth(dx, cfg.adxLen).map((v) => 100.0 * v);

  const markers: MarkerData[] = [];
  const bullFlags: boolean[] = [], bearFlags: boolean[] = [];
  // ta.crossover(a, b): a > b and a[1] <= b[1], compared exactly (no 1e-10 tolerance; na compares false)
  const crossover = (a: number[], b: number[], i: number) => i > 0 && a[i] > b[i] && a[i - 1] <= b[i - 1];
  for (let i = 0; i < n; i++) {
    const bullX = crossover(plusDI, minusDI, i);
    const bearX = crossover(minusDI, plusDI, i);
    const sigBull = cfg.useAdxFilt ? bullX && gt(adx[i], cfg.adxThr) : bullX;
    const sigBear = cfg.useAdxFilt ? bearX && gt(adx[i], cfg.adxThr) : bearX;
    bullFlags.push(sigBull);
    bearFlags.push(sigBear);
    // plotshape(showMarks and sigBull, "Bullish DI Crossover", location.top, shape.circle, size.tiny, color.lime)
    if (cfg.showMarks && sigBull) {
      markers.push({ time: bars[i].time, position: 'top', shape: 'circle', color: color.lime, size: 'tiny' });
    }
    // plotshape(showMarks and sigBear, "Bearish DI Crossover", location.bottom, shape.circle, size.tiny, color.red)
    if (cfg.showMarks && sigBear) {
      markers.push({ time: bars[i].time, position: 'bottom', shape: 'circle', color: color.red, size: 'tiny' });
    }
  }

  const bullFill = String(color.new(color.lime, 85));
  const bearFill = String(color.new(color.red, 85));
  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {
      plot0: bars.map((b, i) => ({ time: b.time, value: plusDI[i], color: color.lime })),
      plot1: bars.map((b, i) => ({ time: b.time, value: minusDI[i], color: color.red })),
      // plot(adx, "ADX", color.new(color.white, 0), linewidth = 2, display = showADX ? display.all : display.none)
      plot2: bars.map((b, i) => ({ time: b.time, value: adx[i], color: String(color.new(color.white, 0)) })),
    },
    fills: [
      // fill(pPlus, pMinus, color = (showFill and plusDI > minusDI) ? color.new(color.lime, 85) : na, title = "Bull Zone")
      { plot1: 'plot0', plot2: 'plot1',
        colors: plusDI.map((p, i) => (cfg.showFill && gt(p, minusDI[i]) ? bullFill : 'transparent')) },
      // fill(pMinus, pPlus, color = (showFill and minusDI > plusDI) ? color.new(color.red, 85) : na, title = "Bear Zone")
      { plot1: 'plot1', plot2: 'plot0',
        colors: minusDI.map((m, i) => (cfg.showFill && gt(m, plusDI[i]) ? bearFill : 'transparent')) },
    ],
    markers,
    // alertcondition(sigBull, "Bullish DI Crossover") / alertcondition(sigBear, "Bearish DI Crossover")
    alerts: alertStates(alertConditions, bars, [bullFlags, bearFlags]),
  };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'Bullish DI Crossover', message: 'Bullish DI crossover (+DI over -DI).' },
  { id: 'alert1', title: 'Bearish DI Crossover', message: 'Bearish DI crossover (-DI over +DI).' },
];

export const DirectionalIndicatorCrossoversV1 = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  alertConditions,
};
