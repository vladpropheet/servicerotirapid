import "server-only";
import { headers } from "next/headers";

// Separat de rate-limit.ts: scripturile (ex. ștergerea automată) folosesc limitele fără Next.js.

/**
 * IP-ul clientului. În producție aplicația stă în spatele proxy-ului Coolify (Traefik), care pune
 * adresa reală în X-Real-Ip și o adaugă la finalul X-Forwarded-For. Primele valori din
 * X-Forwarded-For le poate scrie oricine, deci nu le folosim.
 */
export async function clientIp(): Promise<string> {
  let h: Headers;
  try {
    h = await headers();
  } catch {
    return "necunoscut"; // în afara unei cereri (scripturi, teste)
  }
  const realIp = h.get("x-real-ip")?.trim();
  if (realIp) return realIp;
  const forwarded = h.get("x-forwarded-for");
  const last = forwarded?.split(",").at(-1)?.trim();
  return last || "necunoscut";
}
