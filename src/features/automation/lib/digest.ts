// Builds the evening Telegram message (HTML). Pure: everything it shows is passed in.

import { format, parseISO } from "date-fns"
import type { ScanResult, ScanStock } from "@/lib/db"
import type { ConstitutionStatus, SizingResult } from "@/features/constitution/lib/engine"
import { MAX_OPEN_POSITIONS, PHASES } from "@/features/constitution/lib/rules"
import { capitalise, readSetup } from "./analysis"
import { escapeHtml } from "./telegram"
import type { PositionCheck } from "./tracking"

export interface SignalDecision {
    stock: ScanStock
    sizing: SizingResult | null
    take: boolean
    verdict: string
}

export interface OpenAutoPosition {
    symbol: string
    pending: boolean
    trigger: number
    gttExpiry: string
    entry: number
    stop: number
    currentStop: number
    close: number | null
    rNow: number | null
}

export interface DailyDigestInput {
    asOf: string
    scan: ScanResult
    decisions: SignalDecision[]
    autopilotLines: string[]
    openAuto: OpenAutoPosition[]
    manualChecks: (PositionCheck & { paper: boolean })[]
    status: ConstitutionStatus
    appUrl: string
}

export const inr = (n: number, digits = 0) => `₹${n.toLocaleString("en-IN", { maximumFractionDigits: digits })}`
export const signedInr = (n: number) => `${n >= 0 ? "+" : "−"}${inr(Math.abs(n))}`
export const fmtR = (r: number | null) => (r === null ? "—" : `${r >= 0 ? "+" : ""}${r.toFixed(2)}R`)
export const shortDate = (iso: string) => format(parseISO(iso), "d MMM")

const MAX_DETAILED = 10

function breakoutBlock(d: SignalDecision, index: number): string[] {
    const s = d.stock
    const read = readSetup(s, d.sizing?.stopDistancePct)
    const change = s.changePct !== undefined ? ` (${s.changePct >= 0 ? "+" : ""}${s.changePct.toFixed(1)}%)` : ""
    const lines = [
        `<b>${index}. ${escapeHtml(s.symbol)}</b> · ${escapeHtml(s.sector)}`,
        `Close ${inr(s.close, 2)}${change} · volume ${s.volumeRatio}× · ${s.baseWeeks}-week base, ${s.baseRangePct}% range`,
    ]
    if (read.strengths.length) lines.push(`✅ ${escapeHtml(capitalise(read.strengths.join("; ")))}`)
    if (read.cautions.length) lines.push(`⚠️ ${escapeHtml(capitalise(read.cautions.join("; ")))}`)
    if (d.sizing && !d.sizing.skip) {
        const z = d.sizing
        lines.push(`Plan: buy above ${inr(z.trigger, 1)} (limit ${inr(z.limit, 1)}) · stop ${inr(z.stop, 1)} (${z.stopDistancePct.toFixed(1)}%) · ${z.shares} shares · risk ${inr(z.rupeeRisk)}`)
    }
    lines.push(`Results: ${s.resultsDate ? shortDate(s.resultsDate) : "not announced yet"}`)
    lines.push(`${d.take ? "➡️" : "⛔"} ${escapeHtml(d.verdict)}`)
    return lines
}

