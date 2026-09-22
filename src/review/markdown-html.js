import { defaultSchema } from "rehype-sanitize";

// GitHub's html-pipeline allowlist, with safe GFM task-list support.
export const markdownSchema = {
  ...defaultSchema,
  tagNames: [...new Set([...defaultSchema.tagNames, "details", "summary", "picture", "source", "figure", "figcaption", "ruby", "rt", "rp", "time", "mark", "wbr", "tt", "bdo"])],
  attributes: {
    ...defaultSchema.attributes,
    details: ["open", ["className", "markdown-comment"]],
    span: [...(defaultSchema.attributes.span ?? []), ["className", "markdown-comment"]],
    source: ["srcSet", "media", "type"],
    time: ["dateTime"],
    "*": [...defaultSchema.attributes["*"], "align", "dir", "width", "height"],
  },
};

// Transform parsed comment nodes, so fenced code and escaped markup stay literal.
// Text children are escaped by React; comment content is never interpreted as HTML.
export function rehypeCommentBlocks() {
  return (tree) => {
    const detached = [];
    function visit(node) {
      if (!node.children) {
        return;
      }
      node.children = node.children.map((child) => {
        if (child.type === "comment") {
          if (["table", "thead", "tbody", "tfoot", "tr", "colgroup", "ul", "ol", "dl"].includes(node.tagName)) {
            detached.push(child);
            return { type: "text", value: "" };
          }
          if (node.type === "element" && !["div", "section", "blockquote", "li", "td", "th", "dd", "details", "figure"].includes(node.tagName)) {
            return { type: "element", tagName: "span", properties: { className: ["markdown-comment"], title: "HTML comment" }, children: [{ type: "text", value: ` [Comment: ${child.value.trim()}] ` }] };
          }
          return { type: "element", tagName: "details", properties: { className: ["markdown-comment"] }, children: [
            { type: "element", tagName: "summary", properties: {}, children: [{ type: "text", value: "HTML comment" }] },
            { type: "element", tagName: "pre", properties: {}, children: [{ type: "text", value: child.value.trim() }] },
          ] };
        }
        visit(child);
        return child;
      });
    }
    visit(tree);
    if (detached.length) {
      const comments = { type: "root", children: detached };
      visit(comments);
      tree.children.push(...comments.children);
    }
  };
}
