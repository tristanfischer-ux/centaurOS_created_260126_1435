"use client";
import { useEffect } from "react";
import { initDemo } from "@/lib/lumicity/demo";
import type { LumicityKey } from "@/lib/lumicity/html";

export function DemoMount({ page }: { page: LumicityKey }) {
  useEffect(() => {
    initDemo(page);
  }, [page]);
  return null;
}
