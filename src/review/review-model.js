const languageByExtension = {
  css: "css",
  js: "javascript",
  json: "json",
  jsx: "jsx",
  md: "markdown",
  py: "python",
  sh: "bash",
  ts: "typescript",
  tsx: "tsx",
  yaml: "yaml",
  yml: "yaml",
};

export function calculateReviewProgress(files, reviewedFiles) {
  const total = files.length;
  const reviewed = files.filter((file) => reviewedFiles[file.path] === true).length;

  return {
    reviewed,
    total,
    percentage: total === 0 ? 0 : Math.round((reviewed / total) * 100),
  };
}

export function createReviewStorageKey(pullRequestNumber) {
  return `prview:review:${pullRequestNumber}`;
}

export function getLanguage(filePath) {
  const extension = filePath.split(".").pop()?.toLowerCase();

  return languageByExtension[extension] ?? "text";
}
