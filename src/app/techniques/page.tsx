"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search,
  ArrowRight,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  X,
  Factory,
  ArrowLeft,
  Layers,
  Zap,
} from "lucide-react";
import {
  ALL_TECHNIQUES,
  TECHNIQUE_CATEGORIES,
  CATEGORY_LABELS,
  COST_TIER_LABELS,
  BATCH_SIZE_LABELS,
  filterTechniques,
  countByCategory,
} from "@/lib/manufacturing-techniques";
import type {
  ManufacturingTechnique,
  TechniqueCategory,
  CostTier,
} from "@/lib/manufacturing-techniques";
import {
  AnimatedSection,
  AnimatedCard,
  StaggerContainer,
  buttonHover,
  buttonTap,
} from "@/components/marketing/animations";

/**
 * Public manufacturing techniques explorer page.
 *
 * @description SEO-rich public page showcasing all 78+ manufacturing
 * techniques available through Fractional Forge. Searchable, filterable,
 * and designed to drive organic traffic and signups.
 */

const CATEGORY_ICONS: Record<TechniqueCategory, string> = {
  additive: "3D",
  subtractive: "CNC",
  forming: "F&S",
  casting: "CST",
  joining: "J&A",
  surface: "SRF",
  composite: "CMP",
  electronics: "PCB",
  textile: "TXT",
  advanced: "ADV",
};

const COST_COLORS: Record<CostTier, string> = {
  low: "text-status-success bg-status-success-light",
  medium: "text-status-info bg-status-info-light",
  high: "text-status-warning bg-status-warning-light",
  "very-high": "text-destructive bg-status-error-light",
};