export function composeDailyDigest(input: DailyDigestInput): string {
    const { scan, status } = input
    const l = scan.marketLight
    const gap = ((l.close - l.sma200) / l.sma200) * 100
    const out: string[] = [`<b>TradeHow · ${format(parseISO(input.asOf), "EEE d MMM")}</b>`]

    out.push(l.green
        ? `🟢 <b>Market light GREEN</b>: Nifty ${l.close.toLocaleString("en-IN")} is ${gap.toFixed(1)}% above its 200-day average (${Math.round(l.sma200).toLocaleString("en-IN")}). New buys allowed.`
        : `🔴 <b>Market light RED</b>: Nifty ${l.close.toLocaleString("en-IN")} is ${Math.abs(gap).toFixed(1)}% below its 200-day average (${Math.round(l.sma200).toLocaleString("en-IN")}). No new buys tonight.`)

    // Breakouts, with the analysis and what Autopilot did about each one.
    out.push("", `<b>📈 Breakouts today: ${scan.breakouts.length}</b> (of ${scan.universeSize} stocks scanned)`)
    if (input.decisions.length === 0) {
        out.push("No stock broke out today. Most days look like this.")
    } else {
        const sectors = [...new Set(input.decisions.map(d => d.stock.sector))]
        if (input.decisions.length > 1) out.push(`Sectors: ${escapeHtml(sectors.join(", "))}`)
        input.decisions.slice(0, MAX_DETAILED).forEach((d, i) => out.push("", ...breakoutBlock(d, i + 1)))
        const rest = input.decisions.slice(MAX_DETAILED)
        if (rest.length) out.push("", `Also broke out: ${escapeHtml(rest.map(d => d.stock.symbol).join(", "))}`)
    }

    // Strong stocks sitting in tight bases, nearest to their breakout level first.
    const near = scan.bases.filter(b => b.pctToBreakout !== undefined).slice(0, 6)
    if (near.length) {
        out.push("", "<b>👀 Close to breaking out</b>")
        for (const b of near) {
            const distance = b.pctToBreakout! < 0.1 ? "right at" : `${b.pctToBreakout!.toFixed(1)}% below`
            out.push(`• <b>${escapeHtml(b.symbol)}</b> ${distance} its base top ${inr(b.baseHigh ?? b.high, 1)} · ${b.baseRangePct}% range · ${b.baseWeeks}w`)
        }
    }

    out.push("", "<b>🤖 Autopilot today</b>")
    if (input.autopilotLines.length) out.push(...input.autopilotLines.map(line => `• ${line}`))
    else out.push("No buys, sells or stop changes.")

    if (input.openAuto.length) {
        const holding = input.openAuto.filter(p => !p.pending)
        out.push("", `<b>📂 Open paper positions</b> (${holding.length}/${MAX_OPEN_POSITIONS} held${input.openAuto.length > holding.length ? `, ${input.openAuto.length - holding.length} waiting to buy` : ""})`)
        for (const p of input.openAuto) {
            if (p.pending) {
                out.push(`• <b>${escapeHtml(p.symbol)}</b> waiting: buys above ${inr(p.trigger, 1)} until ${shortDate(p.gttExpiry)}`)
            } else {
                const stopNote = p.currentStop >= p.entry ? "at entry (breakeven)" : inr(p.currentStop, 1)
                out.push(`• <b>${escapeHtml(p.symbol)}</b> bought ${inr(p.entry, 2)}${p.close !== null ? ` · now ${inr(p.close, 2)} (${fmtR(p.rNow)})` : ""} · stop ${stopNote}`)
            }
        }
    }

    if (input.manualChecks.length) {
        out.push("", "<b>📋 Your own positions</b>")
        for (const c of input.manualChecks) {
            out.push(`• <b>${escapeHtml(c.symbol)}</b>${c.paper ? " (paper)" : ""} ${fmtR(c.rNow)}${c.close ? ` · close ${inr(c.close, 2)}` : ""}`)
            for (const a of c.actions) out.push(`  ⚠️ ${escapeHtml(a)}`)
        }
    }

    const phase = PHASES[status.settings.phase]
    out.push("", `<i>1R ${inr(status.oneR)} (${status.riskPct}%) · month ${signedInr(status.monthRealized)} (limit −${inr(status.monthLossLimit)}) · Phase ${status.settings.phase}: ${escapeHtml(phase.name.toLowerCase())}${status.settings.phase === 0 ? ", paper only" : ""}</i>`)
    if (input.appUrl) out.push(`<a href="${input.appUrl}/autopilot">Open Autopilot</a>`)
    return out.join("\n")
}
