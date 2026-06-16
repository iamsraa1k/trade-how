import { TradeForm } from "@/features/trades/components/TradeForm";
import { ModeToggle } from "@/shared/components/ui/mode-toggle";
import { Button } from "@/shared/components/ui/button";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { getRules } from "@/lib/db";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function AddTradePage() {
    const session = await getServerSession(authOptions);

    if (!session || !session.user?.email) {
        redirect("/login");
    }

    const rules = await getRules(session.user.email);

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
