"use client"

import * as React from "react"
import { UploadCloud, X, Save, Sparkles, ArrowRight, Calculator } from "lucide-react"

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
import { addNewTrade } from "@/app/actions"
import { useRouter } from "next/navigation"

export function TradeForm() {
    const router = useRouter()
    const [isSubmitting, setIsSubmitting] = React.useState(false)

    // Form inputs state for auto-calculation
    const [formData, setFormData] = React.useState({
        entry: "",
        exit: "",
        quantity: "",
        fees: "",
        type: "buy", // buy | sell
        pnl: "",
        symbol: "",
        analysis: "",
        emotions: "",
        date: new Date().toISOString().split('T')[0]
    })

    const handleInput = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target

        setFormData(prev => {
            const newData = { ...prev, [name]: value }

            // Auto Calculation
            if (['entry', 'exit', 'quantity', 'fees', 'type'].includes(name)) {
                const entry = parseFloat(newData.entry) || 0
                const exit = parseFloat(newData.exit) || 0
                const qty = parseFloat(newData.quantity) || 0
                const fees = parseFloat(newData.fees) || 0

                if (entry && exit && qty) {
                    let rawPnl = 0
                    if (newData.type === 'buy') {
                        // Long: (Exit - Entry) * Qty
                        rawPnl = (exit - entry) * qty
                    } else {
                        // Short: (Entry - Exit) * Qty
                        rawPnl = (entry - exit) * qty
                    }

                    const finalPnl = rawPnl - fees
                    newData.pnl = finalPnl.toFixed(2)
                }
            }
            return newData
        })
    }

    const handleSubmit = async (data: FormData) => {
        setIsSubmitting(true)
        // Ensure calculated P/L is sent if user didn't override it (though input is controlled now)
        // Note: the input 'pnl' will be in the FormData because it has a name attribute
        try {
            await addNewTrade(data)
            alert("Trade saved successfully!")
            router.push("/")
            router.refresh()
        } catch (error) {
            console.error(error)
            alert("Failed to save trade")
        } finally {
            setIsSubmitting(false)
        }
    }

    return (
        <Card className="w-full shadow-xl border-zinc-200 dark:border-zinc-800 bg-card">
            <CardHeader className="border-b border-border/50 pb-6">
                <CardTitle className="text-2xl font-bold flex items-center gap-2">
                    Trade Entry
                </CardTitle>
                <CardDescription>
                    Record your execution details. P/L is calculated automatically.
                </CardDescription>
            </CardHeader>
            <CardContent className="pt-6">
                <form className="space-y-8" action={handleSubmit}>
                    {/* Section 1: Asset Details */}
                    <div className="space-y-4">
                        <h3 className="text-lg font-semibold flex items-center gap-2 text-primary">
                            1. Trade Details
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-muted/20 p-4 rounded-lg border border-border/50">
                            <div className="space-y-2">
                                <Label htmlFor="date">Date</Label>
                                <Input
                                    type="date"
                                    name="date"
                                    id="date"
                                    required
                                    className="bg-background"
                                    value={formData.date}
                                    onChange={handleInput}
                                />
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="symbol">Symbol / Asset</Label>
                                <Input
                                    name="symbol"
                                    id="symbol"
                                    placeholder="e.g. NIFTY"
                                    required
                                    className="bg-background font-mono uppercase"
                                    value={formData.symbol}
                                    onChange={handleInput}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="type">Position Type</Label>
                                <select
                                    name="type"
                                    id="type"
                                    value={formData.type}
                                    onChange={handleInput}
                                    className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                    <option value="buy">Buy (Call/Long)</option>
                                    <option value="sell">Sell (Put/Short)</option>
                                </select>
                            </div>
                        </div>
                    </div>

                    {/* Section 2: Execution Logic */}
                    <div className="space-y-4">
                        <h3 className="text-lg font-semibold flex items-center gap-2 text-primary">
                            2. Execution (₹)
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-muted/20 p-4 rounded-lg border border-border/50">
                            <div className="space-y-2">
                                <Label htmlFor="entry">Entry Price (₹)</Label>
                                <Input
                                    type="number" name="entry" id="entry" placeholder="0.00" step="any" required
                                    className="bg-background font-mono"
                                    value={formData.entry} onChange={handleInput}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="exit">Exit Price (₹)</Label>
                                <Input
                                    type="number" name="exit" id="exit" placeholder="0.00" step="any" required
                                    className="bg-background font-mono"
                                    value={formData.exit} onChange={handleInput}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="quantity">Quantity / Lots</Label>
                                <Input
                                    type="number" name="quantity" id="quantity" placeholder="1" required
                                    className="bg-background font-mono"
                                    value={formData.quantity} onChange={handleInput}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="fees">Charges & Fees (₹)</Label>
                                <Input
                                    type="number" name="fees" id="fees" placeholder="0.00" step="any"
                                    className="bg-background font-mono"
                                    value={formData.fees} onChange={handleInput}
                                />
                            </div>
                        </div>
                    </div>

                    {/* Section 3: Calculated Outcome */}
                    <div className="space-y-4">
                        <h3 className="text-lg font-semibold flex items-center gap-2 text-primary">
                            3. Net Outcome
                        </h3>
                        <div className="bg-muted/20 p-4 rounded-lg border border-border/50 flex flex-col md:flex-row gap-6 items-center">
                            <div className="flex-1 w-full relative">
                                <Label htmlFor="pnl" className="text-base mb-2 block">Realized P/L (Auto-Calc)</Label>
                                <div className="relative">
                                    <Calculator className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                                    <Input
                                        type="number"
                                        name="pnl"
                                        id="pnl"
                                        placeholder="0.00"
                                        step="any"
                                        className={`pl-10 font-bold text-2xl h-16 transition-colors ${parseFloat(formData.pnl) > 0 ? 'bg-emerald-50 dark:bg-emerald-950/20 border-emerald-500 text-emerald-600' : parseFloat(formData.pnl) < 0 ? 'bg-red-50 dark:bg-red-950/20 border-red-500 text-red-600' : 'bg-background'}`}
                                        required
                                        value={formData.pnl}
                                        readOnly
                                    />
                                </div>
                                <p className="text-sm text-muted-foreground mt-2">
                                    {formData.type === 'buy' ? '(Exit - Entry) * Qty - Fees' : '(Entry - Exit) * Qty - Fees'}
                                </p>
                            </div>
                        </div>
                    </div>

                    <div className="space-y-4">
                        <div className="flex items-center justify-between">
                            <h3 className="text-lg font-semibold flex items-center gap-2 text-primary">
                                4. Psychology & Evidence
                            </h3>
                        </div>
                        <div className="grid grid-cols-1 gap-6 bg-muted/20 p-4 rounded-lg border border-border/50">
                            <div className="space-y-2">
                                <Label htmlFor="analysis">Analysis & Notes</Label>
                                <Textarea
                                    name="analysis"
                                    id="analysis"
                                    placeholder="Why did you take this trade? What happened?"
                                    className="min-h-[80px] bg-background"
                                    value={formData.analysis}
                                    onChange={handleInput}
                                />
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="emotions">Emotions / Mistakes (Mistake Chart Input)</Label>
                                <Textarea
                                    name="emotions"
                                    id="emotions"
                                    placeholder="FOMO, Revenge trading, Early exit, Overtrading... (Comma separated)"
                                    className="min-h-[60px] bg-background"
                                    value={formData.emotions}
                                    onChange={handleInput}
                                />
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="attachment">Screenshot / File (Optional)</Label>
                                <div className="flex items-center gap-2">
                                    <Input
                                        type="file"
                                        name="attachment"
                                        id="attachment"
                                        accept="image/*,.pdf"
                                        className="bg-background"
                                    />
                                </div>
                                <p className="text-xs text-muted-foreground">Upload chart screenshots or trade logs.</p>
                            </div>
                        </div>
                    </div>

                    <div className="flex justify-end pt-4">
                        <Button type="submit" disabled={isSubmitting} size="lg" className="w-full md:w-auto bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 transition-all font-bold px-8 py-6 text-lg shadow-lg hover:shadow-xl transform hover:-translate-y-0.5">
                            {isSubmitting ? (
                                <>Saving...</>
                            ) : (
                                <>
                                    <Save className="mr-2 h-5 w-5" /> Save Trade Entry
                                </>
                            )}
                        </Button>
                    </div>
                </form>
            </CardContent>
        </Card>
    )
}
