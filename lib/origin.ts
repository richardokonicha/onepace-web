/**
 * Origin helpers shared by the browser and the server.
 *
 * AirPlay receivers fetch the stream on their own network, so the URL handed
 * to a receiver must point at an origin the receiver can reach. A browser that
 * serves the app from `localhost` is not reachable from another device, which
 * is why the server can advertise a reachable origin instead.
 */

const LOOPBACK_HOSTNAMES = new Set(["localhost", "127.0.0.1", "::1", "[::1]"])

/** True when the hostname only resolves on the machine itself. */
export function isLoopbackHostname(hostname: string): boolean {
  return LOOPBACK_HOSTNAMES.has(hostname) || hostname.startsWith("127.")
}

/**
 * Points a URL at another origin while keeping its path and query.
 *
 * Proxy tokens are signed for a payload, not for a host, so only the origin
 * of the URL has to change.
 */
export function withOrigin(url: URL, origin: null | string): string {
  if (!origin) return url.href

  const target = new URL(origin)

  if (url.origin === target.origin) return url.href

  const rewritten = new URL(url.href)
  rewritten.protocol = target.protocol
  rewritten.host = target.host

  return rewritten.href
}

/**
 * Resolves the origin a client used to reach this server.
 *
 * Playlists have to reference absolute URLs, because the client that follows
 * them is not necessarily the browser that requested the playlist. The host
 * header describes that client, while the request URL is rebuilt by the
 * server and can point at a loopback address even when the request arrived on
 * a routable host.
 */
export function resolveRequestOrigin(request: Request): string {
  const headers = request.headers
  const requestUrl = new URL(request.url)

  const forwardedHost = headers.get("x-forwarded-host")?.split(",")[0]?.trim()
  const host = headers.get("host")?.trim()

  let hostname = host

  if (forwardedHost && !isLoopbackHostname(new URL(`${requestUrl.protocol}//${forwardedHost}`).hostname)) {
    hostname = forwardedHost
  }

  const forwardedProtocol = headers
    .get("x-forwarded-proto")
    ?.split(",")[0]
    ?.trim()
  const protocol = forwardedProtocol || requestUrl.protocol.replace(/:$/, "")

  if (!hostname) return requestUrl.origin

  return `${protocol}://${hostname}`
}
