"use client"

import { useState } from "react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Card, CardContent, CardTitle, CardHeader, CardFooter } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Briefcase, Factory, Hexagon } from "lucide-react"
import { Database } from "@/types/database.types"

// Mocks for now, real implementation would fetch from Supabase
const mockProviders: Database["public"]["Tables"]["service_providers"]["Row"][] = [
    { id: "1", company_name: "Apex Legal", provider_type: "Legal", is_verified: true, contact_info: { email: "contact@apex.law" } },
    { id: "2", company_name: "Vanguard VC", provider_type: "VC", is_verified: true, contact_info: { website: "vanguard.vc" } },
]

export default function MarketplacePage() {
    const [selectedStack, setSelectedStack] = useState<string[]>([])

    const toggleStack = (id: string) => {
        setSelectedStack(prev =>
            prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]
        )
    }

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-3xl font-bold tracking-tight text-slate-900 mb-2">The Bazaar</h1>
                <p className="text-slate-500">Professional services and manufacturing capabilities.</p>
            </div>

            <Tabs defaultValue="services" className="space-y-4">
                <TabsList className="bg-slate-100 border border-slate-200">
                    <TabsTrigger value="services" className="data-[state=active]:bg-white text-slate-500 data-[state=active]:text-slate-900 data-[state=active]:shadow-sm">
                        <Briefcase className="mr-2 h-4 w-4" /> Professional Services
                    </TabsTrigger>
                    <TabsTrigger value="manufacturing" className="data-[state=active]:bg-white text-slate-500 data-[state=active]:text-slate-900 data-[state=active]:shadow-sm">
                        <Factory className="mr-2 h-4 w-4" /> Manufacturing & RFQs
                    </TabsTrigger>
                </TabsList>

                <TabsContent value="services" className="space-y-4">
                    <div className="flex justify-between items-center bg-slate-50 p-4 rounded-lg border border-slate-200">
                        <div>
                            <h3 className="text-lg font-medium text-slate-900">Leadership Stack Builder</h3>
                            <p className="text-sm text-slate-500">Select multiple verified profiles to bundle into a fractional team.</p>
                        </div>
                        <Badge variant="outline" className="text-accent border-accent">
                            {selectedStack.length} Selected
                        </Badge>
                    </div>

                    <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                        {mockProviders.map(provider => (
                            <Card key={provider.id} className={`bg-white border-slate-200 shadow-sm transition-colors ${selectedStack.includes(provider.id) ? 'border-amber-500 ring-1 ring-amber-500' : ''}`}>
                                <CardHeader>
                                    <div className="flex justify-between items-start">
                                        <Badge variant="secondary" className="bg-slate-100 text-slate-600">
                                            {provider.provider_type}
                                        </Badge>
                                        {provider.is_verified && (
                                            <Badge className="bg-blue-50 text-blue-600 border border-blue-200 hover:bg-blue-100">Verified</Badge>
                                        )}
                                    </div>
                                    <CardTitle className="text-slate-900 mt-2">{provider.company_name}</CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <div className="text-sm text-slate-500">
                                        Top-tier {provider.provider_type} services for scaling startups.
                                    </div>
                                </CardContent>
                                <CardFooter>
                                    <Button
                                        variant={selectedStack.includes(provider.id) ? "default" : "outline"}
                                        className={`w-full ${selectedStack.includes(provider.id) ? 'bg-amber-500 text-white hover:bg-amber-600' : 'border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-slate-900'}`}
                                        onClick={() => toggleStack(provider.id)}
                                    >
                                        {selectedStack.includes(provider.id) ? "Selected" : "Add to Stack"}
                                    </Button>
                                </CardFooter>
                            </Card>
                        ))}
                    </div>
                </TabsContent>

                <TabsContent value="manufacturing">
                    <div className="rounded-lg border border-dashed border-foundry-800 p-12 text-center text-gray-500">
                        <Hexagon className="mx-auto h-12 w-12 opacity-20 mb-4" />
                        <h3 className="text-lg font-medium text-gray-300">No Open RFQs</h3>
                        <p className="mb-4">Submit a Request for Quotation to access our fabrication network.</p>
                        <Button className="bg-foundry-800 hover:bg-foundry-700 text-white">
                            Create RFQ
                        </Button>
                    </div>
                </TabsContent>
            </Tabs>
        </div>
    )
}
