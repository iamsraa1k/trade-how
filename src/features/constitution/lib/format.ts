export const inr = (n: number | null | undefined, digits = 0) =>
    n === null || n === undefined || !isFinite(n) ? "—" : n.toLocaleString("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: digits })
