"use client"

import * as React from "react"
import { format, parseISO } from "date-fns"
import { toast } from "sonner"
import { Bot, Play } from "lucide-react"

import { Button } from "@/shared/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/components/ui/tabs"
import { getAutomationOverviewAction } from "@/app/actions"
import type { Breach, ConstitutionSettings, Impulse, Trade } from "@/lib/db"
import { cn } from "@/lib/utils"
import { computeStatus } from "@/features/constitution/lib/engine"
import { MAX_OPEN_POSITIONS } from "@/features/constitution/lib/rules"
import { inr } from "@/features/constitution/lib/format"
import { TodayTab } from "./TodayTab"
import { HistoryTab } from "./HistoryTab"
import { RulesTab } from "./RulesTab"
import { SettingsTab } from "./SettingsTab"

export type Overview = Awaited<ReturnType<typeof getAutomationOverviewAction>>

function Chip({ children, tone }: { children: React.ReactNode; tone?: "green" | "red" | "amber" }) {
    return (
        <span className={cn(
            "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold whitespace-nowrap",
            tone === "green" && "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-300",
            tone === "red" && "border-red-200 bg-red-50 text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300",
            tone === "amber" && "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-300",
            !tone && "bg-background/70"
        )}>
            {children}
        </span>
    )
}

export function AutopilotView({ constitution, trades, breaches, impulses }: { constitution: ConstitutionSettings | null; trades: Trade[]; breaches: Breach[]; impulses: Impulse[] }) {
    const [overview, setOverview] = React.useState<Overview | null>(null)
    const [tab, setTab] = React.useState("today")
    const [running, setRunning] = React.useState(false)
    const status = React.useMemo(() => computeStatus(constitution, trades, breaches), [constitution, trades, breaches])

    const load = React.useCallback(async () => {
        try {
            setOverview(await getAutomationOverviewAction())
        } catch {
            toast.error("Couldn't load Autopilot")
        }
    }, [])

    React.useEffect(() => { load() }, [load])

    const runNow = async () => {
        setRunning(true)
        try {
            const res = await fetch("/api/automation/run", { method: "POST" })
            const body = await res.json()
            if (!res.ok) throw new Error(body.error || "Run failed")
            toast.success(`Checked ${format(parseISO(body.asOf), "d MMM")}: light ${body.light}, ${body.breakouts} breakout(s)${body.sent ? ", digest sent" : ""}`)
            if (body.error) toast.error(`Telegram: ${body.error}`)
            await load()
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "Run failed")
        } finally {
            setRunning(false)
        }
    }

    if (!overview) return <p className="text-sm text-muted-foreground">Loading…</p>

    const scan = overview.latestScan
    const openAuto = trades.filter(t => t.auto && t.status === "open")
    const holding = openAuto.filter(t => t.entryPrice).length
    const waiting = openAuto.length - holding

    return (
        <div className="space-y-6">
            <div className="glass rounded-2xl p-4 flex flex-col lg:flex-row lg:items-center gap-4">
                <div className="flex flex-wrap items-center gap-2 flex-1">
                    <Chip tone="green"><Bot className="h-3.5 w-3.5" />Autopilot on</Chip>
                    {scan && (
                        <Chip tone={scan.marketLight.green ? "green" : "red"}>
                            Light {scan.marketLight.green ? "green" : "red"} · Nifty {scan.marketLight.close.toLocaleString("en-IN")} vs {Math.round(scan.marketLight.sma200).toLocaleString("en-IN")}
                        </Chip>
                    )}
                    <Chip>Phase {status.settings.phase}{status.settings.phase === 0 ? " · paper only" : ""}</Chip>
                    <Chip>1R {inr(status.oneR)}</Chip>
                    <Chip>{holding}/{MAX_OPEN_POSITIONS} held{waiting ? ` · ${waiting} waiting` : ""}</Chip>
                    {status.monthlyCloseDue && <Chip tone="amber">Monthly close due</Chip>}
                </div>
                <div className="flex items-center gap-3 shrink-0">
                    <span className="text-xs text-muted-foreground">
                        {overview.lastRunAt ? `Last run ${format(parseISO(overview.lastRunAt), "d MMM, HH:mm")}` : "Not run yet"}
                    </span>
                    <Button size="sm" onClick={runNow} disabled={running || !overview.enabled} className="bg-indigo-600 hover:bg-indigo-700 text-white">
                        <Play className="h-4 w-4 mr-1.5" />{running ? "Running…" : "Run now"}
                    </Button>
                </div>
            </div>

            <Tabs value={tab} onValueChange={setTab} className="w-full">
                <TabsList className="h-auto">
                    <TabsTrigger value="today">Today</TabsTrigger>
                    <TabsTrigger value="history">History</TabsTrigger>
                    <TabsTrigger value="rules">Rules</TabsTrigger>
                    <TabsTrigger value="settings">Settings</TabsTrigger>
                </TabsList>
                <TabsContent value="today" className="pt-4">
                    <TodayTab overview={overview} status={status} trades={trades} onGoToSettings={() => setTab("settings")} />
                </TabsContent>
                <TabsContent value="history" className="pt-4">
                    <HistoryTab overview={overview} status={status} trades={trades} constitution={constitution} breaches={breaches} impulses={impulses} />
                </TabsContent>
                <TabsContent value="rules" className="pt-4">
                    <RulesTab status={status} trades={trades} />
                </TabsContent>
                <TabsContent value="settings" className="pt-4">
                    <SettingsTab overview={overview} status={status} trades={trades} onChange={load} />
                </TabsContent>
            </Tabs>
        </div>
    )
}
