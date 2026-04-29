"use client"

import * as React from "react"
import { Save, Calculator, Plus, Trash2 } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import { addNewTrade, updateTradeAction } from "@/app/actions"
import { useRouter } from "next/navigation"
import type { Rule } from "@/lib/db"

export function TradeForm({ rules, initialData, id }: { rules: Rule[], initialData?: any, id?: string }) {
    const router = useRouter()
    const [isSubmitting, setIsSubmitting] = React.useState(false)

    // Form inputs state
    const [formData, setFormData] = React.useState({
        entry: initialData?.entryPrice?.toString() || "",
        exit: initialData?.exitPrice?.toString() || "",
        quantity: initialData?.quantity?.toString() || "",
        fees: initialData?.fees?.toString() || "",
        type: initialData?.type || "buy", // buy | sell
        pnl: initialData?.pnl?.toString() || "",
        symbol: initialData?.symbol || "",
        analysis: initialData?.analysis || "",
        rules: initialData?.rules || ([] as string[]),
        date: initialData?.date || new Date().toISOString().split('T')[0]
    })

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

    const handleSubmit = async (data: FormData) => {
        setIsSubmitting(true)
        try {
            data.append("isBasket", isBasket.toString())
            if (isBasket) {
                // If basket, send the parsed legs as JSON
                formatiBasketLegs(data)
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
                router.push("/")
                router.refresh()
            }
        } catch (error) {
            console.error(error)
            toast.error("Failed to save trade due to network error")
        } finally {
            setIsSubmitting(false)
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

    return (
        <Card className="w-full shadow-xl border-zinc-200 dark:border-zinc-800 bg-card">
            <CardHeader className="border-b border-border/50 pb-6">
                <CardTitle className="text-2xl font-bold flex items-center gap-2">
                    {id ? "Edit Trade" : "Trade Entry"}
                </CardTitle>
                <CardDescription>
                    {id ? "Modify your logged position." : "Record your execution details. Multi-leg basket orders supported."}
                </CardDescription>
            </CardHeader>
            <CardContent className="pt-6">
                <form className="space-y-8" action={handleSubmit}>
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
                                <Label htmlFor="pnl" className="text-sm border-b-0 mb-2 block font-medium">Realized P/L</Label>
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

                    <div className="space-y-4">
                        <div className="flex items-center justify-between">
                            <h3 className="text-base sm:text-lg font-semibold flex items-center gap-2 text-primary">
                                4. Psychology & Evidence
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
                                <Label>Discipline / Custom Rules Followed</Label>
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

                    <div className="flex justify-end pt-2">
                        <Button type="submit" disabled={isSubmitting} size="lg" className="w-full md:w-auto bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 transition-all font-bold px-10 py-6 text-lg shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 rounded-xl">
                            {isSubmitting ? (
                                <>Saving...</>
                            ) : (
                                <>
                                    <Save className="mr-2 h-5 w-5" /> {id ? "Update Trade" : "Save Trade"}
                                </>
                            )}
                        </Button>
                    </div>
                </form>
            </CardContent>
        </Card>
    )
}
