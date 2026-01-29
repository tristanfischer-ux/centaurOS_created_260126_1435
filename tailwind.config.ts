import type { Config } from "tailwindcss";

const config: Config = {
    darkMode: "class",
    content: [
        "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
        "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
        "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    ],
    theme: {
        // Custom breakpoints for foldable devices
        screens: {
            'xxs': '280px',  // Galaxy Fold outer screen (closed)
            'xs': '320px',   // Small phones, Galaxy Fold threshold
            'sm': '640px',   // Standard Tailwind
            'fold': '653px', // Galaxy Fold inner screen (open)
            'md': '768px',   // Standard Tailwind - tablet/desktop split
            'lg': '1024px',  // Standard Tailwind
            'xl': '1280px',  // Standard Tailwind
            '2xl': '1536px', // Standard Tailwind
        },
        extend: {
            colors: {
                background: 'var(--background)',
                foreground: 'var(--foreground)',
                // Centaur Dynamics Brand Colors
                'international-orange': {
                    DEFAULT: '#ff4500',
                    hover: '#e03e00',
                    light: '#ff6a33',
                },
                'electric-blue': {
                    DEFAULT: '#3b82f6',
                    hover: '#2563eb',
                    light: '#60a5fa',
                },
                // Foundry Slate Scale
                foundry: {
                    '50': '#f8fafc',
                    '100': '#f1f5f9',
                    '200': '#e2e8f0',
                    '300': '#cbd5e1',
                    '400': '#94a3b8',
                    '500': '#64748b',
                    '600': '#475569',
                    '700': '#334155',
                    '800': '#1e293b',
                    '900': '#0f172a',
                    '950': '#020617'
                },
                // Legacy accent mapping to brand
                accent: {
                    DEFAULT: '#ff4500',
                    hover: '#e03e00',
                    foreground: '#ffffff'
                },
                // Semantic status colors
                status: {
                    success: { 
                        DEFAULT: '#10b981', 
                        light: '#d1fae5', 
                        dark: '#064e3b',
                        foreground: '#ffffff'
                    },
                    warning: { 
                        DEFAULT: '#f59e0b', 
                        light: '#fef3c7', 
                        dark: '#78350f',
                        foreground: '#ffffff'
                    },
                    error: { 
                        DEFAULT: '#ef4444', 
                        light: '#fee2e2', 
                        dark: '#7f1d1d',
                        foreground: '#ffffff'
                    },
                    info: { 
                        DEFAULT: '#3b82f6', 
                        light: '#dbeafe', 
                        dark: '#1e3a8a',
                        foreground: '#ffffff'
                    }
                },
                card: {
                    DEFAULT: "hsl(var(--card))",
                    foreground: "hsl(var(--card-foreground))",
                },
                popover: {
                    DEFAULT: "hsl(var(--popover))",
                    foreground: "hsl(var(--popover-foreground))",
                },
                primary: {
                    DEFAULT: "hsl(var(--primary))",
                    foreground: "hsl(var(--primary-foreground))",
                },
                secondary: {
                    DEFAULT: "hsl(var(--secondary))",
                    foreground: "hsl(var(--secondary-foreground))",
                },
                muted: {
                    DEFAULT: "hsl(var(--muted))",
                    foreground: "hsl(var(--muted-foreground))",
                },
                destructive: {
                    DEFAULT: "hsl(var(--destructive))",
                    foreground: "hsl(var(--destructive-foreground))",
                },
                border: "hsl(var(--border))",
                input: "hsl(var(--input))",
                ring: "hsl(var(--ring))",
                chart: {
                    "1": "hsl(14, 100%, 50%)",  // International Orange
                    "2": "hsl(217, 91%, 60%)",   // Electric Blue
                    "3": "hsl(160, 84%, 39%)",   // Emerald
                    "4": "hsl(38, 92%, 50%)",    // Amber
                    "5": "hsl(258, 90%, 66%)",   // Purple
                    "6": "hsl(330, 81%, 60%)"    // Pink
                }
            },
            borderRadius: {
                lg: 'var(--radius)',
                md: 'calc(var(--radius) - 2px)',
                sm: 'calc(var(--radius) - 4px)',
                none: '0px'
            },
            fontFamily: {
                display: ['Centaur-Display', 'var(--font-playfair)', 'serif'],
                sans: ['var(--font-inter)', 'sans-serif'],
                mono: ['Centaur-Mono', 'var(--font-jetbrains)', 'monospace'],
                'centaur': ['Centaur-Display', 'serif'],
                'centaur-mono': ['Centaur-Mono', 'monospace'],
            },
            letterSpacing: {
                'ultra-wide': '0.2em',
            },
            boxShadow: {
                'elevation-1': '0 1px 3px rgba(0, 0, 0, 0.05)',
                'elevation-2': '0 4px 12px rgba(0, 0, 0, 0.08)',
                'elevation-3': '0 12px 24px rgba(0, 0, 0, 0.12)',
                'elevation-4': '0 20px 40px rgba(0, 0, 0, 0.15)',
                'brand': '0 10px 25px -5px rgba(255, 69, 0, 0.2)',
                'brand-lg': '0 20px 40px -10px rgba(255, 69, 0, 0.3)',
            }
        }
    },
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    plugins: [require("tailwindcss-animate")],
};
export default config;
