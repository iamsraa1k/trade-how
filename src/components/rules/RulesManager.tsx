"use client"

import React, { useState } from "react"
import type { Rule } from "@/lib/db"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Trash2, Plus, Target } from "lucide-react"
import { toast } from "sonner"
import { addRuleAction, deleteRuleAction } from "@/app/actions"
// We assume next.js Server Actions automatically trigger router.refresh() 
// but to be perfectly reactive client-side we can manage local state too.

export function RulesManager({ initialRules }: { initialRules: Rule[] }) {
    const [rules, setRules] = useState<Rule[]>(initialRules);
    const [newRuleText, setNewRuleText] = useState("")
    const [isAddingRule, setIsAddingRule] = useState(false)

    const handleAddRule = async () => {
        if (!newRuleText.trim() || isAddingRule) return;
        setIsAddingRule(true);
        const result = await addRuleAction(newRuleText.trim());
        setIsAddingRule(false);
        if (result?.error) {
            toast.error(result.error);
        } else if (result?.rule) {
            toast.success("Rule added");
            setRules(prev => [...prev, result.rule]);
            setNewRuleText("");
        } else {
            // Fallback if the action doesn't return the full rule 
            // but Next.js router refreshing handles server state anyway.
            toast.success("Rule added");
            setNewRuleText("");
            window.location.reload(); 
        }
    }

    const handleDelete = async (id: string) => {
        const result = await deleteRuleAction(id);
        if (result?.error) {
            toast.error(result.error);
        } else {
            toast.success("Rule deleted");
            setRules(prev => prev.filter(r => r.id !== id));
        }
    }

    return (
        <Card className="max-w-2xl">
            <CardContent className="pt-6 space-y-6">
                <div className="flex items-center gap-3">
                    <Input
                        placeholder="E.g., Wait for 5m candle to close entirely"
                        value={newRuleText}
                        onChange={(e) => setNewRuleText(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' && newRuleText.trim() && !isAddingRule) {
                                handleAddRule();
                            }
                        }}
                    />
                    <Button disabled={!newRuleText.trim() || isAddingRule} onClick={handleAddRule} className="bg-indigo-600 hover:bg-indigo-700 text-white">
                        <Plus className="h-4 w-4 mr-2" /> Add Rule
                    </Button>
                </div>
                
                <div className="space-y-3">
                    {rules.length === 0 ? (
                         <div className="py-12 text-center text-muted-foreground flex flex-col items-center bg-muted/20 rounded-lg">
                            <Target className="h-10 w-10 mb-3 opacity-20" />
                            <p>No trading rules defined yet. Add some to build discipline!</p>
                        </div>
                    ) : (
                        rules.map(rule => (
                            <div key={rule.id} className="flex items-center justify-between p-4 bg-background border rounded-lg shadow-sm hover:border-indigo-200 transition-colors">
                                <span className="text-[15px] font-medium">{rule.text}</span>
                                <Button 
                                    variant="ghost" 
                                    size="sm" 
                                    className="text-muted-foreground hover:bg-red-100 hover:text-red-600" 
                                    onClick={() => handleDelete(rule.id)}
                                >
                                    <Trash2 className="h-4 w-4" />
                                </Button>
                            </div>
                        ))
                    )}
                </div>
            </CardContent>
        </Card>
    )
}
