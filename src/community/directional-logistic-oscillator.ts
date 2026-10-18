/**
 * Directional Logistic Oscillator
 *
 * +DI, -DI and ADX of the DMI are each turned into a probability with a logistic function of their distance to
 * their long SMA (mean lookback), smoothed by an EMA. The net directional probability (+DI minus -DI) times the ADX
 * probability and the scale is bounded by tanh and smoothed by an EMA: the market strength columns. The column and
 * bar colours are strong when the strength is beyond its EMA, weak otherwise. Mean-reversion marks: the SMA / EMA
 * of the strength crossing up its 10th / 5th percentile or down its 90th / 95th percentile (mean lookback window).
 * Reversion marks: turns of an EMA of the strength SMA. A background tint shows strength and its EMA both beyond
 * +/-0.5. With "Allow Intrabar Updating" off, every output uses the values of the previous bar.
 * Alerts (alertcondition, `alerts` of the result, on the current bar's values whatever "Allow Intrabar Updating"):
 * '[DLO] Reversion Up' / '[DLO] Reversion Down' (cycle turns), '[DLO] MR Buy' / '[DLO] MR Sell' (percentile
 * crosses), '[DLO] Osc Bullish Cross' / '[DLO] Osc Bearish Cross' (strength crossing 0).
 *
 * Reference: "Directional Logistic Oscillator | GainzAlgo" by GainzAlgo
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 */

