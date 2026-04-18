import { RulesManager } from "@/components/rules/RulesManager";
import { getRules } from "@/lib/db";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function RulesPage() {
  const session = await getServerSession(authOptions);

  if (!session || !session.user?.email) {
    redirect("/login");
  }

  const rules = await getRules(session.user.email);

  return (
    <div className="w-full h-full max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Trading Rules</h1>
        <p className="text-muted-foreground mt-1">Manage your custom checklist for logging trades.</p>
      </div>
      <RulesManager initialRules={rules} />
    </div>
  );
}
