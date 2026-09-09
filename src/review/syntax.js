import { createHighlighter } from "shiki";

let highlighterPromise;

export async function highlightCode(filePath, content) {
  highlighterPromise ??= createHighlighter({ themes: ["github-dark"], langs: ["javascript", "jsx", "typescript", "tsx", "css", "json", "markdown", "python", "csharp", "bash", "yaml", "text"] });
  const highlighter = await highlighterPromise;
  const language = { js: "javascript", jsx: "jsx", ts: "typescript", tsx: "tsx", css: "css", json: "json", md: "markdown", py: "python", cs: "csharp", sh: "bash", yml: "yaml", yaml: "yaml" }[filePath.split(".").pop().toLowerCase()] ?? "text";
  return highlighter.codeToTokens(content, { lang: language, theme: "github-dark" }).tokens;
}
