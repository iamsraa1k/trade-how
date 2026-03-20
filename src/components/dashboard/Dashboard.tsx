"use client"

import React, { useState, useMemo } from "react"
import type { Trade, Rule } from "@/lib/db"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from "recharts"
import { motion, AnimatePresence } from "framer-motion"
import { Button } from "@/components/ui/button"
import { Download, ChevronLeft, ChevronRight, Trash2, Check, X, Menu, User, LogOut, Star } from "lucide-react"
import { toast } from "sonner"
import { format, addMonths, subMonths, startOfMonth, endOfMonth, eachDayOfInterval, getDay, isSameDay } from "date-fns"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from "@/components/ui/dialog"
import { updateTradeAction, deleteTradeAction } from "@/app/actions"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { useSession, signOut } from "next-auth/react"
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { addRuleAction, deleteRuleAction } from "@/app/actions"


export function Dashboard({ trades, rules }: { trades: Trade[], rules: Rule[] }) {
    // Removed local trades fetching
    const [currentMonth, setCurrentMonth] = useState(new Date())

    const [customStartDate, setCustomStartDate] = useState<string>("")
    const [customEndDate, setCustomEndDate] = useState<string>("")

    const [isRulesModalOpen, setIsRulesModalOpen] = useState(false)
    const [newRuleText, setNewRuleText] = useState("")
    const [isAddingRule, setIsAddingRule] = useState(false)

    const handleAddRule = async () => {
        if (!newRuleText.trim() || isAddingRule) return;
        setIsAddingRule(true);
        const result = await addRuleAction(newRuleText.trim());
        setIsAddingRule(false);
        if (result?.error) toast.error(result.error);
        else { toast.success("Rule added"); setNewRuleText(""); }
    }

    const customRangePnl = useMemo(() => {
        if (!customStartDate || !customEndDate) return null;
        if (customStartDate > customEndDate) return null;

        const relevantTrades = trades.filter(t => {
            return t.date >= customStartDate && t.date <= customEndDate;
        });

        return relevantTrades.reduce((acc, t) => acc + t.pnl, 0);
    }, [trades, customStartDate, customEndDate])

    // State for Edit Modal
    const [selectedDate, setSelectedDate] = useState<Date | null>(null)
    const [isEditModalOpen, setIsEditModalOpen] = useState(false)
    const [editingTrade, setEditingTrade] = useState<Trade | null>(null)
    const [tradeToDelete, setTradeToDelete] = useState<string | null>(null)

    // Calculate metrics based on filtered trades - removed filter since user asked to remove it
    // But kept 'filteredTrades' variable name for minimal refactor, it just equals 'trades' now
    const filteredTrades = useMemo(() => {
        const start = startOfMonth(currentMonth)
        const end = endOfMonth(currentMonth)
        return trades.filter(t => {
            const tradeDate = new Date(t.date)
            return tradeDate >= start && tradeDate <= end
        })
    }, [trades, currentMonth])

    const metrics = useMemo(() => {
        const totalTrades = filteredTrades.length
        const winningTrades = filteredTrades.filter((t) => t.pnl > 0).length
        const losingTrades = filteredTrades.filter((t) => t.pnl <= 0).length
        const winRate = totalTrades > 0 ? (winningTrades / totalTrades) * 100 : 0

        // Calculate rules distribution instead of mistakes
        const rulesMap = new Map<string, number>()
        filteredTrades.forEach(t => {
            if (t.rules && Array.isArray(t.rules)) {
                t.rules.forEach(r => {
                    rulesMap.set(r, (rulesMap.get(r) || 0) + 1)
                })
            }
        })

        const rulesData = Array.from(rulesMap.entries())
            .map(([name, value], index) => ({
                name,
                value,
                color: [`#10b981`, `#3b82f6`, `#8b5cf6`, `#f59e0b`, `#ec4899`, `#14b8a6`][index % 6]
            }))
            .sort((a, b) => b.value - a.value)
            .slice(0, 10)

        return {
            winningTrades,
            losingTrades,
            winRate,
            rulesData: rulesData.length > 0 ? rulesData : [{ name: "No Data", value: 1, color: "#e5e7eb" }]
        }
    }, [filteredTrades])

    // Prepare data for charts with animation
    const winLossData = [
        { name: "Wins", value: metrics.winningTrades, color: "#10b981" },
        { name: "Losses", value: metrics.losingTrades, color: "#ef4444" },
    ]

    // Calendar Logic
    const daysInMonth = eachDayOfInterval({
        start: startOfMonth(currentMonth),
        end: endOfMonth(currentMonth),
    })
    const startDay = getDay(startOfMonth(currentMonth))

    const getPnlForDay = (date: Date) => {
        const dateStr = format(date, "yyyy-MM-dd")
        const tradesForDay = trades.filter(t => t.date === dateStr) // Check ALL trades, not just monthly filtered for accurate daily total
        if (tradesForDay.length === 0) return null
        return tradesForDay.reduce((acc, t) => acc + t.pnl, 0)
    }

    const handleDayClick = (date: Date) => {
        const dateStr = format(date, "yyyy-MM-dd")
        const hasTrades = trades.some(t => t.date === dateStr)
        if (hasTrades) {
            setSelectedDate(date)
            setIsEditModalOpen(true)
        }
    }

    const handleExportCSV = () => {
        // CSV Export of ALL trades
        if (trades.length === 0) {
            alert("No trades to export.");
            return;
        }
        const headers = ["ID", "Date", "Symbol", "Type", "Entry", "Exit", "Qty", "Fees", "P/L", "Analysis", "Mistakes"]
        const csvContent = [
            headers.join(","),
            ...trades.map(t => [
                t.id, t.date, t.symbol, t.type, t.entryPrice, t.exitPrice, t.quantity, t.fees, t.pnl, `"${t.analysis?.replace(/"/g, '""') || ''}"`, `"${(t.rules || []).join(', ')}"`
            ].join(","))
        ].join("\n")

        // Add Byte Order Mark (BOM) for Excel compatibility with UTF-8
        const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" })
        const link = document.createElement("a")
        const url = URL.createObjectURL(blob)
        link.setAttribute("href", url)
        link.setAttribute("download", `trade_journal_${format(new Date(), "yyyy-MM-dd")}.csv`)
        link.style.visibility = 'hidden'
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
    }

    const handleExportPDF = async () => {
        if (trades.length === 0) {
            alert("No trades to export.");
            return;
        }
        try {
            const { jsPDF } = await import("jspdf");
            const { default: autoTable } = await import("jspdf-autotable");

            const doc = new jsPDF();

            // Title
            doc.setFontSize(20);
            doc.text("Trade Journal Report", 14, 22);
            doc.setFontSize(11);
            doc.text(`Generated: ${format(new Date(), "PPpp")}`, 14, 30);

            // Trade Table
            const tableColumn = ["Date", "Symbol", "Type", "Entry", "Exit", "Qty", "P/L"];
            const tableRows = trades.map(trade => [
                trade.date,
                trade.symbol,
                trade.type.toUpperCase(),
                trade.entryPrice,
                trade.exitPrice,
                trade.quantity,
                trade.pnl.toFixed(2)
            ]);

            // @ts-ignore
            autoTable(doc, {
                head: [tableColumn],
                body: tableRows,
                startY: 40,
            });

            // Summary Page
            doc.addPage();
            doc.setFontSize(18);
            doc.text("Performance Summary", 14, 22);

            // Metrics
            const overallWinRate = trades.length > 0 ? (trades.filter(t => t.pnl > 0).length / trades.length * 100).toFixed(1) : "0.0";
            const totalPnl = trades.reduce((acc, t) => acc + t.pnl, 0).toFixed(2);

            doc.setFontSize(12);
            doc.text(`Total Trades: ${trades.length}`, 14, 40);
            doc.text(`Win Rate: ${overallWinRate}%`, 14, 50);
            doc.text(`Net P/L: ${totalPnl}`, 14, 60);

            // Visual indicators
            doc.text("Win/Loss Distribution:", 14, 80);
            doc.setDrawColor(0);
            doc.setFillColor(16, 185, 129); // Green
            const winWidth = trades.length > 0 ? (trades.filter(t => t.pnl > 0).length / trades.length) * 100 : 0;
            doc.rect(14, 85, winWidth, 10, "F");

            doc.setFillColor(239, 68, 68); // Red
            const lossWidth = trades.length > 0 ? (trades.filter(t => t.pnl <= 0).length / trades.length) * 100 : 0;
            doc.rect(14 + winWidth, 85, lossWidth, 10, "F");

            doc.text("Green: Wins | Red: Losses", 14, 105);

            doc.save(`trade_report_${format(new Date(), "yyyy-MM-dd")}.pdf`);
        } catch (error) {
            console.error("PDF Generation Error:", error);
            alert("Failed to generate PDF. check console for details.");
        }
    }

    const nextMonth = () => setCurrentMonth(addMonths(currentMonth, 1))
    const prevMonth = () => setCurrentMonth(subMonths(currentMonth, 1))

    const totalMonthlyPnl = useMemo(() => {
        return filteredTrades.reduce((acc, t) => acc + t.pnl, 0);
    }, [filteredTrades]);

    return (
        <div className="space-y-6 h-full flex flex-col">
            <div className="flex flex-col lg:flex-row gap-4 mb-2">
                {/* Monthly Realized P/L */}
                <div className="flex-1 flex flex-col sm:flex-row justify-between items-center bg-card p-4 rounded-lg shadow-sm border border-zinc-200 dark:border-zinc-800 gap-4">
                    <div className="flex flex-col sm:flex-row items-center gap-2 sm:gap-4 w-full sm:w-auto text-center sm:text-left">
                        <span className="text-sm font-medium text-muted-foreground sm:mr-2">Monthly Realized P/L:</span>
                        <span className={`text-2xl sm:text-3xl font-bold ${totalMonthlyPnl >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                            {totalMonthlyPnl >= 0 ? '+' : ''}{totalMonthlyPnl.toLocaleString('en-IN', { style: 'currency', currency: 'INR' })}
                        </span>
                    </div>
                    <div className="flex gap-2 w-full sm:w-auto justify-center sm:justify-end flex-wrap">
                        <Button variant="outline" size="sm" onClick={() => setIsRulesModalOpen(true)} className="w-full sm:w-auto">
                            <Check className="mr-2 h-4 w-4" />
                            Manage Rules
                        </Button>
                        <Button variant="outline" size="sm" onClick={handleExportCSV} className="w-full sm:w-auto">
                            <Download className="mr-2 h-4 w-4" />
                            CSV Export
                        </Button>
                        <Button variant="outline" size="sm" onClick={handleExportPDF} className="w-full sm:w-auto">
                            <Download className="mr-2 h-4 w-4" />
                            PDF Report
                        </Button>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 flex-1">
                {/* Calendar Section */}
                <motion.div
                    initial={{ opacity: 0, scale: 0.98 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.2 }}
                    className="flex flex-col h-full"
                >
                    <Card className="h-full border-zinc-200 dark:border-zinc-800 shadow-lg flex flex-col">
                        <CardHeader className="flex flex-col sm:flex-row items-center justify-between pb-6 gap-4 border-b border-zinc-100 dark:border-zinc-800/50">
                            <CardTitle className="text-xl sm:text-2xl font-bold text-center sm:text-left">Performance Calendar</CardTitle>
                            <div className="flex items-center gap-2 sm:gap-4 bg-muted/30 p-1 rounded-lg">
                                <Button variant="ghost" size="icon" onClick={prevMonth}>
                                    <ChevronLeft className="h-4 w-4 sm:h-5 sm:w-5" />
                                </Button>
                                <span className="min-w-[100px] sm:min-w-[120px] text-center font-semibold text-sm sm:text-lg">
                                    {format(currentMonth, 'MMMM yyyy')}
                                </span>
                                <Button variant="ghost" size="icon" onClick={nextMonth}>
                                    <ChevronRight className="h-4 w-4 sm:h-5 sm:w-5" />
                                </Button>
                            </div>
                        </CardHeader>
                        <CardContent className="flex-1 p-2 sm:p-6 overflow-hidden">
                            <div className="grid grid-cols-7 gap-1 h-full content-start">
                                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
                                    <div key={d} className="text-center text-[10px] sm:text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">{d}</div>
                                ))}

                                {Array.from({ length: startDay }).map((_, i) => (
                                    <div key={`empty-${i}`} />
                                ))}

                                {daysInMonth.map((day, i) => {
                                    const pnl = getPnlForDay(day)
                                    const isPositive = pnl !== null && pnl > 0

                                    // Check if all rules were followed for a perfect trade day (only if rules exist)
                                    const tradesForThatDay = trades.filter(t => t.date === format(day, "yyyy-MM-dd"))
                                    const allFlawless = tradesForThatDay.length > 0 && rules.length > 0 && tradesForThatDay.every(t =>
                                        rules.every(r => (t.rules || []).includes(r.text))
                                    )

                                    return (
                                        <motion.div
                                            key={day.toString()}
                                            initial={{ opacity: 0 }}
                                            animate={{ opacity: 1 }}
                                            transition={{ duration: 0.2 }}
                                            onClick={() => handleDayClick(day)}
                                            className={`
                                        aspect-square sm:aspect-auto sm:min-h-[80px] flex flex-col p-0.5 sm:p-1.5 border rounded-md sm:rounded-lg relative transition-all cursor-pointer group hover:shadow-md
                                        ${pnl !== null ? (isPositive ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-red-500/10 border-red-500/30') : 'hover:bg-accent border-muted'}
                                    `}
                                        >
                                            <div className="flex justify-between items-start">
                                                <span className="text-[10px] sm:text-xs font-medium text-muted-foreground group-hover:text-foreground pl-1">{format(day, 'd')}</span>
                                                {allFlawless && <Star className="h-3 w-3 text-yellow-500 fill-yellow-500" />}
                                            </div>
                                            {pnl !== null && (
                                                <div className="flex flex-col items-center justify-center flex-1 w-full overflow-hidden">
                                                    <span className={`hidden sm:block text-xs md:text-sm font-bold tracking-tight truncate w-full text-center ${isPositive ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
                                                        {isPositive ? '+' : ''}{pnl.toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })}
                                                    </span>
                                                    <div className={`sm:hidden w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full ${isPositive ? "bg-emerald-500" : "bg-red-500"}`}></div>
                                                </div>
                                            )}
                                        </motion.div>
                                    )
                                })}
                            </div>
                        </CardContent>
                    </Card>
                </motion.div>

                {/* Charts Section */}
                <div className="flex flex-col gap-6 h-full">
                    {/* Win Rate Chart */}
                    <motion.div
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.3 }}
                        className="flex-1"
                    >
                        <Card className="h-full border-zinc-200 dark:border-zinc-800 shadow-lg flex flex-col">
                            <CardHeader className="pb-2">
                                <CardTitle className="text-lg sm:text-xl text-center sm:text-left">Win Rate</CardTitle>
                            </CardHeader>
                            <CardContent className="flex-1 flex flex-col items-center justify-center p-4">
                                <div className="h-[250px] w-full min-h-[250px] relative flex-shrink-0 flex items-center justify-center">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <PieChart>
                                            <Pie
                                                data={winLossData}
                                                cx="50%"
                                                cy="50%"
                                                innerRadius={60}
                                                outerRadius={80}
                                                paddingAngle={5}
                                                dataKey="value"
                                                stroke="none"
                                            >
                                                <Cell key="win" fill="#10b981" />
                                                <Cell key="loss" fill="#ef4444" />
                                            </Pie>
                                            <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} />
                                            <text x="50%" y="50%" textAnchor="middle" dominantBaseline="middle" className="text-xl font-bold fill-foreground">
                                                {metrics.winRate.toFixed(1)}%
                                            </text>
                                        </PieChart>
                                    </ResponsiveContainer>
                                </div>
                            </CardContent>
                            <div className="p-4 border-t border-zinc-100 dark:border-zinc-800/50">
                                <div className="flex flex-wrap justify-center gap-4">
                                    <div className="flex items-center gap-2">
                                        <div className="w-3 h-3 rounded-full bg-emerald-500 shadow-sm"></div>
                                        <span className="text-sm font-medium">Wins: {metrics.winningTrades}</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <div className="w-3 h-3 rounded-full bg-red-500 shadow-sm"></div>
                                        <span className="text-sm font-medium">Losses: {metrics.losingTrades}</span>
                                    </div>
                                </div>
                            </div>
                        </Card>
                    </motion.div>

                    {/* Rules Chart */}
                    <motion.div
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.3, delay: 0.1 }}
                        className="flex-1"
                    >
                        <Card className="h-full border-zinc-200 dark:border-zinc-800 shadow-lg flex flex-col">
                            <CardHeader className="pb-2">
                                <CardTitle className="text-lg sm:text-xl text-center sm:text-left">Discipline (Rules Followed)</CardTitle>
                            </CardHeader>
                            <CardContent className="flex-1 flex flex-col items-center justify-center p-4">
                                <div className="h-[250px] w-full min-h-[250px] relative flex-shrink-0 flex items-center justify-center">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <PieChart>
                                            <Pie
                                                data={metrics.rulesData}
                                                cx="50%"
                                                cy="50%"
                                                innerRadius={60}
                                                outerRadius={80}
                                                paddingAngle={2}
                                                dataKey="value"
                                                stroke="none"
                                            >
                                                {metrics.rulesData.map((entry, index) => (
                                                    <Cell key={`cell-${index}`} fill={entry.color} />
                                                ))}
                                            </Pie>
                                            <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} />
                                            <text x="50%" y="50%" textAnchor="middle" dominantBaseline="middle" className="text-sm font-medium fill-muted-foreground">
                                                By Freq
                                            </text>
                                        </PieChart>
                                    </ResponsiveContainer>
                                </div>
                            </CardContent>
                            <div className="p-4 border-t border-zinc-100 dark:border-zinc-800/50">
                                <div className="flex flex-wrap gap-2 justify-center max-h-[100px] overflow-y-auto custom-scrollbar">
                                    {metrics.rulesData.map((entry, index) => (
                                        <div key={index} className="flex items-center gap-2 bg-muted/50 px-2 py-1 rounded-full border border-zinc-200 dark:border-zinc-800">
                                            <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: entry.color }}></div>
                                            <span className="text-xs font-medium max-w-[150px] truncate" title={entry.name}>{entry.name}</span>
                                            <span className="text-xs font-bold opacity-75">{entry.value}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </Card>
                    </motion.div>
                </div>
            </div>

            {/* Custom Date Range P/L - Moved to Bottom */}
            <div className="flex flex-col sm:flex-row justify-between items-center bg-card p-4 rounded-lg shadow-sm border border-zinc-200 dark:border-zinc-800 gap-4 mt-2">
                <div className="flex flex-col sm:flex-row items-center gap-3 w-full sm:w-auto">
                    <div className="flex items-center gap-2 w-full sm:w-auto justify-center sm:justify-start">
                        <Label htmlFor="custom-start" className="text-xs text-muted-foreground whitespace-nowrap">From</Label>
                        <Input type="date" id="custom-start" value={customStartDate} onChange={(e) => setCustomStartDate(e.target.value)} className="h-8 text-sm w-[130px]" />
                    </div>
                    <div className="flex items-center gap-2 w-full sm:w-auto justify-center sm:justify-start">
                        <Label htmlFor="custom-end" className="text-xs text-muted-foreground whitespace-nowrap">To</Label>
                        <Input type="date" id="custom-end" value={customEndDate} onChange={(e) => setCustomEndDate(e.target.value)} className="h-8 text-sm w-[130px]" />
                    </div>
                </div>
                <div className="flex flex-col sm:flex-row items-center gap-1 sm:gap-3 w-full sm:w-auto text-center sm:text-right">
                    <span className="text-sm font-medium text-muted-foreground whitespace-nowrap">Custom Range P/L:</span>
                    <span className={`text-xl sm:text-2xl font-bold ${customRangePnl === null ? 'text-muted-foreground' : customRangePnl >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                        {customRangePnl !== null ? (
                            <>{customRangePnl >= 0 ? '+' : ''}{customRangePnl.toLocaleString('en-IN', { style: 'currency', currency: 'INR' })}</>
                        ) : (
                            "---"
                        )}
                    </span>
                </div>
            </div>

            {/* Edit Trade Modal */}
            <TradeListModal
                isOpen={isEditModalOpen}
                onClose={() => setIsEditModalOpen(false)}
                date={selectedDate}
                trades={trades.filter(t => selectedDate && t.date === format(selectedDate, "yyyy-MM-dd"))}
                setTradeToDelete={setTradeToDelete}
                rules={rules}
            />

            {/* Delete Confirmation Dialog */}
            <Dialog open={!!tradeToDelete} onOpenChange={() => setTradeToDelete(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Confirm Deletion</DialogTitle>
                        <DialogDescription>
                            Are you sure you want to delete this trade? This action cannot be undone.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setTradeToDelete(null)}>Cancel</Button>
                        <Button variant="destructive" onClick={async () => {
                            if (tradeToDelete) {
                                const result = await deleteTradeAction(tradeToDelete);
                                if (result?.error) toast.error(result.error);
                                else toast.success("Trade deleted successfully");
                            }
                            setTradeToDelete(null);
                        }}>Delete</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
            {/* Rules Management Modal */}
            <Dialog open={isRulesModalOpen} onOpenChange={setIsRulesModalOpen}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle>Manage Discipline Rules</DialogTitle>
                        <DialogDescription>
                            Define custom rules for your trading plan. You can check these off when logging trades.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="flex items-center gap-2">
                            <Input
                                placeholder="E.g., Wait for candle to close"
                                value={newRuleText}
                                onChange={(e) => setNewRuleText(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' && newRuleText.trim() && !isAddingRule) {
                                        handleAddRule();
                                    }
                                }}
                            />
                            <Button disabled={!newRuleText.trim() || isAddingRule} onClick={handleAddRule}>Add</Button>
                        </div>
                        <div className="max-h-[300px] overflow-y-auto space-y-2 border rounded-md p-2 bg-muted/20">
                            {rules.length === 0 ? (
                                <p className="text-sm text-center text-muted-foreground p-4">No rules defined yet.</p>
                            ) : (
                                rules.map(rule => (
                                    <div key={rule.id} className="flex items-center justify-between p-2 bg-background border rounded-md shadow-sm">
                                        <span className="text-sm font-medium">{rule.text}</span>
                                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={async () => {
                                            const result = await deleteRuleAction(rule.id);
                                            if (result?.error) toast.error(result.error);
                                            else toast.success("Rule deleted");
                                        }}>
                                            <Trash2 className="h-4 w-4" />
                                        </Button>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </DialogContent>
            </Dialog>
        </div >
    )
}

function TradeListModal({ isOpen, onClose, date, trades, setTradeToDelete, rules }: { isOpen: boolean, onClose: () => void, date: Date | null, trades: Trade[], setTradeToDelete: (id: string | null) => void, rules: Rule[] }) {
    const [editingId, setEditingId] = useState<string | null>(null)
    const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

    if (!date) return null

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto w-[95vw]">
                <DialogHeader>
                    <DialogTitle>Trades on {format(date, "MMMM d, yyyy")}</DialogTitle>
                    <DialogDescription>Review or edit your trades for this day.</DialogDescription>
                </DialogHeader>

                <div className="space-y-4 mt-4">
                    {trades.length === 0 ? (
                        <p className="text-center text-muted-foreground py-8">No trades recorded for this day.</p>
                    ) : (
                        trades.map(trade => (
                            <div key={trade.id} className="border rounded-lg p-3 sm:p-4 bg-card">
                                {editingId === trade.id ? (
                                    <EditTradeForm trade={trade} onCancel={() => setEditingId(null)} onSuccess={() => setEditingId(null)} rules={rules} />
                                ) : (
                                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                                        <div>
                                            <div className="font-bold text-lg flex items-center gap-2">
                                                {trade.symbol} <span className={`text-xs px-2 py-0.5 rounded-full ${trade.type === 'buy' ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300' : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'}`}>{trade.type.toUpperCase()}</span>
                                            </div>
                                            <div className="text-sm text-muted-foreground mt-1">
                                                Entry: {trade.entryPrice} | Exit: {trade.exitPrice} | Qty: {trade.quantity}
                                            </div>
                                            {trade.attachment && (
                                                <div className="text-xs text-blue-500 mt-1 flex items-center gap-1">
                                                    <Download className="h-3 w-3" /> Attached: {trade.attachment}
                                                </div>
                                            )}
                                        </div>
                                        <div className="text-right w-full sm:w-auto flex flex-row sm:flex-col justify-between sm:justify-center items-center sm:items-end">
                                            <div className={`font-bold text-xl ${trade.pnl > 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                                                {trade.pnl > 0 ? '+' : ''}{trade.pnl.toLocaleString('en-IN', { style: 'currency', currency: 'INR' })}
                                            </div>
                                            <div className="flex gap-2 sm:mt-2 justify-end items-center">
                                                {confirmDeleteId === trade.id ? (
                                                    <div className="flex items-center gap-1 animate-in fade-in zoom-in duration-200">
                                                        <span className="text-xs text-red-500 font-bold mr-1">Sure?</span>
                                                        <Button size="sm" variant="destructive" className="h-7 w-7 p-0 rounded-full" onClick={async () => {
                                                            const result = await deleteTradeAction(trade.id);
                                                            if (result?.error) toast.error(result.error);
                                                            else toast.success("Trade deleted successfully");
                                                            setConfirmDeleteId(null);
                                                        }}>
                                                            <Check className="h-3 w-3" />
                                                        </Button>
                                                        <Button size="sm" variant="outline" className="h-7 w-7 p-0 rounded-full" onClick={() => setConfirmDeleteId(null)}>
                                                            <X className="h-3 w-3" />
                                                        </Button>
                                                    </div>
                                                ) : (
                                                    <>
                                                        <Button variant="outline" size="sm" onClick={() => setEditingId(trade.id)}>Edit</Button>
                                                        <Button variant="ghost" size="sm" onClick={() => setConfirmDeleteId(trade.id)} className="text-destructive hover:bg-destructive/10">
                                                            <Trash2 className="h-4 w-4" />
                                                        </Button>
                                                    </>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        ))
                    )}
                </div>
            </DialogContent>
        </Dialog>
    )
}

