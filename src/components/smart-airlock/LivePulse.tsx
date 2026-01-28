'use client'

import React, { useEffect, useRef, useState } from 'react'
import { getPulseMetrics } from '@/actions/tasks'
import { Activity } from 'lucide-react'
import { cn } from '@/lib/utils'

// Polling and animation configuration
const METRICS_POLL_INTERVAL = 10000 // 10 seconds
const SPIKE_ANIMATION_DURATION = 2000 // 2 seconds

export function LivePulse() {
    const [activityCount, setActivityCount] = useState(0)
    const [isSpiking, setIsSpiking] = useState(false)
    const canvasRef = useRef<HTMLCanvasElement>(null)
    const spikeTimeoutRef = useRef<NodeJS.Timeout | null>(null)

    // Poll for metrics
    useEffect(() => {
        let mounted = true
        
        const fetchMetrics = async () => {
            try {
                const { actions } = await getPulseMetrics()
                if (!mounted) return
                
                setActivityCount(actions)
                // If significant activity, trigger visual spike
                if (actions > 0) {
                    setIsSpiking(true)
                    // Clear any existing timeout before setting a new one
                    if (spikeTimeoutRef.current) {
                        clearTimeout(spikeTimeoutRef.current)
                    }
                    spikeTimeoutRef.current = setTimeout(() => {
                        if (mounted) setIsSpiking(false)
                    }, SPIKE_ANIMATION_DURATION)
                }
            } catch (error) {
                console.error('Error fetching pulse metrics:', error)
            }
        }

        fetchMetrics()
        const interval = setInterval(fetchMetrics, METRICS_POLL_INTERVAL)
        return () => {
            mounted = false
            clearInterval(interval)
            if (spikeTimeoutRef.current) {
                clearTimeout(spikeTimeoutRef.current)
            }
        }
    }, [])

    // EKG Animation Logic
    useEffect(() => {
        const canvas = canvasRef.current
        if (!canvas) return
        const ctx = canvas.getContext('2d')
        if (!ctx) return

        let animationFrameId: number
        let x = 0
        const height = canvas.height
        const width = canvas.width

        ctx.strokeStyle = '#22c55e' // Green-500
        ctx.lineWidth = 2
        ctx.lineJoin = 'round'

        const draw = () => {
            ctx.beginPath()
            ctx.moveTo(x, height / 2)

            x += 2
            if (x > width) {
                x = 0
                ctx.clearRect(0, 0, width, height)
                ctx.beginPath()
                ctx.moveTo(0, height / 2)
            }

            // Generate noise or spike
            let y = height / 2
            if (Math.random() > 0.98 || isSpiking && Math.random() > 0.8) {
                const amplitude = isSpiking ? 20 : 5
                y += (Math.random() - 0.5) * amplitude
            }

            ctx.lineTo(x, y)
            ctx.stroke()

            animationFrameId = requestAnimationFrame(draw)
        }

        draw()

        return () => cancelAnimationFrame(animationFrameId)
    }, [isSpiking])

    return (
        <div className="flex items-center gap-4 p-4 bg-black/40 border border-green-500/20 rounded-xl backdrop-blur-sm">
            <div className="relative h-12 w-32 overflow-hidden bg-black/50 rounded-md border border-green-900/50">
                <canvas
                    ref={canvasRef}
                    width={128}
                    height={48}
                    className="absolute inset-0 w-full h-full opacity-80"
                />
            </div>
            <div className="flex flex-col">
                <div className="flex items-center gap-2 text-green-400">
                    <Activity className={cn("w-4 h-4", isSpiking && "animate-pulse")} />
                    <span className="text-xs font-mono uppercase tracking-widest text-green-500 font-bold">
                        System Status: Active
                    </span>
                </div>
                <span className="text-[10px] text-green-500/60 font-mono">
                    {activityCount} Operations / Hour
                </span>
            </div>
        </div>
    )
}
