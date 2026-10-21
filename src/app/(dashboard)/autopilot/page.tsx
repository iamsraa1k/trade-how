"use client"

import { AutopilotView } from "@/features/autopilot/components/AutopilotView";
import { ConstitutionGate } from "@/features/constitution/components/ConstitutionGate";
import { useData } from "@/shared/context/DataContext";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function AutopilotPage() {
  const { status } = useSession();
  const router = useRouter();
  const { constitution, trades, breaches, impulses } = useData();

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
          <h1 className="page-title">Autopilot</h1>
          <p className="page-description">It scans every evening, trades the Momentum Breakout setup on paper, and writes down why.</p>
        </div>
        <AutopilotView constitution={constitution} trades={trades} breaches={breaches} impulses={impulses} />
      </div>
    </ConstitutionGate>
  );
}
