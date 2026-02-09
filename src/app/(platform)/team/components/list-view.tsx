'use client'

/**
 * ListView — enhanced list view with stats, coverage alerts, role sections,
 * and a marketplace section separated by a dashed indigo border.
 *
 * @deprecated This ListView is no longer in use. The card/list view is
 * rendered directly in TeamPageView using MemberSection components.
 * The orbit view is rendered via OrbitalView.
 *
 * Kept as a reference for the original layout design. To restore,
 * wire it to accept data props (see OrbitalView for the pattern).
 */

export function ListView() {
  return (
    <div className="flex-1 overflow-y-auto px-8 pb-10">
      <p className="text-muted-foreground">
        This view has been superseded by TeamPageView. See OrbitalView for the
        orbit-based team view.
      </p>
    </div>
  )
}
