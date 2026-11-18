# BTC Race Bot — btc-race-24h-20261118-1444

A mean-reversion trading bot for Coinbase Wrapped BTC (CBBTC) against USDC, built
for the [make.fun competition](https://make.fun/bounty/btc-race-24h-20261118-1444)
"Race a BTC trading bot live for 24 hours". It trades paper money on 1-minute
bars from the CBBTC/USDC Orca Whirlpool on Solana.

## Strategy

Bitcoin's 1-minute noise whipsaws fast systems, and a full-size round trip costs
roughly 30 bps in fees, slippage and pool impact, so the bot trades rarely and
only when the expected reversion is far larger than that cost:

- **Buy all-in** when the close dips **1.2% below** the 120-bar (2-hour) simple
  moving average of closes.
- **Sell everything** when the close recovers to **0.9% above** that average.
- **Waterfall guard:** sell everything if the position falls **1.5% under** its cost.
- **No new buys in the final hour** of the 24-hour window — there is no time left
  for a reversion to play out before the final flatten.
- Long only, at most one open position, at most 16 orders per reply, fully
  deterministic (every decision is a pure function of the bars seen, integer
  arithmetic throughout).

## Files

- `main.ts` — the bot (Node 22, erasable TypeScript).
- `vendor/makefun-bars.ts` — the kit's protocol shim, copied byte-for-byte.

## Local dev grade

On the kit's frozen 24-hour dev window: **net PnL +13.64 USDC** (2 trades,
win rate 1.0, max drawdown 0.65%, 0 rejected orders; +12.83 USDC at 2x fees).

## License

MIT — see `LICENSE`.
