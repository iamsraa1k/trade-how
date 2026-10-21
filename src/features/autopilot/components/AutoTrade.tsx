"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { format, parseISO } from "date-fns"
import { toast } from "sonner"
import { Bot, FileText, Trash2 } from "lucide-react"

import { Button } from "@/shared/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card"
import { deleteTradeAction } from "@/app/actions"
import type { Trade } from "@/lib/db"
import { cn } from "@/lib/utils"
import { tradeLevels } from "@/features/constitution/lib/engine"
import { EXIT_REASONS } from "@/features/constitution/lib/rules"
import { inr } from "@/features/constitution/lib/format"

export const exitLabel = (reason?: string | null) => EXIT_REASONS.find(r => r.value === reason)?.label || ""
export const day = (iso?: string | null) => (iso ? format(parseISO(iso), "d MMM yyyy") : "—")

/** The written log of an automated trade: the entry reasons, then one dated line per event. */
export function TradeLog({ text, className }: { text?: string; className?: string }) {
    if (!text) return null
    return (
        <div className={cn("space-y-1 text-sm leading-relaxed", className)}>
            {text.split("\n").map((line, i) => (
                <p key={i} className={cn(
                    line.startsWith("ENTRY") && "font-semibold text-foreground",
                    line.includes(": SOLD at") && "font-semibold text-foreground",
                    !line.startsWith("ENTRY") && !line.includes(": SOLD at") && "text-muted-foreground"
                )}>
                    {line}
                </p>
            ))}
        </div>
    )
}

/** Bought / sold / result line for a Momentum Breakout trade. */
export function tradeSummary(t: Trade) {
    const r = tradeLevels(t).resultR
    if (t.status === "open") {
        return t.entryPrice ? `Holding since ${day(t.date)} · bought at ${inr(t.entryPrice, 2)}` : `Waiting to buy above ${inr(t.trigger, 1)}`
    }
    return `Bought ${day(t.date)} → sold ${day(t.exitDate)}${r !== null ? ` · ${r >= 0 ? "+" : ""}${r.toFixed(2)}R` : ""}${t.exitReason ? ` · ${exitLabel(t.exitReason)}` : ""}`
}

export function AutoTradeDetail({ trade }: { trade: Trade }) {
    const router = useRouter()
    const [deleting, setDeleting] = React.useState(false)
    const lv = tradeLevels(trade)
    const open = trade.status === "open"
    const facts = [
        { label: open ? (trade.entryPrice ? "Bought" : "Buys above") : "Bought", value: trade.entryPrice ? `${inr(trade.entryPrice, 2)} on ${day(trade.date)}` : inr(trade.trigger, 1) },
        { label: "Sold", value: open ? "Still open" : `${inr(trade.exitPrice, 2)} on ${day(trade.exitDate)}` },
        { label: "Shares", value: String(trade.quantity) },
        { label: "Stop", value: trade.currentStop && trade.currentStop !== trade.stopPrice ? `${inr(trade.currentStop, 2)} (moved up)` : inr(trade.stopPrice, 2) },
        { label: "Risk (1R)", value: inr(lv.plannedRisk) },
        { label: "Result", value: open ? "—" : `${lv.resultR !== null ? `${lv.resultR >= 0 ? "+" : ""}${lv.resultR.toFixed(2)}R · ` : ""}${trade.pnl >= 0 ? "+" : ""}${inr(trade.pnl)}` },
    ]

    const remove = async () => {
        if (!confirm("Delete this Autopilot trade from your journal?")) return
        setDeleting(true)
        const result = await deleteTradeAction(trade.id)
        setDeleting(false)
        if (!result?.success) {
            toast.error(result?.error || "Failed to delete")
            return
        }
        toast.success("Trade deleted")
        router.push("/")
        router.refresh()
    }

    return (
        <Card className="glass-card">
            <CardHeader className="border-b border-border/50">
                <CardTitle className="flex flex-wrap items-center gap-2 text-2xl">
                    {trade.symbol}
                    <span className="text-xs font-semibold bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300 px-2.5 py-0.5 rounded-full flex items-center gap-1"><Bot className="h-3 w-3" />AUTOPILOT</span>
                    {trade.isPaper && <span className="text-xs font-semibold bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300 px-2.5 py-0.5 rounded-full flex items-center gap-1"><FileText className="h-3 w-3" />PAPER</span>}
                </CardTitle>
                <p className="text-sm text-muted-foreground">{trade.sector} · Momentum Breakout · managed by Autopilot, so it can&apos;t be edited by hand.</p>
            </CardHeader>
            <CardContent className="pt-6 space-y-6">
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {facts.map(f => (
                        <div key={f.label} className="rounded-lg border bg-background/70 px-3 py-2 min-w-0">
                            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">{f.label}</p>
                            <p className={cn("font-mono font-semibold text-sm truncate", f.label === "Result" && !open && (trade.pnl >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"))}>{f.value}</p>
                        </div>
                    ))}
                </div>
                <div>
                    <p className="text-sm font-semibold mb-2">Why it was bought, and everything since</p>
                    <div className="rounded-xl border bg-muted/20 p-4">
                        <TradeLog text={trade.analysis} />
                    </div>
                </div>
                <div className="flex justify-end">
                    <Button variant="ghost" className="text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30" disabled={deleting} onClick={remove}>
                        <Trash2 className="h-4 w-4 mr-2" /> Delete trade
                    </Button>
                </div>
            </CardContent>
        </Card>
    )
}
