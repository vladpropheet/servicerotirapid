// Fluxul public de programare, cap-coadă, pe un telefon (Pixel 7): CLAUDE.md §5.
import { expect, test, type Page } from "@playwright/test";

async function shot(page: Page, name: string) {
  await page.screenshot({ path: test.info().outputPath(`${name}.png`), fullPage: true });
}

test("clientul face o programare în 3 pași și o anulează din link", async ({ page }) => {
  // Regulile CSP nu trebuie să blocheze nimic din aplicație.
  const cspViolations: string[] = [];
  page.on("console", (message) => {
    if (/Content Security Policy/i.test(message.text())) cspViolations.push(message.text());
  });

  await page.goto("/roti-rapid");
  await expect(page.getByRole("heading", { name: "Alege serviciul" })).toBeVisible();
  await expect(page.getByText("Service Roți Rapid", { exact: true })).toBeVisible();

  // Pasul 1: autoturism, mărimea „nu știu” (implicit), jantă aliaj, 4 roți, pachet complet.
  await page.getByText("Autoturism", { exact: true }).click();
  await page.getByText("Aliaj", { exact: true }).click();
  const pachet = page
    .getByRole("article")
    .filter({ has: page.getByRole("heading", { name: "Pachet complet anvelope (pe roată)" }) });
  await expect(pachet.getByText("Când alegi asta")).toBeVisible();
  await pachet.getByRole("button", { name: "Adaugă" }).click();
  await expect(page.getByText("Estimativ: Între 180 și 320 lei")).toBeVisible();
  await expect(page.getByText("Prețul final se stabilește în service.", { exact: false })).toBeVisible();
  await shot(page, "1-serviciul");
  await page.getByRole("button", { name: "Alege ziua și ora" }).click();

  // Pasul 2: prima oră liberă.
  await expect(page.getByRole("heading", { name: "Alege ziua și ora" })).toBeVisible();
  await expect(page.getByText("durată ~1 h")).toBeVisible();
  // Pagina nu are voie să fie mai lată decât ecranul telefonului (rândul de zile derulează separat).
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
    page.viewportSize()!.width,
  );
  const hours = page.getByRole("group", { name: /^Ora/ });
  await hours.locator("label").first().click();
  const chosenTime = (await hours.locator("label").first().innerText()).trim();
  await shot(page, "2-ziua-si-ora");
  await page.getByRole("button", { name: "Continuă" }).click();

  // Pasul 3: fără date → mesaje clare.
  await expect(page.getByRole("heading", { name: "Datele tale" })).toBeVisible();
  await page.getByRole("button", { name: "Confirmă programarea" }).click();
  await expect(page.getByText("Scrie numele tău (cel puțin 2 litere).")).toBeVisible();
  await expect(page.getByText("Scrie un număr de mobil, de exemplu 0722 123 456.")).toBeVisible();
  await expect(page.getByText(/Bifează acordul pentru prelucrarea datelor/)).toBeVisible();

  // Fără abonament SMS (decizia din 22.10.2026): formularul nu cere acord de marketing.
  await expect(page.getByRole("checkbox", { name: /SMS-uri cu oferte/ })).toHaveCount(0);
  await expect(page.getByRole("checkbox")).toHaveCount(1);

  await page.getByLabel("Nume și prenume").fill("Ion Popescu");
  await expect(page.getByText("Scrie numele tău (cel puțin 2 litere).")).toHaveCount(0);
  await page.getByLabel("Telefon mobil").fill("0722 123 456");
  await page.getByLabel("Număr de înmatriculare (opțional)").pressSequentially("ag 12 abc");
  await expect(page.getByLabel("Număr de înmatriculare (opțional)")).toHaveValue("AG 12 ABC");
  await page.getByRole("checkbox", { name: /Sunt de acord cu prelucrarea datelor/ }).check();
  await shot(page, "3-datele-tale");
  await page.getByRole("button", { name: "Confirmă programarea" }).click();

  // Ecranul de succes = pagina linkului personal.
  await expect(page).toHaveURL(/\/p\/[A-Za-z0-9_-]{22}\?nou=1$/);
  await expect(page.getByRole("heading", { name: "Programarea e confirmată" })).toBeVisible();
  await expect(page.getByText("Mulțumim, Ion!")).toBeVisible();
  await expect(page.locator("dd", { hasText: `ora ${chosenTime}` })).toBeVisible();
  await expect(page.getByText("Pachet complet anvelope (pe roată) × 4")).toBeVisible();
  await expect(page.getByText("Autoturism · jantă aliaj · 4 roți · AG12ABC")).toBeVisible();
  await expect(page.getByText("0722")).toHaveCount(0); // telefonul clientului nu apare pe pagină
  // Fără SMS, linkul personal se vede pe ecran și se poate copia.
  const link = page.getByRole("textbox", { name: "Linkul programării" });
  await expect(link).toHaveValue(new RegExp(`/p/[A-Za-z0-9_-]{22}$`));
  expect(new URL(await link.inputValue()).pathname).toBe(new URL(page.url()).pathname);
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.getByRole("button", { name: "Copiază linkul" }).click();
  await expect(page.getByRole("button", { name: "Copiat ✓" })).toBeVisible();
  await shot(page, "4-confirmare");

  // Anularea cere confirmare.
  await page.getByRole("button", { name: "Anulează programarea" }).click();
  await page.getByRole("button", { name: "Da, anulează" }).click();
  await expect(page.getByRole("heading", { name: "Programarea a fost anulată" })).toBeVisible();
  await shot(page, "5-anulata");
  expect(cspViolations).toEqual([]);
});

test("serviciile care nu se programează online au „Sună acum”", async ({ page }) => {
  await page.goto("/roti-rapid");
  await page.getByText(/Alte lucrări .* doar la telefon/).click();
  const snur = page.getByRole("listitem").filter({ hasText: "Reparație pană cu șnur" });
  await expect(snur.getByRole("link", { name: "Sună acum" })).toHaveAttribute("href", "tel:+40766777130");
});

test("politica de confidențialitate e generată din datele firmei", async ({ page }) => {
  await page.goto("/roti-rapid/confidentialitate");
  await expect(page.getByRole("heading", { name: "Politica de confidențialitate" })).toBeVisible();
  await expect(page.getByText("SC DANI ROCA SRL").first()).toBeVisible();
  await expect(page.getByText("persoană împuternicită", { exact: false })).toBeVisible();
  await expect(page.getByText("Nu folosim datele pentru reclame", { exact: false })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Protecția împotriva abuzurilor" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Cookie-uri" })).toBeVisible();
  await expect(page.getByText("cel mult 24 de luni de la data programării", { exact: false })).toBeVisible();
  // În teste Turnstile e oprit, deci politica nu pomenește Cloudflare.
  await expect(page.getByText("Cloudflare", { exact: false })).toHaveCount(0);
  await expect(page.getByText("marketing", { exact: false })).toHaveCount(0);
});

test("un service inexistent și un link fals dau mesaje clare", async ({ page }) => {
  // Pagina se trimite în flux (streaming), deci codul HTTP rămâne 200;
  // Next adaugă în schimb „noindex”, ca motoarele de căutare să n-o rețină.
  await page.goto("/nu-exista-asa-ceva");
  await expect(page.getByRole("heading", { name: "Pagina nu există" })).toBeVisible();
  await expect(page.locator('meta[name="robots"][content*="noindex"]').first()).toBeAttached();

  await page.goto("/p/AAAAAAAAAAAAAAAAAAAAAA");
  await expect(page.getByRole("heading", { name: "Link invalid" })).toBeVisible();
});
