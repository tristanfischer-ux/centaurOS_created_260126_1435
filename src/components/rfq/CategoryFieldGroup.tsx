'use client'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { RFQ_CATEGORIES } from '@/types/rfq'

// Define category groups
export type CategoryGroup = 'physical_products' | 'materials_supplies' | 'services'

const CATEGORY_GROUP_MAP: Record<string, CategoryGroup> = {
  'Custom Manufacturing': 'physical_products',
  'Prototyping': 'physical_products',
  'Components': 'physical_products',
  'Electronics': 'physical_products',
  'Raw Materials': 'materials_supplies',
  'Packaging': 'materials_supplies',
  'Tools & Equipment': 'materials_supplies',
  'Safety Equipment': 'materials_supplies',
  'Office Supplies': 'materials_supplies',
  'Assembly Services': 'services',
  'Quality Testing': 'services',
  'Logistics': 'services',
  'Other': 'services',
}

export function getCategoryGroup(category: string): CategoryGroup | null {
  return CATEGORY_GROUP_MAP[category] || null
}

// Common materials for manufacturing
const COMMON_MATERIALS = [
  'Aluminum 6061-T6',
  'Aluminum 7075',
  'Steel 1018',
  'Stainless Steel 304',
  'Stainless Steel 316',
  'Brass',
  'Copper',
  'Titanium',
  'ABS Plastic',
  'Nylon',
  'PEEK',
  'Polycarbonate',
  'Acetal (Delrin)',
  'Wood - Oak',
  'Wood - Plywood',
  'Other (specify)',
]

// Unit options
const DIMENSION_UNITS = ['mm', 'cm', 'in', 'ft']
const QUANTITY_UNITS = ['pieces', 'kg', 'lbs', 'meters', 'feet', 'liters']

interface CategoryFieldGroupProps {
  category: string
  formData: {
    quantity: string
    quantityUnit: string
    material: string
    customMaterial: string
    dimensionL: string
    dimensionW: string
    dimensionH: string
    dimensionUnit: string
    deliverySchedule: string
    scopeOfWork: string
    deliverables: string
  }
  onChange: (field: string, value: string) => void
  disabled?: boolean
  className?: string
}

