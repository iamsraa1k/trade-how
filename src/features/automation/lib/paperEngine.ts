// Simulates a Momentum Breakout trade one daily candle at a time, using the constitution's backtest rules
// (Validation path, Stage 1) so paper results can be compared with the backtest:
//   Entry  — within 3 trading days, only if the high reaches the trigger; fill at the trigger, or at the open if it
//            opens above it; no fill if it opens above the limit.
//   Stops  — if a day opens at or below the stop, exit at the open; otherwise if the low touches it, exit at the stop.
//   Exits  — breakeven at +1.5R, 20-EMA trail after +2R, 15-day time stop and the results rule, each decided on a
//            close and executed at the next open.
//   Costs  — 0.1% STT each side, 0.015% stamp duty on the buy, ₹15.34 per sale, and 0.1% slippage each side.

import type { Candle } from "./scanner"

export type PaperExitReason = "stop" | "breakeven" | "trail" | "time" | "results"

export interface PaperState {
    trigger: number
    limit: number
    stop: number            // initial stop: defines R
    currentStop: number     // moves up to entry at breakeven, never down
    quantity: number
    signalDate: string
    gttExpiry: string       // last trading day the buy GTT may trigger
    fillDate: string | null
    entry: number | null
    trailActive: boolean
    everAbovePlusOneR: boolean
    pendingExit: PaperExitReason | null
    sessionsHeld: number
    resultsDate: string | null
    lastProcessedDate: string
}

export type PaperEvent =
    | { type: "filled"; date: string; price: number }
    | { type: "expired"; date: string }
    | { type: "missed"; date: string; open: number }
    | { type: "breakeven"; date: string; stop: number }
    | { type: "trail-armed"; date: string }
    | { type: "exit-tomorrow"; date: string; reason: PaperExitReason }
    | { type: "closed"; date: string; price: number; reason: PaperExitReason; pnl: number; fees: number }

const SLIPPAGE = 0.001

export function roundTripFees(entry: number, exit: number, quantity: number) {
    const buy = entry * quantity
    const sell = exit * quantity
    return buy * 0.001 + buy * 0.00015 + sell * 0.001 + 15.34
}

/**
 * Advances the simulation by one session. `ema20` is the 20-day EMA at this session's close,
 * `tradingDaysToResults` the trading days from this session to the results date (null if unknown).
 * Returns the next state and what happened; `done` means the trade is finished (closed, expired or missed).
 */
export function stepPaper(state: PaperState, day: Candle, ema20: number | null, tradingDaysToResults: number | null): { state: PaperState; events: PaperEvent[]; done: boolean } {
    if (day.date <= state.lastProcessedDate) return { state, events: [], done: false }
    const s: PaperState = { ...state, lastProcessedDate: day.date }
    const events: PaperEvent[] = []

    const close = (rawPrice: number, reason: PaperExitReason) => {
        const price = rawPrice * (1 - SLIPPAGE)
        const fees = roundTripFees(s.entry!, price, s.quantity)
        const pnl = (price - s.entry!) * s.quantity - fees
        events.push({ type: "closed", date: day.date, price, reason, pnl, fees })
        return { state: s, events, done: true }
    }

    // Waiting for the buy GTT.
    if (s.entry === null) {
        if (day.date > s.gttExpiry) {
            events.push({ type: "expired", date: day.date })
            return { state: s, events, done: true }
        }
        if (day.open > s.limit) {
            events.push({ type: "missed", date: day.date, open: day.open })
            return { state: s, events, done: true }
        }
        if (day.high >= s.trigger) {
            s.entry = Math.min(Math.max(s.trigger, day.open) * (1 + SLIPPAGE), s.limit)
            s.fillDate = day.date
            events.push({ type: "filled", date: day.date, price: s.entry })
            // The stop GTT goes in after the fill notification, so the fill day itself isn't stop-checked.
        }
        return { state: s, events, done: false }
    }

    s.sessionsHeld += 1
    const exitReasonForStop: PaperExitReason = s.currentStop >= s.entry ? "breakeven" : "stop"

    if (s.pendingExit) return close(day.open, s.pendingExit)
    if (day.open <= s.currentStop) return close(day.open, exitReasonForStop)
    if (day.low <= s.currentStop) return close(s.currentStop, exitReasonForStop)

    // End-of-day decisions, executed at the next open.
    const r = s.entry - s.stop
    if (s.trailActive && ema20 !== null && day.close < ema20) {
        s.pendingExit = "trail"
    }
    if (!s.trailActive && day.close >= s.entry + 2 * r) {
        s.trailActive = true
        events.push({ type: "trail-armed", date: day.date })
    }
    if (s.currentStop < s.entry && day.close >= s.entry + 1.5 * r) {
        s.currentStop = s.entry
        events.push({ type: "breakeven", date: day.date, stop: s.currentStop })
    }
    if (day.close > s.entry + r) s.everAbovePlusOneR = true
    if (!s.pendingExit && s.sessionsHeld >= 15 && !s.everAbovePlusOneR) {
        s.pendingExit = "time"
    }
    // Results rule: exit at the open of the trading day before results. Above +2R, keep it with the stop at
    // breakeven instead (the half-sale isn't simulated).
    if (!s.pendingExit && tradingDaysToResults !== null && tradingDaysToResults > 0 && tradingDaysToResults <= 2) {
        if (day.close >= s.entry + 2 * r) s.currentStop = Math.max(s.currentStop, s.entry)
        else s.pendingExit = "results"
    }
    if (s.pendingExit) events.push({ type: "exit-tomorrow", date: day.date, reason: s.pendingExit })

    return { state: s, events, done: false }
}
