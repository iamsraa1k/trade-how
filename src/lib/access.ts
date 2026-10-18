// Constitution features (the Momentum Breakout journal, rules engine and automation) are limited to the
// Google accounts listed in CONSTITUTION_EMAILS. It's an environment variable rather than code because the
// repository is public.
export function constitutionEmails(): string[] {
    return (process.env.CONSTITUTION_EMAILS || "").split(",").map(s => s.trim().toLowerCase()).filter(Boolean);
}

export function canUseConstitution(email?: string | null): boolean {
    return !!email && constitutionEmails().includes(email.trim().toLowerCase());
}
