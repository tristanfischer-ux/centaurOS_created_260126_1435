/**
 * @file reports-view.tsx — Client component for financial reports
 *
 * @description Lets users select a report type, pick a date range,
 * generate the report, and view/export it.
 */

'use client'

import { useState, useTransition } from 'react'
import { BarChart3, Receipt, ArrowDownUp, Download } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { formatCurrency } from '@/types/payments'
import {
  generatePnLReport,
  generateVATReport,
  generateCashFlowStatementReport,
} from '@/actions/finance-reports'
import {
  getDateRangeFromPreset,
  type ReportType,
  type DatePreset,
} from '@/lib/finance/report-utils'
import type { PnLReport, VATReport, CashFlowStatement } from '@/lib/finance/reports'

const REPORT_TYPES: Array<{ value: ReportType; label: string; description: string; icon: typeof BarChart3 }> = [
  { value: 'pnl', label: 'Profit & Loss', description: 'Revenue, costs, and net profit breakdown', icon: BarChart3 },
  { value: 'vat', label: 'VAT Summary', description: 'VAT collected, paid, and net liability', icon: Receipt },
  { value: 'cash-flow-statement', label: 'Cash Flow Statement', description: 'Operating, investing, and financing activities', icon: ArrowDownUp },
]

const DATE_PRESETS: Array<{ value: DatePreset; label: string }> = [
  { value: 'this-month', label: 'This Month' },
  { value: 'last-month', label: 'Last Month' },
  { value: 'this-quarter', label: 'This Quarter' },
  { value: 'ytd', label: 'Year to Date' },
]

export function ReportsView() {
  const [reportType, setReportType] = useState<ReportType>('pnl')
  const [datePreset, setDatePreset] = useState<DatePreset>('this-month')
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  // Report data
  const [pnl, setPnl] = useState<PnLReport | null>(null)
  const [vat, setVat] = useState<VATReport | null>(null)
  const [cashFlow, setCashFlow] = useState<CashFlowStatement | null>(null)

  const handleGenerate = () => {
    setError(null)
    setPnl(null)
    setVat(null)
    setCashFlow(null)

    const range = getDateRangeFromPreset(datePreset)

    startTransition(async () => {
      switch (reportType) {
        case 'pnl': {
          const result = await generatePnLReport(range)
          if (result.error) { setError(result.error); return }
          setPnl(result.data)
          break
        }
        case 'vat': {
          const result = await generateVATReport(range)
          if (result.error) { setError(result.error); return }
          setVat(result.data)
          break
        }
        case 'cash-flow-statement': {
          const result = await generateCashFlowStatementReport(range)
          if (result.error) { setError(result.error); return }
          setCashFlow(result.data)
          break
        }
      }
    })
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl bg-international-orange/10 flex items-center justify-center">
          <BarChart3 className="h-5 w-5 text-international-orange" />
        </div>
        <div>
          <h1 className="text-2xl font-display font-bold text-foreground tracking-tight">Reports</h1>
          <p className="text-sm text-muted-foreground">Generate accountant-ready financial reports</p>
        </div>
      </div>

      {/* Report Type Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {REPORT_TYPES.map((type) => {
          const Icon = type.icon
          const isSelected = reportType === type.value
          return (
            <button
              key={type.value}
              onClick={() => setReportType(type.value)}
              className={`text-left rounded-lg border-2 p-4 transition-all ${
                isSelected
                  ? 'border-international-orange bg-international-orange/5'
                  : 'border-border hover:border-international-orange/30'
              }`}
            >
              <Icon className={`h-5 w-5 mb-2 ${isSelected ? 'text-international-orange' : 'text-muted-foreground'}`} />
              <p className="text-sm font-medium text-foreground">{type.label}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{type.description}</p>
            </button>
          )
        })}
      </div>

      {/* Controls */}
      <div className="flex items-end gap-4">
        <div className="space-y-2">
          <label className="text-sm font-medium text-foreground">Period</label>
          <Select value={datePreset} onValueChange={(v) => setDatePreset(v as DatePreset)}>
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DATE_PRESETS.map((p) => (
                <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button
          onClick={handleGenerate}
          disabled={isPending}
          className="bg-international-orange hover:bg-international-orange/90"
        >
          {isPending ? 'Generating...' : 'Generate Report'}
        </Button>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>

      {/* Report Output */}
      {pnl && <PnLReportView report={pnl} />}
      {vat && <VATReportView report={vat} />}
      {cashFlow && <CashFlowStatementView report={cashFlow} />}
    </div>
  )
}

// ============================================================
// Report Renderers
// ============================================================

function PnLReportView({ report }: { report: PnLReport }) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base font-semibold">Profit & Loss</CardTitle>
            <CardDescription>{report.period}</CardDescription>
          </div>
          <ExportButton report={report} />
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Revenue */}
        <ReportSection
          title="Revenue"
          items={report.revenue}
          total={report.totalRevenue}
          currency={report.currency}
          totalClassName="text-status-success"
        />
        {/* Cost of Sales */}
        {report.costOfSales.length > 0 && (
          <ReportSection
            title="Cost of Sales"
            items={report.costOfSales}
            total={report.totalCostOfSales}
            currency={report.currency}
            isNegative
          />
        )}
        {/* Gross Profit */}
        <div className="border-t-2 border-border pt-3 flex justify-between font-semibold">
          <span>Gross Profit</span>
          <span className={report.grossProfit >= 0 ? 'text-status-success' : 'text-destructive'}>
            {formatCurrency(report.grossProfit, report.currency)}
          </span>
        </div>
        {/* Operating Expenses */}
        {report.operatingExpenses.length > 0 && (
          <ReportSection
            title="Operating Expenses"
            items={report.operatingExpenses}
            total={report.totalOperatingExpenses}
            currency={report.currency}
            isNegative
          />
        )}
        {/* Net Profit */}
        <div className="border-t-2 border-foreground pt-3 flex justify-between text-lg font-bold">
          <span>Net Profit</span>
          <span className={report.netProfit >= 0 ? 'text-status-success' : 'text-destructive'}>
            {formatCurrency(report.netProfit, report.currency)}
          </span>
        </div>
      </CardContent>
    </Card>
  )
}

