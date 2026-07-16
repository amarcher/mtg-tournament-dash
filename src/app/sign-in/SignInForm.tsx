"use client";

import { useState } from "react";
import { authClient } from "@/lib/auth-client";

export function SignInForm({ next }: { next: string }) {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">(
    "idle"
  );
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setState("sending");
    setError(null);
    const { error } = await authClient.signIn.magicLink({
      email,
      callbackURL: next,
    });
    if (error) {
      setError(error.message ?? "Something went wrong — try again.");
      setState("error");
    } else {
      setState("sent");
    }
  }

  if (state === "sent") {
    return (
      <div className="rounded-2xl border border-emerald-500/40 bg-emerald-500/10 p-6 text-center">
        <div className="mb-2 text-3xl">📬</div>
        <h2 className="text-lg font-semibold text-emerald-200">
          Check your email
        </h2>
        <p className="mt-1 text-sm text-emerald-100/70">
          We sent a sign-in link to <strong>{email}</strong>. It expires in a
          few minutes — click it on this device.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <label htmlFor="sign-in-email" className="sr-only">
        Email address
      </label>
      <input
        id="sign-in-email"
        type="email"
        required
        autoComplete="email"
        placeholder="you@example.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-sm focus:border-amber-500 focus:outline-none"
      />
      <button
        type="submit"
        disabled={state === "sending"}
        className="rounded-md bg-amber-500 px-4 py-2.5 text-sm font-semibold text-zinc-950 transition hover:bg-amber-400 disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/70"
      >
        {state === "sending" ? "Sending…" : "Email me a sign-in link"}
      </button>
      {error && <p className="text-sm text-red-400">{error}</p>}
      <p className="text-center text-xs text-zinc-500">
        No password — a magic link signs you in. Players never need this;
        accounts are for league organizers.
      </p>
    </form>
  );
}
