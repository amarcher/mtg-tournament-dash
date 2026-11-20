import { redirect } from "next/navigation";
import { AppChrome } from "@/app/components/AppChrome";
import { getSessionUser } from "@/lib/authz";
import { SignInForm } from "./SignInForm";

import { safeNextPath } from "@/lib/safe-next";
export const dynamic = "force-dynamic";

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const next = safeNextPath((await searchParams).next) ?? "/";
  const user = await getSessionUser();
  if (user) redirect(next);

  return (
    <AppChrome>
      <main className="mx-auto w-full max-w-sm px-4 py-16">
        <h1 className="mb-2 text-center text-2xl font-semibold tracking-tight">
          Sign in
        </h1>
        <p className="mb-8 text-center text-sm text-zinc-500">
          We email you a 6-digit code. Players sign in to own their wizard;
          organizers to run their league.
        </p>
        <SignInForm next={next} />
      </main>
    </AppChrome>
  );
}