export default function TechniquesPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] =
    useState<TechniqueCategory | null>(null);
  const [expandedTechnique, setExpandedTechnique] = useState<string | null>(
    null
  );

  const categoryCounts = useMemo(() => countByCategory(), []);

  const filteredTechniques = useMemo(
    () =>
      filterTechniques({
        query: searchQuery || null,
        category: selectedCategory,
      }),
    [searchQuery, selectedCategory]
  );

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Navigation */}
      <nav className="sticky top-0 z-40 bg-background/95 backdrop-blur-sm border-b border-muted">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link
              href="/"
              className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors text-sm"
            >
              <ArrowLeft className="h-4 w-4" />
              <span className="hidden sm:inline">Back to Home</span>
            </Link>
            <span className="text-muted-foreground">/</span>
            <h1 className="text-sm font-bold tracking-tight">
              Manufacturing Techniques
            </h1>
          </div>
          <motion.div whileHover={buttonHover} whileTap={buttonTap}>
            <Link
              href="/join"
              className="inline-flex items-center gap-2 bg-international-orange hover:bg-international-orange-hover text-white px-4 py-2 text-xs font-mono font-bold tracking-widest uppercase transition-colors rounded-md min-h-[44px]"
            >
              Apply Now
            </Link>
          </motion.div>
        </div>
      </nav>

      {/* Hero */}
      <section className="py-12 md:py-20 bg-muted/30 border-b border-muted">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 text-center">
          <AnimatedSection>
            <div className="inline-flex items-center gap-2 mb-4 px-3 py-1.5 border bg-card rounded-full">
              <Factory className="h-3.5 w-3.5 text-international-orange" />
              <span className="text-international-orange text-xs font-mono uppercase tracking-widest">
                {ALL_TECHNIQUES.length}+ Techniques
              </span>
            </div>
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-black mb-4 leading-tight">
              Every Manufacturing Process.
              <br className="hidden sm:block" /> One Platform.
            </h2>
            <p className="text-muted-foreground text-base md:text-lg max-w-2xl mx-auto leading-relaxed mb-8">
              Explore our complete library of manufacturing techniques — from
              rapid prototyping to full-scale production. Find the right process
              for your hardware project.
            </p>

            {/* Search */}
            <div className="max-w-xl mx-auto relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search techniques, materials, or applications..."
                className="w-full pl-11 pr-10 py-3 border rounded-xl bg-card text-sm focus:outline-none focus:ring-2 focus:ring-international-orange/30 focus:border-international-orange transition-colors"
                aria-label="Search manufacturing techniques"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-md text-muted-foreground hover:text-foreground transition-colors"
                  aria-label="Clear search"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          </AnimatedSection>
        </div>
      </section>

      {/* Category Filters */}
      <section className="py-6 border-b border-muted sticky top-[65px] z-30 bg-background">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-thin">
            <button
              onClick={() => setSelectedCategory(null)}
              className={`flex-shrink-0 px-4 py-2 rounded-full text-xs font-mono uppercase tracking-wider transition-colors min-h-[36px] ${
                selectedCategory === null
                  ? "bg-international-orange text-white"
                  : "border text-muted-foreground hover:text-foreground hover:bg-muted"
              }`}
            >
              All ({ALL_TECHNIQUES.length})
            </button>
            {TECHNIQUE_CATEGORIES.map((cat) => (
              <button
                key={cat}
                onClick={() =>
                  setSelectedCategory(cat === selectedCategory ? null : cat)
                }
                className={`flex-shrink-0 px-4 py-2 rounded-full text-xs font-mono uppercase tracking-wider transition-colors min-h-[36px] ${
                  selectedCategory === cat
                    ? "bg-international-orange text-white"
                    : "border text-muted-foreground hover:text-foreground hover:bg-muted"
                }`}
              >
                {CATEGORY_LABELS[cat]} ({categoryCounts[cat] || 0})
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Results */}
      <section className="py-8 md:py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          {/* Count */}
          <p className="text-sm text-muted-foreground mb-6">
            Showing{" "}
            <span className="font-semibold text-foreground">
              {filteredTechniques.length}
            </span>{" "}
            technique{filteredTechniques.length !== 1 ? "s" : ""}
            {selectedCategory && (
              <>
                {" "}
                in{" "}
                <span className="font-semibold text-foreground">
                  {CATEGORY_LABELS[selectedCategory]}
                </span>
              </>
            )}
            {searchQuery && (
              <>
                {" "}
                matching &ldquo;
                <span className="font-semibold text-foreground">
                  {searchQuery}
                </span>
                &rdquo;
              </>
            )}
          </p>

          {/* Technique Grid */}
          {filteredTechniques.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
              {filteredTechniques.map((technique) => (
                <TechniqueCard
                  key={technique.id}
                  technique={technique}
                  isExpanded={expandedTechnique === technique.id}
                  onToggle={() =>
                    setExpandedTechnique(
                      expandedTechnique === technique.id
                        ? null
                        : technique.id
                    )
                  }
                />
              ))}
            </div>
          ) : (
            <div className="text-center py-16">
              <Layers className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-bold mb-2">No techniques found</h3>
              <p className="text-muted-foreground text-sm mb-4">
                Try a different search term or category.
              </p>
              <button
                onClick={() => {
                  setSearchQuery("");
                  setSelectedCategory(null);
                }}
                className="text-international-orange hover:text-international-orange-hover text-sm font-mono uppercase tracking-wider transition-colors"
              >
                Clear Filters
              </button>
            </div>
          )}
        </div>
      </section>

      {/* CTA Banner */}
      <section className="py-16 md:py-20 bg-foreground text-background">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 text-center">
          <AnimatedSection>
            <Zap className="h-8 w-8 text-international-orange mx-auto mb-4" />
            <h2 className="text-2xl sm:text-3xl md:text-4xl font-black mb-4">
              Ready to Manufacture?
            </h2>
            <p className="text-background/70 text-base max-w-xl mx-auto leading-relaxed mb-8">
              Access all {ALL_TECHNIQUES.length}+ techniques through our vetted
              supplier network. Get matched with the right process for your
              project.
            </p>
            <motion.div
              whileHover={buttonHover}
              whileTap={buttonTap}
              className="inline-block"
            >
              <Link
                href="/join"
                className="inline-flex items-center gap-2 bg-international-orange hover:bg-international-orange-hover text-white px-8 py-4 text-sm font-mono font-bold tracking-widest uppercase transition-colors rounded-md min-h-[44px]"
              >
                Apply for Early Access
                <ArrowRight className="h-4 w-4" />
              </Link>
            </motion.div>
          </AnimatedSection>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 border-t border-muted bg-muted">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <Link
            href="/"
            className="text-sm font-bold tracking-tight text-foreground hover:text-international-orange transition-colors"
          >
            FRACTIONAL FORGE
          </Link>
          <p className="text-xs text-muted-foreground font-mono tracking-wider">
            &copy; {new Date().getFullYear()} Fractional Forge Ltd.
          </p>
        </div>
      </footer>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
 * Technique Card
 * ════════════════════════════════════════════════════════════════════════ */

interface TechniqueCardProps {
  technique: ManufacturingTechnique;
  isExpanded: boolean;
  onToggle: () => void;
}

function TechniqueCard({ technique, isExpanded, onToggle }: TechniqueCardProps) {
  return (
    <motion.div
      layout
      className="border bg-card rounded-xl overflow-hidden hover:shadow-md transition-shadow"
    >
      <button
        onClick={onToggle}
        className="w-full p-5 text-left flex flex-col gap-3"
        aria-expanded={isExpanded}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[10px] font-mono font-bold bg-muted px-2 py-0.5 rounded uppercase tracking-wider text-muted-foreground">
                {CATEGORY_ICONS[technique.category]}
              </span>
              <span
                className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded uppercase tracking-wider ${
                  COST_COLORS[technique.costTier]
                }`}
              >
                {COST_TIER_LABELS[technique.costTier]} Cost
              </span>
            </div>
            <h3 className="text-sm font-bold text-foreground leading-tight">
              {technique.name}
            </h3>
          </div>
          <div className="flex-shrink-0 mt-1">
            {isExpanded ? (
              <ChevronUp className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            )}
          </div>
        </div>

        {/* Description */}
        <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">
          {technique.description}
        </p>

        {/* Materials preview */}
        <div className="flex flex-wrap gap-1">
          {technique.materials.slice(0, 3).map((mat) => (
            <span
              key={mat}
              className="text-[10px] px-2 py-0.5 rounded-full border text-muted-foreground"
            >
              {mat}
            </span>
          ))}
          {technique.materials.length > 3 && (
            <span className="text-[10px] px-2 py-0.5 text-muted-foreground">
              +{technique.materials.length - 3} more
            </span>
          )}
        </div>
      </button>

      {/* Expanded detail */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="overflow-hidden"
          >
            <div className="px-5 pb-5 border-t border-muted pt-4 space-y-4">
              {/* How it works */}
              <div>
                <h4 className="text-xs font-mono uppercase tracking-widest text-muted-foreground mb-1">
                  How It Works
                </h4>
                <p className="text-xs text-foreground leading-relaxed">
                  {technique.howItWorks}
                </p>
              </div>

              {/* Details grid */}
              <div className="grid grid-cols-2 gap-3">
                {technique.toleranceRange && (
                  <div>
                    <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-0.5">
                      Tolerance
                    </p>
                    <p className="text-xs font-medium">
                      {technique.toleranceRange}
                    </p>
                  </div>
                )}
                {technique.leadTime && (
                  <div>
                    <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-0.5">
                      Lead Time
                    </p>
                    <p className="text-xs font-medium">{technique.leadTime}</p>
                  </div>
                )}
                <div>
                  <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-0.5">
                    Batch Size
                  </p>
                  <p className="text-xs font-medium">
                    {BATCH_SIZE_LABELS[technique.batchSize.min]}
                    {technique.batchSize.min !== technique.batchSize.max &&
                      ` → ${BATCH_SIZE_LABELS[technique.batchSize.max]}`}
                  </p>
                </div>
                {technique.surfaceFinish && (
                  <div>
                    <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-0.5">
                      Surface Finish
                    </p>
                    <p className="text-xs font-medium">
                      {technique.surfaceFinish}
                    </p>
                  </div>
                )}
              </div>

              {/* Pros / Cons */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-[10px] font-mono uppercase tracking-widest text-status-success mb-1">
                    Advantages
                  </p>
                  <ul className="space-y-1">
                    {technique.pros.slice(0, 3).map((pro) => (
                      <li
                        key={pro}
                        className="text-[11px] text-muted-foreground flex items-start gap-1.5"
                      >
                        <CheckCircle2 className="h-3 w-3 text-status-success flex-shrink-0 mt-0.5" />
                        {pro}
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <p className="text-[10px] font-mono uppercase tracking-widest text-destructive mb-1">
                    Limitations
                  </p>
                  <ul className="space-y-1">
                    {technique.cons.slice(0, 3).map((con) => (
                      <li
                        key={con}
                        className="text-[11px] text-muted-foreground flex items-start gap-1.5"
                      >
                        <X className="h-3 w-3 text-destructive flex-shrink-0 mt-0.5" />
                        {con}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              {/* Applications */}
              <div>
                <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-1">
                  Applications
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {technique.applications.map((app) => (
                    <span
                      key={app}
                      className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground"
                    >
                      {app}
                    </span>
                  ))}
                </div>
              </div>

              {/* All materials */}
              <div>
                <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-1">
                  Supported Materials
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {technique.materials.map((mat) => (
                    <span
                      key={mat}
                      className="text-[10px] px-2 py-0.5 rounded-full border text-foreground font-medium"
                    >
                      {mat}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
