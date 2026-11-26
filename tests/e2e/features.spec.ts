import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { FAKE_MEDIA, landOnRecording } from "./helpers";

test.use({ launchOptions: { args: [...FAKE_MEDIA, "--auto-select-desktop-capture-source=Entire screen"] } });
test.setTimeout(180_000);

/** Records ~5 s of the entire screen (optionally with the webcam) and returns on the recording page. */
async function recordScreen(page: Page, camera = false) {
  await page.goto("/record");
  await page.getByRole("radio", { name: /Entire screen/ }).click();
  await page.getByRole("switch", { name: "Countdown" }).click();
  const sys = page.getByRole("switch", { name: "System audio" });
  if ((await sys.getAttribute("aria-checked")) === "true") await sys.click();
  if (camera) {
    await page.getByRole("switch", { name: "Webcam" }).click();
    await expect(page.locator("video").first()).toBeVisible();
  }
  await page.getByRole("button", { name: "Start recording" }).click();
  await expect(page.getByTestId("timer").first()).toBeVisible({ timeout: 15_000 });
  // The recorder is simple: no zoom marker or cursor tracking.
  await expect(page.getByTestId("zoom-marker")).toHaveCount(0);
  await page.waitForTimeout(5000);
  await page.getByRole("button", { name: "Stop recording" }).first().click();
  await landOnRecording(page);
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

test("speed, GIF export, project file and video import", async ({ page }, info) => {
  await recordScreen(page);
  const screenB64 = await storedRecordingScreen(page);
  await page.getByRole("link", { name: /Edit & export/ }).click();
  await expect(page.getByTestId("clip-0")).toBeVisible();

  // No automatic zooms.
  await expect(page.getByTestId("zoom-0")).toHaveCount(0);

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

test("help, FAQ, privacy and terms pages and footer credit", async ({ page }) => {
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

  // No extension or automatic-zoom leftovers anywhere on the help pages.
  for (const path of ["/help", "/faq"]) {
    await page.goto(path);
    await expect(page.getByText(/extension/i)).toHaveCount(0);
    await expect(page.getByText(/automatic zoom/i)).toHaveCount(0);
  }
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
  await landOnRecording(page);
  await page.getByRole("link", { name: /Edit & export/ }).click();
  await expect(page.getByTestId("clip-0")).toBeVisible();

  // Image annotation: the frame at the playhead changes once the image is added.
  const ruler = (await page.getByTestId("timeline-ruler").boundingBox())!;
  await page.mouse.click(ruler.x + ruler.width * 0.4, ruler.y + ruler.height / 2);
  await page.getByRole("button", { name: "Annotations", exact: true }).click();
  await page.waitForTimeout(500);
  const frame = () => page.getByTestId("editor-canvas").evaluate((c: HTMLCanvasElement) => c.toDataURL("image/png"));
  const before = await frame();
  await page.getByTestId("add-image-annotation").setInputFiles(path.resolve("docs/images/record.jpg"));
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

const frameOf = (page: Page) => page.getByTestId("editor-canvas").evaluate((c: HTMLCanvasElement) => c.toDataURL("image/png"));

async function storedProjectOf(page: Page): Promise<Record<string, unknown>> {
  const id = new URL(page.url()).searchParams.get("id");
  return page.evaluate(
    (rid) =>
      new Promise<Record<string, unknown>>((resolve, reject) => {
        const req = indexedDB.open("capturekit");
        req.onsuccess = () => {
          const g = req.result.transaction("projects").objectStore("projects").get(rid!);
          g.onsuccess = () => resolve(g.result);
          g.onerror = () => reject(g.error);
        };
      }),
    id,
  );
}

test("multicam layout switching, screen and webcam layer sliders, and export", async ({ page }) => {
  await recordScreen(page, true);
  await page.getByRole("link", { name: /Edit & export/ }).click();
  await expect(page.getByTestId("clip-0")).toBeVisible();
  const ruler = (await page.getByTestId("timeline-ruler").boundingBox())!;
  const seekTo = async (f: number) => {
    await page.mouse.click(ruler.x + ruler.width * f, ruler.y + ruler.height / 2);
    await page.waitForTimeout(500);
  };

  // Layout lane starts as screen + webcam for the whole video.
  await expect(page.getByTestId("scene-pip")).toHaveCount(1);
  await seekTo(0.7);
  const pip = await frameOf(page);

  // Switch to full webcam from 50% (key 2), then screen only from 80% (Layout panel).
  await seekTo(0.5);
  await page.keyboard.press("2");
  await expect(page.getByTestId("scene-camera")).toHaveCount(1);
  await seekTo(0.7);
  expect(await frameOf(page)).not.toBe(pip);
  await page.getByRole("button", { name: "Layout", exact: true }).click();
  await expect(page.getByRole("radio", { name: /Full webcam/ })).toHaveAttribute("aria-checked", "true");
  await seekTo(0.85);
  await page.getByRole("radio", { name: /Screen only/ }).click();
  await expect(page.getByTestId("scene-screen")).toHaveCount(1);
  await page.waitForTimeout(800);
  let p = await storedProjectOf(page);
  expect((p.scenes as Array<{ layout: string }>).map((c) => c.layout)).toEqual(["camera", "screen"]);

  // Screen layer sliders change the frame and are saved.
  await seekTo(0.2);
  const plain = await frameOf(page);
  await page.getByRole("button", { name: "Screen", exact: true }).click();
  await page.getByLabel("Size").fill("0.7");
  await page.getByLabel("Horizontal position").fill("0.1");
  await page.getByLabel("Opacity").fill("0.6");
  await page.getByLabel("Rotation").fill("12");
  await page.waitForTimeout(400);
  expect(await frameOf(page)).not.toBe(plain);

  // Webcam: its own shape, position, opacity and rotation.
  await page.getByRole("button", { name: "Webcam", exact: true }).click();
  await page.getByRole("radio", { name: "Webcam shape: Rectangle" }).click();
  await page.getByLabel("Horizontal position").fill("0.2");
  await page.getByLabel("Webcam opacity").fill("0.5");
  await page.getByLabel("Webcam rotation").fill("-15");
  await page.waitForTimeout(800);
  p = await storedProjectOf(page);
  expect(p.screen).toMatchObject({ scale: 0.7, x: 0.1, opacity: 0.6, rotation: 12 });
  expect(p.webcam).toMatchObject({ shape: "rect", x: 0.2, opacity: 0.5, rotation: -15 });

  // Export follows the layout.
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("radio", { name: /^720p/ }).click();
  await dialog.getByRole("button", { name: /^Export (WebM|MP4)$/ }).click();
  await expect(dialog.getByTestId("export-result")).toBeVisible({ timeout: 90_000 });
});
