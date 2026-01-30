'use client'

import { Suspense } from 'react'
import { useFormStatus } from 'react-dom'
import { useSearchParams } from 'next/navigation'
import { login } from './actions'
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import Image from 'next/image'

function SubmitButton() {
    const { pending } = useFormStatus()

    return (
        <Button
            formAction={login}
            className="w-full h-12 bg-slate-900 hover:bg-slate-800 text-white font-medium tracking-wide uppercase text-sm transition-all duration-300 shadow-md hover:shadow-lg"
            disabled={pending}
        >
            {pending ? 'Initializing Session...' : 'Access Foundry'}
        </Button>
    )
}

function ErrorMessage() {
    const searchParams = useSearchParams()
    const error = searchParams.get('error')

    if (!error) return null

    return (
        <div className="p-4 text-sm text-red-600 bg-red-50 border border-red-100 rounded-sm mb-6 flex items-center gap-3">
            <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
            {error}
        </div>
    )
}

function LoginForm() {
    const marketingDomain = process.env.NEXT_PUBLIC_MARKETING_DOMAIN || 'https://centaurdynamics.io'
    
    return (
        <div className="w-full max-w-sm mx-auto space-y-8 relative z-10">
            <div className="space-y-2">
                <a href={marketingDomain} className="inline-block mb-8 group">
                    <span className="text-xs font-bold tracking-[0.3em] uppercase text-muted-foreground group-hover:text-cyan-600 transition-colors">
                        ← Return to Site
                    </span>
                </a>
                
                <div className="mb-8">
                    <h2 className="text-sm font-bold tracking-[0.2em] uppercase text-cyan-600">
                        Centaur Dynamics
                    </h2>
                </div>
                
                <div className="space-y-2">
                    <h1 className="text-4xl font-display font-semibold text-foreground tracking-tight">
                        Welcome Back.
                    </h1>
                    <p className="text-muted-foreground text-sm leading-relaxed">
                        Enter your credentials to access <span className="font-semibold text-foreground">CentaurOS</span>.
                    </p>
                </div>
            </div>

            <form className="space-y-6">
                <Suspense fallback={null}>
                    <ErrorMessage />
                </Suspense>

                <div className="space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="email" className="text-xs uppercase tracking-wider text-muted-foreground font-medium">Email Address</Label>
                        <Input
                            id="email"
                            name="email"
                            type="email"
                            placeholder="you@company.com"
                            autoFocus
                            autoComplete="off"
                            required
                            className="h-11 bg-background border focus:border-cyan-500 focus:ring-cyan-500/20 transition-all font-medium"
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="password" className="text-xs uppercase tracking-wider text-muted-foreground font-medium">Password</Label>
                        <Input
                            id="password"
                            name="password"
                            type="password"
                            autoComplete="current-password"
                            required
                            className="h-11 bg-background border focus:border-cyan-500 focus:ring-cyan-500/20 transition-all font-medium font-mono tracking-widest"
                        />
                    </div>
                </div>

                <SubmitButton />

                <div className="text-center pt-4">
                    <span className="text-xs text-muted-foreground">
                        Protected by Centaur Security Layer v4.3
                    </span>
                </div>
            </form>
        </div>
    )
}

export default function LoginPage() {
    return (
        <div className="min-h-screen flex w-full bg-white">
            {/* Left Side - Hero Image */}
            <div className="hidden lg:flex w-1/2 relative bg-muted overflow-hidden">
                <Image
                    src="/images/digital-centaur-working.png"
                    alt="Digital Centaur converting bits to atoms, 3D printing a rocket engine"
                    fill
                    className="object-cover object-right"
                    priority
                    quality={100}
                />

                {/* Subtle Gradient for Text Readability */}
                <div className="absolute inset-0 z-10 bg-gradient-to-t from-white/90 via-white/20 to-transparent" />

                <div className="relative z-20 flex flex-col justify-end p-12 h-full text-foreground pb-20">
                    <div className="h-1 w-20 bg-cyan-500 mb-6 shadow-[0_0_15px_rgba(6,182,212,0.6)]" />
                    <h3 className="text-sm font-bold tracking-[0.2em] uppercase text-cyan-700 mb-2">
                        Centaur Dynamics
                    </h3>
                    <h2 className="text-5xl font-display font-medium leading-[1.1] mb-6 tracking-tight drop-shadow-sm">
                        We build atoms at the
                        <br />
                        <span className="text-cyan-600">speed of bits.</span>
                    </h2>
                    <div className="flex items-center gap-4 text-sm font-mono text-muted-foreground tracking-wider uppercase font-semibold">
                        <span>System Status: Optimal</span>
                        <span className="h-2 w-2 rounded-full bg-cyan-500 animate-pulse shadow-[0_0_10px_rgba(6,182,212,0.8)]" />
                        <span>Latency: 12ms</span>
                    </div>
                </div>
            </div>

            {/* Right Side - Login Form */}
            <div className="w-full lg:w-1/2 flex items-center justify-center p-8 lg:p-12 relative bg-white">
                {/* Background Pattern for Right Side */}
                <div
                    className="absolute inset-0 opacity-[0.03] pointer-events-none bg-[radial-gradient(#ea580c_1px,transparent_1px)] bg-[length:32px_32px]"
                />
                <LoginForm />
            </div>
        </div>
    )
}
