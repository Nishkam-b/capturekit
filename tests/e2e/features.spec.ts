import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { FAKE_MEDIA } from "./helpers";

test.use({ launchOptions: { args: [...FAKE_MEDIA, "--auto-select-desktop-capture-source=Entire screen"] } });
test.setTimeout(180_000);

/** Records ~5 s of the entire screen, pressing "Zoom in here" once, and returns on the recording page. */
async function recordWithMarker(page: Page) {
  await page.goto("/record");
  await page.getByRole("radio", { name: /Entire screen/ }).click();
  await page.getByRole("switch", { name: "Countdown" }).click();
  const sys = page.getByRole("switch", { name: "System audio" });
  if ((await sys.getAttribute("aria-checked")) === "true") await sys.click();
  await page.getByRole("button", { name: "Start recording" }).click();
  await expect(page.getByTestId("timer").first()).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(1500);
  await page.getByTestId("zoom-marker").first().click();
  await expect(page.getByTestId("zoom-marker").first()).toContainText("1");
  await page.waitForTimeout(3500);
  await page.getByRole("button", { name: "Stop recording" }).first().click();
  await page.waitForURL(/\/recordings\/view\?id=/, { timeout: 30_000 });
}

async function storedRecordingScreen(page: Page): Promise<string> {
  const id = new URL(page.url()).searchParams.get("id");
  // Returns the stored screen video as base64 (via FileReader), to write a real file for import.
  return page.evaluate(
    (rid) =>
      new Promise<string>((resolve, reject) => {
        const req = indexedDB.open("capturekit");
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction("chunks");
          const idx = tx.objectStore("chunks").index("recordingId").getAll(IDBKeyRange.only(rid));
          idx.onsuccess = () => {
            const parts = (idx.result as Array<{ track: string; seq: number; blob: Blob }>).filter((c) => c.track === "screen").sort((a, b) => a.seq - b.seq);
            const finish = (blob: Blob) => {
              const fr = new FileReader();
              fr.onload = () => resolve(String(fr.result).split(",")[1]);
              fr.onerror = () => reject(fr.error);
              fr.readAsDataURL(blob);
            };
            if (parts.length) return finish(new Blob(parts.map((p) => p.blob), { type: "video/webm" }));
            const m = db.transaction("media").objectStore("media").get(`${rid}/screen`);
            m.onsuccess = () => finish(m.result.blob);
            m.onerror = () => reject(m.error);
          };
          idx.onerror = () => reject(idx.error);
        };
        req.onerror = () => reject(req.error);
      }),
    id,
  );
}

test("zoom marker, speed, GIF export, project file and video import", async ({ page }, info) => {
  await recordWithMarker(page);
  const screenB64 = await storedRecordingScreen(page);
  await page.getByRole("link", { name: /Edit & export/ }).click();
  await expect(page.getByTestId("clip-0")).toBeVisible();

  // The "zoom here" mark became a manual zoom.
  await expect(page.getByTestId("zoom-0")).toBeVisible();
  await expect(page.getByTestId("zoom-0")).toHaveAttribute("title", /2× zoom$/);

  // Speed: select the clip and play it at 2×; the edited length halves.
  const before = (await page.getByTestId("edit-duration").textContent())!.split("/")[1].trim();
  await page.getByTestId("clip-0").click({ position: { x: 20, y: 30 } });
  await page.getByRole("button", { name: "Trim & cut", exact: true }).click();
  await page.getByRole("radio", { name: "Clip speed: 2×" }).click();
  await expect(page.getByTestId("edit-duration")).not.toHaveText(new RegExp(`/ ${before}$`));

  // GIF export decodes as an image of the chosen size.
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("radio", { name: /GIF/ }).click();
  await dialog.getByRole("radio", { name: /^Small/ }).click();
  await dialog.getByRole("radio", { name: "10 fps" }).click();
  await dialog.getByRole("button", { name: "Export GIF" }).click();
  const img = dialog.getByTestId("export-result");
  await expect(img).toBeVisible({ timeout: 120_000 });
  await page.waitForFunction(() => (document.querySelector<HTMLImageElement>("[data-testid=export-result]")?.naturalWidth ?? 0) > 0);
  expect(await img.evaluate((i: HTMLImageElement) => i.naturalWidth)).toBe(480);
  const [gifDl] = await Promise.all([page.waitForEvent("download"), dialog.getByRole("link", { name: /^Download GIF/ }).click()]);
  expect((await readFile(await gifDl.path())).subarray(0, 6).toString()).toBe("GIF89a");
  await dialog.getByRole("button", { name: "Close" }).click();

  // Save the project as one file, then open it again: a new copy with the same edits.
  await page.waitForTimeout(800);
  const [projDl] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Save project file" }).click()]);
  expect(projDl.suggestedFilename()).toMatch(/\.capturekit$/);
  const projPath = info.outputPath("project.capturekit");
  await projDl.saveAs(projPath);
  const firstId = new URL(page.url()).searchParams.get("id");

  await page.goto("/recordings");
  await page.getByTestId("import-project").setInputFiles(projPath);
  await page.waitForURL(/\/editor\?id=/, { timeout: 30_000 });
  expect(new URL(page.url()).searchParams.get("id")).not.toBe(firstId);
  await expect(page.getByTestId("clip-0")).toBeVisible();
  await page.getByRole("button", { name: "Trim & cut", exact: true }).click();
  await expect(page.getByRole("radio", { name: "Clip speed: 2×" })).toHaveAttribute("aria-checked", "true");

  // Import a plain video file.
  const videoPath = path.join(info.outputDir, "imported clip.webm");
  await writeFile(videoPath, Buffer.from(screenB64, "base64"));
  await page.goto("/recordings");
  await page.getByTestId("import-video").setInputFiles(videoPath);
  await page.waitForURL(/\/editor\?id=/, { timeout: 30_000 });
  await expect(page.getByTestId("clip-0")).toBeVisible();
  await expect(page.getByText("imported clip")).toBeVisible();
});

