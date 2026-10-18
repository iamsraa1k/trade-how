"use client"

import * as React from "react"
import { Save, Calculator, Plus, Trash2, FileText, Star, ThumbsDown, Minus, Rocket, Layers, ScrollText } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/shared/components/ui/button"
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/shared/components/ui/card"
import { Input } from "@/shared/components/ui/input"
import { Label } from "@/shared/components/ui/label"
import { Textarea } from "@/shared/components/ui/textarea"
import { Switch } from "@/shared/components/ui/switch"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/shared/components/ui/dialog"
import { addNewTrade, analyzeSymbolAction, updateTradeAction } from "@/app/actions"
import { useRouter } from "next/navigation"
import type { Rule } from "@/lib/db"
import { useData } from "@/shared/context/DataContext"
import { LADDER, SETUP_ID } from "@/features/constitution/lib/rules"
import { computeSizing, computeStatus, evaluateTrade, suggestGrade, tradeLevels, type Grade } from "@/features/constitution/lib/engine"
import { BreakoutChecklist, BreakoutFields, LevelBadge, RuleFindings, type BreakoutState } from "@/features/constitution/components/BreakoutFields"

type TradeQuality = "flawless" | "acceptable" | "violation"

const toNumber = (v: string) => (v === "" || isNaN(parseFloat(v)) ? null : parseFloat(v))

