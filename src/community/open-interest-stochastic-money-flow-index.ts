/**
 * Open Interest Stochastic Money Flow Index
 *
 * A money flow index where the volume is replaced by the open interest of the futures market of the symbol, read
 * from the weekly Commitments of Traders report (legacy report, futures only, open interest, daily requests); with
 * the market type "OTHERS" the chart volume is used. Money flow over `MFI Period` bars: sums (a loop over the
 * history) of weight * close on up closes and on down closes, MFI = 100 - 100 / (1 + up / down). A stochastic of
 * the MFI over 14 bars (loops of the highest / lowest values) is smoothed twice by an EMA of 4 bars: K, then D.
 * Crosses of K and D are marked on the zero line and in the background; optional bar colours (K above D: green).
 * Alerts (alertcondition, `alerts` of the result): 'Buy Signal' while K is above D, 'Sell Signal' otherwise.
 *
 * The report symbol is COT:<code>_F_OI, with the CFTC code of the symbol root (futures), else of its base
 * currency, else of its quote currency, from the "LibraryCOT" library (version 3, the functions used are ported
 * below). The report is requested in both market types: without data on the last closed bar the script stops with
 * an error. The chart context gives the ticker, currency, root and base currency (see `rootOf` / `basecurrencyOf`
 * for a context without the last two).
 *
 * Reference: "Open Interest Stochastic Money Flow Index" by Noldo (uses the "LibraryCOT" library)
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 */

import { ta, Series, color, type IndicatorResult, type InputConfig, type PlotConfig, type HLineConfig, type FillConfig, type Bar } from 'oakscriptjs';
import type { BarColorData, BgColorData } from '../types';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';
import {
  symbolBarsOf, tickerOf, currencyOf, basecurrencyOf, rootOf, lastBarConfirmedOf, type ChartContext, type SymbolRequest,
} from '../chart-context';
import { otherSymbolChart, securityOtherValues } from '../other-symbol';

export interface OpenInterestStochasticMoneyFlowIndexInputs {
  /** Bar colours: 'ON' or 'OFF' */
  lights: string;
  /** Weight of the money flow: 'FUTURES' (open interest of the report) or 'OTHERS' (volume) */
  adaptive: string;
  /** MFI period */
  tMfi: number;
  /** Oversold level */
  overSold: number;
  /** Overbought level */
  overBought: number;
}

export const defaultInputs: OpenInterestStochasticMoneyFlowIndexInputs = {
  lights: 'OFF',
  adaptive: 'FUTURES',
  tMfi: 14,
  overSold: 20,
  overBought: 80,
};

export const inputConfig: InputConfig[] = [
  { id: 'lights', type: 'string', title: 'Barcolor I / 0 ? ', defval: 'OFF', options: ['ON', 'OFF'] },
  { id: 'adaptive', type: 'string', title: 'Market Type ', defval: 'FUTURES', options: ['FUTURES', 'OTHERS'] },
  { id: 'tMfi', type: 'int', title: 'MFI Period', defval: 14 },
  { id: 'overSold', type: 'int', title: 'Oversold', defval: 20 },
  { id: 'overBought', type: 'int', title: 'Overbought', defval: 80 },
];

const K_COLOR = String(color.new('#0070FF', 0));
const D_COLOR = String(color.new('#FF8C00', 0));
const CROSS_UP_COLOR = String(color.new(color.green, 0));
const CROSS_DOWN_COLOR = String(color.new(color.red, 0));
const LEVEL_COLOR = '#C0C0C0';
const BORDER_COLOR = String(color.new('#66023C', 90));

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'K-line', color: K_COLOR, lineWidth: 1 },
  { id: 'plot1', title: 'D-line', color: D_COLOR, lineWidth: 1 },
  { id: 'plot2', title: 'Crossover', color: CROSS_UP_COLOR, lineWidth: 3, style: 'cross' },
  { id: 'plot3', title: 'Crossunder', color: CROSS_DOWN_COLOR, lineWidth: 3, style: 'cross' },
];

/** hline(OverSold) / hline(OverBought) with the default levels */
export const hlineConfig: HLineConfig[] = [
  { id: 'hline_oversold', price: 20, title: 'Oversold Level', color: LEVEL_COLOR, linestyle: 'dashed' },
  { id: 'hline_overbought', price: 80, title: 'Overbought Level', color: LEVEL_COLOR, linestyle: 'dashed' },
];