test("help, FAQ, privacy and terms pages, footer credit, and the extension download", async ({ page, request }) => {
  await page.goto("/");
  const footer = page.getByTestId("site-footer");
  await expect(footer).toContainText("Vibecoded by Nishkam");
  await expect(footer.getByRole("link", { name: /Instagram/ })).toHaveAttribute("href", "https://www.instagram.com/nishkambhatia/");
  for (const [link, heading] of [
    ["FAQ", "Frequently asked questions"],
    ["Privacy policy", "Privacy policy"],
    ["Terms & conditions", "Terms & conditions"],
  ] as const) {
    await footer.getByRole("link", { name: link, exact: true }).click();
    await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible();
  }

  await page.goto("/help");
  const dl = page.getByRole("link", { name: "Download the extension" });
  await expect(dl).toBeVisible();
  const href = (await dl.getAttribute("href"))!;
  const res = await request.get(href);
  expect(res.ok()).toBe(true);
  const zip = await res.body();
  expect(zip.subarray(0, 2).toString()).toBe("PK");
  expect(zip.includes(Buffer.from("capturekit-extension/manifest.json"))).toBe(true);
});

/** A 2-second 440 Hz mono WAV. */
function sineWav(seconds = 2, rate = 22050): Buffer {
  const n = seconds * rate;
  const buf = Buffer.alloc(44 + n * 2);
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + n * 2, 4);
  buf.write("WAVEfmt ", 8);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(rate, 24);
  buf.writeUInt32LE(rate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write("data", 36);
  buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) buf.writeInt16LE(Math.round(Math.sin((2 * Math.PI * 440 * i) / rate) * 12000), 44 + i * 2);
  return buf;
}

test("image annotation and a music track: shown in the preview and mixed into the export", async ({ page }, info) => {
  await page.goto("/record");
  await page.getByRole("radio", { name: /Entire screen/ }).click();
  await page.getByRole("switch", { name: "Countdown" }).click();
  const sys = page.getByRole("switch", { name: "System audio" });
  if ((await sys.getAttribute("aria-checked")) === "true") await sys.click();
  await page.getByRole("button", { name: "Start recording" }).click();
  await expect(page.getByTestId("timer").first()).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(3500);
  await page.getByRole("button", { name: "Stop recording" }).first().click();
  await page.waitForURL(/\/recordings\/view\?id=/, { timeout: 30_000 });
  await page.getByRole("link", { name: /Edit & export/ }).click();
  await expect(page.getByTestId("clip-0")).toBeVisible();

  // Image annotation: the frame at the playhead changes once the image is added.
  const ruler = (await page.getByTestId("timeline-ruler").boundingBox())!;
  await page.mouse.click(ruler.x + ruler.width * 0.4, ruler.y + ruler.height / 2);
  await page.getByRole("button", { name: "Annotations", exact: true }).click();
  await page.waitForTimeout(500);
  const frame = () => page.getByTestId("editor-canvas").evaluate((c: HTMLCanvasElement) => c.toDataURL("image/png"));
  const before = await frame();
  await page.getByTestId("add-image-annotation").setInputFiles(path.resolve("extension/icons/icon-128.png"));
  await expect(page.getByTestId("annotation-list").or(page.getByText("Drag it on the preview to move it"))).toBeVisible();
  await page.waitForTimeout(500);
  expect(await frame()).not.toBe(before);

  // Music track at the start.
  const wav = path.join(info.outputDir, "beep.wav");
  await mkdir(info.outputDir, { recursive: true });
  await writeFile(wav, sineWav());
  await page.getByRole("button", { name: "Audio", exact: true }).click();
  await page.getByTestId("add-audio-track").setInputFiles(wav);
  await expect(page.getByTestId("audio-tracks").locator("li")).toHaveCount(1);
  await expect(page.getByTestId("audio-tracks")).toContainText("beep");

  // Export WebM: the recording itself has no audio, so any sound comes from the music track.
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("radio", { name: "WebM" }).click();
  await dialog.getByRole("radio", { name: /^720p/ }).click();
  await dialog.getByRole("button", { name: "Export WebM" }).click();
  await expect(dialog.getByTestId("export-result")).toBeVisible({ timeout: 60_000 });
  const hasAudio = await dialog.getByTestId("export-result").evaluate(async (v: HTMLVideoElement) => {
    v.muted = true;
    await v.play();
    await new Promise((r) => setTimeout(r, 1200));
    v.pause();
    return (v as HTMLVideoElement & { webkitAudioDecodedByteCount?: number }).webkitAudioDecodedByteCount ?? -1;
  });
  expect(hasAudio).toBeGreaterThan(0);
});
