"use client";

import { useState } from "react";
import { authClient } from "@/lib/auth-client";

type Step = "email" | "code";

export function SignInForm({ next }: { next: string }) {
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function sendCode(e?: React.FormEvent) {
    e?.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await authClient.emailOtp.sendVerificationOtp({
      email,
      type: "sign-in",
    });
    setBusy(false);
    if (error) {
      setError(error.message ?? "Something went wrong — try again.");
      return;
    }
    setCode("");
    setStep("code");
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await authClient.signIn.emailOtp({ email, otp: code });
    if (error) {
      setBusy(false);
      setError(
        error.code === "TOO_MANY_ATTEMPTS"
          ? "Too many tries — request a new code."
          : (error.message ?? "That code didn't work — check it and try again.")
      );
      return;
    }
    // Full navigation, not a client transition: the server components behind
    // `next` have to re-render with the new session cookie.
    window.location.assign(next);
  }

  if (step === "code") {
    return (
      <form onSubmit={verify} className="flex flex-col gap-3">
        <div className="rounded-2xl border border-emerald-500/40 bg-emerald-500/10 p-4 text-center">
          <div className="mb-1 text-2xl">📬</div>
          <p className="text-sm text-emerald-100/80">
            We emailed a 6-digit code to <strong>{email}</strong>. Enter it
            here — it works on whichever device you&apos;re holding.
          </p>
        </div>
        {/* The email field is hidden but real so password managers can
            save the identifier against this domain (type="hidden" is
            ignored by them). */}
        <input
          type="email"
          name="username"
          autoComplete="username"
          value={email}
          readOnly
          tabIndex={-1}
          aria-hidden
          className="absolute size-px opacity-0"
        />
        <label htmlFor="sign-in-code" className="sr-only">
          Sign-in code
        </label>
        <input
          id="sign-in-code"
          name="otp"
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]{6}"
          maxLength={6}
          required
          autoFocus
          placeholder="123456"
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
          className="rounded-md border border-zinc-700 bg-zinc-950 px-3 py-3 text-center font-mono text-2xl tracking-[0.4em] focus:border-amber-500 focus:outline-none"
        />
        <button
          type="submit"
          disabled={busy || code.length !== 6}
          className="rounded-md btn-gold px-4 py-2.5 text-base disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/70"
        >
          {busy ? "Signing in…" : "Sign in"}
        </button>
        {error && <p className="text-sm text-red-400">{error}</p>}
        <div className="flex justify-between text-sm text-zinc-500">
          <button
            type="button"
            onClick={() => sendCode()}
            disabled={busy}
            className="underline-offset-2 hover:text-zinc-300 hover:underline"
          >
            Resend code
          </button>
          <button
            type="button"
            onClick={() => {
              setStep("email");
              setError(null);
            }}
            className="underline-offset-2 hover:text-zinc-300 hover:underline"
          >
            Use a different email
          </button>
        </div>
      </form>
    );
  }

  return (
    <form onSubmit={sendCode} className="flex flex-col gap-3">
      <label htmlFor="sign-in-email" className="sr-only">
        Email address
      </label>
      <input
        id="sign-in-email"
        name="username"
        type="email"
        required
        autoComplete="username"
        placeholder="you@example.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-base focus:border-amber-500 focus:outline-none"
      />
      <button
        type="submit"
        disabled={busy}
        className="rounded-md btn-gold px-4 py-2.5 text-base disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/70"
      >
        {busy ? "Sending…" : "Email me a sign-in code"}
      </button>
      {error && <p className="text-sm text-red-400">{error}</p>}
      <p className="text-center text-xs text-zinc-500">
        No password — a 6-digit code signs you in. Players never need this;
        accounts are for league organizers.
      </p>
    </form>
  );
}
