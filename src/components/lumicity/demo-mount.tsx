"use client";
import { useEffect } from "react";
import { initDemo, initEnquiry } from "@/lib/lumicity/demo";
import type { LumicityKey } from "@/lib/lumicity/html";

export function DemoMount({ page }: { page: LumicityKey }) {
  useEffect(() => {
    initDemo(page);
    initEnquiry();
  }, [page]);
  return null;
}
