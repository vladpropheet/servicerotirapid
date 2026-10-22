import { getAuth } from "@/server/auth/auth";

// Endpoint-urile Better Auth (sesiune, deconectare, 2FA). Logarea propriu-zisă trece prin
// acțiunea de server din /admin/login; endpoint-urile nefolosite sunt dezactivate în auth.ts.
export async function GET(request: Request) {
  return getAuth().handler(request);
}

export async function POST(request: Request) {
  return getAuth().handler(request);
}