import { ta, Series, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { MarkerData, BarColorData, BgColorData } from '../types';
import { alertStates, crossedOver, crossedUnder, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

export interface DirectionalLogisticOscillatorInputs {
  /** DMI DI length (also the ADX smoothing) */
  diLength: number;
  /** SMA lookback of the logistic means and window of the percentile thresholds */
  meanLookback: number;
  /** Logistic slope */
  slope: number;
  /** EMA length of the probabilities and of the bounded strength */
  smoothLength: number;
  /** Multiplier before tanh */
  oscScale: number;
  /** SMA / EMA length of the strength */
  oscSmoothLength: number;
  buyColor: string;
  sellColor: string;
  /** Plot the reversion marks */
  plotReversion: boolean;
  /** Plot the mean-reversion marks */
  plotMeanReversion: boolean;
  /** Plot the oscillator SMA */
  plotMA: boolean;
  /** Off: every output uses the values of the previous bar */
  intrabar: boolean;
}

export const defaultInputs: DirectionalLogisticOscillatorInputs = {
  diLength: 14,
  meanLookback: 360,
  slope: 0.18,
  smoothLength: 3,
  oscScale: 2.5,
  oscSmoothLength: 7,
  buyColor: '#00ffaa',
  sellColor: '#ff0000',
  plotReversion: true,
  plotMeanReversion: true,
  plotMA: false,
  intrabar: true,
};

export const inputConfig: InputConfig[] = [
  { id: 'diLength', type: 'int', title: 'DI Length', defval: 14, min: 1 },
  { id: 'meanLookback', type: 'int', title: 'Mean Lookback', defval: 360 },
  { id: 'slope', type: 'float', title: 'LR Slope (higher = steeper)', defval: 0.18, step: 0.02 },
  { id: 'smoothLength', type: 'int', title: 'Probability Smoothing (EMA)', defval: 3, min: 1, max: 9 },
  { id: 'oscScale', type: 'float', title: 'Oscillator Scale (pre-tanh)', defval: 2.5, step: 0.1 },
  { id: 'oscSmoothLength', type: 'int', title: 'Oscillator Smoothing Length', defval: 7 },
  { id: 'buyColor', type: 'color', title: 'Buy Color', defval: '#00ffaa' },
  { id: 'sellColor', type: 'color', title: 'Sell Color', defval: '#ff0000' },
  { id: 'plotReversion', type: 'bool', title: 'Plot Reversion Signals', defval: true },
  { id: 'plotMeanReversion', type: 'bool', title: 'Plot Mean-Reversion Signals', defval: true },
  { id: 'plotMA', type: 'bool', title: 'Plot Oscillator MA', defval: false },
  { id: 'intrabar', type: 'bool', title: 'Allow Intrabar Updating', defval: true },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Market Strength', color: '#00ffaa', lineWidth: 2, style: 'columns' },
  { id: 'plot1', title: 'Osc MA', color: '#1400c5', lineWidth: 3 },
];

export const metadata = {
  title: 'Directional Logistic Oscillator | GainzAlgo',
  shortTitle: 'DLO',
  overlay: false,
};

/** Pine a > b: true only when a - b > 1e-10 (float comparison tolerance); false when a value is na */
const gt = (a: number, b: number) => a - b > 1e-10;
/** Pine a < b */
const lt = (a: number, b: number) => b - a > 1e-10;

export function calculate(
  bars: Bar[],
  inputs: Partial<DirectionalLogisticOscillatorInputs> = {},
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[]; barColors: BarColorData[]; bgColors: BgColorData[] }
  & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const S = (a: number[]) => Series.fromArray(bars, a);
  const upStrong = cfg.buyColor;
  const dnStrong = cfg.sellColor;

  // tanh(x) of the script: e2x = math.exp(2 * x); (e2x - 1) / (e2x + 1)
  const tanh = (x: number) => {
    const e2x = Math.exp(2 * x);
    return (e2x - 1) / (e2x + 1);
  };
  // logistic_prob(series): mean = ta.sma(series, mean_lb); z = (series - mean) * slope;
  // prob_raw = 1.0 / (1.0 + math.exp(-z)); ta.ema(prob_raw, smooth_len)
  const logisticProb = (series: number[]) => {
    const mean = A(ta.sma(S(series), cfg.meanLookback));
    const probRaw = series.map((v, k) => 1.0 / (1.0 + Math.exp(-((v - mean[k]) * cfg.slope))));
    return A(ta.ema(S(probRaw), cfg.smoothLength));
  };

  // [plus_di, minus_di, adx] = ta.dmi(di_len, di_len)
  const [plusS, minusS, adxS] = ta.dmi(bars, cfg.diLength, cfg.diLength);
  const probPlus = logisticProb(A(plusS));
  const probMinus = logisticProb(A(minusS));
  const probAdx = logisticProb(A(adxS));

  // strength = ta.ema(tanh((prob_plus - prob_minus) * prob_adx * osc_scale), smooth_len)
  const bounded = probPlus.map((p, k) => tanh((p - probMinus[k]) * probAdx[k] * cfg.oscScale));
  const strength = A(ta.ema(S(bounded), cfg.smoothLength));

  // s_sma = ta.sma(strength, osc_smooth_len); s_ema = ta.ema(...); s_sma_cycle = ta.ema(s_sma, math.ceil(len / 2))
  const sSma = A(ta.sma(S(strength), cfg.oscSmoothLength));
  const sEma = A(ta.ema(S(strength), cfg.oscSmoothLength));
  const sSmaCycle = A(ta.ema(S(sSma), Math.ceil(cfg.oscSmoothLength / 2)));

  // percentile thresholds over mean_lb bars
  const lowerSma = A(ta.percentile_nearest_rank(S(sSma), cfg.meanLookback, 10));
  const upperSma = A(ta.percentile_nearest_rank(S(sSma), cfg.meanLookback, 90));
  const lowerEma = A(ta.percentile_nearest_rank(S(sEma), cfg.meanLookback, 5));
  const upperEma = A(ta.percentile_nearest_rank(S(sEma), cfg.meanLookback, 95));

  // ta.crossover(a, b): a > b and a[1] <= b[1]; ta.crossunder(a, b): a < b and a[1] >= b[1]
  // (exact comparisons: ta.crossover / ta.crossunder do not use the 1e-10 tolerance of the operators)
  const crossover = (a: number[], b: number[], k: number) =>
    k > 0 && a[k] > b[k] && !isNaN(a[k - 1]) && !isNaN(b[k - 1]) && !(a[k - 1] > b[k - 1]);
  const crossunder = (a: number[], b: number[], k: number) =>
    k > 0 && a[k] < b[k] && !isNaN(a[k - 1]) && !isNaN(b[k - 1]) && !(a[k - 1] < b[k - 1]);
  const cyc = (k: number) => (k >= 0 ? sSmaCycle[k] : NaN);

  const mrBuy: boolean[] = new Array(n);
  const mrSell: boolean[] = new Array(n);
  const revUp: boolean[] = new Array(n);
  const revDn: boolean[] = new Array(n);
  for (let k = 0; k < n; k++) {
    mrBuy[k] = crossover(sSma, lowerSma, k) || crossover(sEma, lowerEma, k);
    mrSell[k] = crossunder(sSma, upperSma, k) || crossunder(sEma, upperEma, k);
    // rev_up_c = s_sma_cycle > s_sma_cycle[1] and not (s_sma_cycle[1] > s_sma_cycle[2])
    revUp[k] = gt(cyc(k), cyc(k - 1)) && !gt(cyc(k - 1), cyc(k - 2));
    revDn[k] = lt(cyc(k), cyc(k - 1)) && !lt(cyc(k - 1), cyc(k - 2));
  }

  const upWeak = String(color.new(upStrong, 70));
  const dnWeak = String(color.new(dnStrong, 70));
  // i = intrabar ? 0 : 1: every output reads its series i bars back (na / false before the first bar)
  const off = cfg.intrabar ? 0 : 1;
  const num = (a: number[], k: number) => (k - off >= 0 ? a[k - off] : NaN);
  const flag = (a: boolean[], k: number) => k - off >= 0 && a[k - off];

  const strengthPlot: { time: number; value: number; color: string }[] = [];
  const maPlot: { time: number; value: number }[] = [];
  const markers: MarkerData[] = [];
  const barColors: BarColorData[] = [];
  const bgColors: BgColorData[] = [];
  for (let k = 0; k < n; k++) {
    const t = bars[k].time;
    const s = num(strength, k);
    const e = num(sEma, k);
    // strength_col = strength[i] > 0 ? (strength[i] > s_ema[i] ? up_strong : up_weak)
    //                                : (strength[i] < s_ema[i] ? dn_strong : dn_weak)   (na: dn_weak)
    const col = gt(s, 0) ? (gt(s, e) ? upStrong : upWeak) : lt(s, e) ? dnStrong : dnWeak;
    strengthPlot.push({ time: t, value: s, color: col });
    // plot(plot_ma ? s_sma[i] : na, "Osc MA")
    maPlot.push({ time: t, value: cfg.plotMA ? num(sSma, k) : NaN });

    // plotchar(..., location.belowbar / abovebar, size = size.tiny, force_overlay = true)
    if (cfg.plotMeanReversion && flag(mrBuy, k)) {
      markers.push({ time: t, position: 'belowBar', shape: 'circle', color: 'transparent', text: '▲',
        textColor: upStrong, size: 'tiny', forceOverlay: true });
    }
    if (cfg.plotMeanReversion && flag(mrSell, k)) {
      markers.push({ time: t, position: 'aboveBar', shape: 'circle', color: 'transparent', text: '▼',
        textColor: dnStrong, size: 'tiny', forceOverlay: true });
    }
    if (cfg.plotReversion && flag(revUp, k)) {
      markers.push({ time: t, position: 'belowBar', shape: 'circle', color: 'transparent', text: '⬆',
        textColor: upStrong, size: 'tiny', forceOverlay: true });
    }
    if (cfg.plotReversion && flag(revDn, k)) {
      markers.push({ time: t, position: 'aboveBar', shape: 'circle', color: 'transparent', text: '⬇',
        textColor: dnStrong, size: 'tiny', forceOverlay: true });
    }

    // bgcolor(strength[i] > 0.5 and s_ema[i] > 0.5 ? color.new(up, 95) : strength[i] < -0.5 and s_ema[i] < -0.5 ? ...)
    if (gt(s, 0.5) && gt(e, 0.5)) bgColors.push({ time: t, color: String(color.new(upStrong, 95)) });
    else if (lt(s, -0.5) && lt(e, -0.5)) bgColors.push({ time: t, color: String(color.new(dnStrong, 95)) });
    // barcolor(strength_col)
    barColors.push({ time: t, color: col });
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: { plot0: strengthPlot, plot1: maPlot },
    hlines: [
      { value: 0, options: { title: 'Zero', color: color.gray, linestyle: 'dashed' } },
      { value: 0.5, options: { title: 'Strong +', color: upWeak, linestyle: 'dotted' } },
      { value: -0.5, options: { title: 'Strong -', color: dnWeak, linestyle: 'dotted' } },
    ],
    markers,
    barColors,
    bgColors,
    // alertcondition(rev_up_c) / (rev_dn_c) / (bc1 or bc2) / (sc1 or sc2) / (ta.crossover(strength, 0)) /
    // (ta.crossunder(strength, 0))
    alerts: alertStates(alertConditions, bars, [
      revUp, revDn, mrBuy, mrSell, crossedOver(strength, 0), crossedUnder(strength, 0),
    ]),
  };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: '[DLO] Reversion Up', message: 'DLO: Potential bullish reversion detected (cycle turning upward)' },
  { id: 'alert1', title: '[DLO] Reversion Down', message: 'DLO: Potential bearish reversion detected (cycle turning downward)' },
  { id: 'alert2', title: '[DLO] MR Buy', message: 'DLO: Mean-reversion BUY – oscillator crossed up from extreme oversold zone (percentile-based)' },
  { id: 'alert3', title: '[DLO] MR Sell', message: 'DLO: Mean-reversion SELL – oscillator crossed down from extreme overbought zone (percentile-based)' },
  { id: 'alert4', title: '[DLO] Osc Bullish Cross', message: 'DLO: Oscillator crossed above zero → bullish momentum shift' },
  { id: 'alert5', title: '[DLO] Osc Bearish Cross', message: 'DLO: Oscillator crossed below zero → bearish momentum shift' },
];

export const DirectionalLogisticOscillator = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  alertConditions,
};
