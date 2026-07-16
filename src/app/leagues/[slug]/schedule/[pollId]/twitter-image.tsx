// Re-export the OG image as the Twitter image so iMessage / X / threads all
// unfurl the same artwork — same pattern as events/[id]/twitter-image.tsx.
//
// `revalidate` has to be a literal here (Next won't statically parse a
// re-export), so it's duplicated. Keep these two values in sync.
export const revalidate = 600;
export { default, alt, size, contentType } from "./opengraph-image";
