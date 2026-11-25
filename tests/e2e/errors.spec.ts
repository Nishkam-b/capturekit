import { expect, test } from "@playwright/test";

test("cancelled screen picker shows a friendly error and stays on setup", async ({ page }) => {
  await page.addInitScript(() => {
    navigator.mediaDevices.getDisplayMedia = () => Promise.reject(new DOMException("denied", "NotAllowedError"));
  });
  await page.goto("/record");
  await page.getByRole("button", { name: "Start recording" }).click();
  await expect(page.getByText(/Screen sharing was cancelled or blocked/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Start recording" })).toBeEnabled();
});

test("unknown recording id shows not-found", async ({ page }) => {
  await page.goto("/recordings/view?id=does-not-exist");
  await expect(page.getByText("Recording not found")).toBeVisible();
});
