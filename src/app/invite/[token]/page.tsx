"use client";

import { use, useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Building2, Mail, UserPlus, AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import { getInvitationByToken, acceptInvitation, signupWithInvitation } from "@/actions/invitations";
import { createClient } from "@/lib/supabase/client";

interface InvitationDetails {
  id: string;
  foundryId: string;
  foundryName: string;
  email: string;
  role: string;
  invitedByName: string;
  expiresAt: string;
}

export default function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const resolvedParams = use(params);
  const token = resolvedParams.token;
  const router = useRouter();
  const searchParams = useSearchParams();
  const errorParam = searchParams.get("error");

  const [loading, setLoading] = useState(true);
  const [invitation, setInvitation] = useState<InvitationDetails | null>(null);
  const [error, setError] = useState<string | null>(errorParam);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [currentUserEmail, setCurrentUserEmail] = useState<string | null>(null);
  const [accepting, setAccepting] = useState(false);
  const [success, setSuccess] = useState(false);

  // Check auth status and fetch invitation
  useEffect(() => {
    async function init() {
      setLoading(true);
      
      // Check if user is logged in
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      setIsLoggedIn(!!user);
      setCurrentUserEmail(user?.email || null);

      // Fetch invitation details
      const result = await getInvitationByToken(token);
      
      if (!result.valid) {
        setError(result.error || "Invalid invitation");
        setInvitation(null);
      } else {
        setInvitation(result.invitation || null);
      }
      
      setLoading(false);
    }

    init();
  }, [token]);

  const handleAcceptInvitation = async () => {
    setAccepting(true);
    setError(null);

    const result = await acceptInvitation(token);
    
    if (result.success) {
      setSuccess(true);
      setTimeout(() => {
        router.push(result.redirectTo || "/dashboard");
      }, 2000);
    } else {
      setError(result.error || "Failed to accept invitation");
      setAccepting(false);
    }
  };

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-blue-500 mx-auto mb-4" />
          <p className="text-white/60">Loading invitation...</p>
        </div>
      </div>
    );
  }

  // Error state - invalid or expired invitation
  if (!invitation) {
    return (
      <div className="min-h-screen bg-slate-900 text-white flex flex-col items-center justify-center p-6">
        <div className="max-w-md text-center">
          <div className="w-16 h-16 rounded-full bg-red-500/20 flex items-center justify-center mx-auto mb-6">
            <AlertCircle className="w-8 h-8 text-red-400" />
          </div>
          <h1 className="text-2xl font-bold mb-4">Invalid Invitation</h1>
          <p className="text-white/60 mb-8">
            {error || "This invitation link is invalid, has expired, or has already been used."}
          </p>
          <Link href="/login">
            <Button variant="secondary" className="text-white border-white/20 hover:bg-white/10">
              Go to Login
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  // Success state
  if (success) {
    return (
      <div className="min-h-screen bg-slate-900 text-white flex flex-col items-center justify-center p-6">
        <div className="max-w-md text-center">
          <div className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center mx-auto mb-6">
            <CheckCircle2 className="w-8 h-8 text-green-400" />
          </div>
          <h1 className="text-2xl font-bold mb-4">Welcome to {invitation.foundryName}!</h1>
          <p className="text-white/60 mb-4">
            You've successfully joined as {invitation.role}.
          </p>
          <p className="text-white/40 text-sm">Redirecting to dashboard...</p>
        </div>
      </div>
    );
  }

  // Email mismatch - user is logged in but with different email
  const emailMismatch = isLoggedIn && currentUserEmail && 
    currentUserEmail.toLowerCase() !== invitation.email.toLowerCase();

  return (
    <div className="min-h-screen bg-slate-900 text-white">
      {/* Navigation */}
      <nav className="absolute top-0 left-0 right-0 z-50 px-4 sm:px-6 py-4 sm:py-6">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <Link href="/" className="text-white/80 hover:text-white text-sm font-mono uppercase tracking-widest flex items-center gap-2">
            <ArrowLeft className="w-4 h-4" />
            Back
          </Link>
        </div>
      </nav>

      <div className="min-h-screen flex flex-col md:flex-row">
        {/* Left: Invitation Info */}
        <div className="w-full md:w-1/2 relative overflow-hidden">
          <Image
            src="/images/centaur-os-core.png"
            alt="CentaurOS"
            fill
            className="object-cover opacity-20"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-slate-900 via-slate-900/90 to-slate-900/70" />
          <div className="relative z-10 p-6 sm:p-8 md:p-12 lg:p-16 flex flex-col justify-center min-h-[40vh] md:min-h-screen">
            <span className="text-xs font-mono text-blue-400 tracking-widest mb-3 sm:mb-4 block uppercase">
              Team Invitation
            </span>
            <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold mb-4 sm:mb-6 leading-tight">
              You've been invited to join
            </h1>
            
            {/* Company Card */}
            <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-lg p-6 max-w-md">
              <div className="flex items-center gap-4 mb-4">
                <div className="w-12 h-12 rounded-lg bg-blue-500/20 flex items-center justify-center">
                  <Building2 className="w-6 h-6 text-blue-400" />
                </div>
                <div>
                  <h2 className="text-xl font-bold">{invitation.foundryName}</h2>
                  <p className="text-white/60 text-sm">as {invitation.role}</p>
                </div>
              </div>
              
              <div className="space-y-2 text-sm">
                <div className="flex items-center gap-2 text-white/60">
                  <Mail className="w-4 h-4" />
                  <span>Invited: {invitation.email}</span>
                </div>
                <div className="flex items-center gap-2 text-white/60">
                  <UserPlus className="w-4 h-4" />
                  <span>By: {invitation.invitedByName}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right: Action Area */}
        <div className="w-full md:w-1/2 bg-background text-foreground p-6 sm:p-8 md:p-12 lg:p-16 flex flex-col justify-center">
          <div className="w-full max-w-md mx-auto space-y-6 sm:space-y-8">
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
                <p className="text-red-700 text-sm">{error}</p>
              </div>
            )}

            {isLoggedIn ? (
              // Logged in user flow
              <>
                {emailMismatch ? (
                  // Email mismatch warning
                  <div>
                    <h2 className="text-xl sm:text-2xl font-bold text-foreground mb-2">
                      Email Mismatch
                    </h2>
                    <p className="text-muted-foreground mb-6">
                      You're logged in as <strong>{currentUserEmail}</strong>, but this invitation 
                      was sent to <strong>{invitation.email}</strong>.
                    </p>
                    <div className="space-y-3">
                      <Link href={`/login?redirect=/invite/${token}`}>
                        <Button className="w-full bg-slate-900 hover:bg-blue-600 text-white">
                          Log in as {invitation.email}
                        </Button>
                      </Link>
                      <Button 
                        variant="secondary" 
                        className="w-full"
                        onClick={() => {
                          // Sign out and redirect back
                          const supabase = createClient();
                          supabase.auth.signOut().then(() => {
                            window.location.reload();
                          });
                        }}
                      >
                        Sign out and continue
                      </Button>
                    </div>
                  </div>
                ) : (
                  // Can accept invitation
                  <div>
                    <h2 className="text-xl sm:text-2xl font-bold text-foreground mb-2">
                      Accept Invitation
                    </h2>
                    <p className="text-muted-foreground mb-6">
                      Click below to join <strong>{invitation.foundryName}</strong> as {invitation.role}.
                    </p>
                    <Button 
                      onClick={handleAcceptInvitation}
                      disabled={accepting}
                      className="w-full bg-slate-900 hover:bg-blue-600 text-white font-bold tracking-widest uppercase py-5 sm:py-6 h-auto text-sm transition-colors"
                    >
                      {accepting ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin mr-2" />
                          Joining...
                        </>
                      ) : (
                        "Accept & Join Team"
                      )}
                    </Button>
                  </div>
                )}
              </>
            ) : (
              // Not logged in - show signup form
              <div>
                <h2 className="text-xl sm:text-2xl font-bold text-foreground mb-2">
                  Create your account
                </h2>
                <p className="text-muted-foreground mb-6">
                  Set up your account to join <strong>{invitation.foundryName}</strong>.
                </p>

                <form action={signupWithInvitation} className="space-y-4 sm:space-y-5">
                  <input type="hidden" name="token" value={token} />
                  
                  <div className="space-y-2">
                    <Label htmlFor="email" className="text-sm font-medium text-foreground">Email</Label>
                    <Input
                      id="email"
                      name="email"
                      type="email"
                      value={invitation.email}
                      readOnly
                      className="bg-muted border-slate-300 h-11 sm:h-12 text-muted-foreground"
                    />
                    <p className="text-xs text-muted-foreground">This email was specified in your invitation</p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="name" className="text-sm font-medium text-foreground">Full Name</Label>
                    <Input
                      id="name"
                      name="name"
                      placeholder="John Doe"
                      className="bg-background border-slate-300 focus:border-blue-500 focus:ring-blue-500 h-11 sm:h-12"
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="password" className="text-sm font-medium text-foreground">Password</Label>
                    <Input
                      id="password"
                      name="password"
                      type="password"
                      placeholder="Create a strong password"
                      className="bg-background border-slate-300 focus:border-blue-500 focus:ring-blue-500 h-11 sm:h-12"
                      required
                      minLength={8}
                    />
                  </div>

                  <Button 
                    type="submit"
                    className="w-full bg-slate-900 hover:bg-blue-600 text-white font-bold tracking-widest uppercase py-5 sm:py-6 h-auto text-sm transition-colors"
                  >
                    Create Account & Join
                  </Button>
                </form>

                <div className="mt-6 text-center">
                  <p className="text-sm text-muted-foreground">
                    Already have an account?{" "}
                    <Link href={`/login?redirect=/invite/${token}`} className="text-blue-600 hover:underline">
                      Log in
                    </Link>
                  </p>
                </div>
              </div>
            )}

            <p className="text-xs text-center text-muted-foreground">
              By joining, you agree to our{" "}
              <Link href="#" className="underline hover:text-foreground">Terms of Service</Link>{" "}
              and{" "}
              <Link href="#" className="underline hover:text-foreground">Privacy Policy</Link>.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
