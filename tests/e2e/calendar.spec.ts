import { test, expect } from "@playwright/test";
import { login } from "./helpers";

/** First Monday of June of the given year, as YYYY-MM-DD. */
function firstMondayOfJune(year: number): string {
  const d = new Date(year, 5, 1);
  while (d.getDay() !== 1) d.setDate(d.getDate() + 1);
  return `${year}-06-${String(d.getDate()).padStart(2, "0")}`;
}

test("paints an entry via selection + legend and deletes it again", async ({ page }) => {
  await login(page);
  const date = firstMondayOfJune(new Date().getFullYear());
  // User id 1 is the seeded admin; .first() targets the desktop grid.
  const cell = page.locator(`td[data-user-id="1"][data-date="${date}"]`).first();

  await cell.click();
  await expect(page.getByText("1 Zelle(n) ausgewählt")).toBeVisible();
  await page.getByRole("button", { name: /^F – / }).click();
  await expect(cell).toHaveText("F");

  await cell.click();
  await page.getByRole("button", { name: "Löschen" }).click();
  await expect(cell).toHaveText("");
});

test("admin can run the yearly duty automation", async ({ page }) => {
  await login(page);
  await page.getByRole("button", { name: "Generieren" }).click();
  await expect(page.getByText(/Dienste für \d{4} eingeplant\./)).toBeVisible({ timeout: 30_000 });
  await expect(
    page
      .locator("td[data-date]")
      .filter({ hasText: /^S$/ })
      .first()
  ).toBeVisible();
});
