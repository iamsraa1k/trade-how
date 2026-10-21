// Plain-language read of a breakout, used in the Telegram digest, the Autopilot page and each
// automated trade's entry log. Every stock here already passed all 8 scan filters; this says how
// convincingly it passed, and what deserves a second look.

import type { ScanStock } from "@/lib/db"

export interface SetupRead {
    strengths: string[]
    cautions: string[]
}

const pct = (n: number) => `${n.toFixed(1)}%`

export function readSetup(s: ScanStock, stopDistancePct?: number | null): SetupRead {
    const strengths: string[] = []
    const cautions: string[] = []

    if (s.volumeRatio >= 3) strengths.push(`volume ${s.volumeRatio}× normal, very strong buying`)
    else if (s.volumeRatio >= 2) strengths.push(`volume ${s.volumeRatio}× normal, strong buying`)
    else cautions.push(`volume ${s.volumeRatio}× normal, only just above the 1.5× bar`)

    if (s.baseRangePct <= 8) strengths.push(`tight base (${pct(s.baseRangePct)} range), sellers had dried up`)
    else if (s.baseRangePct >= 12) cautions.push(`loose base (${pct(s.baseRangePct)} range), near the 15% limit`)

    if (s.baseWeeks >= 3 && s.baseWeeks <= 8) strengths.push(`rested ${s.baseWeeks} weeks, the classic 3–8 week base`)
    else if (s.baseWeeks > 12) cautions.push(`very long base (${s.baseWeeks} weeks)`)

    if (s.pctBelow52wHigh !== undefined) {
        if (s.pctBelow52wHigh <= 3) strengths.push("at a 52-week high")
        else if (s.pctBelow52wHigh <= 10) strengths.push(`${pct(s.pctBelow52wHigh)} below its 52-week high`)
        else if (s.pctBelow52wHigh > 15) cautions.push(`${pct(s.pctBelow52wHigh)} below its 52-week high, not yet a leader`)
    }
    if (s.closeInRangePct !== undefined) {
        if (s.closeInRangePct >= 80) strengths.push("closed near the day's high")
        else if (s.closeInRangePct < 65) cautions.push("closed mid-range, buyers didn't hold all their gains")
    }
    if (s.changePct !== undefined && s.changePct >= 6) cautions.push(`jumped ${pct(s.changePct)} in one day, so more risk of a pullback or gap`)

    if (stopDistancePct != null) {
        if (stopDistancePct <= 4) strengths.push(`tight stop (${pct(stopDistancePct)}), more shares for the same risk`)
        else if (stopDistancePct >= 7) cautions.push(`wide stop (${pct(stopDistancePct)}), fewer shares`)
    }
    return { strengths, cautions }
}

export const capitalise = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s)
