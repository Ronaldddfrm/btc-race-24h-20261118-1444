// btc-race-24h-20261118-1444: a mean-reversion bot for CBBTC/USDC on 1-minute bars.
//
// Idea: Bitcoin's 1-minute noise whipsaws fast systems, and a full-size round trip
// costs roughly 30 bps in fees, slippage and pool impact, so this bot trades rarely
// and only when the expected reversion is far larger than that cost. It watches the
// 2-hour (120-bar) simple moving average of closes: when the close dips 1.2% below
// that average it buys all-in, and it sells everything when the close recovers to
// 0.9% above the average. A waterfall guard sells everything if the position falls
// 1.5% under its cost. It never buys in the final hour of the window, because there
// is no time left for a reversion to play out before the final flatten. Long only,
// one open position at most, fully deterministic: every decision is a pure function
// of the bars seen, with integer arithmetic throughout.
//
// Parameters were tuned on the kit's frozen 24h dev window and chosen for robustness
// (they win on both halves of that window, not just on the full window): the prose
// draft (240-bar average, 0.8% dip, 0.4% exit) lost money on the dev window, so the
// dip was widened to 1.2% and the average shortened to 120 bars, which is where the
// real bounces in this market live.

import { runBars } from './vendor/makefun-bars.ts';
import type { BarsState, Batch, OrderInput } from './vendor/makefun-bars.ts';

const SYMBOL = 'CBBTC';
const SMA_BARS = 120; // 2-hour simple moving average of closes
const DIP_NUM = 988; // buy when close * 1000 < sma * 988 (1.2% below the average)
const EXIT_NUM = 1009; // sell when close * 1000 > sma * 1009 (0.9% above the average)
const STOP_NUM = 985; // sell when position value * 1000 < cost * 985 (1.5% under cost)
const MIN_BARS = 60; // minimum bars of history before the first trade
const TOTAL_BARS = 1440; // scored window length: 24h of 1-minute bars
const NO_BUY_AFTER = TOTAL_BARS - 60; // no new buys in the final hour
const MAX_SLIPPAGE_BPS = 200; // generous bound; the fill model charges ~2 bps + impact

// Rolling window of closes (raw units, price_scale 5) and their running sum.
const closes: bigint[] = [];
let rollingSum = 0n;

function average(): bigint | null {
  if (closes.length < SMA_BARS) return null;
  return rollingSum / BigInt(SMA_BARS);
}

await runBars({
  onBatch(state: BarsState, _batch: Batch): OrderInput[] {
    const bar = state.latest.get(SYMBOL);
    if (bar === undefined) return [];
    const close = BigInt(bar.c);
    closes.push(close);
    rollingSum += close;
    if (closes.length > SMA_BARS) {
      rollingSum -= closes[closes.length - SMA_BARS - 1];
    }
    if (state.warmingUp) return [];
    if (closes.length < Math.max(MIN_BARS, SMA_BARS)) return [];
    const avg = average();
    if (avg === null || avg === 0n) return [];
    const scoredIdx = state.seq - state.warmupBars;
    const pos = state.positions.get(SYMBOL);
    if (pos === undefined || pos.qty === 0n) {
      // Flat: buy all-in on a dip below the average, unless the window is nearly over.
      if (scoredIdx >= NO_BUY_AFTER) return [];
      if (close * 1000n < avg * BigInt(DIP_NUM)) {
        const room = state.weightRoom(SYMBOL);
        const spend = state.cash < room ? state.cash : room;
        if (spend <= 0n) return [];
        return [
          {
            side: 'buy',
            symbol: SYMBOL,
            notional_quote_units: spend,
            max_slippage_bps: MAX_SLIPPAGE_BPS,
          },
        ];
      }
      return [];
    }
    // Holding: sell everything on recovery above the average, or on the waterfall guard.
    const value = state.value(SYMBOL, pos.qty);
    if (close * 1000n > avg * BigInt(EXIT_NUM) || value * 1000n < pos.cost * BigInt(STOP_NUM)) {
      return [
        {
          side: 'sell',
          symbol: SYMBOL,
          qty: pos.qty,
          max_slippage_bps: MAX_SLIPPAGE_BPS,
        },
      ];
    }
    return [];
  },
});
