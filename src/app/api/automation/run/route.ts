import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { runDaily } from "@/features/automation/lib/pipeline";
import { canUseConstitution } from "@/lib/access";
import { getConstitution } from "@/lib/db";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// "Run now" from the Automation page: the evening job for the signed-in account only.
export async function POST() {
    const session = await getServerSession(authOptions);
    const email = session?.user?.email;
    if (!email) return NextResponse.json({ error: "Sign in first" }, { status: 401 });
    if (!canUseConstitution(email) || !(await getConstitution(email))?.enabled) {
        return NextResponse.json({ error: "Constitution mode isn't on for this account" }, { status: 403 });
    }
    try {
        const report = await runDaily([email], { force: true });
        const mine = report.users[0];
        return NextResponse.json({ asOf: report.asOf, light: report.light, breakouts: report.breakouts, bases: report.bases, sent: mine?.sent, error: mine?.error, message: mine?.message });
    } catch (error) {
        console.error("Manual automation run failed", error);
        return NextResponse.json({ error: error instanceof Error ? error.message : "Run failed" }, { status: 500 });
    }
}
