import { loadFont as loadSpace } from "@remotion/google-fonts/SpaceGrotesk";
import { loadFont as loadSans } from "@remotion/google-fonts/DMSans";
import { loadFont as loadMono } from "@remotion/google-fonts/DMMono";
import { Composition } from "remotion";
import { RefundCourt, DURATION, FPS, HEIGHT, WIDTH } from "./RefundCourt";

// The same fonts as the website.
loadSpace("normal", { weights: ["600"] });
loadSans("normal", { weights: ["400", "500"] });
loadMono("normal", { weights: ["400", "500"] });

export function RemotionRoot() {
  return <Composition id="RefundCourt" component={RefundCourt} durationInFrames={DURATION} fps={FPS} width={WIDTH} height={HEIGHT} />;
}
