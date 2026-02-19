import React from "react"
import { fireEvent, render, screen } from "@testing-library/react"

import { MobileNav } from "@/components/MobileNav"

const pushMock = jest.fn()

jest.mock("next/navigation", () => ({
  usePathname: jest.fn(() => "/today"),
  useRouter: jest.fn(() => ({
    push: pushMock,
  })),
}))

jest.mock("@/actions/auth", () => ({
  signOut: jest.fn(),
}))

jest.mock("@/components/smart/quick-capture-dialog", () => ({
  QuickCaptureDialog: () => null,
}))

jest.mock("@/components/ui/dropdown-menu", () => {
  type MockDropdownProps = {
    children?: React.ReactNode
    asChild?: boolean
    className?: string
  }

  type MockDropdownItemProps = MockDropdownProps & {
    onSelect?: (event: { preventDefault: () => void }) => void
  }

  return {
    DropdownMenu: ({ children }: MockDropdownProps) => <div>{children}</div>,
    DropdownMenuTrigger: ({ children, asChild }: MockDropdownProps) =>
      asChild ? children : <button type="button">{children}</button>,
    DropdownMenuContent: ({ children }: MockDropdownProps) => <div>{children}</div>,
    DropdownMenuLabel: ({ children }: MockDropdownProps) => <div>{children}</div>,
    DropdownMenuSeparator: () => <hr />,
    DropdownMenuItem: ({ children, onSelect, asChild, className }: MockDropdownItemProps) =>
      asChild ? (
        <div>{children}</div>
      ) : (
        <button
          className={className}
          role="menuitem"
          type="button"
          onClick={() => onSelect?.({ preventDefault: () => undefined })}
        >
          {children}
        </button>
      ),
  }
})

describe("MobileNav dropdown routing", () => {
  beforeEach(() => {
    pushMock.mockClear()
  })

  it("routes The Forge from More menu via router push", async () => {
    render(<MobileNav />)

    fireEvent.click(await screen.findByRole("menuitem", { name: /^The Forge$/i }))

    expect(pushMock).toHaveBeenCalledWith("/the-forge/studio")
  })

  it("routes Settings from More menu via router push", async () => {
    render(<MobileNav />)

    fireEvent.click(await screen.findByRole("menuitem", { name: /^Settings$/i }))

    expect(pushMock).toHaveBeenCalledWith("/settings")
  })
})
