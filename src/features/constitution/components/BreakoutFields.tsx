"use client"

import * as React from "react"
import Link from "next/link"
import { format, parseISO } from "date-fns"
import { AlertTriangle, Calculator, CircleDot, Info, ShieldAlert, Sparkles } from "lucide-react"

import { Button } from "@/shared/components/ui/button"
import { Input } from "@/shared/components/ui/input"
import { Label } from "@/shared/components/ui/label"
import { cn } from "@/lib/utils"
import { CHECKLIST, EXIT_REASONS, PLEDGE, SECTORS } from "../lib/rules"
import { GRADE_INFO, tradingDaysBetween, type ConstitutionStatus, type Finding, type Grade, type TradeLevels } from "../lib/engine"

export interface BreakoutState {
    status: "open" | "closed"
    sector: string
    marketLight: "" | "green" | "red"
    baseWeeks: string
    volumeRatio: string
    trigger: string
    limitPrice: string
    stopPrice: string
    resultsDate: string
    exitDate: string
    exitReason: string
    checklist: string[]
    processGrade: Grade
    repeatNote: string
}

const inr = (n: number | null | undefined, digits = 0) =>
    n === null || n === undefined || !isFinite(n) ? "—" : n.toLocaleString("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: digits })

const sectionTitle = "text-base sm:text-lg font-semibold flex items-center gap-2 text-primary"
const panel = "bg-muted/20 p-4 rounded-xl border border-border/50"
const field = "bg-background font-mono shadow-sm w-full"

function Segmented<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: string; className?: string }[]; onChange: (v: T) => void }) {
    return (
        <div className="flex rounded-lg bg-muted/50 p-1 border border-border/60 w-full">
            {options.map(opt => (
                <button
                    key={opt.value}
                    type="button"
                    onClick={() => onChange(opt.value)}
                    className={cn(
                        "flex-1 rounded-md px-3 py-1.5 text-sm font-semibold transition-all",
                        value === opt.value ? (opt.className || "bg-background text-foreground shadow-sm ring-1 ring-border") : "text-muted-foreground hover:text-foreground"
                    )}
                >
                    {opt.label}
                </button>
            ))}
        </div>
    )
}

function Metric({ label, value, tone, hint }: { label: string; value: string; tone?: "bad" | "good"; hint?: string }) {
    return (
        <div className="rounded-lg bg-background/70 border border-border/60 px-3 py-2 min-w-0">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold truncate">{label}</p>
            <p className={cn("font-mono font-bold text-sm sm:text-base truncate", tone === "bad" && "text-red-600 dark:text-red-400", tone === "good" && "text-emerald-600 dark:text-emerald-400")}>{value}</p>
            {hint && <p className="text-[10px] text-muted-foreground truncate">{hint}</p>}
        </div>
    )
}

