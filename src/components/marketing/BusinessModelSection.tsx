"use client";

import { Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";

export function BusinessModelSection() {
    return (
        <section className="py-24 bg-white relative overflow-hidden" id="methodology">
            <div className="container mx-auto px-6">
                <div className="max-w-4xl mx-auto mb-16 text-center space-y-4">
                    <h2 className="text-gold font-mono text-international-orange uppercase tracking-widest text-sm">The new Operating Model</h2>
                    <h3 className="text-4xl md:text-5xl font-display text-slate-900">OPEX, NOT CAPEX.</h3>
                    <p className="text-xl text-slate-600 font-light max-w-2xl mx-auto">
                        Stop hiring full-time headcount for temporary build phases.
                        Centaur Dynamics employs the talent; you rent the capability.
                    </p>
                </div>

                <div className="grid md:grid-cols-2 gap-8 max-w-5xl mx-auto">
                    {/* TRADITIONAL */}
                    <div className="bg-slate-50 border border-slate-100 p-8 md:p-12 relative opacity-70 grayscale transition-all duration-500 hover:opacity-100 hover:grayscale-0">
                        <div className="absolute top-0 right-0 p-4 font-mono text-xs text-slate-400">LEGACY MODEL</div>
                        <h4 className="text-2xl font-display text-slate-700 mb-8">Traditional Hiring</h4>

                        <ul className="space-y-6 font-mono text-sm text-slate-600">
                            <li className="flex items-center space-x-3">
                                <X className="w-5 h-5 text-red-500" />
                                <span>Recruitment Fees (20-30%)</span>
                            </li>
                            <li className="flex items-center space-x-3">
                                <X className="w-5 h-5 text-red-500" />
                                <span>Payroll Tax & Benefits</span>
                            </li>
                            <li className="flex items-center space-x-3">
                                <X className="w-5 h-5 text-red-500" />
                                <span>Equipment & Overhead</span>
                            </li>
                            <li className="flex items-center space-x-3">
                                <X className="w-5 h-5 text-red-500" />
                                <span>Significant Severance Risk</span>
                            </li>
                            <li className="flex items-center space-x-3">
                                <X className="w-5 h-5 text-red-500" />
                                <span>3-6 Month Ramp Up</span>
                            </li>
                        </ul>
                    </div>

                    {/* CENTAUR */}
                    <div className="bg-white border-2 border-slate-900 p-8 md:p-12 relative shadow-2xl shadow-slate-200">
                        <div className="absolute top-4 right-4 bg-international-orange text-white text-xs font-mono px-2 py-1 uppercase">Recommended</div>
                        <h4 className="text-2xl font-display text-slate-900 mb-8">Centaur Unit</h4>

                        <ul className="space-y-6 font-mono text-sm text-slate-900">
                            <li className="flex items-center space-x-3">
                                <Check className="w-5 h-5 text-international-orange" />
                                <span>Single Flat Monthly Fee</span>
                            </li>
                            <li className="flex items-center space-x-3">
                                <Check className="w-5 h-5 text-international-orange" />
                                <span>Zero Payroll / Benefit Admin</span>
                            </li>
                            <li className="flex items-center space-x-3">
                                <Check className="w-5 h-5 text-international-orange" />
                                <span>Fully Equipped (HW/SW)</span>
                            </li>
                            <li className="flex items-center space-x-3">
                                <Check className="w-5 h-5 text-international-orange" />
                                <span>Pause or Scale Anytime</span>
                            </li>
                            <li className="flex items-center space-x-3">
                                <Check className="w-5 h-5 text-international-orange" />
                                <span>Instant Deployment (48 Hours)</span>
                            </li>
                        </ul>

                        <div className="mt-10 pt-8 border-t border-slate-100 flex items-center justify-between">
                            <div>
                                <div className="text-xs text-slate-500 font-mono uppercase mb-1">Starting At</div>
                                <div className="text-3xl font-display">$8,500<span className="text-base text-slate-400 font-sans">/mo</span></div>
                            </div>
                            <Button className="rounded-none bg-slate-900 text-white hover:bg-slate-800">
                                View Pricing
                            </Button>
                        </div>
                    </div>
                </div>
            </div>
        </section>
    );
}
