"use client"

import { Toaster as Sonner } from "sonner"

type ToasterProps = React.ComponentProps<typeof Sonner>

// ForgeOS enforces light mode - no theme switching
const Toaster = ({ ...props }: ToasterProps) => {
    return (
        <Sonner
            theme="light"
            position="top-center"
            className="toaster group"
            toastOptions={{
                classNames: {
                    toast:
                        "group toast group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border group-[.toaster]:shadow-lg",
                    description: "group-[.toast]:text-muted-foreground",
                    actionButton:
                        "group-[.toast]:bg-foreground group-[.toast]:text-background",
                    cancelButton:
                        "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
                },
            }}
            {...props}
        />
    )
}

export { Toaster }
