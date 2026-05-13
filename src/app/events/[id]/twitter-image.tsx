// Re-export the OG image as the Twitter image so iMessage / X / threads
// all unfurl the same artwork. Keeps the dynamic per-event logic in one
// place — see opengraph-image.tsx.
//
// `revalidate` has to be a literal here (Next won't statically parse a
// re-export), so it's duplicated. Keep these two values in sync.
export const revalidate = 3600;
export { default, alt, size, contentType } from "./opengraph-image";
