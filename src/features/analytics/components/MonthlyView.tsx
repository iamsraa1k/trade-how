"use client"

import React, { useState, useMemo } from "react"
import type { Trade, Rule, MonthlyAnalysis } from "@/lib/db"
import { useTradeFilter } from "@/features/trades/context/TradeFilterContext"
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card"
import { Button } from "@/shared/components/ui/button"
import { ChevronLeft, ChevronRight, PenTool, Eye, AlertCircle, FileText, Star, ThumbsDown } from "lucide-react"
import { format, parseISO, addYears, subYears, eachMonthOfInterval, startOfYear, endOfYear, isSameMonth } from "date-fns"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/shared/components/ui/dialog"
import { Textarea } from "@/shared/components/ui/textarea"
import { saveMonthlyAnalysisAction } from "@/app/actions"
import { toast } from "sonner"
import { motion, AnimatePresence } from "framer-motion"

export function MonthlyView({ trades, rules, monthlyAnalyses }: { trades: Trade[], rules: Rule[], monthlyAnalyses: MonthlyAnalysis[] }) {
    const { tradeMode, filterTrades } = useTradeFilter()
    const visibleTrades = filterTrades(trades)

    const [currentYearDate, setCurrentYearDate] = useState(new Date())
    const [selectedMonthStr, setSelectedMonthStr] = useState<string | null>(null)
    const [isModalOpen, setIsModalOpen] = useState(false)
    const [analysisText, setAnalysisText] = useState("")
    const [isSaving, setIsSaving] = useState(false)
    const [showSneakPeek, setShowSneakPeek] = useState(false)

    const nextYear = () => setCurrentYearDate(addYears(currentYearDate, 1))
    const prevYear = () => setCurrentYearDate(subYears(currentYearDate, 1))

    const monthsInYear = eachMonthOfInterval({
        start: startOfYear(currentYearDate),
        end: endOfYear(currentYearDate),
    })

    const handleMonthClick = (monthDate: Date) => {
        const monthStr = format(monthDate, "yyyy-MM")
        setSelectedMonthStr(monthStr)
        
        const existingAnalysis = monthlyAnalyses.find(ma => ma.monthYear === monthStr)
        setAnalysisText(existingAnalysis?.analysis || "")
        setShowSneakPeek(false)
        setIsModalOpen(true)
    }

    const handleSave = async () => {
        if (!selectedMonthStr) return;
        setIsSaving(true);
        const res = await saveMonthlyAnalysisAction(selectedMonthStr, analysisText);
        if (res.success) {
            toast.success("Analysis saved successfully!");
            // Update local state is typically handled by revalidatePath in action
            setIsModalOpen(false);
        } else {
            toast.error("Failed to save analysis.");
        }
        setIsSaving(false);
    }

    const selectedMonthTrades = useMemo(() => {
        if (!selectedMonthStr) return [];
        return visibleTrades.filter(t => t.date.startsWith(selectedMonthStr));
    }, [visibleTrades, selectedMonthStr]);

    const selectedMonthPnl = useMemo(() => {
        return selectedMonthTrades.reduce((acc, t) => acc + t.pnl, 0);
    }, [selectedMonthTrades]);

    return (
        <div className="w-full space-y-6">
            <Card className="glass-card flex flex-col overflow-hidden">
                <CardHeader className="flex flex-col sm:flex-row items-center justify-between pb-4 pt-5 gap-4 border-b border-white/10 dark:border-white/5 bg-muted/20">
                    <CardTitle className="text-xl sm:text-2xl font-bold">Yearly Overview</CardTitle>
                    <div className="flex items-center gap-2 sm:gap-4 bg-muted/40 p-1.5 rounded-lg border shadow-sm">
                        <Button variant="ghost" size="icon" onClick={prevYear} className="h-8 w-8 hover:bg-background">
                            <ChevronLeft className="h-4 w-4 sm:h-5 sm:w-5" />
                        </Button>
                        <span className="min-w-[100px] sm:min-w-[120px] text-center font-bold text-sm sm:text-lg tracking-tight">
                            {format(currentYearDate, 'yyyy')}
                        </span>
                        <Button variant="ghost" size="icon" onClick={nextYear} className="h-8 w-8 hover:bg-background">
                            <ChevronRight className="h-4 w-4 sm:h-5 sm:w-5" />
                        </Button>
                    </div>
                </CardHeader>
                <CardContent className="p-4 sm:p-6 bg-muted/5">
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                        {monthsInYear.map((monthDate) => {
                            const monthStr = format(monthDate, "yyyy-MM");
                            const hasAnalysis = monthlyAnalyses.some(ma => ma.monthYear === monthStr && ma.analysis.trim().length > 0);
                            const monthTrades = visibleTrades.filter(t => t.date.startsWith(monthStr));
                            const monthPnl = monthTrades.reduce((acc, t) => acc + t.pnl, 0);
                            const tradeCount = monthTrades.length;
                            const isCurrentMonth = isSameMonth(monthDate, new Date());

                            return (
                                <motion.div
                                    key={monthStr}
                                    initial={{ opacity: 0, scale: 0.95 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    onClick={() => handleMonthClick(monthDate)}
                                    className={`
                                        relative overflow-hidden cursor-pointer glass p-5 flex flex-col h-[140px] justify-between transition-all group hover:-translate-y-1 hover:shadow-xl rounded-2xl
                                        ${hasAnalysis 
                                            ? 'bg-indigo-50/50 border-indigo-200 dark:bg-indigo-950/20 dark:border-indigo-900/50 hover:border-indigo-400' 
                                            : 'border-white/40 dark:border-white/10 hover:border-border'}
                                        ${isCurrentMonth ? 'ring-2 ring-primary ring-offset-2 ring-offset-background' : ''}
                                    `}
                                >
                                    <div className="flex justify-between items-start">
                                        <h3 className="font-bold text-lg sm:text-xl">{format(monthDate, "MMM")}</h3>
                                        {hasAnalysis && (
                                            <div className="bg-indigo-100 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-400 p-1 sm:px-2 sm:py-0.5 rounded-full flex items-center gap-1 shadow-sm" title="Analysis Saved">
                                                <PenTool className="w-3 h-3" /> <span className="hidden sm:inline text-[10px] font-bold tracking-wider">SAVED</span>
                                            </div>
                                        )}
                                    </div>
                                    
                                    <div className="mt-auto">
                                        {tradeCount > 0 ? (
                                            <div>
                                                <p className="text-xs text-muted-foreground font-medium mb-1 flex items-center gap-1">
                                                    {tradeMode === 'paper' && <FileText className="w-3 h-3 text-teal-500" />}
                                                    {tradeCount} Trades
                                                </p>
                                                <p className={`text-xl font-bold tracking-tight ${monthPnl > 0 ? 'text-emerald-600 dark:text-emerald-400' : monthPnl < 0 ? 'text-red-600 dark:text-red-400' : 'text-muted-foreground'}`}>
                                                    {monthPnl > 0 ? '+' : ''}{monthPnl.toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })}
                                                </p>
                                            </div>
                                        ) : (
                                            <p className="text-xs text-muted-foreground font-medium italic opacity-70">No trades logged</p>
                                        )}
                                    </div>
                                </motion.div>
                            )
                        })}
                    </div>
                </CardContent>
            </Card>

            <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
                <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col p-0 gap-0 overflow-hidden bg-card">
                    <DialogHeader className="px-6 pt-6 pb-4 border-b bg-muted/20">
                        <DialogTitle className="text-2xl font-bold flex items-center justify-between">
                            <span>{selectedMonthStr ? format(parseISO(`${selectedMonthStr}-01`), "MMMM yyyy") : ""} Analysis</span>
                            <span className={`text-base sm:text-xl whitespace-nowrap ${selectedMonthPnl > 0 ? 'text-emerald-600' : selectedMonthPnl < 0 ? 'text-red-600' : 'text-muted-foreground'}`}>
                                {selectedMonthPnl > 0 ? '+' : ''}{selectedMonthPnl.toLocaleString('en-IN', { style: 'currency', currency: 'INR' })}
                            </span>
                        </DialogTitle>
                        <DialogDescription>
                            Reflect on your performance, discipline, and emotional state this month.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
                        <div className="space-y-3">
                            <div className="flex items-center justify-between">
                                <label className="text-sm font-semibold flex items-center gap-2">
                                    <PenTool className="w-4 h-4 text-indigo-500" />
                                    Your Reflection
                                </label>
                                <Button variant="outline" size="sm" onClick={() => setShowSneakPeek(!showSneakPeek)} className="h-8 text-xs bg-background">
                                    <Eye className="w-3.5 h-3.5 mr-1.5" />
                                    {showSneakPeek ? "Hide Trades" : "Sneak Peek Trades"}
                                </Button>
                            </div>
                            <Textarea 
                                placeholder="What went well? What didn't? How was your psychology?..."
                                className="min-h-[250px] resize-none text-base leading-relaxed p-4 bg-background shadow-sm border-indigo-100 dark:border-indigo-900/30 focus-visible:ring-indigo-500"
                                value={analysisText}
                                onChange={(e) => setAnalysisText(e.target.value)}
                            />
                        </div>

                        <AnimatePresence>
                            {showSneakPeek && (
                                <motion.div 
                                    initial={{ opacity: 0, height: 0 }}
                                    animate={{ opacity: 1, height: "auto" }}
                                    exit={{ opacity: 0, height: 0 }}
                                    className="overflow-hidden"
                                >
                                    <div className="bg-muted/30 border rounded-xl p-4 space-y-3">
                                        <h4 className="font-semibold text-sm flex items-center gap-2">
                                            <AlertCircle className="w-4 h-4 text-muted-foreground" />
                                            Month's Trades ({selectedMonthTrades.length})
                                        </h4>
                                        <div className="max-h-[300px] overflow-y-auto custom-scrollbar pr-2 space-y-2">
                                            {selectedMonthTrades.length > 0 ? (
                                                selectedMonthTrades.sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime()).map(trade => (
                                                    <div key={trade.id} className="flex flex-col p-3 bg-card border rounded-lg shadow-sm gap-2">
                                                        <div className="flex justify-between items-start">
                                                            <div>
                                                                <div className="font-bold flex items-center gap-2 text-sm">
                                                                    {trade.symbol}
                                                                    {trade.isPaper ? (
                                                                        <span className="inline-flex items-center gap-1 text-[10px] font-bold bg-teal-50 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400 px-1.5 py-0.5 rounded-full border border-teal-200 dark:border-teal-800/50">
                                                                            <FileText className="w-3 h-3" /> PAPER
                                                                        </span>
                                                                    ) : (
                                                                        <>
                                                                            {trade.tradeQuality === 'flawless' && <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-400" />}
                                                                            {trade.tradeQuality === 'violation' && <ThumbsDown className="w-3.5 h-3.5 text-red-500" />}
                                                                        </>
                                                                    )}
                                                                    <span className="text-[10px] text-muted-foreground">{format(new Date(trade.date), "MMM d")}</span>
                                                                </div>
                                                                <div className="text-xs text-muted-foreground mt-0.5">
                                                                    {trade.isBasket ? `Basket • ${trade.legs?.length || 0} legs` : trade.type.toUpperCase()}
                                                                </div>
                                                            </div>
                                                            <div className={`font-bold text-sm ${trade.pnl > 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                                                                {trade.pnl > 0 ? '+' : ''}{trade.pnl.toLocaleString('en-IN', { style: 'currency', currency: 'INR' })}
                                                            </div>
                                                        </div>
                                                        {(trade.analysis || (trade.rules && trade.rules.length > 0)) && (
                                                            <div className="pt-2 border-t border-border/50 text-xs flex flex-col gap-1.5 mt-1">
                                                                {trade.analysis && <p className="text-muted-foreground italic leading-relaxed">&ldquo;{trade.analysis}&rdquo;</p>}
                                                                {trade.rules && trade.rules.length > 0 && (
                                                                    <div className="flex flex-wrap gap-1 mt-1">
                                                                        {trade.rules.map((r, i) => (
                                                                            <span key={i} className="text-[9px] bg-indigo-50 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400 px-1.5 py-0.5 rounded-sm border border-indigo-100 dark:border-indigo-800/50">{r}</span>
                                                                        ))}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        )}
                                                    </div>
                                                ))
                                            ) : (
                                                <p className="text-sm text-muted-foreground italic text-center py-4">No trades this month.</p>
                                            )}
                                        </div>
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>

                    <div className="p-4 border-t bg-muted/10 flex justify-end gap-3">
                        <Button variant="ghost" onClick={() => setIsModalOpen(false)}>Cancel</Button>
                        <Button onClick={handleSave} disabled={isSaving} className="bg-indigo-600 hover:bg-indigo-700 text-white min-w-[100px]">
                            {isSaving ? "Saving..." : "Save Analysis"}
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    )
}
