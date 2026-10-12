/**
 * ICT Everything @coldbrewrosh
 *
 * Session tools for intraday charts (shown on timeframes of at most "Hide Indicator Above Specified Minutes"
 * minutes). The session hours are read in the selected time zone (a fixed UTC offset, "UTC -5" by default); the
 * calendar day, the day of the week and the week come from the exchange time zone, as in the original.
 * - On each new day (not on Sundays): vertical lines at the start and end of the London, New York, London Close,
 *   Afternoon, Asia and free sessions (transparent lines, with an optional fill between them), and visible vertical
 *   lines at midnight, at the London, New York and equities opens.
 * - The midnight opening price: a line from midnight with a label, both moved to the "Terminus" time (the current
 *   time + 1 hour by default); optional New York, equities and afternoon opening price lines, and the weekly and
 *   monthly opening prices.
 * - Boxes over the high / low of the CBDR (16:00-20:00), Asia (20:00-00:00) and FLOUT (16:00-00:00) ranges, with
 *   optional standard deviation lines (multiples of the range).
 * - A table of the CBDR / Asian range in pips (forex symbols), a bias table and a notes table.
 * - Day of the week labels at a given hour.
 * - Old drawings are removed: those before the current week (or the last 4 weeks) of each bar.
 *
 * Chart values read from the optional third argument (see src/chart-context.ts): the exchange time zone (day of the
 * week, week, hour of the day labels; UTC without it), the chart timeframe (from the bar spacing without it), the
 * symbol type (Friday rules for non-crypto symbols, the forex table), the symbol tick and currency (pips), the
 * current time (`timenow`: this week / the last 4 weeks, the Terminus time; the computer clock without it) and the
 * state of the last bar (the midnight opening price is drawn on a closed bar).
 * The weekly and monthly opens (`request.security(..., "W" / "M", open, lookahead_on)`) are the open of the first
 * chart bar of the week / month: on the first period of the bars it can differ from the open of the full period.
 *
 * Reference: "ICT Everything @coldbrewrosh" by coldbrewrosh
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: ©coldbrewrosh
 */

import {
  ta, str, color, timeframe, time as pineTime, line, label, box, linefill, resetDrawings, setDrawingBar, varDrawing,
  drawingOutputs, type Line, type Label, type Box, type Linefill, type IndicatorResult, type InputConfig,
  type PlotConfig, type Bar,
} from 'oakscriptjs';
import type { BoxData, LabelData, LineDrawingData, LinefillData, MarkerData, PineSize, TableCellData, TableData, TablePosition } from '../types';
import { chartTimeframe, periodStarts } from '../anchor-period';
import {
  currencyOf, lastBarConfirmedOf, mintickOf, nowOf, symbolTypeOf, timezoneOf, type ChartContext,
} from '../chart-context';

type LineStyleName = 'Solid' | 'Dashed' | 'Dotted';
type WidthName = '1px' | '2px' | '3px' | '4px' | '5px';
type TablePlace = 'Top Left' | 'Top Center' | 'Top Right' | 'Middle Left' | 'Middle Right' | 'Bottom Left' | 'Bottom Center' | 'Bottom Right';
type BiasName = 'Bullish' | 'Bearish' | 'Consolidating' | 'Unclear';

export interface ICTEverythingInputs {
  TZI: string;
  inputMaxInterval: number;
  ShowTSO: boolean;
  ShowTWO: boolean;
  SL4W: boolean;
  ShowSFill: boolean;
  ShowMOPL: boolean;
  MOLHist: boolean;
  ShowPrev: boolean;
  ShowLondon: boolean;
  ShowNY: boolean;
  ShowLC: boolean;
  ShowPM: boolean;
  ShowAsian: boolean;
  ShowFreeSesh: boolean;
  txt2: string;
  txt3: string;
  txt4: string;
  txt5: string;
  txt6: string;
  txt9: string;
  LDNsesh: string;
  NYsesh: string;
  LCsesh: string;
  PMsesh: string;
  ASIA2sesh: string;
  FreeSesh: string;
  LSFC: string;
  NYSFC: string;
  LCSFC: string;
  PMSFC: string;
  ASFC: string;
  FSFC: string;
  ShowMOP: boolean;
  txt12: string;
  ShowLOP: boolean;
  txt14: string;
  ShowNYOP: boolean;
  txt15: string;
  ShowEOP: boolean;
  txt16: string;
  MOPColor: string;
  LOPColor: string;
  NYOPColor: string;
  EOPColor: string;
  Midnight_Open_LS: LineStyleName;
  london_Open_LS: LineStyleName;
  NY_Open_LS: LineStyleName;
  Equities_Open_LS: LineStyleName;
  Midnight_Open_LW: WidthName;
  London_Open_LW: WidthName;
  NY_Open_LW: WidthName;
  Equities_Open_LW: WidthName;
  ShowMOPP: boolean;
  txt13: string;
  ShowNYOPP: boolean;
  txt17: string;
  ShowEOPP: boolean;
  txt18: string;
  ShowAFTPP: boolean;
  txt1330: string;
  MOPColP: string;
  NYOPColP: string;
  EOPColP: string;
  AFTOPColP: string;
  MOPLS: LineStyleName;
  NYOPLS: LineStyleName;
  EOPLS: LineStyleName;
  AFTOPLS: LineStyleName;
  i_MOPLW: WidthName;
  i_NYOPLW: WidthName;
  i_EOPLW: WidthName;
  i_AFTOPLW: WidthName;
  ShowWeekOpen: boolean;
  showMonthOpen: boolean;
  txt19: string;
  txt20: string;
  i_WeekOpenCol: string;
  i_MonthOpenCol: string;
  WOLS: LineStyleName;
  MOLS: LineStyleName;
  i_WOPLW: WidthName;
  i_MONPLW: WidthName;
  ShowCBDR: boolean;
  ShowASIA: boolean;
  ShowFLOUT: boolean;
  txt0: string;
  txt1: string;
  txt7: string;
  CBDRBoxCol: string;
  ASIABoxCol: string;
  FLOUTBoxCol: string;
  box_text_cbdr: boolean;
  box_text_cbdr_col: string;
  bool_cbdr_dev: boolean;
  box_text_asia: boolean;
  box_text_asia_col: string;
  bool_asia_dev: boolean;
  box_text_flout: boolean;
  box_text_flout_col: string;
  bool_flout_dev: boolean;
  ShowDevLN: boolean;
  DEVLNTXT: string;
  DevLNCol: string;
  DEVLS: LineStyleName;
  i_DEVLW: WidthName;
  ShowDev: boolean;
  txt8: string;
  SDCountCol: string;
  DevInput: '1 SD' | '2 SD' | '3 SD' | '4 SD';
  DevDirection: 'Upside Only' | 'Both' | 'Downside Only';
  Auto_Select: boolean;
  txtSD: string;
  Tab1txtCol: string;
  TabOptionShow: 'Show Table' | 'Hide Table';
  TabOption1: TablePlace;
  ShowLabel: boolean;
  txt21: string;
  LabelColor: string;
  LabelSizeInput: 'Auto' | 'Tiny' | 'Small' | 'Normal' | 'Large' | 'Huge';
  Terminusinp: string;
  ShowLabelText: boolean;
  txt22: string;
  LabelTextColor: string;
  LabelTextOptioninput: 'Time' | 'Text';
  ShowPricesBool: 'Show Prices' | 'Hide Prices';
  showDOW: boolean;
  txt24: string;
  i_DOWCol: string;
  DOWTime: number;
  DOWLoc_inpt: 'Top' | 'Bottom';
  BIAS_M_Bool: boolean;
  txt100: string;
  Tab2txtCol: string;
  TabOption2: TablePlace;
  NOTES_M_Bool: boolean;
  txt101: string;
  Tab3txtCol: string;
  TabOption3: TablePlace;
  BIASbool1: boolean;
  txt52: string;
  BIASOption1: BiasName;
  BIASbool2: boolean;
  txt53: string;
  BIASOption2: BiasName;
  BIASbool3: boolean;
  txt54: string;
  BIASOption3: BiasName;
  BIASbool4: boolean;
  txt55: string;
  BIASOption4: BiasName;
  notes: string;
}

const GRAY = '#787B86';
const GRAY_90 = 'rgba(120, 123, 134, 0.1)'; // color.new(#787b86, 90) as an input default
const GRAY_80 = 'rgba(120, 123, 134, 0.2)'; // color.new(color.gray, 80) as an input default
const TEAL_60 = 'rgba(0, 128, 128, 0.4)'; // color.rgb(0, 128, 128, 60) as an input default

