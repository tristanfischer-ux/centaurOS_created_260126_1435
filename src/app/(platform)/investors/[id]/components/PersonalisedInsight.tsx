"use client";

import { useState, useTransition } from "react";
import { enrichInvestorMatchOnDemand } from "@/actions/investors";
import type { InvestorMatchOutputView } from "@/actions/investors";
import { Button } from "@/components/ui/button";
import { Sparkles } from "lucide-react";

export function PersonalisedInsight({
  investorListingId,
}: {
  investorListingId: string;
}) {
  const [output, setOutput] = useState<InvestorMatchOutputView | null>(null);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState(false);

  function handleReveal() {
    startTransition(async () => {
      setError(false);
      const result = await enrichInvestorMatchOnDemand(investorListingId);
      if (result) {
        setOutput(result);
      } else {
        setError(true);
      }
    });
  }

  if (output) {
    return (
      <div className="space-y-4">
        {output.whyFit && (
          <div>
            <p className="text-[11px] font-semibold text-success uppercase tracking-wider mb-1">
              Why they might back you
            </p>
            <p className="text-sm text-foreground leading-relaxed">
              {output.whyFit}
            </p>
          </div>
        )}
        {output.howToPitch && (
          <div>
            <p className="text-[11px] font-semibold text-international-orange uppercase tracking-wider mb-1">
              How to pitch
            </p>
            <p className="text-sm text-foreground leading-relaxed">
              {output.howToPitch}
            </p>
          </div>
        )}
        {output.sourceCitations && output.sourceCitations.length > 0 && (
          <div className="pt-2 border-t border-border">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
              Sources
            </p>
            <ul className="space-y-1">
              {output.sourceCitations.map((c, i) => (
                <li key={i} className="text-xs text-muted-foreground">
                  <span className="font-medium">{c.text}</span>
                  {c.source && (
                    <span className="ml-1 opacity-60">— {c.source}</span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
        {output.fromCache && (
          <p className="text-[10px] text-muted-foreground italic">
            Cached result
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-2 py-4">
      <Button
        variant="outline"
        size="sm"
        onClick={handleReveal}
        disabled={isPending}
        className="gap-2"
      >
        <Sparkles className="h-3.5 w-3.5" />
        {isPending ? "Generating insight…" : "Generate personalised insight"}
      </Button>
      {error && (
        <p className="text-xs text-muted-foreground">
          Could not generate insight — this may require a paid plan.
        </p>
      )}
    </div>
  );
}
