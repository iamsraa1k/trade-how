"use client"

import { DisciplineView } from "@/features/constitution/components/DisciplineView";
import { useData } from "@/shared/context/DataContext";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function DisciplinePage() {
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
    <div className="page-container">
      <div className="page-header">
        <h1 className="page-title">Discipline</h1>
        <p className="page-description">The consequence ladder and the impulse lane — rules enforced from outside your head.</p>
      </div>
      <DisciplineView constitution={constitution} trades={trades} breaches={breaches} impulses={impulses} />
    </div>
  );
}
