import { useEffect, useMemo, useRef, useState } from "react";
import { Player, type PlayerRef } from "@remotion/player";
import { FlutedGlass } from "@paper-design/shaders-react";
import { durationFrames, type Edl } from "@reel/edl";
import { SocialVideo } from "../motion/SocialVideo";
import { useEditor } from "../store";

/**
 * Centered floating device frame on the secondary background. Playback is
 * driven by the timeline transport (no built-in Player chrome); clicking the
 * video still toggles play. While Generate / Auto-improve runs, the canvas
 * shows the project's poster frame behind an animated wave of fluted glass
 * (the V1 loading frames' vertical ribs) — no player — until the new cut has
 * fully loaded (the busy flags outlive the reload).
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
          <GenerationGlass slug={slug} label={autotuning ? "Improving your cut…" : "Generating your cut…"} />
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

/**
 * The in-progress canvas: the cut being generated shows through an animated
 * fluted-glass wave (paper-design shader). FlutedGlass is an image filter, so
 * the "video behind the glass" is the project's poster frame; the glass ribs
 * sweep across it by animating the texture `shift` uniform.
 */
function GenerationGlass({ slug, label }: { slug: string | null; label: string }): JSX.Element {
  const [thumb, setThumb] = useState<string | null>(null);
  const [shift, setShift] = useState(0);

  useEffect(() => {
    let alive = true;
    setThumb(null);
    if (slug) {
      window.api
        ?.projectThumbnail(slug)
        .then((url) => alive && setThumb(url))
        .catch(() => {});
    }
    return () => {
      alive = false;
    };
  }, [slug]);

  // Gentle back-and-forth sweep. State lives in this leaf, so the ~30fps
  // updates re-render only the shader while the Player is unmounted anyway.
  useEffect(() => {
    let raf = 0;
    let last = 0;
    const start = performance.now();
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      if (now - last < 33) return;
      last = now;
      setShift(Math.sin((now - start) / 1800) * 0.55);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div className="gen-loader">
      {thumb ? (
        <FlutedGlass
          className="gen-glass"
          image={thumb}
          fit="cover"
          shape="wave"
          distortionShape="contour"
          size={0.16}
          distortion={0.6}
          stretch={0.25}
          shift={shift}
          shadows={0.22}
          highlights={0.12}
          blur={0.12}
          edges={0.3}
          colorBack="#00000000"
        />
      ) : (
        <div className="gen-glass gen-glass-blank" />
      )}
      <span className="gen-loader-label">{label}</span>
    </div>
  );
}
