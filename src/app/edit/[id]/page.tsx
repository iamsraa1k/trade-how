import { TradeForm } from "@/components/entry/TradeForm"
import { getRules, getTradeById } from "@/lib/db"
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import { redirect } from "next/navigation"

export default async function EditTradePage({ params }: { params: Promise<{ id: string }> }) {
    const session = await getServerSession(authOptions)

    if (!session || !session.user?.email) {
        redirect("/login")
    }

    const { email } = session.user
    
    // Await params object for Next.js 15+ constraints
    const { id } = await params;
    
    const [rules, trade] = await Promise.all([
        getRules(email),
        getTradeById(id, email)
    ])

    if (!trade) {
        return (
            <div className="flex flex-col items-center justify-center p-12 text-center">
                <h1 className="text-2xl font-bold text-red-500 mb-2">Trade Not Found</h1>
                <p className="text-muted-foreground">The trade you are trying to edit does not exist or you do not have permission.</p>
            </div>
        )
    }

    return (
        <div className="w-full h-full max-w-4xl mx-auto pb-12">
            <TradeForm rules={rules} initialData={trade} id={id} />
        </div>
    )
}
