'use client'

import { useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { AlertTriangle, RefreshCw, ShoppingBag, ArrowLeft } from 'lucide-react'
import Link from 'next/link'

export default function OrdersError({
    error,
    reset,
}: {
    error: Error & { digest?: string }
    reset: () => void
}) {
    useEffect(() => {
        console.error('Orders error:', error)
    }, [error])

    return (
        <div className="container mx-auto py-8">
            <div className="flex items-center justify-center min-h-[50vh]">
                <Card className="max-w-md w-full">
                    <CardHeader className="text-center">
                        <div className="mx-auto w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center mb-4">
                            <AlertTriangle className="h-6 w-6 text-destructive" />
                        </div>
                        <CardTitle className="text-xl">Orders unavailable</CardTitle>
                        <CardDescription>
                            We couldn&apos;t load your orders. Please try again.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        {process.env.NODE_ENV === 'development' && (
                            <div className="p-3 bg-muted rounded-lg">
                                <p className="text-xs font-mono text-muted-foreground break-all">
                                    {error.message}
                                </p>
                                {error.digest && (
                                    <p className="text-xs font-mono text-muted-foreground mt-1">
                                        Error ID: {error.digest}
                                    </p>
                                )}
                            </div>
                        )}
                        
                        <div className="flex flex-col gap-2">
                            <Button onClick={reset} className="w-full">
                                <RefreshCw className="h-4 w-4 mr-2" />
                                Reload orders
                            </Button>
                            <div className="flex gap-2">
                                <Button variant="secondary" onClick={() => window.history.back()} className="flex-1">
                                    <ArrowLeft className="h-4 w-4 mr-2" />
                                    Go back
                                </Button>
                                <Button variant="secondary" asChild className="flex-1">
                                    <Link href="/my-orders">
                                        <ShoppingBag className="h-4 w-4 mr-2" />
                                        My Orders
                                    </Link>
                                </Button>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    )
}