export const defaultInputs: ICTEverythingInputs = {
  TZI: 'UTC -5',
  inputMaxInterval: 31,
  ShowTSO: true,
  ShowTWO: true,
  SL4W: true,
  ShowSFill: false,
  ShowMOPL: false,
  MOLHist: true,
  ShowPrev: false,
  ShowLondon: true,
  ShowNY: true,
  ShowLC: true,
  ShowPM: true,
  ShowAsian: false,
  ShowFreeSesh: false,
  txt2: 'LONDON',
  txt3: 'NEW YORK',
  txt4: 'LDN CLOSE',
  txt5: 'AFTERNOON',
  txt6: 'ASIA',
  txt9: 'FREE SESH',
  LDNsesh: '0200-0500:1234567',
  NYsesh: '0700-1000:1234567',
  LCsesh: '1000-1200:1234567',
  PMsesh: '1300-1600:1234567',
  ASIA2sesh: '2000-2359:1234567',
  FreeSesh: '0000-0000:1234567',
  LSFC: GRAY_90,
  NYSFC: GRAY_90,
  LCSFC: GRAY_90,
  PMSFC: GRAY_90,
  ASFC: GRAY_90,
  FSFC: GRAY_90,
  ShowMOP: true,
  txt12: 'MIDNIGHT',
  ShowLOP: false,
  txt14: 'LONDON',
  ShowNYOP: true,
  txt15: 'NEW YORK',
  ShowEOP: false,
  txt16: 'EQUITIES',
  MOPColor: GRAY,
  LOPColor: TEAL_60,
  NYOPColor: TEAL_60,
  EOPColor: TEAL_60,
  Midnight_Open_LS: 'Dotted',
  london_Open_LS: 'Solid',
  NY_Open_LS: 'Solid',
  Equities_Open_LS: 'Solid',
  Midnight_Open_LW: '1px',
  London_Open_LW: '1px',
  NY_Open_LW: '1px',
  Equities_Open_LW: '1px',
  ShowMOPP: true,
  txt13: 'MIDNIGHT',
  ShowNYOPP: false,
  txt17: 'NEW YORK',
  ShowEOPP: false,
  txt18: 'EQUITIES',
  ShowAFTPP: false,
  txt1330: 'AFTERNOON',
  MOPColP: GRAY,
  NYOPColP: GRAY,
  EOPColP: GRAY,
  AFTOPColP: GRAY,
  MOPLS: 'Dotted',
  NYOPLS: 'Dotted',
  EOPLS: 'Dotted',
  AFTOPLS: 'Dotted',
  i_MOPLW: '1px',
  i_NYOPLW: '1px',
  i_EOPLW: '1px',
  i_AFTOPLW: '1px',
  ShowWeekOpen: false,
  showMonthOpen: false,
  txt19: 'WEEKLY',
  txt20: 'MONTHLY',
  i_WeekOpenCol: GRAY,
  i_MonthOpenCol: GRAY,
  WOLS: 'Dotted',
  MOLS: 'Dotted',
  i_WOPLW: '1px',
  i_MONPLW: '1px',
  ShowCBDR: true,
  ShowASIA: true,
  ShowFLOUT: false,
  txt0: 'CBDR',
  txt1: 'ASIA',
  txt7: 'FLOUT',
  CBDRBoxCol: GRAY,
  ASIABoxCol: GRAY,
  FLOUTBoxCol: GRAY,
  box_text_cbdr: true,
  box_text_cbdr_col: GRAY_80,
  bool_cbdr_dev: true,
  box_text_asia: true,
  box_text_asia_col: GRAY_80,
  bool_asia_dev: true,
  box_text_flout: true,
  box_text_flout_col: GRAY_80,
  bool_flout_dev: true,
  ShowDevLN: true,
  DEVLNTXT: 'SD LINES',
  DevLNCol: GRAY,
  DEVLS: 'Solid',
  i_DEVLW: '1px',
  ShowDev: false,
  txt8: 'SD COUNT',
  SDCountCol: GRAY,
  DevInput: '2 SD',
  DevDirection: 'Both',
  Auto_Select: false,
  txtSD: 'AUTO SD',
  Tab1txtCol: '#808080',
  TabOptionShow: 'Show Table',
  TabOption1: 'Top Right',
  ShowLabel: true,
  txt21: 'LABEL',
  LabelColor: 'rgba(0, 0, 0, 0)',
  LabelSizeInput: 'Normal',
  Terminusinp: 'Terminus @ Current Time +1hr',
  ShowLabelText: true,
  txt22: 'LABEL TEXT',
  LabelTextColor: GRAY,
  LabelTextOptioninput: 'Time',
  ShowPricesBool: 'Hide Prices',
  showDOW: true,
  txt24: 'DAY OF WEEK',
  i_DOWCol: GRAY,
  DOWTime: 12,
  DOWLoc_inpt: 'Bottom',
  BIAS_M_Bool: false,
  txt100: 'BIAS',
  Tab2txtCol: GRAY,
  TabOption2: 'Bottom Right',
  NOTES_M_Bool: true,
  txt101: 'NOTES',
  Tab3txtCol: GRAY,
  TabOption3: 'Top Center',
  BIASbool1: true,
  txt52: 'DXY ',
  BIASOption1: 'Bullish',
  BIASbool2: true,
  txt53: 'EURGBP ',
  BIASOption2: 'Bearish',
  BIASbool3: true,
  txt54: 'AUDNZD ',
  BIASOption3: 'Bullish',
  BIASbool4: true,
  txt55: 'NASDAQ ',
  BIASOption4: 'Bearish',
  notes: '@coldbrewrosh',
};

const TZ_OPTIONS = ['UTC -10', 'UTC -7', 'UTC -6', 'UTC -5', 'UTC -4', 'UTC -3', 'UTC +0', 'UTC +1', 'UTC +2', 'UTC +3',
  'UTC +3:30', 'UTC +4', 'UTC +5', 'UTC +5:30', 'UTC +6', 'UTC +7', 'UTC +8', 'UTC +9', 'UTC +9:30', 'UTC +10',
  'UTC +10:30', 'UTC +11', 'UTC +13', 'UTC +13:45'];
const STYLES = ['Solid', 'Dashed', 'Dotted'];
const WIDTHS = ['1px', '2px', '3px', '4px', '5px'];
const PLACES = ['Top Left', 'Top Center', 'Top Right', 'Middle Left', 'Middle Right', 'Bottom Left', 'Bottom Center', 'Bottom Right'];
const BIASES = ['Bullish', 'Bearish', 'Consolidating', 'Unclear'];
const TERMINUS = ['Terminus @ Next Midnight', 'Terminus @ Current Time', 'Terminus @ Current Time +15min',
  'Terminus @ Current Time +30min', 'Terminus @ Current Time +45min', 'Terminus @ Current Time +1hr',
  'Terminus @ Current Time +2hr', 'Terminus @ Current Time +3hr'];

type Key = keyof ICTEverythingInputs;
const B = (id: Key, title: string, group: string, inline?: string): InputConfig =>
  ({ id, type: 'bool', title, defval: defaultInputs[id] as boolean, group, ...(inline ? { inline } : {}) });
const S = (id: Key, group: string, inline: string, options?: string[], title = ''): InputConfig =>
  ({ id, type: 'string', title, defval: defaultInputs[id] as string, group, inline, ...(options ? { options } : {}) });
const C = (id: Key, group: string, inline?: string, title = ''): InputConfig =>
  ({ id, type: 'color', title, defval: defaultInputs[id] as string, group, ...(inline ? { inline } : {}) });
const SES = (id: Key, inline: string): InputConfig =>
  ({ id, type: 'session', title: '', defval: defaultInputs[id] as string, group: 'Sessions', inline });

const G_SES = 'Sessions';
const G_VL = 'Vertical Lines';
const G_OP = 'Opening Price Lines';
const G_HTF = 'HTF Opening Price Lines';
const G_CB = 'CBDR, ASIA & FLOUT';
const G_SD = 'Standard Deviation';
const G_DOW = 'Day Of Week & Labels';
const G_PRE = 'BIAS & NOTES PRECONFIG';
const G_BN = 'BIAS & NOTES';

