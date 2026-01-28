'use client'

import { useMemo } from 'react'
import { motion } from 'framer-motion'
import { CategoryCoverage, CATEGORY_COLORS, FunctionCategory } from '@/types/org-blueprint'
import { cn } from '@/lib/utils'

interface CoverageRadarProps {
    categories: CategoryCoverage[]
    onCategoryClick?: (category: FunctionCategory) => void
    selectedCategory?: FunctionCategory | null
    size?: number
    className?: string
}

export function CoverageRadar({
    categories,
    onCategoryClick,
    selectedCategory,
    size = 300,
    className,
}: CoverageRadarProps) {
    const center = size / 2
    const radius = (size / 2) - 40 // Leave room for labels

    // Calculate points for the radar chart
    const { points, labelPositions, gridLevels } = useMemo(() => {
        const angleStep = (2 * Math.PI) / categories.length
        const startAngle = -Math.PI / 2 // Start from top

        const points = categories.map((cat, index) => {
            const angle = startAngle + index * angleStep
            const value = cat.coveragePercentage / 100
            const x = center + Math.cos(angle) * radius * value
            const y = center + Math.sin(angle) * radius * value
            return { x, y, category: cat }
        })

        const labelPositions = categories.map((cat, index) => {
            const angle = startAngle + index * angleStep
            const labelRadius = radius + 25
            const x = center + Math.cos(angle) * labelRadius
            const y = center + Math.sin(angle) * labelRadius
            return { x, y, category: cat, angle }
        })

        // Grid levels at 25%, 50%, 75%, 100%
        const gridLevels = [0.25, 0.5, 0.75, 1].map(level => {
            return categories.map((_, index) => {
                const angle = startAngle + index * angleStep
                const x = center + Math.cos(angle) * radius * level
                const y = center + Math.sin(angle) * radius * level
                return { x, y }
            })
        })

        return { points, labelPositions, gridLevels }
    }, [categories, center, radius])

    // Create the polygon path for the coverage area
    const coveragePath = points.length > 0
        ? `M ${points.map(p => `${p.x},${p.y}`).join(' L ')} Z`
        : ''

    // Create grid polygon paths
    const gridPaths = gridLevels.map(level =>
        `M ${level.map(p => `${p.x},${p.y}`).join(' L ')} Z`
    )

    // Axis lines from center to each point
    const axisLines = categories.map((_, index) => {
        const angle = -Math.PI / 2 + index * (2 * Math.PI) / categories.length
        const x2 = center + Math.cos(angle) * radius
        const y2 = center + Math.sin(angle) * radius
        return { x1: center, y1: center, x2, y2 }
    })

    return (
        <div className={cn("relative", className)}>
            <svg
                width={size}
                height={size}
                viewBox={`0 0 ${size} ${size}`}
                className="overflow-visible"
            >
                {/* Grid lines */}
                {gridPaths.map((path, index) => (
                    <path
                        key={`grid-${index}`}
                        d={path}
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1"
                        className="text-slate-200"
                        strokeDasharray={index < 3 ? "4,4" : undefined}
                    />
                ))}

                {/* Axis lines */}
                {axisLines.map((line, index) => (
                    <line
                        key={`axis-${index}`}
                        x1={line.x1}
                        y1={line.y1}
                        x2={line.x2}
                        y2={line.y2}
                        stroke="currentColor"
                        strokeWidth="1"
                        className="text-slate-200"
                    />
                ))}

                {/* Coverage area */}
                <motion.path
                    d={coveragePath}
                    fill="currentColor"
                    className="text-primary/20"
                    stroke="currentColor"
                    strokeWidth="2"
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.5, ease: 'easeOut' }}
                />

                {/* Data points */}
                {points.map((point, index) => {
                    const isSelected = selectedCategory === point.category.category
                    const color = CATEGORY_COLORS[point.category.category]
                    
                    return (
                        <motion.circle
                            key={`point-${index}`}
                            cx={point.x}
                            cy={point.y}
                            r={isSelected ? 8 : 5}
                            fill={color}
                            stroke="white"
                            strokeWidth="2"
                            className={cn(
                                "cursor-pointer transition-all",
                                onCategoryClick && "hover:r-7"
                            )}
                            onClick={() => onCategoryClick?.(point.category.category)}
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            transition={{ delay: index * 0.05, duration: 0.3 }}
                            whileHover={{ scale: 1.3 }}
                        />
                    )
                })}

                {/* Labels */}
                {labelPositions.map((label, index) => {
                    const isSelected = selectedCategory === label.category.category
                    const textAnchor = label.x < center - 10 ? 'end' : label.x > center + 10 ? 'start' : 'middle'
                    const color = CATEGORY_COLORS[label.category.category]

                    return (
                        <g key={`label-${index}`}>
                            <text
                                x={label.x}
                                y={label.y}
                                textAnchor={textAnchor}
                                dominantBaseline="middle"
                                className={cn(
                                    "text-[10px] font-medium cursor-pointer transition-colors",
                                    isSelected ? "fill-foreground font-semibold" : "fill-muted-foreground"
                                )}
                                onClick={() => onCategoryClick?.(label.category.category)}
                            >
                                {label.category.category.split(' ')[0]}
                            </text>
                            <text
                                x={label.x}
                                y={label.y + 12}
                                textAnchor={textAnchor}
                                dominantBaseline="middle"
                                className="text-[9px] font-semibold"
                                style={{ fill: color }}
                            >
                                {label.category.coveragePercentage}%
                            </text>
                        </g>
                    )
                })}

                {/* Center percentage */}
                <text
                    x={center}
                    y={center - 8}
                    textAnchor="middle"
                    className="text-2xl font-bold fill-foreground"
                >
                    {Math.round(
                        categories.reduce((sum, cat) => sum + cat.coveragePercentage, 0) / categories.length
                    )}%
                </text>
                <text
                    x={center}
                    y={center + 12}
                    textAnchor="middle"
                    className="text-xs fill-muted-foreground"
                >
                    Overall Coverage
                </text>
            </svg>
        </div>
    )
}

