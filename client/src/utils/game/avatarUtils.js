import { createAvatar } from "@dicebear/core";
import * as DiceStyles from "@dicebear/collection";

const svgToDataUrl = (svg) =>
  `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;

export function makeAvatarDataUrl(styleKey, seed) {
  const style = DiceStyles[styleKey] || DiceStyles.funEmoji;
  const svg = createAvatar(style, { seed: seed || "player" }).toString();
  return svgToDataUrl(svg);
}