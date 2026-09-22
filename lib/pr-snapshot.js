import { readFileSync, existsSync } from "node:fs";
import path from "node:path";

export function readPRSnapshot(folder) {
  const snapshot = path.join(folder, "snapshot.json");
  if (existsSync(snapshot)) {
    return JSON.parse(readFileSync(snapshot, "utf8"));
  }
  // Compatibility for imports created before atomic snapshots were introduced.
  const details = JSON.parse(readFileSync(path.join(folder, "details.json"), "utf8"));
  const diffFile = path.join(folder, "diff.json");
  return { details, diff: existsSync(diffFile) ? JSON.parse(readFileSync(diffFile, "utf8")) : null };
}
