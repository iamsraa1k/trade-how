"use client"

import { TradeForm } from "@/features/trades/components/TradeForm"
import { useData } from "@/shared/context/DataContext"
import { useSession } from "next-auth/react"
import { useRouter, useParams } from "next/navigation"
import { useEffect } from "react"

export default function EditTradePage() {
    const { data: session, status } = useSession();
    const router = useRouter();
    const params = useParams();
    const { trades, rules } = useData();

    useEffect(() => {
        if (status === "unauthenticated") {
            router.push("/login");
        }
    }, [status, router]);

    if (status === "loading") {
        return null;
    }

    const id = params?.id as string;
    const trade = trades.find(t => t.id === id);

    if (!trade) {
        return (
            <div className="flex flex-col items-center justify-center p-12 text-center">
                <h1 className="text-2xl font-bold text-red-500 mb-2">Trade Not Found</h1>
                <p className="text-muted-foreground">The trade you are trying to edit does not exist or you do not have permission.</p>
            </div>
        )
    }

    return (
        <div className="w-full h-full max-w-4xl mx-auto pb-12">
            <TradeForm rules={rules} initialData={trade} id={id} />
        </div>
    )
}
