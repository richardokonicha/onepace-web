import { NextRequest, NextResponse } from "next/server";
import { resolvePublicOrigin } from "@/lib/network-origin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Reports the origin a remote device should use to reach this server.
 *
 * AirPlay receivers fetch the stream themselves, so they need an address that
 * is valid outside of the machine that serves the page.
 */
export async function GET(req: NextRequest) {
  return NextResponse.json({ origin: resolvePublicOrigin(new URL(req.url)) });
}