export const inputConfig: InputConfig[] = [
  { id: 'TZI', type: 'string', title: 'Timezone Selection', defval: 'UTC -5', options: TZ_OPTIONS, group: 'Global Settings' },
  { id: 'inputMaxInterval', type: 'int', title: 'Hide Indicator Above Specified Minutes', defval: 31, group: 'Global Settings' },
  B('ShowTSO', "Show Today's Session Only", 'Session Options'),
  B('ShowTWO', "Show Current Week's Sessions Only", 'Session Options'),
  B('SL4W', 'Show Last 4 Week Sessions', 'Session Options'),
  B('ShowSFill', 'Show Session Highlighting', 'Session Options'),
  B('ShowMOPL', 'Midnight Historical Price Lines', 'Historical Lines'),
  B('MOLHist', 'Midnight Historical Vertical Lines', 'Historical Lines'),
  B('ShowPrev', 'Misc. Historical Price Lines', 'Historical Lines'),
  B('ShowLondon', '', G_SES, 'LONDON'),
  B('ShowNY', '', G_SES, 'NY'),
  B('ShowLC', '', G_SES, 'LC'),
  B('ShowPM', '', G_SES, 'PM'),
  B('ShowAsian', '', G_SES, 'ASIA2'),
  B('ShowFreeSesh', '', G_SES, 'FREE'),
  S('txt2', G_SES, 'LONDON'),
  S('txt3', G_SES, 'NY'),
  S('txt4', G_SES, 'LC'),
  S('txt5', G_SES, 'PM'),
  S('txt6', G_SES, 'ASIA2'),
  S('txt9', G_SES, 'FREE'),
  SES('LDNsesh', 'LONDON'),
  SES('NYsesh', 'NY'),
  SES('LCsesh', 'LC'),
  SES('PMsesh', 'PM'),
  SES('ASIA2sesh', 'ASIA2'),
  SES('FreeSesh', 'FREE'),
  C('LSFC', G_SES, 'LONDON'),
  C('NYSFC', G_SES, 'NY'),
  C('LCSFC', G_SES, 'LC'),
  C('PMSFC', G_SES, 'PM'),
  C('ASFC', G_SES, 'ASIA2'),
  C('FSFC', G_SES, 'FREE'),
  B('ShowMOP', '', G_VL, 'MOP'),
  S('txt12', G_VL, 'MOP'),
  B('ShowLOP', '', G_VL, 'LOP'),
  S('txt14', G_VL, 'LOP'),
  B('ShowNYOP', '', G_VL, 'NYOP'),
  S('txt15', G_VL, 'NYOP'),
  B('ShowEOP', '', G_VL, 'EOP'),
  S('txt16', G_VL, 'EOP'),
  C('MOPColor', G_VL, 'MOP'),
  C('LOPColor', G_VL, 'LOP'),
  C('NYOPColor', G_VL, 'NYOP'),
  C('EOPColor', G_VL, 'EOP'),
  S('Midnight_Open_LS', G_VL, 'MOP', STYLES),
  S('london_Open_LS', G_VL, 'LOP', STYLES),
  S('NY_Open_LS', G_VL, 'NYOP', STYLES),
  S('Equities_Open_LS', G_VL, 'EOP', STYLES),
  S('Midnight_Open_LW', G_VL, 'MOP', WIDTHS),
  S('London_Open_LW', G_VL, 'LOP', WIDTHS),
  S('NY_Open_LW', G_VL, 'NYOP', WIDTHS),
  S('Equities_Open_LW', G_VL, 'EOP', WIDTHS),
  B('ShowMOPP', '', G_OP, 'MOPP'),
  S('txt13', G_OP, 'MOPP'),
  B('ShowNYOPP', '', G_OP, 'NYOPP'),
  S('txt17', G_OP, 'NYOPP'),
  B('ShowEOPP', '', G_OP, 'EOPP'),
  S('txt18', G_OP, 'EOPP'),
  B('ShowAFTPP', '', G_OP, 'AFTOPP'),
  S('txt1330', G_OP, 'AFTOPP'),
  C('MOPColP', G_OP, 'MOPP'),
  C('NYOPColP', G_OP, 'NYOPP'),
  C('EOPColP', G_OP, 'EOPP'),
  C('AFTOPColP', G_OP, 'AFTOPP'),
  S('MOPLS', G_OP, 'MOPP', STYLES),
  S('NYOPLS', G_OP, 'NYOPP', STYLES),
  S('EOPLS', G_OP, 'EOPP', STYLES),
  S('AFTOPLS', G_OP, 'AFTOPP', STYLES),
  S('i_MOPLW', G_OP, 'MOPP', WIDTHS),
  S('i_NYOPLW', G_OP, 'NYOPP', WIDTHS),
  S('i_EOPLW', G_OP, 'EOPP', WIDTHS),
  S('i_AFTOPLW', G_OP, 'AFTOPP', WIDTHS),
  B('ShowWeekOpen', '', G_HTF, 'WO'),
  B('showMonthOpen', '', G_HTF, 'MO'),
  S('txt19', G_HTF, 'WO'),
  S('txt20', G_HTF, 'MO'),
  C('i_WeekOpenCol', G_HTF, 'WO'),
  C('i_MonthOpenCol', G_HTF, 'MO'),
  S('WOLS', G_HTF, 'WO', STYLES),
  S('MOLS', G_HTF, 'MO', STYLES),
  S('i_WOPLW', G_HTF, 'WO', WIDTHS),
  S('i_MONPLW', G_HTF, 'MO', WIDTHS),
  B('ShowCBDR', '', G_CB, 'CBDR'),
  B('ShowASIA', '', G_CB, 'ASIA'),
  B('ShowFLOUT', '', G_CB, 'FLOUT'),
  S('txt0', G_CB, 'CBDR'),
  S('txt1', G_CB, 'ASIA'),
  S('txt7', G_CB, 'FLOUT'),
  C('CBDRBoxCol', G_CB, 'CBDR'),
  C('ASIABoxCol', G_CB, 'ASIA'),
  C('FLOUTBoxCol', G_CB, 'FLOUT'),
  B('box_text_cbdr', 'Show Text', G_CB, 'CBDR'),
  C('box_text_cbdr_col', G_CB, 'CBDR'),
  B('bool_cbdr_dev', 'SD', G_CB, 'CBDR'),
  B('box_text_asia', 'Show Text', G_CB, 'ASIA'),
  C('box_text_asia_col', G_CB, 'ASIA'),
  B('bool_asia_dev', 'SD', G_CB, 'ASIA'),
  B('box_text_flout', 'Show Text', G_CB, 'FLOUT'),
  C('box_text_flout_col', G_CB, 'FLOUT'),
  B('bool_flout_dev', 'SD', G_CB, 'FLOUT'),
  B('ShowDevLN', '', G_SD, 'DEVLN'),
  S('DEVLNTXT', G_SD, 'DEVLN'),
  C('DevLNCol', G_SD, 'DEVLN'),
  S('DEVLS', G_SD, 'DEVLN', STYLES),
  S('i_DEVLW', G_SD, 'DEVLN', WIDTHS),
  B('ShowDev', '', G_SD, 'DEV'),
  S('txt8', G_SD, 'DEV'),
  C('SDCountCol', G_SD, 'DEV'),
  S('DevInput', G_SD, 'DEV', ['1 SD', '2 SD', '3 SD', '4 SD']),
  S('DevDirection', G_SD, 'DEV', ['Upside Only', 'Both', 'Downside Only']),
  B('Auto_Select', '', G_SD, 'AUTOSD'),
  S('txtSD', G_SD, 'AUTOSD'),
  C('Tab1txtCol', G_SD, 'AUTOSD'),
  S('TabOptionShow', G_SD, 'AUTOSD', ['Show Table', 'Hide Table']),
  S('TabOption1', G_SD, 'AUTOSD', PLACES),
  B('ShowLabel', '', G_DOW, 'Glabel'),
  S('txt21', G_DOW, 'Glabel'),
  C('LabelColor', G_DOW, 'Glabel'),
  S('LabelSizeInput', G_DOW, 'Glabel', ['Auto', 'Tiny', 'Small', 'Normal', 'Large', 'Huge']),
  S('Terminusinp', G_DOW, 'Glabel', TERMINUS),
  B('ShowLabelText', '', G_DOW, 'label'),
  S('txt22', G_DOW, 'label'),
  C('LabelTextColor', G_DOW, 'label'),
  S('LabelTextOptioninput', G_DOW, 'label', ['Time', 'Text']),
  S('ShowPricesBool', G_DOW, 'label', ['Show Prices', 'Hide Prices']),
  B('showDOW', '', G_DOW, 'DOW'),
  S('txt24', G_DOW, 'DOW'),
  C('i_DOWCol', G_DOW, 'DOW'),
  { id: 'DOWTime', type: 'int', title: '', defval: 12, group: G_DOW, inline: 'DOW' },
  S('DOWLoc_inpt', G_DOW, 'DOW', ['Top', 'Bottom']),
  B('BIAS_M_Bool', '', G_PRE, 'stats'),
  S('txt100', G_PRE, 'stats'),
  C('Tab2txtCol', G_PRE, 'stats'),
  S('TabOption2', G_PRE, 'stats', PLACES),
  B('NOTES_M_Bool', '', G_PRE, 'stats2'),
  S('txt101', G_PRE, 'stats2'),
  C('Tab3txtCol', G_PRE, 'stats2'),
  S('TabOption3', G_PRE, 'stats2', PLACES),
  B('BIASbool1', '', G_BN, 'BIAS1'),
  S('txt52', G_BN, 'BIAS1'),
  S('BIASOption1', G_BN, 'BIAS1', BIASES),
  B('BIASbool2', '', G_BN, 'BIAS2'),
  S('txt53', G_BN, 'BIAS2'),
  S('BIASOption2', G_BN, 'BIAS2', BIASES),
  B('BIASbool3', '', G_BN, 'BIAS3'),
  S('txt54', G_BN, 'BIAS3'),
  S('BIASOption3', G_BN, 'BIAS3', BIASES),
  B('BIASbool4', '', G_BN, 'BIAS4'),
  S('txt55', G_BN, 'BIAS4'),
  S('BIASOption4', G_BN, 'BIAS4', BIASES),
  { id: 'notes', type: 'string', title: 'Notes', defval: '@coldbrewrosh', group: G_BN },
];

