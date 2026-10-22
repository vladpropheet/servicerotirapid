import { connection } from "next/server";
import { pingDatabase } from "@/server/repos/health";

// Pentru monitorizare (Coolify / uptime). Răspunde doar „ok” sau „error”, fără alte detalii.
export async function GET() {
  // Rulează la fiecare cerere, nu o singură dată la build.
  await connection();
  const healthy = await pingDatabase();
  return Response.json(
    { status: healthy ? "ok" : "error" },
    { status: healthy ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
}
