/**
 * Advanced Volume-Driven Breakout Signals
 *
 * The volume is split by candle direction (bull volume on up candles, bear volume on down candles). A breakout is a
 * crossover of the bull (bear) volume above its moving average * a multiplier. Volume spikes are crossovers of the
 * volume above the volume MA * a threshold multiplier (significant) or half of it (high). Buy / sell labels need a
 * breakout without a spike, and optionally a relative volume (volume / its MA) above a threshold and a cumulative net
 * volume (CNV) above / below its MA. Overextension arrows mark spikes on up / down candles without a breakout. Bar
 * colours show the raw breakout and spike states; an optional background shows the CNV state.
 * Alerts (alertcondition, `alerts` of the result): buy volume, sell volume, bullish and bearish overextension, each
 * while its alert input is on.
 *
 * Reference: "Advanced Volume-Driven Breakout Signals" by VolumeVigilante
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © VolumeVigilante
 */

import { ta, Series, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { MarkerData, BarColorData, BgColorData } from '../types';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

export type AdvancedVolumeDrivenBreakoutSignalsMaType = 'SMA' | 'EMA' | 'WMA' | 'HMA' | 'VWMA';

export interface AdvancedVolumeDrivenBreakoutSignalsInputs {
  /** Alert inputs: the conditions of `alerts` are false while their input is off */
  enableBuyVolumeAlerts: boolean;
  enableSellVolumeAlerts: boolean;
  enableBullishOverextensionAlerts: boolean;
  enableBearishOverextensionAlerts: boolean;
  showOverextensionSignals: boolean;
  showBuySellLabels: boolean;
  showCnvBackground: boolean;
  vfMaType: AdvancedVolumeDrivenBreakoutSignalsMaType;
  vfMaPeriod: number;
  vfBreakoutMultiplier: number;
  vsMaType: AdvancedVolumeDrivenBreakoutSignalsMaType;
  vsMaPeriod: number;
  vsThresholdMultiplier: number;
  useRvol: boolean;
  rvolMaType: AdvancedVolumeDrivenBreakoutSignalsMaType;
  rvolMaPeriod: number;
  rvolThreshold: number;
  useCnv: boolean;
  cnvMaType: AdvancedVolumeDrivenBreakoutSignalsMaType;
  cnvMaPeriod: number;
}

export const defaultInputs: AdvancedVolumeDrivenBreakoutSignalsInputs = {
  enableBuyVolumeAlerts: true,
  enableSellVolumeAlerts: true,
  enableBullishOverextensionAlerts: false,
  enableBearishOverextensionAlerts: false,
  showOverextensionSignals: false,
  showBuySellLabels: true,
  showCnvBackground: false,
  vfMaType: 'VWMA',
  vfMaPeriod: 20,
  vfBreakoutMultiplier: 2.0,
  vsMaType: 'VWMA',
  vsMaPeriod: 20,
  vsThresholdMultiplier: 4.0,
  useRvol: false,
  rvolMaType: 'VWMA',
  rvolMaPeriod: 10,
  rvolThreshold: 2.0,
  useCnv: false,
  cnvMaType: 'VWMA',
  cnvMaPeriod: 10,
};

const MA_TYPES: AdvancedVolumeDrivenBreakoutSignalsMaType[] = ['SMA', 'EMA', 'WMA', 'HMA', 'VWMA'];

export const inputConfig: InputConfig[] = [
  { id: 'enableBuyVolumeAlerts', type: 'bool', title: 'Enable Buy Volume Alerts', defval: true, group: 'Alert Settings' },
  { id: 'enableSellVolumeAlerts', type: 'bool', title: 'Enable Sell Volume Alerts', defval: true, group: 'Alert Settings' },
  { id: 'enableBullishOverextensionAlerts', type: 'bool', title: 'Enable Bullish Overextension Alerts', defval: false, group: 'Alert Settings' },
  { id: 'enableBearishOverextensionAlerts', type: 'bool', title: 'Enable Bearish Overextension Alerts', defval: false, group: 'Alert Settings' },
  { id: 'showOverextensionSignals', type: 'bool', title: 'Show Overextension Signals', defval: false, group: 'Display Settings' },
  { id: 'showBuySellLabels', type: 'bool', title: 'Show Buy/Sell Volume Labels', defval: true, group: 'Display Settings' },
  { id: 'showCnvBackground', type: 'bool', title: 'Show CNV Background', defval: false, group: 'Display Settings' },
  { id: 'vfMaType', type: 'string', title: 'MA Type for VF', defval: 'VWMA', options: MA_TYPES, group: 'Volume Flow (VF) Settings' },
  { id: 'vfMaPeriod', type: 'int', title: 'MA Period for VF', defval: 20, min: 1, group: 'Volume Flow (VF) Settings' },
  { id: 'vfBreakoutMultiplier', type: 'float', title: 'Breakout Multiplier for VF', defval: 2.0, min: 0.0, step: 0.1, group: 'Volume Flow (VF) Settings' },
  { id: 'vsMaType', type: 'string', title: 'MA Type for VS Threshold', defval: 'VWMA', options: MA_TYPES, group: 'Volume Spike (VS) Settings' },
  { id: 'vsMaPeriod', type: 'int', title: 'MA Period for VS Threshold', defval: 20, min: 1, group: 'Volume Spike (VS) Settings' },
  { id: 'vsThresholdMultiplier', type: 'float', title: 'Threshold Multiplier for VS', defval: 4.0, min: 0.0, step: 0.1, group: 'Volume Spike (VS) Settings' },
  { id: 'useRvol', type: 'bool', title: 'Use Relative Volume Filter', defval: false, group: 'Relative Volume (RVOL) Filter' },
  { id: 'rvolMaType', type: 'string', title: 'MA Type for RVOL', defval: 'VWMA', options: MA_TYPES, group: 'Relative Volume (RVOL) Filter' },
  { id: 'rvolMaPeriod', type: 'int', title: 'MA Period for RVOL', defval: 10, min: 1, group: 'Relative Volume (RVOL) Filter' },
  { id: 'rvolThreshold', type: 'float', title: 'RVOL Threshold', defval: 2.0, min: 0.0, step: 0.1, group: 'Relative Volume (RVOL) Filter' },
  { id: 'useCnv', type: 'bool', title: 'Use CNV Filter', defval: false, group: 'Cumulative Net Volume (CNV) Filter' },
  { id: 'cnvMaType', type: 'string', title: 'MA Type for CNV', defval: 'VWMA', options: MA_TYPES, group: 'Cumulative Net Volume (CNV) Filter' },
  { id: 'cnvMaPeriod', type: 'int', title: 'MA Period for CNV', defval: 10, min: 1, group: 'Cumulative Net Volume (CNV) Filter' },
];

// No plot(): the outputs are bar colours, a background colour and plotshape markers
export const plotConfig: PlotConfig[] = [];

export const metadata = {
  title: 'VolumeVigilante | Advanced Volume-Driven Breakout Signals',
  shortTitle: 'VolumeVigilante | Advanced Volume-Driven Breakout Signals',
  overlay: true,
};

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const le = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(a - b > EPS);

const OFFSET_POINTS = 0.02;
const VS_MID_DIV = 2.0;
const INFO_COLOR = '#2962FF';
const BEAR_COLOR = '#FF5252';

export function calculate(
  bars: Bar[],
  inputs: Partial<AdvancedVolumeDrivenBreakoutSignalsInputs> = {},
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[]; barColors: BarColorData[]; bgColors: BgColorData[] }
  & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const S = (a: number[]) => Series.fromArray(bars, a);
  const volume = bars.map((b) => b.volume ?? NaN);
  const volumeS = S(volume);

  // calculateMa(maType, source, length): every candidate runs on every bar; the switch picks one
  const calculateMa = (maType: string, source: number[], length: number): number[] => {
    switch (maType) {
      case 'SMA': return A(ta.sma(S(source), length));
      case 'EMA': return A(ta.ema(S(source), length));
      case 'WMA': return A(ta.wma(S(source), length));
      case 'HMA': {
        // ta.wma(2 * ta.wma(source, length / 2) - ta.wma(source, length), math.round(math.sqrt(length))):
        // length / 2 keeps the fractional quotient (Pine v6); ta.wma uses the integer part of its length
        const half = A(ta.wma(S(source), length / 2));
        const full = A(ta.wma(S(source), length));
        return A(ta.wma(S(half.map((v, i) => 2 * v - full[i])), Math.round(Math.sqrt(length))));
      }
      case 'VWMA': return A(ta.vwma(S(source), length, volumeS));
      default: return new Array(n).fill(NaN);
    }
  };

  // Volume split (candle direction)
  const bullVolume = bars.map((b, i) => (gt(b.close, b.open) ? volume[i] : 0.0));
  const bearVolume = bars.map((b, i) => (gt(b.open, b.close) ? volume[i] : 0.0));

  // RVOL
  const avgVolume = cfg.useRvol ? calculateMa(cfg.rvolMaType, volume, cfg.rvolMaPeriod) : new Array(n).fill(NaN);
  const rvol = volume.map((v, i) => (cfg.useRvol ? v / avgVolume[i] : NaN));

  // Volume spike thresholds
  const vsMa = calculateMa(cfg.vsMaType, volume, cfg.vsMaPeriod);
  const vsHighThreshold = vsMa.map((v) => v * cfg.vsThresholdMultiplier);
  const vsMidThreshold = vsHighThreshold.map((v) => v / VS_MID_DIV);

  // Volume flow baselines
  const bullMa = calculateMa(cfg.vfMaType, bullVolume, cfg.vfMaPeriod);
  const bearMa = calculateMa(cfg.vfMaType, bearVolume, cfg.vfMaPeriod);

  // Breakout signals and spike states (ta.crossover compares exactly)
  const cross = (a: number[], b: number[]) => ta.crossover(S(a), S(b)).toArray().map((v) => !!v);
  const buyVolumeSignal = cross(bullVolume, bullMa.map((v) => v * cfg.vfBreakoutMultiplier));
  const sellVolumeSignal = cross(bearVolume, bearMa.map((v) => v * cfg.vfBreakoutMultiplier));
  const vsSignificant = cross(volume, vsHighThreshold);
  const vsHigh = cross(volume, vsMidThreshold);

  // CNV
  const closeArr = bars.map((b) => b.close);
  const priceChange = A(ta.change(S(closeArr)));
  const netVolume = priceChange.map((c, i) => (gt(c, 0) ? volume[i] : lt(c, 0) ? -volume[i] : 0.0));
  let smoothedCnv: number[] = new Array(n).fill(NaN);
  if (cfg.useCnv) {
    const cumulativeNetVolume = A(ta.cum(S(netVolume)));
    const cnvMa = calculateMa(cfg.cnvMaType, cumulativeNetVolume, cfg.cnvMaPeriod);
    smoothedCnv = cumulativeNetVolume.map((v, i) => v - cnvMa[i]);
  }

  const vsHighColor = String(color.rgb(255, 165, 0, 25));
  const vsSignifColor = String(color.rgb(255, 255, 0, 25));
  const cnvBullBg = String(color.new(INFO_COLOR, 85));
  const cnvBearBg = String(color.new(BEAR_COLOR, 85));

  const markers: MarkerData[] = [];
  const barColors: BarColorData[] = [];
  const bgColors: BgColorData[] = [];
  const alertFlags: boolean[][] = [[], [], [], []];
  for (let i = 0; i < n; i++) {
    const b = bars[i];
    const cnvBullishCondition = cfg.useCnv ? gt(smoothedCnv[i], 0) : true;
    const cnvBearishCondition = cfg.useCnv ? le(smoothedCnv[i], 0) : true;
    const rvolOk = !cfg.useRvol || gt(rvol[i], cfg.rvolThreshold);
    const spikeBlock = vsHigh[i] || vsSignificant[i];
    const buyVolumeCondition = buyVolumeSignal[i] && rvolOk && cnvBullishCondition && !spikeBlock;
    const sellVolumeCondition = sellVolumeSignal[i] && rvolOk && cnvBearishCondition && !spikeBlock;
    const bearishOverextension = spikeBlock && lt(b.close, b.open) && rvolOk && !sellVolumeSignal[i];
    const bullishOverextension = spikeBlock && gt(b.close, b.open) && rvolOk && !buyVolumeSignal[i];
    alertFlags[0].push(cfg.enableBuyVolumeAlerts && buyVolumeCondition);
    alertFlags[1].push(cfg.enableSellVolumeAlerts && sellVolumeCondition);
    alertFlags[2].push(cfg.enableBullishOverextensionAlerts && bullishOverextension);
    alertFlags[3].push(cfg.enableBearishOverextensionAlerts && bearishOverextension);

    // barcolor(buyVolumeSignal ? INFO : sellVolumeSignal ? BEAR : vsHigh ? VS_HIGH : vsSignificant ? VS_SIGNIF : na)
    const bc = buyVolumeSignal[i] ? INFO_COLOR : sellVolumeSignal[i] ? BEAR_COLOR
      : vsHigh[i] ? vsHighColor : vsSignificant[i] ? vsSignifColor : null;
    if (bc) barColors.push({ time: b.time, color: bc });

    // bgcolor(showCnvBackground and useCnv ? (cnvBullishCondition ? CNV_BULL_BG : CNV_BEAR_BG) : na)
    if (cfg.showCnvBackground && cfg.useCnv) {
      bgColors.push({ time: b.time, color: cnvBullishCondition ? cnvBullBg : cnvBearBg });
    }

    // plotshape series: a price (low - 0.02, high + 0.02, ...) when the condition holds, else na; the location is
    // abovebar / belowbar, so the price only decides whether the shape is drawn
    if (cfg.showBuySellLabels && buyVolumeCondition && !isNaN(b.low - OFFSET_POINTS)) {
      markers.push({ time: b.time, position: 'belowBar', shape: 'labelUp', color: INFO_COLOR, text: 'BUY VOL',
        textColor: color.white, size: 'tiny' });
    }
    if (cfg.showBuySellLabels && sellVolumeCondition && !isNaN(b.high + OFFSET_POINTS)) {
      markers.push({ time: b.time, position: 'aboveBar', shape: 'labelDown', color: BEAR_COLOR, text: 'SELL VOL',
        textColor: color.white, size: 'tiny' });
    }
    // "Bearish Overextension Signal": arrow up below the bar; "Bullish Overextension Signal": arrow down above the bar
    if (cfg.showOverextensionSignals && bearishOverextension && !isNaN(b.high + OFFSET_POINTS * 4)) {
      markers.push({ time: b.time, position: 'belowBar', shape: 'arrowUp', color: INFO_COLOR, text: 'OVER',
        textColor: color.white, size: 'tiny' });
    }
    if (cfg.showOverextensionSignals && bullishOverextension && !isNaN(b.low - OFFSET_POINTS * 4)) {
      markers.push({ time: b.time, position: 'aboveBar', shape: 'arrowDown', color: BEAR_COLOR, text: 'OVER',
        textColor: color.white, size: 'tiny' });
    }
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {},
    markers,
    barColors,
    bgColors,
    // 4 alertconditions: buy volume, sell volume, bullish / bearish overextension
    alerts: alertStates(alertConditions, bars, alertFlags),
  };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'Volume Vigilante | AVDBS | Buy Volume', message: 'VV AVDBS: Buy Volume signal detected on {{ticker}}.' },
  { id: 'alert1', title: 'Volume Vigilante | AVDBS | Sell Volume', message: 'VV AVDBS: Sell Volume signal detected on {{ticker}}.' },
  { id: 'alert2', title: 'Volume Vigilante | AVDBS | Bullish Overextension', message: 'VV AVDBS: Bullish overextension detected on {{ticker}}.' },
  { id: 'alert3', title: 'Volume Vigilante | AVDBS | Bearish Overextension', message: 'VV AVDBS: Bearish overextension detected on {{ticker}}.' },
];

export const AdvancedVolumeDrivenBreakoutSignals = { calculate, metadata, defaultInputs, inputConfig, plotConfig, alertConditions };
