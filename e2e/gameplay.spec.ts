import { expect, test } from "@playwright/test";

test.describe("checkers gameplay", () => {
  test("plays opening turns in two-player mode", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Two Players" }).click();

    await expect(page.locator("#turn-text")).toContainText("Red to move");

    await page.locator(".piece[data-row='5'][data-col='0']").click();
    await page.getByTestId("square-4-1").click();
    await expect(page.locator("#turn-text")).toContainText("Blue to move");

    await page.locator(".piece[data-row='2'][data-col='1']").click();
    await page.getByTestId("square-3-0").click();
    await expect(page.locator("#turn-text")).toContainText("Red to move");
  });

  test("one-player mode executes an AI response", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "One Player" }).click();

    await page.locator(".piece[data-row='5'][data-col='0']").click();
    await page.getByTestId("square-4-1").click();

    await expect
      .poll(
        async () => {
          return page.locator(".piece.dark[data-row='3']").count();
        },
        { timeout: 10000 }
      )
      .toBeGreaterThan(0);

    await expect
      .poll(
        async () => {
          const value = await page.locator("#turn-text").textContent();
          return value?.trim() ?? "";
        },
        { timeout: 10000 }
      )
      .toMatch(/^Red/);
  });
});