function EditTradeForm({ trade, onCancel, onSuccess, rules }: { trade: Trade, onCancel: () => void, onSuccess: () => void, rules: Rule[] }) {
    // Simplified form for editing
    const [formData, setFormData] = useState({
        entry: trade.entryPrice.toString(),
        exit: trade.exitPrice.toString(),
        quantity: trade.quantity.toString(),
        fees: trade.fees.toString(),
        type: trade.type,
        pnl: trade.pnl.toString(),
        analysis: trade.analysis,
        rules: trade.rules || [],
        symbol: trade.symbol,
        date: trade.date
    })

    const [calculatedPnl, setCalculatedPnl] = useState<number | null>(null)

    const handleInput = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
        const { name, value, type } = e.target
        setFormData(prev => {
            const newData = { ...prev }
            if (type === 'checkbox' && name === 'rules') {
                const target = e.target as HTMLInputElement;
                if (target.checked) {
                    newData.rules = [...prev.rules, value];
                } else {
                    newData.rules = prev.rules.filter(r => r !== value);
                }
            } else {
                (newData as any)[name] = value;
            }

            if (['entry', 'exit', 'quantity', 'fees', 'type'].includes(name)) {
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

    return (
        <form action={async (data) => {
            const result = await updateTradeAction(trade.id, data)
            if (result?.error) {
                toast.error(result.error)
            } else {
                toast.success("Trade updated successfully")
                onSuccess()
            }
        }} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                    <Label htmlFor="date">Date</Label>
                    <Input name="date" type="date" value={formData.date} onChange={handleInput} required />
                </div>
                <div className="space-y-1">
                    <Label htmlFor="symbol">Symbol</Label>
                    <Input name="symbol" value={formData.symbol} onChange={handleInput} required />
                </div>
                <div className="space-y-1">
                    <Label htmlFor="type">Type</Label>
                    <select name="type" value={formData.type} onChange={handleInput} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                        <option value="buy">Buy</option>
                        <option value="sell">Sell</option>
                    </select>
                </div>
                <div className="space-y-1">
                    <Label htmlFor="entry">Entry</Label>
                    <Input name="entry" type="number" step="any" value={formData.entry} onChange={handleInput} />
                </div>
                <div className="space-y-1">
                    <Label htmlFor="exit">Exit</Label>
                    <Input name="exit" type="number" step="any" value={formData.exit} onChange={handleInput} />
                </div>
                <div className="space-y-1">
                    <Label htmlFor="quantity">Qty</Label>
                    <Input name="quantity" type="number" value={formData.quantity} onChange={handleInput} />
                </div>
                <div className="space-y-1">
                    <Label htmlFor="fees">Fees</Label>
                    <Input name="fees" type="number" step="any" value={formData.fees} onChange={handleInput} />
                </div>
                <div className="space-y-1 col-span-2">
                    <Label htmlFor="pnl">P/L</Label>
                    <Input name="pnl" type="number" step="any" value={formData.pnl} onChange={handleInput} className="font-bold bg-muted" />
                    {calculatedPnl !== null && formData.pnl !== "" && calculatedPnl.toFixed(2) !== parseFloat(formData.pnl).toFixed(2) && (
                        <p className="text-xs text-red-500 font-medium mt-1">
                            Warning: Entered P/L does not match calculated P/L based on Entry/Exit.
                        </p>
                    )}
                </div>
            </div>
            <div className="space-y-1">
                <Label htmlFor="analysis">Analysis</Label>
                <Textarea name="analysis" value={formData.analysis} onChange={handleInput} rows={2} />
            </div>

            <div className="space-y-3 mt-4">
                <Label>Discipline / Custom Rules Followed</Label>
                {rules.length === 0 ? (
                    <p className="text-xs text-muted-foreground border border-dashed p-3 rounded-md bg-muted/30">
                        No custom rules to select.
                    </p>
                ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-[150px] overflow-y-auto p-1 custom-scrollbar">
                        {rules.map((rule) => (
                            <div key={rule.id} className="flex items-start space-x-2 bg-background p-2 rounded-md border shadow-sm">
                                <input
                                    type="checkbox"
                                    id={`edit-rule-${rule.id}`}
                                    name="rules"
                                    value={rule.text}
                                    checked={formData.rules.includes(rule.text)}
                                    onChange={handleInput}
                                    className="mt-0.5 h-3.5 w-3.5 rounded border-gray-300 text-indigo-600 focus:ring-indigo-600"
                                />
                                <label htmlFor={`edit-rule-${rule.id}`} className="text-xs font-medium leading-none cursor-pointer flex-1">
                                    {rule.text}
                                </label>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            <div className="flex justify-end gap-2 pt-4">
                <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
                <Button type="submit">Update Trade</Button>
            </div>
        </form>
    )
}
