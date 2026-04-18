"use client"

import React, { useState } from "react"
import type { Trade, Rule } from "@/lib/db"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Download, Edit2, Trash2, Search, Target } from "lucide-react"
import { format } from "date-fns"
import { Input } from "@/components/ui/input"
import { deleteTradeAction } from "@/app/actions"
import { toast } from "sonner"
// Assuming an EditTradeForm exists or we will implement it differently via the Add page later.
// For now, let's keep the logic simple.

export function TradeTable({ trades, rules }: { trades: Trade[], rules: Rule[] }) {
    const [searchTerm, setSearchTerm] = useState("")

    const filteredTrades = trades.filter(t => 
        t.symbol.toLowerCase().includes(searchTerm.toLowerCase()) ||
        t.analysis?.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const handleExportPDF = async () => {
        if (trades.length === 0) {
            alert("No trades to export.");
            return;
        }
        try {
            const { jsPDF } = await import("jspdf");
            const { default: autoTable } = await import("jspdf-autotable");

            const doc = new jsPDF();
            const primaryColor = [79, 70, 229] as [number, number, number]; // Indigo 600

            // Title
            doc.setFontSize(22);
            doc.setTextColor(...primaryColor);
            doc.text("Complete Trade Journal", 14, 25);
            doc.setFontSize(10);
            doc.setTextColor(100);
            doc.text(`Generated on: ${format(new Date(), "PPpp")}`, 14, 33);
            doc.text(`Total Trades: ${trades.length}`, 14, 38);

            // Detailed Trade Log Pages
            let currentY = 50;

            trades.forEach((trade, index) => {
                if (currentY > 250) {
                    doc.addPage();
                    currentY = 20;
                }

                // Add a border/card look
                doc.setDrawColor(220, 220, 220);
                doc.setFillColor(250, 250, 250);
                doc.roundedRect(12, currentY, 186, 65, 3, 3, "FD");

                // Header
                doc.setFontSize(14);
                doc.setTextColor(0);
                doc.text(`${trade.symbol.toUpperCase()} - ${trade.type.toUpperCase()}`, 16, currentY + 10);
                
                doc.setFontSize(10);
                doc.setTextColor(100);
                doc.text(format(new Date(trade.date), "PP"), 160, currentY + 10);

                // Financials
                doc.setTextColor(0);
                doc.text(`Entry: $${trade.entryPrice}      Exit: $${trade.exitPrice}      Qty: ${trade.quantity}`, 16, currentY + 20);

                const pnlStr = trade.pnl > 0 ? `+$${trade.pnl.toFixed(2)}` : `-$${Math.abs(trade.pnl).toFixed(2)}`;
                if (trade.pnl > 0) doc.setTextColor(16, 185, 129); // Green
                else doc.setTextColor(239, 68, 68); // Red
                doc.setFontSize(12);
                doc.text(`P/L: ${pnlStr}`, 16, currentY + 30);
                
                doc.setTextColor(0);
                doc.setFontSize(10);
                doc.text(`Fees: $${trade.fees.toFixed(2)}`, 80, currentY + 30);

                // Analysis
                doc.setFontSize(10);
                doc.setTextColor(80);
                const analysisText = doc.splitTextToSize(`Analysis: ${trade.analysis || "No analysis provided."}`, 175);
                doc.text(analysisText, 16, currentY + 40);

                // Rules checklist (Followed vs Not Followed)
                const followed = trade.rules || [];
                const notFollowed = rules.map(r => r.text).filter(r => !followed.includes(r));

                doc.setFontSize(9);
                doc.setTextColor(16, 185, 129); // Green
                doc.text(`Rules Followed: ${followed.length > 0 ? followed.join(", ") : "None"}`, 16, currentY + 52);
                
                doc.setTextColor(239, 68, 68); // Red
                doc.text(`Rules Missed: ${notFollowed.length > 0 ? notFollowed.join(", ") : "None"}`, 16, currentY + 58);

                currentY += 75;
            });

            doc.save(`trade_journal_detailed_${format(new Date(), "yyyy-MM-dd")}.pdf`);
            toast.success("PDF Exported Successfully!");
        } catch (error) {
            console.error("PDF Generation Error:", error);
            toast.error("Failed to generate PDF");
        }
    }

    return (
        <div className="space-y-4">
            <div className="flex justify-between items-center bg-card p-4 rounded-xl border shadow-sm">
                <div className="relative w-full max-w-sm">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input 
                        placeholder="Search symbols or analysis..." 
                        className="pl-8" 
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
                <Button onClick={handleExportPDF} className="bg-indigo-600 hover:bg-indigo-700 text-white">
                    <Download className="mr-2 h-4 w-4" />
                    Export Full Journal PDF
                </Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredTrades.map(trade => (
                    <Card key={trade.id} className="overflow-hidden hover:shadow-md transition-shadow">
                        <CardContent className="p-0">
                            <div className={`h-2 w-full ${trade.pnl > 0 ? 'bg-emerald-500' : 'bg-red-500'}`} />
                            <div className="p-5">
                                <div className="flex justify-between items-start mb-4">
                                    <div>
                                        <h3 className="font-bold text-lg">{trade.symbol}</h3>
                                        <p className="text-xs text-muted-foreground">{format(new Date(trade.date), "PPP")}</p>
                                    </div>
                                    <div className={`px-2.5 py-1 rounded-full text-xs font-semibold ${trade.type === 'buy' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'}`}>
                                        {trade.type.toUpperCase()}
                                    </div>
                                </div>
                                
                                <div className="flex justify-between items-baseline mb-4">
                                    <div className={`text-2xl font-bold ${trade.pnl > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                                        {trade.pnl > 0 ? '+' : ''}{trade.pnl.toLocaleString('en-IN', { style: 'currency', currency: 'INR' })}
                                    </div>
                                    <div className="text-sm text-muted-foreground">
                                        Qty: {trade.quantity}
                                    </div>
                                </div>

                                <div className="space-y-1.5 text-sm mb-4">
                                    <div className="flex justify-between">
                                        <span className="text-muted-foreground">Entry</span>
                                        <span className="font-medium">{trade.entryPrice}</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-muted-foreground">Exit</span>
                                        <span className="font-medium">{trade.exitPrice}</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-muted-foreground">Fees</span>
                                        <span className="font-medium">{trade.fees}</span>
                                    </div>
                                </div>

                                {trade.analysis && (
                                    <div className="text-sm bg-muted/50 p-3 rounded-lg mb-4 line-clamp-3">
                                        {trade.analysis}
                                    </div>
                                )}

                                <div className="flex flex-wrap gap-1 mb-4">
                                    {trade.rules && trade.rules.map((rule, idx) => (
                                        <span key={idx} className="text-[10px] bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300 px-2 py-0.5 rounded-full">
                                            {rule}
                                        </span>
                                    ))}
                                </div>

                                <div className="flex justify-end gap-2 pt-2 border-t mt-auto">
                                    <Button variant="ghost" size="sm" onClick={async () => {
                                        if (confirm("Delete this trade?")) {
                                            const res = await deleteTradeAction(trade.id);
                                            // Handle refresh (server action usually revalidates path)
                                        }
                                    }}>
                                        <Trash2 className="h-4 w-4 text-red-500" />
                                    </Button>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                ))}
                {filteredTrades.length === 0 && (
                    <div className="col-span-full py-12 text-center text-muted-foreground flex flex-col items-center">
                        <Target className="h-12 w-12 mb-4 opacity-20" />
                        <p>No trades found. Start logging your setups!</p>
                    </div>
                )}
            </div>
        </div>
    )
}
