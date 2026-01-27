"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { submitRFQ } from "@/actions/marketplace"
import { Loader2 } from "lucide-react"
import { toast } from "sonner" // Assuming sonner is used, or I'll use a basic alert if not available

export function CreateRFQDialog() {
    const [open, setOpen] = useState(false)
    const [loading, setLoading] = useState(false)
    const [formData, setFormData] = useState({
        title: "",
        specifications: "",
        budget_range: "",
    })

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setLoading(true)

        try {
            const result = await submitRFQ(formData)
            if (result.error) {
                toast.error(result.error)
                return
            }

            setOpen(false)
            setFormData({ title: "", specifications: "", budget_range: "" })
            toast.success("RFQ submitted successfully")
        } catch (error) {
            console.error(error)
            toast.error("Something went wrong")
        } finally {
            setLoading(false)
        }
    }

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button size="sm" className="bg-slate-900 text-white">Create RFQ</Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle>Create Manufacturing RFQ</DialogTitle>
                    <DialogDescription>
                        Submit your specifications to our network of vetted manufacturers.
                    </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="grid gap-4 py-4">
                    <div className="grid gap-2">
                        <Label htmlFor="title">Project Title</Label>
                        <Input
                            id="title"
                            value={formData.title}
                            onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                            placeholder="e.g. Aluminum Enclosure Prototype"
                            required
                        />
                    </div>
                    <div className="grid gap-2">
                        <Label htmlFor="budget">Budget Range</Label>
                        <Input
                            id="budget"
                            value={formData.budget_range}
                            onChange={(e) => setFormData({ ...formData, budget_range: e.target.value })}
                            placeholder="e.g. $500 - $1,000"
                            required
                        />
                    </div>
                    <div className="grid gap-2">
                        <Label htmlFor="specs">Specifications</Label>
                        <Textarea
                            id="specs"
                            value={formData.specifications}
                            onChange={(e) => setFormData({ ...formData, specifications: e.target.value })}
                            placeholder="Detailed requirements, materials, tolerances..."
                            className="h-32"
                            required
                        />
                    </div>
                    <DialogFooter>
                        <Button type="submit" disabled={loading}>
                            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Submit RFQ
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    )
}
