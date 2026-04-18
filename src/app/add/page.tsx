import { TradeForm } from "@/components/entry/TradeForm";
import { ModeToggle } from "@/components/ui/mode-toggle";
import { Button } from "@/components/ui/button";
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
        <div className="w-full max-w-3xl mx-auto space-y-6">
            <div>
                <h1 className="text-3xl font-bold tracking-tight">Add New Trade</h1>
                <p className="text-muted-foreground mt-1">Record your executions and build your database.</p>
            </div>
            <TradeForm rules={rules} />
        </div>
    );
}
