import { expect, test } from "bun:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import CheckIndicators from "../src/review/CheckIndicators.jsx";
import Markdown from "../src/review/Markdown.jsx";
import { highlightCode } from "../src/review/syntax.js";
import { approvalStatus } from "../src/review/approval.js";

function render(content) {
  return renderToStaticMarkup(React.createElement(Markdown, null, content));
}

test("GitHub HTML details render while scripts, handlers, and unsafe URLs are removed", () => {
  const html = render('<details open><summary>More</summary><p><kbd>Enter</kbd> <sup>2</sup></p></details>\n\n<script>alert(1)</script><img src="x" onerror="alert(2)"><a href="javascript:alert(3)">link</a>');
  expect(html).toContain('<details open="">');
  expect(html).toContain('<summary>More</summary>');
  expect(html).toContain('<kbd>Enter</kbd>');
  expect(html).not.toContain('alert(');
  expect(html).not.toContain('onerror');
  expect(html).not.toContain('<script');
});

test("HTML comments are escaped, distinct blocks while fenced HTML remains code", () => {
  const html = render('<!-- <img src=x onerror=alert(1)> -->\n\n```html\n<!-- code comment -->\n<details>\n```');
  expect(html).toContain('class="markdown-comment"');
  expect(html).toContain('&lt;img');
  expect(html).toContain('&lt;!-- code comment --&gt;');
  expect(html.match(/<summary>HTML comment<\/summary>/g)).toHaveLength(1);
});

test("Svelte highlighting handles scripts, markup, and template expressions", async () => {
  const tokens = await highlightCode('Component.svelte', '<script lang="ts">let count: number = 1;</script>\n<button>{count}</button>');
  expect(tokens.flat().map((token) => token.content).join('')).toContain('{count}');
  expect(new Set(tokens.flat().map((token) => token.color)).size).toBeGreaterThan(2);
});

test("JSX highlighting recognizes components, attributes, and expressions in jsx and js files", async () => {
  const source = 'export const View = () => <Button disabled={false}>Hello</Button>;';
  const jsx = await highlightCode("View.jsx", source);
  const js = await highlightCode("View.js", source);
  expect(js).toEqual(jsx);
  expect(jsx.flat().map((token) => token.content).join("")).toBe(source);
  const color = (content) => jsx.flat().find((token) => token.content === content)?.color;
  expect(color("Button")).toBeDefined();
  expect(color("disabled")).toBeDefined();
  expect(color("Button")).not.toBe(color("disabled"));
  expect(color("false")).toBeDefined();
  expect(color("false")).not.toBe(color("disabled"));
});

test("approval attribution uses each reviewer's latest decisive review", () => {
  const review = (login, state, date) => ({ user: { login }, state, submitted_at: date });
  const details = { viewerLogin: 'ME', github: { reviews: [review('me', 'APPROVED', '1'), review('me', 'COMMENTED', '2'), review('other', 'APPROVED', '3')] } };
  expect(approvalStatus(details)).toMatchObject({ approved: true, byYou: true });
  details.github.reviews.push(review('me', 'DISMISSED', '4'));
  expect(approvalStatus(details)).toMatchObject({ approved: true, byYou: false });
  details.github.reviews.push(review('other', 'CHANGES_REQUESTED', '5'));
  expect(approvalStatus(details).approved).toBe(false);
});

test("inline and table comments preserve valid HTML nesting", () => {
  const inline = render('Text <!-- note --> after.');
  expect(inline).toContain('<span class="markdown-comment"');
  expect(inline).not.toContain('<details');
  const table = render('<table><!-- table note --><tr><td>Cell</td></tr></table>');
  expect(table.indexOf('HTML comment')).toBeGreaterThan(table.indexOf('</table>'));
  expect(approvalStatus({ github: { reviews: [{ state: "APPROVED" }] } }).byYou).toBe(false);
});

test("dashboard check icons do not nest links inside PR card links", () => {
  const details = { checkRuns: [{ name: "build", status: "COMPLETED", conclusion: "SUCCESS", detailsUrl: "https://github.com/dmirmilshteyn/PRView/actions" }] };
  const card = renderToStaticMarkup(React.createElement('a', { href: '/dmirmilshteyn/PRView/pull/27' }, React.createElement(CheckIndicators, { details, linkToChecks: false })));
  expect(card.match(/<a\b/g)).toHaveLength(1);
  expect(card).toContain('build: All checks passed');
  const detail = renderToStaticMarkup(React.createElement(CheckIndicators, { details, linkToChecks: true }));
  expect(detail).toContain('href="https://github.com/dmirmilshteyn/PRView/actions"');
});
