import { useEffect, useRef, useState } from "react";
import { useEditor } from "../store";
import { addAssets, addAudioClip } from "../lib/edl-edit";
import { Button, Icon, Modal } from "./ui";
import type { ImportedAsset, VoiceSummary } from "../../../preload";

/**
 * Voiceover tools (mic recording + ElevenLabs synthesis), relocated from the
 * retired left rail into Settings → Voices for v1.5. Both need an open
 * project — the buttons explain themselves when there isn't one.
 */
export function VoiceoverTools(): JSX.Element {
  const slug = useEditor((s) => s.slug);
  const view = useEditor((s) => s.view);
  const [busy, setBusy] = useState<string | null>(null);
  const [voOpen, setVoOpen] = useState(false);
  const updateEdl = useEditor((s) => s.updateEdl);
  const saveNow = useEditor((s) => s.saveNow);
  const reloadProject = useEditor((s) => s.reloadProject);

  const projectOpen = view === "editor" && Boolean(slug);

  const addVoiceover = async (asset: ImportedAsset) => {
    updateEdl((d) => {
      addAssets(d, [asset]);
      addAudioClip(d, asset.id, "voiceover", asset.durationSec);
    });
    await saveNow();
    setBusy("Transcribing voiceover…");
    try {
      await window.api.transcribeProject(slug!);
      reloadProject();
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="settings-voiceover">
      {!projectOpen && <p className="settings-row-sub">Open a project to record or generate a voiceover.</p>}
      <div className="settings-voiceover-row">
        <RecordButton setBusy={setBusy} onAdd={addVoiceover} disabled={!projectOpen} />
        <Button
          variant="secondary"
          size="sm"
          icon="magic-wand"
          onClick={() => setVoOpen(true)}
          disabled={!projectOpen}
          title="Write a narration script and synthesize it with an ElevenLabs voice"
        >
          Generate voiceover
        </Button>
      </div>
      {busy && <p className="settings-row-sub">{busy}</p>}
      {voOpen && <VoiceoverModal onClose={() => setVoOpen(false)} />}
    </div>
  );
}

/**
 * Generate-voiceover dialog: pick a voice, review/edit the narration script
 * (draftable with the LLM), then synthesize. TTS lands the audio on the vo
 * track with word-level captions; the project reloads via the file watcher.
 */
function VoiceoverModal({ onClose }: { onClose: () => void }): JSX.Element {
  const slug = useEditor((s) => s.slug);
  const reloadProject = useEditor((s) => s.reloadProject);
  const pushNotice = useEditor((s) => s.pushNotice);
  const [voices, setVoices] = useState<VoiceSummary[]>([]);
  const [voiceId, setVoiceId] = useState("");
  const [configured, setConfigured] = useState(true);
  const [script, setScript] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    window.api
      ?.voicesStatus()
      .then((s) => setConfigured(s.configured))
      .catch(() => {});
    window.api
      ?.listVoices()
      .then((r) => {
        setVoices(r.voices);
        if (r.voices.length > 0) {
          window.api.getSettings().then((s) => {
            setVoiceId(
              s.defaultVoiceId && r.voices.some((v) => v.id === s.defaultVoiceId)
                ? s.defaultVoiceId
                : r.voices[0].id,
            );
          });
        }
      })
      .catch(() => {});
    if (slug)
      window.api
        ?.loadNarration(slug)
        .then(setScript)
        .catch(() => {});
  }, [slug]);

  const draft = async () => {
    if (!slug || busy) return;
    setBusy("Drafting…");
    const offPhase = window.api.onPhase("narration", (p) => setBusy(`${p}…`));
    try {
      const res = await window.api.draftNarration(slug);
      if (res.ok) {
        setScript(await window.api.loadNarration(slug));
      } else {
        pushNotice("error", `Drafting failed: ${res.error ?? "unknown error"}`);
      }
    } finally {
      offPhase();
      setBusy(null);
    }
  };

  const synthesize = async () => {
    if (!slug || busy || !voiceId || !script.trim()) return;
    setBusy("Synthesizing…");
    const offPhase = window.api.onPhase("tts", (p) => setBusy(`${p}…`));
    const offProgress = window.api.onProgress("tts", (pct) => setBusy(`Synthesizing ${pct}%`));
    try {
      await window.api.saveNarration(slug, script);
      const res = await window.api.generateVoiceover(slug, voiceId);
      if (res.ok) {
        reloadProject();
        pushNotice("info", "Voiceover added with captions.");
        onClose();
      } else {
        pushNotice("error", `Voiceover failed: ${res.error ?? "unknown error"}`);
      }
    } finally {
      offPhase();
      offProgress();
      setBusy(null);
    }
  };

  return (
    <Modal
      title="Generate voiceover"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={draft} disabled={!!busy}>
            {busy?.startsWith("Drafting") ? busy : "Draft with AI"}
          </Button>
          <Button
            variant="primary"
            onClick={synthesize}
            disabled={!!busy || !configured || !voiceId || !script.trim()}
          >
            {busy && !busy.startsWith("Drafting") ? busy : "Generate voiceover"}
          </Button>
        </>
      }
    >
      {!configured && (
        <p className="crit-summary" style={{ margin: 0 }}>
          Add your ElevenLabs API key in Settings → Voices first.
        </p>
      )}
      <div className="insp-group" style={{ width: "100%" }}>
        <span className="insp-label">Voice</span>
        <span className="insp-select">
          <select value={voiceId} onChange={(e) => setVoiceId(e.target.value)}>
            {voices.length === 0 && <option value="">No voices available</option>}
            {voices.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
                {v.category === "cloned" ? " (cloned)" : ""}
              </option>
            ))}
          </select>
          <Icon name="chevron-top" size={16} style={{ transform: "rotate(180deg)" }} />
        </span>
      </div>
      <div className="insp-group" style={{ width: "100%" }}>
        <span className="insp-label">Narration script</span>
        <textarea
          className="rail-textarea"
          style={{ height: 160 }}
          value={script}
          placeholder="Write the narration here, or let the AI draft it from your prompt and cut. Blank lines become natural pauses."
          onChange={(e) => setScript(e.target.value)}
        />
      </div>
    </Modal>
  );
}