export function TradeForm({ rules, initialData, id, prefill }: { rules: Rule[], initialData?: any, id?: string, prefill?: Record<string, string> }) {
    const router = useRouter()
    const [isSubmitting, setIsSubmitting] = React.useState(false)
    const { trades, constitution, breaches, constitutionMode } = useData()

    // Form inputs state
    const [formData, setFormData] = React.useState({
        entry: initialData?.entryPrice?.toString() || "",
        exit: initialData?.exitPrice?.toString() || "",
        quantity: initialData?.quantity?.toString() || prefill?.qty || "",
        fees: initialData?.fees?.toString() || "",
        type: initialData?.type || "buy", // buy | sell
        pnl: initialData?.pnl?.toString() || "",
        symbol: initialData?.symbol || prefill?.symbol?.toUpperCase() || "",
        analysis: initialData?.analysis || "",
        rules: initialData?.rules || ([] as string[]),
        date: initialData?.date || new Date().toISOString().split('T')[0]
    })

    const [isPaper, setIsPaper] = React.useState<boolean>(!!initialData?.isPaper || prefill?.paper === "1")
    const [tradeQuality, setTradeQuality] = React.useState<TradeQuality>(initialData?.tradeQuality || "acceptable")
    const [qualityManuallySet, setQualityManuallySet] = React.useState(false)

    const [isBasket, setIsBasket] = React.useState<boolean>(!!initialData?.isBasket)
    const [legs, setLegs] = React.useState(() => {
        if (initialData?.legs?.length > 0) {
            return initialData.legs.map((l:any) => ({
                symbol: l.symbol || "",
                type: l.type || "buy",
                entry: l.entryPrice?.toString() || "",
                exit: l.exitPrice?.toString() || "",
                quantity: l.quantity?.toString() || "",
                fees: l.fees?.toString() || ""
            }))
        }
        return [{ symbol: "", type: "buy", entry: "", exit: "", quantity: "", fees: "" }]
    })

    const [calculatedPnl, setCalculatedPnl] = React.useState<number | null>(null)

    // Trading Constitution: Momentum Breakout is the default setup for new trades.
    const [isBreakoutSetup, setIsBreakoutSetup] = React.useState<boolean>(initialData ? initialData.setup === SETUP_ID : constitutionMode)
    const [mb, setMbState] = React.useState<BreakoutState>(() => ({
        status: initialData ? (initialData.status === "open" ? "open" : "closed") : "open",
        sector: initialData?.sector || prefill?.sector || "",
        marketLight: initialData?.marketLight || "",
        baseWeeks: initialData?.baseWeeks?.toString() || "",
        volumeRatio: initialData?.volumeRatio?.toString() || "",
        trigger: initialData?.trigger?.toString() || prefill?.trigger || "",
        limitPrice: initialData?.limitPrice?.toString() || prefill?.limit || "",
        stopPrice: initialData?.stopPrice?.toString() || prefill?.stop || "",
        resultsDate: initialData?.resultsDate || "",
        exitDate: initialData?.exitDate || "",
        exitReason: initialData?.exitReason || "",
        checklist: initialData?.checklist || [],
        processGrade: initialData?.processGrade || "A",
        repeatNote: initialData?.repeatNote || "",
    }))
    const setMb = (patch: Partial<BreakoutState>) => setMbState(prev => ({ ...prev, ...patch }))
    const [manualGrade, setManualGrade] = React.useState<Grade | null>(null)
    const [pendingSubmit, setPendingSubmit] = React.useState<FormData | null>(null)
    const [autoFill, setAutoFill] = React.useState<{ loading: boolean; summary: string | null; ok: boolean }>({ loading: false, summary: null, ok: false })

    const constitutionStatus = React.useMemo(() => computeStatus(constitution, trades, breaches), [constitution, trades, breaches])
    const levels = tradeLevels({
        entryPrice: toNumber(formData.entry) || 0,
        limitPrice: toNumber(mb.limitPrice),
        stopPrice: toNumber(mb.stopPrice),
        quantity: toNumber(formData.quantity) || 0,
        date: formData.date,
        status: mb.status,
        pnl: toNumber(formData.pnl) ?? undefined,
    })
    const findings = isBreakoutSetup
        ? evaluateTrade({
            id,
            date: formData.date,
            isPaper,
            status: mb.status,
            sector: mb.sector,
            marketLight: mb.marketLight,
            baseWeeks: toNumber(mb.baseWeeks),
            volumeRatio: toNumber(mb.volumeRatio),
            entryPrice: toNumber(formData.entry),
            limitPrice: toNumber(mb.limitPrice),
            stopPrice: toNumber(mb.stopPrice),
            quantity: toNumber(formData.quantity),
            resultsDate: mb.resultsDate || null,
            exitReason: mb.exitReason,
        }, constitutionStatus, trades)
        : []
    const suggestedGrade = suggestGrade(mb.checklist, mb.status === "open", findings)
    const effectiveGrade = manualGrade ?? suggestedGrade
    const loggableBreaches = isBreakoutSetup && !isPaper ? findings.filter(f => f.level !== null) : []

    // Auto-detect trade quality based on rules checked (only if not manually overridden)
    React.useEffect(() => {
        if (isPaper || qualityManuallySet) return
        
        const checkedRules = formData.rules.length
        const totalRules = rules.length
        
        if (totalRules === 0) return // No rules defined, don't auto-detect
        
        if (checkedRules === totalRules) {
            setTradeQuality("flawless")
        } else if (checkedRules === 0) {
            setTradeQuality("violation")
        } else {
            setTradeQuality("acceptable")
        }
    }, [formData.rules, rules.length, isPaper, qualityManuallySet])

    const handleInput = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
        const { name, value, type } = e.target

        setFormData(prev => {
            const newData = { ...prev }

            if (type === 'checkbox' && name === 'rules') {
                const target = e.target as HTMLInputElement;
                if (target.checked) {
                    newData.rules = [...prev.rules, value];
                } else {
                    newData.rules = prev.rules.filter((r: string) => r !== value);
                }
            } else {
                (newData as any)[name] = value;
            }

            // Auto Calculation (Single mode)
            if (!isBasket && ['entry', 'exit', 'quantity', 'fees', 'type'].includes(name)) {
                const entry = parseFloat(newData.entry) || 0
                const exit = parseFloat(newData.exit) || 0
                const qty = parseFloat(newData.quantity) || 0
                const fees = parseFloat(newData.fees) || 0

                if (entry && exit && qty) {
                    let rawPnl = 0
                    if (newData.type === 'buy') {
                        rawPnl = (exit - entry) * qty
                    } else {
                        rawPnl = (entry - exit) * qty
                    }
                    const finalPnl = rawPnl - fees
                    newData.pnl = finalPnl.toFixed(2)
                    setCalculatedPnl(finalPnl)
                } else {
                    setCalculatedPnl(null)
                }
            }
            return newData
        })
    }

    const handleLegInput = (index: number, field: string, value: string) => {
        const newLegs = [...legs]
        ;(newLegs[index] as any)[field] = value

        setLegs(newLegs)

        // Calculate basket logic
        let totalPnl = 0
        let hasCalculableLeg = false
        newLegs.forEach(leg => {
            const entry = parseFloat(leg.entry) || 0
            const exit = parseFloat(leg.exit) || 0
            const qty = parseFloat(leg.quantity) || 0
            const fees = parseFloat(leg.fees) || 0
            
            if (entry && exit && qty) {
                hasCalculableLeg = true
                let rawPnl = leg.type === 'buy' ? (exit - entry) * qty : (entry - exit) * qty
                totalPnl += (rawPnl - fees)
            }
        })

        if (hasCalculableLeg) {
            setCalculatedPnl(totalPnl)
            setFormData(prev => ({ ...prev, pnl: totalPnl.toFixed(2) }))
        } else {
            setCalculatedPnl(null)
        }
    }

    const addLeg = () => {
        setLegs([...legs, { symbol: "", type: "buy", entry: "", exit: "", quantity: "", fees: "" }])
    }

    const removeLeg = (index: number) => {
        if (legs.length === 1) return
        const newLegs = legs.filter((_: any, i: number) => i !== index)
        setLegs(newLegs)
        
        // Recalculate
        let totalPnl = 0
        let hasCalculableLeg = false
        newLegs.forEach((leg: any) => {
            const entry = parseFloat(leg.entry) || 0
            const exit = parseFloat(leg.exit) || 0
            const qty = parseFloat(leg.quantity) || 0
            const fees = parseFloat(leg.fees) || 0
            
            if (entry && exit && qty) {
                hasCalculableLeg = true
                const rawPnl = leg.type === 'buy' ? (exit - entry) * qty : (entry - exit) * qty
                totalPnl += (rawPnl - fees)
            }
        })

        if (hasCalculableLeg) {
            setCalculatedPnl(totalPnl)
            setFormData(prev => ({ ...prev, pnl: totalPnl.toFixed(2) }))
        } else {
            setCalculatedPnl(null)
        }
    }

    // Pulls the breakout day's numbers from market data and fills what the evening routine would have looked up.
    const handleAutoFill = async () => {
        setAutoFill({ loading: true, summary: null, ok: false })
        const result = await analyzeSymbolAction(formData.symbol, formData.date || null)
        if (!result.success || !result.data) {
            setAutoFill({ loading: false, summary: result.error || "Couldn't fetch market data.", ok: false })
            return
        }
        const d = result.data
        const sizing = computeSizing({ high: d.high, low: d.low, equity: constitutionStatus.monthEquity, riskPct: constitutionStatus.riskPct, capPct: constitutionStatus.settings.positionCapPct })
        const plan = "error" in sizing ? null : sizing
        const confirmed = new Set(mb.checklist)
        const setItem = (id: string, on: boolean) => (on ? confirmed.add(id) : confirmed.delete(id))
        setItem("light", d.marketLight === "green")
        setItem("strong", d.checks.aboveSma50 && d.checks.sma50AboveSma200 && d.checks.sma200Rising && d.checks.near52wHigh)
        setItem("breakout", d.isBreakout)
        setMb({
            sector: d.sector,
            marketLight: d.marketLight,
            baseWeeks: String(d.baseWeeks),
            volumeRatio: String(d.volumeRatio),
            resultsDate: d.resultsDate || mb.resultsDate,
            trigger: mb.trigger || (plan ? plan.trigger.toFixed(1) : ""),
            limitPrice: mb.limitPrice || (plan ? plan.limit.toFixed(1) : ""),
            stopPrice: mb.stopPrice || (plan ? plan.stop.toFixed(1) : ""),
            checklist: [...confirmed],
        })
        if (!formData.quantity && plan && !plan.skip) setFormData(prev => ({ ...prev, quantity: String(plan.shares) }))
        const failed = Object.entries(d.checks).filter(([, ok]) => !ok).map(([k]) => k.replace(/([A-Z])/g, " $1").toLowerCase())
        setAutoFill({
            loading: false,
            ok: d.isBreakout && d.marketLight === "green",
            summary: `${d.name}: ${d.isBreakout ? `breakout on ${d.breakoutDate}` : `not a breakout on ${d.breakoutDate} (failed: ${failed.join(", ")})`}. Light ${d.marketLight}, volume ${d.volumeRatio}×, ${d.baseWeeks}-week base${d.resultsDate ? `, results ${d.resultsDate}` : ", results date not announced"}.${plan?.skip ? " Stop wider than 8%: skip." : ""}`,
        })
    }

    const handleSubmit = async (data: FormData) => {
        // Live trades that break the constitution go through a confirmation that logs the breaches.
        if (loggableBreaches.length > 0) {
            setPendingSubmit(data)
            return
        }
        await submitTrade(data)
    }

    const submitTrade = async (data: FormData) => {
        setIsSubmitting(true)
        try {
            data.append("isPaper", isPaper.toString())
            if (isBreakoutSetup) {
                data.append("isBasket", "false")
                data.set("processGrade", effectiveGrade)
                if (loggableBreaches.length > 0) {
                    data.append("breachesData", JSON.stringify(loggableBreaches.map(f => ({
                        date: formData.date,
                        level: f.level,
                        code: f.code,
                        note: `${formData.symbol.toUpperCase()}: ${f.message}`,
                    }))))
                }
            } else {
                data.append("isBasket", isBasket.toString())
                if (!isPaper) {
                    data.append("tradeQuality", tradeQuality)
                }
                if (isBasket) {
                    // If basket, send the parsed legs as JSON
                    formatiBasketLegs(data)
                }
            }
            
            let result;
            if (id) {
                result = await updateTradeAction(id, data);
            } else {
                result = await addNewTrade(data);
            }

            if (result?.error) {
                toast.error(result.error)
            } else {
                toast.success(id ? "Trade updated successfully!" : "Trade saved successfully")
                if (loggableBreaches.length > 0) {
                    toast.warning(`${loggableBreaches.length} breach${loggableBreaches.length === 1 ? "" : "es"} logged to your consequence ladder`)
                }
                router.push(isBreakoutSetup && mb.status === "open" ? "/routine" : "/")
                router.refresh()
            }
        } catch (error) {
            console.error(error)
            toast.error("Failed to save trade due to network error")
        } finally {
            setIsSubmitting(false)
            setPendingSubmit(null)
        }
    }
    
    const formatiBasketLegs = (data: FormData) => {
        const cleanLegs = legs.map((l: any) => ({
            symbol: l.symbol || formData.symbol,
            type: l.type,
            entryPrice: parseFloat(l.entry) || 0,
            exitPrice: parseFloat(l.exit) || 0,
            quantity: parseFloat(l.quantity) || 0,
            fees: parseFloat(l.fees) || 0
        }))
        data.append("legsData", JSON.stringify(cleanLegs))
        
        if (!data.has("entry")) data.set("entry", "0")
        if (!data.has("exit")) data.set("exit", "0")
        if (!data.has("quantity")) data.set("quantity", "0")
        if (!data.has("fees")) data.set("fees", "0")
    }

    const qualityOptions: { value: TradeQuality; label: string; description: string; icon: React.ElementType; activeClasses: string; iconClasses: string }[] = [
        {
            value: "flawless",
            label: "Flawless",
            description: "All rules followed",
            icon: Star,
            activeClasses: "ring-2 ring-amber-400 bg-amber-50 border-amber-300 dark:bg-amber-950/30 dark:border-amber-700",
            iconClasses: "text-amber-500 fill-amber-500"
        },
        {
            value: "acceptable",
            label: "Acceptable",
            description: "Minor tweaks only",
            icon: Minus,
            activeClasses: "ring-2 ring-zinc-400 bg-zinc-50 border-zinc-300 dark:bg-zinc-800/50 dark:border-zinc-600",
            iconClasses: "text-zinc-400"
        },
        {
            value: "violation",
            label: "Violation",
            description: "Broke trading rules",
            icon: ThumbsDown,
            activeClasses: "ring-2 ring-red-400 bg-red-50 border-red-300 dark:bg-red-950/30 dark:border-red-700",
            iconClasses: "text-red-500"
        },
    ]

    return (
        <Card className={`w-full glass-card transition-all duration-300 ${isPaper ? 'border-teal-300 dark:border-teal-800 ring-1 ring-teal-200/50 dark:ring-teal-900/50 shadow-teal-500/10' : ''}`}>
            <CardHeader className="border-b border-border/50 pb-6">
                <div className="flex items-center justify-between flex-wrap gap-3">
                    <CardTitle className="text-2xl font-bold flex items-center gap-2">
                        {isPaper && <FileText className="h-6 w-6 text-teal-500" />}
                        {id ? "Edit Trade" : "Trade Entry"}
                        {isPaper && <span className="text-sm font-semibold bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-400 px-2.5 py-0.5 rounded-full ml-1">PAPER</span>}
                        {isBreakoutSetup && <span className="text-xs font-semibold bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300 px-2.5 py-0.5 rounded-full ml-1">MOMENTUM BREAKOUT</span>}
                    </CardTitle>
                    
                    {/* Paper Trade Toggle */}
                    <div className={`flex items-center space-x-2.5 p-2 px-3.5 rounded-xl border shadow-sm transition-all duration-300 ${isPaper ? 'bg-teal-50 border-teal-200 dark:bg-teal-950/30 dark:border-teal-800' : 'bg-muted/30 border-border'}`}>
                        <FileText className={`h-4 w-4 transition-colors ${isPaper ? 'text-teal-500' : 'text-muted-foreground'}`} />
                        <Label htmlFor="paper-mode" className={`text-sm cursor-pointer whitespace-nowrap font-medium transition-colors ${isPaper ? 'text-teal-700 dark:text-teal-400' : 'text-foreground'}`}>
                            Paper Trade
                        </Label>
                        <Switch 
                            id="paper-mode" 
                            checked={isPaper} 
                            onCheckedChange={(checked: boolean) => {
                                setIsPaper(checked)
                                if (checked) {
                                    setTradeQuality("acceptable")
                                    setQualityManuallySet(false)
                                }
                            }}
                        />
                    </div>
                </div>
                <CardDescription>
                    {isPaper 
                        ? "Record a simulated paper trade for practice and backtesting." 
                        : isBreakoutSetup
                            ? "Journal the plan tonight, the fill when it arrives, and the exit when a written rule fires."
                            : id 
                                ? "Modify your logged position." 
                                : "Record your execution details. Multi-leg basket orders supported."
                    }
                </CardDescription>
            </CardHeader>
            <CardContent className="pt-6">
                <form className="space-y-8" action={handleSubmit}>
                    {/* Setup picker (constitution mode only) */}
                    {constitutionMode && (
                    <div className="grid grid-cols-2 gap-3">
                        {[
                            { breakout: true, icon: Rocket, title: "Momentum Breakout", subtitle: "Constitution setup · CNC swing" },
                            { breakout: false, icon: Layers, title: "Other / legacy", subtitle: "Intraday, F&O, baskets" },
                        ].map(opt => (
                            <button
                                key={opt.title}
                                type="button"
                                onClick={() => {
                                    setIsBreakoutSetup(opt.breakout)
                                    if (opt.breakout) {
                                        setFormData(prev => ({ ...prev, type: "buy" }))
                                        setIsBasket(false)
                                    }
                                    setCalculatedPnl(null)
                                }}
                                className={`flex items-center gap-3 rounded-xl border-2 p-3 sm:p-4 text-left transition-all ${isBreakoutSetup === opt.breakout ? 'border-indigo-400 bg-indigo-50/70 dark:bg-indigo-950/30 dark:border-indigo-700 ring-1 ring-indigo-300/50' : 'border-border bg-card hover:border-muted-foreground/30'}`}
                            >
                                <opt.icon className={`h-5 w-5 shrink-0 ${isBreakoutSetup === opt.breakout ? 'text-indigo-600 dark:text-indigo-400' : 'text-muted-foreground'}`} />
                                <span className="min-w-0">
                                    <span className="block text-sm font-bold truncate">{opt.title}</span>
                                    <span className="block text-[11px] text-muted-foreground truncate">{opt.subtitle}</span>
                                </span>
                            </button>
                        ))}
                    </div>
                    )}

                    {constitutionMode && !isBreakoutSetup && !isPaper && !id && (
                        <div className="flex items-start gap-3 rounded-xl border border-amber-200 dark:border-amber-900/60 bg-amber-50/70 dark:bg-amber-950/20 p-4 text-sm text-amber-900 dark:text-amber-200">
                            <ScrollText className="h-4 w-4 mt-0.5 shrink-0" />
                            <p>Your constitution allows one live setup: Momentum Breakout, delivery only. A trade outside the setup is a Level 2 breach, and any F&amp;O trade is Level 4. Log it in the Discipline page if this is one.</p>
                        </div>
                    )}

                    {isBreakoutSetup ? (
                        <BreakoutFields
                            formData={formData}
                            onInput={handleInput}
                            mb={mb}
                            setMb={setMb}
                            levels={levels}
                            status={constitutionStatus}
                            isPaper={isPaper}
                            calculatedPnl={calculatedPnl}
                            onAutoFill={handleAutoFill}
                            autoFillState={autoFill}
                        />
                    ) : (<>
                    {/* Section 1: Asset Details */}
                    <div className="space-y-4">
                        <div className="flex items-center justify-between">
                            <h3 className="text-base sm:text-lg font-semibold flex items-center gap-2 text-primary">
                                1. Trade Details
                            </h3>
                        </div>
                        <div className="flex flex-col md:grid md:grid-cols-2 gap-4 md:gap-6 bg-muted/20 p-4 rounded-xl border border-border/50">
                            <div className="space-y-2">
                                <Label htmlFor="date">Date</Label>
                                <Input
                                    type="date"
                                    name="date"
                                    id="date"
                                    required
                                    className="bg-background shadow-sm w-full"
                                    value={formData.date}
                                    onChange={handleInput}
                                />
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="symbol">Symbol / Asset</Label>
                                <Input
                                    name="symbol"
                                    id="symbol"
                                    placeholder="e.g. NIFTY or STRANGLE"
                                    required
                                    className="bg-background font-mono uppercase shadow-sm w-full"
                                    value={formData.symbol}
                                    onChange={handleInput}
                                />
                            </div>
                            
                            {!isBasket && (
                                <div className="space-y-2 md:col-span-2 lg:col-span-1">
                                    <Label htmlFor="type">Position Type</Label>
                                    <select
                                        name="type"
                                        id="type"
                                        value={formData.type}
                                        onChange={handleInput}
                                        className="flex h-10 w-full items-center justify-between rounded-md border border-input shadow-sm bg-background px-3 py-2 text-sm ring-offset-background disabled:cursor-not-allowed disabled:opacity-50"
                                    >
                                        <option value="buy">Buy</option>
                                        <option value="sell">Sell</option>
                                    </select>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Section 2: Execution Logic */}
                    <div className="space-y-4">
                        <div className="flex items-center justify-between">
                            <h3 className="text-base sm:text-lg font-semibold flex items-center gap-2 text-primary">
                                2. Execution (₹)
                            </h3>
                            <div className="flex items-center space-x-2 bg-muted/30 p-1.5 sm:p-2 rounded-lg border shadow-sm">
                                <Switch id="basket-mode" checked={isBasket} onCheckedChange={(checked: boolean) => {
                                    setIsBasket(checked)
                                    setCalculatedPnl(null)
                                }} />
                                <Label htmlFor="basket-mode" className="text-xs sm:text-sm cursor-pointer whitespace-nowrap text-foreground font-medium">Basket Order</Label>
                            </div>
                        </div>

                        {isBasket ? (
                            <div className="space-y-4">
                                {legs.map((leg: any, index: number) => (
                                    <div key={index} className="flex flex-col md:grid md:grid-cols-6 gap-3 bg-muted/10 p-4 pt-5 rounded-xl border border-border/50 relative shadow-sm group">
                                        <div className="absolute -left-2.5 -top-2.5 bg-primary text-primary-foreground w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shadow-md z-10">
                                            {index + 1}
                                        </div>
                                        {legs.length > 1 && (
                                            <Button type="button" size="icon" variant="destructive" onClick={() => removeLeg(index)} className="absolute -top-3 -right-3 h-7 w-7 rounded-full sm:opacity-0 group-hover:opacity-100 transition-opacity shadow-md z-10">
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                        )}
                                        
                                        <div className="grid grid-cols-2 md:grid-cols-5 md:col-span-5 gap-3 mt-2 md:mt-0">
                                            <div className="space-y-1.5 md:col-span-2">
                                                <Label className="text-xs">Leg Symbol <span className="text-muted-foreground font-normal">(optional)</span></Label>
                                                <Input placeholder="e.g. 23500 CE" value={leg.symbol} onChange={(e) => handleLegInput(index, 'symbol', e.target.value)} className="h-9 text-sm w-full bg-background font-mono uppercase" />
                                            </div>
                                            <div className="space-y-1.5">
                                                <Label className="text-xs">Action</Label>
                                                <select value={leg.type} onChange={(e) => handleLegInput(index, 'type', e.target.value)} className="flex h-9 w-full items-center justify-between rounded-md border border-input bg-background px-2 text-sm">
                                                    <option value="buy">Buy</option>
                                                    <option value="sell">Sell</option>
                                                </select>
                                            </div>
                                            <div className="space-y-1.5">
                                                <Label className="text-xs">Qty / Lots</Label>
                                                <Input type="number" value={leg.quantity} onChange={(e) => handleLegInput(index, 'quantity', e.target.value)} className="h-9 w-full text-sm bg-background" />
                                            </div>
                                            <div className="space-y-1.5">
                                                <Label className="text-xs">Entry</Label>
                                                <Input type="number" step="any" value={leg.entry} onChange={(e) => handleLegInput(index, 'entry', e.target.value)} className="h-9 w-full text-sm bg-background" />
                                            </div>
                                            <div className="space-y-1.5">
                                                <Label className="text-xs">Exit</Label>
                                                <Input type="number" step="any" value={leg.exit} onChange={(e) => handleLegInput(index, 'exit', e.target.value)} className="h-9 w-full text-sm bg-background" />
                                            </div>
                                            <div className="space-y-1.5">
                                                <Label className="text-xs">Charges</Label>
                                                <Input type="number" step="any" value={leg.fees || ""} onChange={(e) => handleLegInput(index, 'fees', e.target.value)} className="h-9 w-full text-sm bg-background" placeholder="0" />
                                            </div>
                                        </div>
                                    </div>
                                ))}
                                <Button type="button" variant="outline" onClick={addLeg} className="w-full border-dashed border-2 py-6 text-muted-foreground hover:text-foreground">
                                    <Plus className="mr-2 h-4 w-4" /> Add Leg
                                </Button>
                            </div>
                        ) : (
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 bg-muted/20 p-4 rounded-xl border border-border/50">
                                <div className="space-y-2">
                                    <Label htmlFor="entry">Entry (₹)</Label>
                                    <Input
                                        type="number" name="entry" id="entry" placeholder="0.00" step="any"
                                        className="bg-background font-mono shadow-sm w-full"
                                        value={formData.entry} onChange={handleInput}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="exit">Exit (₹)</Label>
                                    <Input
                                        type="number" name="exit" id="exit" placeholder="0.00" step="any"
                                        className="bg-background font-mono shadow-sm w-full"
                                        value={formData.exit} onChange={handleInput}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="quantity">Qty / Lots</Label>
                                    <Input
                                        type="number" name="quantity" id="quantity" placeholder="1"
                                        className="bg-background font-mono shadow-sm w-full"
                                        value={formData.quantity} onChange={handleInput}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="fees">Fees (₹)</Label>
                                    <Input
                                        type="number" name="fees" id="fees" placeholder="0.00" step="any"
                                        className="bg-background font-mono shadow-sm w-full"
                                        value={formData.fees} onChange={handleInput}
                                    />
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Section 3: Calculated Outcome */}
                    <div className="space-y-4">
                        <h3 className="text-base sm:text-lg font-semibold flex items-center gap-2 text-primary">
                            3. Net Outcome
                        </h3>
                        <div className="bg-muted/20 p-4 rounded-xl border border-border/50 flex flex-col md:flex-row gap-6 items-center">
                            <div className="flex-1 w-full relative">
                                <Label htmlFor="pnl" className="text-sm border-b-0 mb-2 block font-medium">
                                    {isPaper ? "Simulated P/L" : "Realized P/L"}
                                </Label>
                                <div className="relative shadow-sm rounded-md">
                                    <Calculator className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                                    <Input
                                        type="number"
                                        name="pnl"
                                        id="pnl"
                                        placeholder="0.00"
                                        step="any"
                                        className={`pl-10 font-bold text-xl sm:text-2xl h-12 sm:h-14 transition-colors w-full ${parseFloat(formData.pnl) > 0 ? 'bg-emerald-50 dark:bg-emerald-950/20 border-emerald-500 text-emerald-600' : parseFloat(formData.pnl) < 0 ? 'bg-red-50 dark:bg-red-950/20 border-red-500 text-red-600' : 'bg-background'}`}
                                        required
                                        value={formData.pnl}
                                        onChange={handleInput}
                                    />
                                </div>
                                <div className="flex flex-col mt-2 min-h-[20px]">
                                    {calculatedPnl !== null && formData.pnl !== "" && calculatedPnl.toFixed(2) !== parseFloat(formData.pnl).toFixed(2) && (
                                        <p className="text-[10px] sm:text-xs text-red-500 font-medium bg-red-50 dark:bg-red-950 p-1.5 rounded-md inline-block w-fit">
                                            Warning: Entered P/L does not match calculated P/L.
                                        </p>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                    </>)}

                    {isBreakoutSetup && (
                        <BreakoutChecklist
                            mb={{ ...mb, processGrade: effectiveGrade }}
                            setMb={setMb}
                            suggested={suggestedGrade}
                            gradeManuallySet={manualGrade !== null}
                            onGradeChange={setManualGrade}
                            onResetGrade={() => setManualGrade(null)}
                            plannedRisk={levels.plannedRisk}
                        />
                    )}

                    <div className="space-y-4">
                        <div className="flex items-center justify-between">
                            <h3 className="text-base sm:text-lg font-semibold flex items-center gap-2 text-primary">
                                {isBreakoutSetup ? "6. Notes & Evidence" : "4. Psychology & Evidence"}
                            </h3>
                        </div>
                        <div className="grid grid-cols-1 gap-6 bg-muted/20 p-4 rounded-xl border border-border/50">
                            <div className="space-y-2">
                                <Label htmlFor="analysis">Analysis & Notes</Label>
                                <Textarea
                                    name="analysis"
                                    id="analysis"
                                    placeholder="Why did you take this trade? What happened? (Optional)"
                                    className="min-h-[80px] bg-background shadow-sm w-full"
                                    value={formData.analysis}
                                    onChange={handleInput}
                                />
                            </div>

                            <div className="space-y-3">
                                <Label>{isBreakoutSetup ? "Your custom rules (optional)" : "Discipline / Custom Rules Followed"}</Label>
                                {rules.length === 0 ? (
                                    <p className="text-sm text-muted-foreground border border-dashed p-4 rounded-xl bg-background/50">
                                        No custom rules added yet. Add rules in the dashboard to track your discipline!
                                    </p>
                                ) : (
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[220px] overflow-y-auto p-1 custom-scrollbar">
                                        {rules.map((rule) => (
                                            <div key={rule.id} className="flex items-start space-x-3 bg-background p-3 rounded-lg border shadow-sm hover:border-primary/50 transition-colors">
                                                <input
                                                    type="checkbox"
                                                    id={`rule-${rule.id}`}
                                                    name="rules"
                                                    value={rule.text}
                                                    checked={formData.rules.includes(rule.text)}
                                                    onChange={handleInput}
                                                    className="mt-1 h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-600"
                                                />
                                                <label htmlFor={`rule-${rule.id}`} className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer flex-1">
                                                    {rule.text}
                                                </label>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Section 5: Trade Quality — Only for Regular Trades */}
                    {!isPaper && !isBreakoutSetup && (
                        <div className="space-y-4">
                            <div className="flex items-center justify-between">
                                <h3 className="text-base sm:text-lg font-semibold flex items-center gap-2 text-primary">
                                    5. Trade Quality
                                </h3>
                                {qualityManuallySet && (
                                    <button
                                        type="button"
                                        onClick={() => setQualityManuallySet(false)}
                                        className="text-xs text-muted-foreground hover:text-foreground underline transition-colors"
                                    >
                                        Reset to auto-detect
                                    </button>
                                )}
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                {qualityOptions.map((opt) => {
                                    const isSelected = tradeQuality === opt.value
                                    const IconComp = opt.icon
                                    return (
                                        <button
                                            key={opt.value}
                                            type="button"
                                            onClick={() => {
                                                setTradeQuality(opt.value)
                                                setQualityManuallySet(true)
                                            }}
                                            className={`relative flex flex-col items-center gap-2 p-4 sm:p-5 rounded-xl border-2 transition-all duration-200 cursor-pointer hover:shadow-md ${
                                                isSelected
                                                    ? opt.activeClasses
                                                    : 'border-border bg-card hover:border-muted-foreground/30'
                                            }`}
                                        >
                                            <IconComp className={`h-6 w-6 sm:h-7 sm:w-7 transition-colors ${isSelected ? opt.iconClasses : 'text-muted-foreground/50'}`} />
                                            <span className={`text-sm font-bold transition-colors ${isSelected ? 'text-foreground' : 'text-muted-foreground'}`}>
                                                {opt.label}
                                            </span>
                                            <span className="text-[10px] sm:text-xs text-muted-foreground text-center leading-tight">
                                                {opt.description}
                                            </span>
                                        </button>
                                    )
                                })}
                            </div>
                        </div>
                    )}

                    {isBreakoutSetup && <RuleFindings findings={findings} isPaper={isPaper} />}

                    <div className="flex justify-end pt-2">
                        <Button type="submit" disabled={isSubmitting} size="lg" className={`w-full md:w-auto transition-all font-bold px-10 py-6 text-lg shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 rounded-xl ${
                            isPaper
                                ? 'bg-gradient-to-r from-teal-500 to-cyan-600 hover:from-teal-600 hover:to-cyan-700'
                                : 'bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700'
                        }`}>
                            {isSubmitting ? (
                                <>Saving...</>
                            ) : (
                                <>
                                    <Save className="mr-2 h-5 w-5" /> {id ? "Update Trade" : isPaper ? "Save Paper Trade" : "Save Trade"}
                                </>
                            )}
                        </Button>
                    </div>
                </form>
            </CardContent>

            <Dialog open={pendingSubmit !== null} onOpenChange={(open) => { if (!open && !isSubmitting) setPendingSubmit(null) }}>
                <DialogContent className="sm:max-w-lg">
                    <DialogHeader>
                        <DialogTitle>This trade breaks the constitution</DialogTitle>
                        <DialogDescription>
                            Saving logs these breaches to your consequence ladder. If a number is a typo, go back and fix it instead.
                        </DialogDescription>
                    </DialogHeader>
                    <ul className="space-y-3 py-2">
                        {loggableBreaches.map(f => (
                            <li key={f.code} className="flex items-start gap-2 text-sm">
                                <LevelBadge level={f.level!} />
                                <span>
                                    {f.message}
                                    <span className="block text-xs text-muted-foreground mt-0.5">{LADDER.find(l => l.level === f.level)?.consequence}</span>
                                </span>
                            </li>
                        ))}
                    </ul>
                    <div className="flex flex-col-reverse sm:flex-row justify-end gap-2">
                        <Button type="button" variant="outline" disabled={isSubmitting} onClick={() => setPendingSubmit(null)}>Go back and fix</Button>
                        <Button type="button" variant="destructive" disabled={isSubmitting} onClick={() => pendingSubmit && submitTrade(pendingSubmit)}>
                            {isSubmitting ? "Saving..." : `Save and log ${loggableBreaches.length === 1 ? "breach" : `${loggableBreaches.length} breaches`}`}
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>
        </Card>
    )
}
