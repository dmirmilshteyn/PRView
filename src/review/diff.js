import { structuredPatch } from "diff";

export function numberedLines(hunk) {
  const match = /^@@ -(\d+)(?:,\d+)? \+(\d+)/.exec(hunk.header);
  let oldLine = hunk.oldStart ?? Number(match?.[1] ?? 1);
  let newLine = hunk.newStart ?? Number(match?.[2] ?? 1);
  return hunk.lines.filter((line) => !line.startsWith("\\")).map((line) => {
    const marker = line[0];
    const result = { marker, text: line.slice(1), oldLine: marker === "+" ? null : oldLine, newLine: marker === "-" ? null : newLine };
    if (marker !== "+") {
      oldLine += 1;
    }
    if (marker !== "-") {
      newLine += 1;
    }
    return result;
  });
}

export function splitRows(lines) {
  const rows = [];
  let index = 0;
  while (index < lines.length) {
    if (lines[index].marker === " ") {
      rows.push({ left: lines[index], right: lines[index] });
      index += 1;
    } else {
      const removed = [];
      const added = [];
      while (index < lines.length && lines[index].marker !== " ") {
        (lines[index].marker === "-" ? removed : added).push(lines[index]);
        index += 1;
      }
      for (let offset = 0; offset < Math.max(removed.length, added.length); offset += 1) {
        rows.push({ left: removed[offset] ?? null, right: added[offset] ?? null });
      }
    }
  }
  return rows;
}

export function makeHunks(file, context, ignoreWhitespace) {
  if (typeof file.baseContent?.text !== "string" || typeof file.headContent?.text !== "string") {
    return file.hunks;
  }
  return structuredPatch(file.oldPath ?? file.path, file.path, file.baseContent.text, file.headContent.text, "", "", { context, ignoreWhitespace }).hunks.map((hunk) => ({
    ...hunk, header: `@@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@`,
  }));
}

export function comparisonFiles(current, baseline, baselineRevision) {
  const previous = new Map(baseline.files.map((file) => [file.path, file]));
  const present = new Map([...current.files, ...(current.comparisonFiles ?? [])].map((file) => [file.path, file]));
  const renamedPaths = new Set(current.files.filter((file) => file.oldPath && file.oldPath !== file.path && previous.has(file.oldPath)).map((file) => file.oldPath));
  const paths = new Set([...current.files.map((file) => file.path), ...[...previous.keys()].filter((filePath) => !renamedPaths.has(filePath))]);
  return [...paths].map((filePath) => {
    const file = present.get(filePath);
    const oldFile = previous.get(filePath) ?? previous.get(file?.oldPath);
    const baseContent = oldFile?.headContent ?? current.comparisonBases?.[baselineRevision]?.[filePath];
    const headContent = file?.headContent;
    return {
      ...(file ?? oldFile), path: filePath, baseContent, headContent,
      renamedSinceReview: Boolean(oldFile && oldFile.path !== filePath),
      hunks: [], comparisonUnavailable: typeof baseContent?.text !== "string" || typeof headContent?.text !== "string",
    };
  }).filter((file) => file.comparisonUnavailable || file.renamedSinceReview || file.baseContent.text !== file.headContent.text);
}
