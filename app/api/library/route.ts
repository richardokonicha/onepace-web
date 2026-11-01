import { NextRequest, NextResponse } from "next/server";
import { getLibrary } from "@/lib/library";
import { errorMessage } from "@/lib/onepace";

export const revalidate = 3600;

export async function GET(req: NextRequest) {
  try {
    const series = Number(req.nextUrl.searchParams.get("series") || "98");
    const { episodes, arcs } = await getLibrary(series);
    return NextResponse.json({ episodes, arcs });
  } catch (e: unknown) {
    return NextResponse.json({ error: errorMessage(e) }, { status: 500 });
  }
}
