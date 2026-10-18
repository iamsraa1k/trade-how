"use client"

import { RoutineView } from "@/features/constitution/components/RoutineView";
import { useData } from "@/shared/context/DataContext";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function RoutinePage() {
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
    <div className="page-container">
      <div className="page-header">
        <h1 className="page-title">Evening Routine</h1>
        <p className="page-description">Everything happens after 4 pm: open trades, the scan, sizing, GTTs and the journal.</p>
      </div>
      <RoutineView constitution={constitution} trades={trades} breaches={breaches} />
    </div>
  );
}
