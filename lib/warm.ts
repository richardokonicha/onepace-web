import { errorMessage } from "./onepace";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";
const SEGMENTS_TO_WARM = 2;

function absoluteUrls(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.startsWith("http://") || l.startsWith("https://"));
}

/**
 * The origin the client used to reach the app. The request URL is rebuilt by
 * the server and can point at a loopback address even when the request
 * arrived on a routable host, so the forwarded host decides the origin.
 */
export function warmOrigin(req: Request): string {
  const requestUrl = new URL(req.url);
  const forwardedHost = req.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const host = req.headers.get("host")?.trim();

  let hostname = host;
  if (forwardedHost) {
    const fwdHostname = new URL(`${requestUrl.protocol}//${forwardedHost}`).hostname;
    const loopback = fwdHostname === "localhost" || fwdHostname.startsWith("127.");
    if (!loopback) hostname = forwardedHost;
  }

  const protocol = req.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() || requestUrl.protocol.replace(/:$/, "");
  if (!hostname) return requestUrl.origin;
  return `${protocol}://${hostname}`;
}

async function drain(url: string): Promise<string | null> {
  try {
    // The request goes out over the public origin, so the edge network
    // stores the response under the very URL the browser will ask for.
    const res = await fetch(url, { headers: { "User-Agent": UA } });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

async function drainBinary(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { headers: { "User-Agent": UA } });
    if (!res.ok) return false;
    await res.arrayBuffer();
    return true;
  } catch {
    return false;
  }
}

/**
 * Pulls the master playlist, the first media playlist and the leading
 * segments through the public proxy so the CDN holds them before the player
 * asks for them. The URLs used here are the exact ones handed to the client,
 * so every warmed entry is a hit for the browser.
 */
export async function warmHlsChain(origin: string, masterPath: string): Promise<void> {
  const base = origin.replace(/\/+$/, "");
  try {
    const masterText = await drain(`${base}${masterPath}`);
    if (!masterText) return;

    const playlistUrl = absoluteUrls(masterText)[0];
    if (!playlistUrl) return;

    const playlistText = await drain(playlistUrl);
    if (!playlistText) return;

    const segments = absoluteUrls(playlistText).slice(0, SEGMENTS_TO_WARM);
    await Promise.all(segments.map((s) => drainBinary(s)));
  } catch (e: unknown) {
    console.error("warmHlsChain", errorMessage(e));
  }
}
