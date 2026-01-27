"use client"

import { useState } from "react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Card, CardContent, CardTitle, CardHeader, CardFooter } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Briefcase, Factory, Hexagon, Bot, Search, Filter } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Database } from "@/types/database.types"

type ServiceProvider = Database["public"]["Tables"]["service_providers"]["Row"]
type AITool = Database["public"]["Tables"]["ai_tools"]["Row"]
type ManufacturingRFQ = Database["public"]["Tables"]["manufacturing_rfqs"]["Row"]

interface MarketplaceViewProps {
    providers: ServiceProvider[]
    aiTools: AITool[]
    rfqs: ManufacturingRFQ[]
}

export function MarketplaceView({ providers, aiTools, rfqs }: MarketplaceViewProps) {
    const [selectedStack, setSelectedStack] = useState<string[]>([])
    const [searchQuery, setSearchQuery] = useState("")

    const toggleStack = (id: string) => {
        setSelectedStack(prev =>
            prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]
        )
    }

    const filteredProviders = providers.filter(p =>
        p.company_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.provider_type.toLowerCase().includes(searchQuery.toLowerCase())
    )

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-slate-900 mb-2">Marketplace</h1>
                    <p className="text-slate-500">Connect with professional services, AI agents, and manufacturing capabilities.</p>
                </div>
                <div className="relative w-full md:w-64">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
                    <Input
                        type="search"
                        placeholder="Search marketplace..."
                        className="pl-9 bg-white"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                </div>
            </div>

            <Tabs defaultValue="services" className="space-y-4">
                <TabsList className="bg-slate-100 border border-slate-200 w-full justify-start overflow-x-auto">
                    <TabsTrigger value="services" className="data-[state=active]:bg-white text-slate-500 data-[state=active]:text-slate-900 data-[state=active]:shadow-sm">
                        <Briefcase className="mr-2 h-4 w-4" /> Services
                    </TabsTrigger>
                    <TabsTrigger value="ai-tools" className="data-[state=active]:bg-white text-slate-500 data-[state=active]:text-slate-900 data-[state=active]:shadow-sm">
                        <Bot className="mr-2 h-4 w-4" /> AI Tools
                    </TabsTrigger>
                    <TabsTrigger value="manufacturing" className="data-[state=active]:bg-white text-slate-500 data-[state=active]:text-slate-900 data-[state=active]:shadow-sm">
                        <Factory className="mr-2 h-4 w-4" /> Manufacturing
                    </TabsTrigger>
                </TabsList>

                {/* Professional Services Tab */}
                <TabsContent value="services" className="space-y-4">
                    <div className="flex justify-between items-center bg-slate-50 p-4 rounded-lg border border-slate-200">
                        <div>
                            <h3 className="text-lg font-medium text-slate-900">Leadership Stack Builder</h3>
                            <p className="text-sm text-slate-500">Select multiple verified profiles to bundle into a fractional team.</p>
                        </div>
                        <Badge variant="outline" className="text-amber-600 border-amber-200 bg-amber-50">
                            {selectedStack.length} Selected
                        </Badge>
                    </div>

                    <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                        {filteredProviders.length === 0 ? (
                            <div className="col-span-full py-12 text-center text-gray-500">No providers found matching your search.</div>
                        ) : (
                            filteredProviders.map(provider => (
                                <Card key={provider.id} className={`bg-white border-slate-200 shadow-sm transition-all hover:shadow-md ${selectedStack.includes(provider.id) ? 'border-amber-500 ring-1 ring-amber-500' : ''}`}>
                                    <CardHeader>
                                        <div className="flex justify-between items-start">
                                            <Badge variant="secondary" className="bg-slate-100 text-slate-600">
                                                {provider.provider_type}
                                            </Badge>
                                            {provider.is_verified && (
                                                <Badge className="bg-blue-50 text-blue-600 border border-blue-200 hover:bg-blue-100 px-2 py-0.5 shadow-none">Verified</Badge>
                                            )}
                                        </div>
                                        <CardTitle className="text-slate-900 mt-2">{provider.company_name}</CardTitle>
                                    </CardHeader>
                                    <CardContent>
                                        <div className="text-sm text-slate-500 mb-4">
                                            Top-tier {provider.provider_type} services for scaling startups.
                                            {/* In a real app, we'd describe services from JSONB */}
                                        </div>
                                        {((provider.contact_info as any)?.services as string[]) && (
                                            <div className="flex flex-wrap gap-1 mb-2">
                                                {((provider.contact_info as any).services as string[]).slice(0, 2).map((s, i) => (
                                                    <span key={i} className="text-xs bg-slate-50 text-slate-500 px-2 py-1 rounded-sm border border-slate-100">{s}</span>
                                                ))}
                                                {((provider.contact_info as any).services as string[]).length > 2 && (
                                                    <span className="text-xs text-slate-400 px-1 py-1">+{((provider.contact_info as any).services as string[]).length - 2} more</span>
                                                )}
                                            </div>
                                        )}
                                    </CardContent>
                                    <CardFooter>
                                        <Button
                                            variant={selectedStack.includes(provider.id) ? "default" : "outline"}
                                            className={`w-full ${selectedStack.includes(provider.id) ? 'bg-amber-500 text-white hover:bg-amber-600' : 'border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-slate-900'}`}
                                            onClick={() => toggleStack(provider.id)}
                                        >
                                            {selectedStack.includes(provider.id) ? "In Stack" : "Add to Stack"}
                                        </Button>
                                    </CardFooter>
                                </Card>
                            ))
                        )}
                    </div>
                </TabsContent>

                {/* AI Tools Tab */}
                <TabsContent value="ai-tools" className="space-y-4">
                    <div className="rounded-lg bg-gradient-to-r from-purple-50 to-indigo-50 border border-indigo-100 p-6 mb-6">
                        <div className="flex items-center gap-4">
                            <div className="bg-white p-3 rounded-full shadow-sm">
                                <Bot className="h-6 w-6 text-indigo-600" />
                            </div>
                            <div>
                                <h3 className="text-lg font-medium text-indigo-900">AI Agent Registry</h3>
                                <p className="text-sm text-indigo-700">Deploy specialized autonomous agents to your workforce.</p>
                            </div>
                        </div>
                    </div>

                    <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                        {aiTools.map(tool => (
                            <Card key={tool.id} className="bg-white border-slate-200 shadow-sm hover:border-indigo-300 transition-all">
                                <CardHeader>
                                    <div className="flex justify-between items-center mb-2">
                                        <Badge variant="outline" className="text-indigo-600 border-indigo-200 bg-indigo-50">
                                            {tool.category}
                                        </Badge>
                                        <span className="text-xs font-medium text-slate-500">${tool.typical_monthly_cost}/mo</span>
                                    </div>
                                    <CardTitle className="text-slate-900">{tool.name}</CardTitle>
                                    <p className="text-xs text-slate-400 font-medium">{tool.provider}</p>
                                </CardHeader>
                                <CardContent>
                                    <p className="text-sm text-slate-600">{tool.description}</p>
                                </CardContent>
                                <CardFooter>
                                    <Button size="sm" className="w-full bg-slate-900 text-white hover:bg-slate-800">
                                        Deploy Agent
                                    </Button>
                                </CardFooter>
                            </Card>
                        ))}
                    </div>
                </TabsContent>

                {/* Manufacturing Tab */}
                <TabsContent value="manufacturing">
                    <div className="grid gap-6 md:grid-cols-3">
                        <div className="md:col-span-2 space-y-4">
                            <div className="flex justify-between items-center">
                                <h3 className="text-lg font-medium text-slate-900">Open RFQs</h3>
                                <Button size="sm" className="bg-slate-900 text-white">Create RFQ</Button>
                            </div>

                            {rfqs.length === 0 ? (
                                <div className="rounded-lg border border-dashed border-slate-300 p-12 text-center text-gray-500">
                                    <Hexagon className="mx-auto h-12 w-12 opacity-20 mb-4" />
                                    <h3 className="text-lg font-medium text-gray-400">No Open RFQs</h3>
                                    <p>Submit a Request for Quotation to access our fabrication network.</p>
                                </div>
                            ) : (
                                rfqs.map(rfq => (
                                    <Card key={rfq.id} className="bg-white border-slate-200">
                                        <CardHeader className="pb-2">
                                            <div className="flex justify-between items-start">
                                                <Badge className="bg-green-100 text-green-700 hover:bg-green-100 border-green-200 shadow-none">
                                                    {rfq.status}
                                                </Badge>
                                                <span className="text-xs text-slate-500 font-mono">{rfq.budget_range}</span>
                                            </div>
                                            <CardTitle className="text-base mt-2">{rfq.title}</CardTitle>
                                        </CardHeader>
                                        <CardContent>
                                            <p className="text-sm text-slate-600 line-clamp-2">{rfq.specifications}</p>
                                        </CardContent>
                                        <CardFooter className="pt-0">
                                            <Button variant="ghost" size="sm" className="ml-auto text-slate-500 hover:text-slate-900">View Details</Button>
                                        </CardFooter>
                                    </Card>
                                ))
                            )}
                        </div>

                        <div className="space-y-4">
                            <Card className="bg-slate-50 border-slate-200">
                                <CardHeader>
                                    <CardTitle className="text-sm font-medium uppercase tracking-wider text-slate-500">Network Stats</CardTitle>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                    <div>
                                        <div className="text-2xl font-bold text-slate-900">12k+</div>
                                        <div className="text-xs text-slate-500">Machine Hours Available</div>
                                    </div>
                                    <div>
                                        <div className="text-2xl font-bold text-slate-900">48h</div>
                                        <div className="text-xs text-slate-500">Avg. Quote Time</div>
                                    </div>
                                    <div>
                                        <div className="text-2xl font-bold text-slate-900">98%</div>
                                        <div className="text-xs text-slate-500">On-Time Delivery</div>
                                    </div>
                                </CardContent>
                            </Card>
                        </div>
                    </div>
                </TabsContent>
            </Tabs>
        </div>
    )
}