/** fill(h1, h2, color.new(#66023C, 90), title = 'Border') */
export const fillConfig: FillConfig[] = [
  { id: 'fill_border', plot1: 'hline_oversold', plot2: 'hline_overbought', color: BORDER_COLOR, title: 'Border' },
];

export const metadata = {
  title: 'Open Interest Stochastic Money Flow Index',
  shortTitle: 'Open Interest Stochastic Money Flow Index',
  overlay: false,
};

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
/** Pine a <= b (false with na) */
const le = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(a - b > EPS);
/** Pine a >= b (false with na) */
const ge = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(b - a > EPS);

// LibraryCOT version 3, createRootCodeMap(): CFTC codes of the futures roots (a later entry replaces an earlier one)
const ROOT_CODES = new Map(
  [
    'AMB1:1450E1 AMT1:1450E4 VM:1170E8 VXM:1170E8 IBHY:2520E1 IBIG:2520E2 VX:1170E1 VX10:117E10 VX11:117E11',
    'VX13:117E13 VX14:117E14 VX15:117E15 VX17:117E17 VX18:117E18 VX19:117E19 VX21:117E21 VX22:117E22',
    'VX23:117E23 VX24:117E24 VX26:117E26 VX27:117E27 VX28:117E28 VX30:117E30 VX31:117E31 VX32:117E32',
    'VX34:117E34 VX35:117E35 VX36:117E36 VX37:117E37 VX39:117E39 VX40:117E40 VX41:117E41 VX43:117E43',
    'VX09:117E09 YIA:342602 YIY:343603 N1S:343604 YIT:342603 TWE:020605 YIC:344606 YIE:320604 25U:046603',
    '30U:046604 35U:046605 40U:046606 45U:046607 50U:046608 55U:046609 60U:046610 YID:344604 YIW:344605',
    'F1S:344615 YIB:344607 BWF:00160F AW:221602 DRS:221604 CWR:00160D ZC:002602 DFN:251605 YM:124603',
    'RX:124606 SAS:005609 10Y:04360Y 2YY:04260Y 30Y:02060Y 5YY:04460Y MYM:124608 XC:002603 XK:005603',
    'XW:001603 ZO:004603 ZR:039601 ZM:026603 ZL:007601 ZS:005602 ZB:020601 UNO:251609 TN:043607 UB:020604',
    'UFB:251604 UFE:251606 UME:251603 UFV:251607 ZW:001602 ZQ:045601 ZN:043602 ZF:044601 Z3N:038601 KE:001612',
    'ZT:042601 SR1:134742 SR3:134741 AQR:209748 A2R:239749 ASR:13874W D2:17564H D2X:16S063 K1:16064C',
    'H1:16064H K1K:16S023 H1X:16S056 ACD:432741 AJY:632741 ANE:532741 6A:232741 BTC:133741 BLK:063643',
    'KW:17064C HWX:16S061 6L:102741 6B:096742 6C:090741 CJY:190741 CB:050642 CSC:063642 K2N:16S183 K2K:16S186',
    'K2:16164C H2:16164H H2X:16S042 CHP:279742 K3:16364C K3K:16364D K3N:163K3N H3:16364H H3Z:16S002',
    'H3X:16S050 GDK:052644 BOS:20074A CHI:20074B CUS:20074K DEN:20074C LAV:20074D LAX:20074E MIA:20074F',
    'NYM:20074G SDG:20074H SFR:20074I WDC:20074J CZK:275741 K5:16464C H5:16464H K5N:16S045 K5K:16S016',
    'H5X:16S053 DY:052645 M6A:232742 M6B:096746 MCD:090744 M6E:099743 MSF:092744 M6J:097745 M6C:090747',
    'M6S:092748 E7:099742 IPO:164741 J7:097744 NIY:240745 SOX:13874Y RSV:239744 RSG:239745 RS1:239743',
    'R2V:239746 R2G:239748 RTY:239742 EMD:33874A ESG:13874S ES:13874A SXT:13874Z E3G:13874X SXO:138743',
    'XAR:13874R SXB:138752 SXR:138751 XAZ:13874P XAY:138747 XAP:138748 XAE:138749 XAF:13874C XAV:13874E',
    'XAI:13874F SXI:138753 XAB:13874H XAK:13874I XAU:13874J SMC:338742 D4X:16042I EBR:133744 ETH:146021',
    'EAD:199741 ECD:699741 RY:399741 ENK:799741 ESK:899741 RF:499741 6E:099741 RP:299741 ESR:047745',
    'EUS:598742 ECK:275742 EPZ:277742 GF:061641 HUF:274741 EHF:274743 SIR:131741 MIR:131742 ISL:278741',
    '6J:097741 KRW:086741 K0:16964C H0:16964H K0K:16S025 H0X:16S189 HE:054642 LE:057642 D0X:16S039 LBR:058644',
    'TIE:134743 6M:095741 MBT:133742 MNQ:209747 M2K:239747 MMC:33874B MES:13874U MSC:338744 MET:146022',
    'DC:052641 JQ:052648 KQK:17364D HQX:16S052 BIO:209744 H2O:147641 NDA:438741 NQ:209742 VLQ:117742',
    'K4:16264C H4:16264H H4Z:16S003 K4N:16S181 K4K:16S018 H4X:16S041 6N:112741 NKD:240741 ENY:240743',
    'GNF:052642 NOK:273741 K6:16564C H6Z:16S168 PLN:277741 PRK:054643 K7K:16S185 K7:16664C H7X:16S059',
    'PSF:296741 PJY:396741 SON:047743 RDA:239750 SDA:43874A SDI:43874Q TRI:13874N GD:256741 GIE:256742',
    'KS:17464C KSN:16S187 HSX:16S188 6Z:122741 ZAR:122742 SEK:264741 6S:092741 SJY:192741 BSB:157741',
    'TPD:241740 TRL:019743 IBV:130741 CPO:037021 RMB:082744 TPY:243742 ALA:191698 EDP:191696 AEP:191694',
    'MJP:191695 ALI:191691 AUP:191693 COB:188691 HG:085692 HGS:085695 QC:085693 GC:088691 FSF:257651',
    'TIO:195651 PAC:195656 LTC:189692 LTH:189691 MHG:085699 MGC:088695 SIL:084694 QO:088692 QI:084692',
    'MOX:192656 EHR:192691 SGC:088698 SGU:088697 SI:084691 BUS:257652 HRC:192651 HDG:192692 UX:016651',
    'BTI:133LM2 ETI:146LM2 OIL:067LM1 BIT:133LM1 ET:146LM1 BMC:133SG2 SDX:098SG1 TM:067SG1 SR1:134731',
    'SR3:134730 30C:203061 AS:232663 YA:332661 AR:432661 AWN:24478F BTM:133732 QA:232662 PC:090663 GN:112662',
    'PK:273661 PS:264661 KSV:090771 HY:090661 CC:073732 KC:083731 CT:033661 VC:275663 YZ:122662 EZ:275662',
    'HR:274662 OJ:040701 VU:274663 IUS:224770 ILS:278661 SY:296661 KSN:097771 MMW:24477M ASN:24477G',
    'MLE:24477F MUN:244043 MWL:244051 ASI:244061 MTO:24478L LFG:244781 MTN:24478K MFS:244041 MVU:244786',
    'MTL:24478J MMC:244784 MMM:24477X LFM:24477Z MME:244042 MML:24477J MMN:24477R MMR:24478H MVT:244788',
    'LFU:244782 EU9:24477V MVV:24478G MIN:24477P JPP:244771 PAC:24478B MPA:24477U MVS:244787 LFA:24477Y',
    'USS:244062 USC:24478E WOW:244789 MVR:244785 LFW:24404G MWS:24477T KAU:232666 KEO:116667 KRA:099663',
    'KGB:599663 KEP:699663 KEJ:299663 KRK:399664 KRZ:499663 KOL:799662 KZY:492662 KZX:112665 ZJ:112663',
    'NT:116665 KY:273662 NJ:276661 FNG:223772 PLN:277661 PLE:277662 HIO:084043 SB:080732 SF:080737 KJ:264662',
    'SS:196661 KMF:092661 TRM:019661 MP:096773 ZR:122661 KX:264663 DX:098662 KMP:095661 AFI:86565D BOO:86565G',
    'FO:86565C BEF:066A28 AE5:067A31 A7E:06665B 22:066A09 A91:066A07 3NA:066A27 A9N:06665A ANT:067A85',
    'BKT:067A88 CY:06765N AJ9:067A25 BZ:06765T ADB:06765O CGO:006NLK GEO:006NJZ NGO:00665T CU:025651',
    'A5C:022A56 MTF:024656 MFF:024658 CS4:2616AC A8M:06665V CBB:066A16 A8L:06665U CGB:066A15 A8K:06665T',
    'CPB:066A14 CL:067651 26:067A37 AFY:06765M DCB:06765G TFU:023C06 TTF:023B98 TTG:023C08 QM:067655',
    'QU:11165M QH:022656 QG:023655 EWG:111A50 EWN:03265H AA5:022A57 AZ1:025608 Z1B:025659 AKR:02165O',
    'UV:02165E AGT:02265X AET:02265P R5F:021A70 GZ:86765C 7F:022A69 AGX:02265V A43:03265G AKZ:03265E',
    'UN:03265A EN:86665A APS:066652 A32:066A06 EPN:066A22 FLJ:2616A8 TM:261654 TH:261653 T2D:26165V TL:261655',
    'EVC:021A56 AQA:022A24 AVL:022A25 A8B:111A62 AA8:111A08 AA6:022A60 AB6:022B22 BCR:111A61 CRB:111A34',
    'GFC:86565H ME:86465A GCI:86565N GCU:021A28 ALY:022A05 GBB:111A55 A1G:022A61 ABH:022657 HOB:867652',
    'NN:03565B HH:023A55 HP:023A56 NPG:03565C JA:03265C AJB:86665B E6:03265F HJC:86465D A1M:86465K AWJ:067A07',
    'BL2:2616AA JKM:86665H NWM:023C07 AKL:022A21 AJL:11165W AJS:86465G MQA:022B23 FLP:26165T AYV:067A16',
    'CMS:407653 MT2:407651 MEF:021A62 R5O:021A66 M1B:022B21 MHO:022B24 MRB:111660 S5O:021A72 MAF:021A61',
    'MCL:067A55 MAA:066A26 MAE:066A21 MAS:066A20 MBC:0676A4 A0D:021A17 MUD:022A99 R5M:021A68 RBM:021A80',
    'MJC:86465P MEE:86665G MNC:03265J MPS:066A25 MEO:111A47 MEB:111A52 MJN:86665E E6M:86665F MXB:111A54',
    'MXR:111A53 MTS:021A35 S5M:021A65 SBM:021A77 5L:021A20 A0F:021A19 MSG:022B09 A8C:06665Y A8O:06665W',
    '51:066A05 PMF:066A30 AR0:06665X A8J:06665Z MBR:405652 MBL:066A23 A81:066A10 MBE:405654 AC0:06665P',
    'B0:06665O A7Q:06665R A8I:06665S AD0:06665Q NOO:86665C NG:023651 JCC:023C04 AEZ:025652 A7Y:022A66',
    'HO:022651 JET:86465S JTB:86465T MPX:02265A MM:02165B AHL:86765A ULB:022A97 PA:075651 PGG:406651',
    'AL1:064A58 JDL:064659 PL:076651 A3G:111A02 A1R:06665G 1S:06665H RLX:11165K ZXY:967652 1E:96765F',
    'A1D:111A09 RLX:11165J RBB:111A41 EXR:111A45 ARY:86265C RB:111659 ABS:02165M SD:02165J S5F:021A71',
    'S5B:021A82 S53:021A73 SR5:021A83 UA:02165G SE:02165K SF3:86565P SGB:02265J AVU:022A22 AGA:02265T',
    'RKA:86465C D1N:111A46 N1B:111A11 A1P:111A12 ATP:022A32 A1L:022A62 LT:022A13 H5F:021A76 A42:067A45',
    'CSX:06765A HTT:0676A5 AFF:067A69 WTT:067A71 BK:06765L WTL:067A86 AFH:067A24 QMW:001626',
  ].join(' ').split(' ').map((pair) => pair.split(':') as [string, string]),
);