export function CategoryFieldGroup({
  category,
  formData,
  onChange,
  disabled = false,
  className,
}: CategoryFieldGroupProps) {
  const categoryGroup = getCategoryGroup(category)
  
  if (!categoryGroup) {
    return null
  }

  const handleChange = (field: string) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    onChange(field, e.target.value)
  }

  const handleSelectChange = (field: string) => (value: string) => {
    onChange(field, value)
  }

  return (
    <Collapsible defaultOpen className={cn('space-y-4', className)}>
      <CollapsibleTrigger className="flex items-center justify-between w-full py-2 text-sm font-medium hover:text-primary transition-colors group">
        <span>
          {categoryGroup === 'physical_products' && 'Product Details'}
          {categoryGroup === 'materials_supplies' && 'Material Details'}
          {categoryGroup === 'services' && 'Service Details'}
          <span className="text-muted-foreground font-normal ml-1">(recommended)</span>
        </span>
        <ChevronDown className="w-4 h-4 transition-transform group-data-[state=open]:rotate-180" />
      </CollapsibleTrigger>
      
      <CollapsibleContent className="space-y-4 pt-2">
        {/* Physical Products: Manufacturing, Prototyping, Components, Electronics */}
        {categoryGroup === 'physical_products' && (
          <>
            {/* Quantity */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="quantity">Quantity</Label>
                <Input
                  id="quantity"
                  type="number"
                  value={formData.quantity}
                  onChange={handleChange('quantity')}
                  placeholder="e.g., 50"
                  min={1}
                  disabled={disabled}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="quantityUnit">Unit</Label>
                <Select
                  value={formData.quantityUnit}
                  onValueChange={handleSelectChange('quantityUnit')}
                  disabled={disabled}
                >
                  <SelectTrigger id="quantityUnit">
                    <SelectValue placeholder="Select" />
                  </SelectTrigger>
                  <SelectContent>
                    {QUANTITY_UNITS.map((unit) => (
                      <SelectItem key={unit} value={unit}>
                        {unit}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Material */}
            <div className="space-y-2">
              <Label htmlFor="material">Material</Label>
              <Select
                value={formData.material}
                onValueChange={handleSelectChange('material')}
                disabled={disabled}
              >
                <SelectTrigger id="material">
                  <SelectValue placeholder="Select material" />
                </SelectTrigger>
                <SelectContent>
                  {COMMON_MATERIALS.map((mat) => (
                    <SelectItem key={mat} value={mat}>
                      {mat}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {formData.material === 'Other (specify)' && (
                <Input
                  value={formData.customMaterial}
                  onChange={handleChange('customMaterial')}
                  placeholder="Specify material..."
                  disabled={disabled}
                  className="mt-2"
                />
              )}
            </div>

            {/* Dimensions */}
            <div className="space-y-2">
              <Label>Dimensions (L × W × H)</Label>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  value={formData.dimensionL}
                  onChange={handleChange('dimensionL')}
                  placeholder="L"
                  min={0}
                  step={0.1}
                  disabled={disabled}
                  className="w-20"
                />
                <span className="text-muted-foreground">×</span>
                <Input
                  type="number"
                  value={formData.dimensionW}
                  onChange={handleChange('dimensionW')}
                  placeholder="W"
                  min={0}
                  step={0.1}
                  disabled={disabled}
                  className="w-20"
                />
                <span className="text-muted-foreground">×</span>
                <Input
                  type="number"
                  value={formData.dimensionH}
                  onChange={handleChange('dimensionH')}
                  placeholder="H"
                  min={0}
                  step={0.1}
                  disabled={disabled}
                  className="w-20"
                />
                <Select
                  value={formData.dimensionUnit}
                  onValueChange={handleSelectChange('dimensionUnit')}
                  disabled={disabled}
                >
                  <SelectTrigger className="w-20">
                    <SelectValue placeholder="mm" />
                  </SelectTrigger>
                  <SelectContent>
                    {DIMENSION_UNITS.map((unit) => (
                      <SelectItem key={unit} value={unit}>
                        {unit}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </>
        )}

        {/* Materials & Supplies: Raw Materials, Packaging, Tools, etc. */}
        {categoryGroup === 'materials_supplies' && (
          <>
            {/* Quantity */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="quantity">Quantity</Label>
                <Input
                  id="quantity"
                  type="number"
                  value={formData.quantity}
                  onChange={handleChange('quantity')}
                  placeholder="e.g., 100"
                  min={1}
                  disabled={disabled}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="quantityUnit">Unit</Label>
                <Select
                  value={formData.quantityUnit}
                  onValueChange={handleSelectChange('quantityUnit')}
                  disabled={disabled}
                >
                  <SelectTrigger id="quantityUnit">
                    <SelectValue placeholder="Select" />
                  </SelectTrigger>
                  <SelectContent>
                    {QUANTITY_UNITS.map((unit) => (
                      <SelectItem key={unit} value={unit}>
                        {unit}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Delivery Schedule */}
            <div className="space-y-2">
              <Label htmlFor="deliverySchedule">Delivery Schedule</Label>
              <Select
                value={formData.deliverySchedule}
                onValueChange={handleSelectChange('deliverySchedule')}
                disabled={disabled}
              >
                <SelectTrigger id="deliverySchedule">
                  <SelectValue placeholder="Select schedule" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="one-time">One-time delivery</SelectItem>
                  <SelectItem value="weekly">Weekly</SelectItem>
                  <SelectItem value="bi-weekly">Bi-weekly</SelectItem>
                  <SelectItem value="monthly">Monthly</SelectItem>
                  <SelectItem value="quarterly">Quarterly</SelectItem>
                  <SelectItem value="on-demand">On demand</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </>
        )}

        {/* Services: Assembly, Testing, Logistics */}
        {categoryGroup === 'services' && (
          <>
            {/* Scope of Work */}
            <div className="space-y-2">
              <Label htmlFor="scopeOfWork">Scope of Work</Label>
              <Textarea
                id="scopeOfWork"
                value={formData.scopeOfWork}
                onChange={handleChange('scopeOfWork')}
                placeholder="Describe the work to be performed, including any specific requirements or constraints..."
                rows={3}
                disabled={disabled}
              />
            </div>

            {/* Expected Deliverables */}
            <div className="space-y-2">
              <Label htmlFor="deliverables">Expected Deliverables</Label>
              <Textarea
                id="deliverables"
                value={formData.deliverables}
                onChange={handleChange('deliverables')}
                placeholder="List the expected outputs or deliverables (e.g., test reports, assembled units, documentation)..."
                rows={2}
                disabled={disabled}
              />
            </div>
          </>
        )}
      </CollapsibleContent>
    </Collapsible>
  )
}
