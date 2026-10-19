"use client";
import { useEffect } from "react";
import { initEnquiry } from "@/lib/lumicity/demo";

/** Mounts the service enquiry form handler. Interactive sample demos are retired. */
export function DemoMount() {
  useEffect(() => {
    initEnquiry();
  }, []);
  return null;
}
