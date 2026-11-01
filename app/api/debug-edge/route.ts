import { NextResponse } from "next/server";

export const runtime = "edge";
export const dynamic = "force-dynamic";

export async function GET() {
  const out: unknown[] = [];
  try {
    const res = await fetch("https://onepace.co/wp-json/dgt/v1/watch", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
        Referer: "https://onepace.co/",
        Origin: "https://onepace.co",
        Accept: "application/json, text/plain, */*",
      },
      body: JSON.stringify({ post_id: 98, episode_id: 3760 }),
    });
    const body = await res.text();
    out.push({ status: res.status, cf: res.headers.get("cf-ray"), body: body.slice(0, 200) });
  } catch (e: unknown) {
    out.push({ error: e instanceof Error ? e.message : String(e) });
  }
  return NextResponse.json(out);
}
