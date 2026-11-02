import { networkInterfaces } from "node:os"

import { isLoopbackHostname } from "@/lib/origin"

/**
 * Finds the address other devices on the network can reach.
 *
 * Loopback interfaces are skipped, so the first result is the address of a
 * real network connection.
 */
export function findLanAddress(): null | string {
  for (const addresses of Object.values(networkInterfaces())) {
    for (const address of addresses ?? []) {
      if (address.family === "IPv4" && !address.internal) {
        return address.address
      }
    }
  }

  return null
}

/**
 * Resolves the origin a remote device should use to reach this server.
 *
 * Requests that arrive on a routable host keep that host, so production
 * deployments always advertise their public origin. Requests on a loopback
 * host are rewritten to the LAN address, because `localhost` only means
 * something on the machine that runs the server.
 */
export function resolvePublicOrigin(requestUrl: URL): string {
  if (!isLoopbackHostname(requestUrl.hostname)) return requestUrl.origin

  const lanAddress = findLanAddress()

  if (!lanAddress) return requestUrl.origin

  const port =
    requestUrl.port || (requestUrl.protocol === "https:" ? "443" : "80")

  return `${requestUrl.protocol}//${lanAddress}:${port}`
}
