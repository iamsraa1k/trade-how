"use client"

import { TradeForm } from "@/features/trades/components/TradeForm";
import { ModeToggle } from "@/shared/components/ui/mode-toggle";
import { Button } from "@/shared/components/ui/button";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useData } from "@/shared/context/DataContext";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function AddTradePage() {
    const { data: session, status } = useSession();
    const router = useRouter();
    const { rules } = useData();

    useEffect(() => {
        if (status === "unauthenticated") {
            router.push("/login");
        }
    }, [status, router]);

    if (status === "loading") {
        return null;
    }

    return (
        <div className="page-container max-w-3xl">
            <div className="page-header">
                <h1 className="page-title">Add New Trade</h1>
                <p className="page-description">Record your executions and build your database.</p>
            </div>
            <TradeForm rules={rules} />
        </div>
    );
}
