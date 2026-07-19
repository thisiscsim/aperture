import { useEffect, useMemo, useRef } from "react";
import { Player, type PlayerRef } from "@remotion/player";
import { ImageGeneration } from "img-fx";
import { durationFrames, type Edl } from "@reel/edl";
import { SocialVideo } from "../motion/SocialVideo";
import { useEditor } from "../store";

/**
 * Centered floating device frame on the secondary background (Figma V0).
 * Playback is driven by the timeline transport (no built-in Player chrome);
 * clicking the video still toggles play. While Generate / Auto-improve runs,
 * the canvas shows ONLY img-fx's WebGL mosaic — no image reveals, no player —
 * until the new cut has fully loaded (the busy flags outlive the reload).
 */
export function PreviewStage(): JSX.Element {
  const edl = useEditor((s) => s.edl);
  const slug = useEditor((s) => s.slug);
  const generating = useEditor((s) => s.generating);
  const autotuning = useEditor((s) => s.autotuning);
  const setCurrentFrame = useEditor((s) => s.setCurrentFrame);
  const setSeek = useEditor((s) => s.setSeek);
  const setPlaying = useEditor((s) => s.setPlaying);
  const setPlayerCtl = useEditor((s) => s.setPlayerCtl);
  const ref = useRef<PlayerRef>(null);

  const busy = generating || autotuning;

  // Whether a Player is mounted (vs the empty/busy placeholders). The wiring
  // effect must re-run when the Player mounts/unmounts, but NOT on every EDL
  // edit — the control closures below delegate through ref.current, so their
  // identities can stay stable across edits (previously a fresh seek/playerCtl
  // per keystroke forced a second app-wide render pass via subscribers).
  const hasContent = edl
    ? edl.tracks.some((t) =>
        t.type === "text" ? t.clips.length > 0 : t.type === "caption" ? false : t.clips.length > 0,
      )
    : false;
  const playerMounted = Boolean(edl) && !busy && hasContent;

  useEffect(() => {
    const player = ref.current;
    if (!player) return;
    const onFrame = (e: { detail: { frame: number } }) => setCurrentFrame(e.detail.frame);
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    player.addEventListener("frameupdate", onFrame as never);
    player.addEventListener("play", onPlay);
    player.addEventListener("pause", onPause);
    setSeek((frame: number) => ref.current?.seekTo(frame));
    setPlayerCtl({
      toggle: () => ref.current?.toggle(),
      setMuted: (m: boolean) => (m ? ref.current?.mute() : ref.current?.unmute()),
    });
    return () => {
      player.removeEventListener("frameupdate", onFrame as never);
      player.removeEventListener("play", onPlay);
      player.removeEventListener("pause", onPause);
      setPlayerCtl(null);
    };
  }, [playerMounted, setCurrentFrame, setSeek, setPlaying, setPlayerCtl]);

  // Stable inputProps identity across renders that don't change the EDL/asset
  // base — a fresh object literal re-renders the whole SocialVideo composition.
  // (Only read when a Player is mounted, i.e. edl is present.)
  // `edl as Edl` is safe: the object is only consumed inside the `hasContent`
  // branch below, which is unreachable when edl is null (early return).
  const inputProps = useMemo(
    () => ({ edl: edl as Edl, assetBaseUrl: slug ? `reel-asset://${slug}` : undefined, preview: true }),
    [edl, slug],
  );

  if (!edl) return <section className="preview-stage" />;

  const aspect = `${edl.format.width} / ${edl.format.height}`;

  return (
    <section className="preview-stage">
      <div className="device-card" style={{ aspectRatio: aspect }}>
        {busy ? (
          <div className="gen-loader">
            <ImageGeneration preset="pixels-organic" theme="auto" borderRadius={7} className="gen-loader-fx">
              <div className="gen-loader-card" />
            </ImageGeneration>
            <span className="gen-loader-label">
              {autotuning ? "Improving your cut…" : "Generating your cut…"}
            </span>
          </div>
        ) : hasContent ? (
          <Player
            ref={ref}
            component={SocialVideo}
            inputProps={inputProps}
            durationInFrames={durationFrames(edl)}
            fps={edl.format.fps}
            compositionWidth={edl.format.width}
            compositionHeight={edl.format.height}
            style={{ height: "100%", width: "100%" }}
            clickToPlay
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