function RecordButton({
  setBusy,
  onAdd,
  disabled,
}: {
  setBusy: (s: string | null) => void;
  onAdd: (asset: ImportedAsset) => void | Promise<void>;
  disabled?: boolean;
}): JSX.Element {
  const slug = useEditor((s) => s.slug);
  const [recording, setRecording] = useState(false);
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const chunks = useRef<Blob[]>([]);

  // If this component unmounts mid-recording, stop the recorder and release
  // the mic — otherwise the mic stays hot and the MediaRecorder leaks.
  useEffect(() => {
    return () => {
      recorder.current?.stop();
      stream.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const start = async () => {
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.current = mediaStream;
      const mr = new MediaRecorder(mediaStream);
      chunks.current = [];
      mr.ondataavailable = (e) => e.data.size > 0 && chunks.current.push(e.data);
      mr.onstop = async () => {
        mediaStream.getTracks().forEach((t) => t.stop());
        stream.current = null;
        const blob = new Blob(chunks.current, { type: "audio/webm" });
        const buf = new Uint8Array(await blob.arrayBuffer());
        if (!slug) return;
        setBusy("Saving voiceover…");
        try {
          const res = await window.api.importAssetBuffer(slug, `voiceover-${Date.now()}.webm`, buf);
          if (res.assets[0]) await onAdd(res.assets[0]);
        } finally {
          setBusy(null);
        }
      };
      mr.start();
      recorder.current = mr;
      setRecording(true);
    } catch {
      setBusy("Mic unavailable");
      setTimeout(() => setBusy(null), 1500);
    }
  };

  const stop = () => {
    recorder.current?.stop();
    recorder.current = null;
    setRecording(false);
  };

  return (
    <Button
      variant="secondary"
      size="sm"
      icon="record"
      onClick={recording ? stop : start}
      disabled={disabled}
      style={recording ? { color: "var(--foreground-danger)" } : undefined}
      title="Record a voiceover — captions are transcribed automatically"
    >
      {recording ? "Stop recording" : "Record"}
    </Button>
  );
}
