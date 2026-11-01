export function cacheHeaders(fresh = false) {
  if (fresh) {
    return {
      "Cache-Control": "no-store",
      "Vercel-CDN-Cache-Control": "no-store",
    };
  }
  return {
    "Cache-Control": "public, max-age=0, s-maxage=300, stale-while-revalidate=3600",
    "Vercel-CDN-Cache-Control": "s-maxage=300, stale-while-revalidate=3600",
  };
}
