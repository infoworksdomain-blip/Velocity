import { Composition } from "remotion";
import { Slideshow, SlideshowPropsSchema } from "./compositions/Slideshow.js";
import { VerticalVideo, VerticalVideoPropsSchema, VIDEO_FPS, VIDEO_HEIGHT, VIDEO_WIDTH } from "./compositions/VerticalVideo.js";

const DEFAULT_DURATION_FRAMES = VIDEO_FPS * 10;

export function RemotionRoot() {
  return (
    <>
      <Composition
        id="VerticalVideo"
        component={VerticalVideo}
        schema={VerticalVideoPropsSchema}
        durationInFrames={DEFAULT_DURATION_FRAMES}
        fps={VIDEO_FPS}
        width={VIDEO_WIDTH}
        height={VIDEO_HEIGHT}
        defaultProps={{ shotUrls: [], shotDurationsSec: [], voiceoverUrl: null, textOverlayRef: null }}
      />
      <Composition
        id="Slideshow"
        component={Slideshow}
        schema={SlideshowPropsSchema}
        durationInFrames={DEFAULT_DURATION_FRAMES}
        fps={VIDEO_FPS}
        width={VIDEO_WIDTH}
        height={VIDEO_HEIGHT}
        defaultProps={{ slideUrls: [], slideDurationsSec: [], textOverlayRef: null }}
      />
    </>
  );
}
