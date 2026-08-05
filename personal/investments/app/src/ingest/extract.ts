import { createHash } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { basename, join } from "node:path";

/**
 * Runs `pdftotext -bbox-layout`, which emits every word with its x-extent and y.
 * Cached by the PDF's content hash, so re-running over 220 unchanged statements
 * is a no-op. `-layout` is deliberately NOT used: it discards the coordinates
 * this pipeline depends on (see the spec's "Why word geometry" section).
 */
export async function extractXml(pdfPath: string, cacheDir: string): Promise<string> {
  const bytes = await Bun.file(pdfPath).arrayBuffer();
  const hash = createHash("sha256").update(new Uint8Array(bytes)).digest("hex").slice(0, 16);
  const cachePath = join(cacheDir, `${basename(pdfPath, ".pdf")}.${hash}.xml`);

  const cached = Bun.file(cachePath);
  if (await cached.exists()) return cached.text();

  const proc = Bun.spawn(["pdftotext", "-bbox-layout", pdfPath, "-"], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const [xml, err, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  if (code !== 0) {
    throw new Error(`pdftotext failed on ${basename(pdfPath)} (exit ${code}): ${err.trim()}`);
  }

  await mkdir(cacheDir, { recursive: true });
  await Bun.write(cachePath, xml);
  return xml;
}
