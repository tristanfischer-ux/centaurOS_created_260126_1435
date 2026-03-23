import React from "react"
import { render, screen } from "@testing-library/react"

import { MobileNav } from "@/components/MobileNav"

jest.mock("next/navigation", () => ({
  usePathname: jest.fn(() => "/today"),
}))

jest.mock("@/actions/auth", () => ({
  signOut: jest.fn(),
}))

jest.mock("@/components/smart/quick-capture-dialog", () => ({
  QuickCaptureDialog: () => null,
}))

jest.mock("@/lib/features/registry", () => ({
  isRouteAlpha: jest.fn(() => false),
  isRouteBeta: jest.fn(() => false),
  isRouteDemo: jest.fn(() => false),
}))

jest.mock("@/actions/match-alerts", () => ({
  getUnreadAlertCount: jest.fn(() => Promise.resolve(0)),
}))

jest.mock("@/components/ui/drawer", () => {
  type MockProps = {
    children?: React.ReactNode
    asChild?: boolean
    className?: string
  }

  return {
    Drawer: ({ children }: MockProps) => <div>{children}</div>,
    DrawerTrigger: ({ children, asChild }: MockProps) =>
      asChild ? children : <button type="button">{children}</button>,
    DrawerContent: ({ children }: MockProps) => <div>{children}</div>,
    DrawerHeader: ({ children }: MockProps) => <div>{children}</div>,
    DrawerTitle: ({ children, className }: MockProps) => <h2 className={className}>{children}</h2>,
    DrawerClose: ({ children, asChild }: MockProps) =>
      asChild ? children : <button type="button">{children}</button>,
  }
})

describe("MobileNav drawer navigation", () => {
  it("renders The Forge link in the drawer", () => {
    render(<MobileNav />)

    const forgeLink = screen.getByTestId("drawer-item-the-forge")
    expect(forgeLink).toBeInTheDocument()
    expect(forgeLink).toHaveAttribute("href", "/the-forge")
  })

  it("renders Settings link in the drawer", () => {
    render(<MobileNav />)

    const settingsLink = screen.getByTestId("drawer-item-settings")
    expect(settingsLink).toBeInTheDocument()
    expect(settingsLink).toHaveAttribute("href", "/settings")
  })

  it("renders Reports link in the Plan section", () => {
    render(<MobileNav />)

    const reportsLink = screen.getByTestId("drawer-item-reports")
    expect(reportsLink).toBeInTheDocument()
    expect(reportsLink).toHaveAttribute("href", "/reports")
  })

  it("renders Sign Out button", () => {
    render(<MobileNav />)

    expect(screen.getByTestId("drawer-item-sign-out")).toBeInTheDocument()
  })

  it("renders all five section headers", () => {
    render(<MobileNav />)

    expect(screen.getByTestId("section-me")).toBeInTheDocument()
    expect(screen.getByTestId("section-plan")).toBeInTheDocument()
    expect(screen.getByTestId("section-cash-burn")).toBeInTheDocument()
    expect(screen.getByTestId("section-workshop")).toBeInTheDocument()
    expect(screen.getByTestId("section-marketplace")).toBeInTheDocument()
  })
})
