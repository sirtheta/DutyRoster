import { test, expect } from "@playwright/test";
import { login } from "./helpers";
import { E2E_ADMIN } from "./global-setup";

test("redirects unauthenticated visitors to the login page", async ({ page }) => {
  await page.goto("/dashboard");
  await page.waitForURL("**/login");
  await expect(page.getByRole("button", { name: "Anmelden" })).toBeVisible();
});

test("rejects a wrong password", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("E-Mail").fill(E2E_ADMIN.email);
  await page.getByLabel("Passwort", { exact: true }).fill("definitely-wrong");
  await page.getByRole("button", { name: "Anmelden" }).click();
  await expect(page.getByText("E-Mail oder Passwort ist falsch.")).toBeVisible();
});

test("logs in and lands on the calendar", async ({ page }) => {
  await login(page);
  await expect(page).toHaveURL(/\/calendar/);
});

test("offers the forgot-password flow with a generic answer", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("link", { name: "Passwort vergessen?" }).click();
  await page.waitForURL("**/forgot-password");
  await page.getByLabel("E-Mail").fill("nobody@e2e.local");
  await page.getByRole("button", { name: "Link anfordern" }).click();
  await expect(page.getByText(/Falls ein Konto mit dieser Adresse existiert/)).toBeVisible();
});
