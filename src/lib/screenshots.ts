import { decodeImage } from "@/engines/screenshot/io";
import { createScreenshotProject, type ScreenshotProject } from "@/engines/screenshot/project";
import { createId } from "@/engines/shared/format";
import { saveScreenshotProject } from "@/engines/storage/db";

/** Validates an image and stores it as a new screenshot project. Returns the new id. */
export async function createScreenshotFromBlob(
  blob: Blob,
  source: ScreenshotProject["source"],
  name?: string,
): Promise<string> {
  const { width, height } = await decodeImage(blob);
  const id = createId();
  const stamp = new Date().toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  const project = createScreenshotProject(id, (name?.trim() || `Screenshot ${stamp}`).slice(0, 120), width, height, source);
  await saveScreenshotProject(project, blob);
  return id;
}

/** File name without extension, for naming an imported screenshot. */
export function stemOf(fileName: string): string {
  return fileName.replace(/\.[a-z0-9]+$/i, "");
}
