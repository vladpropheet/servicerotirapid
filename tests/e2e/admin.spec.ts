// Panoul patronului, cap-coadă, pe telefon (CLAUDE.md §6).
import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { bookFirstFreeSlot } from "./booking-flow";

const NEW_PASSWORD = "roata galbena sambata 2026";

test("patronul intră cu parola temporară, o schimbă, modifică un preț și îl vede pe pagina publică", async ({ page }) => {
  const phone = process.env.E2E_OWNER_PHONE!;
  const temporary = process.env.E2E_OWNER_TEMP_PASSWORD!;

  // Fără cont, panoul trimite la logare.
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/admin\/login$/);

  // O parolă greșită dă un mesaj clar.
  await page.getByLabel("Telefon").fill(phone);
  await page.getByLabel("Parolă").fill("parola-gresita-123");
  await page.getByRole("button", { name: "Intră în cont" }).click();
  await expect(page.getByText("Telefonul sau parola nu sunt corecte.")).toBeVisible();

  // Parola temporară duce la schimbarea obligatorie a parolei.
  await page.getByLabel("Parolă").fill(temporary);
  await page.getByRole("button", { name: "Intră în cont" }).click();
  await expect(page).toHaveURL(/\/admin\/schimba-parola$/);
  await expect(page.getByText("Ai intrat cu o parolă temporară")).toBeVisible();
  await page.getByLabel("Parola actuală (sau cea temporară)").fill(temporary);
  await page.getByLabel("Parola nouă", { exact: true }).fill(NEW_PASSWORD);
  await page.getByLabel("Scrie din nou parola nouă").fill(NEW_PASSWORD);
  await page.getByRole("button", { name: "Salvează parola" }).click();

  // Panoul: „Azi”.
  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByRole("link", { name: "Mâine" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Meniu principal" })).toBeVisible();

  // Prețul geometriei pentru autoturism: 140 → 150 lei.
  await page.getByRole("navigation", { name: "Meniu principal" }).getByRole("link", { name: "Servicii" }).click();
  await page.getByRole("link", { name: /Geometrie punte față/ }).click();
  const cell = page.getByRole("textbox", { name: "Autoturism, preț" });
  await expect(cell).toHaveValue("140");
  await cell.fill("150");
  await page.getByRole("button", { name: "Salvează prețurile" }).click();
  await expect(page.getByText("Prețurile au fost salvate.")).toBeVisible();
  await page.screenshot({ path: test.info().outputPath("admin-pret.png"), fullPage: true });

  // Istoricul arată schimbarea.
  await page.goto("/admin/istoric");
  await page.getByText("Prețuri modificate").first().click();
  await expect(page.getByText(/"autoturism": "150"/)).toBeVisible();

  // Pagina publică arată noul preț.
  await page.goto("/roti-rapid");
  const article = page.getByRole("article").filter({ has: page.getByRole("heading", { name: "Geometrie punte față" }) });
  await expect(article.getByText("150 lei")).toBeVisible();

  // GDPR: un client face o programare, patronul descarcă datele, apoi îi șterge datele la cerere.
  await bookFirstFreeSlot(page, { name: "Elena Test", phone: "0733 444 555", plate: "B 99 GDP" });
  await page.goto("/admin/meniu");
  await page.getByRole("link", { name: "Datele clienților (export, ștergere)" }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width);
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Descarcă programările" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^programari-roti-rapid-\d{4}-\d{2}-\d{2}\.csv$/);
  const csv = await readFile(await download.path(), "utf8");
  expect(csv.startsWith("﻿Cod;Data;Ora;")).toBe(true);
  expect(csv).toContain("Elena Test;0733 444 555;B99GDP");

  await page.getByLabel("Telefon, nume sau nr. de înmatriculare").fill("b99gdp");
  await page.getByRole("button", { name: "Caută" }).click();
  await page.getByRole("link", { name: "Șterge datele" }).click();
  await expect(page.getByRole("heading", { name: /Ștergi datele lui Elena Test/ })).toBeVisible();
  await page.getByRole("checkbox", { name: /Persoana a cerut ștergerea datelor/ }).check();
  await page.getByRole("button", { name: "Șterge definitiv" }).click();
  await expect(page.getByText(/Datele clientului au fost șterse\. Programări păstrate fără date personale: 1\. Programări viitoare anulate: 1\./)).toBeVisible();
  await page.screenshot({ path: test.info().outputPath("admin-gdpr.png"), fullPage: true });
  await page.getByLabel("Telefon, nume sau nr. de înmatriculare").fill("0733 444 555");
  await page.getByRole("button", { name: "Caută" }).click();
  await expect(page.getByText("Niciun client găsit pentru „0733 444 555”.")).toBeVisible();

  // Ieșire din cont.
  await page.goto("/admin/meniu");
  await page.getByRole("button", { name: "Ieși din cont", exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/login$/);
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/admin\/login$/);
});

test("zona super-admin nu e accesibilă fără cont", async ({ page }) => {
  await page.goto("/superadmin");
  await expect(page).toHaveURL(/\/admin\/login$/);
});
