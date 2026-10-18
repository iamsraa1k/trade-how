"use client"

import React, { createContext, useContext, useState, useEffect } from "react"
import type { Trade, Rule, MonthlyAnalysis, ConstitutionSettings, Breach, Impulse } from "@/lib/db"

interface DataContextType {
    trades: Trade[]
    rules: Rule[]
    monthlyAnalyses: MonthlyAnalysis[]
    constitution: ConstitutionSettings | null
    breaches: Breach[]
    impulses: Impulse[]
    // Constitution features exist only for allowed accounts, and show only while the mode is switched on.
    constitutionAllowed: boolean
    constitutionMode: boolean
    setTrades: React.Dispatch<React.SetStateAction<Trade[]>>
    setRules: React.Dispatch<React.SetStateAction<Rule[]>>
    setMonthlyAnalyses: React.Dispatch<React.SetStateAction<MonthlyAnalysis[]>>
    setConstitution: React.Dispatch<React.SetStateAction<ConstitutionSettings | null>>
    setBreaches: React.Dispatch<React.SetStateAction<Breach[]>>
    setImpulses: React.Dispatch<React.SetStateAction<Impulse[]>>
}

const DataContext = createContext<DataContextType | undefined>(undefined)

export function DataProvider({ 
    children, 
    initialTrades, 
    initialRules, 
    initialMonthlyAnalyses,
    initialConstitution,
    initialBreaches,
    initialImpulses,
    constitutionAllowed = false
}: { 
    children: React.ReactNode, 
    initialTrades: Trade[], 
    initialRules: Rule[], 
    initialMonthlyAnalyses: MonthlyAnalysis[],
    initialConstitution: ConstitutionSettings | null,
    initialBreaches: Breach[],
    initialImpulses: Impulse[],
    constitutionAllowed?: boolean
}) {
    const [trades, setTrades] = useState<Trade[]>(initialTrades)
    const [rules, setRules] = useState<Rule[]>(initialRules)
    const [monthlyAnalyses, setMonthlyAnalyses] = useState<MonthlyAnalysis[]>(initialMonthlyAnalyses)
    const [constitution, setConstitution] = useState<ConstitutionSettings | null>(initialConstitution)
    const [breaches, setBreaches] = useState<Breach[]>(initialBreaches)
    const [impulses, setImpulses] = useState<Impulse[]>(initialImpulses)

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

    useEffect(() => {
        setConstitution(initialConstitution)
    }, [initialConstitution])

    useEffect(() => {
        setBreaches(initialBreaches)
    }, [initialBreaches])

    useEffect(() => {
        setImpulses(initialImpulses)
    }, [initialImpulses])

    return (
        <DataContext.Provider value={{
            trades, rules, monthlyAnalyses, constitution, breaches, impulses,
            constitutionAllowed, constitutionMode: constitutionAllowed && !!constitution?.enabled,
            setTrades, setRules, setMonthlyAnalyses, setConstitution, setBreaches, setImpulses
        }}>
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
