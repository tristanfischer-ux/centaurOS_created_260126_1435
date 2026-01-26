"use client"

import { Button } from "@/components/ui/button"
import { Plus } from "lucide-react"

export function CreateTaskDialog() {
    return (
        <Button size="sm" className="bg-white text-black hover:bg-gray-200">
            <Plus className="mr-2 h-4 w-4" /> New Task
        </Button>
    )
}