/** LibraryCOT currencyToCFTCCode() */
const CURRENCY_CODES: Record<string, string> = {
  BTC: '133741', USD: '098662', EUR: '099741', JPY: '097741', MXN: '095741', CHF: '092741', RUB: '089741',
  CAD: '090741', NZD: '112741', GBP: '096742', BRL: '102741', ZAR: '122741', AUD: '232741', ETH: '146021',
};

/** LibraryCOT version 3 `convertRootToCOTCode("Auto")`, then the overrides of the script (HG, LBR). */
function cftcCode(chart?: ChartContext): string {
  const ticker = tickerOf(chart);
  const root = rootOf(chart);
  const rootCode = ROOT_CODES.get(root) ?? '';
  const baseCode = CURRENCY_CODES[basecurrencyOf(chart)] ?? '';
  const mainCode = CURRENCY_CODES[currencyOf(chart)] ?? '';
  const code = root !== ticker && rootCode !== '' ? rootCode : baseCode !== '' ? baseCode : mainCode;
  if (code === '') throw new Error('No root or currency CFTC code found for the current symbol.');
  // var string CFTC_Code_fixed: fixed codes for the roots HG and LBR
  if (root === 'HG') return '085692';
  if (root === 'LBR') return '058644';
  return code;
}

/** The Commitments of Traders symbol of the open interest: cot.COTTickerid('Legacy', code, false, 'Open Interest', 'No direction', 'All') */
function cotSymbol(chart?: ChartContext): string {
  return `COT:${cftcCode(chart)}_F_OI`;
}

