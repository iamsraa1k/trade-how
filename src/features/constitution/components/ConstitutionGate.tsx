"use client"

import Link from "next/link"
import { ScrollText } from "lucide-react"
import { useData } from "@/shared/context/DataContext"

// Constitution pages render only while constitution mode is on; other accounts never see them.
export function ConstitutionGate({ children }: { children: React.ReactNode }) {
    const { constitutionAllowed, constitutionMode } = useData()
    if (constitutionMode) return <>{children}</>
    return (
        <div className="glass-card p-8 sm:p-12 text-center flex flex-col items-center gap-3 max-w-xl mx-auto mt-8">
            <ScrollText className="h-10 w-10 text-indigo-500 opacity-70" />
            {constitutionAllowed ? (
                <>
                    <h2 className="text-xl font-bold">Constitution mode is off</h2>
                    <p className="text-sm text-muted-foreground">Switch on <b>Constitution mode</b> in the sidebar to bring in your trading constitution, routine, discipline and automation.</p>
                </>
            ) : (
                <>
                    <h2 className="text-xl font-bold">Page not available</h2>
                    <p className="text-sm text-muted-foreground">This part of TradeHow isn&apos;t enabled for your account.</p>
                </>
            )}
            <Link href="/" className="text-sm font-medium text-indigo-600 dark:text-indigo-400 hover:underline mt-2">Back to the dashboard</Link>
        </div>
    )
}
