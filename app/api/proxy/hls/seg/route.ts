import { NextRequest, NextResponse } from "next/server";
import { verifyPayload } from "@/lib/proxy";
import { errorMessage } from "@/lib/onepace";

export const runtime = "edge";
export const dynamic = "force-dynamic";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

export async function GET(req: NextRequest) {
  const t = req.nextUrl.searchParams.get("t");
  if (!t) return NextResponse.json({ error: "missing t" }, { status: 400 });
  const payload = await verifyPayload(t);
  if (!payload) return NextResponse.json({ error: "invalid or expired" }, { status: 403 });
  if (payload.kind !== "hls-seg") return NextResponse.json({ error: "bad payload" }, { status: 400 });

  const range = req.headers.get("range");
  const headers: Record<string, string> = { "User-Agent": UA, Referer: "https://onepace.co/" };
  if (range) headers["Range"] = range;

  let res: Response | null = null;
  try {
    const r = await fetch(payload.u, { headers, cache: "no-store", redirect: "follow" });
    if (r.ok) res = r;
    else await r.body?.cancel();
  } catch (e: unknown) {
    return NextResponse.json({ error: errorMessage(e) }, { status: 502 });
  }
  if (!res) return NextResponse.json({ error: "segment unavailable" }, { status: 502 });

  const respHeaders = new Headers();
  respHeaders.set("Access-Control-Allow-Origin", "*");
  respHeaders.set("Accept-Ranges", "bytes");
  respHeaders.set("Cache-Control", "public, max-age=3600");
  const ct = res.headers.get("content-type");
  if (ct) respHeaders.set("Content-Type", ct);
  const cl = res.headers.get("content-length");
  if (cl) respHeaders.set("Content-Length", cl);
  const cr = res.headers.get("content-range");
  if (cr) respHeaders.set("Content-Range", cr);

  return new NextResponse(res.body, { status: res.status, headers: respHeaders });
}
