import assert from "node:assert/strict";
import test from "node:test";
import { createMarkdownProcessor } from "@astrojs/markdown-remark";
import rehypeSlug from "rehype-slug";
import { tsImport } from "tsx/esm/api";

const { createPostHeadingIds } = await tsImport("../src/lib/post-heading-ids.ts", import.meta.url);

test("preserves existing page anchors when there is no authored collision", () => {
  assert.deepEqual(createPostHeadingIds([{ slug: "introduction" }]), {
    title: "post-title",
    comments: "commentaires",
  });
});

test("reserves article and comments anchors after repeated Markdown headings", async () => {
  const processor = await createMarkdownProcessor({ rehypePlugins: [rehypeSlug] });
  const result = await processor.render("## Commentaires\n\n## Commentaires\n\n## Post title");
  const ids = createPostHeadingIds(result.metadata.headings);
  assert.deepEqual(ids, { title: "post-title-1", comments: "commentaires-2" });
  const allIds = [...result.metadata.headings.map(({ slug }) => slug), ...Object.values(ids)];
  assert.equal(new Set(allIds).size, allIds.length);
});
