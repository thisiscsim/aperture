import { useEffect, useRef } from "react";
import { Player, type PlayerRef } from "@remotion/player";
import { durationFrames } from "@reel/edl";
import { SocialVideo } from "../motion/SocialVideo";
import { useEditor } from "../store";

export function Preview(): JSX.Element {
  const edl = useEditor((s) => s.edl);
  const slug = useEditor((s) => s.slug);
  const setCurrentFrame = useEditor((s) => s.setCurrentFrame);
  const setSeek = useEditor((s) => s.setSeek);
  const ref = useRef<PlayerRef>(null);

  useEffect(() => {
    const player = ref.current;
    if (!player) return;
    const onFrame = (e: { detail: { frame: number } }) => setCurrentFrame(e.detail.frame);
    player.addEventListener("frameupdate", onFrame as never);
    setSeek((frame: number) => ref.current?.seekTo(frame));
    return () => player.removeEventListener("frameupdate", onFrame as never);
  }, [edl, setCurrentFrame, setSeek]);

  if (!edl) return <section className="stage" />;

  const hasContent = edl.tracks.some((t) =>
    t.type === "text" ? t.clips.length > 0 : t.type === "caption" ? false : t.clips.length > 0,
  );
  if (!hasContent) {
    return (
      <section className="stage">
        <div className="device device-empty">
          <div className="device-empty-msg">
            Add clips, then <strong>Generate</strong> a first cut to preview it here.
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="stage">
      <div className="device">
        <Player
          ref={ref}
          component={SocialVideo}
          inputProps={{ edl, assetBaseUrl: slug ? `reel-asset://${slug}` : undefined }}
          durationInFrames={durationFrames(edl)}
          fps={edl.format.fps}
          compositionWidth={edl.format.width}
          compositionHeight={edl.format.height}
          style={{ height: "100%", width: "100%" }}
          controls
          loop
        />
      </div>
    </section>
  );
}