export const plotConfig: PlotConfig[] = [];

export const metadata = {
  title: 'ICT Everything @coldbrewrosh',
  shortTitle: 'ICT Everything @coldbrewrosh',
  overlay: true,
};

/** indicator(max_lines_count = 500, max_labels_count = 5, max_boxes_count = 500) */
const LIMITS = { line: 500, label: 5, box: 500 };
const DAY = 86400000;

/** "UTC -5" -> "GMT-05:00" (the Timezone mapping of the original) */
function timezoneOfInput(tzi: string): string {
  const m = /^UTC ([+-])(\d+)(?::(\d+))?$/.exec(tzi);
  if (!m || tzi === 'UTC +13:45' || !TZ_OPTIONS.includes(tzi)) return 'GMT+13:45';
  return `GMT${m[1]}${m[2].padStart(2, '0')}:${(m[3] ?? '00').padStart(2, '0')}`;
}

const styleOf = (s: string): 'solid' | 'dotted' | 'dashed' => (s === 'Solid' ? 'solid' : s === 'Dotted' ? 'dotted' : 'dashed');
const widthOf = (w: string) => (w === '1px' ? 1 : w === '2px' ? 2 : w === '3px' ? 3 : w === '4px' ? 4 : 5);
const placeOf = (p: string): TablePosition => (p === 'Top Left' ? 'top_left' : p === 'Top Center' ? 'top_center'
  : p === 'Top Right' ? 'top_right' : p === 'Middle Left' ? 'middle_left' : p === 'Middle Right' ? 'middle_right'
    : p === 'Bottom Left' ? 'bottom_left' : p === 'Bottom Center' ? 'bottom_center' : 'bottom_right');
const sizeOf = (s: string): PineSize => (s === 'Auto' ? 'auto' : s === 'Tiny' ? 'tiny' : s === 'Small' ? 'small'
  : s === 'Normal' ? 'normal' : s === 'Large' ? 'large' : 'huge');

/** math.round(str.tonumber(str.substring(session, from, to))): na when the text is not a number */
function sessionPart(session: string, from: number, to: number): number {
  const s = session.substring(from, to);
  const v = /^\s*[+-]?(\d+\.?\d*|\.\d+)\s*$/.test(s) ? Number(s) : NaN;
  return Math.round(v);
}

/** Pine `if x` on an int (a time): false for na and 0 */
const truthy = (x: number) => !isNaN(x) && x !== 0;

