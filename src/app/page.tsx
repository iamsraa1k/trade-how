
import { ModeToggle } from "@/components/ui/mode-toggle";
import { Dashboard } from "@/components/dashboard/Dashboard";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import Link from "next/link";

import { getTrades } from "@/lib/db";

import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function Home() {
  const session = await getServerSession(authOptions);

  if (!session || !session.user?.email) {
    redirect("/login");
  }

  const trades = await getTrades(session.user.email);

  return (
    <div className="min-h-screen p-4 sm:p-6 font-[family-name:var(--font-geist-sans)] bg-zinc-50 dark:bg-zinc-950 flex flex-col">
      <header className="flex flex-col sm:flex-row justify-between items-center mb-6 w-full px-4 sm:px-8 gap-4">
        <h1 className="text-3xl font-bold tracking-tight bg-gradient-to-r from-indigo-500 to-purple-600 bg-clip-text text-transparent">TradeHow</h1>
        <div className="flex items-center gap-4 w-full sm:w-auto justify-between sm:justify-end">
          <Link href="/add">
            <Button className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold">
              <Plus className="mr-2 h-4 w-4" /> New Trade
            </Button>
          </Link>
          <ModeToggle />
        </div>
      </header>
      <main className="flex-1 w-full px-4 sm:px-8">
        <Dashboard trades={trades} />
      </main>
    </div>
  );
}
