import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const results: unknown[] = [];
  const targets: Array<{ name: string; url: string; init?: RequestInit }> = [
    { name: "episodes-plain", url: "https://onepace.co/wp-json/dgt/v1/episodes?series=98" },
    {
      name: "episodes-browser",
      url: "https://onepace.co/wp-json/dgt/v1/episodes?series=98",
      init: {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
          Accept: "application/json, text/plain, */*",
          "Accept-Language": "en-US,en;q=0.9",
          Referer: "https://onepace.co/",
          Origin: "https://onepace.co",
          "Sec-Fetch-Dest": "empty",
          "Sec-Fetch-Mode": "cors",
          "Sec-Fetch-Site": "same-origin",
        },
      },
    },
    {
      name: "watch-post",
      url: "https://onepace.co/wp-json/dgt/v1/watch",
      init: {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ post_id: 98, episode_id: 3760 }),
      },
    },
    {
      name: "watch-post-browser",
      url: "https://onepace.co/wp-json/dgt/v1/watch",
      init: {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json, text/plain, */*",
          "Accept-Language": "en-US,en;q=0.9",
          Referer: "https://onepace.co/",
          Origin: "https://onepace.co",
          "X-Requested-With": "XMLHttpRequest",
        },
        body: JSON.stringify({ post_id: 98, episode_id: 3760 }),
      },
    },
  ];

  for (const t of targets) {
    try {
      const res = await fetch(t.url, { ...t.init, cache: "no-store" });
      const body = await res.text();
      results.push({
        name: t.name,
        status: res.status,
        server: res.headers.get("server"),
        cf: res.headers.get("cf-ray"),
        body: body.slice(0, 300),
      });
    } catch (e: unknown) {
      results.push({ name: t.name, error: e instanceof Error ? e.message : String(e) });
    }
  }

  return NextResponse.json(results);
}
