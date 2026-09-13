const EXCLUDED_IMAGE_CONTEXT =
  "header, footer, nav, [data-no-image-dialog], a[href], button, input, select, textarea";

export function isImagePreviewCandidate(image) {
  return (
    image instanceof HTMLImageElement &&
    Boolean(image.src) &&
    !image.closest(EXCLUDED_IMAGE_CONTEXT)
  );
}

export function imagePreviewCandidateFromEvent(event) {
  const image = event.composedPath().find((node) => node instanceof HTMLImageElement);
  return isImagePreviewCandidate(image) && image.closest(".site-prose") ? image : null;
}
