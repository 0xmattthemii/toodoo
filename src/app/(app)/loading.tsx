/**
 * Deliberately empty. Its presence is what matters: with a loading boundary
 * here, Next.js prefetches these routes and commits a navigation to them
 * instantly, before the (empty) page segment has streamed in. The board the
 * user sees is rendered by the layout from the URL, so there is nothing to
 * put in a fallback.
 */
export default function Loading() {
  return null;
}
