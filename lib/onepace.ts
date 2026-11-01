const BASE = "https://onepace.co";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

export async function fetchOnepace(path: string, init?: RequestInit) {
  const url = path.startsWith("http") ? path : `${BASE}${path}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      "User-Agent": UA,
      Referer: `${BASE}/`,
      "Accept": "application/json, text/plain, */*",
      ...(init?.headers || {}),
    },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`onepace ${path} ${res.status}`);
  return res;
}

export async function fetchOnepaceJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetchOnepace(path, init);
  return res.json() as Promise<T>;
}

export function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  return String(e);
}
