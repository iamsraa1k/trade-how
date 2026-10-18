// Evening checks for a live (or manual paper) open position, from daily candles. Produces the actions
// "Managing the trade" asks for, so the evening routine can be a message instead of a chart session.

import type { Trade } from "@/lib/db"
import { addTradingDays, tradingDaysBetween } from "@/features/constitution/lib/engine"
import { emaSeries, type Candle } from "./scanner"

export interface PositionCheck {
    symbol: string
    rNow: number | null
    close: number | null
    actions: string[]
    notes: string[]
}

const rs = (n: number) => `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`

export function checkOpenPosition(trade: Trade, candles: Candle[], asOf: string, resultsDate: string | null): PositionCheck {
    const out: PositionCheck = { symbol: trade.symbol, rNow: null, close: null, actions: [], notes: [] }
    const upto = candles.filter(c => c.date <= asOf)
    const last = upto[upto.length - 1]
    if (!last) {
        out.notes.push("No market data for this symbol.")
        return out
    }
    out.close = last.close
    const after = (date: string) => upto.filter(c => c.date > date)

    // Buy GTT not filled yet.
    if (!trade.entryPrice) {
        const expiry = addTradingDays(trade.date, 3)
        const triggered = trade.trigger ? after(trade.date).find(c => c.date <= expiry && c.high >= trade.trigger!) : undefined
        if (triggered) {
            out.actions.push(`Trigger ${rs(trade.trigger!)} was reached on ${triggered.date}. If the GTT filled, record the fill and place the stop GTT at ${rs(trade.stopPrice || 0)} now.`)
        } else if (asOf > expiry) {
            out.actions.push(`3 trading days passed without a trigger: delete the buy GTT and the plan.`)
        } else {
            out.notes.push(`Buy GTT waiting: trigger ${rs(trade.trigger || 0)}, valid through ${expiry}.`)
        }
        return out
    }

    const entry = trade.entryPrice
    const stop = trade.stopPrice
    if (!stop || stop >= entry) {
        out.actions.push("No valid stop recorded. Place the stop GTT and update the trade (Level 3 if it was never placed).")
        return out
    }
    const r = entry - stop
    out.rNow = (last.close - entry) / r
    const since = after(trade.date)

    const stopHit = since.find(c => c.low <= stop)
    if (stopHit) {
        out.actions.push(`Price reached the stop on ${stopHit.date}. Confirm the stop GTT sold (gap protocol), then close the trade in the journal.`)
        return out
    }

    const closes = upto.map(c => c.close)
    const ema20 = emaSeries(closes, 20)[closes.length - 1]
    const beHit = since.find(c => c.close >= entry + 1.5 * r)
    const trailArmed = since.find(c => c.close >= entry + 2 * r)
    const aboveOneR = since.some(c => c.close > entry + r)
    const held = tradingDaysBetween(trade.date, asOf)

    if (trailArmed && ema20 !== null && last.close < ema20) {
        out.actions.push(`Trail exit: closed ${rs(last.close)}, below the 20-day EMA (${rs(ema20)}). Place a market AMO sell (CNC, full quantity) tonight.`)
    } else if (beHit) {
        out.notes.push(`Breakeven level reached on ${beHit.date}: the stop GTT should be at your entry ${rs(entry)}.`)
        if (beHit.date === asOf) out.actions.push(`Closed above +1.5R today: move the stop GTT up to ${rs(entry)}.`)
    }
    if (trailArmed && !(ema20 !== null && last.close < ema20)) {
        out.notes.push(`Trail active since ${trailArmed.date}: exit on the first close below the 20-day EMA (now ${rs(ema20 ?? 0)}).`)
    }
    if (!aboveOneR && held >= 15) {
        out.actions.push(`Time stop: ${held} trading days without a close above +1R (${rs(entry + r)}). Sell at the next open (AMO).`)
    } else if (!aboveOneR) {
        out.notes.push(`Day ${held} of 15; needs a close above ${rs(entry + r)} to stay.`)
    }
    if (resultsDate) {
        const toResults = tradingDaysBetween(asOf, resultsDate)
        if (toResults > 0 && toResults <= 2) {
            out.actions.push(out.rNow >= 2
                ? `Results on ${resultsDate}: up ${out.rNow.toFixed(1)}R, so sell half at the open before results and keep the stop at breakeven on the rest.`
                : `Results on ${resultsDate}: exit at the open of the trading day before (place the AMO the evening before).`)
        }
    }
    return out
}
