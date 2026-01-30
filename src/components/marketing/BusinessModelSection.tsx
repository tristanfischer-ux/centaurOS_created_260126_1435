"use client";

import Link from "next/link";
import Image from "next/image";

const roles = [
    {
        title: "FOUNDERS DECIDE.",
        description: "Retain equity. Maintain control. You bring the vision and the capital; we provide the industrial capacity. No more dilution for manufacturing scale.",
        image: "/images/centaur-founder.png",
        href: "/login?role=founder"
    },
    {
        title: "EXECUTIVES EVALUATE.",
        description: "Deploy capital with precision. Monitor real-time production telemetry. Our dashboard gives you god-mode over the factory floor without leaving the boardroom.",
        image: "/images/centaur-executive.png",
        href: "/login?role=executive"
    },
    {
        title: "APPRENTICES DO.",
        description: "The Digital Body. Skilled operators amplified by AI and robotics. Join the Guild and build the future with your own hands, supercharged by the System.",
        image: "/images/centaur-apprentice.png",
        href: "/login?role=apprentice"
    }
];

export function BusinessModelSection() {
    return (
        <section className="py-32 bg-muted">
            <div className="max-w-7xl mx-auto px-6">
                {/* Section Header */}
                <div className="mb-20 max-w-2xl">
                    <span className="text-xs font-bold tracking-[0.3em] text-international-orange uppercase block mb-6">
                        The Hierarchy
                    </span>
                    <h2 className="text-4xl md:text-5xl font-display font-medium text-foreground leading-tight mb-6">
                        Roles in the machine.
                    </h2>
                    <p className="text-lg text-muted-foreground leading-relaxed font-light">
                        The Centaur OS is designed for three distinct operators. Each plays a critical role in the atom-building process.
                    </p>
                </div>

                {/* Roles Grid */}
                <div className="grid md:grid-cols-3 gap-8">
                    {roles.map((role, index) => (
                        <Link
                            key={role.title}
                            href={role.href}
                            className="group relative block h-[500px] w-full overflow-hidden bg-slate-900"
                        >
                            {/* Background Image */}
                            <Image
                                src={role.image}
                                alt={role.title}
                                fill
                                className="object-cover transition-transform duration-700 group-hover:scale-105 opacity-80 group-hover:opacity-100"
                            />

                            {/* Overlay */}
                            <div className="absolute inset-0 bg-gradient-to-t from-slate-900 via-slate-900/40 to-transparent opacity-90 transition-opacity duration-300 group-hover:opacity-80" />

                            {/* Content */}
                            <div className="absolute inset-0 p-8 flex flex-col justify-end">
                                <span className="inline-block w-12 h-1 bg-international-orange mb-6 transform -translate-x-full group-hover:translate-x-0 transition-transform duration-500" />

                                <h3 className="text-2xl font-bold text-white mb-4 tracking-tight font-display">
                                    {role.title}
                                </h3>

                                <p className="text-slate-300 leading-relaxed text-sm mb-8 transform translate-y-4 opacity-0 group-hover:translate-y-0 group-hover:opacity-100 transition-all duration-500 delay-100">
                                    {role.description}
                                </p>

                                <span className="text-xs font-mono tracking-[0.2em] text-white/50 uppercase group-hover:text-international-orange transition-colors">
                                    [ Access Portal ]
                                </span>
                            </div>
                        </Link>
                    ))}
                </div>
            </div>
        </section>
    );
}
