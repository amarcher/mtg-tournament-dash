import { redirect } from "next/navigation";
import { AppChrome } from "@/app/components/AppChrome";
import { getSessionUser } from "@/lib/authz";
import { SignInForm } from "./SignInForm";

export const dynamic = "force-dynamic";

function safeNext(raw: string | undefined): string {
  // Same-origin paths only — anything else would make ?next= an open redirect.
  if (raw && raw.startsWith("/") && !raw.startsWith("//")) return raw;
  return "/";
}

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const next = safeNext((await searchParams).next);
  const user = await getSessionUser();
  if (user) redirect(next);

  return (
    <AppChrome>
      <main className="mx-auto w-full max-w-sm px-4 py-16">
        <h1 className="mb-2 text-center text-2xl font-semibold tracking-tight">
          Sign in
        </h1>
        <p className="mb-8 text-center text-sm text-zinc-500">
          For league organizers — create leagues, run events, and invite
          co-managers.
        </p>
        <SignInForm next={next} />
      </main>
    </AppChrome>
  );
}
