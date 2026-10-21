"use client"

import { useEffect } from "react"

// Registers /sw.js so Chrome on Android can install TradeHow as an app.
export function ServiceWorkerRegister() {
    useEffect(() => {
        if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return
        navigator.serviceWorker.register("/sw.js").catch(error => console.error("Service worker registration failed", error))
    }, [])
    return null
}
