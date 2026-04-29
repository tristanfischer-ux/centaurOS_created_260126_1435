"use client";

import { useState } from "react";

export function CollapsibleSection({
  number,
  title,
  subtitle,
  children,
  defaultOpen = false,
  previewLines = 3,
}: {
  number: number;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
  previewLines?: number;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="relative">
      {/* Section header — clickable to expand/collapse */}
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-baseline gap-2 w-full text-left cursor-pointer group"
      >
        <span
          className="text-[11px] font-bold text-muted-foreground min-w-[20px]"
        >
          &sect;{number}
        </span>
        <span className="text-base font-semibold text-foreground">
          {title}
        </span>
        {subtitle && (
          <span className="text-xs text-muted-foreground ml-1 hidden sm:inline">
            {subtitle}
          </span>
        )}
        <span
          className={`ml-auto text-[11px] text-muted-foreground transition-transform duration-200 ${
            open ? "rotate-180" : "rotate-0"
          }`}
        >
          &#x25BC;
        </span>
      </button>

      {/* Collapsible content with gradient fade when collapsed */}
      <div
        className="overflow-hidden relative mt-3"
        style={{
          maxHeight: open ? "none" : `${previewLines * 1.65 * 14}px`,
        }}
      >
        {children}

        {/* Gradient fade overlay + "Show more" button when collapsed */}
        {!open && (
          <div
            className="absolute bottom-0 left-0 right-0 h-10 flex items-end justify-center pb-1"
            style={{
              background: "linear-gradient(transparent, hsl(var(--background)))",
            }}
          >
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setOpen(true);
              }}
              className="border border-border rounded-md px-3 py-0.5 text-[11px] text-muted-foreground bg-background cursor-pointer hover:bg-muted transition-colors"
            >
              Show more &#x25BC;
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
