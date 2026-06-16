"use client"

import React, { createContext, useContext, useState, useEffect } from "react"
import type { Trade, Rule, MonthlyAnalysis } from "@/lib/db"

interface DataContextType {
    trades: Trade[]
    rules: Rule[]
    monthlyAnalyses: MonthlyAnalysis[]
    setTrades: React.Dispatch<React.SetStateAction<Trade[]>>
    setRules: React.Dispatch<React.SetStateAction<Rule[]>>
    setMonthlyAnalyses: React.Dispatch<React.SetStateAction<MonthlyAnalysis[]>>
}

const DataContext = createContext<DataContextType | undefined>(undefined)

export function DataProvider({ 
    children, 
    initialTrades, 
    initialRules, 
    initialMonthlyAnalyses 
}: { 
    children: React.ReactNode, 
    initialTrades: Trade[], 
    initialRules: Rule[], 
    initialMonthlyAnalyses: MonthlyAnalysis[] 
}) {
    const [trades, setTrades] = useState<Trade[]>(initialTrades)
    const [rules, setRules] = useState<Rule[]>(initialRules)
    const [monthlyAnalyses, setMonthlyAnalyses] = useState<MonthlyAnalysis[]>(initialMonthlyAnalyses)

    // Sync with server data when it changes (e.g. after revalidatePath)
    useEffect(() => {
        setTrades(initialTrades)
    }, [initialTrades])

    useEffect(() => {
        setRules(initialRules)
    }, [initialRules])

    useEffect(() => {
        setMonthlyAnalyses(initialMonthlyAnalyses)
    }, [initialMonthlyAnalyses])

    return (
        <DataContext.Provider value={{ trades, rules, monthlyAnalyses, setTrades, setRules, setMonthlyAnalyses }}>
            {children}
        </DataContext.Provider>
    )
}

export function useData() {
    const context = useContext(DataContext)
    if (!context) {
        throw new Error("useData must be used within a DataProvider")
    }
    return context
}
