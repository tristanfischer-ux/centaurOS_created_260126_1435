"use client"

import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { DollarSign, Clock, Rocket, TrendingUp } from "lucide-react"

import type { CostOfDelayInputs } from "./types"

interface CalculatorFormProps {
  inputs: CostOfDelayInputs
  onChange: (inputs: CostOfDelayInputs) => void
}

/**
 * Input form for the Cost of Delay calculator.
 *
 * @description Five fields that drive the entire visualization:
 * overhead, revenue, timeline, acceleration, and cost.
 * All fields update the parent state on change for instant chart updates.
 */
export function CalculatorForm({ inputs, onChange }: CalculatorFormProps) {
  const update = (field: keyof CostOfDelayInputs, value: string) => {
    const num = parseFloat(value) || 0
    onChange({ ...inputs, [field]: Math.max(0, num) })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <div className="flex items-center justify-center h-8 w-8 rounded-full bg-international-orange/10">
            <DollarSign className="h-4 w-4 text-international-orange" />
          </div>
          Your Numbers
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Monthly Overhead */}
        <div className="space-y-2">
          <Label htmlFor="monthlyOverhead" className="flex items-center gap-2 text-sm font-medium">
            <Clock className="h-3.5 w-3.5 text-muted-foreground" />
            Monthly Overhead (Burn Rate)
          </Label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
            <Input
              id="monthlyOverhead"
              type="number"
              min={0}
              step={1000}
              value={inputs.monthlyOverhead || ""}
              onChange={(e) => update("monthlyOverhead", e.target.value)}
              className="pl-7"
              placeholder="20,000"
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Salaries, rent, subscriptions — your monthly burn whether or not you&apos;ve launched.
          </p>
        </div>

        {/* Expected Monthly Revenue */}
        <div className="space-y-2">
          <Label htmlFor="expectedMonthlyRevenue" className="flex items-center gap-2 text-sm font-medium">
            <TrendingUp className="h-3.5 w-3.5 text-muted-foreground" />
            Expected Monthly Revenue
          </Label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
            <Input
              id="expectedMonthlyRevenue"
              type="number"
              min={0}
              step={1000}
              value={inputs.expectedMonthlyRevenue || ""}
              onChange={(e) => update("expectedMonthlyRevenue", e.target.value)}
              className="pl-7"
              placeholder="50,000"
            />
          </div>
          <p className="text-xs text-muted-foreground">
            What you expect to earn per month once you launch.
          </p>
        </div>

        {/* Months Until Launch */}
        <div className="space-y-2">
          <Label htmlFor="monthsUntilLaunch" className="flex items-center gap-2 text-sm font-medium">
            <Clock className="h-3.5 w-3.5 text-muted-foreground" />
            Months Until Planned Launch
          </Label>
          <Input
            id="monthsUntilLaunch"
            type="number"
            min={1}
            max={36}
            step={1}
            value={inputs.monthsUntilLaunch || ""}
            onChange={(e) => update("monthsUntilLaunch", e.target.value)}
            placeholder="6"
          />
          <p className="text-xs text-muted-foreground">
            How many months from now until your current planned launch date.
          </p>
        </div>

        {/* Months You Could Save */}
        <div className="space-y-2">
          <Label htmlFor="monthsSaved" className="flex items-center gap-2 text-sm font-medium">
            <Rocket className="h-3.5 w-3.5 text-muted-foreground" />
            Months You Could Save
          </Label>
          <Input
            id="monthsSaved"
            type="number"
            min={0}
            max={inputs.monthsUntilLaunch}
            step={0.5}
            value={inputs.monthsSaved || ""}
            onChange={(e) => update("monthsSaved", e.target.value)}
            placeholder="2"
          />
          <p className="text-xs text-muted-foreground">
            How much earlier you could launch if you invest to accelerate.
          </p>
        </div>

        {/* Acceleration Cost */}
        <div className="space-y-2">
          <Label htmlFor="accelerationCost" className="flex items-center gap-2 text-sm font-medium">
            <DollarSign className="h-3.5 w-3.5 text-muted-foreground" />
            Acceleration Cost
          </Label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
            <Input
              id="accelerationCost"
              type="number"
              min={0}
              step={1000}
              value={inputs.accelerationCost || ""}
              onChange={(e) => update("accelerationCost", e.target.value)}
              className="pl-7"
              placeholder="15,000"
            />
          </div>
          <p className="text-xs text-muted-foreground">
            What it would cost to achieve the acceleration — contractors, tools, resources.
          </p>
        </div>
      </CardContent>
    </Card>
  )
}
