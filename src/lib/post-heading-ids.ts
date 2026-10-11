/** Keep existing page anchors unless an authored heading already uses them. */
export function createPostHeadingIds(headings: readonly { slug: string }[]) {
  const ids = new Set(headings.map(({ slug }) => slug));
  const reserve = (base: string) => {
    let id = base;
    for (let suffix = 1; ids.has(id); suffix += 1) id = `${base}-${suffix}`;
    ids.add(id);
    return id;
  };
  return { title: reserve("post-title"), comments: reserve("commentaires") };
}
