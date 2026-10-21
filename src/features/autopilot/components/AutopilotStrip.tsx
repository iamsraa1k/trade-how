"use client"

import * as React from "react"
import Link from "next/link"
import { format, parseISO } from "date-fns"
import { ArrowRight, Bot } from "lucide-react"

import { getAutopilotStatusAction } from "@/app/actions"
import type { Trade } from "@/lib/db"
import { cn } from "@/lib/utils"
import type { ConstitutionStatus } from "@/features/constitution/lib/engine"
import { inr } from "@/features/constitution/lib/format"

type Info = Awaited<ReturnType<typeof getAutopilotStatusAction>>

/** One-line Autopilot summary on the dashboard; the details live on the Autopilot page. */
export function AutopilotStrip({ status, trades }: { status: ConstitutionStatus; trades: Trade[] }) {
    const [info, setInfo] = React.useState<Info | null>(null)

    React.useEffect(() => {
        getAutopilotStatusAction().then(setInfo).catch(() => setInfo(null))
    }, [])

    const openAuto = trades.filter(t => t.auto && t.status === "open")
    const holding = openAuto.filter(t => t.entryPrice).length
    const waiting = openAuto.length - holding
    const items = [
        info?.light ? { text: `Light ${info.light.green ? "green" : "red"}`, tone: info.light.green ? "green" : "red" } : null,
        info?.scanDate ? { text: `${info.breakouts} breakout${info.breakouts === 1 ? "" : "s"} on ${format(parseISO(info.scanDate), "d MMM")}` } : null,
        { text: `${holding} held${waiting ? `, ${waiting} waiting` : ""}` },
        { text: `Month ${status.monthRealized >= 0 ? "+" : ""}${inr(status.monthRealized)}` },
        status.monthlyCloseDue ? { text: "Monthly close due", tone: "amber" } : null,
        info && !info.telegramLinked ? { text: "Telegram not connected", tone: "amber" } : null,
    ].filter(Boolean) as { text: string; tone?: "green" | "red" | "amber" }[]

    return (
        <Link href="/autopilot" className="glass rounded-2xl px-4 py-3 flex flex-wrap items-center gap-x-4 gap-y-2 hover:shadow-lg transition-shadow group">
            <span className="flex items-center gap-2 font-semibold text-sm"><Bot className="h-4 w-4 text-indigo-500" />Autopilot</span>
            {items.map(i => (
                <span key={i.text} className={cn(
                    "text-xs font-medium",
                    i.tone === "green" && "text-emerald-600 dark:text-emerald-400",
                    i.tone === "red" && "text-red-600 dark:text-red-400",
                    i.tone === "amber" && "text-amber-600 dark:text-amber-400",
                    !i.tone && "text-muted-foreground"
                )}>
                    {i.text}
                </span>
            ))}
            <span className="ml-auto text-xs font-medium text-indigo-600 dark:text-indigo-400 flex items-center gap-1">Open <ArrowRight className="h-3 w-3 group-hover:translate-x-0.5 transition-transform" /></span>
        </Link>
    )
}
