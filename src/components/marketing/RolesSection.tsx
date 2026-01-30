"use client";

import Image from "next/image";
import Link from "next/link";

const roles = [
    {
        title: "FOUNDERS DECIDE",
        subtitle: "RETAIN YOUR EQUITY.",
        description: "\"Don't burn seed capital on a standing army. Launch with a fractional team. Validate fast, risk less, and retain maximum equity at Series A.\"",
        image: "/images/guild_workshop.jpg",
        joinLink: "/join/founder"
    },
    {
        title: "EXECUTIVES EVALUATE",
        subtitle: "TRY BEFORE YOU FLY.",
        description: "\"Monetize elite expertise without the burnout. Join as a Fractional Executive to accelerate deep-tech startups. Then, invest in them or launch your own.\"",
        image: "/images/execs_hanger.jpg",
        joinLink: "/join/executive"
    },
    {
        title: "APPRENTICES DO",
        subtitle: "THE DIGITAL BODY.",
        description: "\"We equip you with the Centaur OS—a 'Digital Body' multiplying your output tenfold. You aren't a junior. You are a Founder-in-Training.\"",
        image: "/images/os_chip.jpg",
        joinLink: "/join/apprentice"
    }
];

export function RolesSection() {
    return (
        <section className="py-24 bg-background border-t border-slate-100" id="centaurs">
            <div className="max-w-7xl mx-auto px-6">
                <div className="mb-16">
                    <span className="text-xs font-bold tracking-[0.3em] text-international-orange uppercase block mb-6 font-centaur-mono">
                        The Centaurs
                    </span>
                    <h2 className="text-4xl md:text-5xl font-centaur font-medium text-foreground leading-tight mb-6">
                        Select Your Architecture.
                    </h2>
                </div>

                <div className="grid md:grid-cols-3 gap-8">
                    {roles.map((role) => (
                        <div key={role.title} className="group relative bg-background p-8 tech-border tech-border-b min-h-[500px] flex flex-col hover:shadow-lg transition-shadow duration-300">
                            {/* Image Container */}
                            <div className="h-48 mb-8 overflow-hidden bg-muted tech-border relative p-4">
                                <Image
                                    src={role.image}
                                    alt={role.title}
                                    fill
                                    className="object-cover opacity-90 transition-transform duration-700 group-hover:scale-105" // removed mix-blend-multiply for jpgs
                                />
                            </div>

                            {/* Content */}
                            <div className="flex-1">
                                <span className="text-xs font-centaur-mono font-bold text-international-orange tracking-widest mb-2 block">
                                    {role.title}
                                </span>
                                <h3 className="text-2xl font-centaur font-semibold text-foreground mb-4">
                                    {role.subtitle}
                                </h3>
                                <p className="text-muted-foreground leading-relaxed text-sm mb-8 font-sans">
                                    {role.description}
                                </p>
                            </div>

                            {/* Actions */}
                            <div className="pt-8 border-t border-slate-100 flex gap-3 mt-auto">
                                <Link
                                    href="/login"
                                    className="flex-1 bg-muted hover:bg-slate-200 text-foreground py-3 text-center text-xs font-mono font-bold tracking-widest uppercase transition-colors"
                                >
                                    Login
                                </Link>
                                <Link
                                    href={role.joinLink}
                                    className="flex-1 border border-slate-900 text-foreground py-3 text-center text-xs font-mono font-bold tracking-widest uppercase hover:bg-slate-900 hover:text-white transition-all"
                                >
                                    Join Up
                                </Link>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </section>
    );
}
