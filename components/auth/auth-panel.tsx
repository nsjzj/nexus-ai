"use client";

import { FormEvent, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type UserSummary = { email?: string };

export default function AuthPanel({ isArabic }: { isArabic: boolean }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [user, setUser] = useState<UserSummary | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const t = (en: string, ar: string) => isArabic ? ar : en;

  useEffect(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) {
      setMessage(t("Add Supabase public URL and anon key to enable accounts.", "أضف رابط Supabase ومفتاح anon العام لتفعيل الحسابات."));
      return;
    }
    const supabase = createClient();
    void supabase.auth.getUser().then(({ data }) => setUser(data.user ? { email: data.user.email } : null));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ? { email: session.user.email } : null);
    });
    return () => listener.subscription.unsubscribe();
  }, [isArabic]);

  async function authenticate(mode: "sign-in" | "sign-up") {
    setBusy(true);
    setMessage("");
    try {
      const supabase = createClient();
      const result = mode === "sign-in"
        ? await supabase.auth.signInWithPassword({ email: email.trim(), password })
        : await supabase.auth.signUp({
            email: email.trim(),
            password,
            options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
          });
      if (result.error) throw result.error;
      setPassword("");
      if (mode === "sign-up" && !result.data.session) {
        setMessage(t("Check your email to confirm your account, then sign in.", "تحقق من بريدك لتأكيد الحساب، ثم سجّل الدخول."));
      } else {
        setMessage(t("You're signed in.", "تم تسجيل دخولك."));
        setUser(result.data.user ? { email: result.data.user.email } : null);
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t("Authentication failed.", "تعذّر تسجيل الدخول."));
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    setBusy(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      setUser(null);
      setMessage(t("Signed out.", "تم تسجيل الخروج."));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t("Could not sign out.", "تعذّر تسجيل الخروج."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="settings-card">
      <div className="eyebrow">{t("ACCOUNT", "الحساب")}</div>
      <h2>{t("Your NEXUS account", "حسابك في NEXUS")}</h2>
      <p>{t("Sign in to prepare your workspace for secure cloud sync.", "سجّل الدخول لتجهيز مساحة عملك للمزامنة السحابية الآمنة.")}</p>
      {user ? (
        <div className="account-row">
          <strong>{user.email || t("Signed-in account", "حساب مسجّل")}</strong>
          <button className="project-primary" disabled={busy} onClick={signOut}>{t("Sign out", "تسجيل الخروج")}</button>
        </div>
      ) : (
        <form className="project-form" onSubmit={(event: FormEvent) => { event.preventDefault(); void authenticate("sign-in"); }}>
          <label>{t("Email", "البريد الإلكتروني")}
            <input type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} />
          </label>
          <label>{t("Password", "كلمة المرور")}
            <input type="password" autoComplete="current-password" minLength={8} required value={password} onChange={(event) => setPassword(event.target.value)} />
          </label>
          <div className="project-form-actions">
            <button className="back-button" type="button" disabled={busy || !email.trim() || password.length < 8} onClick={() => void authenticate("sign-up")}>{t("Create account", "إنشاء حساب")}</button>
            <button className="project-primary" type="submit" disabled={busy}>{busy ? t("Please wait…", "انتظر…") : t("Sign in", "تسجيل الدخول")}</button>
          </div>
        </form>
      )}
      {message && <p className="settings-message" role="status">{message}</p>}
      <p className="settings-note">{t("Your password is handled by Supabase Auth. NEXUS does not store it. Cloud project/chat sync is not connected yet.", "تتم إدارة كلمة المرور عبر Supabase Auth ولا يخزنها NEXUS. مزامنة المشاريع والمحادثات لم تُربط بعد.")}</p>
    </section>
  );
}