function VATReportView({ report }: { report: VATReport }) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base font-semibold">VAT Summary</CardTitle>
            <CardDescription>{report.period}</CardDescription>
          </div>
          <ExportButton report={report} />
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Summary */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="text-center p-3 rounded-lg bg-muted">
            <p className="text-xs text-muted-foreground">VAT Collected</p>
            <p className="text-lg font-semibold">{formatCurrency(report.vatCollected, report.currency)}</p>
          </div>
          <div className="text-center p-3 rounded-lg bg-muted">
            <p className="text-xs text-muted-foreground">VAT Paid</p>
            <p className="text-lg font-semibold">{formatCurrency(report.vatPaid, report.currency)}</p>
          </div>
          <div className="text-center p-3 rounded-lg bg-muted">
            <p className="text-xs text-muted-foreground">Net VAT Liability</p>
            <p className={`text-lg font-semibold ${report.netVATLiability >= 0 ? 'text-destructive' : 'text-status-success'}`}>
              {formatCurrency(Math.abs(report.netVATLiability), report.currency)}
              {report.netVATLiability < 0 ? ' (refund)' : ' (owed)'}
            </p>
          </div>
        </div>

        {/* Sales breakdown */}
        {report.salesBreakdown.length > 0 && (
          <div>
            <h3 className="text-sm font-medium mb-2">Sales (Output VAT)</h3>
            <div className="space-y-1">
              {report.salesBreakdown.map((item, idx) => (
                <div key={idx} className="grid grid-cols-4 text-sm py-1 border-b border-border last:border-0">
                  <span className="text-muted-foreground">{item.description}</span>
                  <span className="text-right">{formatCurrency(item.net, report.currency)}</span>
                  <span className="text-right">{formatCurrency(item.vat, report.currency)}</span>
                  <span className="text-right font-medium">{formatCurrency(item.gross, report.currency)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function CashFlowStatementView({ report }: { report: CashFlowStatement }) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base font-semibold">Cash Flow Statement</CardTitle>
            <CardDescription>{report.period}</CardDescription>
          </div>
          <ExportButton report={report} />
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {[report.operating, report.investing, report.financing].map((section) => (
          <div key={section.label}>
            <h3 className="text-sm font-medium mb-2">{section.label}</h3>
            {section.items.length === 0 ? (
              <p className="text-xs text-muted-foreground">No activity</p>
            ) : (
              <div className="space-y-1">
                {section.items.map((item, idx) => (
                  <div key={idx} className="flex justify-between text-sm py-1 border-b border-border last:border-0">
                    <span className="text-muted-foreground">{item.description}</span>
                    <span className={item.amount >= 0 ? '' : 'text-destructive'}>
                      {formatCurrency(Math.abs(item.amount), report.currency)}
                      {item.amount < 0 ? ' (out)' : ''}
                    </span>
                  </div>
                ))}
                <div className="flex justify-between text-sm font-semibold pt-1">
                  <span>Subtotal</span>
                  <span className={section.total >= 0 ? 'text-status-success' : 'text-destructive'}>
                    {formatCurrency(section.total, report.currency)}
                  </span>
                </div>
              </div>
            )}
          </div>
        ))}

        {/* Summary */}
        <div className="border-t-2 border-foreground pt-3 space-y-2">
          <div className="flex justify-between text-sm">
            <span>Net change in cash</span>
            <span className={`font-semibold ${report.netChange >= 0 ? 'text-status-success' : 'text-destructive'}`}>
              {formatCurrency(report.netChange, report.currency)}
            </span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Closing balance</span>
            <span className="font-semibold">{formatCurrency(report.closingBalance, report.currency)}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

// ============================================================
// Shared Components
// ============================================================

function ReportSection({ title, items, total, currency, isNegative, totalClassName }: {
  title: string
  items: Array<{ label: string; amount: number }>
  total: number
  currency: string
  isNegative?: boolean
  totalClassName?: string
}) {
  return (
    <div>
      <h3 className="text-sm font-medium mb-2">{title}</h3>
      <div className="space-y-1">
        {items.map((item, idx) => (
          <div key={idx} className="flex justify-between text-sm py-1 border-b border-border last:border-0">
            <span className="text-muted-foreground">{item.label}</span>
            <span>{isNegative ? `(${formatCurrency(item.amount, currency)})` : formatCurrency(item.amount, currency)}</span>
          </div>
        ))}
        <div className="flex justify-between text-sm font-semibold pt-1">
          <span>Total</span>
          <span className={totalClassName}>
            {isNegative ? `(${formatCurrency(total, currency)})` : formatCurrency(total, currency)}
          </span>
        </div>
      </div>
    </div>
  )
}

function buildCsvFromReport(report: PnLReport | VATReport | CashFlowStatement): string {
  const rows: string[][] = []

  if ('totalRevenue' in report) {
    // P&L report
    const pnl = report as PnLReport
    rows.push(['Profit & Loss', pnl.period])
    rows.push([])
    rows.push(['Revenue', '', ''])
    for (const item of pnl.revenue) rows.push([item.label, '', String(item.amount / 100)])
    rows.push(['Total Revenue', '', String(pnl.totalRevenue / 100)])
    rows.push([])
    if (pnl.costOfSales.length > 0) {
      rows.push(['Cost of Sales', '', ''])
      for (const item of pnl.costOfSales) rows.push([item.label, '', String(-item.amount / 100)])
      rows.push(['Total Cost of Sales', '', String(-pnl.totalCostOfSales / 100)])
      rows.push([])
    }
    rows.push(['Gross Profit', '', String(pnl.grossProfit / 100)])
    rows.push([])
    if (pnl.operatingExpenses.length > 0) {
      rows.push(['Operating Expenses', '', ''])
      for (const item of pnl.operatingExpenses) rows.push([item.label, '', String(-item.amount / 100)])
      rows.push(['Total Operating Expenses', '', String(-pnl.totalOperatingExpenses / 100)])
      rows.push([])
    }
    rows.push(['Net Profit', '', String(pnl.netProfit / 100)])
  } else if ('vatCollected' in report) {
    // VAT report
    const vat = report as VATReport
    rows.push(['VAT Summary', vat.period])
    rows.push([])
    rows.push(['VAT Collected', String(vat.vatCollected / 100)])
    rows.push(['VAT Paid', String(vat.vatPaid / 100)])
    rows.push(['Net VAT Liability', String(vat.netVATLiability / 100)])
    rows.push([])
    rows.push(['Sales Breakdown'])
    rows.push(['Description', 'Net', 'VAT', 'Gross'])
    for (const item of vat.salesBreakdown) {
      rows.push([item.description, String(item.net / 100), String(item.vat / 100), String(item.gross / 100)])
    }
  } else {
    // Cash flow statement
    const cf = report as CashFlowStatement
    rows.push(['Cash Flow Statement', cf.period])
    rows.push([])
    for (const section of [cf.operating, cf.investing, cf.financing]) {
      rows.push([section.label])
      for (const item of section.items) rows.push([item.description, String(item.amount / 100)])
      rows.push([`${section.label} Subtotal`, String(section.total / 100)])
      rows.push([])
    }
    rows.push(['Net Change in Cash', String(cf.netChange / 100)])
    rows.push(['Closing Balance', String(cf.closingBalance / 100)])
  }

  return rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n')
}

function ExportButton({ report }: { report: PnLReport | VATReport | CashFlowStatement }) {
  const handleExport = () => {
    const csv = buildCsvFromReport(report)
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `report-${new Date().toISOString().split('T')[0]}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <Button variant="outline" size="sm" onClick={handleExport}>
      <Download className="h-4 w-4 mr-2" />
      Export CSV
    </Button>
  )
}
