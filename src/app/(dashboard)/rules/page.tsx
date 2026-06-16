import { RulesManager } from "@/features/rules/components/RulesManager";
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
    <div className="page-container max-w-4xl">
      <div className="page-header">
        <h1 className="page-title">Trading Rules</h1>
        <p className="page-description">Manage your custom checklist for logging trades.</p>
      </div>
      <RulesManager initialRules={rules} />
    </div>
  );
}
