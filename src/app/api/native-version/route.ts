import { NATIVE_BUILDS } from "@/lib/native-version";

export const dynamic = "force-dynamic";

/** The build number each store currently serves; see NativeUpdate. */
export function GET() {
  return Response.json(NATIVE_BUILDS, {
    headers: { "cache-control": "no-store" },
  });
}