// Compact version for widget
export function CoverageRadarCompact({
    categories,
    size = 160,
    className,
}: {
    categories: CategoryCoverage[]
    size?: number
    className?: string
}) {
    const center = size / 2
    const radius = (size / 2) - 10

    const { points, gridPath } = useMemo(() => {
        const angleStep = (2 * Math.PI) / categories.length
        const startAngle = -Math.PI / 2

        const points = categories.map((cat, index) => {
            const angle = startAngle + index * angleStep
            const value = cat.coveragePercentage / 100
            const x = center + Math.cos(angle) * radius * value
            const y = center + Math.sin(angle) * radius * value
            return { x, y }
        })

        const gridPoints = categories.map((_, index) => {
            const angle = startAngle + index * angleStep
            const x = center + Math.cos(angle) * radius
            const y = center + Math.sin(angle) * radius
            return { x, y }
        })
        const gridPath = `M ${gridPoints.map(p => `${p.x},${p.y}`).join(' L ')} Z`

        return { points, gridPath }
    }, [categories, center, radius])

    const coveragePath = points.length > 0
        ? `M ${points.map(p => `${p.x},${p.y}`).join(' L ')} Z`
        : ''

    const avgCoverage = Math.round(
        categories.reduce((sum, cat) => sum + cat.coveragePercentage, 0) / categories.length
    )

    return (
        <div className={cn("relative", className)}>
            <svg
                width={size}
                height={size}
                viewBox={`0 0 ${size} ${size}`}
            >
                {/* Outer grid */}
                <path
                    d={gridPath}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1"
                    className="text-slate-200"
                />

                {/* Coverage area */}
                <motion.path
                    d={coveragePath}
                    fill="currentColor"
                    className="text-primary/30"
                    stroke="currentColor"
                    strokeWidth="2"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.5 }}
                />

                {/* Center text */}
                <text
                    x={center}
                    y={center + 4}
                    textAnchor="middle"
                    className="text-xl font-bold fill-foreground"
                >
                    {avgCoverage}%
                </text>
            </svg>
        </div>
    )
}
