import { useEffect, useRef } from "react";
import { Player, type PlayerRef } from "@remotion/player";
import { durationFrames } from "@reel/edl";
import { SocialVideo } from "../motion/SocialVideo";
import { useEditor } from "../store";

/**
 * Centered floating device frame on the secondary background (Figma V0).
 * The Player keeps its built-in controls until the timeline transport lands
 * (editor Phase 3).
 */
export function PreviewStage(): JSX.Element {
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

  if (!edl) return <section className="preview-stage" />;

  const hasContent = edl.tracks.some((t) =>
    t.type === "text" ? t.clips.length > 0 : t.type === "caption" ? false : t.clips.length > 0,
  );
  const aspect = `${edl.format.width} / ${edl.format.height}`;

  return (
    <section className="preview-stage">
      <div className="device-card" style={{ aspectRatio: aspect }}>
        {hasContent ? (
          <Player
            ref={ref}
            component={SocialVideo}
            inputProps={{ edl, assetBaseUrl: slug ? `reel-asset://${slug}` : undefined, preview: true }}
            durationInFrames={durationFrames(edl)}
            fps={edl.format.fps}
            compositionWidth={edl.format.width}
            compositionHeight={edl.format.height}
            style={{ height: "100%", width: "100%" }}
            controls
            loop
          />
        ) : (
          <p className="device-card-empty">
            Add clips, then press &lsquo;Generate&rsquo; for Aperture to take a first pass to preview here
          </p>
        )}
      </div>
    </section>
  );
}