export function BreakoutFields({
    formData,
    onInput,
    mb,
    setMb,
    levels,
    status,
    isPaper,
    calculatedPnl,
    onAutoFill,
    autoFillState,
}: {
    formData: { date: string; symbol: string; entry: string; exit: string; quantity: string; fees: string; pnl: string }
    onInput: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => void
    mb: BreakoutState
    setMb: (patch: Partial<BreakoutState>) => void
    levels: TradeLevels
    status: ConstitutionStatus
    isPaper: boolean
    calculatedPnl: number | null
    onAutoFill: () => void
    autoFillState: { loading: boolean; summary: string | null; ok: boolean }
}) {
    const equity = status.monthEquities[formData.date.slice(0, 7)] ?? status.monthEquity
    const oneR = equity * status.riskPct / 100
    const cap = equity * status.settings.positionCapPct / 100
    const isOpen = mb.status === "open"
    const pending = isOpen && !formData.entry

    return (
        <>
            <input type="hidden" name="setup" value="momentum_breakout" />
            <input type="hidden" name="type" value="buy" />
            <input type="hidden" name="status" value={mb.status} />
            <input type="hidden" name="marketLight" value={mb.marketLight} />

            {/* Section 1 */}
            <div className="space-y-4">
                <h3 className={sectionTitle}>1. Trade Details</h3>
                <div className={cn(panel, "grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6")}>
                    <div className="space-y-2">
                        <Label htmlFor="date">{pending ? "Plan date" : "Entry (fill) date"}</Label>
                        <Input type="date" name="date" id="date" required className="bg-background shadow-sm w-full" value={formData.date} onChange={onInput} />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="symbol">Stock (Nifty 200)</Label>
                        <Input name="symbol" id="symbol" placeholder="e.g. TATAMOTORS" required className="bg-background font-mono uppercase shadow-sm w-full" value={formData.symbol} onChange={onInput} />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="sector">Sector</Label>
                        <Input name="sector" id="sector" list="mb-sectors" placeholder="e.g. Capital Goods" className="bg-background shadow-sm w-full" value={mb.sector} onChange={e => setMb({ sector: e.target.value })} />
                        <datalist id="mb-sectors">
                            {SECTORS.map(s => <option key={s} value={s} />)}
                        </datalist>
                    </div>
                    <div className="md:col-span-2 flex flex-col sm:flex-row sm:items-center gap-3 rounded-lg border border-dashed border-indigo-300 dark:border-indigo-800 bg-indigo-50/50 dark:bg-indigo-950/20 p-3">
                        <Button type="button" size="sm" variant="outline" onClick={onAutoFill} disabled={autoFillState.loading || !formData.symbol.trim()} className="shrink-0">
                            <Sparkles className="h-4 w-4 mr-2 text-indigo-500" /> {autoFillState.loading ? "Fetching…" : "Fill from market data"}
                        </Button>
                        <p className={cn("text-xs", autoFillState.summary ? (autoFillState.ok ? "text-emerald-700 dark:text-emerald-300" : "text-amber-700 dark:text-amber-300") : "text-muted-foreground")}>
                            {autoFillState.summary || "Fills sector, market light, base, volume ratio, results date and the GTT plan from Upstox's daily candles for the breakout day."}
                        </p>
                    </div>
                    <div className="space-y-2">
                        <Label>Position status</Label>
                        <Segmented
                            value={mb.status}
                            onChange={v => setMb({ status: v })}
                            options={[
                                { value: "open", label: "Open / GTT placed", className: "bg-sky-500/15 text-sky-700 dark:text-sky-300 ring-1 ring-sky-500/30 shadow-sm" },
                                { value: "closed", label: "Closed" },
                            ]}
                        />
                    </div>
                </div>
            </div>

            {/* Section 2 */}
            <div className="space-y-4">
                <h3 className={sectionTitle}>2. Setup Checks</h3>
                <div className={cn(panel, "grid grid-cols-1 md:grid-cols-3 gap-4")}>
                    <div className="space-y-2">
                        <Label>Market light</Label>
                        <Segmented
                            value={mb.marketLight}
                            onChange={v => setMb({ marketLight: v })}
                            options={[
                                { value: "green", label: "Green", className: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 ring-1 ring-emerald-500/30 shadow-sm" },
                                { value: "red", label: "Red", className: "bg-red-500/15 text-red-700 dark:text-red-300 ring-1 ring-red-500/30 shadow-sm" },
                            ]}
                        />
                        <p className="text-[11px] text-muted-foreground">Nifty 50 closed above its 200-day SMA?</p>
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="baseWeeks">Base length (weeks)</Label>
                        <Input type="number" step="any" min="0" name="baseWeeks" id="baseWeeks" placeholder="3–8" className={field} value={mb.baseWeeks} onChange={e => setMb({ baseWeeks: e.target.value })} />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="volumeRatio">Volume ratio (×50-day avg)</Label>
                        <Input type="number" step="any" min="0" name="volumeRatio" id="volumeRatio" placeholder="≥ 1.5" className={field} value={mb.volumeRatio} onChange={e => setMb({ volumeRatio: e.target.value })} />
                    </div>
                </div>
            </div>

            {/* Section 3 */}
            <div className="space-y-4">
                <div className="flex items-center justify-between gap-3">
                    <h3 className={sectionTitle}>3. Plan &amp; Fill (₹)</h3>
                    <Link href="/routine#sizing" className="text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1">
                        <Calculator className="h-3.5 w-3.5" /> Sizing calculator
                    </Link>
                </div>
                <div className={cn(panel, "space-y-4")}>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="trigger">GTT trigger</Label>
                            <Input type="number" step="any" name="trigger" id="trigger" placeholder="0.00" className={field} value={mb.trigger} onChange={e => setMb({ trigger: e.target.value })} />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="limitPrice">GTT limit</Label>
                            <Input type="number" step="any" name="limitPrice" id="limitPrice" placeholder="0.00" className={field} value={mb.limitPrice} onChange={e => setMb({ limitPrice: e.target.value })} />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="stopPrice">Stop</Label>
                            <Input type="number" step="any" name="stopPrice" id="stopPrice" placeholder="0.00" className={field} value={mb.stopPrice} onChange={e => setMb({ stopPrice: e.target.value })} />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="quantity">Shares</Label>
                            <Input type="number" name="quantity" id="quantity" placeholder="0" className={field} value={formData.quantity} onChange={onInput} />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="entry">Fill price</Label>
                            <Input type="number" step="any" name="entry" id="entry" placeholder={isOpen ? "Blank until it fills" : "0.00"} className={field} value={formData.entry} onChange={onInput} />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="resultsDate">Next results date</Label>
                            <Input type="date" name="resultsDate" id="resultsDate" className="bg-background shadow-sm w-full" value={mb.resultsDate} onChange={e => setMb({ resultsDate: e.target.value })} />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        <Metric label={pending ? "R / share (limit)" : "R / share"} value={inr(levels.rPerShare, 2)} />
                        <Metric
                            label="Planned risk"
                            value={inr(levels.plannedRisk)}
                            tone={levels.plannedRisk !== null && levels.plannedRisk > oneR + 1 ? "bad" : undefined}
                            hint={`1R = ${inr(oneR)} (${status.riskPct}%)`}
                        />
                        <Metric
                            label="Position"
                            value={inr(levels.positionValue)}
                            tone={levels.positionValue !== null && levels.positionValue > cap + 1 ? "bad" : undefined}
                            hint={`Cap ${inr(cap)}`}
                        />
                        <Metric
                            label="Stop distance"
                            value={levels.stopDistancePct === null ? "—" : `${levels.stopDistancePct.toFixed(1)}%`}
                            tone={levels.stopDistancePct !== null && (levels.stopDistancePct > 8.005 || levels.stopDistancePct < 2.995) ? "bad" : undefined}
                            hint="3–8% allowed"
                        />
                        <Metric label="Time stop needs +1R" value={inr(levels.plusOneR, 2)} hint={levels.timeStopDate ? `by ${format(parseISO(levels.timeStopDate), "d MMM")}` : undefined} />
                        <Metric label="Breakeven at (1.5R)" value={inr(levels.breakeven, 2)} />
                        <Metric label="Trail starts (2R)" value={inr(levels.trailStart, 2)} />
                        <Metric
                            label="Results in"
                            value={mb.resultsDate && formData.date ? `${tradingDaysBetween(formData.date, mb.resultsDate)} trading days` : "—"}
                            tone={mb.resultsDate && formData.date && tradingDaysBetween(formData.date, mb.resultsDate) >= 0 && tradingDaysBetween(formData.date, mb.resultsDate) <= 10 ? "bad" : undefined}
                            hint="Needs more than 10"
                        />
                    </div>
                </div>
            </div>

            {/* Section 4 */}
            {isOpen ? (
                <>
                    <input type="hidden" name="pnl" value="0" />
                    <input type="hidden" name="exit" value="0" />
                    <input type="hidden" name="fees" value={formData.fees || "0"} />
                    <div className="flex items-start gap-3 rounded-xl border border-sky-200 dark:border-sky-900/60 bg-sky-50/70 dark:bg-sky-950/20 p-4 text-sm">
                        <CircleDot className="h-4 w-4 mt-0.5 text-sky-600 dark:text-sky-400 shrink-0" />
                        <p className="text-sky-900 dark:text-sky-200">
                            {pending
                                ? "Pending GTT: delete it if it hasn't triggered within 3 trading days. When it fills, add the fill price and place the stop GTT the same day."
                                : "Open position. It shows on the Evening Routine with its breakeven, trail and time-stop levels. Come back here to close it."}
                        </p>
                    </div>
                </>
            ) : (
                <div className="space-y-4">
                    <h3 className={sectionTitle}>4. Exit &amp; Outcome</h3>
                    <div className={cn(panel, "space-y-4")}>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            <div className="space-y-2">
                                <Label htmlFor="exitDate">Exit date</Label>
                                <Input type="date" name="exitDate" id="exitDate" className="bg-background shadow-sm w-full" value={mb.exitDate} onChange={e => setMb({ exitDate: e.target.value })} />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="exit">Exit price</Label>
                                <Input type="number" step="any" name="exit" id="exit" placeholder="0.00" className={field} value={formData.exit} onChange={onInput} />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="fees">Charges</Label>
                                <Input type="number" step="any" name="fees" id="fees" placeholder="≈ 50" className={field} value={formData.fees} onChange={onInput} />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="exitReason">Exit reason</Label>
                                <select
                                    name="exitReason"
                                    id="exitReason"
                                    value={mb.exitReason}
                                    onChange={e => setMb({ exitReason: e.target.value })}
                                    className="flex h-10 w-full rounded-md border border-input shadow-sm bg-background px-3 py-2 text-sm"
                                >
                                    <option value="">Choose…</option>
                                    {EXIT_REASONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                                </select>
                            </div>
                        </div>
                        <div className="flex flex-col md:flex-row gap-4 md:items-end">
                            <div className="flex-1 space-y-2">
                                <Label htmlFor="pnl">{isPaper ? "Simulated P/L (net)" : "Realized P/L (net)"}</Label>
                                <Input
                                    type="number" name="pnl" id="pnl" placeholder="0.00" step="any" required
                                    className={cn("font-bold text-xl h-12 w-full", parseFloat(formData.pnl) > 0 ? "bg-emerald-50 dark:bg-emerald-950/20 border-emerald-500 text-emerald-600" : parseFloat(formData.pnl) < 0 ? "bg-red-50 dark:bg-red-950/20 border-red-500 text-red-600" : "bg-background")}
                                    value={formData.pnl} onChange={onInput}
                                />
                                {calculatedPnl !== null && formData.pnl !== "" && calculatedPnl.toFixed(2) !== parseFloat(formData.pnl).toFixed(2) && (
                                    <p className="text-xs text-red-500 font-medium">Entered P/L does not match calculated P/L ({calculatedPnl.toFixed(2)}).</p>
                                )}
                            </div>
                            <div className="md:w-48">
                                <Metric
                                    label="Result in R"
                                    value={levels.plannedRisk && formData.pnl !== "" ? `${(parseFloat(formData.pnl) / levels.plannedRisk >= 0 ? "+" : "")}${(parseFloat(formData.pnl) / levels.plannedRisk).toFixed(2)}R` : "—"}
                                    tone={formData.pnl !== "" ? (parseFloat(formData.pnl) >= 0 ? "good" : "bad") : undefined}
                                />
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </>
    )
}

export function BreakoutChecklist({
    mb,
    setMb,
    suggested,
    gradeManuallySet,
    onGradeChange,
    onResetGrade,
    plannedRisk,
}: {
    mb: BreakoutState
    setMb: (patch: Partial<BreakoutState>) => void
    suggested: Grade
    gradeManuallySet: boolean
    onGradeChange: (g: Grade) => void
    onResetGrade: () => void
    plannedRisk: number | null
}) {
    const isOpen = mb.status === "open"
    const toggle = (id: string, checked: boolean) =>
        setMb({ checklist: checked ? [...mb.checklist, id] : mb.checklist.filter(c => c !== id) })

    const gradeStyles: Record<Grade, string> = {
        A: "ring-2 ring-amber-400 bg-amber-50 border-amber-300 dark:bg-amber-950/30 dark:border-amber-700",
        B: "ring-2 ring-zinc-400 bg-zinc-50 border-zinc-300 dark:bg-zinc-800/50 dark:border-zinc-600",
        C: "ring-2 ring-red-400 bg-red-50 border-red-300 dark:bg-red-950/30 dark:border-red-700",
    }

    return (
        <div className="space-y-4">
            <input type="hidden" name="processGrade" value={mb.processGrade} />
            <div className="flex items-center justify-between">
                <h3 className="text-base sm:text-lg font-semibold text-primary">5. Constitution Checklist</h3>
                <span className="text-xs font-semibold text-muted-foreground">
                    {mb.checklist.filter(id => !(isOpen && id === "exit")).length} / {isOpen ? 7 : 8}
                </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {CHECKLIST.map((item, i) => {
                    const disabled = isOpen && item.needsExit
                    return (
                        <label
                            key={item.id}
                            htmlFor={`check-${item.id}`}
                            className={cn(
                                "flex items-start gap-3 bg-background p-3 rounded-lg border shadow-sm transition-colors cursor-pointer hover:border-primary/50",
                                disabled && "opacity-50 cursor-not-allowed hover:border-border",
                                mb.checklist.includes(item.id) && !disabled && "border-emerald-300 dark:border-emerald-800 bg-emerald-50/40 dark:bg-emerald-950/10"
                            )}
                        >
                            <input
                                type="checkbox"
                                id={`check-${item.id}`}
                                name="checklist"
                                value={item.id}
                                disabled={disabled}
                                checked={!disabled && mb.checklist.includes(item.id)}
                                onChange={e => toggle(item.id, e.target.checked)}
                                className="mt-0.5 h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-600"
                            />
                            <span className="text-sm leading-snug">
                                <span className="font-semibold text-muted-foreground mr-1">{i + 1}.</span>
                                {item.label}
                                {disabled && <span className="block text-[11px] text-muted-foreground mt-0.5">Answer when you close the trade.</span>}
                            </span>
                        </label>
                    )
                })}
            </div>

            <div className="flex items-center justify-between pt-2">
                <Label>Process grade</Label>
                {gradeManuallySet ? (
                    <button type="button" onClick={onResetGrade} className="text-xs text-muted-foreground hover:text-foreground underline">
                        Reset to auto ({suggested})
                    </button>
                ) : (
                    <span className="text-xs text-muted-foreground">Auto from checklist and rule checks</span>
                )}
            </div>
            <div className="grid grid-cols-3 gap-3">
                {(["A", "B", "C"] as Grade[]).map(g => (
                    <button
                        key={g}
                        type="button"
                        onClick={() => onGradeChange(g)}
                        className={cn(
                            "flex flex-col items-center gap-1 p-3 sm:p-4 rounded-xl border-2 transition-all hover:shadow-md",
                            mb.processGrade === g ? gradeStyles[g] : "border-border bg-card hover:border-muted-foreground/30"
                        )}
                    >
                        <span className={cn("text-2xl font-extrabold", mb.processGrade === g ? "text-foreground" : "text-muted-foreground/60")}>{g}</span>
                        <span className="text-[10px] sm:text-xs text-muted-foreground text-center leading-tight">{GRADE_INFO[g].description}</span>
                    </button>
                ))}
            </div>

            <div className="space-y-2">
                <Label htmlFor="repeatNote">One line on what you&apos;d repeat</Label>
                <Input id="repeatNote" name="repeatNote" placeholder="e.g. Waited for the GTT; didn't touch Kite during work" className="bg-background shadow-sm" value={mb.repeatNote} onChange={e => setMb({ repeatNote: e.target.value })} />
            </div>

            <p className="text-sm italic text-muted-foreground border-l-2 border-indigo-400 pl-3">
                &ldquo;{PLEDGE(plannedRisk ? Math.round(plannedRisk).toLocaleString("en-IN") : "___")}&rdquo;
            </p>
        </div>
    )
}

const levelStyles: Record<number, string> = {
    1: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
    2: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
    3: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
    4: "bg-red-600 text-white",
}

export function LevelBadge({ level }: { level: number }) {
    return <span className={cn("inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide", levelStyles[level])}>Level {level}</span>
}

export function RuleFindings({ findings, isPaper }: { findings: Finding[]; isPaper: boolean }) {
    if (findings.length === 0) {
        return (
            <div className="flex items-center gap-2 rounded-xl border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/60 dark:bg-emerald-950/20 p-3 text-sm text-emerald-800 dark:text-emerald-300">
                <ShieldAlert className="h-4 w-4" /> Every rule check passes.
            </div>
        )
    }
    const breaches = findings.filter(f => f.level !== null)
    return (
        <div className="rounded-xl border border-border/60 bg-background/60 p-4 space-y-2">
            <p className="text-sm font-semibold flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-500" /> Rule checks
                {breaches.length > 0 && !isPaper && <span className="text-xs font-normal text-muted-foreground">— breaches are logged to your consequence ladder when you save</span>}
                {breaches.length > 0 && isPaper && <span className="text-xs font-normal text-muted-foreground">— paper trade: not logged, but it counts against the paper stage</span>}
            </p>
            <ul className="space-y-1.5">
                {findings.map(f => (
                    <li key={f.code + f.message} className="flex items-start gap-2 text-sm">
                        {f.level !== null ? <LevelBadge level={f.level} /> : <Info className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />}
                        <span className={f.level !== null ? "text-foreground" : "text-muted-foreground"}>{f.message}</span>
                    </li>
                ))}
            </ul>
        </div>
    )
}
