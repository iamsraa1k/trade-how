"use client"

import * as React from "react"
import Link from "next/link"
import { format, parseISO } from "date-fns"
import { toast } from "sonner"
import { ExternalLink, Lightbulb, ShieldCheck, Trash2 } from "lucide-react"

import { Button } from "@/shared/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/shared/components/ui/card"
import { Input } from "@/shared/components/ui/input"
import { Label } from "@/shared/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/components/ui/tabs"
import { Textarea } from "@/shared/components/ui/textarea"
import { addImpulseAction, deleteBreachAction, deleteImpulseAction, logBreachAction, updateImpulseAction } from "@/app/actions"
import type { Breach, ConstitutionSettings, Impulse, Trade } from "@/lib/db"
import { useData } from "@/shared/context/DataContext"
import { cn } from "@/lib/utils"
import { ESCALATION_LABELS, LADDER, breachLabel, type BreachLevel } from "../lib/rules"
import { computeStatus, impulseOutcome, todayISO, type Consequence } from "../lib/engine"
import { LevelBadge } from "./LevelBadge"
import { inr } from "../lib/format"

const selectClass = "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"

function ConsequenceCard({ c, today }: { c: Consequence; today: string }) {
    const rule = LADDER.find(l => l.level === c.level)
    const pausedNow = c.blocksUntil !== null && today <= c.blocksUntil
    return (
        <div className={cn("rounded-xl border p-4 space-y-3", c.level >= 3 ? "border-red-200 bg-red-50/60 dark:border-red-900/60 dark:bg-red-950/20" : "border-amber-200 bg-amber-50/60 dark:border-amber-900/60 dark:bg-amber-950/20")}>
            <div className="flex items-center gap-2 flex-wrap">
                <LevelBadge level={c.level} />
                <span className="font-semibold text-sm">{c.label}</span>
                <span className="text-xs text-muted-foreground">{format(parseISO(c.date), "d MMM yyyy")}</span>
            </div>
            <p className="text-sm">{rule?.consequence}</p>
            <ul className="text-sm space-y-1.5">
                {c.blocksUntil && (
                    <li className={cn(pausedNow ? "font-semibold" : "text-muted-foreground line-through")}>
                        {c.level === 4 ? "Back in Phase 0" : "No new entries"} through {format(parseISO(c.blocksUntil), "EEE d MMM")}
                    </li>
                )}
                {c.paperNeeded > 0 && (
                    <li>
                        <div className="flex justify-between text-xs mb-1">
                            <span>{c.level === 3 ? "Compliant paper trades" : "Paper trades with the full routine"}</span>
                            <span className="font-mono">{c.paperDone} / {c.paperNeeded}</span>
                        </div>
                        <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                            <div className="h-full bg-teal-500" style={{ width: `${(c.paperDone / c.paperNeeded) * 100}%` }} />
                        </div>
                    </li>
                )}
                {c.level === 3 && (
                    <li className={cn(c.blocking && "text-muted-foreground")}>
                        Then 20 live trades at 0.5% risk: {c.reducedRiskLeft} left
                    </li>
                )}
                {c.level === 4 && <li>Write an answer to the Kill criteria before returning.</li>}
            </ul>
        </div>
    )
}

