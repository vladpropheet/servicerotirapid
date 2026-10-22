// O programare online rapidă (geometrie punte față, prima oră liberă), pentru testele care au nevoie de un client.
import { expect, type Page } from "@playwright/test";

export async function bookFirstFreeSlot(page: Page, customer: { name: string; phone: string; plate?: string }) {
  await page.goto("/roti-rapid");
  await page.getByText("Autoturism", { exact: true }).click();
  await page
    .getByRole("article")
    .filter({ has: page.getByRole("heading", { name: "Geometrie punte față" }) })
    .getByRole("button", { name: "Adaugă" })
    .click();
  await page.getByRole("button", { name: "Alege ziua și ora" }).click();
  await page.getByRole("group", { name: /^Ora/ }).locator("label").first().click();
  await page.getByRole("button", { name: "Continuă" }).click();
  await page.getByLabel("Nume și prenume").fill(customer.name);
  await page.getByLabel("Telefon mobil").fill(customer.phone);
  if (customer.plate) await page.getByLabel("Număr de înmatriculare (opțional)").fill(customer.plate);
  await page.getByRole("checkbox", { name: /Sunt de acord cu prelucrarea datelor/ }).check();
  await page.getByRole("button", { name: "Confirmă programarea" }).click();
  await expect(page.getByRole("heading", { name: "Programarea e confirmată" })).toBeVisible();
}
