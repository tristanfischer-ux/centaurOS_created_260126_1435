import Link from "next/link";
import { Check, Mail, Clock, ArrowRight, Target, Users, Sparkles, Shield, Building, Bot } from "lucide-react";

interface SuccessConfig {
  title: string;
  subtitle: string;
  description: string;
  nextStep: string;
  ctaText: string;
  ctaLink: string;
  preparing?: { label: string; icon: typeof Check }[];
}

const signupSuccessConfig: Record<string, SuccessConfig> = {
  founder: {
    title: "Welcome, Founder.",
    subtitle: "Your command center is being prepared.",
    description:
      "Check your email to verify your account. Once verified, you'll have immediate access to the Centaur OS.",
    nextStep: "Verify your email → Access your dashboard → Start building",
    ctaText: "Go to Login",
    ctaLink: "/login",
    preparing: [
      { label: "Creating your foundry workspace", icon: Building },
      { label: "Setting up strategic objectives", icon: Target },
      { label: "Preparing team management tools", icon: Users },
      { label: "Connecting to the marketplace", icon: Sparkles },
    ],
  },
  executive: {
    title: "Welcome to the Cadre.",
    subtitle: "Your expertise has a new home.",
    description:
      "Check your email to verify your account. We'll start matching you with ventures that need your skills.",
    nextStep: "Verify your email → Complete your profile → Get matched",
    ctaText: "Go to Login",
    ctaLink: "/login",
    preparing: [
      { label: "Joining the Centaur Guild", icon: Users },
      { label: "Setting up your executive profile", icon: Shield },
      { label: "Preparing approval workflows", icon: Check },
      { label: "Connecting to venture pipeline", icon: Target },
    ],
  },
  apprentice: {
    title: "Welcome to the Guild.",
    subtitle: "Your Digital Body awaits.",
    description:
      "Check your email to verify your account. Your training begins immediately upon verification.",
    nextStep: "Verify your email → Enter the Guild → Begin training",
    ctaText: "Go to Login",
    ctaLink: "/login",
    preparing: [
      { label: "Joining the Centaur Guild", icon: Users },
      { label: "Preparing your Digital Body toolkit", icon: Bot },
      { label: "Assigning your first training tasks", icon: Target },
      { label: "Connecting AI amplification tools", icon: Sparkles },
    ],
  },
};

const applicationSuccessConfig: Record<string, SuccessConfig> = {
  vc: {
    title: "Application Received.",
    subtitle: "We review every application personally.",
    description:
      "Our team will evaluate your application and respond within 48 hours. We're selective about our VC partners to ensure quality deal flow for everyone.",
    nextStep: "Application review → Partner call → Network access",
    ctaText: "Back to Home",
    ctaLink: "/",
  },
  factory: {
    title: "Connection Request Received.",
    subtitle: "Welcome to the virtual factory network.",
    description:
      "We'll review your facility capabilities and reach out to discuss integration. Most facilities are onboarded within one week.",
    nextStep: "Capability review → Integration call → Start receiving jobs",
    ctaText: "Back to Home",
    ctaLink: "/",
  },
  university: {
    title: "Partnership Inquiry Received.",
    subtitle: "Bridging academia and industry.",
    description:
      "Our partnerships team will review your inquiry and reach out to discuss collaboration opportunities.",
    nextStep: "Inquiry review → Partnership call → Program design",
    ctaText: "Back to Home",
    ctaLink: "/",
  },
  network: {
    title: "Application Received.",
    subtitle: "Joining the Grid.",
    description:
      "We'll review your application and reach out to discuss how your resources can connect to the Centaur OS.",
    nextStep: "Application review → Integration planning → Go live",
    ctaText: "Back to Home",
    ctaLink: "/",
  },
};

export default async function SuccessPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; role?: string }>;
}) {
  const params = await searchParams;
  const type = params.type || "signup";
  const role = params.role || "general";

  const isApplication = type === "application";
  const configMap = isApplication
    ? applicationSuccessConfig
    : signupSuccessConfig;
  const config = configMap[role] || {
    title: "Success!",
    subtitle: "Your submission was received.",
    description: "We'll be in touch soon.",
    nextStep: "",
    ctaText: "Back to Home",
    ctaLink: "/",
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 via-slate-800 to-white text-white flex flex-col items-center justify-center px-4 sm:px-6">
      <div className="max-w-lg w-full text-center">
        {/* Success Icon */}
        <div className="mb-6 sm:mb-8 inline-flex items-center justify-center w-16 sm:w-20 h-16 sm:h-20 rounded-full bg-blue-500/20 border border-blue-500/30">
          {isApplication ? (
            <Clock className="w-8 sm:w-10 h-8 sm:h-10 text-blue-400" />
          ) : (
            <Mail className="w-8 sm:w-10 h-8 sm:h-10 text-blue-400" />
          )}
        </div>

        {/* Title */}
        <h1 className="text-3xl sm:text-4xl md:text-5xl font-black mb-3 sm:mb-4">{config.title}</h1>

        {/* Subtitle */}
        <p className="text-lg sm:text-xl text-white/70 mb-6 sm:mb-8">{config.subtitle}</p>

        {/* Description */}
        <p className="text-white/50 mb-8 sm:mb-10 leading-relaxed text-sm sm:text-base">{config.description}</p>

        {/* What's Being Prepared - Animated Progress */}
        {config.preparing && config.preparing.length > 0 && (
          <div className="mb-8 sm:mb-10 p-4 sm:p-6 bg-white/5 border border-white/10 text-left rounded-sm">
            <h3 className="text-xs font-mono uppercase tracking-widest text-white/40 mb-4">
              Preparing your workspace
            </h3>
            <div className="space-y-3">
              {config.preparing.map((item, index) => {
                const Icon = item.icon;
                return (
                  <div 
                    key={item.label}
                    className="flex items-center gap-3 text-white/70 text-sm animate-fade-in"
                    style={{ animationDelay: `${index * 200}ms` }}
                  >
                    <div className="w-6 h-6 rounded-full bg-blue-500/20 flex items-center justify-center">
                      <Icon className="w-3 h-3 text-blue-400" />
                    </div>
                    <span>{item.label}</span>
                    <div className="ml-auto">
                      <Check className="w-4 h-4 text-emerald-400 animate-scale-in" style={{ animationDelay: `${(index * 200) + 400}ms` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Next Steps */}
        {config.nextStep && (
          <div className="mb-8 sm:mb-10 p-4 sm:p-6 bg-white/5 border border-white/10 text-left rounded-sm">
            <h3 className="text-xs font-mono uppercase tracking-widest text-white/40 mb-3">
              What happens next
            </h3>
            <div className="flex items-center gap-2 text-white/80 text-sm sm:text-base">
              <Check className="w-4 h-4 text-blue-400 shrink-0" />
              <span>{config.nextStep}</span>
            </div>
          </div>
        )}

        {/* CTA */}
        <Link
          href={config.ctaLink}
          className="inline-flex items-center gap-2 bg-background text-foreground px-6 sm:px-8 py-3 sm:py-4 font-bold tracking-widest uppercase hover:bg-blue-500 hover:text-white transition-colors text-sm"
        >
          {config.ctaText}
          <ArrowRight className="w-4 h-4" />
        </Link>

        {/* Support Link */}
        <p className="mt-8 sm:mt-10 text-xs text-white/30">
          Questions?{" "}
          <a href="mailto:support@centauros.ai" className="underline hover:text-white/50">
            Contact support
          </a>
        </p>
      </div>
    </div>
  );
}
