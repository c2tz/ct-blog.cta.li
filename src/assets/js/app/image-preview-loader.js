import { imagePreviewCandidateFromEvent } from "./image-preview-candidates.js";

let controllerPromise;
let controllerReady = false;
let installed = false;

function removeWarmListeners() {
  document.removeEventListener("pointerover", warmController, true);
  document.removeEventListener("focusin", warmController, true);
}

function loadController() {
  controllerPromise ??= import("./image-preview.js")
    .then(async (controller) => {
      await controller.installImagePreviewDialog();
      controllerReady = true;
      removeWarmListeners();
      return controller;
    })
    .catch((error) => {
      controllerPromise = undefined;
      throw error;
    });
  return controllerPromise;
}

function warmController(event) {
  if (imagePreviewCandidateFromEvent(event)) void loadController().catch(() => undefined);
}

async function replayActivation(event) {
  if (controllerReady) return;

  const image = imagePreviewCandidateFromEvent(event);
  if (!image) return;
  if (event.type === "keydown" && event.key !== "Enter" && event.key !== " ") return;

  event.preventDefault();
  let controller;
  try {
    controller = await loadController();
  } catch {
    return;
  }
  if (!image.isConnected) return;
  await controller.openImagePreviewDialog(image, { restoreFocus: event.type === "keydown" });
}

export function installImagePreviewLoader() {
  if (installed) return;
  installed = true;
  document.addEventListener("pointerover", warmController, { capture: true, passive: true });
  document.addEventListener("focusin", warmController, true);
  document.addEventListener("click", (event) => void replayActivation(event), true);
  document.addEventListener("keydown", (event) => void replayActivation(event), true);
}
