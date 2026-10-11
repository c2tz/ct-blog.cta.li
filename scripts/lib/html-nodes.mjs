export function walkElements(node, elements = []) {
  if (node && typeof node === "object" && "tagName" in node) elements.push(node);
  for (const child of node?.childNodes ?? []) walkElements(child, elements);
  if (node?.content) walkElements(node.content, elements);
  return elements;
}

export function getAttribute(element, name) {
  return element.attrs?.find((attribute) => attribute.name === name)?.value;
}

export function duplicateElementIds(root) {
  const duplicates = new Set();
  const inspectScope = (scope) => {
    const ids = new Set();
    const visit = (node) => {
      const id = getAttribute(node, "id");
      if (id) {
        if (ids.has(id)) duplicates.add(id);
        ids.add(id);
      }
      for (const child of node.childNodes ?? []) visit(child);
      // Template contents belong to separate document fragments until instantiated.
      if (node.content) inspectScope(node.content);
    };
    visit(scope);
  };
  inspectScope(root);
  return [...duplicates];
}
