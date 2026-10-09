---
title: "Norbert's gambit at Wealthsimple, how to journal DLR to DLR.U"
tags: [personal/investments, reference]
created: 2026-10-09
updated: 2026-10-09
status: active
type: reference
personal: investments
---

# Norbert's gambit at Wealthsimple

How to convert CAD to USD inside a Wealthsimple account without the 1.5% conversion fee. First done on 2026-10-09 in the self directed RRSP, and the details below come from that run.

## When it pays

| Method | Cost |
|---|---|
| App Convert button | 1.5% on top of Wealthsimple's corporate rate, instant |
| Norbert's gambit | $9.95 CAD journal fee plus tax ($1.29 HST, so $11.24), plus about 0.1% of spread on each trade, about two business days |

The breakeven is about $900. Below that, use the Convert button or skip converting. Recurring small deposits (the $500 per pay RRSP automation) should be batched into one journal a quarter, not converted one by one.

Converting is worth it when the USD buys U.S. listed ETFs inside the RRSP (VOO, VTI), which avoid the 15% U.S. withholding tax on dividends that VFV loses. Inside a TFSA that withholding applies either way, so the case is weaker there.

## Requirements

- The account has its USD side turned on. Free on Premium.
- Enough CAD cash left after the DLR buy to pay the $11.24 fee, or the request can fail.
- The website, my.wealthsimple.com. The app has no Journal option.

## Steps

1. Pick the right account (RRSP, TFSA) before trading. The journal stays inside that account.
2. Search DLR (Global X US Dollar Currency ETF, the CAD listing, not DLR.U).
3. Buy DLR with a limit order at the ask, after 10:00 ET. Fractional shares are fine: the 2026-10-09 journal took 485.8378 shares.
4. Once it fills, open DLR's security details and select **Journal**.
5. Enter every DLR share, select **Next**, check the account and quantity, then **Submit**.
6. The request shows as Pending under activity, with a processing date and a Cancel request button. Leave it alone.
7. When DLR.U appears in the account (about two business days, longer over a statutory holiday), open it after 10:00 ET and sell all of it with a limit order at the bid. Proceeds land as USD cash.

Reverse the steps, starting from DLR.U, to convert USD back to CAD.

## Timing

Buy DLR and submit the journal on the same day. While pending, DLR tracks USD/CAD, so the exposure is the exchange rate, not the stock market. Check the TSX holiday calendar: a holiday inside the two business days pushes the date. The 2026-10-09 (Friday) journal was dated 2026-10-14 because of Thanksgiving on 2026-10-12.

There is no point timing the exchange rate. Waiting only leaves the cash idle.

## Journal history

| Submitted | Account | Shares | Estimated USD | Fee | Ready | Sold |
|---|---|---:|---:|---:|---|---|
| 2026-10-09 | RRSP (self directed) | 485.8378 DLR | $4,902.10 | $11.24 CAD | 2026-10-14 | pending |

Source: [Wealthsimple help, Convert currency with Norbert's Gambit](https://help.wealthsimple.com/hc/en-ca/articles/45418222943131-Convert-currency-with-Norbert-s-Gambit)

Related: [[advice-lessons]] · [[2026-10-01-allocation-and-rrsp-plan]] · [[README]] · [[../log/2026-10-09|log 2026-10-09]]
