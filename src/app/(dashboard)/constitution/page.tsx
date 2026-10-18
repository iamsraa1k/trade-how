"use client"

import { ConstitutionView } from "@/features/constitution/components/ConstitutionView";
import { useData } from "@/shared/context/DataContext";
import { ConstitutionGate } from "@/features/constitution/components/ConstitutionGate";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function ConstitutionPage() {
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
          <h1 className="page-title">Trading Constitution</h1>
          <p className="page-description">One setup, fixed risk, and consequences decided in advance. Process framework, not investment advice.</p>
        </div>
        <ConstitutionView constitution={constitution} trades={trades} breaches={breaches} />
      </div>
    </ConstitutionGate>
  );
}
