# Community Indicator Inventory

Community indicators of `lightweight-charts-indicators`: TypeScript ports of community PineScript scripts, built on
[oakscriptjs](https://github.com/deepentropy/oakscriptJS). Each port has the inputs, plots and drawings of its Pine
source. This list is generated from the indicator registry (`indicatorRegistry` in `src/index.ts`).

## Summary

| | Count |
|---|---|
| **Community indicators** | 1404 |
| Drawn on the price pane (overlay) | 894 |
| Drawn in their own pane | 510 |
| Compared with reference outputs (batches 1-42 and the most liked set) | 1086 |

| Category | Count |
|---|---|
| Trend | 449 |
| Oscillators | 243 |
| Volume | 164 |
| Momentum | 161 |
| Moving Averages | 149 |
| Channels & Bands | 132 |
| Candlestick Patterns | 58 |
| Volatility | 48 |

## Columns

- **Id**: the registry id (`indicatorRegistry.find((e) => e.id === id)`).
- **Pane**: `price` for an overlay indicator, `own` for an indicator in its own pane (some plots, backgrounds or
  candles of an `own` indicator can still be drawn on the price pane, as Pine `force_overlay`).
- **Author**: the author of the Pine source, from the port header (empty when the header does not name one).
- **Check**: the batch in which the port was compared with reference outputs (BITSTAMP:BTCUSD 1D and NASDAQ:AAPL 1D,
  full histories, default inputs and input variants: plots, colours, fills, markers, bar / background colours and
  candles; for the most liked set also lines, boxes, labels and tables, and intraday bars). Empty for the
  earlier ports.

## Indicators

| # | Indicator | Id | Category | Pane | Author | Check |
|---|---|---|---|---|---|---|
| 1 | + Average Candle Bodies Range | `average-candle-bodies-range` | Volatility | own | ClassicScott | batch 13 |
| 2 | 12/26 EMA Inflection Zones by Korax | `12-26-ema-inflection-zones-by-korax` | Moving Averages | price | Korax | batch 16 |
| 3 | 15-Minute Squeeze Scalper (Traffic Light Edition) | `15-minute-squeeze-scalper` | Volatility | own | Universal_Scalper_Pro | batch 36 |
| 4 | 1m Trend Continuation Signals - SSL + BB Filter | `1m-trend-continuation-signals-ssl-bb-filter` | Trend | price | rhariganesh | batch 13 |
| 5 | 2B Reversal Pattern (Expo) | `2b-reversal-pattern` | Trend | price | Zeiierman | most liked |
| 6 | 3 Bar Reversal | `3-bar-reversal` | Candlestick Patterns | price | abbadon9 | batch 40 |
| 7 | 3 Confirmation Bear | `3-confirmation-bear` | Trend | price | AirianM | batch 16 |
| 8 | 3 Confirmation Bull | `3-confirmation-bull` | Trend | price | AirianM | batch 21 |
| 9 | 3 Lines RCI + Psy Signal + RSI Background | `3-lines-rci-psy-signal-rsi-background` | Oscillators | own | masato19810122 | batch 36 |
| 10 | 3-in-1 Custom Moving Average Indicator | `3-in-1-custom-moving-average-indicator` | Moving Averages | price | Mr-Fish | batch 22 |
| 11 | 3rd Wave | `3rd-wave` | Trend | price | LonesomeTheBlue | most liked |
| 12 | 5-Minute Buy/Sell Signal | `5-minute-buy-sell-signal` | Trend | price | Waqas_Khalid | batch 14 |
| 13 | 72s: Adaptive Hull Moving Average+ | `adaptive-hull-ma` | Moving Averages | price | io72signals |  |
| 14 | <50% Body Candle | `50-body-candle` | Candlestick Patterns | price | Dutchinvestor | batch 38 |
| 15 | [RS] Support and Resistance V0 | `rs-support-resistance` | Channels & Bands | price | RicardoSantos (community) |  |
| 16 | Abdullah | `abdullah` | Trend | price | royalsherry888 | batch 35 |
| 17 | Absolute Strength Index | `absolute-strength-index` | Oscillators | own | Zeiierman | batch 3 |
| 18 | Absorption Arrows v2 | `absorption-arrows-v2` | Volume | price | WaveWalker1 | batch 41 |
| 19 | Absorption Bubbles | `absorption-bubbles` | Volume | price | profitprotrading | most liked |
| 20 | Abusuhil Bullish Candles | `abusuhil-bullish-candles` | Candlestick Patterns | price | abusuhil | batch 38 |
| 21 | Acceleration Bands HTF | `acceleration-bands-htf` | Channels & Bands | price | ZoharCho | batch 18 |
| 22 | Accumulation/Distribution Money Flow v1.0 | `ad-money-flow` | Volume | own | kypexin | batch 8 |
| 23 | Accurate Swing Trading | `accurate-swing-trading` | Trend | price |  |  |
| 24 | Actually Engulfing Candlesticks | `actually-engulfing-candlesticks` | Candlestick Patterns | price | llbot | batch 40 |
| 25 | Adaptive ALMA 2.0 | `adaptive-alma-2-0` | Moving Averages | price | Zomzi | batch 9 |
| 26 | Adaptive Average Sentiment Oscilator | `adaptive-average-sentiment-oscilator` | Oscillators | own | Zomzi | batch 32 |
| 27 | Adaptive Convergence Divergence | `adaptive-convergence-divergence` | Momentum | own | singhxgurjit | batch 21 |
| 28 | Adaptive Ehlers Filtered Percentile | `adaptive-ehlers-filtered-percentile` | Channels & Bands | price | SchizoQuant | batch 4 |
| 29 | Adaptive Entropy Trend | `adaptive-entropy-trend` | Trend | price | QuantAlgo | batch 6 |
| 30 | Adaptive Friction Filter (AFF) | `adaptive-friction-filter` | Trend | price | QuantAlgo | batch 10 |
| 31 | Adaptive Gaussian AFR | `adaptive-gaussian-afr` | Trend | price | Mattes00 | batch 6 |
| 32 | Adaptive Heikin Ashi | `adaptive-heikin-ashi` | Trend | price | chervolino | batch 13 |
| 33 | Adaptive Kinetic Ribbon | `adaptive-kinetic-ribbon` | Trend | price | QuantAlgo | batch 9 |
| 34 | Adaptive MACD | `adaptive-macd` | Momentum | own |  |  |
| 35 | Adaptive ML Trailing Stop | `adaptive-ml-trailing-stop` | Trend | price | BOSWaves | batch 5 |
| 36 | Adaptive Nadaraya-Watson (Non Repainting) | `adaptive-nadaraya-watson` | Channels & Bands | price | Metrify | batch 10 |
| 37 | Adaptive Pivot Zones | `adaptive-pivot-zones` | Channels & Bands | price | Uncle_the_shooter | batch 17 |
| 38 | Adaptive Rolling Z-Score Channel | `adaptive-rolling-z-score-channel` | Channels & Bands | price | B3AR_Trades | batch 18 |
| 39 | Adaptive RSI \| Lyro RS | `adaptive-rsi-lyro-rs` | Oscillators | own | LyroRS | batch 13 |
| 40 | Adaptive Trend Channel | `adaptive-trend-channel` | Channels & Bands | price | MarketStructureLab | batch 4 |
| 41 | Adaptive Trend Finder (log) | `adaptive-trend-finder` | Trend | price | Julien_Eche | most liked |
| 42 | Adaptive Trend Flow [QuantAlgo] | `adaptive-trend-flow` | Trend | price | QuantAlgo |  |
| 43 | Adaptive Volatility-Scaled Oscillator | `adaptive-volatility-scaled-oscillator` | Volatility | own | Zeiierman | batch 4 |
| 44 | Adjusted RSI | `adjusted-rsi` | Oscillators | own | JTCapitalNL | batch 11 |
| 45 | ADR Contraction Tightness | `adr-contraction-tightness` | Volatility | own | etfbreakouts | batch 33 |
| 46 | Advanced Dual Hull Cross Suite v6 - Precision Signals | `advanced-dual-hull-cross-suite-v6-precision-signals` | Moving Averages | price | NitMan279 | batch 36 |
| 47 | Advanced MACD Pro - T3 Themed | `advanced-macd-pro-t3-themed` | Momentum | own | WhiteStone_Ibrahim | batch 27 |
| 48 | Advanced Volume-Driven Breakout Signals | `advanced-volume-driven-breakout-signals` | Volume | price | VolumeVigilante | batch 38 |
| 49 | AdvancedLines (FiboBands) - PaSKaL | `advancedlines-paskal` | Channels & Bands | price | uPaSKaL | batch 19 |
| 50 | ADX and DI | `adx-and-di` | Trend | own | BeikabuOyaji | most liked |
| 51 | ADX and RSI Combo | `adx-and-rsi-combo` | Oscillators | own | Tracks | batch 10 |
| 52 | ADX by cobra | `adx-cobra` | Trend | own | cobra (community) |  |
| 53 | ADX Di+ Di- [Gu5] | `adx-di-gu5` | Trend | own | Gu5tavo71 |  |
| 54 | ADX Extreme Zones + Divergences | `adx-extreme-zones-divergences` | Trend | own | TradeVizion | batch 13 |
| 55 | ADX Trend Strength Filter + TRAMA | `adx-trend-strength-filter-trama` | Trend | price | DotGain | batch 18 |
| 56 | ADX Trend Visualizer with Dual Thresholds | `adx-trend-visualizer-with-dual-thresholds` | Trend | own | crankyprofits | batch 32 |
| 57 | ADX with Shaded Zone | `adx-with-shaded-zone` | Trend | own | MathThomas | batch 20 |
| 58 | ADX-vALMA (N) | `adx-valma` | Trend | own | Zomzi | batch 6 |
| 59 | Aegis Prime Flow | `aegis-prime-flow` | Oscillators | own | wjdtks255 | batch 34 |
| 60 | Aggregated Scores Oscillator | `aggregated-scores-oscillator` | Oscillators | own | AlphaExtract | batch 8 |
| 61 | Aggressive Pullback Indicator | `aggressive-pullback-indicator` | Trend | price | ZenAndTheArtOfTrading | batch 1 |
| 62 | Aggressive Volume | `aggressive-volume` | Volume | own | oDouglasAlex | batch 26 |
| 63 | AI Adaptive Oscillator | `ai-adaptive-oscillator` | Oscillators | own | PhenLabs | batch 11 |
| 64 | AI Breakout Bands | `ai-breakout-bands` | Channels & Bands | price | Zeiierman | batch 3 |
| 65 | AI Engulfing Candle | `ai-engulfing` | Candlestick Patterns | price |  |  |
| 66 | AI Infinity | `ai-infinity` | Trend | price | jonathanalbrecht_trader | batch 11 |
| 67 | AI Source Switching Moving Average | `ai-source-switching-moving-average` | Moving Averages | price | Zeiierman | batch 1 |
| 68 | AI Trading Assistant v2 | `ai-trading-assistant-v2` | Trend | price | Alchemical_Carpenter | batch 26 |
| 69 | AI Trend Navigator [K-Neighbor] | `ai-trend-navigator` | Trend | price |  |  |
| 70 | AI Volume Signals | `ai-volume-signals` | Volume | price | szymonsobkowiak | batch 9 |
| 71 | AI-Weighted RSI | `ai-weighted-rsi` | Oscillators | own | Zeiierman | batch 3 |
| 72 | AK MACD BB | `macd-bb` | Momentum | own | Algokid |  |
| 73 | AK TREND ID | `ak-trend-id` | Trend | own | Algokid |  |
| 74 | Al Brooks II.IOI.OO | `al-brooks-ii-ioi-oo` | Candlestick Patterns | price |  | batch 42 |
| 75 | Al Po's Arithmetic Mean | `al-po-s-arithmetic-mean` | Moving Averages | price | sequentialvision | batch 21 |
| 76 | All Candlestick Patterns | `all-candlestick-patterns` | Candlestick Patterns | price |  |  |
| 77 | All-In-One MA Stack Scalper | `all-in-one-ma-stack-scalper` | Moving Averages | price | jonesdaniel2112 | batch 33 |
| 78 | ALL-IN-ONE RSI System (Cloud Divergence Stoch RSI CM WVF) | `all-in-one-rsi-system` | Oscillators | own | ethem11 | batch 25 |
| 79 | AllMA Trend Radar | `allma-trend-radar` | Moving Averages | price | trade_lexx | batch 28 |
| 80 | ALMA SD Bands \| RakoQuant | `alma-sd-bands-rakoquant` | Channels & Bands | price | RakoQuant | batch 10 |
| 81 | Alpha Trading Signal _ Up side Down | `alpha-trading-signal-up-side-down` | Trend | price | giaodichdsmart | batch 19 |
| 82 | Alpha-Sutte Model | `alpha-sutte-model` | Trend | price | SegaRKO | batch 10 |
| 83 | AlphaTrend | `alpha-trend` | Trend | price | KivancOzbilgic |  |
| 84 | AMD Po3 with Live Edge Stats | `amd-po3-with-live-edge-stats` | Trend | price | WillyAlgoTrader | most liked |
| 85 | Anchored Bollinger Band Range | `anchored-bollinger-band-range` | Channels & Bands | price | Steversteves | batch 20 |
| 86 | Anchored VWAP Pro (Final Visibility Enhanced) | `anchored-vwap-pro` | Volume | price | ImmortalEmerson | batch 17 |
| 87 | Anchored VWAP with Buy/Sell Signals | `anchored-vwap-with-buy-sell-signals` | Volume | price | kmootoo89 | batch 29 |
| 88 | ANDROMEDA - TrendSync | `andromeda-trendsync` | Trend | price | Pedro_Canto | batch 9 |
| 89 | Anti-Volume Stop Loss | `anti-volume-stop` | Trend | price |  |  |
| 90 | Apex Volatility Squeeze & Breakout | `apex-volatility-squeeze-breakout` | Volatility | price | Pineify | batch 33 |
| 91 | Arnaud Legoux Gaussian Flow \| AlphaNatt | `arnaud-legoux-gaussian-flow-alphanatt` | Moving Averages | price | AlphaNatt | batch 17 |
| 92 | Aroon with RSI Confirmation (92.86%) | `aroon-with-rsi-confirmation` | Trend | price | jaydipali622018 | batch 7 |
| 93 | ASDQWE123 2.0 | `asdqwe123-2-0` | Trend | price | luvuoov | batch 34 |
| 94 | Asian & London Session High/Low | `asian-london-session-high-low` | Channels & Bands | price | NikolayBorisov | batch 8 |
| 95 | Ask-Weighted Averages | `ask-weighted-averages` | Volume | price | DinoTradez | batch 27 |
| 96 | Asset risk metrics | `asset-risk-metrics` | Momentum | price | Sweettz | batch 21 |
| 97 | Asymmetric Volatility Trend Line | `asymmetric-volatility-trend-line` | Trend | price | QuantAlgo | batch 4 |
| 98 | ATR Based Zigzag w EMA | `atr-based-zigzag-w-ema` | Trend | price | HabibiBudo | batch 4 |
| 99 | ATR HEMA | `atr-hema` | Moving Averages | price | SeerQuant | batch 2 |
| 100 | ATR Period | `nrtr` | Trend | price |  |  |
| 101 | ATR Period | `profit-maximizer` | Moving Averages | price |  |  |
| 102 | ATR Period | `supertrend-ladder` | Trend | price |  |  |
| 103 | ATR Rope | `atr-rope` | Trend | price | SamRecio | batch 2 |
| 104 | ATR Stop Loss Finder | `atr-stop-loss-finder` | Volatility | price | veryfid | most liked |
| 105 | ATR Trailing Stop with ATR Targets | `atr-trailing-stop-with-atr-targets` | Trend | price | TRDRZone | batch 33 |
| 106 | ATR Trailing Stops | `atr-trailing-stops` | Trend | price |  |  |
| 107 | ATR Trend Color | `atr-trend-color` | Trend | price | Aleksin_Aleksandar | batch 31 |
| 108 | ATR Volatility and Trend Analysis | `atr-volatility-and-trend-analysis` | Volatility | price | dchunt-stack | batch 10 |
| 109 | ATR ZLEMA | `atr-zlema` | Trend | price | QuantAlgo | batch 3 |
| 110 | ATR+ Stop Loss Indicator | `atr-plus` | Trend | own | ZenAndTheArtOfTrading |  |
| 111 | ATR-Normalized VWMA Deviation | `atr-normalized-vwma-deviation` | Oscillators | own | exploretranspose | batch 10 |
| 112 | ATR-Scaled Deviation Oscillator | `atr-scaled-deviation-oscillator` | Oscillators | own | C_H_I_P_A | batch 23 |
| 113 | ATR20 SMA x3.5 Trailing Line | `atr20-sma-x3-5-trailing-line` | Volatility | price | hibinomasakazu1991 | batch 30 |
| 114 | Aura Sentiment & Risk Flow | `aura-sentiment-risk-flow` | Oscillators | own | Pineify | batch 34 |
| 115 | Aura Trend & Candlestick Matrix | `aura-trend-candlestick-matrix` | Trend | price | Pineify | batch 9 |
| 116 | Aura Vortex Oscillator | `aura-vortex-oscillator` | Oscillators | own | Pineify | batch 32 |
| 117 | Aura: Adaptive Statistical Smoother | `aura-adaptive-statistical-smoother` | Moving Averages | price | Pineify | batch 15 |
| 118 | Auto AVWAP (Anchored-VWAP) with Breakout Screener | `auto-avwap-with-breakout-screener` | Volume | price | manoharvs | batch 28 |
| 119 | Auto Fib | `auto-fib-theyangguizi` | Channels & Bands | price |  | most liked |
| 120 | Auto Fib Retracement Alerts | `auto-fib-retracement-alerts` | Trend | price | DevLucem | most liked |
| 121 | Auto Fibo on Indicators | `auto-fibo-indicators` | Oscillators | own | KivancOzbilgic |  |
| 122 | Auto Fibonacci | `auto-fib` | Channels & Bands | price |  |  |
| 123 | Auto PitchFan, Fib Extension/Retracement and ZigZag by DGT | `auto-pitchfan-fib-extension-retracement-and` | Trend | price | dgtrd | most liked |
| 124 | Auto Pitchfork, Fib Retracement and Zig Zag by DGT | `auto-pitchfork-fib-retracement-zig-zag` | Trend | price | dgtrd | most liked |
| 125 | Auto Trendline [DojiEmoji] | `auto-trendline` | Trend | price |  |  |
| 126 | Auto-Support | `auto-support` | Channels & Bands | price |  |  |
| 127 | Automated Z-scoring | `automated-z-scoring` | Oscillators | own | JTCapitalNL | batch 14 |
| 128 | Automatic Support & Resistance | `auto-support-resistance` | Channels & Bands | price |  |  |
| 129 | Average Bullish & Bearish Percentage Change | `average-bullish-bearish-percentage-change` | Momentum | own | fract | batch 23 |
| 130 | Average Sentiment Oscillator | `average-sentiment-oscillator` | Oscillators | own |  |  |
| 131 | Average True Range Trailing Stops Colored | `atr-trailing-colored` | Trend | price |  |  |
| 132 | Awesome Oscillator V2 | `awesome-oscillator-v2` | Oscillators | own |  |  |
| 133 | Awesome_Accelerator_Zone Oscillator | `awesome-accelerator-zone-oscillator` | Oscillators | own | pirooz_trader | batch 18 |
| 134 | B + A + D v0.4 | `b-a-d-v0-4` | Momentum | own | wepritz84 | batch 13 |
| 135 | BACAP PRICE STRUCTURE 21 EMA TREND | `bacap-price-structure-21-ema-trend` | Trend | price | Alex_PrimeTrading | batch 19 |
| 136 | Banker Fund Flow Trend Oscillator | `banker-fund-flow` | Oscillators | own |  |  |
| 137 | Bar Replay Fix | `bar-replay-fix` | Candlestick Patterns | price | ivanrdgc | batch 42 |
| 138 | BB Breakout Oscillator | `bb-breakout-oscillator` | Oscillators | own | LuxAlgo |  |
| 139 | BB Fibonacci Ratios | `bb-fibonacci-ratios` | Channels & Bands | price |  |  |
| 140 | BB Length | `ideal-bb-ma` | Moving Averages | price |  |  |
| 141 | BB Stochastic RSI Extreme Signal | `bb-stoch-rsi` | Oscillators | price |  |  |
| 142 | Beep Boop | `beep-boop` | Momentum | own | OBSIDE | batch 33 |
| 143 | Bernoulli Process - Binary Entropy | `bernoulli-process-entropy` | Oscillators | own | kocurekc | batch 1 |
| 144 | BEST Supertrend CCI | `supertrend-cci` | Trend | price | Daveatt |  |
| 145 | Beta-Weighted Moving Average | `weighted-ma-function` | Moving Averages | price |  |  |
| 146 | Better Volume Indicator | `better-volume` | Volume | own | LazyBear |  |
| 147 | Big Snapper Alerts R3.0 | `big-snapper-alerts` | Trend | price |  |  |
| 148 | Big Trades Detector By HF | `big-trades-detector-by-hf` | Volume | price | Nicolas_Favilla | batch 38 |
| 149 | Big Trades Whale Detector By HK | `big-trades-whale-detector-by-hk` | Volume | price | colacorn | batch 38 |
| 150 | Biggest Volume | `biggest-volume` | Volume | own | mikhail_marka | batch 22 |
| 151 | Bilateral Filter For Loop | `bilateral-filter-for-loop` | Trend | own | BackQuant | batch 14 |
| 152 | Binary Option Arrows | `binary-option-arrows` | Trend | price |  |  |
| 153 | Bitcoin 2Y-SMA Bands\| Astral Vision | `bitcoin-2y-sma-bands-astral-vision` | Channels & Bands | own | AstralVision | batch 34 |
| 154 | Bitcoin Bull/Bear Market Support/Resistance Bands | `bitcoin-bull-bear-market-support-resistance-bands` | Moving Averages | price | JoeSTM | batch 30 |
| 155 | Bitcoin Kill Zones v2 | `bitcoin-kill-zones` | Trend | price |  |  |
| 156 | Bitcoin Log Growth Curves | `bitcoin-log-curves` | Trend | price | Quantadelic |  |
| 157 | Bitcoin: Mayer Multiple | `bitcoin-mayer-multiple` | Oscillators | own | sito4713 | batch 25 |
| 158 | Bitcoin: Pi Cycle Top & Bottom Indicator Z Score | `bitcoin-pi-cycle-top-bottom-indicator-z-score` | Oscillators | own | Commandoum | batch 37 |
| 159 | Bjorgum AutoTrail | `bjorgum-autotrail` | Trend | price | Bjorgum (simplified for auto mode) |  |
| 160 | Bjorgum Key Levels | `bjorgum-key-levels` | Trend | price | Bjorgum | most liked |
| 161 | Bjorgum MTF MA | `bjorgum-mtf-ma` | Moving Averages | price | Bjorgum | most liked |
| 162 | Bjorgum SuperScript | `bjorgum-superscript` | Trend | price | Bjorgum | most liked |
| 163 | Bjorgum TSI | `bjorgum-tsi` | Momentum | own |  |  |
| 164 | Blacklab84 Panel | `blacklab84-panel` | Oscillators | own | blacklab84 | batch 21 |
| 165 | BNF 25/50 MA Pullback Screener (Uptrend-Below / Downtrend-Above) | `bnf-25-50-ma-pullback-screener` | Trend | price | jackson_g_sheehan | batch 35 |
| 166 | Bollinger Adaptive Trend Navigator | `bollinger-adaptive-trend-navigator` | Trend | price | QuantAlgo | batch 16 |
| 167 | Bollinger Awesome Alert R1.1 | `bollinger-awesome-alert` | Trend | price |  |  |
| 168 | Bollinger Free Bars | `bollinger-free-bars` | Channels & Bands | price | pkuliyi | batch 36 |
| 169 | Bollinger Heatmap | `bollinger-heatmap` | Channels & Bands | own | Quantitative | batch 25 |
| 170 | Boom Hunter Pro | `boom-hunter-pro` | Momentum | own | veryfid |  |
| 171 | Breakdown or Buyable Dip? Pullback Depth Can Help | `breakdown-or-buyable-dip-pullback-depth-can-help` | Momentum | own | TradeStation | batch 23 |
| 172 | Breaker Blocks + Order Blocks confirm BBOB Alert | `breaker-blocks-order-blocks-confirm-bbob-alert` | Trend | price | TradingFinder | most liked |
| 173 | Breaker Blocks with Signals | `breaker-blocks-with-signals` | Trend | price | LuxAlgo | most liked |
| 174 | Breakout an Reversal Signal Detector with Colored in Bar Trends | `breakout-an-reversal-signal-detector-with-colored-in-bar-trends` | Channels & Bands | price | AmGlad_Trader | batch 25 |
| 175 | Breakout Finder | `breakout-finder` | Trend | price | LonesomeTheBlue | most liked |
| 176 | Breakout Indicator | `breakout-indicator` | Trend | price | ZenAndTheArtOfTrading | batch 1 |
| 177 | Breakout Probability (Expo) | `breakout-probability` | Volatility | price | Zeiierman | most liked |
| 178 | Breakout Targets | `breakout-targets` | Channels & Bands | price | AlgoAlpha | most liked |
| 179 | Breakouts with Tests & Retests | `breakouts-with-tests-retests` | Trend | price | LuxAlgo | most liked |
| 180 | BTC Logarithmic Regression Quantile Bands \| Astral Vision | `btc-logarithmic-regression-quantile-bands-astral-vision` | Channels & Bands | price | AstralVision | batch 24 |
| 181 | Bull Bear Power Trend | `bull-bear-power-trend` | Momentum | own |  |  |
| 182 | Bullish Engulfing Finder | `bullish-engulfing-finder` | Candlestick Patterns | price |  |  |
| 183 | Bullish Volume Anomaly | `bullish-volume-anomaly` | Volume | price | UnknownUnicorn13336802 | batch 31 |
| 184 | Bulls or Bears in Control | `bulls-bears-control` | Trend | own |  |  |
| 185 | Bulls v Bears | `bulls-v-bears` | Momentum | own | Mihkel00 | batch 3 |
| 186 | Buy & Sell - Accurate Signals | `buy-sell-accurate-signals` | Trend | price | Cryptokingworld91 (published as "Buy & Sell - Accurate Signals") | batch 7 |
| 187 | Buy & Sell Pressure | `buy-sell-pressure` | Volume | own |  |  |
| 188 | Buy Low Sell High Composite Upgraded V6 | `buy-low-sell-high-composite-upgraded-v6` | Oscillators | own | kristian6ncqq | batch 15 |
| 189 | Buy on Volume | `buy-on-volume` | Moving Averages | price | Mando4_27 | batch 21 |
| 190 | Buy Sell Signal | `buy-sell-signal-kelfry98` | Trend | price | kelfry98 | most liked |
| 191 | Buy the Dip & Sell the Rip | `buy-the-dip-sell-the-rip` | Momentum | price | vvedding | batch 41 |
| 192 | Buy/Sell Hull Crossover Signals (Fast & Slow) | `buy-sell-hull-crossover-signals` | Moving Averages | price | VibeAlgos | batch 11 |
| 193 | Buyers & Sellers / Range | `buyers-sellers-range` | Oscillators | own | fract | batch 11 |
| 194 | Buyers vs Sellers | `buyers-vs-sellers` | Momentum | own | davorloncarpetrovic | batch 19 |
| 195 | Buying & Selling Pressure | `buying-selling-pressure` | Volatility | own | fract | batch 3 |
| 196 | Buying and Selling Volume Pressure S/R | `buying-and-selling-volume-pressure-s-r` | Volume | price | DinoTradez | batch 16 |
| 197 | Buying Selling Volume | `buying-selling-volume` | Volume | own | ceyhun (community) |  |
| 198 | Buying vs Selling Moving Averages (Scalp Meter) | `buying-vs-selling-moving-averages` | Volume | own | codycolton97 | batch 24 |
| 199 | BuySell Volume Bar Chart | `buysell-volume-bar-chart` | Volume | own | roshbiz1408 | batch 21 |
| 200 | BuySell%_ImtiazH_v2 | `buysell-imtiazh-v2` | Volume | own | a272a59956 | batch 22 |
| 201 | Buyside & Sellside Liquidity | `buyside-sellside-liquidity` | Trend | price | LuxAlgo | most liked |
| 202 | Cabal Dev Indicator | `cabal-dev-indicator` | Oscillators | own | SolanaMemeCoins | batch 26 |
| 203 | Candle Breakout Oscillator | `candle-breakout-oscillator` | Oscillators | own | LuxAlgo | batch 2 |
| 204 | Candle BUY SELL + Support Resistance | `candle-buy-sell-support-resistance` | Channels & Bands | price | JohnsonForexTrader | batch 32 |
| 205 | Candle Channel | `candle-channel` | Channels & Bands | price | Uncle_the_shooter | batch 23 |
| 206 | Candle Color Flip | `candle-color-flip` | Candlestick Patterns | price | LorPlant | batch 42 |
| 207 | Candle Count RSI | `candle-count-rsi` | Oscillators | own | Sherlock_MacGyver | batch 35 |
| 208 | Candle Range Theory (CRT) by Lucas | `candle-range-theory-by-lucas` | Trend | price | lucasfff | batch 15 |
| 209 | Candle Range Trading (CRT) | `candle-range-trading` | Trend | price | marcostan93 | batch 1 |
| 210 | Candle Spread Oscillator (CS0) | `candle-spread-oscillator` | Oscillators | own | RWCS_LTD | batch 36 |
| 211 | Candle State (The Strat) | `candle-state` | Candlestick Patterns | price | Crinklebine | batch 38 |
| 212 | Candlestick Patterns Identified | `candlestick-patterns-identified` | Candlestick Patterns | price | repo32 | batch 38 |
| 213 | Candlestick Reversal | `candlestick-reversal` | Candlestick Patterns | price | LonesomeTheBlue (community) |  |
| 214 | Candlestick Trend Indicator v0.5 by JustUncleL | `candlestick-trend-indicator` | Trend | price | JustUncleL | most liked |
| 215 | Cardwell RSI by TQ | `cardwell-rsi-by-tq` | Oscillators | own | TradeQUO | batch 24 |
| 216 | Carrier Volatility | `carrier-volatility` | Oscillators | own | et20tradeview | batch 15 |
| 217 | CBC Flip with Volume | `cbc-flip-with-volume` | Trend | price | PtGambler | batch 18 |
| 218 | CCI coded OBV | `cci-obv` | Oscillators | own | LazyBear |  |
| 219 | CCI Length | `cci-stochastic` | Momentum | own |  |  |
| 220 | CCI Pro | `cci-hash-capital` | Oscillators | own | Hash_Capital | batch 24 |
| 221 | CCT Bollinger Band Oscillator | `cct-bbo` | Oscillators | own | LazyBear |  |
| 222 | CDC Action Zone | `cdc-action-zone` | Trend | price |  |  |
| 223 | Center of Gravity Channel | `cog-channel` | Channels & Bands | price |  |  |
| 224 | CHAKRA RISS ENGULFING CANDLESTICK STRATEGY | `chakra-riss-engulfing-candlestick-strategy` | Momentum | price | Tradewith_Riss | batch 18 |
| 225 | Chandelier Exit | `chandelier-exit` | Trend | price |  |  |
| 226 | Chandelier Stop | `chandelier-stop` | Trend | price |  |  |
| 227 | Change in State of Delivery CISD | `change-in-state-of-delivery-cisd` | Trend | price | AlgoAlpha | most liked |
| 228 | Change-Point Detection (CUSUM) | `change-point-detection` | Trend | price | LuxAlgo | batch 6 |
| 229 | CHN BUY SELL with EMA 200 | `chn-buy-sell-with-ema-200` | Trend | price | CHNTeam | batch 10 |
| 230 | Clean Buy Sell Pro | `clean-buy-sell-pro` | Trend | price | JohnsonForexTrader | batch 40 |
| 231 | Clean Volume Bars (Green/Red + Above Avg Highlight) | `clean-volume-bars` | Volume | own | melospoker80 | batch 37 |
| 232 | Climax Volume Reversal Radar | `climax-volume-reversal-radar` | Volume | own | Ty_yanse | batch 31 |
| 233 | Clustering Volatility (ATR-ADR-ChaikinVol) | `clustering-volatility` | Volatility | own | SDF-Solutions | batch 24 |
| 234 | CM EMA Trend Bars | `cm-ema-trend-bars` | Trend | price | ChrisMoody |  |
| 235 | CM Enhanced Ichimoku Cloud V5 | `cm-enhanced-ichimoku` | Channels & Bands | price | ChrisMoody (community) |  |
| 236 | CM Gann Swing High Low V2 | `cm-gann-swing` | Trend | price | ChrisMoody (community) |  |
| 237 | CM Guppy EMA | `cm-guppy-ema` | Moving Averages | price | ChrisMoody |  |
| 238 | CM Heikin-Ashi | `cm-heikin-ashi` | Candlestick Patterns | price | ChrisMoody |  |
| 239 | CM Laguerre PPO PercentileRank | `cm-laguerre-ppo` | Oscillators | own | ChrisMoody |  |
| 240 | CM MACD Custom Indicator - Multiple Time Frame - V2 | `cm-macd-custom-mtf-v5` | Momentum | own | ChrisMoody | most liked |
| 241 | CM Price Action Bars | `cm-price-action` | Oscillators | price | ChrisMoody |  |
| 242 | CM RSI Plus EMA | `cm-rsi-ema` | Oscillators | own | ChrisMoody |  |
| 243 | CM RSI-2 Strategy Lower | `cm-rsi-2-lower` | Oscillators | own | ChrisMoody |  |
| 244 | CM RSI-2 Strategy Upper | `cm-rsi-2-upper` | Oscillators | price | ChrisMoody |  |
| 245 | CM Sling Shot System | `cm-sling-shot` | Trend | price | ChrisMoody |  |
| 246 | CM Stochastic Highlight Bars | `cm-stoch-highlight` | Oscillators | price | ChrisMoody |  |
| 247 | CM Stochastic Multi-TimeFrame | `cm-stochastic-mtf` | Oscillators | own | ChrisMoody | most liked |
| 248 | CM Stochastic POP Method 1 | `stoch-pop-1` | Oscillators | own | ChrisMoody |  |
| 249 | CM Stochastic POP Method 2 | `stoch-pop-2` | Oscillators | own | ChrisMoody |  |
| 250 | CM Time Based Vertical Lines | `cm-time-lines` | Trend | price | ChrisMoody |  |
| 251 | CM Williams Vix Fix V3 | `cm-vix-fix-v3` | Oscillators | own | ChrisMoody |  |
| 252 | CM_Parabolic SAR | `cm-parabolic-sar` | Trend | price | ChrisMoody | most liked |
| 253 | CM_Pivot Points_M-W-D-4H-1H_Filtered | `cm-pivot-points-filtered` | Trend | price | ChrisMoody | most liked |
| 254 | CM_Ultimate RSI Multi Time Frame | `cm-ultimate-rsi-mtf` | Oscillators | own | ChrisMoody | most liked |
| 255 | CM_Ultimate_MA_MTF_V2 | `cm-ultimate-ma-mtf-v2` | Moving Averages | price | ChrisMoody | most liked |
| 256 | CM_Williams_Vix_Fix_V3_Upper_Text Plots | `cm-vix-fix-v3-upper-text-plots` | Volatility | price | ChrisMoody | most liked |
| 257 | CMO For Loop \| QuantLapse | `cmo-for-loop-quantlapse` | Momentum | own | QuantLapse | batch 19 |
| 258 | Colored Volume Bars | `colored-volume` | Volume | own | LazyBear |  |
| 259 | Combined Up down with volume | `combined-up-down-with-volume` | Volume | price | ChartMantra_ | batch 41 |
| 260 | Combo Oscillator - MACD + Stoch + RSI + EMA | `combo-oscillator-macd-stoch-rsi-ema` | Oscillators | own | Gauder84 | batch 34 |
| 261 | Community MoneyLine | `community-moneyline` | Trend | price | rafstar_kaczmarek | batch 12 |
| 262 | Composite Indicator (CCI + ATR) | `composite-indicator` | Momentum | price | CharLi0t | batch 17 |
| 263 | Consecutive Candles DevisSo | `consecutive-candles-devisso` | Trend | price | engineerofmoney | batch 11 |
| 264 | Consecutive Higher/Lower Closings | `consecutive-higher-lower-closings` | Trend | price | rahul_joshi_2 | batch 39 |
| 265 | Consolidation Zones - Live | `consolidation-zones` | Channels & Bands | price | LonesomeTheBlue |  |
| 266 | Conversion Periods | `ichimoku-oscillator` | Momentum | own |  |  |
| 267 | Coral Trend | `coral-trend` | Trend | price | LazyBear |  |
| 268 | Corrected Moving Average | `corrected-moving-average` | Moving Averages | price | everget | batch 3 |
| 269 | COV Bands ~ C H I P A | `cov-bands-c-h-i-p-a` | Channels & Bands | own | C_H_I_P_A | batch 28 |
| 270 | Crosby Ratio \| QuantumResearch | `crosby-ratio-quantumresearch` | Momentum | own | QuantumResearch | batch 17 |
| 271 | Crossover EMMM | `crossover-emmm` | Trend | price | NunyadzilaTrading | batch 22 |
| 272 | CRT indicator | `crt-indicator` | Trend | price | INTELA | batch 16 |
| 273 | Cumulative Delta Volume | `cumulative-delta-volume` | Volume | own | LonesomeTheBlue | most liked |
| 274 | Cumulative Volume Delta Divergence Periodic EMA | `cumulative-volume-delta-divergence-periodic` | Volume | own | TradingFinder | most liked |
| 275 | Cup Finder | `cup-finder` | Trend | price | LonesomeTheBlue | most liked |
| 276 | Curved Trend Channels | `curved-trend-channels` | Channels & Bands | price | Zeiierman | batch 7 |
| 277 | Custom Buy and Sell Signal with Body Ratio and RSI | `custom-buy-and-sell-signal-with-body-ratio-and-rsi` | Momentum | price | am-solaris | batch 38 |
| 278 | Custom Donchian Channels | `donchian-custom` | Channels & Bands | price |  |  |
| 279 | Customizable RSI/StochRSI Double Confirmation | `customizable-rsi-stochrsi-double-confirmation` | Momentum | price | smile_bad_day | batch 42 |
| 280 | CVD & Big Trade Detector By HK | `cvd-big-trade-detector-by-hk` | Volume | own | colacorn | batch 39 |
| 281 | CVD (Cumulative Volume Delta) | `cvd-rupward` | Volume | own | RUpward | batch 19 |
| 282 | CVD Divergence Background By HK | `cvd-divergence-background-by-hk` | Volume | price | colacorn | batch 42 |
| 283 | CVD Polarity Indicator (With Rolling Smoothed) | `cvd-polarity-indicator` | Volume | own | Cruiser | batch 35 |
| 284 | CVD Reversal Divergence (Exhaustion) | `cvd-reversal-divergence` | Volume | price | somnacin | batch 39 |
| 285 | Cycle & Flow Indicator - D_Quant | `cycle-flow-indicator-d-quant` | Trend | price | D_QUANT | batch 22 |
| 286 | Cycle Low (RSI + StochRSI) – v5 John.K | `cycle-low-v5-john-k` | Momentum | price | John_Kal | batch 22 |
| 287 | Cycle-Synced Channel Breakout | `cycle-synced-channel-breakout` | Channels & Bands | price | TradeTechanalysis | batch 25 |
| 288 | Daily Weekly Monthly Yearly Opens | `daily-weekly-monthly-yearly-opens` | Trend | price | sbtnc | most liked |
| 289 | Dan's Ironclad OB - Simple | `dan-s-ironclad-ob-simple` | Trend | price | hynaxiii | batch 10 |
| 290 | Darvas Box | `darvas-box` | Candlestick Patterns | price |  |  |
| 291 | Dead Simple Reversal | `dead-simple-reversal` | Candlestick Patterns | price | B3AR_Trades (converted from "p2f - Dead Simple Reversal" by paidtofade; | batch 41 |
| 292 | DECODE Moving Average Toolkit | `decode-moving-average-toolkit` | Moving Averages | price | decodejar | batch 20 |
| 293 | Delta Flow Profile | `delta-flow-profile` | Volume | price | LuxAlgo | most liked |
| 294 | Delta Manipulation Footprint | `delta-manipulation-footprint` | Volume | price | destrobr0685 | batch 39 |
| 295 | Delta Volume RSI | `delta-volume-rsi` | Volume | own | destrobr0685 | batch 24 |
| 296 | Delta-RSI Oscillator | `delta-rsi-oscillator` | Momentum | own | tbiktag (simplified) |  |
| 297 | DEMA Flow | `dema-flow` | Trend | price | AlphaExtract | batch 7 |
| 298 | Demand Index (James Sibbet) | `demand-index` | Volume | own | conair | batch 37 |
| 299 | Deviation Symmetry Breaker ~ C H I P A | `deviation-symmetry-breaker-c-h-i-p-a` | Channels & Bands | own | C_H_I_P_A | batch 18 |
| 300 | Deviation Trend Profile | `deviation-trend-profile` | Trend | price | BigBeluga | most liked |
| 301 | Dip & Rip Patterns - The Quant Science | `dip-rip-patterns-the-quant-science` | Volatility | price | thequantscience | batch 39 |
| 302 | Dip Buy/Sell Signals (Vix Fix + MA Deviation + TRMAD) | `dip-buy-sell-signals` | Volatility | price | DotGain | batch 42 |
| 303 | Directional Indicator Crossovers v1 | `directional-indicator-crossovers-v1` | Trend | own | JopAlgo | batch 7 |
| 304 | Directional Logistic Oscillator | `directional-logistic-oscillator` | Oscillators | own | GainzAlgo | batch 2 |
| 305 | Directional Movement Index + ADX & Key Levels | `dmi-adx-levels` | Trend | own |  |  |
| 306 | Disparity Index | `disparity-index` | Oscillators | own | HPotter | batch 10 |
| 307 | Divergence for many indicator v3 | `divergence-for-many-indicator-v3` | Momentum | price | LonesomeTheBlue | most liked |
| 308 | Divergence for Many Indicators v4 | `divergence-for-many-indicators-v4` | Momentum | price | LonesomeTheBlue | most liked |
| 309 | Divergence Indicator | `divergence-indicator` | Momentum | price |  |  |
| 310 | DMI Delta by 0xjcf | `dmi-delta-by-0xjcf` | Trend | own | J_O_S_E_ | batch 34 |
| 311 | DMI Histogram Indicator | `dmi-histogram-indicator` | Trend | own | Chart0bserver | batch 32 |
| 312 | DN MACD | `dn-macd` | Momentum | own | lihulu123 | batch 32 |
| 313 | Dominance Signal Apex | `dominance-signal-apex` | Trend | price | chervolino | batch 17 |
| 314 | DonAlt - Smart Money Toolkit | `donalt-smart-money-toolkit` | Trend | price | BigBeluga | most liked |
| 315 | Donchian Reversal Signals with Labels | `donchian-reversal-signals-with-labels` | Channels & Bands | price | Trader-Hitesh | batch 40 |
| 316 | Donchian Trend Ribbon | `donchian-trend-ribbon` | Trend | own | LonesomeTheBlue |  |
| 317 | Dope DPO | `dope-dpo` | Oscillators | own | Sherlock_MacGyver | batch 14 |
| 318 | Double Median ATR Bands \| MisinkoMaster | `double-median-atr-bands-misinkomaster` | Channels & Bands | price | MisinkoMaster | batch 28 |
| 319 | Double Median SD Bands \| MisinkoMaster | `double-median-sd-bands-misinkomaster` | Channels & Bands | price | MisinkoMaster | batch 30 |
| 320 | Double RSI | `double-rsi` | Momentum | own | Clokivez | batch 9 |
| 321 | Double Zig Zag with HHLL | `double-zig-zag-with-hhll` | Trend | price | LonesomeTheBlue | most liked |
| 322 | DR/IDR V1 | `dr-idr-v1` | Volatility | price | TheMas7er | most liked |
| 323 | DTFX Algo Zones | `dtfx-algo-zones` | Trend | price | LuxAlgo | most liked |
| 324 | Dual Bayesian For Loop | `dual-bayesian-for-loop` | Momentum | own | QuantAlgo | batch 5 |
| 325 | Dual EMA Trend Ribbon (Multi-Timeframe Trend Confirmation) | `dual-ema-trend-ribbon` | Moving Averages | price | Aleksin_Aleksandar | batch 3 |
| 326 | Dual MA SD Oscillator | `dual-ma-sd-oscillator` | Oscillators | own | SchizoQuant | batch 9 |
| 327 | Dual RSI Smoother | `dual-rsi-smoother` | Oscillators | own | TheUltimator5 | batch 8 |
| 328 | Dynamic Flow Ribbons | `dynamic-flow-ribbons` | Trend | price | BigBeluga | batch 2 |
| 329 | Dynamic Fractal Flow | `dynamic-fractal-flow` | Oscillators | own | AlphaExtract | batch 21 |
| 330 | Dynamic Liquidity HeatMap Profile | `dynamic-liquidity-heatmap-profile` | Volume | price | BigBeluga | most liked |
| 331 | Dynamic Score PSAR | `dynamic-score-psar` | Trend | own | QuantAlgo | batch 8 |
| 332 | Dynamic Stop Loss & Take Profit | `dynamic-stop-loss-take-profit` | Volatility | price | criptoblast2 | batch 23 |
| 333 | Dynamic Structure Indicator | `dynamic-structure-indicator` | Trend | price |  |  |
| 334 | Dynamic Support & Resistance | `dynamic-support-resistance` | Moving Averages | price | ZenAndTheArtOfTrading | batch 1 |
| 335 | Dynamic Swing Anchored VWAP | `dynamic-swing-anchored-vwap` | Volume | price | Zeiierman | most liked |
| 336 | Dynamic Testing | `dynamic-testing` | Oscillators | price | ProfitNomad | batch 9 |
| 337 | Dynamic Trailing | `dynamic-trailing` | Trend | price | Zeiierman | batch 5 |
| 338 | Dynamic Trend Bands | `dynamic-trend-bands` | Channels & Bands | price | ChartPrime | batch 2 |
| 339 | Dynamic Trend Channel (DTC) | `dynamic-trend-channel` | Channels & Bands | price | JohnsonForexTrader | batch 27 |
| 340 | Dynamic Volatility Filter | `dynamic-volatility-filter` | Trend | price | QuantAlgo | batch 4 |
| 341 | Dynamic Volume Clusters with Retest Signals | `dynamic-volume-clusters` | Channels & Bands | price | Zeiierman | batch 2 |
| 342 | Dynamic Volume Profile Oscillator | `dynamic-volume-profile-oscillator` | Volume | own | AlphaNatt | batch 1 |
| 343 | Dynamic VWAP: Fair Value & Divergence Suite | `dynamic-vwap-fair-value-divergence-suite` | Channels & Bands | price | RWCS_LTD | batch 30 |
| 344 | E9 Bollinger Range | `e9-bollinger-range` | Channels & Bands | price | E9XBT | batch 34 |
| 345 | Eagles Compass | `eagles-compass` | Candlestick Patterns | price | zenmarkets | batch 40 |
| 346 | Early MACD Reversal Indicator | `early-macd-reversal-indicator` | Momentum | own | StockSignaler | batch 10 |
| 347 | Early Pivot Alert (price-quantum reversal) • v1a (arrows only) | `early-pivot-alert-v1a` | Trend | price | dirkbiebaut | batch 35 |
| 348 | Easy Entry/Exit Trend Colors | `easy-trend-colors` | Trend | own |  |  |
| 349 | Edward Smart Channel Reversal | `edward-smart-channel-reversal` | Channels & Bands | price | Jos-ProTrader | batch 13 |
| 350 | Effective FVG Indicator - Imran | `effective-fvg-indicator-imran` | Volume | price | imrancrypto | batch 40 |
| 351 | Effective Volume Z-Score | `effective-volume-z-score` | Volume | own | eugencovaci | batch 35 |
| 352 | Efficiency Ratio Trend | `efficiency-ratio-trend` | Trend | price | achirameegasthanne | batch 9 |
| 353 | Ehlers Adaptive RSI | `ehlers-adaptive-rsi` | Oscillators | own | Julien_Exe | batch 14 |
| 354 | Ehlers Adaptive Trend Indicator | `ehlers-adaptive-trend-indicator` | Trend | price | AlphaExtract | batch 18 |
| 355 | Ehlers Instantaneous Trend | `ehlers-instantaneous-trend` | Trend | price |  |  |
| 356 | Ehlers Maclaurin Ultimate Smoother | `ehlers-maclaurin-ultimate-smoother` | Moving Averages | own | Mupsje | batch 33 |
| 357 | Ehlers MESA Adaptive Moving Average | `ehlers-mesa-ma` | Moving Averages | price | Ehlers |  |
| 358 | Ehlers Regime Dynamic Candles | `ehlers-regime-dynamic-candles` | Candlestick Patterns | price | sizzlinsoft | batch 39 |
| 359 | Ehlers Reverse EMA | `ehlers-reverse-ema` | Oscillators | own | AlgoCollective | batch 36 |
| 360 | Ehlers Stochastic CG Oscillator | `ehlers-stochastic-cg` | Oscillators | own |  |  |
| 361 | Elite Oscillator Pro | `elite-oscillator-pro` | Oscillators | own | Alpha_Wizard | batch 34 |
| 362 | Elliott Wave | `elliott-wave` | Trend | price | LuxAlgo | most liked |
| 363 | Elliott Wave Oscillator | `elliott-wave-oscillator` | Oscillators | own | Koryu |  |
| 364 | Elliott Wave Oscillator Signals by DGT | `elliott-wave-oscillator-signals-by-dgt` | Oscillators | price | dgtrd | most liked |
| 365 | Elliptic Curve SAR | `elliptic-curve-sar` | Trend | price | TEDCORP2 | batch 26 |
| 366 | EMA & MA Crossover | `ema-ma-crossover` | Moving Averages | price |  |  |
| 367 | EMA & MACD Strategy with SL/TP | `ema-macd-strategy-with-sl-tp` | Trend | price | mamachi- | batch 28 |
| 368 | EMA + RSI Autotrade Webhook - Varun | `ema-rsi-autotrade-webhook-varun` | Moving Averages | price | varuns_back | batch 17 |
| 369 | EMA + SuperTrend | `ema-supertrend` | Moving Averages | price | All_in_Traders |  |
| 370 | EMA + VWMA + ATR Smoothed BuySell (merged) - TOM ZENG 202509 | `ema-vwma-atr-smoothed-buysell-tom-zeng-202509` | Trend | price | zengtom | batch 18 |
| 371 | EMA 20/50/100/200 | `ema-multi` | Moving Averages | price |  |  |
| 372 | EMA 9 / 26 Cross | `ema-9-26-cross` | Moving Averages | price | h0s1m001 | batch 27 |
| 373 | EMA Cloud Trend | `ema-cloud-trend` | Moving Averages | price | ZkalishTR | batch 9 |
| 374 | EMA Cross Signals | `ema-cross-signals` | Moving Averages | price | Jos-ProTrader | batch 29 |
| 375 | EMA Enveloper | `ema-enveloper` | Moving Averages | price |  |  |
| 376 | EMA Oscillator | `ema-oscillator` | Oscillators | own | AlphaExtract | batch 16 |
| 377 | EMA Ribbon | `ema-ribbon` | Moving Averages | price |  |  |
| 378 | EMA Wave Indicator | `ema-wave` | Moving Averages | own |  |  |
| 379 | EMA/RMA clouds by Alpachino | `ema-rma-clouds-by-alpachino` | Moving Averages | price | Alpachino97 | batch 28 |
| 380 | EMA21 Pullback Buy | `ema21-pullback-buy` | Moving Averages | price | Kennedy08 | batch 23 |
| 381 | Emergent Rays - NovaTheMachine | `emergent-rays-novathemachine` | Moving Averages | price | NovaTheMachine | batch 32 |
| 382 | Engulfing + Sweep (Confirmed Only) v6 - bars only | `engulfing-sweep-v6-bars-only` | Candlestick Patterns | price | fanta-grapefruit | batch 38 |
| 383 | Engulfing Candle Indicator | `engulfing-candle-indicator` | Candlestick Patterns | price | The_Forex_Steward | batch 41 |
| 384 | Engulfing Sweeps - Milana Trades | `engulfing-sweeps-milana-trades` | Candlestick Patterns | price | MilanaArsenovna | batch 38 |
| 385 | Enhanced KLSE Banker Flow Oscillator | `enhanced-klse-banker-flow-oscillator` | Oscillators | own | Dr_Leong_Yee_Rock | batch 15 |
| 386 | Enhanced VFI Buyer/Seller Pressure | `enhanced-vfi-buyer-seller-pressure` | Volume | own | ask2maniish | batch 28 |
| 387 | Enhanced VSA Volume & Candle Colors with MA Selection | `enhanced-vsa-volume-candle-colors-with-ma-selection` | Volume | own | ViZiV | batch 27 |
| 388 | Entropy Bands | `entropy-bands` | Channels & Bands | price | TechnoBlooms | batch 20 |
| 389 | Entry / TP / SL Alert Bands (Simple & Stable) | `entry-tp-sl-alert-bands` | Channels & Bands | price | drlicht1 | batch 34 |
| 390 | Entry Points | `entry-points` | Oscillators | price |  |  |
| 391 | Entry Signals (Long/Short) | `entry-signals-long-short` | Trend | price | tradegear9 | batch 1 |
| 392 | Envelope RSI | `envelope-rsi` | Oscillators | price | Saleh_Toodarvari |  |
| 393 | Equalhigh JAPANESE TRIPLE RCI | `equalhigh-japanese-triple-rci` | Oscillators | own | Stevesyl | batch 22 |
| 394 | ERD: Effort-Result Diagnostic | `erd-effort-result-diagnostic` | Channels & Bands | price | DarwinDarma | batch 32 |
| 395 | EREMA Signals | `erema-signals` | Trend | price | AlgoCollective | batch 39 |
| 396 | Euclidean Range | `euclidean-range` | Volatility | own | InvestorUnknown | batch 21 |
| 397 | EURUSD Swing High/Low Projection | `eurusd-swing-high-low-projection` | Channels & Bands | price | tiprolin | batch 37 |
| 398 | Evil MACD Trading System (Pine Script v6) | `evil-macd-trading-system` | Momentum | price | daves723 | batch 37 |
| 399 | EVWMA Envelope | `evwma-envelope` | Oscillators | price |  |  |
| 400 | Exhaustion Zone | `exhaustion-zone` | Channels & Bands | price | rukich | batch 6 |
| 401 | Fair Value Gap | `fair-value-gap-luxalgo` | Trend | price | LuxAlgo | most liked |
| 402 | Faith Indicator | `faith-indicator` | Trend | own |  |  |
| 403 | False Breakout (Expo) | `false-breakout` | Channels & Bands | price | Zeiierman |  |
| 404 | Faraz Perfect Structure Scalper + Long Short (Indicator Alerts) | `faraz-perfect-structure-scalper-long-short` | Trend | price | fsaleem03 | batch 29 |
| 405 | Fast Length | `bjorgum-triple-ema` | Moving Averages | price |  |  |
| 406 | Fast WMA | `fast-wma` | Moving Averages | own | Clokivez | batch 25 |
| 407 | Fastlane | `fastlane` | Volume | price | HB5 | batch 40 |
| 408 | Fibo Levels with Volume Profile and Targets | `fibo-levels-with-volume-profile-and-targets` | Volume | price | ChartPrime | most liked |
| 409 | Fibonacci Auto Trend Scouter | `fibonacci-auto-trend-scouter` | Trend | price | sirkriz | most liked |
| 410 | Fibonacci Bollinger Bands | `fibonacci-bollinger-bands` | Channels & Bands | price | Rashad |  |
| 411 | Fibonacci Confluence Toolkit | `fibonacci-confluence-toolkit` | Trend | price | LuxAlgo | most liked |
| 412 | Fibonacci Extension / Retracement / Pivot Points by DGT | `fibonacci-extension-retracement-pivot-points` | Trend | price | dgtrd | most liked |
| 413 | Fibonacci HH LL TRAMA Band | `fibonacci-hh-ll-trama-band` | Channels & Bands | price | FibonacciFlux | batch 16 |
| 414 | Fibonacci Levels | `fibonacci-levels` | Channels & Bands | price |  |  |
| 415 | Fibonacci Moving Averages | `fibonacci-moving-averages` | Moving Averages | price | UkutaLabs | batch 28 |
| 416 | Fibonacci Projection with Volume & Delta Profile | `fibonacci-projection-with-volume-delta-profile` | Volume | price | Zeiierman | most liked |
| 417 | Fibonacci Ranges (Real-Time) | `fibonacci-ranges` | Channels & Bands | price | LuxAlgo | most liked |
| 418 | Fibonacci Structure Engine | `fibonacci-structure-engine` | Trend | price | WillyAlgoTrader | most liked |
| 419 | Fibonacci Trend | `fibonacci-trend` | Trend | price | ChartPrime | most liked |
| 420 | Fibonacci Weighted Moving Average | `fibonacci-weighted-moving-average` | Moving Averages | price | everget | batch 12 |
| 421 | Fibonacci Zone | `fibonacci-zone` | Channels & Bands | price |  |  |
| 422 | FibSync - DynamicFibSupport | `fibsync-dynamicfibsupport` | Channels & Bands | price | mr_uponly | batch 34 |
| 423 | Filter Ribbon | `filter-ribbon` | Trend | price | c9indicator | batch 4 |
| 424 | Filter Wave | `filter-wave` | Trend | price | c9indicator | batch 15 |
| 425 | Fisher MPz | `fisher-mpz` | Oscillators | own | B3AR_Trades | batch 30 |
| 426 | Fisher Volume Transform \| AlphaNatt | `fisher-volume-transform-alphanatt` | Oscillators | own | AlphaNatt | batch 16 |
| 427 | Fixed-Range Volume-Profile Zones | `fixed-range-volume-profile-zones` | Volume | own | RWCS_LTD | batch 13 |
| 428 | Flow Control Oscillator (FCO) | `flow-control-oscillator` | Volume | own | WalrusQuant | batch 19 |
| 429 | FlowShift Oscillator | `flowshift-oscillator` | Oscillators | own | BOSWaves | batch 24 |
| 430 | FluidTrades - SMC Lite | `fluidtrades-smc-lite` | Trend | price | Pmgjiv | most liked |
| 431 | Follow Line | `follow-line` | Trend | price | Dreadblitz |  |
| 432 | For-Loop Vote Trailing Stop \| MiesOnCharts | `for-loop-vote-trailing-stop-miesoncharts` | Trend | price | MiesOnCharts | batch 31 |
| 433 | Force Pulse | `force-pulse` | Oscillators | own | Uncle_the_shooter | batch 17 |
| 434 | Forecast Oscillator | `forecast-oscillator` | Oscillators | own | KivancOzbilgic |  |
| 435 | Forex Sessions | `forex-sessions` | Oscillators | own |  |  |
| 436 | Fourier series Model Of The Market | `fourier-series-model-of-the-market` | Oscillators | own | e2e4 | batch 12 |
| 437 | Fractal Exhaustion Band | `fractal-exhaustion-band` | Trend | price | QuantAlgo | batch 2 |
| 438 | Fractal Strength Oscillator | `fractal-strength-oscillator` | Oscillators | own | SurgeQuant | batch 20 |
| 439 | Fractals Trend | `fractals-trend` | Trend | price | BigBeluga | batch 2 |
| 440 | Fractals V9 | `fractals-v9` | Trend | price | RicardoSantos | most liked |
| 441 | Fractional EMA Kalman Filter | `fractional-ema-kalman-filter` | Moving Averages | price | et20tradeview | batch 4 |
| 442 | FSVZO | `fsvzo` | Volume | own | AlphaExtract | batch 5 |
| 443 | Full Candle Higher/Lower (No Repeats) | `full-candle-higher-lower` | Candlestick Patterns | price | devtiqo | batch 41 |
| 444 | Function Savitzky Golay Filter with 7 Vectors V0 | `function-savitzky-golay-filter-with-7-vectors-v0` | Moving Averages | price | RicardoSantos | batch 33 |
| 445 | FuTech V-Spike & V-Highlighter | `futech-v-spike-v-highlighter` | Volume | price | Atmiya_aatubhai | batch 39 |
| 446 | FVG & IFVG ICT Inversion Fair Value Gap Signal | `fvg-ifvg-ict-inversion-fair-value-gap-signal` | Trend | price | TradingFinder | most liked |
| 447 | FVG Breakout/Breakdown | `fvg-breakout-breakdown` | Trend | price | ICT_Concept_Trading | batch 33 |
| 448 | FVG Candle Highlighter | `fvg-candle-highlighter` | Volatility | price | SmellyTaz | batch 40 |
| 449 | FVG Instantaneous Mitigation Signals | `fvg-instantaneous-mitigation-signals` | Trend | price | LuxAlgo | most liked |
| 450 | FVG Order Blocks | `fvg-order-blocks` | Trend | price | BigBeluga | most liked |
| 451 | FVG Positioning Average | `fvg-positioning-average` | Trend | price | LuxAlgo |  |
| 452 | FVG Sessions | `fvg-sessions` | Trend | price | LuxAlgo | most liked |
| 453 | FX Market Sessions | `fx-market-sessions` | Trend | price | boitoki | most liked |
| 454 | FX Sniper T3-CCI | `fx-sniper-t3-cci` | Oscillators | own |  |  |
| 455 | FXN - Asian Session Range | `fxn-asian-session-range` | Volatility | price | RobMinty | most liked |
| 456 | FXN - Week and Day Separator | `fxn-week-and-day-separator` | Trend | price | RobMinty | most liked |
| 457 | FxShare - CC Reversal | `fxshare-cc-reversal` | Trend | price | FxShareRobots | batch 22 |
| 458 | G-Score \| NAL | `g-score-nal` | Oscillators | own | NordicAlphaLab | batch 13 |
| 459 | Gabriel's Andean Oscillator | `gabriel-s-andean-oscillator` | Trend | own | GabrielAmadeusLau | batch 23 |
| 460 | Gamma + Fibonacci EMA Bands | `gamma-fibonacci-ema-bands` | Moving Averages | price | ky_yule1010 | batch 23 |
| 461 | Gamma Hedging Pressure (Normalized -100 to +100) | `gamma-hedging-pressure` | Momentum | own | uzair2join | batch 20 |
| 462 | Gann High Low | `gann-high-low` | Trend | price | KivancOzbilgic |  |
| 463 | GANN Level (Salil Sir) | `gann-level` | Channels & Bands | price | prabhat76 | batch 12 |
| 464 | Gaussian Acceleration Array | `gaussian-acceleration-array` | Momentum | own | NantzOS | batch 36 |
| 465 | Gaussian Filter Trend | `gaussian-filter-trend` | Trend | price | QuantAlgo | batch 2 |
| 466 | Gaussian Ribbon | `gaussian-ribbon` | Moving Averages | price | NantzOS | batch 13 |
| 467 | Gaussian RSI \| NAL | `gaussian-rsi-nal` | Momentum | own | NordicAlphaLab | batch 7 |
| 468 | GBR Micro Kernel Trend | `gbr-micro-kernel-trend` | Moving Averages | price | THEGBR | batch 36 |
| 469 | Gho$t EMA Cloud | `gho-t-ema-cloud` | Moving Averages | price | Ghostmlt | batch 29 |
| 470 | Ghost Tangent Crossings | `ghost-tangent-crossings` | Trend | price | ChartPrime | most liked |
| 471 | Gideons Gold - ADX Watchman | `gideons-gold-adx-watchman` | Trend | own | gideonsgold | batch 34 |
| 472 | GMMA Oscillator | `gmma-oscillator` | Trend | own |  |  |
| 473 | Gold Trend Signal Indicator | `gold-trend-signal-indicator` | Trend | price | CsmillrSirrry | batch 33 |
| 474 | Golden & Death Cross with Re-Activation | `golden-death-cross-with-re-activation` | Moving Averages | price | oberlunar_tr | batch 26 |
| 475 | Golden Ratio Trend Persistence | `golden-ratio-trend-persistence` | Trend | price | YetAnotherTA | batch 9 |
| 476 | Golden/Death Cross Highlighter | `golden-death-cross-highlighter` | Moving Averages | price | dripvesting | batch 36 |
| 477 | Gorgo's Hybrid Oscillator STrategy | `gorgo-s-hybrid-oscillator-strategy` | Oscillators | own | Gorgomannaro | batch 32 |
| 478 | Gradient Trend Filter | `gradient-trend-filter` | Trend | price | ChartPrime | batch 1 |
| 479 | Granville Entry Guide | `granville-entry-guide` | Moving Averages | price | fightpm | batch 17 |
| 480 | Gravity Well Trend \| Lyro RS | `gravity-well-trend-lyro-rs` | Trend | price | LyroRS | batch 10 |
| 481 | Gridbot Ping Pong | `gridbot-ping-pong` | Channels & Bands | price | xxattaxx | batch 18 |
| 482 | Guppy MMA | `guppy-mma` | Moving Averages | own | AlphaExtract | batch 15 |
| 483 | Guppy Multiple Moving Average | `gmma` | Moving Averages | price | Daryl Guppy |  |
| 484 | Guppy Oscillator-REvans993 | `guppy-oscillator-revans993` | Oscillators | own | REvans993 | batch 36 |
| 485 | Guppy Wave | `guppy-wave` | Moving Averages | price | UkutaLabs | batch 25 |
| 486 | GWAP (Gamma Weighted Average Price) | `gwap` | Moving Averages | price | EdgeTools | batch 18 |
| 487 | H-Infinity Volatility Filter | `h-infinity-volatility-filter` | Trend | price | QuantAlgo | batch 7 |
| 488 | HalfTrend | `half-trend` | Trend | price | everget |  |
| 489 | HaP MACD | `hap-macd` | Momentum | own | agahakanaga | batch 1 |
| 490 | Harmonic Pattern Detection | `harmonic-pattern-detection` | Trend | price | LuxAlgo | most liked |
| 491 | Harmonic Pattern Detection, Prediction, and Backtesting Tool | `harmonic-pattern-detection-prediction-and` | Trend | price | reees | most liked |
| 492 | Harmonic Periodicity Matrix | `harmonic-periodicity-matrix` | Oscillators | own | Pineify | batch 29 |
| 493 | Harmonic Sniper Trigger - PyraTime | `harmonic-sniper-trigger-pyratime` | Oscillators | own | PyraTime | batch 27 |
| 494 | HARSI+CBC | `harsi-cbc` | Oscillators | own | mehmetbezgincan | batch 34 |
| 495 | HawkEye Volume | `hawkeye-volume` | Volume | own |  |  |
| 496 | Heatmap Volume | `heatmap-volume` | Volume | own | xdecow |  |
| 497 | Heiken Ashi Ribbon | `heiken-ashi-ribbon` | Trend | price | UkutaLabs | batch 21 |
| 498 | Heikin Ashi Colored Regular OHLC Candles | `heikin-ashi-colored-regular-ohlc-candles` | Candlestick Patterns | price | LuxmiAI | batch 40 |
| 499 | Heikin Ashi Doji with High Volume | `heikin-ashi-doji-with-high-volume` | Candlestick Patterns | price | nwfjf6m8 | batch 42 |
| 500 | Heikin Ashi RSI Oscillator | `heikin-ashi-rsi-oscillator` | Momentum | own | JayRogers |  |
| 501 | Heikin Line - TB365 | `heikin-line-tb365` | Moving Averages | price | tradebot_365 | batch 32 |
| 502 | Heikin-Ashi Reversals with Region & Dots | `heikin-ashi-reversals-with-region-dots` | Candlestick Patterns | price | theRhinoSlayer | batch 42 |
| 503 | HEMA Trend Levels | `hema-trend-levels` | Trend | price | AlgoAlpha |  |
| 504 | Henderson Weighted Moving Average | `henderson-weighted-moving-average` | Moving Averages | price | everget | batch 30 |
| 505 | High For Loop \| MisinkoMaster | `high-for-loop-misinkomaster` | Trend | own | MisinkoMaster | batch 37 |
| 506 | High Volume Arrow Signals (Ajustável) | `high-volume-arrow-signals` | Volume | price | IdeManson | batch 24 |
| 507 | High Volume Buyers/Sellers+ | `high-volume-buyers-sellers` | Volume | price | avitawill | batch 40 |
| 508 | High-Low of X Bar | `high-low-of-x-bar` | Volatility | own | sam-austin | batch 29 |
| 509 | Higher High Lower Low Strategy (With Source Code) | `higher-high-lower-low-strategy` | Trend | price | LonesomeTheBlue | most liked |
| 510 | Higher order Orderblocks + Breakerblocks + Range + Alerts | `higher-order-orderblocks-breakerblocks-range` | Trend | price |  | most liked |
| 511 | Hilega-Milega-RSI-EMA-WMA indicator designed by NK | `hilega-milega-rsi-ema-wma-indicator-designed-by-nk` | Oscillators | own | kshirsagar_n | batch 14 |
| 512 | Historical Liquidity Proximity Heatmap | `liquidity-proximity-heatmap` | Volume | price | LuxAlgo | batch 3 |
| 513 | HMA Breakdown | `hma-breakdown` | Moving Averages | price | NonLinearRookie | batch 11 |
| 514 | HOTT LOTT | `hott-lott` | Trend | price | KivancOzbilgic |  |
| 515 | Hourly Trading System | `hourly-trading-system` | Trend | price | Zeiierman | most liked |
| 516 | HPDR Bands Indicator | `hpdr-bands-indicator` | Channels & Bands | price | afonso_77 | batch 23 |
| 517 | HTC peppermint_07 CCI w signal + s&r RSI | `htc-peppermint-07-cci-w-signal-s-r-rsi` | Oscillators | own | peppermint07 | batch 14 |
| 518 | HTF Candles & Mini Charts by DGT | `htf-candles-mini-charts-by-dgt` | Trend | price | dgtrd | most liked |
| 519 | HTH - WD Gann Square Root Levels | `hth-wd-gann-square-root-levels` | Channels & Bands | price | tamillselvan | batch 27 |
| 520 | Hull Butterfly Oscillator | `hull-butterfly-oscillator` | Momentum | own |  |  |
| 521 | Hull Suite | `hull-suite` | Trend | price |  |  |
| 522 | Hunters Reversal v2.3 | `hunters-reversal-v2-3` | Trend | price | d_jaeger | batch 33 |
| 523 | Hurst-Based Trend Persistence w/Poisson Prediction | `hurst-based-trend-persistence-w-poisson-prediction` | Oscillators | own | garysebastianbrowniii | batch 28 |
| 524 | HyperTrend [LuxAlgo] | `hyper-trend` | Trend | price | LuxAlgo |  |
| 525 | Ichimoku | `ichimoku-hpotter` | Trend | price |  | most liked |
| 526 | Ichimoku ACE Club | `ichimoku-ace-club` | Trend | price | binhmyco | batch 26 |
| 527 | Ichimoku EMA Bands | `ichimoku-ema-bands` | Channels & Bands | price |  |  |
| 528 | Ichimoku Kinko Hyo | `ichimoku-kinko-hyo` | Trend | price | insideandup | batch 32 |
| 529 | Ichimoku Score Indicator | `ichimoku-score-indicator` | Trend | own | tanayroy | batch 29 |
| 530 | Ichimoku Theories | `ichimoku-theories` | Trend | price | LuxAlgo | most liked |
| 531 | Ichimoku w/Heikin-Ashi | `ichimoku-w-heikin-ashi` | Trend | price | yasujiy | batch 25 |
| 532 | ICT & RTM Price Action Indicator | `ict-rtm-price-action-indicator` | Channels & Bands | price | behradmojtahedi | batch 21 |
| 533 | ICT Concept Order Block \| FVG \| Liquidity Sweeps | `ict-concept-order-block-fvg-liquidity-sweeps` | Trend | price | TradingFinder | most liked |
| 534 | ICT Concepts | `ict-concepts` | Trend | price | LuxAlgo | most liked |
| 535 | ICT FVG Buy/Sell Signals | `ict-fvg-buy-sell-signals` | Trend | price | svmstellarvisionmedia | batch 5 |
| 536 | ICT Immediate Rebalance Toolkit | `ict-immediate-rebalance-toolkit` | Trend | price | LuxAlgo | most liked |
| 537 | ICT Institutional Order Flow (fadi) | `ict-institutional-order-flow` | Trend | price | fadizeidan | most liked |
| 538 | ICT Killzones + Pivots | `ict-killzones-pivots-tfo` | Trend | price | tradeforopp | most liked |
| 539 | ICT Killzones Toolkit | `ict-killzones-toolkit` | Trend | price | LuxAlgo | most liked |
| 540 | ICT Liquidity Sweep/Swing Fail Pattern V.1 | `ict-liquidity-sweep-swing-fail-pattern-v-1` | Trend | price | wut_trader | most liked |
| 541 | ICT Macros | `ict-macros` | Trend | price | LuxAlgo | most liked |
| 542 | ICT Power Of Three \| Flux Charts | `ict-power-of-three-flux-charts` | Trend | price | fluxchart | most liked |
| 543 | ICT Silver Bullet | `ict-silver-bullet` | Trend | price | LuxAlgo | most liked |
| 544 | ICT Turtle Soup \| Flux Charts | `ict-turtle-soup-flux-charts` | Trend | price | fluxchart | most liked |
| 545 | ICT Unicorn Model | `ict-unicorn-model` | Trend | price | LuxAlgo | most liked |
| 546 | Ideal Entry Point | `ideal-entry-point` | Trend | price |  |  |
| 547 | IFT Stoch RSI CCI | `ift-stoch-rsi-cci` | Momentum | own | KivancOzbilgic |  |
| 548 | IIR One-Pole Price Filter | `iir-one-pole-price-filter` | Moving Averages | price | BackQuant | batch 9 |
| 549 | Imbalance Detector | `imbalance-detector` | Trend | price | LuxAlgo | most liked |
| 550 | Impulse MACD | `impulse-macd` | Momentum | own | LazyBear |  |
| 551 | Indicador Millo SMA20-SMA200-AO-RSI M1 | `indicador-millo-sma20-sma200-ao-rsi-m1` | Moving Averages | price | hernangarcia_78 | batch 19 |
| 552 | Indicator: ElliotWave Oscillator | `elliott-wave-oscillator-lazybear` | Oscillators | own | LazyBear | most liked |
| 553 | Indicator: OBV Oscillator | `obv-oscillator-lazybear` | Volume | own | LazyBear | most liked |
| 554 | Indicator: WaveTrend Oscillator | `wavetrend-oscillator-wt` | Oscillators | own | LazyBear | most liked |
| 555 | Indicator: Weis Wave Volume | `weis-wave-volume-lazybear` | Volume | own | LazyBear | most liked |
| 556 | Indicators: Volume-Weighted MACD Histogram & Sentiment Zone Osc | `indicators-volume-weighted-macd-histogram` | Momentum | own | LazyBear | most liked |
| 557 | Infinite EMA with Alpha Control | `infinite-ema-with-alpha-control` | Moving Averages | price | Sesilya | batch 13 |
| 558 | Initial Balance Breakout Signals | `initial-balance-breakout-signals` | Volatility | price | LuxAlgo | most liked |
| 559 | Inside / Outside Bars | `inside-outside-bars` | Candlestick Patterns | price | Iggy- | batch 42 |
| 560 | Inside Bar (Body-based) Ind/Alert | `inside-bar-ind-alert` | Candlestick Patterns | price | s_b_j | batch 40 |
| 561 | Inside Bar Coloring (Real-time + Historical) w/ Alerts | `inside-bar-coloring-w-alerts` | Candlestick Patterns | price | SpinTrades | batch 42 |
| 562 | Inside Bars (Multiple / Consecutive) | `inside-bars` | Channels & Bands | price | nilstrades_ | batch 5 |
| 563 | Instantaneous Trendline with Cloud | `instantaneous-trendline-with-cloud` | Trend | price | Sesilya | batch 22 |
| 564 | Institutional Composite Moving Average (ICMA) | `institutional-composite-moving-average` | Moving Averages | price | VolumeVigilante | batch 6 |
| 565 | Institutional MACD (Z-Score Edition) | `institutional-macd` | Momentum | own | VolumeVigilante | batch 4 |
| 566 | Institutional Volume RSI | `institutional-volume-rsi` | Momentum | own | abgthecoder | batch 6 |
| 567 | Interpolated Median Volatility LSMA \| Otto | `interpolated-median-volatility-lsma-otto` | Channels & Bands | price | oquant | batch 12 |
| 568 | Intraday BUY_SELL | `intraday-buy-sell` | Trend | price |  |  |
| 569 | Intraday TS BB | `intraday-ts-bb` | Oscillators | price |  |  |
| 570 | Intraday Volume Swings | `intraday-volume-swings` | Volume | price | rumpypumpydumpy |  |
| 571 | Intraday vs Overnight Change Tracker | `intraday-vs-overnight-change-tracker` | Momentum | own | TheUltimator5 | batch 12 |
| 572 | Intraday vs Overnight OBV | `intraday-vs-overnight-obv` | Volume | own | TheUltimator5 | batch 21 |
| 573 | Inverse Distance Weighted Moving Average | `inverse-distance-weighted-moving-average` | Moving Averages | price | everget | batch 15 |
| 574 | Inversion Fair Value Gaps (IFVG) | `inversion-fair-value-gaps` | Trend | price | LuxAlgo | most liked |
| 575 | IPO Date Screener | `ipo-date-screener` | Oscillators | own | starshiptrade | batch 14 |
| 576 | Is it Time for a Pullback? Check Bars Since MA Test | `is-it-time-for-a-pullback-check-bars-since-ma-test` | Trend | own | TradeStation | batch 25 |
| 577 | Isolated Peak and Bottom | `isolated-peak-bottom` | Oscillators | price |  |  |
| 578 | ITG Scalper | `itg-scalper` | Trend | price | Complector | most liked |
| 579 | IU Mean Reversion System | `iu-mean-reversion-system` | Channels & Bands | price | Shivam_Mandrai | batch 12 |
| 580 | IU Smart Flow System | `iu-smart-flow-system` | Trend | price | Shivam_Mandrai | batch 7 |
| 581 | IV Rank (tasty-style) - VIXFix / HV Proxy | `iv-rank-vixfix-hv-proxy` | Volatility | own | steveoptionstrade2025 | batch 30 |
| 582 | John Wick Doji indicator | `john-wick-doji-indicator` | Candlestick Patterns | price | Nossgrr | batch 42 |
| 583 | JOPA Channel (Dual-Volumed) v1 | `jopa-channel-v1` | Channels & Bands | price | JopAlgo | batch 30 |
| 584 | Jurik Moving Average | `jurik-moving-average` | Moving Averages | price | everget | batch 1 |
| 585 | Kalman Ema Crosses | `kalman-ema-crosses` | Moving Averages | price | JTCapitalNL | batch 16 |
| 586 | Kalman Exponentialy Weighted Moving Average \| MisinkoMaster | `kalman-exponentialy-weighted-moving-average-misinkomaster` | Moving Averages | price | MisinkoMaster | batch 25 |
| 587 | Kalman Filter Trend Breakers | `kalman-filter-trend-breakers` | Trend | price | kypexin | batch 29 |
| 588 | Kalman Flow \| Lyro RS | `kalman-flow-lyro-rs` | Trend | price | LyroRS | batch 5 |
| 589 | Kalman Hull Bands For Loop \| RakoQuant | `kalman-hull-bands-for-loop-rakoquant` | Channels & Bands | price | RakoQuant | batch 17 |
| 590 | Kalman Hull Kijun | `kalman-hull-kijun` | Trend | price | BackQuant | batch 12 |
| 591 | Kalman VWAP Filter | `kalman-vwap-filter` | Moving Averages | price | BackQuant | batch 4 |
| 592 | Kaufman Adaptive Moving Average | `kaufman-adaptive-ma` | Moving Averages | price | everget |  |
| 593 | Kaufman Trend Strength Signal | `kaufman-trend-strength-signal` | Trend | price | PakunFX | batch 34 |
| 594 | KD-NewAutoTrade for Future Trading - Heikin Ashi candles | `kd-newautotrade-for-future-trading-heikin-ashi-candles` | Trend | price | krish16887 | batch 22 |
| 595 | KDJ | `kdj` | Oscillators | own | KingThies |  |
| 596 | Keltner-Aroon-EFI Flow | `keltner-aroon-efi-flow` | Trend | price | D_QUANT | batch 20 |
| 597 | Kernel Channel | `kernel-channel` | Channels & Bands | price | BackQuant | batch 6 |
| 598 | KERPD Noise Filter - Kaufman Efficiency Ratio and Price Density | `kerpd-noise-filter-kaufman-efficiency-ratio-and-price-density` | Volatility | own | SensitiveSuit | batch 15 |
| 599 | Key Levels SpacemanBTC IDWM | `key-levels-spacemanbtc-idwm` | Trend | price | spacemanbtc | most liked |
| 600 | Key_TDI | `key-tdi` | Oscillators | own | Fibonacci_Code | batch 31 |
| 601 | Keyzone | `keyzone` | Channels & Bands | price | Uttaya | batch 28 |
| 602 | Kijun-Sen with Buy / Sell Labels & Alerts - Ichimoku simplified | `kijun-sen-with-buy-sell-labels-alerts-ichimoku-simplified` | Trend | price | TaureaYinYang | batch 36 |
| 603 | Kinetic Slippage Index (KSI) | `kinetic-slippage-index` | Volume | own | HPotter | batch 7 |
| 604 | Kiss Of Death | `kiss-of-death` | Trend | price | thanos300693 | batch 37 |
| 605 | L1 Moving Average Fingerprint for Long Entry | `l1-moving-average-fingerprint-for-long-entry` | Trend | price | blackcat1402 | batch 40 |
| 606 | L2 Risk Assessment for Trend Strength | `l2-risk-assessment-for-trend-strength` | Trend | own | blackcat1402 | batch 14 |
| 607 | Ladder StDev | `ladder-stdev` | Volatility | own | jason5480 | batch 30 |
| 608 | Laguerre Filter | `laguerre-filter` | Moving Averages | price | BackQuant | batch 5 |
| 609 | Laguerre RSI | `laguerre-rsi` | Momentum | own | TheLark |  |
| 610 | Laguerre Ultimate Explorations Multicator | `laguerre-ultimate-explorations-multicator` | Moving Averages | own | ImmortalFreedom | batch 20 |
| 611 | Laguerre-Kalman Adaptive Filter \| AlphaNatt | `laguerre-kalman-adaptive-filter-alphanatt` | Moving Averages | price | AlphaNatt | batch 11 |
| 612 | Left Bars | `pivot-hh-hl-lh-ll` | Trend | price |  |  |
| 613 | Leledc Levels | `leledc-levels` | Candlestick Patterns | price |  |  |
| 614 | Length | `gaussian-channel` | Channels & Bands | price |  |  |
| 615 | Length | `redk-vader` | Oscillators | own | RedKTrader |  |
| 616 | Length | `zlma-trend-levels` | Moving Averages | price |  |  |
| 617 | Level2 Signalfilter Liquidity Protection | `level2-signalfilter-liquidity-protection` | Trend | own | djmad | batch 16 |
| 618 | Leveraged Liquidation Zones | `leveraged-liquidation-zones` | Channels & Bands | price | Fussion_Trader | batch 35 |
| 619 | LGMM (flat buffers) - multivariate poly + latent states | `lgmm-multivariate-poly-latent-states` | Channels & Bands | price | vsov | batch 28 |
| 620 | Linear Predictive Filters (TASC 2025.01) | `linear-predictive-filters` | Oscillators | own | PineCodersTASC | batch 2 |
| 621 | Linear Regression Blend Candles | `linear-regression-blend-candles` | Candlestick Patterns | price | B3AR_Trades | batch 39 |
| 622 | Linear Regression Candles | `linear-regression-candles` | Candlestick Patterns | price |  |  |
| 623 | Linear Regression Channel | `linear-regression-channel` | Channels & Bands | price |  |  |
| 624 | Linear Regression Channel / Curve / Slope by DGT | `linear-regression-channel-curve-slope-by-dgt` | Channels & Bands | price | dgtrd | most liked |
| 625 | Linear Regression Oscillator | `linear-regression-oscillator` | Oscillators | own | ChartPrime | most liked |
| 626 | Linear Regression Volume \| Lyro RS | `linear-regression-volume-lyro-rs` | Channels & Bands | price | LyroRS | batch 10 |
| 627 | Linear Volume MACD \| Lyro RS | `linear-volume-macd-lyro-rs` | Momentum | own | LyroRS | batch 9 |
| 628 | LineReg Candles with Hma filter | `linereg-candles-with-hma-filter` | Trend | price | MaximusGains | batch 14 |
| 629 | Liquidation Reversal Signals | `liquidation-reversal-signals` | Volume | price | AlgoAlpha | most liked |
| 630 | Liquidity Delta Profiler | `liquidity-delta-profiler` | Volume | price | LuxAlgo | most liked |
| 631 | Liquidity Flow Zones (LFZ) | `liquidity-flow-zones` | Trend | price | ReubenMiles | batch 20 |
| 632 | Liquidity Grabs | `liquidity-grabs` | Trend | price | fluxchart |  |
| 633 | Liquidity Heatmap | `liquidity-heatmap` | Volume | price | Nephew_Sam_ | most liked |
| 634 | Liquidity Indicator | `liquidity-indicator` | Channels & Bands | price | The_Forex_Steward | batch 22 |
| 635 | Liquidity Levels [LuxAlgo] | `liquidity-levels` | Trend | price | LuxAlgo |  |
| 636 | Liquidity Levels MTF - Sonarlab | `liquidity-levels-mtf-sonarlab` | Trend | price | vuetratrading | most liked |
| 637 | Liquidity Pools | `liquidity-pools` | Trend | price | LuxAlgo | most liked |
| 638 | Liquidity Pools Pro | `liquidity-pools-pro` | Trend | price | WillyAlgoTrader | most liked |
| 639 | Liquidity Sentiment Profile \| LUPEN | `liquidity-sentiment-profile-lupen` | Volume | own | Horazio | batch 20 |
| 640 | Liquidity Sweep Confirmation | `liquidity-sweep-confirmation` | Trend | price | filipiti | batch 38 |
| 641 | Liquidity Sweep Filter | `liquidity-sweep-filter` | Trend | price | AlgoAlpha | most liked |
| 642 | Liquidity Sweeps [LuxAlgo] | `liquidity-sweeps` | Trend | price |  |  |
| 643 | Liquidity Swings | `liquidity-swings` | Volume | price | LuxAlgo | most liked |
| 644 | Liquidity Thermal Map | `liquidity-thermal-map` | Volume | price | BigBeluga | most liked |
| 645 | Liquidity Trap & Reversal bot | `liquidity-trap-reversal-bot` | Channels & Bands | price | pointalgo | batch 28 |
| 646 | Liquidity Voids (FVG) | `liquidity-voids` | Volatility | price | LuxAlgo | most liked |
| 647 | Liquidity Zones | `liquidity-zones` | Volume | price | BigBeluga | most liked |
| 648 | Loacally Weighted MA (LWMA) Direction Histogram | `loacally-weighted-ma-direction-histogram` | Trend | own | LuxmiAI | batch 9 |
| 649 | Logit RSI | `logit-rsi` | Oscillators | own | AdaptiveRSI | batch 11 |
| 650 | Long Short dom | `long-short-dom` | Trend | own | Robin-Hood-trading | batch 11 |
| 651 | Lorentzian Length Adaptive Moving Average | `lorentzian-length-adaptive-moving-average` | Moving Averages | price | Starcruiser | batch 21 |
| 652 | Lumina Trend Channels | `lumina-trend-channels` | Channels & Bands | price | Pineify | batch 10 |
| 653 | Luminous Mean Reversion Channels | `luminous-mean-reversion-channels` | Channels & Bands | price | Pineify | batch 7 |
| 654 | Lunar Phase (LUNAR) | `lunar-phase` | Oscillators | own | mihakralj | batch 23 |
| 655 | MA Cross with Displacement | `ma-cross-with-displacement` | Moving Averages | price | TehThomas | batch 25 |
| 656 | MA Ribbon 5EMA \| 20EMA \| 50SMA \| 200EMA | `ma-ribbon-5ema-20ema-50sma-200ema` | Moving Averages | price | vamsinelluri7 | batch 29 |
| 657 | MA Sabres | `ma-sabres` | Moving Averages | price | LuxAlgo | most liked |
| 658 | MA Shaded Fill Crossover | `ma-shaded-fill` | Moving Averages | price |  |  |
| 659 | MA Strategy Emperor | `ma-strategy-emperor` | Trend | price | insiliconot |  |
| 660 | MA Type | `madrid-ma-ribbon` | Moving Averages | price |  |  |
| 661 | MA Zones | `ma-zones` | Moving Averages | price | ZenAndTheArtOfTrading | batch 7 |
| 662 | MACD (Buy & Sell signals) | `macd-irtov` | Momentum | own | irtov | batch 24 |
| 663 | Macd + Adx Pro by @Eternyworld | `macd-adx-pro-by-eternyworld` | Momentum | own | ETERNYWORLD | batch 26 |
| 664 | MACD 4C | `macd-4c` | Momentum | own | vkno422 |  |
| 665 | MACD Based Price Forecasting | `macd-based-price-forecasting` | Momentum | price | LuxAlgo | most liked |
| 666 | MACD Crossover | `macd-crossover` | Momentum | own |  |  |
| 667 | MacD Custom Indicator-Multiple Time Frame+All Available Options! | `cm-macd-custom-mtf` | Momentum | own | ChrisMoody | most liked |
| 668 | MACD DEMA | `macd-dema` | Momentum | own |  |  |
| 669 | MACD Divergence | `macd-divergence` | Momentum | own |  |  |
| 670 | MACD Dynamic Squeeze Pro | `macd-dynamic-squeeze-pro` | Momentum | own | ZynAlgo | batch 24 |
| 671 | MACD Leader | `macd-leader` | Momentum | own | LazyBear |  |
| 672 | MACD Liquidity Tracker System | `macd-liquidity-tracker-system` | Momentum | own | PROFABIGHI_CAPITAL | batch 29 |
| 673 | MACD Overlay v1 | `macd-overlay-v1` | Momentum | price | JopAlgo | batch 5 |
| 674 | MACD Pro | `macd-pro` | Momentum | own | VEGAlgo | batch 23 |
| 675 | MACD Pseudo Super Smoother | `macd-pseudo-super-smoother` | Oscillators | own | The_Peaceful_Lizard | batch 37 |
| 676 | MACD ReLoaded | `macd-reloaded` | Momentum | own | KivancOzbilgic |  |
| 677 | MACD Sniper | `macd-sniper` | Momentum | own | trade_lexx | batch 15 |
| 678 | MACD Support and Resistance [ChartPrime] | `macd-support-resistance` | Momentum | own | ChartPrime |  |
| 679 | MACD VXI | `macd-vxi` | Momentum | own |  |  |
| 680 | MACD With Crossings and Above Below Zero | `macd-with-crossings-and-above-below-zero` | Momentum | own | Kgroomes | batch 18 |
| 681 | MACD x BB x STDEV x RVI | `macd-x-bb-x-stdev-x-rvi` | Oscillators | own | Vaquant | batch 20 |
| 682 | MACD XD | `macd-xd` | Momentum | own | Zen_Formless | batch 8 |
| 683 | MACD-V (Volatility Normalized MACD) | `macd-v` | Momentum | own | KivancOzbilgic | batch 2 |
| 684 | MACD-V with Volatility Normalisation | `macd-v-with-volatility-normalisation` | Momentum | own | DutchCryptoDad | batch 25 |
| 685 | MACD1 Fast | `double-macd` | Momentum | own |  |  |
| 686 | MACDAS | `macdas` | Momentum | own |  |  |
| 687 | Machine Learning: kNN Trend Predictor | `machine-learning-knn-trend-predictor` | Trend | price | tkarolak | batch 11 |
| 688 | Machine Learning: Lorentzian Classification | `lorentzian-classification` | Trend | price | jdehorty | most liked |
| 689 | MAD Trend Detector ~ C H I P A | `mad-trend-detector-c-h-i-p-a` | Trend | own | C_H_I_P_A | batch 36 |
| 690 | Madrid Trend Squeeze | `madrid-trend-squeeze` | Momentum | own |  |  |
| 691 | MADZ - Moving Average Deviation Z-Score | `madz-moving-average-deviation-z-score` | Oscillators | own | MiesOnCharts | batch 32 |
| 692 | Magnet Force + RSI Filter V6 | `magnet-force-rsi-filter-v6` | Channels & Bands | price | mehmetbezgincan | batch 31 |
| 693 | Maket Strat Absorption Bubbles | `maket-strat-absorption-bubbles` | Volume | price | samb817 | batch 41 |
| 694 | MAMA - FAMA (Ehlers) | `mama-fama` | Moving Averages | price | KatherinaNote | batch 31 |
| 695 | Manipulation Candle | `manipulation-candle` | Candlestick Patterns | price | DrauzioFx | batch 39 |
| 696 | Mark Minervini Buy Signal | `mark-minervini-buy-signal` | Trend | price | Dr_Leong_Yee_Rock | batch 18 |
| 697 | Market Cipher A | `market-cipher-a` | Oscillators | price |  |  |
| 698 | Market Cipher B | `market-cipher-b` | Oscillators | own |  |  |
| 699 | Market Participation Ratio-MPR | `market-participation-ratio-mpr` | Volume | own | TechnoBlooms | batch 37 |
| 700 | Market Pressure Oscillator | `market-pressure-oscillator` | Oscillators | own | Uncle_the_shooter | batch 8 |
| 701 | Market Profile | `market-profile` | Volume | price | LonesomeTheBlue | most liked |
| 702 | Market Profile with TPO | `market-profile-with-tpo` | Volume | price | drother | most liked |
| 703 | Market Pulse Pro | `market-pulse-pro` | Oscillators | own | Canhoto-Medium | batch 32 |
| 704 | Market Sentiment Technicals | `market-sentiment-technicals` | Oscillators | price | LuxAlgo | most liked |
| 705 | Market Sessions - By Leviathan | `market-sessions-by-leviathan` | Trend | price | LeviathanCapital | most liked |
| 706 | Market sessions and Volume profile - By Leviathan | `market-sessions-volume-profile` | Volume | price | LeviathanCapital | most liked |
| 707 | Market Shift Levels | `market-shift-levels` | Trend | price |  |  |
| 708 | Market Structure - By Leviathan | `market-structure-by-leviathan` | Trend | price | LeviathanCapital | most liked |
| 709 | Market Structure Break & OB Probability Toolkit | `market-structure-break-ob-probability-toolkit` | Trend | price | LuxAlgo | most liked |
| 710 | Market Structure Break & Order Block by EmreKb | `market-structure-break-order-block` | Trend | price | EmreKb | most liked |
| 711 | Market Structure CHoCH/BOS (Fractal) | `market-structure-choch-bos` | Trend | price | LuxAlgo | most liked |
| 712 | Market Structure Dashboard \| Flux Charts | `market-structure-dashboard-flux-charts` | Trend | price | fluxchart | most liked |
| 713 | Market Structure Oscillator | `market-structure-oscillator` | Oscillators | own | LuxAlgo | most liked |
| 714 | Market Structure Trailing Stop | `market-structure-trailing-stop` | Trend | price | LuxAlgo |  |
| 715 | Market Structure Trend | `market-structure-trend` | Trend | price | QuantAlgo | batch 12 |
| 716 | Market Structure with Inducements & Sweeps | `market-structure-with-inducements-sweeps` | Trend | price | LuxAlgo | most liked |
| 717 | Martell MNQ Quantum Scalper Pro | `martell-mnq-quantum-scalper-pro` | Trend | price | JMartell | batch 31 |
| 718 | Marubozu Detector | `marubozu-detector` | Candlestick Patterns | price | toppermost | batch 38 |
| 719 | Matrix Series | `matrix-series` | Oscillators | own |  |  |
| 720 | MavilimW | `mavilimw` | Trend | price | KivancOzbilgic |  |
| 721 | Mean Angles | `mean-angles` | Momentum | own | bharatTrader | batch 9 |
| 722 | Mean Reversion Channel - (fareid's MRI Variant) | `mean-reversion-channel` | Channels & Bands | price | fareidzulkifli | most liked |
| 723 | Measured Pattern Move (Bulkowski) | `measured-pattern-move` | Trend | price | Steversteves | batch 28 |
| 724 | MechArt Moving Average and % Above V1.1 | `mechart-moving-average-and-above-v1-1` | Moving Averages | price | MechArt_ | batch 29 |
| 725 | Median ATR SD Oscillator | `median-atr-sd-oscillator` | Volatility | own | Unknownhodler | batch 37 |
| 726 | Median Gaussian Trend \| NAL | `median-gaussian-trend-nal` | Trend | price | NordicAlphaLab | batch 15 |
| 727 | Median MACD - Mattes | `median-macd-mattes` | Momentum | own | Mattes00 | batch 8 |
| 728 | Median Volume Weighted Deviation | `median-volume-weighted-deviation` | Volume | price | Burggg | batch 30 |
| 729 | MESA Adaptive Ehlers Flow \| AlphaNatt | `mesa-adaptive-ehlers-flow` | Moving Averages | price | AlphaNatt | batch 8 |
| 730 | MESA Phase-Adaptive Band Trend | `mesa-phase-adaptive-band-trend` | Trend | price | SchizoQuant | batch 22 |
| 731 | MFI | `mfi-seiglerj` | Volume | own | seiglerj | most liked |
| 732 | MFI + RSI + EMA Dynamic Signals | `mfi-rsi-ema-dynamic-signals` | Momentum | price | Raisontgh | batch 37 |
| 733 | MFI Nexus Pro | `mfi-nexus-pro` | Volume | own | trade_lexx | batch 10 |
| 734 | MFI/RSI Bollinger Bands | `mfi-rsi-bb` | Oscillators | own |  |  |
| 735 | Mid-term Ribbon | `mid-term-ribbon` | Moving Averages | price | Gartav388637 | batch 25 |
| 736 | Minervini Trend Template Screener (v5) | `minervini-trend-template-screener` | Trend | price | hibinomasakazu1991 | batch 41 |
| 737 | Minimalist Doji Highlighter | `minimalist-doji-highlighter` | Candlestick Patterns | price | SensitiveSuit | batch 40 |
| 738 | Mirage Liquidity Sweep Pro | `mirage-liquidity-sweep-pro` | Trend | price | WillyAlgoTrader | most liked |
| 739 | ML Adaptive SuperTrend | `ml-adaptive-supertrend` | Trend | price |  |  |
| 740 | ML Deep Regression Pro | `ml-deep-regression-pro` | Trend | price | TechnoBlooms | batch 29 |
| 741 | ML Momentum Index | `ml-momentum-index` | Momentum | own |  |  |
| 742 | ML Moving Average | `ml-moving-average` | Moving Averages | price |  |  |
| 743 | ML RSI | `ml-rsi` | Momentum | own |  |  |
| 744 | ML: kNN Strategy | `ml-knn-strategy` | Momentum | own |  |  |
| 745 | Modified Heikin-Ashi | `modified-heikin-ashi` | Candlestick Patterns | price | ChrisMoody |  |
| 746 | Momentum Shift | `momentum-shift` | Momentum | own | BigBeluga | most liked |
| 747 | Momentum-based ZigZag | `momentum-zigzag` | Trend | price | Peter_O |  |
| 748 | Money Flow Extended | `money-flow-extended` | Volume | own | alexrainman | batch 6 |
| 749 | Money Flow Index + Alerts | `money-flow-index-alerts` | Oscillators | own | DreamsDefined | most liked |
| 750 | Money Flow Profile | `money-flow-profile` | Volume | price | LuxAlgo | most liked |
| 751 | Money Flow Pulse | `money-flow-pulse` | Volume | own | TheLeadingIndicator | batch 35 |
| 752 | Moneyball EMA-MACD indicator | `moneyball-ema-macd-indicator` | Momentum | own | VinnieTheFish | batch 6 |
| 753 | Monotonic Trend Consensus | `monotonic-trend-consensus` | Trend | own | QuantAlgo | batch 16 |
| 754 | Moving Average ADX | `ma-adx` | Moving Averages | price |  |  |
| 755 | Moving Average Candles | `moving-average-candles` | Moving Averages | price | aleskxyz | batch 41 |
| 756 | Moving Average Colored | `ma-colored` | Moving Averages | price |  |  |
| 757 | Moving Average Converging | `ma-converging` | Moving Averages | price | LuxAlgo |  |
| 758 | Moving Average Cross Alert, Multi-Timeframe (MTF) (by ChartArt) | `ma-cross-alert-mtf` | Moving Averages | price | ChartArt | most liked |
| 759 | Moving Average Crossover with Shading Signals | `moving-average-crossover-with-shading-signals` | Moving Averages | price | Decam9 | batch 12 |
| 760 | Moving Average Deviation Rate | `ma-deviation-rate` | Moving Averages | own |  |  |
| 761 | Moving Average Percentage Difference | `moving-average-percentage-difference` | Moving Averages | own | GapLogic | batch 37 |
| 762 | Moving Average Shift | `ma-shift` | Moving Averages | price |  |  |
| 763 | Moving Average Trend Meter | `moving-average-trend-meter` | Trend | own | UkutaLabs | batch 39 |
| 764 | Moving Averages With Continuous Periods | `moving-averages-with-continuous-periods` | Moving Averages | price | The_Peaceful_Lizard | batch 15 |
| 765 | Moving Volume-Weighted Avg Price, % Channel, BBs | `moving-volume-weighted-avg-price-channel-bbs` | Channels & Bands | price | NeanderTraderBC | batch 37 |
| 766 | Moving VWAP-KAMA Cloud | `moving-vwap-kama-cloud` | Moving Averages | price | SovereignCharts | batch 12 |
| 767 | MPO4 Lines – Modal Engine | `mpo4-lines-modal-engine` | Oscillators | own | Uncle_the_shooter | batch 15 |
| 768 | mr.crypto731 | `mr-crypto731` | Momentum | own | Ali_Smith | batch 20 |
| 769 | MSL Squeeze Pulse | `msl-squeeze-pulse` | Volatility | own | MarketStructureLab | batch 16 |
| 770 | MTF Order Block Finder | `mtf-order-block-finder` | Trend | price | DasanC | most liked |
| 771 | Multi Kernel Regression | `multi-kernel-regression` | Trend | price | ChartPrime | most liked |
| 772 | Multi-Band Trend Line | `multi-band-trend-line` | Trend | price | Mr_Rakun | batch 4 |
| 773 | Multi-Oscillator Adaptive Kernel \| AlphaAlgos | `multi-oscillator-adaptive-kernel-alphaalgos` | Oscillators | own | AlphaNatt | batch 4 |
| 774 | Multiple Divergences | `multiple-divergences` | Momentum | price | PeterO |  |
| 775 | Multiple Exponential Fibnonacci Moving Averages | `multiple-exponential-fibnonacci-moving-averages` | Moving Averages | price | LensOfChartist | batch 13 |
| 776 | Multiple Moving Averages | `multiple-ma` | Moving Averages | price |  |  |
| 777 | Multiple RSI | `multiple-rsi` | Oscillators | own | PrasadJoshi12 | batch 19 |
| 778 | Multitimeframe Fair Value Gap – FVG | `multitimeframe-fair-value-gap-fvg` | Trend | price | Zeiierman | most liked |
| 779 | MurreysOscillator | `murreys-math-osc` | Oscillators | own |  |  |
| 780 | Muses afl script | `muses-afl-script` | Trend | price | mostafa47ab (indicator title "L1 Filter Sig") | batch 31 |
| 781 | Mushir's Inside Candle Indicator | `mushir-s-inside-candle-indicator` | Candlestick Patterns | price | mushirinamdar | batch 42 |
| 782 | My auto dual avwap with Auto swing low/pivot low finder | `my-auto-dual-avwap-with-auto-swing-low-pivot-low-finder` | Volume | price | doqkhanh | batch 22 |
| 783 | N Order EMA | `n-order-ema` | Moving Averages | price | The_Peaceful_Lizard | batch 35 |
| 784 | Nadaraya-Watson Envelope | `nadaraya-watson-envelope` | Channels & Bands | price | LuxAlgo | most liked |
| 785 | Nadaraya-Watson Smoothers | `nadaraya-watson-smoothers` | Trend | price | LuxAlgo | most liked |
| 786 | Nadaraya-Watson Trend | `nadaraya-watson-trend` | Trend | price | QuantAlgo | batch 1 |
| 787 | Navier-Cauchy Market Elasticity | `navier-cauchy-market-elasticity` | Oscillators | own | PhenLabs | batch 30 |
| 788 | Neighboring Price Bands | `neighboring-price-bands` | Channels & Bands | price | LuxAlgo | batch 21 |
| 789 | Nexus Sentiment & Risk Matrix | `nexus-sentiment-risk-matrix` | Oscillators | own | Pineify | batch 37 |
| 790 | NLMS Volatility Trail | `nlms-volatility-trail` | Trend | price | BackQuant | batch 4 |
| 791 | No wick candles | `no-wick-candles` | Candlestick Patterns | price | KORD_ | batch 39 |
| 792 | Normalized Candles RSI | `normalized-candles-rsi` | Oscillators | own | Jamallo22 | batch 32 |
| 793 | Normalized QQE | `normalized-qqe` | Oscillators | own |  |  |
| 794 | Normalized SPMA \| NAL | `normalized-spma-nal` | Oscillators | own | NordicAlphaLab | batch 30 |
| 795 | Normalized Volume & True Range | `normalized-volume-true-range` | Volume | own | The_Peaceful_Lizard | batch 36 |
| 796 | Nova Flow Lite (Free) | `nova-flow-lite` | Trend | price | NovaQuantX | batch 36 |
| 797 | Nova Statistical Filtering Oscillator | `nova-statistical-filtering-oscillator` | Oscillators | own | Pineify | batch 27 |
| 798 | NY ORB + Fakeout Detector | `ny-orb-fakeout-detector` | Channels & Bands | price | STEFANGAS | batch 27 |
| 799 | OA - SMES | `oa-smes` | Oscillators | own | onurag | batch 4 |
| 800 | OBV & AD Oscillators with Dual Smoothing Options | `obv-ad-oscillators-with-dual-smoothing-options` | Volume | own | hollowwick (indicator title "OBV, AD, VPT & CDV | batch 27 |
| 801 | OBV (Delta or regular) | `obv-gizmo` | Volume | own | GizmoTheInvestor | batch 37 |
| 802 | OBV + Custom MA Strategy | `obv-custom-ma-strategy` | Volume | own | Rafiki-is-Trading | batch 14 |
| 803 | OBV MACD | `obv-macd` | Volume | own |  |  |
| 804 | OBV Oscillator | `obv-oscillator` | Volume | own |  |  |
| 805 | OBVX Conviction Bias | `obvx-conviction-bias` | Volume | own | TheLeadingIndicator | batch 31 |
| 806 | Opal | `opal` | Channels & Bands | price | FlyingSeaHorse | batch 36 |
| 807 | Open Close Cross | `open-close-cross` | Momentum | own | JustUncleL |  |
| 808 | Opening Range Breakout with 2 Profit Targets. | `opening-range-breakout-with-2-profit-targets` | Trend | price |  | most liked |
| 809 | Opening Range with Breakouts & Targets | `opening-range-breakouts-targets` | Trend | price | LuxAlgo | most liked |
| 810 | Optimized Trend Tracker | `optimized-trend-tracker` | Trend | price | KivancOzbilgic |  |
| 811 | ORB - Opening Range Breakout | `orb-opening-range-breakout` | Trend | price | zzzcrypto123 | most liked |
| 812 | ORB Algo \| Flux Charts | `orb-algo-flux-charts` | Trend | price | fluxchart | most liked |
| 813 | Order Block Detector | `order-block-detector` | Trend | price | LuxAlgo | most liked |
| 814 | Order Block Finder (Experimental) | `order-block-finder` | Trend | price | wugamlo | most liked |
| 815 | Order Blocks & Breaker Blocks | `order-blocks-breaker-blocks` | Trend | price | LuxAlgo | most liked |
| 816 | Order Blocks with Signals | `order-blocks-signals` | Trend | price | ClayeWeight |  |
| 817 | Order Blocks \| Flux Charts | `order-blocks-flux-charts` | Volume | price | fluxchart | most liked |
| 818 | Order Flow Imbalance Oscillator | `order-flow-imbalance-oscillator` | Volume | own | StrikePriceLabs | batch 33 |
| 819 | Oscillator Matrix | `oscillator-matrix` | Oscillators | own | AlphaExtract | batch 6 |
| 820 | PAFT | `paft` | Momentum | own | TREESinvest | batch 30 |
| 821 | Parabolic Stoch SAR Visualizer | `parabolic-stoch-sar-visualizer` | Oscillators | own | BOSWaves | batch 24 |
| 822 | Parallel Pivot Lines | `parallel-pivot-lines` | Channels & Bands | price | LuxAlgo |  |
| 823 | Pay Attention Candle | `pay-attention-candle` | Candlestick Patterns | price | asenski (inspired by the RexDog Trading System) | batch 41 |
| 824 | PCR Market Regime Indicator | `pcr-market-regime-indicator` | Momentum | own | Aleksin_Aleksandar | batch 31 |
| 825 | Peak Reversal v2 | `peak-reversal-v2` | Channels & Bands | price | Zettt | batch 11 |
| 826 | Peak Reversal v3 | `peak-reversal-v3` | Channels & Bands | price | Zettt | batch 21 |
| 827 | Percent Off All-time High (% Off High) | `percent-off-all-time-high` | Oscillators | own | xHmmmmm | batch 19 |
| 828 | Percentile Rank Oscillator (Price + VWMA) | `percentile-rank-oscillator` | Oscillators | own | exploretranspose | batch 26 |
| 829 | Percentile-Based BB% Trend - Mattes | `percentile-based-bb-trend-mattes` | Oscillators | own | Mattes00 | batch 7 |
| 830 | Perfect Hammer Pattern Indicators and Alerts | `perfect-hammer-pattern-indicators-and-alerts` | Candlestick Patterns | price | girishptryambakee | batch 40 |
| 831 | Perfect RSI | `perfect-rsi` | Oscillators | own | HabibiBudo | batch 26 |
| 832 | Perforance integral | `perforance-integral` | Momentum | own | Majimbi | batch 37 |
| 833 | Philakone 55 EMA Swing Trading | `philakone-ema-swing` | Moving Averages | price |  |  |
| 834 | Pipstocrat Market Participant Analysis | `pipstocrat-market-participant-analysis` | Momentum | own | Delast2 | batch 23 |
| 835 | Pivot Based Trailing Maxima & Minima | `pivot-trailing-maxmin` | Channels & Bands | price | LuxAlgo |  |
| 836 | Pivot Breakout High&Low Signals | `pivot-breakout-high-low-signals` | Trend | price | Jos-ProTrader | batch 3 |
| 837 | Pivot Breakout with Trend Zones | `pivot-breakout-with-trend-zones` | Trend | price | dreamaker7 | batch 33 |
| 838 | Pivot Hilo Support n Resistance Levels R3-3 by JustUncleL | `pivot-hilo-support-n-resistance-levels-r3-3` | Trend | price | JustUncleL | most liked |
| 839 | Pivot Market Structure | `pivot-market-structure` | Trend | price | Daniel_Ge | batch 11 |
| 840 | Pivot Oscillator | `pivot-oscillator` | Oscillators | own | Uncle_the_shooter | batch 3 |
| 841 | Pivot Point | `pivot-point-hpotter` | Trend | price | HPotter | most liked |
| 842 | Pivot Point SuperTrend | `pivot-point-supertrend` | Trend | price | LonesomeTheBlue |  |
| 843 | Pivot Points High Low & Missed Reversal Levels | `pivot-points-high-low-missed-reversal` | Trend | price | LuxAlgo | most liked |
| 844 | Pivot Points High Low Multi Time Frame | `pivot-points-high-low-multi-time-frame` | Trend | price | LonesomeTheBlue | most liked |
| 845 | Pivot Trend | `pivot-trend` | Trend | price | ChartPrime | batch 1 |
| 846 | PMax on RSI with Tillson T3 | `pmax-on-rsi-with-tillson-t3` | Oscillators | own | KivancOzbilgic | most liked |
| 847 | POC Volume Bar (Highest Volume in Range) | `poc-volume-bar` | Volume | own | greatbrownball | batch 28 |
| 848 | Pocket Pivot Breakout | `pocket-pivot-breakout` | Volume | price | simatricks | batch 38 |
| 849 | PolyFilter | `polyfilter` | Moving Averages | price | BackQuant | batch 8 |
| 850 | Polynomial Regression Moving Average (PRMA) | `polynomial-regression-moving-average` | Moving Averages | price | ZakAlgoTrade | batch 24 |
| 851 | Polynomial Trend Exhaustion & Divergence | `polynomial-trend-exhaustion-divergence` | Trend | price | B3AR_Trades | batch 40 |
| 852 | Polyphase MACD (PMACD) | `polyphase-macd` | Momentum | own | The_Peaceful_Lizard | batch 19 |
| 853 | Power Of 3 ICT 01 AMD ICT & SMC Accumulations | `power-of-3-ict-01-amd-ict-smc-accumulations` | Trend | price | TradingFinder | most liked |
| 854 | PPO Alerts | `ppo-alerts` | Momentum | own |  |  |
| 855 | PPO Divergence | `ppo-divergence` | Momentum | own | Pekipek |  |
| 856 | Precision Sniper | `precision-sniper` | Trend | price | WillyAlgoTrader | most liked |
| 857 | Predictive Channels | `predictive-channels` | Channels & Bands | price | LuxAlgo |  |
| 858 | Predictive Ranges | `predictive-ranges` | Channels & Bands | price | LuxAlgo | most liked |
| 859 | Premier RSI Oscillator | `premier-rsi` | Momentum | own |  |  |
| 860 | Premier Stochastic Oscillator | `premier-stochastic` | Oscillators | own |  |  |
| 861 | PREMIUM TRADE ZONES | `premium-trade-zones` | Oscillators | own | ENTRYLAB | batch 27 |
| 862 | Price & Volume Profile (Expo) | `price-volume-profile` | Volume | price | Zeiierman (community) |  |
| 863 | Price Acceleration Indicator (PAI) | `price-acceleration-indicator` | Momentum | own | PHICAPITALINVESTMENTS | batch 35 |
| 864 | Price Action Bands \| Trend & Volatility | `price-action-bands-trend-volatility` | Channels & Bands | price | RadixAlgo | batch 15 |
| 865 | Price Action Breakout Trend | `price-action-breakout-trend` | Trend | price | QuantAlgo | batch 5 |
| 866 | Price Action Signals Filtered +EMA | `price-action-signals-filtered-ema` | Trend | price | Aleksin_Aleksandar | batch 11 |
| 867 | Price Action Smart Money Concepts | `price-action-smart-money-concepts` | Trend | price | BigBeluga | most liked |
| 868 | Price Action Trading System | `price-action-system` | Oscillators | price |  |  |
| 869 | Price Action: Engulfing Patterns | `price-action-engulfing-patterns` | Candlestick Patterns | price | Jay9286 | batch 33 |
| 870 | Price Advance & Decline Range Analysis | `price-advance-decline-range-analysis` | Volatility | own | RicardoSantos | batch 16 |
| 871 | Price Change Sentiment Index | `price-change-sentiment-index` | Oscillators | own | TradeVizion | batch 23 |
| 872 | Price Contraction / Expansion | `price-contraction-expansion` | Volatility | price | destrobr0685 | batch 42 |
| 873 | Price Divergence Detector | `price-divergence-detector` | Momentum | price | JustUncleL |  |
| 874 | Price Flow - Buy Sell | `price-flow-buy-sell` | Channels & Bands | price | IVTrader1990 | batch 35 |
| 875 | Price Linear Sequence Counter | `price-linear-sequence-counter` | Momentum | own | RicardoSantos | batch 14 |
| 876 | Price Momentum Oscillator | `price-momentum-oscillator` | Momentum | own |  |  |
| 877 | Price/Volume Value Histogram | `price-volume-value-histogram` | Volume | own | dman103 | batch 2 |
| 878 | Primitive Delta Divergence | `primitive-delta-divergence` | Volume | price | bfoster238 | batch 41 |
| 879 | Pring Special K\|a2m | `pring-special-k-a2m` | Momentum | own | ask2maniish | batch 34 |
| 880 | Prism Moving Average Trend | `prism-moving-average-trend` | Trend | price | MisinkoMaster | batch 19 |
| 881 | Pro Scalper - 2 MinutesTF by Ayoob | `pro-scalper-2-minutestf-by-ayoob` | Trend | price | FGMNDFBF | batch 30 |
| 882 | Probabilities Module - The Quant Science | `probabilities-module-the-quant-science` | Oscillators | own | thequantscience | batch 31 |
| 883 | Projected Crossover Trend | `projected-crossover-trend` | Trend | price | SchizoQuant | batch 4 |
| 884 | Prometheus Topological Persistent Entropy | `prometheus-topological-persistent-entropy` | Volatility | own | ScorsoneEnterprises | batch 23 |
| 885 | Pullback SAR | `pullback-sar` | Trend | price | szymonsobkowiak | batch 32 |
| 886 | Pullback Scalp Trade V2 | `pullback-scalp-trade-v2` | Trend | price | Sinyalbak_App | batch 12 |
| 887 | Pullback Trading Tool ALT R1.0 by JustUncleL | `pullback-trading-tool-alt-r1-0-by-justunclel` | Moving Averages | price | JustUncleL | most liked |
| 888 | Pulse Range | `pulse-range` | Trend | price | MarketStructureLab | batch 13 |
| 889 | Pulse RSI \| Lyro RS | `pulse-rsi-lyro-rs` | Oscillators | own | LyroRS | batch 10 |
| 890 | PulseWave + Divergence | `pulsewave-divergence` | Oscillators | own | Uncle_the_shooter | batch 7 |
| 891 | Pump & Dump Detector (sensitive) | `pump-dump-detector` | Volume | price | btcpayer | batch 39 |
| 892 | Pure Coca | `pure-coca` | Oscillators | own | La_Von | batch 7 |
| 893 | Pure Price Action ICT Tools | `pure-price-action-ict-tools` | Trend | price | LuxAlgo | most liked |
| 894 | Pure Price Action Structures | `pure-price-action-structures` | Trend | price | LuxAlgo | most liked |
| 895 | Q Impulse Entry | `q-impulse-entry` | Trend | price | Quantora | batch 17 |
| 896 | Q KAMA Clarity Trend | `q-kama-clarity-trend` | Trend | price | Quantora | batch 7 |
| 897 | Q Wave | `q-wave` | Trend | price | Quantora | batch 36 |
| 898 | QG-Particle Oscillator | `qg-particle-oscillator` | Oscillators | own | QuantG | batch 35 |
| 899 | QQE Cross | `qqe-cross` | Trend | price | JustUncleL |  |
| 900 | QQE MOD | `qqe-mod` | Momentum | own |  |  |
| 901 | QQE Signals | `qqe-signals` | Oscillators | price | colinmck |  |
| 902 | QTechLabs Machine Learning Logistic Regression Indicator | `qtechlabs-machine-learning-logistic-regression-indicator` | Oscillators | price | QTechLabsInfo | batch 33 |
| 903 | Quant VWAP System 3.8 | `quant-vwap-system-3-8` | Oscillators | own | CustomQuantLabs (published as "Quant VWAP System 3.8") | batch 8 |
| 904 | Quantile Regression Bands | `quantile-regression-bands` | Channels & Bands | price | BackQuant | batch 17 |
| 905 | Quantitative Qualitative Estimation | `qqe` | Oscillators | own | Glaz |  |
| 906 | Quantitative Qualitative Estimation QQE | `qqe-kivanc` | Oscillators | own |  | most liked |
| 907 | Quantum Regression Oscillator | `quantum-regression-oscillator` | Oscillators | own | abgthecoder | batch 32 |
| 908 | Quantum Trend Signal | `quantum-trend-signal` | Trend | price | ReubenMiles | batch 9 |
| 909 | QuantumTrend SwiftEdge | `quantumtrend-swiftedge` | Trend | price | SwiftEdge | batch 5 |
| 910 | Quartile For Loop | `quartile-for-loop` | Trend | own | SeerQuant | batch 6 |
| 911 | Quasimodo Pattern | `quasimodo-pattern` | Candlestick Patterns | price | anodrr2 | batch 41 |
| 912 | Radiant Mean Reversion Channels | `radiant-mean-reversion-channels` | Oscillators | own | Pineify | batch 34 |
| 913 | Radius Trend [ChartPrime] | `radius-trend` | Trend | price | ChartPrime |  |
| 914 | Rally Base Drop Signals | `rally-base-drop-signals` | Trend | price | LuxAlgo | batch 38 |
| 915 | Range Channel by Atilla Yurtseven | `range-channel-by-atilla-yurtseven` | Channels & Bands | own | AtillaYurtseven | batch 17 |
| 916 | Range Detector | `range-detector` | Trend | price | LuxAlgo |  |
| 917 | Range Filter Buy and Sell 5min - guikroth version | `range-filter-buy-sell-5min` | Trend | price | PHVNTOM_TRADER (original script by DonovanWall, adapted by | most liked |
| 918 | Range Identifier | `range-identifier` | Channels & Bands | price |  |  |
| 919 | Range Oscillator | `range-oscillator` | Oscillators | own | Zeiierman | batch 1 |
| 920 | Range Tightening Indicator (RTI) | `range-tightening-indicator` | Volatility | own | Ollie_AllCaps | batch 2 |
| 921 | Ranges With Targets | `ranges-with-targets` | Trend | price | ChartPrime | most liked |
| 922 | Rapid Exponential Moving Average | `rapid-exponential-moving-average` | Moving Averages | price | ImmortalFreedom | batch 28 |
| 923 | RBT strategy | `rbt-strategy` | Momentum | price | luckykoshti | batch 38 |
| 924 | RCI 3 Lines | `rci-3lines` | Oscillators | own |  |  |
| 925 | RCYC Bullish Bearish Indicator | `rcyc-bullish-bearish-indicator` | Momentum | price | bizarro29 | batch 38 |
| 926 | ReadyFor401ks Just Tell Me When! | `readyfor401ks-just-tell-me-when` | Trend | price | ReadyFor401k | batch 20 |
| 927 | Real-Time Big Trades Bubbles & Absorbtions & Deep Pressure | `big-trades-bubbles` | Volume | price | samet_lezki | batch 5 |
| 928 | Realtime Volume Bars | `realtime-volume-bars` | Volume | own | the_MarketWhisperer |  |
| 929 | RedK EVEREX | `redk-everex` | Momentum | own | RedKTrader |  |
| 930 | RedK Magic Ribbon | `redk-magic-ribbon` | Moving Averages | price | RedKTrader | batch 2 |
| 931 | RedK Momentum Bars | `redk-momentum-bars` | Momentum | own | RedKTrader |  |
| 932 | RedK RSS_WMA | `redk-rss-wma` | Moving Averages | price | RedKTrader |  |
| 933 | RedK Trader Pressure Index | `redk-tpx` | Momentum | own | RedKTrader |  |
| 934 | RedK Vol_Weighted RSI: Extending the power of the classic RSI | `redk-vol-weighted-rsi` | Momentum | own | RedKTrader | batch 5 |
| 935 | Reflex & Trendflex | `reflex-trendflex` | Oscillators | own | e2e4 | batch 6 |
| 936 | Regression Channel Oscillator | `regression-channel-oscillator` | Oscillators | own | Uncle_the_shooter | batch 27 |
| 937 | Relative ATR Volatility Indicator | `relative-atr-volatility-indicator` | Volatility | own | ZenAndTheArtOfTrading | batch 20 |
| 938 | Relative Strength Heatmap | `relative-strength-heatmap` | Momentum | own | BackQuant | batch 22 |
| 939 | Relative Strength Index - Divergences - Libertus | `relative-strength-index-divergences-libertus` | Momentum | own | Libertus | most liked |
| 940 | Relative Valuation Oscillator | `relative-valuation-oscillator` | Oscillators | own | QuantAlgo | batch 14 |
| 941 | Relative Volume Indicator (RVOL) | `relative-volume-indicator` | Volume | own | AlgoCollective | batch 13 |
| 942 | Renko Boxes | `renko-boxes` | Trend | price | LuxAlgo | batch 4 |
| 943 | Renko Candles Overlay | `renko-candles-overlay` | Trend | price | LonesomeTheBlue | most liked |
| 944 | Renko Chart | `renko-chart` | Trend | price | LonesomeTheBlue |  |
| 945 | Renko Compression Index (RCI) | `renko-compression-index` | Oscillators | own | nasu_is_gaji | batch 34 |
| 946 | Renko Flip Alert (Traditional Only) | `renko-flip-alert` | Candlestick Patterns | price | deephrenology | batch 41 |
| 947 | Renko Mod | `renko-mod` | Trend | price | RicardoSantos | batch 13 |
| 948 | Renko Sniper PRO (Liquidity Sweep + EMA + ST + RSI) | `renko-sniper-pro` | Trend | price | zachsprad | batch 24 |
| 949 | Res/Sup With Concavity & Increasing / Decreasing Trend Analysis | `res-sup-with-concavity-increasing-decreasing-trend-analysis` | Trend | price | Celar (published as "Res/Sup With Concavity & Increasing / Decreasing Trend Analysis") | batch 28 |
| 950 | Retail vs Banker Net Positions – Symmetry Break | `retail-vs-banker-net-positions-symmetry-break` | Volume | own | JasonHyde | batch 17 |
| 951 | Reversal Candle Setup | `reversal-candle-setup` | Candlestick Patterns | price |  |  |
| 952 | Reversal Candlestick Structure | `reversal-candlestick-structure` | Candlestick Patterns | price | LuxAlgo | most liked |
| 953 | Reversal Correlation Pressure | `reversal-correlation-pressure` | Oscillators | own | OmegaTools | batch 27 |
| 954 | Reversal Probability Zone & Levels | `reversal-probability-zone-levels` | Trend | price | LuxAlgo | most liked |
| 955 | Reversal Scalper 2.0- Adib Noorani | `reversal-scalper-2-0-adib-noorani` | Oscillators | own | AdibNoorani | batch 28 |
| 956 | Reversal Signals | `reversal-signals` | Momentum | price | LuxAlgo | most liked |
| 957 | Rhokeo-VW-RSI Histogram for Cumulative Delta by Zeiirman | `rhokeo-vw-rsi-histogram-for-cumulative-delta-by-zeiirman` | Oscillators | own | nabil007 | batch 24 |
| 958 | Ripster EMA Clouds | `ripster-ema-clouds` | Trend | price | ripster47 |  |
| 959 | RMA ATR Bands | `rma-atr-bands` | Channels & Bands | price | SchizoQuant | batch 3 |
| 960 | RMI Length | `rmi-trend-sniper` | Momentum | price | TZack88 |  |
| 961 | Robby DSS Bressert Colored Dots | `robby-dss-bressert-colored-dots` | Oscillators | own | huatzhi | batch 21 |
| 962 | ROC-Weighted MA Oscillator | `roc-weighted-ma-oscillator` | Oscillators | own | SeerQuant | batch 2 |
| 963 | Rolling Liquidity Clusters Channel | `rolling-liquidity-clusters-channel` | Channels & Bands | price | LuxAlgo | batch 12 |
| 964 | Rolling Sharpe Ratio Oscillator \| Astral Vision | `rolling-sharpe-ratio-oscillator-astral-vision` | Oscillators | own | AstralVision | batch 13 |
| 965 | Rolling Trendline | `rolling-trendline` | Trend | price | LuxAlgo | batch 5 |
| 966 | Ross Cameron-Inspired Day Trading Strategy | `ross-cameron-inspired-day-trading-strategy` | Momentum | price | manaziir | batch 25 |
| 967 | RRR EMA Ignition BUY & SELL (Sideways-Proof) | `rrr-ema-ignition-buy-sell` | Trend | price | RAGSTER123 | batch 21 |
| 968 | RS Rating (1-99) | `rs-rating` | Momentum | own | kulturdesken | batch 16 |
| 969 | rs_MACD | `rs-macd` | Momentum | price | RicardoSantos | batch 17 |
| 970 | RSI | `rsi-hash-capital` | Oscillators | own | Hash_Capital | batch 31 |
| 971 | RSI & BB Oversold Scalper with MACD Confirmation | `rsi-bb-oversold-scalper-with-macd-confirmation` | Momentum | price | DotGain | batch 40 |
| 972 | RSI & MACD Suite | `rsi-macd-suite` | Oscillators | own | aaboomar | batch 34 |
| 973 | RSI (14) with Auto Zone Colors - Overbought/Oversold Highlighter | `rsi-with-auto-zone-colors-overbought-oversold-highlighter` | Oscillators | own | tarangbharti18 | batch 29 |
| 974 | RSI (Kernel Optimized) \| Flux Charts | `rsi-flux-charts` | Momentum | price | fluxchart | most liked |
| 975 | RSI + ADX + ATR 18-01-25 | `rsi-adx-atr-18-01-25` | Oscillators | own | dipak11298 | batch 37 |
| 976 | RSI + ADX + ATR Combo | `rsi-adx-atr-combo` | Oscillators | own | shawasutosh | batch 26 |
| 977 | RSI + BB + Dispersion | `rsi-bb-dispersion` | Oscillators | own |  |  |
| 978 | RSI + Fibonacci HH LL Support Resistance | `rsi-fibonacci-hh-ll-support-resistance` | Channels & Bands | price | FibonacciFlux | batch 12 |
| 979 | RSI + MACD (RSI Divergence) V3.2 | `rsi-macd-v3-2` | Oscillators | own | MKhoa | batch 24 |
| 980 | RSI + STOCH RSI - Marx_Capital | `rsi-stoch-rsi-marx-capital` | Oscillators | own | Marx_Capital | batch 12 |
| 981 | RSI - 5UP | `rsi-5up` | Oscillators | own | Marrulk | batch 29 |
| 982 | RSI Bands | `rsi-bands` | Channels & Bands | price |  |  |
| 983 | RSI Bars - OnlyFlow | `rsi-bars-onlyflow` | Momentum | price | ofderk | batch 10 |
| 984 | RSI BB StdDev Signal | `rsi-bb-stddev-signal` | Oscillators | own | trade_lexx (Pine title "RSI Signal [trade_lexx]") | batch 8 |
| 985 | RSI Candle Color | `rsi-candle-color` | Momentum | price | The_Peaceful_Lizard | batch 39 |
| 986 | RSI Candles | `rsi-candles` | Momentum | own | Glaz |  |
| 987 | RSI Confirm Trend with Williams (W%R) | `rsi-confirm-trend-with-williams` | Momentum | own | javageek | batch 11 |
| 988 | RSI cyclic smoothed v2 | `rsi-cyclic-smoothed-v2` | Oscillators | own | StockMarketCycles | most liked |
| 989 | RSI Divergence | `rsi-divergence` | Oscillators | own |  |  |
| 990 | RSI Entry Engine | `rsi-entry-engine` | Oscillators | own | tradewsamet | most liked |
| 991 | RSI Games 1.2 | `rsi-games-1-2` | Oscillators | own | petejfjohnson | batch 22 |
| 992 | RSI HistoAlert | `rsi-histoalert` | Oscillators | own |  |  |
| 993 | RSI Length | `most-rsi` | Momentum | own |  |  |
| 994 | RSI Length | `parabolic-rsi` | Momentum | own |  |  |
| 995 | RSI Length | `pmax-rsi-t3` | Momentum | own |  |  |
| 996 | RSI Length | `rsi-cyclic-smoothed` | Momentum | own |  |  |
| 997 | RSI MA Cross + Divergence Signal (V2) | `rsi-ma-cross-divergence-signal` | Momentum | price | noxum | batch 39 |
| 998 | RSI Modified | `rsi-modified` | Oscillators | own | Santos_Trader_PT | batch 5 |
| 999 | RSI Momentum Divergence | `rsi-momentum-divergence` | Oscillators | own | ChartPrime |  |
| 1000 | RSI Multi Levels kiawosch 7-14-42 Consolidation | `rsi-multi-levels` | Oscillators | own | TFlab | batch 5 |
| 1001 | RSI Multicolor editable | `rsi-multicolor-editable` | Oscillators | own | Guillaume46 | batch 8 |
| 1002 | RSI PERFECT Flip Dots | `rsi-perfect-flip-dots` | Momentum | price | debanshuchanda6 | batch 42 |
| 1003 | RSI Potential | `rsi-potential` | Momentum | own | nasu_is_gaji | batch 35 |
| 1004 | RSI Snabbel | `rsi-snabbel` | Oscillators | own |  |  |
| 1005 | RSI Supply/Demand | `rsi-supply-demand` | Trend | price | shtcoinr / Lij_MC |  |
| 1006 | RSI Support & Resistance by DGT | `rsi-support-resistance-by-dgt` | Momentum | price | dgtrd | most liked |
| 1007 | RSI Swing Indicator v2 | `rsi-swing-indicator-v2` | Momentum | price | MrDinasty (BalintDavid) | most liked |
| 1008 | RSI Swing Signal | `rsi-swing-signal` | Oscillators | own |  |  |
| 1009 | RSI Tops and Bottoms | `rsi-tops-bottoms` | Momentum | own | LonesomeTheBlue |  |
| 1010 | RSI Trend Bias | `rsi-trend-bias` | Oscillators | own | Botnet101 | batch 24 |
| 1011 | RSI Trend Navigator | `rsi-trend-navigator` | Trend | price | QuantAlgo | batch 10 |
| 1012 | RSI Zone Step Lines | `rsi-zone-step-lines` | Channels & Bands | price | Devjames | batch 11 |
| 1013 | RSI+EMA+MZONES with Divergences | `rsi-ema-mzones-with-divergences` | Oscillators | own | lordoflolz | batch 22 |
| 1014 | RSI+Stoch Band Oscillator | `rsi-stoch-band-oscillator` | Oscillators | own | nasu_is_gaji | batch 26 |
| 1015 | RSI-50 Step Line | `rsi-50-step-line` | Trend | price | Devjames | batch 5 |
| 1016 | RSI-Colored Price Candles with Background | `rsi-colored-price-candles-with-background` | Momentum | price | Midgar- | batch 39 |
| 1017 | RSI-EMA-Crossing with Donchian-Stop-Loss | `rsi-ema-crossing-with-donchian-stop-loss` | Channels & Bands | price | Kahael | batch 28 |
| 1018 | RSI: alternative derivation | `rsi-alternative-derivation` | Oscillators | own | AdaptiveRSI | batch 25 |
| 1019 | RVOL Effort Matrix | `rvol-effort-matrix` | Volume | own | TheLeadingIndicator | batch 36 |
| 1020 | S&R Breakout ATR Confirmation | `s-r-breakout-atr-confirmation` | Trend | price | Jos-ProTrader | batch 33 |
| 1021 | SAR + EMA + MACD Signals | `sar-ema-macd` | Oscillators | price |  |  |
| 1022 | Saty ATR Levels | `saty-atr-levels` | Volatility | price | satymahajan | most liked |
| 1023 | Savitzky Flow Bands | `savitzky-flow-bands` | Channels & Bands | price | ChartPrime | batch 2 |
| 1024 | Savitzky-Golay Hampel Filter \| AlphaNatt | `savitzky-golay-hampel-filter-alphanatt` | Moving Averages | price | AlphaNatt | batch 15 |
| 1025 | Scalp Pro | `scalp-pro` | Momentum | own | ovelix | most liked |
| 1026 | Scalping Line | `scalping-line` | Oscillators | own | KivancOzbilgic |  |
| 1027 | Scalping PullBack Tool R1 by JustUncleL | `scalping-pullback-tool` | Trend | price | JustUncleL | most liked |
| 1028 | Scalping Swing Trading Tool R1-4 by JustUncleL | `scalping-swing-trading-tool-r1-4-by-justunclel` | Moving Averages | price | JustUncleL | most liked |
| 1029 | Scalping Tool with Dynamic Take Profit & Stop Loss | `scalping-tool-dynamic-tp-sl` | Trend | price | TruFREND | batch 3 |
| 1030 | ScalpMap - EMA Pivot Targets | `scalpmap-ema-pivot-targets` | Trend | price | blockybears | batch 12 |
| 1031 | SCE GANN Predictions | `sce-gann-predictions` | Trend | price | ScorsoneEnterprises | batch 22 |
| 1032 | Schaff Trend Cycle | `schaff-trend-cycle` | Oscillators | own | LazyBear |  |
| 1033 | SCOTTGO Advanced MACD | `scottgo-advanced-macd` | Momentum | own | SCOTTGO (indicator title "MACD: Clean Visuals (Fixed Arrows)") | batch 27 |
| 1034 | Self-Aware Trend System | `self-aware-trend-system` | Trend | price | WillyAlgoTrader | most liked |
| 1035 | Sell & Buy Rates | `sell-buy-rates` | Volume | own | LonesomeTheBlue |  |
| 1036 | Sequential Pattern Strength | `sequential-pattern-strength` | Momentum | own | QuantAlgo | batch 9 |
| 1037 | Session Sweeps | `session-sweeps` | Volatility | price | LuxAlgo | most liked |
| 1038 | Sessions | `sessions-luxalgo` | Trend | price | LuxAlgo | most liked |
| 1039 | Sessions on Chart | `sessions-on-chart` | Trend | price | Aurocks_AIF | most liked |
| 1040 | Setup 9.1 (Larry Williams) + EMA 50 | `setup-9-1-ema-50` | Moving Averages | price | oDouglasAlex | batch 7 |
| 1041 | SExI - Super Exhaustion Indicator | `sexi-super-exhaustion-indicator` | Oscillators | own | Da_Prof | batch 14 |
| 1042 | Sharp Modified Moving Average | `sharp-modified-moving-average` | Moving Averages | price | everget | batch 18 |
| 1043 | Sharpe Ratio Indicator (180) | `sharpe-ratio-indicator` | Volatility | own | tim_amblard | batch 3 |
| 1044 | Sharpe Ratio v4 | `sharpe-ratio-v4` | Oscillators | own | Zettt | batch 32 |
| 1045 | Sharpshooter 30 – EMA Distance | `sharpshooter-30-ema-distance` | Moving Averages | price | hrak22 | batch 33 |
| 1046 | Shock Percentile Moving Average \| NAL | `shock-percentile-moving-average-nal` | Moving Averages | price | NordicAlphaLab | batch 22 |
| 1047 | Sigmoid RSI \| NAL | `sigmoid-rsi-nal` | Oscillators | own | NordicAlphaLab | batch 11 |
| 1048 | Signal Forge | `signal-forge` | Trend | price | LuxAlgo | most liked |
| 1049 | Signal Moving Average | `signal-ma` | Moving Averages | price | LuxAlgo |  |
| 1050 | Simple Moving Averages | `simple-moving-averages` | Moving Averages | price |  |  |
| 1051 | Simplified Percentile Clustering | `simplified-percentile-clustering` | Oscillators | own | InvestorUnknown | batch 4 |
| 1052 | Sine Weighted Moving Average | `sine-weighted-moving-average` | Moving Averages | price | everget | batch 13 |
| 1053 | SL - 4 EMAs, 2 SMAs & Crossover Signals | `sl-4-emas-2-smas-crossover-signals` | Moving Averages | price | MVP202020205 | batch 27 |
| 1054 | Slow Heiken Ashi | `slow-heiken-ashi` | Candlestick Patterns | price |  |  |
| 1055 | Slow Stochastic | `slow-stochastic` | Oscillators | own | Oshri17 | most liked |
| 1056 | SMA Angle Alerts | `sma-angle-alerts` | Moving Averages | price | readysetfire | batch 21 |
| 1057 | SMA DMA Crossing Signal | `sma-dma-crossing-signal` | Moving Averages | price | tradingqueen18 | batch 31 |
| 1058 | SMA Squeeze Oscillator | `sma-squeeze-oscillator` | Momentum | own | Uncle_the_shooter | batch 23 |
| 1059 | SMA+ADX Filter | `sma-adx-filter` | Trend | price | iping99 | batch 31 |
| 1060 | Smart MCDX FINAL PRO | `smart-mcdx-final-pro` | Volume | own | Sachse-1980 | batch 30 |
| 1061 | Smart Money Breakout Channels | `smart-money-breakout-channels` | Channels & Bands | price | AlgoAlpha | most liked |
| 1062 | Smart Money Breakout Signals | `smart-money-breakout-signals` | Trend | price | AlgoAlpha | most liked |
| 1063 | Smart Money Breakouts | `smart-money-breakouts` | Trend | price | ChartPrime | most liked |
| 1064 | Smart Money Concepts (SMC) | `smart-money-concepts-luxalgo` | Trend | price | LuxAlgo | most liked |
| 1065 | Smart Money Concepts Probability (Expo) | `smart-money-concepts-probability` | Trend | price | Zeiierman | most liked |
| 1066 | Smart Money Flow Signals | `smart-money-flow-signals` | Volume | own | QuantAlgo | batch 2 |
| 1067 | Smart Money Volume Index | `smart-money-volume-index` | Volume | own | AlgoAlpha | most liked |
| 1068 | Smart Trend | `smart-trend` | Trend | price | Zofesu | batch 21 |
| 1069 | Smarter SNR (Support and Ressistance, Trendline, MTF OSC) | `smarter-snr` | Trend | price | hanabil | most liked |
| 1070 | SMC Statistical Liquidity Walls | `smc-statistical-liquidity-walls` | Channels & Bands | price | PhenLabs | batch 25 |
| 1071 | SMC Structures and FVG | `smc-structures-and-fvg` | Trend | price | LudoGH68 | most liked |
| 1072 | SMIIOL | `smiiol` | Momentum | own | iilter | batch 25 |
| 1073 | Smooth RSI | `smooth-rsi` | Momentum | own | MarktQuant | batch 8 |
| 1074 | Smoothed Heiken Ashi | `smoothed-heiken-ashi` | Trend | price | jackvmk |  |
| 1075 | Smoothed Low-Pass Butterworth Filtered Median | `butterworth-filtered-median` | Moving Averages | price | AlphaNatt | batch 8 |
| 1076 | Smoothed Source Weighted EMA | `smoothed-source-weighted-ema` | Moving Averages | price | Clokivez | batch 13 |
| 1077 | Source | `ott-bands` | Channels & Bands | price | KivancOzbilgic |  |
| 1078 | Source | `otto` | Oscillators | own | KivancOzbilgic |  |
| 1079 | Source | `range-filter-dw` | Trend | price |  |  |
| 1080 | Source-Aligned Oscillators (for Divergences) | `source-aligned-oscillators` | Oscillators | own | QuantNomad | batch 18 |
| 1081 | SP - MACD with Divergence | `sp-macd-with-divergence` | Momentum | own | ca_sidnayak | batch 24 |
| 1082 | Spira Alligator | `spira-alligator` | Trend | price | Markedsignaler | batch 26 |
| 1083 | SPX500 Quick Drop & Rise Alerts | `spx500-quick-drop-rise-alerts` | Momentum | price | PaperChains | batch 41 |
| 1084 | Squeeze Channel | `squeeze-channel` | Channels & Bands | price | B3AR_Trades | batch 16 |
| 1085 | Squeeze Momentum | `squeeze-momentum` | Momentum | own | LazyBear |  |
| 1086 | Squeeze Momentum V2 | `squeeze-momentum-v2` | Oscillators | own |  |  |
| 1087 | SSL Channel | `ssl-channel` | Trend | price |  |  |
| 1088 | SSL Hybrid | `ssl-hybrid` | Trend | price | Mihkel00 | most liked |
| 1089 | SSL Hybrid Scalper | `ssl-hybrid-scalper` | Moving Averages | price | nabeel8369 | batch 11 |
| 1090 | ST0P | `st0p` | Oscillators | price |  |  |
| 1091 | Standardized MACD HA | `standardized-macd-ha` | Momentum | own | EliCobra |  |
| 1092 | Start | `lucid-sar` | Trend | price |  |  |
| 1093 | Statistical Price Deviation Index (MAD/VWMA) | `statistical-price-deviation-index` | Oscillators | own | exploretranspose | batch 16 |
| 1094 | STH Unrealized Profit/Loss Ratio (STH-NUPL) | `sth-unrealized-profit-loss-ratio` | Oscillators | own | DeVrizii | batch 15 |
| 1095 | Stoch VX3 | `stoch-vx3` | Oscillators | own |  |  |
| 1096 | Stochastic Heat Map | `stochastic-heat-map` | Momentum | own | Violent |  |
| 1097 | Stochastic Momentum Index | `stochastic-momentum-index` | Oscillators | own |  |  |
| 1098 | Stochastic Momentum Index UCS | `smi-ucs` | Oscillators | own |  |  |
| 1099 | Stochastic OTT | `stochastic-ott` | Oscillators | own | KivancOzbilgic |  |
| 1100 | Stockbee ComboBull | `stockbee-combobull` | Momentum | own | traderabhi81 | batch 29 |
| 1101 | Stockbee Reversal Bullish v2 | `stockbee-reversal-bullish-v2` | Momentum | own | traderabhi81 | batch 29 |
| 1102 | Stop/Take Bounds | `stop-take-bounds` | Volatility | price | Y_Goldman | batch 27 |
| 1103 | Strong Burst Fader \| ProjectSyndicate | `strong-burst-fader-projectsyndicate` | Volatility | price | ProjectSyndicate | batch 38 |
| 1104 | Strong Engulfing Candlestick (With Alerts) | `strong-engulfing-candlestick` | Candlestick Patterns | price | kyjefive | batch 39 |
| 1105 | Super Guppy | `super-guppy` | Trend | price | JustUncleL |  |
| 1106 | Super OrderBlock / FVG / BoS Tools by makuchaku & eFe | `super-orderblock-fvg-bos` | Trend | price | makuchaku | most liked |
| 1107 | Super SMA 5 8 13 + EMA 20/200 Regime Filter (ALIZET) | `super-sma-5-8-13-ema-20-200-regime-filter` | Moving Averages | price | afdzjr69 | batch 19 |
| 1108 | Super Smoothed MACD | `super-smoothed-macd` | Momentum | own |  |  |
| 1109 | Super SuperTrend | `super-supertrend` | Trend | price |  |  |
| 1110 | SuperBands | `superbands` | Trend | price | The_Peaceful_Lizard | batch 7 |
| 1111 | SuperBollingerTrend (Expo) | `superbollingertrend` | Trend | price | Zeiierman | most liked |
| 1112 | SuperSmoother MA Oscillator | `supersmoother-ma-oscillator` | Oscillators | own | BOSWaves | batch 1 |
| 1113 | SuperTrend + Relative Volume (Kernel Optimized) | `supertrend-relative-volume-kernel` | Trend | price | fluxchart | most liked |
| 1114 | SuperTrend AI Clustering | `supertrend-ai-clustering` | Trend | price |  |  |
| 1115 | SuperTrend Channels | `supertrend-channels` | Channels & Bands | price |  |  |
| 1116 | Supply & Demand (MTF) \| Flux Charts | `supply-demand-flux-charts` | Trend | price | fluxchart | most liked |
| 1117 | Supply and Demand Daily | `supply-and-demand-daily` | Volume | price | LuxAlgo | most liked |
| 1118 | Supply and Demand Zones | `supply-and-demand-zones` | Volume | price | BigBeluga | most liked |
| 1119 | Support & Resistance Pro Toolkit | `support-resistance-pro-toolkit` | Trend | price | LuxAlgo | most liked |
| 1120 | Support and Resistance (High Volume Boxes) | `support-resistance-high-volume-boxes` | Volume | price | ChartPrime | most liked |
| 1121 | Support and Resistance (MTF) \| Flux Charts | `support-and-resistance-flux-charts` | Trend | price | fluxchart | most liked |
| 1122 | Support and Resistance Levels with Breaks | `sr-levels-breaks` | Channels & Bands | price |  |  |
| 1123 | Support and Resistance Logistic Regression \| Flux Charts | `support-and-resistance-logistic-regression` | Trend | price | fluxchart | most liked |
| 1124 | Support and Resistance Power Channel | `support-resistance-power-channel` | Trend | price | ChartPrime | most liked |
| 1125 | Support and Resistance Signals MTF | `support-resistance-signals-mtf` | Trend | price | LuxAlgo | most liked |
| 1126 | Support Resistance - Dynamic | `support-resistance-dynamic` | Trend | price | LonesomeTheBlue | most liked |
| 1127 | Support Resistance - Dynamic v2 | `support-resistance-dynamic-v2` | Trend | price | LonesomeTheBlue | most liked |
| 1128 | Support Resistance Channels | `support-resistance-channels` | Trend | price | LonesomeTheBlue |  |
| 1129 | Support Resistance Interactive | `support-resistance-interactive` | Trend | price | LonesomeTheBlue | most liked |
| 1130 | Support Resistance MTF | `support-resistance-mtf` | Trend | price | LonesomeTheBlue | most liked |
| 1131 | Support Resistance with Breaks and Retests | `support-resistance-with-breaks-and-retests` | Trend | price | HoanGhetti | most liked |
| 1132 | Support/Resistance Channel Breakout | `support-resistance-channel-breakout` | Channels & Bands | price | SuprAlgo | batch 31 |
| 1133 | Support/Resistance V2 Indicator | `support-resistance-v2-indicator` | Trend | price | BarsStallone | most liked |
| 1134 | Suppot and resistance & BUY SELL SIGNALS | `suppot-and-resistance-buy-sell-signals` | Channels & Bands | price | doganayy2 | batch 20 |
| 1135 | Sweep Candle | `sweep-candle` | Candlestick Patterns | price | odnac | batch 41 |
| 1136 | Sweep Engulf 2 Candle | `sweep-engulf-2-candle` | Candlestick Patterns | price | gastrophollic | batch 41 |
| 1137 | Sweep Engulf CHoCH | `sweep-engulf-choch` | Candlestick Patterns | price | gastrophollic | batch 38 |
| 1138 | Sweep2Trade Pro | `sweep2trade-pro` | Trend | price | chervolino | batch 8 |
| 1139 | Swing Failure Pattern (SFP) | `swing-failure-pattern` | Trend | price | LuxAlgo | most liked |
| 1140 | Swing Highs/Lows & Candle Patterns | `swing-highs-lows-patterns` | Candlestick Patterns | price | LuxAlgo (Pine v5) |  |
| 1141 | Swing Levels and Liquidity - By Leviathan | `swing-levels-and-liquidity-by-leviathan` | Trend | price | LeviathanCapital | most liked |
| 1142 | Swing Points | `swing-points` | Trend | price | CrossTradeTeam | batch 14 |
| 1143 | Swing Profile | `swing-profile` | Volume | price | BigBeluga | most liked |
| 1144 | Swing Support and Resistance | `swing-support-and-resistance` | Trend | price | VSB-2024 | batch 25 |
| 1145 | Swing Trade Signals | `swing-trade-signals` | Oscillators | price | nicks1008 |  |
| 1146 | Swing Volume Profiles | `swing-volume-profiles` | Volume | price | LuxAlgo | most liked |
| 1147 | T1 Wyckoff Aggressive A/D Setup | `t1-wyckoff-aggressive-a-d-setup` | Volume | price | Teyo69 | batch 38 |
| 1148 | T3 Length | `t3-psar` | Moving Averages | price |  |  |
| 1149 | TA (Miles) Adaptive Trend | `ta-adaptive-trend` | Trend | price | TradingApologist | batch 27 |
| 1150 | Target Trend | `target-trend` | Trend | price | BigBeluga | most liked |
| 1151 | TASC 2025.02 Autocorrelation Indicator | `tasc-2025-02-autocorrelation` | Oscillators | own | PineCodersTASC | batch 6 |
| 1152 | TASC 2025.06 Cybernetic Oscillator | `tasc-2025-06-cybernetic-oscillator` | Oscillators | own | PineCodersTASC | batch 5 |
| 1153 | TASC 2025.09 The Continuation Index | `tasc-2025-09-the-continuation-index` | Trend | own | PineCodersTASC | batch 14 |
| 1154 | TASC 2026.01 The Reversion Index | `tasc-2026-01-the-reversion-index` | Oscillators | own | PineCodersTASC | batch 26 |
| 1155 | TASC 2026.04 A Synthetic Oscillator | `tasc-2026-04-a-synthetic-oscillator` | Oscillators | own | PineCodersTASC | batch 7 |
| 1156 | TASC 2026.05 The AutoTune Filter | `tasc-2026-05-the-autotune-filter` | Oscillators | own | PineCodersTASC | batch 8 |
| 1157 | TASC 2026.09 Adaptive SuperSmoother | `tasc-2026-09-adaptive-supersmoother` | Moving Averages | own | PineCodersTASC | batch 15 |
| 1158 | TDI - Traders Dynamic Index | `tdi-rsi` | Momentum | own |  |  |
| 1159 | Tenkan Cloud Signals | `tenkan-cloud-signals` | Trend | price | CodaPro | batch 11 |
| 1160 | Terminal Velocity Stop \| Lyro RS | `terminal-velocity-stop-lyro-rs` | Trend | price | LyroRS | batch 13 |
| 1161 | TFO + ADX with Histogram & Signal | `tfo-adx-with-histogram-signal` | Oscillators | own | WalrusQuant | batch 26 |
| 1162 | The Echo Forecast | `the-echo-forecast` | Trend | price | LuxAlgo | most liked |
| 1163 | The Jewel | `the-jewel` | Oscillators | own | afonso_77 | batch 37 |
| 1164 | The Mean Goose v1 | `the-mean-goose-v1` | Channels & Bands | price | FattyGuinness | batch 15 |
| 1165 | The Strat | `the-strat` | Candlestick Patterns | price | shayy110 | batch 42 |
| 1166 | Theil-Sen Line Filter | `theil-sen-line-filter` | Moving Averages | price | BackQuant | batch 18 |
| 1167 | Three Bar Reversal Pattern | `three-bar-reversal-pattern` | Trend | price | LuxAlgo | most liked |
| 1168 | Three Moving Averages | `three-moving-averages` | Moving Averages | price |  |  |
| 1169 | Three-Bar Reversal/Continuation | `three-bar-reversal-continuation` | Candlestick Patterns | price | abuzka | batch 42 |
| 1170 | Tight Range Display with Background | `tight-range-display-with-background` | Volatility | price | rakeshhelva | batch 42 |
| 1171 | Tillson T3 | `tillson-t3` | Trend | price | KivancOzbilgic (fr3762) |  |
| 1172 | Time-based Alerts for Trading Windows | `time-based-alerts-for-trading-windows` | Trend | price | xhmxdir | batch 41 |
| 1173 | TMA Overlay | `tma-overlay` | Moving Averages | price | ArtyFXC | most liked |
| 1174 | TMO (True Momentum Oscillator) | `tmo` | Momentum | own | Coulisnosaj | batch 15 |
| 1175 | Tom DeMark MACD | `td-macd` | Momentum | own |  |  |
| 1176 | TonyUX EMA Scalper | `tonyux-ema-scalper` | Oscillators | price |  |  |
| 1177 | Top & Bottom Candle | `top-bottom-candle` | Candlestick Patterns | own |  |  |
| 1178 | Tops/Bottoms | `tops-bottoms` | Oscillators | price |  |  |
| 1179 | TR High/Low meter | `tr-high-low-meter` | Momentum | own | dman103 | batch 10 |
| 1180 | Trade Price - Spread Compensator Overlay | `trade-price-spread-compensator-overlay` | Channels & Bands | price | The_Forex_Steward | batch 40 |
| 1181 | Trade Prime - Fluid Trend Indicator | `trade-prime-fluid-trend-indicator` | Trend | price | tradeprime01 | batch 31 |
| 1182 | Trader XO Macro Trend Scanner | `trader-xo` | Oscillators | price |  |  |
| 1183 | Traders Dynamic Index | `tdi-hlc-trix` | Oscillators | own |  |  |
| 1184 | Traders Reality Main | `traders-reality-main` | Trend | price | TradersReality | most liked |
| 1185 | Trading ABC | `trading-abc` | Trend | price | LonesomeTheBlue | most liked |
| 1186 | Trading Activity Index | `trading-activity-index` | Volume | own | Zeiierman | batch 2 |
| 1187 | Trading Gaul | `trading-gaul` | Trend | price | investment20223 | batch 26 |
| 1188 | TradingMoja / SQZMOM ADX | `tradingmoja-sqzmom-adx` | Momentum | own | Trading_Moja | batch 32 |
| 1189 | Transient Zones v1.1 | `transient-zones` | Channels & Bands | price | Jurij (community) |  |
| 1190 | Tremor Tracker | `tremor-tracker` | Volatility | own | TheUltimator5 | batch 19 |
| 1191 | Trend Channels With Liquidity Breaks | `trend-channels-with-liquidity-breaks` | Channels & Bands | price | ChartPrime | most liked |
| 1192 | Trend Direction Helper (ZigZag and S/R and HH/LL labels) | `trend-direction-helper` | Trend | price | Daveatt (zig zag by Ricardo Santos, pivot levels from Backtest Rookies) | most liked |
| 1193 | Trend Direction Zone | `trend-direction-zone` | Trend | price | MarketStructureLab | batch 16 |
| 1194 | Trend Double Pullbackv1.0 | `trend-double-pullback-v1-0` | Trend | price | puduxbt | batch 26 |
| 1195 | Trend Duration Forecast | `trend-duration-forecast` | Trend | price | ChartPrime | most liked |
| 1196 | Trend Filter (2-pole) | `trend-filter` | Trend | price | BigBeluga | batch 1 |
| 1197 | Trend Flow Oscillator (CMF + MFI) + ADX | `trend-flow-oscillator-adx` | Oscillators | own | WalrusQuant | batch 19 |
| 1198 | Trend Following Moving Averages | `trend-following-ma` | Moving Averages | price | LonesomeTheBlue |  |
| 1199 | Trend Heatmap | `trend-heatmap` | Trend | own | autocrp | batch 30 |
| 1200 | Trend Impulse Channels | `trend-impulse-channels` | Trend | price | Zeiierman |  |
| 1201 | Trend Indicator A-V2 (Smoothed Heikin Ashi Cloud) | `trend-indicator-a-v2` | Trend | price | DZIV | most liked |
| 1202 | Trend Levels | `trend-levels` | Trend | price | ChartPrime | most liked |
| 1203 | Trend Line Auto | `trend-line-auto` | Trend | price | HarryBot |  |
| 1204 | Trend Lines | `trend-lines` | Trend | price | LonesomeTheBlue | most liked |
| 1205 | Trend Lines v2 | `trend-lines-v2` | Trend | price | LonesomeTheBlue (Pine v4) |  |
| 1206 | Trend Magic | `trend-magic` | Trend | price |  |  |
| 1207 | Trend Predictor Ribbon Clone - Fixed roj karo moj karo | `trend-predictor-ribbon` | Trend | price | ronitjain18 | batch 6 |
| 1208 | Trend Pulse Oscillator | `trend-pulse-oscillator` | Oscillators | own | ChaosTrader63 | batch 35 |
| 1209 | Trend Regularity Adaptive MA | `trama` | Moving Averages | price | LuxAlgo |  |
| 1210 | Trend Scalper | `trend-scalper` | Moving Averages | price | abedmahmood | batch 35 |
| 1211 | Trend State Signals | `trend-state-signals` | Trend | price | MarketStructureLab | batch 4 |
| 1212 | Trend Strength/Direction | `trend-strength-direction` | Trend | own | ddcakez | batch 32 |
| 1213 | Trend Targets | `trend-targets` | Trend | price | AlgoAlpha | most liked |
| 1214 | Trend Trader Strategy | `trend-trader` | Trend | price |  |  |
| 1215 | Trend Trigger Factor | `trend-trigger-factor` | Oscillators | own |  |  |
| 1216 | Trend Type Indicator by BobRivera990 | `trend-type-indicator-by-bobrivera990` | Trend | own | BobRivera990 | most liked |
| 1217 | Trend Volatility Index (TVI) | `trend-volatility-index` | Volatility | own | chikaharu | batch 3 |
| 1218 | Trend with ADX/EMA - Buy & Sell Signals | `trend-with-adx-ema-buy-sell-signals` | Trend | price | RMPM | batch 28 |
| 1219 | Trend-Pro | `trend-pro` | Trend | price | andrwxwy | batch 38 |
| 1220 | TrendCylinder (Expo) | `trendcylinder` | Trend | price | Zeiierman | batch 4 |
| 1221 | Trending Market Toolkit | `trending-market-toolkit` | Trend | price | LuxAlgo | most liked |
| 1222 | Trendline Breakout Navigator | `trendline-breakout-navigator` | Trend | price | LuxAlgo | most liked |
| 1223 | Trendline Breakouts With Targets | `trendline-breakouts-with-targets` | Trend | price | ChartPrime | most liked |
| 1224 | Trendlines - JD | `trendlines-jd` | Trend | price | Duyck | most liked |
| 1225 | Trendlines with Breaks [LuxAlgo] | `trendlines-with-breaks` | Trend | price | LuxAlgo |  |
| 1226 | TrendMasterPro_Fekonomi | `trendmasterpro-fekonomi` | Trend | price | fekonomi | batch 20 |
| 1227 | Trendshift | `trendshift` | Trend | price | chervolino | batch 39 |
| 1228 | TrendShift Detector | `trendshift-detector` | Candlestick Patterns | price | GIANESELLI | batch 40 |
| 1229 | TRENDSYNC BUY/SELL BY SIMPLY_DANTE-FX | `trendsync-buy-sell-by-simply-dante-fx` | Trend | price | Simply_Dante-fx | batch 36 |
| 1230 | TrendWave Bands | `trendwave-bands` | Channels & Bands | price | BigBeluga | batch 1 |
| 1231 | Triangular MA Bands | `tma-bands` | Channels & Bands | price |  |  |
| 1232 | Triangular Momentum Oscillator | `triangular-momentum-osc` | Oscillators | own |  |  |
| 1233 | Trimmed Mean ATR Bands | `trimmed-mean-atr-bands` | Channels & Bands | price | CryptoNejc | batch 17 |
| 1234 | Triple Doji Sequence | `triple-doji-sequence` | Candlestick Patterns | price | Marc_Thiart | batch 39 |
| 1235 | Triple Gaussian Smoothed Ribbon | `triple-gaussian-smoothed-ribbon` | Trend | price | BOSWaves | batch 16 |
| 1236 | Triple MA For Loop | `triple-ma-for-loop` | Trend | own | SeerQuant | batch 7 |
| 1237 | Triple MA Forecast | `triple-ma-forecast` | Moving Averages | price | yatrader2 (community) |  |
| 1238 | Triple RSI \| MisinkoMaster | `triple-rsi-misinkomaster` | Momentum | own | MisinkoMaster | batch 19 |
| 1239 | True High/Low RSI for Divergence | `true-high-low-rsi-for-divergence` | Oscillators | own | Lakt_ | batch 29 |
| 1240 | True Range eXpansion | `true-range-expansion` | Volatility | price | Sherlock_MacGyver | batch 22 |
| 1241 | TTM Squeeze | `ttm-squeeze-greeny` | Momentum | own | Greeny | most liked |
| 1242 | TTM Squeeze Pro | `ttm-squeeze-pro` | Oscillators | own | John Carter |  |
| 1243 | TTrades Daily Bias | `ttrades-daily-bias` | Trend | price | tradeforopp | most liked |
| 1244 | Turtle Trade Channels | `turtle-trade-channels` | Channels & Bands | price | Richard Dennis / William Eckhardt |  |
| 1245 | Tweezers & Kangaroo Tail | `tweezers-kangaroo-tail` | Candlestick Patterns | price | LonesomeTheBlue |  |
| 1246 | Twin Range Filter | `twin-range-filter` | Trend | price | colinmck |  |
| 1247 | Ultimate Buy & Sell | `ultimate-buy-sell` | Trend | price |  |  |
| 1248 | Ultimate Moving Average-Multi-TimeFrame-7 MA Types | `ultimate-moving-average-mtf` | Moving Averages | price | ChrisMoody | most liked |
| 1249 | Ultimate Opening Range Breakout | `ultimate-opening-range-breakout` | Volatility | price | LuxAlgo | most liked |
| 1250 | Ultimate RSI [LuxAlgo] | `ultimate-rsi` | Momentum | own | LuxAlgo |  |
| 1251 | Ultra Clean Support / Resistance Levels | `ultra-clean-support-resistance-levels` | Trend | price | Stocktitian | batch 30 |
| 1252 | Ultra Smart Trail | `ultra-smart-trail` | Trend | price | Rathack | batch 18 |
| 1253 | UM EMA SMA WMA HMA with Directional Color Change | `um-ema-sma-wma-hma-with-directional-color-change` | Moving Averages | price | UnderwearMillionaire | batch 30 |
| 1254 | Unicorn Setup Detector (aziz abid) | `unicorn-setup-detector` | Trend | price | mohammedazizabid | batch 40 |
| 1255 | Universal Large Orders Proxy fabio valentini Chat gpt Recreation | `universal-large-orders-proxy-fabio-valentini-chat-gpt-recreation` | Volume | price | boss11233 | batch 18 |
| 1256 | Universal Signal Backtester | `universal-signal-backtester` | Trend | price | LuxAlgo | most liked |
| 1257 | Uptrick: Dynamic Z-Score Deviation | `uptrick-dynamic-z-score-deviation` | Trend | price | Uptrick | batch 6 |
| 1258 | Uptrick: Liquid Reversal Bands | `liquid-reversal-bands` | Channels & Bands | price | Uptrick | batch 3 |
| 1259 | Uptrick: MultiMA_Volume | `uptrick-multima-volume` | Moving Averages | price | Uptrick | batch 16 |
| 1260 | Uptrick: RSI MA Buying/Selling signals | `uptrick-rsi-ma-buying-selling-signals` | Momentum | own | Uptrick | batch 12 |
| 1261 | Uptrick: Trend Analysis | `uptrick-trend-analysis` | Momentum | own | Uptrick | batch 14 |
| 1262 | Uptrick: Volatility Reversion Bands | `uptrick-volatility-reversion-bands` | Channels & Bands | price | Uptrick | batch 4 |
| 1263 | Uptrick: Zero Lag HMA Trend Suite | `zero-lag-hma-trend-suite` | Moving Averages | price | Uptrick | batch 3 |
| 1264 | User Defined Range Selector and Color Changing EMA Line | `user-defined-range-selector-and-color-changing-ema-line` | Moving Averages | price | Crypto_Moses | batch 23 |
| 1265 | UT Bot | `ut-bot` | Trend | price |  |  |
| 1266 | Ut bot - Trend+volume | `ut-bot-trend-volume` | Trend | price | BhargavMeghnathi | batch 40 |
| 1267 | Vacuum Candles | `vacuum-candles` | Volume | price | XrayAlgo | batch 41 |
| 1268 | Variable Moving Average | `variable-ma` | Moving Averages | price | LazyBear |  |
| 1269 | VARIS Zones | `varis-zones` | Channels & Bands | price | IAmTheLiquidity2 | batch 17 |
| 1270 | VCO Fusion | `vco-fusion` | Oscillators | own | Uncle_the_shooter | batch 20 |
| 1271 | Vdub FX Sniper | `vdub-sniper` | Oscillators | price | Vdubus |  |
| 1272 | VDUB_BINARY_PRO_3_V2  FINAL + Strategy | `vdub-binary-pro-3-v2` | Channels & Bands | price | vdubus | most liked |
| 1273 | vdubus BinaryPro | `vdubus-binarypro` | Oscillators | price |  |  |
| 1274 | VEGA (Velocity of Efficient Gain Adaptation) | `vega` | Momentum | own | B3AR_Trades | batch 20 |
| 1275 | Vervoort HA LT Candlestick Oscillator | `vervoort-ha-oscillator` | Oscillators | own |  |  |
| 1276 | VIM (Volume in Money) | `vim` | Volume | own | tbtb1111 | batch 29 |
| 1277 | Visualisation tendances | `visualisation-tendances` | Trend | price | Benjamin69 | batch 17 |
| 1278 | Volatility & Big Market Moves | `volatility-big-market-moves` | Volatility | own | nilstrades_ | batch 24 |
| 1279 | Volatility Adaptive Filtered Trend | `volatility-adaptive-filtered-trend` | Trend | price | SchizoQuant | batch 6 |
| 1280 | Volatility Band Cloud with Overextension Signals | `volatility-band-cloud-with-overextension-signals` | Channels & Bands | price | Retire_by_50 | batch 35 |
| 1281 | Volatility Bands | `volatility-bands` | Channels & Bands | price | pmk07 | batch 23 |
| 1282 | Volatility Breakout Pulse (VBP FIX) | `volatility-breakout-pulse` | Channels & Bands | price | JohnsonForexTrader | batch 36 |
| 1283 | Volatility Channel Oscillator | `volatility-channel-oscillator` | Oscillators | own | Uncle_the_shooter | batch 3 |
| 1284 | Volatility Halo \| NAL | `volatility-halo-nal` | Volatility | price | NordicAlphaLab | batch 6 |
| 1285 | Volatility Quality | `volatility-quality` | Volatility | own | AlphaExtract | batch 18 |
| 1286 | Volatility-Driven VWAP Structure | `volatility-driven-vwap-structure` | Channels & Bands | price | Zeiierman | batch 3 |
| 1287 | Volatility-Gated Trend Oscillator | `volatility-gated-trend-oscillator` | Oscillators | own | QuantAlgo | batch 9 |
| 1288 | VOLD Ratio Histogram | `vold-ratio-histogram` | Volume | own | Th16rry | batch 23 |
| 1289 | Volumatic S/R Levels | `volumatic-sr-levels` | Trend | price | BigBeluga |  |
| 1290 | Volumatic Variable Index Dynamic Average | `volumatic-variable-index-dynamic-average` | Trend | price | BigBeluga | most liked |
| 1291 | Volume + RSI & MA Differential | `volume-rsi-ma-differential` | Volume | own | ozzy_livin | batch 7 |
| 1292 | Volume Accumulation Percentage | `volume-accumulation-pct` | Volume | own |  |  |
| 1293 | Volume Alert | `volume-alert` | Volume | price | oDouglasAlex | batch 42 |
| 1294 | Volume and Volatility Ratio Indicator-WODI | `volume-and-volatility-ratio-indicator-wodi` | Volume | own | W0DI | batch 16 |
| 1295 | Volume Bands | `volume-bands` | Channels & Bands | price | MisinkoMaster | batch 6 |
| 1296 | Volume Bar Breakout | `volume-bar-breakout` | Volume | price | tradeswithashish |  |
| 1297 | Volume bar range | `volume-bar-range` | Volume | price | pandorid | batch 25 |
| 1298 | Volume Bars Color | `volume-bars-color` | Volume | own | Evgenyc111 | batch 20 |
| 1299 | Volume Buy/Sell Split | `volume-buy-sell-split` | Volume | own | LHAMA-Trading | batch 26 |
| 1300 | Volume Candle Coloring v5 (BARCOLOR STABLE) | `volume-candle-coloring-v5` | Volume | price | sugogou | batch 37 |
| 1301 | Volume Candle Highlighter | `volume-candle-highlighter` | Volume | price | Dougie_dee | batch 5 |
| 1302 | Volume Candles | `volume-candles` | Volume | price | alexrainman | batch 39 |
| 1303 | Volume Colored Bars | `volume-colored-bars` | Volume | own |  |  |
| 1304 | Volume Comparison with Buyer/Seller Pressure | `volume-comparison-with-buyer-seller-pressure` | Volume | own | ask2maniish | batch 26 |
| 1305 | Volume Divergence | `volume-divergence` | Volume | own | baymucuk |  |
| 1306 | Volume Flow Indicator | `volume-flow-indicator` | Volume | own |  |  |
| 1307 | Volume Flow v3 | `volume-flow-v3` | Volume | own | DepthHouse / oh92 (community) |  |
| 1308 | Volume Footprint | `volume-footprint` | Volume | price | LuxAlgo |  |
| 1309 | Volume Gaps & Imbalances | `volume-gaps-imbalances` | Volume | price | Zeiierman | most liked |
| 1310 | Volume LinReg Trend | `volume-linreg-trend` | Volume | own | LonesomeTheBlue |  |
| 1311 | Volume Order Blocks | `volume-order-blocks` | Volume | price | BigBeluga | most liked |
| 1312 | Volume Orderbook (Expo) | `volume-orderbook` | Volume | price | Zeiierman | most liked |
| 1313 | Volume Positive Negative (VPN) | `volume-positive-negative` | Volume | own | LevelUpTools | batch 2 |
| 1314 | Volume Price Confirmation Indicator | `vpci` | Volume | own |  |  |
| 1315 | Volume Profile | `volume-profile` | Volume | price | LuxAlgo | most liked |
| 1316 | Volume Profile + Pivot Levels | `volume-profile-pivot-levels` | Volume | price | ChartPrime | most liked |
| 1317 | Volume Profile / Fixed Range | `volume-profile-fixed-range` | Volume | price | LonesomeTheBlue | most liked |
| 1318 | Volume Profile Free Ultra SLI (100 Levels Value Area VWAP) - RRB | `volume-profile-free-ultra-sli` | Volume | price | RagingRocketBull | most liked |
| 1319 | Volume Profile Heatmap | `volume-profile-heatmap` | Volume | price | KeyAlgos | batch 13 |
| 1320 | Volume Profile per day with support/resistance lines | `volume-profile-per-day-with-support` | Volume | price | juliangonzaconde | most liked |
| 1321 | Volume Profile, Pivot Anchored by DGT | `volume-profile-pivot-anchored` | Volume | price | dgtrd | most liked |
| 1322 | Volume Sentiment Breakout Channels | `volume-sentiment-breakout-channels` | Channels & Bands | price | AlgoAlpha | most liked |
| 1323 | Volume Spike and Contraction Indicator | `volume-spike-and-contraction-indicator` | Volume | price | epicurusMcPot | batch 41 |
| 1324 | Volume Spike Indicator | `volume-spike-indicator` | Volume | price | rikyu04 | batch 42 |
| 1325 | Volume Suite - By Leviathan (CVD, Volume Delta, Relative Volume) | `volume-suite-by-leviathan` | Volume | own | LeviathanCapital | most liked |
| 1326 | Volume SuperTrend AI | `volume-supertrend-ai` | Trend | price |  |  |
| 1327 | Volume Surge Detector | `volume-surge-detector` | Volume | own | SpeculationLab | batch 19 |
| 1328 | Volume Variation Index Indicator | `volume-variation-index-indicator` | Volume | own | thequantscience | batch 35 |
| 1329 | Volume Weighted MACD V2 | `vw-macd-v2` | Momentum | own |  |  |
| 1330 | Volume Weighted Median Price (VWMP) | `volume-weighted-median-price` | Moving Averages | price | vsov | batch 14 |
| 1331 | Volume Weighted RSI (VW RSI) | `volume-weighted-rsi` | Momentum | own | CsokosGeza | batch 34 |
| 1332 | Volume Weighted Trend | `volume-weighted-trend` | Trend | price | QuantAlgo | batch 1 |
| 1333 | Volume with Alert | `volume-with-alert` | Volume | own | BullBearSR | batch 30 |
| 1334 | Volume with EMA and Coloring Rules | `volume-with-ema-and-coloring-rules` | Volume | own | itisfilipe | batch 37 |
| 1335 | Volume-Based Moving Average | `volume-based-moving-average` | Moving Averages | price | The_Forex_Steward | batch 36 |
| 1336 | Volume-Based RSI Color Indicator with MAs | `volume-based-rsi-color-indicator-with-mas` | Oscillators | own | Riccardo02 | batch 32 |
| 1337 | Volume-based Support & Resistance Zones | `volume-based-support-resistance-zones` | Volume | price | tommyf1001 | most liked |
| 1338 | Volume-Gated Trend Ribbon | `volume-gated-trend-ribbon` | Trend | price | QuantAlgo | batch 3 |
| 1339 | Volume-Trend Order Block Engine | `volume-trend-order-block-engine` | Trend | price | BigBeluga | most liked |
| 1340 | Volume-Weighted MA Crossover | `volume-weighted-ma-crossover` | Moving Averages | price | AlphaNatt | batch 9 |
| 1341 | Volume-Weighted Money Flow | `volume-weighted-money-flow` | Volume | own | sgbpulse | batch 33 |
| 1342 | Volume-Weighted Pivot Bands | `volume-weighted-pivot-bands` | Channels & Bands | price | LeafAlgo | batch 33 |
| 1343 | Volume-Weighted Price Z-Score | `volume-weighted-price-z-score` | Oscillators | own | QuantAlgo | batch 6 |
| 1344 | Volumetric Compressed MA | `volumetric-compressed-ma` | Moving Averages | price | serkany88 | batch 14 |
| 1345 | Volumetric Entropy Index | `volumetric-entropy-index` | Volume | own | Sherlock_MacGyver | batch 27 |
| 1346 | Volumetric Tensegrity | `volumetric-tensegrity` | Volume | own | TheLeadingIndicator | batch 30 |
| 1347 | VolVol | `volvol` | Volume | price | kunalgolani | batch 26 |
| 1348 | Vortex Pro with Moving average | `vortex-pro-with-moving-average` | Oscillators | own | pointalgo | batch 25 |
| 1349 | Voss Predictive Filter | `voss-predictive-filter` | Oscillators | own | e2e4 | batch 8 |
| 1350 | VPSA-VTD | `vpsa-vtd` | Volume | own | CatTheTrader | batch 11 |
| 1351 | Vulkan Profit | `vulkan-profit` | Trend | price | AlgoCollective | batch 33 |
| 1352 | VuManChu Swing Free | `vumanchu-swing` | Trend | price |  |  |
| 1353 | VWAP & Dual MA Ribbon Tracker Pro | `vwap-dual-ma-ribbon-tracker-pro` | Trend | own | Simon20cent | batch 19 |
| 1354 | VWAP Deviation Oscillator | `vwap-deviation-oscillator` | Oscillators | own | BackQuant | batch 9 |
| 1355 | VWAP Predictive Breakout + RSI + OB + Trend/Chop | `vwap-predictive-breakout-rsi-ob-trend-chop` | Volume | price | Viggy02 | batch 31 |
| 1356 | VWAP Stdev Bands v2 Mod | `vwap-stdev-bands-v2-mod` | Channels & Bands | price | TheYangGuizi | most liked |
| 1357 | VWAP/MVWAP/EMA Crossover | `vwap-mvwap-ema-crossover` | Trend | price | DerrickLaFlame |  |
| 1358 | VWMA/SMA Delta Volatility (Statistical Anomaly Detector) | `vwma-sma-delta-volatility` | Volatility | own | tkarolak | batch 14 |
| 1359 | VWMACD & SZO | `vwmacd-szo` | Momentum | own |  |  |
| 1360 | VWMACD-MFI-OBV Composite | `vwmacd-mfi-obv-composite` | Volume | own | munair | batch 27 |
| 1361 | VWRSI Crossovers & Extremes | `vwrsi-crossovers-extremes` | Momentum | own | TheAITradingDesk | batch 35 |
| 1362 | Waddah Attar Explosion | `waddah-attar-explosion` | Momentum | own | LazyBear/ShayanKM |  |
| 1363 | WAE Sniper Scalp XAUUSD M1 Tuned | `wae-sniper-scalp-xauusd-m1-tuned` | Momentum | own | khonthailoei19071983 | batch 19 |
| 1364 | Wave N + KDJ + Volumi + SMC + Ichimoku | `wave-n-kdj-volumi-smc-ichimoku` | Trend | price | Nikus63 | batch 31 |
| 1365 | WaveFunction MACD | `wavefunction-macd` | Momentum | own | TechnoBlooms | batch 27 |
| 1366 | Wavelet Filter with Adaptive Upsampling | `wavelet-filter-with-adaptive-upsampling` | Oscillators | own | BackQuant | batch 29 |
| 1367 | Wavelet Transform Trend | `wavelet-transform-trend` | Trend | price | QuantAlgo | batch 12 |
| 1368 | Wavelet-Trend ML Integration | `wavelet-trend-ml-integration` | Oscillators | own | AlphaExtract | batch 1 |
| 1369 | WaveTrend | `wavetrend` | Oscillators | own | LazyBear |  |
| 1370 | WaveTrend Oscillator | `wavetrend-oscillator` | Momentum | own | LazyBear |  |
| 1371 | Weierstrass Function (Fractal Cycles) | `weierstrass-function` | Oscillators | own | fract | batch 17 |
| 1372 | Weighted percentile nearest rank | `weighted-percentile-nearest-rank` | Moving Averages | price | gorx1 | batch 10 |
| 1373 | Weighted Regression Bands | `weighted-regression-bands` | Channels & Bands | price | Zeiierman | batch 5 |
| 1374 | Weis Wave Candle | `weis-wave-candle` | Trend | own | Uncle_the_shooter | batch 34 |
| 1375 | Weis Wave Volume | `weis-wave-volume` | Volume | own |  |  |
| 1376 | Whale Activity Impact Oscillator | `whale-activity-impact-oscillator` | Volume | own | mdeacey | batch 18 |
| 1377 | Whale Volume Absorption & Aggression @MaxMaserati 3.0 | `whale-volume-absorption-aggression-maxmaserati-3-0` | Volume | own | MaxMaserati | batch 22 |
| 1378 | Wick Volume Alert | `wick-volume-alert` | Candlestick Patterns | price | Shazam77 | batch 41 |
| 1379 | WICK.ED Fractals | `wicked-fractals` | Oscillators | price | Mit Nayi (community) |  |
| 1380 | Williams Alligator + Fractals | `williams-combo` | Trend | price | vlkvr (Pine v3) |  |
| 1381 | Williams BBDiv Signal | `williams-bbdiv-signal` | Oscillators | own | trade_lexx | batch 20 |
| 1382 | Williams Percent Range with Threshold | `williams-percent-range-with-threshold` | Oscillators | own | xdextra | batch 29 |
| 1383 | Williams Vix Fix | `williams-vix-fix` | Volatility | own | ChrisMoody |  |
| 1384 | WLSMA: fast approximation | `wlsma-fast-approximation` | Moving Averages | price | gorx1 | batch 33 |
| 1385 | Wyckoff Effort vs. Result | `wyckoff-effort-vs-result` | Volume | price | TradeTechanalysis | batch 34 |
| 1386 | x5-smooth-ema | `x5-smooth-ema` | Moving Averages | price | traderninezero | batch 19 |
| 1387 | XAUUSD Buy/Sell Alerts with SL & TP | `xauusd-buy-sell-alerts-with-sl-tp` | Moving Averages | price | alexandrossolomou1 | batch 8 |
| 1388 | XAUUSD Family Scalping (5min) | `xauusd-family-scalping` | Oscillators | price | cupra_inc | batch 8 |
| 1389 | Z-Score | `z-score` | Oscillators | own | joecalledher | batch 21 |
| 1390 | Z-Score Oscillator | `z-score-oscillator` | Oscillators | own | B3AR_Trades | batch 12 |
| 1391 | Z-Score STDEMA Bands | `z-score-stdema-bands` | Oscillators | own | TiagoTF | batch 24 |
| 1392 | Z-Score Trend Monitor | `z-score-trend-monitor` | Oscillators | own | EdgeTerminal | batch 31 |
| 1393 | Zero Lag EMA | `zero-lag-ema` | Moving Averages | price |  |  |
| 1394 | Zero Lag LSMA (ZLSMA) | `zlsma` | Moving Averages | price | veryfid |  |
| 1395 | Zero Lag MACD | `zero-lag-macd` | Momentum | own | AC (based on Glaz) |  |
| 1396 | Zero Lag Signals For Loop | `zero-lag-signals-for-loop` | Trend | price | QuantAlgo | batch 1 |
| 1397 | Zero Lag Trend Signals (MTF) | `zero-lag-trend-signals` | Trend | price | AlgoAlpha | most liked |
| 1398 | Zero-Lag GARCH Bands \| NAL | `zero-lag-garch-bands-nal` | Volatility | price | NordicAlphaLab | batch 12 |
| 1399 | Zig Zag Channels | `zig-zag-channels` | Channels & Bands | price | LuxAlgo | most liked |
| 1400 | ZigZag Multi Time Frame with Fibonacci Retracement | `zigzag-multi-time-frame-with-fibonacci` | Trend | price | LonesomeTheBlue | most liked |
| 1401 | ZigZag Percent Reversal - Forecast - patterns - labels | `zigzag-percent-reversal-forecast-patterns` | Trend | price | RicardoSantos | most liked |
| 1402 | ZigZag with Fibonacci Levels | `zigzag-fibonacci` | Trend | price | LonesomeTheBlue |  |
| 1403 | ZVOL - Z-Score Volume Heatmap | `zvol-z-score-volume-heatmap` | Volume | own | TheLeadingIndicator | batch 28 |
| 1404 | 🌊 ALMA Bands | `alma-bands` | Moving Averages | price | B3AR_Trades | batch 26 |
