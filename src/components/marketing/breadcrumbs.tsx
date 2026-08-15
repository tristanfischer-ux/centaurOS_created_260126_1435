import Link from 'next/link'

/**
 * Breadcrumbs (P2-a) — visible trail + BreadcrumbList JSON-LD for deep
 * marketing pages (/insights/*, /guides/*, /cost/*, /quote).
 *
 * @description Server component. Pass the trail INCLUDING the current page
 * (last item renders unlinked). Home is prepended automatically.
 */

export interface Crumb {
  name: string
  /** Absolute path, e.g. "/guides/design-for-manufacture-explained". Omit on the last item if you like. */
  href?: string
}

const BASE = 'https://fractionalforge.app'

export function Breadcrumbs({ trail }: { trail: Crumb[] }) {
  const full: Crumb[] = [{ name: 'Home', href: '/' }, ...trail]

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: full.map((c, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: c.name,
      ...(c.href ? { item: `${BASE}${c.href === '/' ? '' : c.href}` || BASE } : {}),
    })),
  }

  return (
    <nav aria-label="Breadcrumb" className="text-sm text-muted-foreground">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <ol className="flex flex-wrap items-center gap-1.5">
        {full.map((c, i) => {
          const last = i === full.length - 1
          return (
            <li key={`${c.name}-${i}`} className="flex items-center gap-1.5">
              {i > 0 && <span aria-hidden>›</span>}
              {last || !c.href ? (
                <span className="text-foreground">{c.name}</span>
              ) : (
                <Link href={c.href} className="hover:text-foreground hover:underline">
                  {c.name}
                </Link>
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