/**
 * Bars of other symbols the indicator reads: the daily bars of the Commitments of Traders open interest of the
 * symbol (also with the market type "OTHERS": the script checks that the report exists). Empty when the symbol has
 * no CFTC code (calculate then throws the error of the script).
 */
export function requiredSymbols(_inputs: Partial<OpenInterestStochasticMoneyFlowIndexInputs> = {}, chart?: ChartContext): SymbolRequest[] {
  try {
    return [{ symbol: cotSymbol(chart), timeframe: '1D' }];
  } catch {
    return [];
  }
}

export function calculate(
  bars: Bar[],
  inputs: Partial<OpenInterestStochasticMoneyFlowIndexInputs> = {},
  chart?: ChartContext,
): IndicatorResult & { barColors: BarColorData[]; bgColors: BgColorData[] } & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const close = bars.map((b) => b.close);

  // request.security(tickerId, "1D", close, ignore_invalid_symbol = true): a symbol that does not exist has no bars
  const symbol = cotSymbol(chart);
  const [cotBars] = symbolBarsOf([{ symbol, timeframe: '1D' }], chart);
  const openInterest = securityOtherValues(bars, cotBars, '1D', cotBars.map((x) => x.close), otherSymbolChart(bars, chart), { other: chart?.symbolInfo?.(symbol) });
  // if barstate.islastconfirmedhistory and na(value): runtime.error(...)
  const lastConfirmed = lastBarConfirmedOf(chart) ? n - 1 : n - 2;
  if (lastConfirmed >= 0 && isNaN(openInterest[lastConfirmed])) {
    throw new Error('Could not find relevant COT data based on the current symbol.');
  }

  // _switchable: the open interest (FUTURES) or the volume (OTHERS)
  const weight = bars.map((b, i) =>
    cfg.adaptive === 'FUTURES' ? openInterest[i] : cfg.adaptive === 'OTHERS' ? (b.volume ?? NaN) : NaN);

  // f_sum(_src, _length): _output := _output + _src[i] for i = 0 to _length - 1 (na before the first bars)
  const fSum = (src: number[], length: number): number[] => {
    const len = length < 1 ? 1 : length;
    return src.map((_, b) => {
      let out = 0.0;
      for (let i = 0; i <= len - 1; i++) out = out + (b - i >= 0 ? src[b - i] : NaN);
      return out;
    });
  };
  // ta.change(src) <= 0 ? 0 : src (na change: src)
  const change = close.map((c, i) => (i > 0 ? c - close[i - 1] : NaN));
  const upper = fSum(weight.map((w, i) => w * (le(change[i], 0) ? 0 : close[i])), cfg.tMfi);
  const lower = fSum(weight.map((w, i) => w * (ge(change[i], 0) ? 0 : close[i])), cfg.tMfi);
  // 100.0 - 100.0 / (1.0 + upper_s / lower_s): a plain division (x / 0 is +-infinity, 0 / 0 is na)
  const mfi = upper.map((u, i) => 100.0 - 100.0 / (1.0 + u / lower[i]));

  // f_highest / f_lowest(_src, _length): _value = _src, then _value := _src[i] >= _value ? _src[i] : _value
  const extreme = (src: number[], length: number, high: boolean): number[] => {
    const len = length < 1 ? 1 : length;
    return src.map((v, b) => {
      let value = v;
      for (let i = 0; i <= len - 1; i++) {
        const x = b - i >= 0 ? src[b - i] : NaN;
        if (high ? ge(x, value) : le(x, value)) value = x;
      }
      return value;
    });
  };
  // f_stoch(_src, _length): 100 * (_src - lowest) / (highest - lowest), with f_lowest(f_lowest(_src, 1), _length)
  const lengthStoch = 14;
  const lowest = extreme(extreme(mfi, 1, false), lengthStoch, false);
  const highest = extreme(extreme(mfi, 1, true), lengthStoch, true);
  const stoch = mfi.map((m, i) => (100 * (m - lowest[i])) / (highest[i] - lowest[i]));

  // f_ema(_src, _length): _return := na(_return[1]) ? _src : (_src - _return[1]) * _multiplier + _return[1]
  // (na() is also true for +-infinity)
  const fEma = (src: number[], length: number): number[] => {
    const multiplier = 2 / ((length < 1 ? 1 : length) + 1);
    let prev = NaN;
    return src.map((v) => (prev = Number.isFinite(prev) ? (v - prev) * multiplier + prev : v));
  };
  const smoothK = Math.trunc(14 / 3);
  const smoothD = Math.trunc(14 / 3);
  const k3 = fEma(stoch, smoothK);
  const d = fEma(k3, smoothD);

  const kSeries = Series.fromArray(bars, k3);
  const dSeries = Series.fromArray(bars, d);
  const posMoment = ta.crossover(kSeries, dSeries).toArray().map((v) => !!v);
  const negMoment = ta.crossunder(kSeries, dSeries).toArray().map((v) => !!v);

  const bgColors: BgColorData[] = [];
  const barColors: BarColorData[] = [];
  const teal = String(color.teal);
  const maroon = String(color.maroon);
  const lightsOn = cfg.lights === 'ON';
  const buyFlags: boolean[] = [], sellFlags: boolean[] = [];
  for (let i = 0; i < n; i++) {
    // possig = k3 > d ? 1 : -1 (reverse = false): alertcondition(possig == 1) / alertcondition(possig == -1)
    buyFlags.push(gt(k3[i], d[i]));
    sellFlags.push(!gt(k3[i], d[i]));
    // col_bg = pos_moment ? color.teal : neg_moment ? color.maroon : na
    if (posMoment[i]) bgColors.push({ time: bars[i].time, color: teal });
    else if (negMoment[i]) bgColors.push({ time: bars[i].time, color: maroon });
    // pos = k3 > d ? 1 : -1 (reverse = false); barcolor when the lights are on
    if (lightsOn) barColors.push({ time: bars[i].time, color: gt(k3[i], d[i]) ? CROSS_UP_COLOR : CROSS_DOWN_COLOR });
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {
      plot0: bars.map((b, i) => ({ time: b.time, value: Number.isFinite(k3[i]) ? k3[i] : NaN, color: K_COLOR })),
      plot1: bars.map((b, i) => ({ time: b.time, value: Number.isFinite(d[i]) ? d[i] : NaN, color: D_COLOR })),
      // plot(pos_moment ? zero : na, style = plot.style_cross, ...)
      plot2: bars.map((b, i) => ({ time: b.time, value: posMoment[i] ? 0 : NaN, color: CROSS_UP_COLOR })),
      plot3: bars.map((b, i) => ({ time: b.time, value: negMoment[i] ? 0 : NaN, color: CROSS_DOWN_COLOR })),
    },
    hlines: [
      { value: cfg.overSold, options: { title: 'Oversold Level', color: LEVEL_COLOR, linestyle: 'dashed' } },
      { value: cfg.overBought, options: { title: 'Overbought Level', color: LEVEL_COLOR, linestyle: 'dashed' } },
    ],
    fills: [
      { plot1: 'hline_oversold', plot2: 'hline_overbought', options: { title: 'Border' },
        colors: new Array<string>(n).fill(BORDER_COLOR) },
    ],
    bgColors,
    barColors,
    alerts: alertStates(alertConditions, bars, [buyFlags, sellFlags]),
  };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'Buy Signal', message: 'Buy Signal ' },
  { id: 'alert1', title: 'Sell Signal', message: 'Sell Signal ' },
];

export const OpenInterestStochasticMoneyFlowIndex = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  hlineConfig,
  fillConfig,
  requiredSymbols,
  alertConditions,
};
