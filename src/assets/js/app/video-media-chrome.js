// Mux's default theme needs these custom elements. The media-chrome barrel also
// registers unrelated controls, whose side effects prevent tree shaking.
// Keep the complete player theme, including its settings menus and shortcuts.
// site-rendering.spec.ts checks every tag in the installed upstream template.
export { default as MediaController } from "media-chrome/dist/media-controller.js";
export { default as MediaErrorDialog } from "media-chrome/dist/media-error-dialog.js";
import "media-chrome/dist/media-airplay-button.js";
import "media-chrome/dist/media-cast-button.js";
import "media-chrome/dist/media-control-bar.js";
import "media-chrome/dist/media-fullscreen-button.js";
import "media-chrome/dist/media-live-button.js";
import "media-chrome/dist/media-loading-indicator.js";
import "media-chrome/dist/media-mute-button.js";
import "media-chrome/dist/media-pip-button.js";
import "media-chrome/dist/media-play-button.js";
import "media-chrome/dist/media-poster-image.js";
import "media-chrome/dist/media-preview-chapter-display.js";
import "media-chrome/dist/media-preview-thumbnail.js";
import "media-chrome/dist/media-preview-time-display.js";
import "media-chrome/dist/media-seek-backward-button.js";
import "media-chrome/dist/media-seek-forward-button.js";
import "media-chrome/dist/media-text-display.js";
import "media-chrome/dist/media-time-display.js";
import "media-chrome/dist/media-time-range.js";
import "media-chrome/dist/media-volume-range.js";
import "media-chrome/dist/menu/media-audio-track-menu.js";
import "media-chrome/dist/menu/media-audio-track-menu-button.js";
import "media-chrome/dist/menu/media-captions-menu.js";
import "media-chrome/dist/menu/media-captions-menu-button.js";
import "media-chrome/dist/menu/media-playback-rate-menu.js";
import "media-chrome/dist/menu/media-playback-rate-menu-button.js";
import "media-chrome/dist/menu/media-rendition-menu.js";
import "media-chrome/dist/menu/media-rendition-menu-button.js";
