"use client"

import * as React from "react"
import { format, parseISO, subMonths, endOfMonth } from "date-fns"
import { toast } from "sonner"

import { Button } from "@/shared/components/ui/button"
import { Input } from "@/shared/components/ui/input"
import { Label } from "@/shared/components/ui/label"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/shared/components/ui/dialog"
import { saveConstitutionAction } from "@/app/actions"
import { useData } from "@/shared/context/DataContext"
import { PHASES } from "../lib/rules"
import { computeStatus, toISO, type ConstitutionStatus } from "../lib/engine"
import { inr } from "../lib/format"

export function ConstitutionSettingsDialog({ open, onOpenChange, status }: { open: boolean; onOpenChange: (open: boolean) => void; status: ConstitutionStatus }) {
    const { constitution, trades, breaches, setConstitution } = useData()
    const [phase, setPhase] = React.useState(String(status.settings.phase))
    const [startDate, setStartDate] = React.useState(status.settings.startDate)
    const [equity, setEquity] = React.useState(String(Math.round(status.monthEquity)))
    const [saving, setSaving] = React.useState(false)

    React.useEffect(() => {
        if (!open) return
        setPhase(String(status.settings.phase))
        setStartDate(status.settings.startDate)
        setEquity(String(Math.round(status.monthEquity)))
    }, [open, status.settings.phase, status.settings.startDate, status.monthEquity])

    // Top-ups are not allowed after a month where a loss limit was hit.
    const lastMonth = React.useMemo(() => {
        const lastDay = toISO(endOfMonth(subMonths(parseISO(`${status.month}-01`), 1)))
        return computeStatus(constitution, trades, breaches, lastDay)
    }, [constitution, trades, breaches, status.month])
    const carried = status.monthEquities[status.month] ?? status.monthEquity
    const equityNum = parseFloat(equity)
    const looksLikeTopUp = status.monthlyCloseDue && equityNum > carried + 1
    const topUpBlocked = looksLikeTopUp && (lastMonth.monthLimitHit || lastMonth.drawdownReduced)

    const save = async () => {
        if (!(equityNum > 0)) {
            toast.error("Enter this month's equity")
            return
        }
        setSaving(true)
        const history = status.settings.equityHistory.filter(h => h.month !== status.month)
        history.push({ month: status.month, equity: equityNum })
        const result = await saveConstitutionAction({
            phase: Number(phase) as 0 | 1 | 2 | 3 | 4,
            startDate,
            equityHistory: history,
            checks: status.settings.checks,
        })
        setSaving(false)
        if (!result.success || !result.data) {
            toast.error(result.error || "Failed to save")
            return
        }
        setConstitution(result.data)
        toast.success("Constitution settings saved")
        onOpenChange(false)
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle>Settings &amp; monthly close</DialogTitle>
                    <DialogDescription>
                        Value equity on the first weekend of each month. 1R (1%) and the position cap (20%) stay fixed for the month.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-5 py-2">
                    <div className="space-y-2">
                        <Label htmlFor="equity">Equity for {format(parseISO(`${status.month}-01`), "MMMM yyyy")} (account + reserve)</Label>
                        <Input id="equity" type="number" min="0" step="1" value={equity} onChange={e => setEquity(e.target.value)} className="font-mono" />
                        <p className="text-xs text-muted-foreground">
                            Carried forward from realised P&amp;L: {inr(carried)}. That gives 1R = {inr(equityNum * status.riskPct / 100)} and a cap of {inr(equityNum * status.settings.positionCapPct / 100)}.
                        </p>
                        {topUpBlocked && (
                            <p className="text-xs font-medium text-red-600 dark:text-red-400">
                                This is above the carried value, so it includes a top-up — but last month hit a loss limit. Top-ups are not allowed this month.
                            </p>
                        )}
                        {looksLikeTopUp && !topUpBlocked && (
                            <p className="text-xs text-amber-700 dark:text-amber-400">
                                Includes a top-up of {inr(equityNum - carried)}. Only surplus income, never to recover a loss.
                            </p>
                        )}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="phase">Current phase</Label>
                            <select
                                id="phase"
                                value={phase}
                                onChange={e => setPhase(e.target.value)}
                                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                            >
                                {PHASES.map(p => <option key={p.phase} value={p.phase}>Phase {p.phase} — {p.name}</option>)}
                            </select>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="startDate">Constitution start date</Label>
                            <Input id="startDate" type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
                        </div>
                    </div>
                    <p className="text-xs text-muted-foreground -mt-2">
                        Trades before the start date (your old F&amp;O history) don&apos;t count toward limits, gates or stats. Move phases only when a gate passes.
                    </p>
                </div>

                <div className="flex justify-end gap-2">
                    <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
                    <Button onClick={save} disabled={saving || topUpBlocked} className="bg-indigo-600 hover:bg-indigo-700 text-white">
                        {saving ? "Saving..." : "Save"}
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    )
}