export function calculate(
  bars: Bar[],
  inputs: Partial<ICTEverythingInputs> = {},
  chart?: ChartContext,
): Omit<IndicatorResult, 'lines' | 'labels' | 'boxes' | 'linefills' | 'tables' | 'markers'> & {
  lines: LineDrawingData[]; labels: LabelData[]; boxes: BoxData[]; linefills: LinefillData[]; tables: TableData[];
  markers: MarkerData[];
} {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const last = n - 1;
  const tz = timezoneOf(chart);
  const Timezone = timezoneOfInput(cfg.TZI);
  const symType = symbolTypeOf(chart);
  const nonCrypto = symType !== 'crypto';
  const forex = symType === 'forex';
  const mintick = mintickOf(chart);
  const currency = currencyOf(chart);
  const now = nowOf(chart);
  const ms = n > 0 && bars[0].time >= 1e12;
  const toMs = (t: number) => (ms ? t : t * 1000);

  const tfStr = chartTimeframe(bars, chart);
  const tf = tfStr === '' ? null : timeframe.info(tfStr);
  const mult = tf ? tf.multiplier : NaN;
  const DOM = !!tf && mult <= cfg.inputMaxInterval && tf.isintraday;
  const periodD = !!tf && tf.isdaily && mult === 1;
  const periodW = !!tf && tf.isweekly && mult === 1;
  const periodM = !!tf && tf.ismonthly && mult === 1;
  const barMs = tf && tf.isintraday ? timeframe.in_seconds(tfStr) * 1000 : DAY;

  // Styles, widths, sizes
  const MNOPLS = styleOf(cfg.Midnight_Open_LS);
  const LNOPLS = styleOf(cfg.london_Open_LS);
  const NWYOPLS = styleOf(cfg.NY_Open_LS);
  const EQOPLS = styleOf(cfg.Equities_Open_LS);
  const MOPLSS = styleOf(cfg.MOPLS);
  const NYOPLSS = styleOf(cfg.NYOPLS);
  const EOPLSS = styleOf(cfg.EOPLS);
  const AFTOPLSS = styleOf(cfg.AFTOPLS);
  const WeekOpenLS = styleOf(cfg.WOLS);
  const MonthOpenLS = styleOf(cfg.MOLS);
  const DEVLSS = styleOf(cfg.DEVLS);
  const MOPLW = widthOf(cfg.Midnight_Open_LW);
  const LOPLW = widthOf(cfg.London_Open_LW);
  const NYOPLW = widthOf(cfg.NY_Open_LW);
  const EOPLW = widthOf(cfg.Equities_Open_LW);
  const MOPPLW = widthOf(cfg.i_MOPLW);
  const NYOPPLW = widthOf(cfg.i_NYOPLW);
  const EOPPLW = widthOf(cfg.i_EOPLW);
  const AFTOPLW = widthOf(cfg.i_AFTOPLW);
  const WEEKOPPLW = widthOf(cfg.i_WOPLW);
  const MONTHOPPLW = widthOf(cfg.i_MONPLW);
  const DEVLW = widthOf(cfg.i_DEVLW);
  const LabelSize = sizeOf(cfg.LabelSizeInput);
  const DevCount = cfg.DevInput === '1 SD' ? 1 : cfg.DevInput === '2 SD' ? 2 : cfg.DevInput === '3 SD' ? 3 : 4;
  const ShowPrices = cfg.ShowPricesBool === 'Show Prices';
  const Stats = cfg.TabOptionShow === 'Show Table';
  const DOWLoc = cfg.DOWLoc_inpt === 'Bottom' ? 'bottom' : 'top';
  const SFistrue = cfg.LabelTextOptioninput === 'Time';
  const transparentcol = String(color.rgb(255, 255, 255, 100));
  const terminusOn = cfg.Terminusinp !== 'Terminus @ Next Midnight';

  // Terminus(Terminusinp): the current time plus the selected delay
  const terminus = (): number => {
    switch (cfg.Terminusinp) {
      case 'Terminus @ Current Time': return now;
      case 'Terminus @ Current Time +15min': return now + 900000;
      case 'Terminus @ Current Time +30min': return now + 1800000;
      case 'Terminus @ Current Time +45min': return now + 2700000;
      case 'Terminus @ Current Time +1hr': return now + 3600000;
      case 'Terminus @ Current Time +2hr': return now + 7200000;
      default: return now + 10800000;
    }
  };

  // Session start / end hours and minutes of the sessions
  const CBDR = '1600-2000:1234567';
  const ASIA = '2000-0000:1234567';
  const FLOUT = '1600-0000:1234567';
  const midsesh = '0000-1600:1234567';
  const hm = (s: string) => ({
    sh: sessionPart(s, 0, 2), sm: sessionPart(s, 2, 4), eh: sessionPart(s, 5, 7), em: sessionPart(s, 7, 9),
  });
  const sCBDR = hm(CBDR);
  const sASIA = hm(ASIA);
  const sFLOUT = hm(FLOUT);
  const sLDN = hm(cfg.LDNsesh);
  const sNY = hm(cfg.NYsesh);
  const sLC = hm(cfg.LCsesh);
  const sPM = hm(cfg.PMsesh);
  const sASIA2 = hm(cfg.ASIA2sesh);
  const sFREE = hm(cfg.FreeSesh);

  // time(timeframe.period, session, Timezone): the bar time when the bar is in the session, else na
  const sessionTime = (t: number, session: string) => (pineTime.inSession(t, session, Timezone, barMs) ? t : NaN);

  // ta.tr and ta.atr(14)
  const tr = bars.map((b, i) => (i === 0 ? NaN
    : Math.max(b.high - b.low, Math.abs(b.high - bars[i - 1].close), Math.abs(b.low - bars[i - 1].close))));
  const atrArr = forex ? ta.atr(bars, 14).toArray().map((v) => v ?? NaN) : [];

  // request.security(syminfo.tickerid, "W" / "M", open, lookahead = barmerge.lookahead_on): the open of the period
  const periodOpen = (tfp: string) => {
    if (!(cfg.ShowWeekOpen && tfp === 'W') && !(cfg.showMonthOpen && tfp === 'M')) return [] as number[];
    const starts = periodStarts(bars, tfp, chart);
    const out: number[] = [];
    let open = NaN;
    for (let i = 0; i < n; i++) {
      if (i === 0 || starts[i] !== starts[i - 1]) open = bars[i].open;
      out.push(open);
    }
    return out;
  };
  const weeklyOpenArr = periodOpen('W');
  const monthlyOpenArr = periodOpen('M');
  const monthStarts = periodStarts(bars, 'M', chart);

  // timenow fields (exchange time zone)
  const nowYear = pineTime.year(now, tz);
  const nowWeeks = [0, 1, 2, 3, 4].map((k) => pineTime.weekofyear(now - k * 604800000, tz));

  resetDrawings(LIMITS);

  // var drawings created on the first bar
  const newVar = (c: string) => line.new(NaN, NaN, NaN, NaN, 'bar_time', undefined, c, undefined, 1);
  const London_Start_Vline = varDrawing<Line>();
  const London_End_Vline = varDrawing<Line>();
  const LondonFill = varDrawing<Linefill>();
  const NY_Start_Vline = varDrawing<Line>();
  const NY_End_Vline = varDrawing<Line>();
  const NYFill = varDrawing<Linefill>();
  const LC_Start_Vline = varDrawing<Line>();
  const LC_End_Vline = varDrawing<Line>();
  const LCFill = varDrawing<Linefill>();
  const PM_Start_Vline = varDrawing<Line>();
  const PM_End_Vline = varDrawing<Line>();
  const PMFill = varDrawing<Linefill>();
  const Asian_Start_Vline = varDrawing<Line>();
  const Asian_End_Vline = varDrawing<Line>();
  const AsianFill = varDrawing<Linefill>();
  const Free_Start_Vline = varDrawing<Line>();
  const Free_End_Vline = varDrawing<Line>();
  const FreeFill = varDrawing<Linefill>();
  const Midnight_Open = varDrawing<Line>();
  const London_Open = varDrawing<Line>();
  const NY_Open = varDrawing<Line>();
  const Equities_Open = varDrawing<Line>();
  const MOPLB = varDrawing<Label>();
  const MOPLN = varDrawing<Line>();
  const NYOPLB = varDrawing<Label>();
  const NYOPLN = varDrawing<Line>();
  const EOPLB = varDrawing<Label>();
  const EOPLN = varDrawing<Line>();
  const AFTLN = varDrawing<Line>();
  const AFTLB = varDrawing<Label>();
  const Weekly_open = varDrawing<Line>();
  const Weekly_openlbl = varDrawing<Label>();
  const Monthly_open = varDrawing<Line>();
  const Monthly_openlbl = varDrawing<Label>();
  const cbdrbox = varDrawing<Box>();
  const asia_box = varDrawing<Box>();
  const floutbox = varDrawing<Box>();
  const devCbdr = { pos: [1, 2, 3, 4].map(() => varDrawing<Line>()), neg: [1, 2, 3, 4].map(() => varDrawing<Line>()) };
  const devAsia = { pos: [1, 2, 3, 4].map(() => varDrawing<Line>()), neg: [1, 2, 3, 4].map(() => varDrawing<Line>()) };
  const devFlout = { pos: [1, 2, 3, 4].map(() => varDrawing<Line>()), neg: [1, 2, 3, 4].map(() => varDrawing<Line>()) };

  const del = (v: { value: Line | undefined }) => { if (v.value) line.delete(v.value); };
  const delLb = (v: { value: Label | undefined }) => { if (v.value) label.delete(v.value); };
  const delBox = (v: { value: Box | undefined }) => { if (v.value) box.delete(v.value); };
  const delFill = (v: { value: Linefill | undefined }) => { if (v.value) linefill.delete(v.value); };
  const setX2 = (v: { value: Line | undefined }, x: number) => { if (v.value) line.set_x2(v.value, x); };
  const setLbX = (v: { value: Label | undefined }, x: number) => { if (v.value) label.set_x(v.value, x); };

  let openMidnight = 0; // var openMidnight = 0.0
  let prevOpenMidnight = NaN;
  let prevTMidnight = NaN;
  let WeeklyOpenTime = n > 0 ? toMs(bars[0].time) : NaN; // var WeeklyOpenTime = time
  let MonthlyOpenTime = WeeklyOpenTime;
  let cbdrHi = NaN;
  let cbdrLo = NaN;
  let cbdrDiff = NaN;
  let asiaHi = NaN;
  let asiaLo = NaN;
  let asiaDiff = NaN;
  let floutHi = NaN;
  let floutLo = NaN;
  let floutDiff = NaN;
  let prevCbdrT = NaN;
  let prevAsiaT = NaN;
  let prevFloutT = NaN;
  let prevDow = NaN;
  let prevWoy = NaN;
  let cbdrCellCol = '';
  let asiaCellCol = '';
  let LProfile = '';
  let cbdrpipc = NaN;
  let asiapipc = NaN;
  let lastDow = NaN;
  const markers: MarkerData[] = [];
  const dowTexts = ['M O N', 'T U E', 'W E D', 'T H U', 'F R I'];
  const dowTextColor = cfg.i_DOWCol;
  const dowShapeColor = String(color.new(cfg.i_DOWCol, 100));

  for (let i = 0; i < n; i++) {
    setDrawingBar(i, i === last);
    const b = bars[i];
    const time = toMs(b.time);
    const year = pineTime.year(time, tz);
    const month = pineTime.month(time, tz);
    const dayofmonth = pineTime.dayofmonth(time, tz);
    const dayofweek = pineTime.dayofweek(time, tz);
    const woy = pineTime.weekofyear(time, tz);
    const hour = pineTime.hour(time, tz);
    const minute = pineTime.minute(time, tz);
    // ta.change(dayofweek), ta.change(weekofyear), ta.change(time("M")): na (false) on the first bar
    const newDay = i > 0 && dayofweek !== prevDow;
    const newWeek = i > 0 && woy !== prevWoy;
    const newMonth = i > 0 && monthStarts[i] !== monthStarts[i - 1];
    prevDow = dayofweek;
    prevWoy = woy;
    const friday = dayofweek === 6;

    const thisweek = nowYear === year && nowWeeks[0] === woy;
    const Last4Weeks = nowYear === year && nowWeeks.includes(woy);

    const ts = (h: number, m: number) => (isNaN(h) || isNaN(m) ? NaN
      : pineTime.timestamp(Timezone, year, month, dayofmonth, h, m, 0));
    const cbdrOpenTime = ts(sCBDR.sh, sCBDR.sm);
    const cbdrEndTime = ts(sCBDR.eh, sCBDR.em);
    const asiaOpenTime = ts(sASIA.sh, sASIA.sm);
    const asiaEndTime = ts(sASIA.eh, sASIA.em) + DAY;
    const floutOpenTime = ts(sFLOUT.sh, sFLOUT.sm);
    const floutEndTime = ts(sFLOUT.eh, sFLOUT.em) + DAY;
    const CBDRTime = sessionTime(time, CBDR);
    const ASIATime = sessionTime(time, ASIA);
    const FLOUTTime = sessionTime(time, FLOUT);
    const LondonStartTime = ts(sLDN.sh, sLDN.sm);
    const LondonEndTime = ts(sLDN.eh, sLDN.em);
    const NYStartTime = ts(sNY.sh, sNY.sm);
    const NYEndTime = ts(sNY.eh, sNY.em);
    const LCStartTime = ts(sLC.sh, sLC.sm);
    const LCEndTime = ts(sLC.eh, sLC.em);
    const PMStartTime = ts(sPM.sh, sPM.sm);
    const PMEndTime = ts(sPM.eh, sPM.em);
    const AsianStartTime = ts(sASIA2.sh, sASIA2.sm);
    const AsianEndTime = ts(sASIA2.eh, sASIA2.em);
    const FreeStartTime = ts(sFREE.sh, sFREE.sm);
    const FreeEndTime = ts(sFREE.eh, sFREE.em);
    const MidnightOpenTime = ts(0, 0);
    const CLEANUPTIME = ts(0, 0) - 16200000;
    const LondonOpenTime = ts(3, 0);
    const NYOpenTime = ts(8, 30);
    const EquitiesOpenTime = ts(9, 30);
    const AfternoonOpenTime = ts(13, 30);
    const tMidnight = sessionTime(time, '0000-0001:1234567');

    // SessionBegins(sess): DOM and not barstate.isfirst and na(t[1]) and not na(t)
    const cbdrBegins = DOM && i > 0 && isNaN(prevCbdrT) && !isNaN(CBDRTime);
    const asiaBegins = DOM && i > 0 && isNaN(prevAsiaT) && !isNaN(ASIATime);
    const floutBegins = DOM && i > 0 && isNaN(prevFloutT) && !isNaN(FLOUTTime);
    prevCbdrT = CBDRTime;
    prevAsiaT = ASIATime;
    prevFloutT = FLOUTTime;

    // vline(Start, Color, linestyle, LineWidth)
    const vline = (start: number, col: string, style: 'solid' | 'dotted' | 'dashed', width: number) =>
      line.new(start, b.low - tr[i], start, b.high + tr[i], 'bar_time', 'both', col, style, width);

    if (i === 0) {
      London_Start_Vline.value = newVar(transparentcol);
      London_End_Vline.value = newVar(transparentcol);
      LondonFill.value = linefill.new(London_Start_Vline.value, London_End_Vline.value, cfg.LSFC);
      NY_Start_Vline.value = newVar(transparentcol);
      NY_End_Vline.value = newVar(transparentcol);
      NYFill.value = linefill.new(NY_Start_Vline.value, NY_End_Vline.value, cfg.NYSFC);
      LC_Start_Vline.value = newVar(transparentcol);
      LC_End_Vline.value = newVar(transparentcol);
      LCFill.value = linefill.new(LC_Start_Vline.value, LC_End_Vline.value, cfg.LCSFC);
      PM_Start_Vline.value = newVar(transparentcol);
      PM_End_Vline.value = newVar(transparentcol);
      PMFill.value = linefill.new(PM_Start_Vline.value, PM_End_Vline.value, cfg.PMSFC);
      Asian_Start_Vline.value = newVar(transparentcol);
      Asian_End_Vline.value = newVar(transparentcol);
      AsianFill.value = linefill.new(Asian_Start_Vline.value, Asian_End_Vline.value, cfg.ASFC);
      Free_Start_Vline.value = newVar(transparentcol);
      Free_End_Vline.value = newVar(transparentcol);
      FreeFill.value = linefill.new(Free_Start_Vline.value, Free_End_Vline.value, cfg.FSFC);
      Midnight_Open.value = newVar(cfg.MOPColor);
      London_Open.value = newVar(cfg.LOPColor);
      NY_Open.value = newVar(cfg.NYOPColor);
      Equities_Open.value = newVar(cfg.EOPColor);
    }

    // When a new day starts (not on Sundays), draw the session lines
    if (newDay && dayofweek !== 1) {
      const session = (
        show: boolean, start: typeof London_Start_Vline, end: typeof London_End_Vline, fill: typeof LondonFill,
        startTime: number, endTime: number, fillCol: string, keepStart: boolean,
      ) => {
        if (!(show && DOM)) return;
        if (cfg.ShowTSO) {
          if (!keepStart) del(start);
          del(end);
          delFill(fill);
        }
        start.value = vline(startTime, transparentcol, 'solid', 1);
        end.value = vline(endTime, transparentcol, 'solid', 1);
        if (cfg.ShowSFill) fill.value = linefill.new(start.value, end.value, fillCol);
      };
      session(cfg.ShowLondon, London_Start_Vline, London_End_Vline, LondonFill, LondonStartTime, LondonEndTime, cfg.LSFC, false);
      session(cfg.ShowNY, NY_Start_Vline, NY_End_Vline, NYFill, NYStartTime, NYEndTime, cfg.NYSFC, false);
      // London Close: only the end line and the fill of the day before are deleted
      session(cfg.ShowLC, LC_Start_Vline, LC_End_Vline, LCFill, LCStartTime, LCEndTime, cfg.LCSFC, true);
      session(cfg.ShowPM, PM_Start_Vline, PM_End_Vline, PMFill, PMStartTime, PMEndTime, cfg.PMSFC, false);
      session(cfg.ShowAsian, Asian_Start_Vline, Asian_End_Vline, AsianFill, AsianStartTime, AsianEndTime, cfg.ASFC, false);
      session(cfg.ShowFreeSesh, Free_Start_Vline, Free_End_Vline, FreeFill, FreeStartTime, FreeEndTime, cfg.FSFC, false);

      if (cfg.ShowMOP && DOM) {
        if (!cfg.MOLHist) del(Midnight_Open);
        Midnight_Open.value = vline(MidnightOpenTime, cfg.MOPColor, MNOPLS, MOPLW);
      }
      if (cfg.ShowLOP && DOM) {
        if (cfg.ShowTSO) del(London_Open);
        London_Open.value = vline(LondonOpenTime, cfg.LOPColor, LNOPLS, LOPLW);
      }
      if (cfg.ShowNYOP && DOM) {
        if (cfg.ShowTSO) del(NY_Open);
        NY_Open.value = vline(NYOpenTime, cfg.NYOPColor, NWYOPLS, NYOPLW);
      }
      if (cfg.ShowEOP && DOM) {
        if (cfg.ShowTSO) del(Equities_Open);
        Equities_Open.value = vline(EquitiesOpenTime, cfg.EOPColor, EQOPLS, EOPLW);
      }
    }

    // Midnight opening price
    if (truthy(tMidnight)) {
      openMidnight = !truthy(prevTMidnight) ? b.open : Math.max(b.open, openMidnight);
    }
    prevTMidnight = tMidnight;
    const confirmed = i < last || lastBarConfirmedOf(chart);
    // openMidnight != openMidnight[1]: false when the value of the bar before is na
    const midnightChanged = !isNaN(prevOpenMidnight) && Math.abs(openMidnight - prevOpenMidnight) > 1e-10;
    prevOpenMidnight = openMidnight;

    /** Label of an opening price: text, tooltip, text colour and size as the original sets them */
    const priceLabel = (lb: Label, timeText: string, longText: string, timeTip: string) => {
      if (!cfg.ShowLabelText) return;
      // " 00:00 " without the price, " 00:00  |  <open>" with it
      if (SFistrue) {
        label.set_text(lb, ShowPrices ? `${timeText.trimEnd()}  |  ${str.tostring(b.open)}` : timeText);
        label.set_tooltip(lb, timeTip);
      } else {
        label.set_text(lb, ShowPrices ? `${longText.trimEnd()}  |  ${str.tostring(b.open)}` : longText);
        label.set_tooltip(lb, '');
      }
      label.set_textcolor(lb, cfg.LabelTextColor);
      label.set_size(lb, LabelSize);
    };

    if (cfg.ShowMOPP && midnightChanged && DOM && confirmed) {
      delLb(MOPLB);
      if (!cfg.ShowMOPL) del(MOPLN);
      MOPLN.value = line.new(tMidnight, openMidnight, tMidnight + DAY, openMidnight, 'bar_time', undefined, cfg.MOPColP, MOPLSS, MOPPLW);
      if (friday && nonCrypto) line.set_x2(MOPLN.value, tMidnight + 259200000);
      if (cfg.ShowLabel) {
        MOPLB.value = label.new(tMidnight + DAY, openMidnight, '', 'bar_time', 'price', cfg.LabelColor, 'label_left',
          cfg.MOPColP, LabelSize, undefined, 'Midnight Opening Price');
        if (friday && nonCrypto) label.set_x(MOPLB.value, tMidnight + 259200000);
        priceLabel(MOPLB.value, ' 00:00 ', ' Midnight Opening Price ', 'Midnight Opening Price');
      }
      if (time > PMEndTime && time < MidnightOpenTime + DAY) del(MOPLN);
    }
    if (terminusOn && !cfg.ShowMOPL) {
      setX2(MOPLN, terminus());
      setLbX(MOPLB, terminus());
    }

    /** New York / equities / afternoon opening price lines */
    const openLine = (
      show: boolean, at: number, lineVar: typeof MOPLN, lbVar: typeof MOPLB, x1: number, x2: number, fridayX2: number,
      col: string, style: 'solid' | 'dotted' | 'dashed', width: number, tip: string, timeText: string, longText: string,
      timeTip: string,
    ) => {
      if (show && time === at && DOM) {
        delLb(lbVar);
        if (!cfg.ShowPrev) del(lineVar);
        lineVar.value = line.new(x1, b.open, x2, b.open, 'bar_time', undefined, col, style, width);
        if (friday && nonCrypto) line.set_x2(lineVar.value, fridayX2);
        if (cfg.ShowLabel) {
          lbVar.value = label.new(x2, b.open, '', 'bar_time', 'price', cfg.LabelColor, 'label_left', col, LabelSize,
            undefined, tip);
          if (friday && nonCrypto) label.set_x(lbVar.value, fridayX2);
          priceLabel(lbVar.value, timeText, longText, timeTip);
        }
      }
      if (terminusOn && !cfg.ShowPrev) {
        setX2(lineVar, terminus());
        setLbX(lbVar, terminus());
      }
    };
    openLine(cfg.ShowNYOPP, NYOpenTime, NYOPLN, NYOPLB, NYOpenTime, NYOpenTime + 55800000, NYOpenTime + 228600000,
      cfg.NYOPColP, NYOPLSS, NYOPPLW, 'New York Opening Price', ' 08:30 ', ' New York Opening Price ', 'New York Opening Price');
    openLine(cfg.ShowEOPP, EquitiesOpenTime, EOPLN, EOPLB, EquitiesOpenTime, EquitiesOpenTime + 52200000,
      EquitiesOpenTime + 225000000, cfg.EOPColP, EOPLSS, EOPPLW, 'Equities Opening Price', ' 09:30 ',
      ' Equities Opening Price ', 'Equities Opening Price');
    openLine(cfg.ShowAFTPP, AfternoonOpenTime, AFTLN, AFTLB, AfternoonOpenTime, EquitiesOpenTime + 52200000,
      EquitiesOpenTime + 225000000, cfg.AFTOPColP, AFTOPLSS, AFTOPLW, 'Equities Opening Price', ' 01:30 ',
      ' Afternoon Opening Price ', ' Afternoon Opening Price');

    // HTF variables (var, first bar)
    if (i === 0) {
      Weekly_open.value = line.new(NaN, NaN, NaN, NaN, 'bar_time', undefined, cfg.i_WeekOpenCol, WeekOpenLS, 1);
      Weekly_openlbl.value = label.new(NaN, NaN, '', 'bar_time', 'price', cfg.LabelColor, 'label_left', cfg.LabelTextColor, LabelSize);
      Monthly_open.value = line.new(NaN, NaN, NaN, NaN, 'bar_time', undefined, cfg.i_MonthOpenCol, MonthOpenLS, 1);
      Monthly_openlbl.value = label.new(NaN, NaN, '', 'bar_time', 'price', cfg.LabelColor, 'label_left', cfg.LabelTextColor, LabelSize);
    }
    /** Label text of the weekly / monthly open */
    const htfLabel = (lb: Label, value: number, short: string, long: string, tip: string) => {
      if (!cfg.ShowLabelText) return;
      // " W.O.   |  <open>" / " W.O. ", " Weekly Open  |  <open>" / " Weekly Open "
      if (SFistrue) {
        label.set_text(lb, ShowPrices ? `${short}  |  ${str.tostring(value)}` : short);
        label.set_tooltip(lb, tip);
      } else {
        label.set_text(lb, ShowPrices ? `${long}  |  ${str.tostring(value)}` : `${long} `);
        label.set_tooltip(lb, '');
      }
      label.set_textcolor(lb, cfg.LabelTextColor);
      label.set_size(lb, LabelSize);
    };

    // Weekly open
    if (newWeek) WeeklyOpenTime = time;
    if (cfg.ShowWeekOpen && newDay && Last4Weeks) {
      const WeeklyOpen = weeklyOpenArr[i];
      delLb(Weekly_openlbl);
      del(Weekly_open);
      Weekly_open.value = line.new(WeeklyOpenTime - 25200000, WeeklyOpen, EquitiesOpenTime + 52200000, WeeklyOpen,
        'bar_time', undefined, cfg.i_WeekOpenCol, WeekOpenLS, WEEKOPPLW);
      if (friday && nonCrypto) line.set_x2(Weekly_open.value, EquitiesOpenTime + 225000000);
      if (cfg.ShowLabel) {
        Weekly_openlbl.value = label.new(EquitiesOpenTime + 52200000, WeeklyOpen, '', 'bar_time', 'price', cfg.LabelColor,
          'label_left', cfg.LabelTextColor, LabelSize, undefined, 'Weekly Open: ' + str.tostring(WeeklyOpen));
        if (friday && nonCrypto) label.set_x(Weekly_openlbl.value, EquitiesOpenTime + 225000000);
        htfLabel(Weekly_openlbl.value, WeeklyOpen, ' W.O. ', ' Weekly Open', ' Weekly Opening Price ');
      }
    }
    if (mult > 60) {
      setX2(Weekly_open, AsianEndTime + 232000000);
      setLbX(Weekly_openlbl, AsianEndTime + 232000000);
    }
    if (periodD) {
      setX2(Weekly_open, AsianEndTime + 832000000);
      setLbX(Weekly_openlbl, AsianEndTime + 832000000);
    }
    if (periodM) {
      del(Weekly_open);
      delLb(Weekly_openlbl);
    }
    if (terminusOn && DOM) {
      setX2(Weekly_open, terminus());
      setLbX(Weekly_openlbl, terminus());
    }

    // Monthly open
    if (newMonth) MonthlyOpenTime = time;
    if (cfg.showMonthOpen && newDay) {
      const MonthlyOpen = monthlyOpenArr[i];
      del(Monthly_open);
      delLb(Monthly_openlbl);
      Monthly_open.value = line.new(MonthlyOpenTime, MonthlyOpen, AsianEndTime, MonthlyOpen, 'bar_time', undefined,
        cfg.i_MonthOpenCol, MonthOpenLS, MONTHOPPLW);
      if (friday && nonCrypto) line.set_x2(Monthly_open.value, EquitiesOpenTime + 225000000);
      if (cfg.ShowLabel) {
        Monthly_openlbl.value = label.new(AsianEndTime, MonthlyOpen, '', 'bar_time', 'price', cfg.LabelColor, 'label_left',
          cfg.LabelTextColor, LabelSize, undefined, 'Monthly Open: ' + str.tostring(MonthlyOpen));
        if (friday && nonCrypto) label.set_x(Monthly_openlbl.value, EquitiesOpenTime + 225000000);
        htfLabel(Monthly_openlbl.value, MonthlyOpen, ' M.O. ', ' Monthly Open', ' Monthly Opening Price ');
      }
    }
    if (mult > 60) {
      setX2(Monthly_open, AsianEndTime + 232000000);
      setLbX(Monthly_openlbl, AsianEndTime + 232000000);
    }
    if (periodD) {
      setX2(Monthly_open, AsianEndTime + 832000000);
      setLbX(Monthly_openlbl, AsianEndTime + 832000000);
    }
    if (periodW) {
      setX2(Monthly_open, AsianEndTime + 2592000000);
      setLbX(Monthly_openlbl, AsianEndTime + 2592000000);
    }
    if (periodM) {
      del(Monthly_open);
      delLb(Monthly_openlbl);
    }
    if (terminusOn && DOM) {
      setX2(Monthly_open, terminus());
      setLbX(Monthly_openlbl, terminus());
    }

    /**
     * CBDR / ASIA / FLOUT range: a box over the high / low of the session and the standard deviation lines.
     * `steps` are the multiples of the range of the 4 line pairs; `fridayRight` moves the right side on Fridays.
     */
    const range = (
      begins: boolean, inSession: number, hiLo: { hi: number; lo: number; diff: number }, boxVar: typeof cbdrbox,
      dev: typeof devCbdr, show: boolean, showDev: boolean, textOff: boolean, openTime: number, endTime: number,
      boxCol: string, text: string, textCol: string, steps: number[], fridayRight: number,
    ) => {
      const prevHi = hiLo.hi;
      const prevLo = hiLo.lo;
      if (begins && DOM) {
        hiLo.hi = b.high;
        hiLo.lo = b.low;
        hiLo.diff = hiLo.hi - hiLo.lo;
        if (cfg.ShowTSO) {
          delBox(boxVar);
          for (let k = 0; k < 4; k++) {
            del(dev.pos[k]);
            del(dev.neg[k]);
          }
        }
        if (show) {
          boxVar.value = box.new(openTime, hiLo.hi, endTime, hiLo.lo, String(color.new(boxCol, 90)), 1, 'solid', 'none',
            'bar_time', String(color.new(boxCol, 90)), text, 'auto', String(color.new(textCol, 80)), undefined, undefined, 'auto');
          if (friday && !isNaN(fridayRight)) box.set_right(boxVar.value, openTime + fridayRight);
        }
        if (textOff && boxVar.value) box.set_text(boxVar.value, '');
        if (cfg.ShowDev && show && showDev) {
          for (let k = 0; k < 4; k++) {
            const m = steps[k];
            if (!(m <= DevCount)) break;
            const hi = hiLo.hi;
            const lo = hiLo.lo;
            const d = hiLo.diff;
            // the first pair: y2 of the upper line from the high; the next ones from the low (as the original)
            dev.pos[k].value = line.new(openTime, hi + d * m, endTime, k === 0 ? hi + d * m : lo + d * m, 'bar_time',
              undefined, cfg.DevLNCol, DEVLSS, DEVLW);
            dev.neg[k].value = line.new(openTime, hi - d * m, endTime, lo - d * m, 'bar_time', undefined, cfg.DevLNCol,
              DEVLSS, DEVLW);
            if (friday && !isNaN(fridayRight)) {
              line.set_x2(dev.pos[k].value!, openTime + fridayRight);
              line.set_x2(dev.neg[k].value!, openTime + fridayRight);
            }
          }
        }
      } else if (truthy(inSession)) {
        // math.max(high, na) is na
        hiLo.hi = Math.max(b.high, hiLo.hi);
        hiLo.lo = Math.min(b.low, hiLo.lo);
        hiLo.diff = hiLo.hi - hiLo.lo;
        for (let k = 0; k < 4; k++) {
          const m = steps[k];
          if (!(m <= DevCount)) break;
          if (cfg.ShowDev) {
            const p = dev.pos[k].value;
            const q = dev.neg[k].value;
            if (p) {
              line.set_y1(p, hiLo.hi + hiLo.diff * m);
              line.set_y2(p, hiLo.hi + hiLo.diff * m);
            }
            if (q) {
              line.set_y1(q, hiLo.lo - hiLo.diff * m);
              line.set_y2(q, hiLo.lo - hiLo.diff * m);
            }
          }
        }
        if (hiLo.hi - prevHi > 1e-10 && show && boxVar.value) box.set_top(boxVar.value, hiLo.hi);
        if (prevLo - hiLo.lo > 1e-10 && show && boxVar.value) box.set_bottom(boxVar.value, hiLo.lo);
      }
      if (cfg.DevDirection === 'Upside Only') dev.neg.forEach(del);
      else if (cfg.DevDirection === 'Downside Only') dev.pos.forEach(del);
    };

    const cb = { hi: cbdrHi, lo: cbdrLo, diff: cbdrDiff };
    range(cbdrBegins, CBDRTime, cb, cbdrbox, devCbdr, cfg.ShowCBDR, cfg.bool_cbdr_dev, !cfg.box_text_cbdr, cbdrOpenTime,
      cbdrEndTime, cfg.CBDRBoxCol, cfg.txt0, cfg.box_text_cbdr_col, [1, 2, 3, 4], 187200000);
    cbdrHi = cb.hi;
    cbdrLo = cb.lo;
    cbdrDiff = cb.diff;
    // ASIA: the box top / bottom follow the range whatever ShowASIA is; no Friday rule
    const as = { hi: asiaHi, lo: asiaLo, diff: asiaDiff };
    range(asiaBegins, ASIATime, as, asia_box, devAsia, cfg.ShowASIA, cfg.bool_asia_dev, !cfg.box_text_asia, asiaOpenTime,
      asiaEndTime, cfg.ASIABoxCol, cfg.txt1, cfg.box_text_asia_col, [1, 2, 3, 4], NaN);
    asiaHi = as.hi;
    asiaLo = as.lo;
    asiaDiff = as.diff;
    // FLOUT: steps of 0.5; its text is removed by the CBDR "Show Text" input (as the original)
    const fl = { hi: floutHi, lo: floutLo, diff: floutDiff };
    range(floutBegins, FLOUTTime, fl, floutbox, devFlout, cfg.ShowFLOUT, cfg.bool_flout_dev, !cfg.box_text_cbdr,
      floutOpenTime, floutEndTime, cfg.FLOUTBoxCol, cfg.txt7, cfg.box_text_flout_col, [0.5, 1, 1.5, 2], 201600000);
    floutHi = fl.hi;
    floutLo = fl.lo;
    floutDiff = fl.diff;

    // Table values: toWhole(number), forex only
    const atr = forex ? atrArr[i] : NaN;
    const toWhole = (x: number) => {
      if (!forex) return x;
      let r = atr < 1.0 ? x / mintick / 10 : x;
      r = atr >= 1.0 && atr < 100.0 && currency === 'JPY' ? r * 100 : r;
      return r;
    };
    cbdrpipc = toWhole(cbdrDiff);
    asiapipc = toWhole(asiaDiff);
    const cbdrOk = cbdrpipc > 15 && cbdrpipc < 40;
    const asiaOk = asiapipc >= 20 && asiapipc <= 40;
    cbdrCellCol = cbdrOk ? '#1CAC78' : '#FF4040';
    asiaCellCol = asiaOk ? '#1CAC78' : '#FF4040';
    LProfile = cbdrOk ? 'CBDR' : asiaOk ? 'ASIA' : 'FLOUT';

    // Auto SD selection (forex): keep the boxes and lines of the suggested range only
    if (cfg.Auto_Select && forex && truthy(sessionTime(time, midsesh))) {
      const drop = (bx: typeof cbdrbox, dev: typeof devCbdr) => {
        delBox(bx);
        for (let k = 0; k < 4; k++) {
          del(dev.pos[k]);
          del(dev.neg[k]);
        }
      };
      if (cbdrOk) {
        drop(asia_box, devAsia);
        drop(floutbox, devFlout);
      } else if (asiaOk) {
        drop(cbdrbox, devCbdr);
        drop(floutbox, devFlout);
      } else {
        drop(cbdrbox, devCbdr);
        drop(asia_box, devAsia);
      }
    }

    // Day of the week labels (plotchar)
    if (cfg.showDOW && DOM && hour === cfg.DOWTime && minute === 0 && dayofweek >= 2 && dayofweek <= 6) {
      const text = dowTexts[dayofweek - 2];
      const groups = [
        cfg.SL4W && Last4Weeks && !cfg.ShowTWO,
        cfg.ShowTWO && thisweek,
        !cfg.ShowTWO && !cfg.SL4W,
      ];
      for (const on of groups) {
        if (on) {
          markers.push({ time: b.time, position: DOWLoc, shape: 'square', char: ' ', color: dowShapeColor, text,
            textColor: dowTextColor });
        }
      }
    }

    // Cleanup of the drawings before the last 4 weeks / the current week of the bar
    const cleanup = (days: number) => {
      const removal = CLEANUPTIME - days * DAY;
      for (const l of line.all()) if (line.get_x2(l) < removal) line.delete(l);
      for (const l of label.all()) if (label.get_x(l) < removal) label.delete(l);
      for (const x of box.all()) if (box.get_right(x) < removal - DAY) box.delete(x);
    };
    // dayofweek: Monday 0 ... Sunday 6
    const fromMonday = (dayofweek + 5) % 7;
    if (cfg.SL4W) cleanup(fromMonday + 28);
    if (cfg.ShowTWO) cleanup(fromMonday);
    lastDow = dayofweek;
  }
  setDrawingBar(null);

  // Tables (var, created on the first bar; cells on the last bar)
  const tables: TableData[] = [];
  if (n > 0) {
    const CellBG = String(color.new('#131722', 100));
    const ictCells: TableCellData[] = [];
    if (forex && Stats && DOM && lastDow !== 1) {
      const cell = (column: number, row: number, text: string, textColor: string, align: 'left' | 'right') => {
        ictCells.push({ column, row, text, bgColor: CellBG, textColor, textHAlign: align, textSize: 'auto' });
      };
      cell(0, 0, ' Suggested SD ', cfg.Tab1txtCol, 'left');
      cell(0, 1, ' Asian Range ', cfg.Tab1txtCol, 'left');
      cell(0, 2, ' CBDR ', cfg.Tab1txtCol, 'left');
      cell(1, 0, ' ' + LProfile + ' ', cfg.Tab1txtCol, 'right');
      cell(1, 1, '     ' + str.tostring(asiapipc) + ' pips', asiaCellCol, 'right');
      cell(1, 2, '     ' + str.tostring(cbdrpipc) + ' pips', cbdrCellCol, 'right');
    }
    tables.push({ position: placeOf(cfg.TabOption1), columns: 2, rows: 3, cells: ictCells, borderWidth: 1 });

    const biasCells: TableCellData[] = [];
    if (cfg.BIAS_M_Bool) {
      const biasColor = (o: string) => (o === 'Bullish' ? '#1CAC78' : o === 'Bearish' ? '#FF4040' : cfg.Tab2txtCol);
      const rows: Array<[boolean, string, string]> = [[cfg.BIASbool1, cfg.txt52, cfg.BIASOption1],
        [cfg.BIASbool2, cfg.txt53, cfg.BIASOption2], [cfg.BIASbool3, cfg.txt54, cfg.BIASOption3],
        [cfg.BIASbool4, cfg.txt55, cfg.BIASOption4]];
      rows.forEach(([on, name, option], k) => {
        if (!on) return;
        biasCells.push({ column: 0, row: k + 1, text: name, textColor: cfg.Tab2txtCol, textHAlign: 'left', textSize: 'auto' });
        biasCells.push({ column: 1, row: k + 1, text: option, textSize: 'normal', textColor: biasColor(option), textHAlign: 'right' });
      });
    }
    tables.push({ position: placeOf(cfg.TabOption2), columns: 2, rows: 20, cells: biasCells, bgColor: CellBG, borderWidth: 1 });

    const noteCells: TableCellData[] = cfg.NOTES_M_Bool
      ? [{ column: 0, row: 0, text: cfg.notes, textSize: 'normal', textColor: cfg.Tab3txtCol, textHAlign: 'center' }]
      : [];
    tables.push({ position: placeOf(cfg.TabOption3), columns: 1, rows: 20, cells: noteCells, bgColor: CellBG, borderWidth: 1 });
  }

  const drawings = drawingOutputs(bars, ms ? 'ms' : 's');
  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {},
    lines: drawings.lines ?? [],
    labels: drawings.labels ?? [],
    boxes: drawings.boxes ?? [],
    linefills: drawings.linefills ?? [],
    tables,
    markers,
  };
}

export const ICTEverything = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
};
