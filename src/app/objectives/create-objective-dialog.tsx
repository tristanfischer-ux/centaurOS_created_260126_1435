"use client"

import { Button } from "@/components/ui/button"
import { Plus } from "lucide-react"

export function CreateObjectiveDialog({ disabled }: { disabled?: boolean }) {
    return (
        <Button size="sm" className="bg-white text-black hover:bg-gray-200" disabled={disabled}>
            <Plus className="mr-2 h-4 w-4" /> New Objective
        </Button>
    )
}
