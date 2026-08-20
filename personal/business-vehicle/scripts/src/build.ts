/** Renders every page of the business vehicle database from data/vehicle.json. */

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { compliancePage } from "./pages/compliance";
import { dealPage } from "./pages/deal";
import { fleetHistoryPage } from "./pages/fleet-history";
import { indexPage } from "./pages/index";
import { insurancePage } from "./pages/insurance";
import { leasePage } from "./pages/lease";
import { servicePage } from "./pages/service";
import type { VehicleData } from "./types";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

const RENDERERS: Record<string, (d: VehicleData) => string> = {
  "index.html": indexPage,
  "lease.html": leasePage,
  "insurance.html": insurancePage,
  "service.html": servicePage,
  "compliance.html": compliancePage,
  "deal.html": dealPage,
  "fleet-history.html": fleetHistoryPage,
};

export async function build(): Promise<string[]> {
  const raw = await Bun.file(join(ROOT, "data", "vehicle.json")).text();
  const data = JSON.parse(raw) as VehicleData;
  const outDir = join(ROOT, "notes");
  await mkdir(outDir, { recursive: true });

  const written: string[] = [];
  for (const [file, render] of Object.entries(RENDERERS)) {
    await writeFile(join(outDir, file), render(data), "utf8");
    written.push(file);
  }
  return written;
}

if (import.meta.main) {
  const written = await build();
  console.log(`rendered ${written.length} pages: ${written.join(", ")}`);
}
