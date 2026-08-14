# Trader Stocks

Build a web app called [SHARPS] — a trading platform where users invest in on-chain crypto traders ("KOLs") as if they were stocks. The core concept: each KOL has a live stock price that rises and falls based purely on how well they perform at on-chain trading. Good trades pump their stock, bad trades dump it. Users buy and sell shares of traders they believe in — like scouting talent early.

Tone: sharp, financial, Wall-Street-meets-crypto. Think Bloomberg terminal energy but for degens. Dark theme, tickers, live-price aesthetic, monospace numbers, green/red price movement. Confident and slightly irreverent, not corporate.

Build these pages:

Landing page — hero explaining "Invest in traders like stocks. Their on-chain performance is their share price." A live-looking ticker tape of KOLs and % moves. A "How it works" section (3 steps: pick a trader, buy their stock, their trading performance moves your bag). A leaderboard preview.

Market page — a grid/list of all listed KOLs, each as a stock card: name, avatar, current price in USD (just like a normal stock) , 24h % change, sparkline chart, market cap. Sortable by price, gainers, losers, volume.

KOL detail page — big price chart, buy/sell panel (with a "Connect Wallet" button), the trader's performance stats (win rate, PnL, volume, trades), and a holder count.

Leaderboard page — ranked list of KOLs by market cap and by performance score.

Portfolio page — shows the user's holdings, entry price, current value, P&L.

Use realistic mock data for now (10–12 fake KOLs with names, prices, charts). Make the buy/sell flow simulated (updates local state, no real transactions yet) — I'll wire the real Solana program in later. Include a "Connect Wallet" button (Phantom-style) that's a placeholder for now.

Website should be top notch, and extremely professional and professional branded. make this the most professional website you have ever made. add cool animations that look fantastic where you think they need to be added.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://kol-stocks-trading.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/5a016cde-af7f-4735-a0f3-cbf6d77f7d95).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
