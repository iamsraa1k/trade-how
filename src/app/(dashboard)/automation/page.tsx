"use client"

import { AutomationView } from "@/features/automation/components/AutomationView";
import { useData } from "@/shared/context/DataContext";
import { ConstitutionGate } from "@/features/constitution/components/ConstitutionGate";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function AutomationPage() {
  const { status } = useSession();
  const router = useRouter();
  const { constitution, trades, breaches } = useData();

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login");
    }
  }, [status, router]);

  if (status === "loading") {
    return null;
  }

  return (
    <ConstitutionGate>
      <div className="page-container">
        <div className="page-header">
          <h1 className="page-title">Automation</h1>
          <p className="page-description">Nightly scan, paper trading, position checks and Telegram alerts — all from free end-of-day data.</p>
        </div>
        <AutomationView constitution={constitution} trades={trades} breaches={breaches} />
      </div>
    </ConstitutionGate>
  );
}