function LogBreachForm({ onLogged }: { onLogged: (b: Breach) => void }) {
    const [date, setDate] = React.useState(todayISO())
    const [level, setLevel] = React.useState<BreachLevel>(1)
    const options = LADDER.find(l => l.level === level)!.breaches.filter(b => !(b.code in ESCALATION_LABELS))
    const [code, setCode] = React.useState(options[0].code)
    const [note, setNote] = React.useState("")
    const [saving, setSaving] = React.useState(false)

    const submit = async (e: React.FormEvent) => {
        e.preventDefault()
        setSaving(true)
        const result = await logBreachAction({ date, level, code, note })
        setSaving(false)
        if (!result.success || !result.breach) {
            toast.error(result.error || "Failed to log breach")
            return
        }
        onLogged(result.breach)
        setNote("")
        toast.success(`Level ${level} logged. Apply the consequence today.`)
    }

    return (
        <form onSubmit={submit} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                    <Label htmlFor="breach-date">Date</Label>
                    <Input id="breach-date" type="date" required value={date} onChange={e => setDate(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                    <Label htmlFor="breach-level">Level</Label>
                    <select
                        id="breach-level"
                        className={selectClass}
                        value={level}
                        onChange={e => {
                            const next = Number(e.target.value) as BreachLevel
                            setLevel(next)
                            setCode(LADDER.find(l => l.level === next)!.breaches.filter(b => !(b.code in ESCALATION_LABELS))[0].code)
                        }}
                    >
                        {LADDER.map(l => <option key={l.level} value={l.level}>Level {l.level}</option>)}
                    </select>
                </div>
                <div className="space-y-1.5 col-span-2">
                    <Label htmlFor="breach-code">Breach</Label>
                    <select id="breach-code" className={selectClass} value={code} onChange={e => setCode(e.target.value)}>
                        {options.map(o => <option key={o.code} value={o.code}>{o.label}</option>)}
                    </select>
                </div>
            </div>
            <div className="space-y-1.5">
                <Label htmlFor="breach-note">What happened</Label>
                <Input id="breach-note" placeholder="One line, no excuses" value={note} onChange={e => setNote(e.target.value)} />
            </div>
            <div className="flex items-center justify-between gap-3 flex-wrap">
                <p className="text-xs text-muted-foreground">{LADDER.find(l => l.level === level)?.consequence}</p>
                <Button type="submit" disabled={saving} variant="destructive">{saving ? "Logging..." : "Log breach"}</Button>
            </div>
        </form>
    )
}

function ImpulseRow({ impulse, positionCap, onChange, onDelete }: { impulse: Impulse; positionCap: number; onChange: (i: Impulse) => void; onDelete: (id: string) => void }) {
    const [later, setLater] = React.useState(impulse.laterPrice?.toString() || "")
    const outcome = impulseOutcome(impulse, positionCap)

    const saveLater = async () => {
        const value = later === "" ? null : parseFloat(later)
        if (value === (impulse.laterPrice ?? null)) return
        const result = await updateImpulseAction(impulse.id, value)
        if (!result.success) {
            toast.error(result.error || "Failed to save")
            return
        }
        onChange({ ...impulse, laterPrice: value })
    }

    return (
        <div className="rounded-xl border bg-background/70 p-4 space-y-3">
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <p className="font-bold font-mono">{impulse.symbol} <span className="font-sans text-xs font-normal text-muted-foreground ml-1">{format(parseISO(impulse.date), "d MMM yyyy")}</span></p>
                    <p className="text-sm text-muted-foreground mt-1 break-words">{impulse.reason}</p>
                </div>
                <Button variant="ghost" size="sm" className="shrink-0 text-muted-foreground hover:bg-red-100 hover:text-red-600" onClick={() => onDelete(impulse.id)} aria-label="Delete entry">
                    <Trash2 className="h-4 w-4" />
                </Button>
            </div>
            <div className="flex flex-wrap items-end gap-3 text-sm">
                <div>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Price then</p>
                    <p className="font-mono font-semibold">{inr(impulse.refPrice, 2)}</p>
                </div>
                <div className="space-y-1">
                    <Label htmlFor={`later-${impulse.id}`} className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Price later</Label>
                    <Input id={`later-${impulse.id}`} type="number" step="any" className="h-8 w-28 font-mono" value={later} onChange={e => setLater(e.target.value)} onBlur={saveLater} disabled={!impulse.refPrice} placeholder={impulse.refPrice ? "" : "n/a"} />
                </div>
                {outcome && (
                    <div>
                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Would have made</p>
                        <p className={cn("font-mono font-semibold", outcome.rupees >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400")}>
                            {outcome.rupees >= 0 ? "+" : ""}{inr(outcome.rupees)} <span className="text-xs">({outcome.pct >= 0 ? "+" : ""}{outcome.pct.toFixed(1)}%)</span>
                        </p>
                    </div>
                )}
            </div>
        </div>
    )
}

function ImpulseLog({ impulses, positionCap, setImpulses }: { impulses: Impulse[]; positionCap: number; setImpulses: React.Dispatch<React.SetStateAction<Impulse[]>> }) {
    const [date, setDate] = React.useState(todayISO())
    const [symbol, setSymbol] = React.useState("")
    const [reason, setReason] = React.useState("")
    const [refPrice, setRefPrice] = React.useState("")
    const [saving, setSaving] = React.useState(false)

    const scored = impulses.map(i => impulseOutcome(i, positionCap)).filter((o): o is NonNullable<typeof o> => o !== null)
    const total = scored.reduce((a, o) => a + o.rupees, 0)
    const winners = scored.filter(o => o.rupees > 0).length

    const submit = async (e: React.FormEvent) => {
        e.preventDefault()
        setSaving(true)
        const result = await addImpulseAction({ date, symbol, reason, refPrice: refPrice ? parseFloat(refPrice) : null })
        setSaving(false)
        if (!result.success || !result.impulse) {
            toast.error(result.error || "Failed to log")
            return
        }
        setImpulses(prev => [result.impulse!, ...prev])
        setSymbol("")
        setReason("")
        setRefPrice("")
        toast.success("Logged. It never becomes an order.")
    }

    const remove = async (id: string) => {
        if (!confirm("Delete this impulse entry?")) return
        const result = await deleteImpulseAction(id)
        if (!result.success) {
            toast.error(result.error || "Failed to delete")
            return
        }
        setImpulses(prev => prev.filter(i => i.id !== id))
    }

    return (
        <div className="grid grid-cols-1 lg:grid-cols-[380px_minmax(0,1fr)] gap-6 items-start">
            <div className="space-y-6">
                <Card className="glass-card">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2"><Lightbulb className="h-5 w-5 text-amber-500" /> The impulse lane</CardTitle>
                        <CardDescription>
                            Any idea that isn&apos;t a scan signal — a tip, a news story, a stock that &ldquo;looks ready&rdquo; — goes here. It never becomes an order. Each entry is one more practice of the pause.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <form onSubmit={submit} className="space-y-3">
                            <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1.5">
                                    <Label htmlFor="imp-date">Date</Label>
                                    <Input id="imp-date" type="date" required value={date} onChange={e => setDate(e.target.value)} />
                                </div>
                                <div className="space-y-1.5">
                                    <Label htmlFor="imp-symbol">Stock</Label>
                                    <Input id="imp-symbol" required placeholder="e.g. ADANIENT" className="font-mono uppercase" value={symbol} onChange={e => setSymbol(e.target.value)} />
                                </div>
                            </div>
                            <div className="space-y-1.5">
                                <Label htmlFor="imp-reason">Why</Label>
                                <Textarea id="imp-reason" required placeholder="What pulled you in?" className="min-h-[70px]" value={reason} onChange={e => setReason(e.target.value)} />
                            </div>
                            <div className="space-y-1.5">
                                <Label htmlFor="imp-price">Price right now (optional)</Label>
                                <Input id="imp-price" type="number" step="any" className="font-mono" value={refPrice} onChange={e => setRefPrice(e.target.value)} />
                            </div>
                            <Button type="submit" disabled={saving} className="w-full bg-amber-500 hover:bg-amber-600 text-white">{saving ? "Logging..." : "Log the impulse"}</Button>
                        </form>
                    </CardContent>
                </Card>

                <Card className="glass-card">
                    <CardHeader>
                        <CardTitle>{impulses.length} / 30 entries</CardTitle>
                        <CardDescription>After 30 entries, check in rupees whether your impulses would have made money.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        <div className="h-2 rounded-full bg-muted overflow-hidden">
                            <div className="h-full bg-amber-500" style={{ width: `${Math.min(100, (impulses.length / 30) * 100)}%` }} />
                        </div>
                        {scored.length > 0 ? (
                            <p className="text-sm">
                                On a full {inr(positionCap)} position each, the {scored.length} scored impulse{scored.length === 1 ? "" : "s"} would have made{" "}
                                <span className={cn("font-bold", total >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400")}>{total >= 0 ? "+" : ""}{inr(total)}</span>
                                {" "}({winners} of {scored.length} winners), before costs and without stops.
                            </p>
                        ) : (
                            <p className="text-sm text-muted-foreground">Add the price when you log an impulse, then fill in a later price to score it.</p>
                        )}
                    </CardContent>
                </Card>
            </div>

            <div className="space-y-3">
                {impulses.length === 0 ? (
                    <div className="py-16 text-center text-muted-foreground border-2 border-dashed rounded-2xl">No impulses logged yet.</div>
                ) : (
                    impulses.map(i => (
                        <ImpulseRow
                            key={i.id}
                            impulse={i}
                            positionCap={positionCap}
                            onChange={next => setImpulses(prev => prev.map(p => (p.id === next.id ? next : p)))}
                            onDelete={remove}
                        />
                    ))
                )}
            </div>
        </div>
    )
}

export function DisciplineView({ constitution, trades, breaches, impulses }: { constitution: ConstitutionSettings | null; trades: Trade[]; breaches: Breach[]; impulses: Impulse[] }) {
    const { setBreaches, setImpulses } = useData()
    const status = React.useMemo(() => computeStatus(constitution, trades, breaches), [constitution, trades, breaches])
    const { active, levelOneThisMonth } = status.consequences
    const tradeSymbols = React.useMemo(() => new Map(trades.map(t => [t.id, t.symbol])), [trades])

    const removeBreach = async (id: string) => {
        if (!confirm("Delete this breach? Only do this for a genuine logging mistake.")) return
        const result = await deleteBreachAction(id)
        if (!result.success) {
            toast.error(result.error || "Failed to delete")
            return
        }
        setBreaches(prev => prev.filter(b => b.id !== id))
        toast.success("Breach deleted")
    }

    return (
        <Tabs defaultValue="ladder" className="w-full">
            <TabsList>
                <TabsTrigger value="ladder">Consequence ladder{active.length > 0 ? ` (${active.length})` : ""}</TabsTrigger>
                <TabsTrigger value="impulses">Impulse log ({impulses.length})</TabsTrigger>
            </TabsList>

            <TabsContent value="ladder" className="pt-4">
                <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_420px] gap-6 items-start">
                    <div className="space-y-6 min-w-0">
                        <Card className="glass-card">
                            <CardHeader>
                                <CardTitle>Active consequences</CardTitle>
                                <CardDescription>During any pause, open trades keep their stops and exits running. Level 1 slips this month: {levelOneThisMonth} (three count as one Level 2).</CardDescription>
                            </CardHeader>
                            <CardContent>
                                {active.length === 0 ? (
                                    <div className="flex items-center gap-2 text-sm text-emerald-700 dark:text-emerald-300 py-4">
                                        <ShieldCheck className="h-5 w-5" /> Nothing active. Keep it that way.
                                    </div>
                                ) : (
                                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
                                        {active.map(c => <ConsequenceCard key={`${c.code}-${c.date}-${c.level}`} c={c} today={status.today} />)}
                                    </div>
                                )}
                            </CardContent>
                        </Card>

                        <Card className="glass-card">
                            <CardHeader>
                                <CardTitle>Breach log</CardTitle>
                                <CardDescription>Breaches found when you save a live Momentum Breakout trade are logged here automatically.</CardDescription>
                            </CardHeader>
                            <CardContent>
                                {breaches.length === 0 ? (
                                    <p className="text-sm text-muted-foreground py-4">No breaches logged.</p>
                                ) : (
                                    <ul className="divide-y divide-border/60">
                                        {breaches.map(b => (
                                            <li key={b.id} className="flex items-start gap-3 py-3">
                                                <LevelBadge level={b.level} />
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-sm font-medium">{breachLabel(b.code)} <span className="text-xs font-normal text-muted-foreground ml-1">{format(parseISO(b.date), "d MMM yyyy")}</span></p>
                                                    {b.note && <p className="text-xs text-muted-foreground mt-0.5 break-words">{b.note}</p>}
                                                    {b.tradeId && tradeSymbols.has(b.tradeId) && (
                                                        <Link href={`/edit/${b.tradeId}`} className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline inline-flex items-center gap-1 mt-0.5">
                                                            {tradeSymbols.get(b.tradeId)} trade <ExternalLink className="h-3 w-3" />
                                                        </Link>
                                                    )}
                                                </div>
                                                <Button variant="ghost" size="sm" className="shrink-0 text-muted-foreground hover:bg-red-100 hover:text-red-600" onClick={() => removeBreach(b.id)} aria-label="Delete breach">
                                                    <Trash2 className="h-4 w-4" />
                                                </Button>
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </CardContent>
                        </Card>
                    </div>

                    <Card className="glass-card">
                        <CardHeader>
                            <CardTitle>Log a breach</CardTitle>
                            <CardDescription>A breach gets its consequence today. Willpower isn&apos;t the enforcement — this log is.</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <LogBreachForm onLogged={b => setBreaches(prev => [b, ...prev])} />
                            <p className="mt-6 text-xs text-muted-foreground border-t pt-4">
                                If you keep breaking Level 3 rules with all three layers in place, the issue is likely compulsion rather than strategy. Talking to a counsellor who works with gambling-type urges is a sensible, strong move.
                            </p>
                        </CardContent>
                    </Card>
                </div>
            </TabsContent>

            <TabsContent value="impulses" className="pt-4">
                <ImpulseLog impulses={impulses} positionCap={status.positionCap} setImpulses={setImpulses} />
            </TabsContent>
        </Tabs>
    )
}
