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
        <div className="min-h-screen p-4 sm:p-8 font-[family-name:var(--font-geist-sans)] bg-zinc-50 dark:bg-zinc-950">
            <header className="flex justify-between items-center mb-8 max-w-3xl mx-auto w-full">
                <div className="flex items-center gap-4">
                    <Link href="/">
                        <Button variant="ghost" size="icon">
                            <ArrowLeft className="h-5 w-5" />
                        </Button>
                    </Link>
                    <h1 className="text-2xl font-bold tracking-tight">Add New Trade</h1>
                </div>
                <ModeToggle />
            </header>
            <main className="max-w-3xl mx-auto w-full">
                <TradeForm rules={rules} />
            </main>
        </div>
    );
}
