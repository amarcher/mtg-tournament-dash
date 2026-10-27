export const dynamic = "force-dynamic";

/**
 * Which deployment is serving right now. Custom client fetches aren't pinned
 * by Vercel's skew protection, so a page built by an older deployment can ask
 * this and find out it has been superseded (see ResumeRefresh).
 */
export function GET() {
  return Response.json(
    { id: process.env.VERCEL_DEPLOYMENT_ID ?? null },
    { headers: { "cache-control": "no-store" } }
  );
}
