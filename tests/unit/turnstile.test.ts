// Cloudflare Turnstile: verificarea pe server, cu răspunsuri simulate (fără cereri reale către Cloudflare).
import { afterEach, describe, expect, it, vi } from "vitest";
import { turnstileConfigProblem } from "@/server/security/startup-checks";
import { turnstileMode, turnstileSiteKey, verifyTurnstile } from "@/server/security/turnstile";

function enableKeys() {
  vi.stubEnv("TURNSTILE_DISABLED", "");
  vi.stubEnv("TURNSTILE_SITE_KEY", "cheie-publica-test");
  vi.stubEnv("TURNSTILE_SECRET_KEY", "cheie-secreta-test");
}

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("modul Turnstile", () => {
  it("fără chei e oprit și nu se afișează widgetul", () => {
    vi.stubEnv("TURNSTILE_SITE_KEY", "");
    vi.stubEnv("TURNSTILE_SECRET_KEY", "");
    expect(turnstileMode()).toBe("disabled");
    expect(turnstileSiteKey()).toBeNull();
  });

  it("cu chei e pornit; TURNSTILE_DISABLED=1 îl oprește conștient", () => {
    enableKeys();
    expect(turnstileMode()).toBe("enabled");
    expect(turnstileSiteKey()).toBe("cheie-publica-test");
    vi.stubEnv("TURNSTILE_DISABLED", "1");
    expect(turnstileMode()).toBe("disabled");
  });
});

describe("verifyTurnstile", () => {
  it("oprit: acceptă fără să contacteze Cloudflare", async () => {
    vi.stubEnv("TURNSTILE_SITE_KEY", "");
    const fetchMock = vi.fn<typeof fetch>();
    expect(await verifyTurnstile(undefined, fetchMock)).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("pornit: fără token sau cu token prea lung refuză direct", async () => {
    enableKeys();
    const fetchMock = vi.fn<typeof fetch>();
    expect(await verifyTurnstile(undefined, fetchMock)).toBe(false);
    expect(await verifyTurnstile("x".repeat(2049), fetchMock)).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("trimite cheia secretă și tokenul, fără IP-ul clientului", async () => {
    enableKeys();
    const fetchMock = vi.fn<typeof fetch>(async () => jsonResponse({ success: true }));
    expect(await verifyTurnstile("token-bun", fetchMock)).toBe(true);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://challenges.cloudflare.com/turnstile/v0/siteverify");
    const body = new URLSearchParams(String(init?.body));
    expect(body.get("secret")).toBe("cheie-secreta-test");
    expect(body.get("response")).toBe("token-bun");
    expect(body.has("remoteip")).toBe(false);
  });

  it("refuză când Cloudflare spune nu, răspunde cu eroare sau nu răspunde", async () => {
    enableKeys();
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await verifyTurnstile("t", async () => jsonResponse({ success: false, "error-codes": ["invalid-input-response"] }))).toBe(false);
    expect(await verifyTurnstile("t", async () => jsonResponse({}, 500))).toBe(false);
    expect(
      await verifyTurnstile("t", async () => {
        throw new Error("timeout");
      }),
    ).toBe(false);
  });
});

describe("verificarea la pornire (producție)", () => {
  it("fără chei Turnstile, producția nu pornește decât cu TURNSTILE_DISABLED=1", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("TURNSTILE_SITE_KEY", "");
    vi.stubEnv("TURNSTILE_SECRET_KEY", "");
    vi.stubEnv("TURNSTILE_DISABLED", "");
    expect(turnstileConfigProblem()).toMatch(/TURNSTILE_SITE_KEY/);
    vi.stubEnv("TURNSTILE_DISABLED", "1");
    expect(turnstileConfigProblem()).toBeNull();
    enableKeys();
    expect(turnstileConfigProblem()).toBeNull();
  });
});
