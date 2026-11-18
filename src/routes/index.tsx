import { useEffect, useState } from "react";
import { createFileRoute, useNavigate, useRouter } from "@tanstack/react-router";
import { ArrowRight, Apple, Leaf } from "lucide-react";
import { LovableMark } from "@lovable.dev/cloud-auth-js/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";

export const Route = createFileRoute("/")({
  validateSearch: (search: Record<string, unknown>): { next: string } => ({ next: typeof search["next"] === "string" && search["next"].startsWith("/") && !search["next"].startsWith("//") ? search["next"] : "/dashboard" }),
  head: () => ({ meta: [
    { title: "Nourish — your personal food diary" },
    { name: "description", content: "Log meals in your own words and follow personalized nutrition targets." },
    { property: "og:title", content: "Nourish — your personal food diary" },
    { property: "og:description", content: "A thoughtful daily nutrition tracker with personalized targets and meal insights." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: AuthPage,
});

function GoogleMark() {
  return <svg aria-hidden="true" viewBox="0 0 24 24" className="size-[18px] shrink-0"><path fill="#4285F4" d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.47c-.29 1.48-1.14 2.73-2.4 3.58v3h3.86c2.26-2.09 3.56-5.17 3.56-8.82z"/><path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96H1.29v3.09C3.26 21.3 7.31 24 12 24z"/><path fill="#FBBC05" d="M5.27 14.29c-.25-.72-.38-1.49-.38-2.29s.14-1.57.38-2.29V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.98-3.09z"/><path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.98 3.09c.95-2.85 3.6-4.96 6.73-4.96z"/></svg>;
}

function AuthPage() {
  const { next } = Route.useSearch();
  const navigate = useNavigate();
  const router = useRouter();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;
    void supabase.auth.getUser().then(({ data }) => {
      if (active && data.user) void navigate({ to: "/dashboard", replace: true });
    });
    return () => { active = false; };
  }, [navigate]);

  const finish = async () => {
    await router.invalidate();
    await navigate({ to: !next || next === "/" ? "/dashboard" : next, replace: true });
  };

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault(); setBusy(true); setMessage("");
    try {
      const result = mode === "signin"
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({ email, password, options: { emailRedirectTo: window.location.origin } });
      if (result.error) throw result.error;
      if (mode === "signup" && !result.data.session) {
        setMessage("Check your email to confirm your account, then come back to sign in.");
      } else await finish();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Please try again.");
    } finally { setBusy(false); }
  };

  const social = async (provider: "google" | "lovable") => {
    setBusy(true); setMessage("");
    try {
      const result = await lovable.auth.signInWithOAuth(provider, { redirect_uri: window.location.origin });
      if (result.error) throw result.error;
      if (result.redirected) return;
      await finish();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Sign-in did not finish. Please try again.");
      setBusy(false);
    }
  };

  return (
    <main className="auth-page">
      <div className="auth-art" aria-hidden="true">
        <div className="auth-brand"><span className="brand-mark"><Leaf /></span><span>nourish</span></div>
        <div className="art-copy"><p className="eyebrow">A LITTLE MORE IN TUNE</p><h1>Good food.<br/>A clearer picture.</h1><p>Notice what nourishes you, one meal at a time.</p></div>
        <div className="still-life" aria-hidden="true"><div className="plate"><div className="plate-food food-a"/><div className="plate-food food-b"/><div className="plate-food food-c"/><div className="plate-food food-d"/><div className="plate-leaf"/></div><div className="art-note">TODAY, MADE OF<br/><b>small choices</b></div><div className="art-orange"/><div className="art-leaf leaf-one"/><div className="art-leaf leaf-two"/></div>
        <p className="art-footnote">A mindful approach to everyday nutrition.</p>
      </div>
      <section className="auth-side">
        <div className="mobile-brand"><span className="brand-mark"><Leaf /></span><span>nourish</span></div>
        <div className="auth-form-wrap">
          <div className="auth-form-head"><div className="small-icon"><Apple /></div><p className="eyebrow">YOUR DAILY NOURISHMENT</p><h2>{mode === "signin" ? "Welcome back" : "Make room for better"}</h2><p>Sign in to your personal food diary.</p></div>
          <div className="auth-toggle" role="tablist" aria-label="Account access">
            <button type="button" className={mode === "signin" ? "active" : ""} onClick={() => { setMode("signin"); setMessage(""); }}>Sign in</button>
            <button type="button" className={mode === "signup" ? "active" : ""} onClick={() => { setMode("signup"); setMessage(""); }}>Create account</button>
          </div>
          <form className="auth-fields" onSubmit={submit}>
            <label htmlFor="email">Email address</label><Input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
            <label htmlFor="password">Password</label><Input id="password" type="password" autoComplete={mode === "signin" ? "current-password" : "new-password"} required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 6 characters" />
            {message && <p role="status" className="auth-message">{message}</p>}
            <Button type="submit" className="w-full" disabled={busy}>{busy ? "One moment…" : mode === "signin" ? "Sign in" : "Create account"}<ArrowRight /></Button>
          </form>
          <div className="auth-divider"><span/>or continue with<span/></div>
          <div className="social-stack">
            <Button type="button" variant="outline" className="google-button w-full" disabled={busy} onClick={() => void social("google")}><GoogleMark />Continue with Google</Button>
            <Button type="button" variant="outline" className="w-full" disabled={busy} onClick={() => void social("lovable")}><LovableMark />Continue with Lovable</Button>
          </div>
          <p className="auth-privacy">Your food diary stays personal and private.</p>
        </div>
      </section>
    </main>
  );
}
