import Link from "next/link"
import { Shield } from "lucide-react"

/**
 * IpProtectionNote — Lightweight trust signal for design-sensitive pages.
 *
 * @description Shown in CAD Lab pages at the moment of anxiety when users
 * upload or work on designs. Links to the IP guarantee in Terms of Service.
 */
export function IpProtectionNote() {
  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground">
      <Shield className="h-3.5 w-3.5 text-international-orange flex-shrink-0" />
      <span>
        Your designs are encrypted and protected.{" "}
        <Link
          href="/terms#ip"
          className="underline hover:text-foreground transition-colors"
        >
          IP Guarantee
        </Link>
      </span>
    </div>
  )
}
