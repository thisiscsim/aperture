import type { Session, SessionAttachment, SessionItem, SessionSettings } from "@reel/edl";
import type { RunArgs } from "../../../preload";
import type { ComposerSettings } from "./composer";

/**
 * Pure helpers for the Create tab's session log (projects/<slug>/session.json).
 * All functions return new Session objects — the store persists the result
 * through the session:save IPC and re-renders from it.
 */

export function emptySession(): Session {
  return { version: 1, turns: [] };
}

export function toSessionSettings(s: ComposerSettings): SessionSettings {
  return {
    mode: s.mode,
    effort: s.effort,
    fastMode: s.fastMode,
    aspect: s.aspect,
    durationSec: s.durationSec,
    referenceMode: s.referenceMode,
  };
}

/** Map composer settings (+ per-run extras) onto the IPC run-args payload. */
export function buildRunArgs(
  settings: ComposerSettings,
  opts: { notes?: string; adjust?: boolean } = {},
): RunArgs {
  return {
    notes: opts.notes?.trim() ? opts.notes.trim() : undefined,
    durationSec: settings.durationSec,
    effort: settings.effort,
    fastMode: settings.fastMode,
    referenceMode: settings.referenceMode,
    adjust: opts.adjust === true ? true : undefined,
  };
}

export function appendUserTurn(
  session: Session,
  input: { text: string; settings: SessionSettings; attachments?: SessionAttachment[] },
): Session {
  return {
    ...session,
    turns: [
      ...session.turns,
      {
        role: "user",
        at: new Date().toISOString(),
        text: input.text,
        settings: input.settings,
        attachments: input.attachments ?? [],
      },
    ],
  };
}

export function appendAssistantTurn(session: Session, agent: "generation" | "critique"): Session {
  return {
    ...session,
    turns: [
      ...session.turns,
      { role: "assistant", at: new Date().toISOString(), agent, items: [], pending: true },
    ],
  };
}

/** Append an item to the trailing assistant turn (no-op if the log doesn't end on one). */
export function appendAssistantItem(session: Session, item: SessionItem): Session {
  const last = session.turns[session.turns.length - 1];
  if (!last || last.role !== "assistant") return session;
  return {
    ...session,
    turns: [...session.turns.slice(0, -1), { ...last, items: [...last.items, item] }],
  };
}

/**
 * Replace the trailing assistant turn's last status item (streamed PHASE lines
 * overwrite each other rather than stacking), or append when none exists yet.
 */
export function upsertAssistantStatus(
  session: Session,
  status: Extract<SessionItem, { type: "status" }>,
): Session {
  const last = session.turns[session.turns.length - 1];
  if (!last || last.role !== "assistant") return session;
  const items = [...last.items];
  const tail = items[items.length - 1];
  if (tail && tail.type === "status") items[items.length - 1] = status;
  else items.push(status);
  return {
    ...session,
    turns: [...session.turns.slice(0, -1), { ...last, items }],
  };
}

/** Mark the trailing assistant turn complete (optionally recording an error). */
export function completeAssistantTurn(session: Session, error?: string): Session {
  const last = session.turns[session.turns.length - 1];
  if (!last || last.role !== "assistant") return session;
  const items: SessionItem[] = error
    ? [...last.items, { type: "status", icon: "error", label: error.slice(0, 500) }]
    : last.items;
  return {
    ...session,
    turns: [...session.turns.slice(0, -1), { ...last, items, pending: false }],
  };
}
