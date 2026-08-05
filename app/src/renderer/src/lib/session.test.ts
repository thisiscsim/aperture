import { describe, expect, it } from "vitest";
import { DEFAULT_COMPOSER_SETTINGS } from "./composer";
import {
  appendAssistantItem,
  appendAssistantTurn,
  appendUserTurn,
  buildRunArgs,
  completeAssistantTurn,
  emptySession,
  markCritiqueApplied,
  toSessionSettings,
  upsertAssistantStatus,
} from "./session";

const settings = toSessionSettings(DEFAULT_COMPOSER_SETTINGS);

describe("session turn builders", () => {
  it("appends user and assistant turns immutably", () => {
    const s0 = emptySession();
    const s1 = appendUserTurn(s0, { text: "make it dreamy", settings });
    const s2 = appendAssistantTurn(s1, "generation");
    expect(s0.turns).toHaveLength(0);
    expect(s1.turns).toHaveLength(1);
    expect(s2.turns).toHaveLength(2);
    const assistant = s2.turns[1];
    expect(assistant.role === "assistant" && assistant.pending).toBe(true);
  });

  it("streams status items by replacing the trailing status, keeping other items", () => {
    let s = appendAssistantTurn(emptySession(), "generation");
    s = appendAssistantItem(s, { type: "text", text: "I'll create the cut." });
    s = upsertAssistantStatus(s, { type: "status", icon: "thinking", label: "assembling baseline" });
    s = upsertAssistantStatus(s, { type: "status", icon: "thinking", label: "editing with gpt-5.5" });
    const turn = s.turns[0];
    if (turn.role !== "assistant") throw new Error("expected assistant turn");
    expect(turn.items).toHaveLength(2);
    expect(turn.items[1]).toMatchObject({ type: "status", label: "editing with gpt-5.5" });
  });

  it("completeAssistantTurn clears pending and records errors as a status item", () => {
    let s = appendAssistantTurn(emptySession(), "critique");
    s = completeAssistantTurn(s, "model timed out");
    const turn = s.turns[0];
    if (turn.role !== "assistant") throw new Error("expected assistant turn");
    expect(turn.pending).toBe(false);
    expect(turn.items.at(-1)).toMatchObject({ type: "status", icon: "error", label: "model timed out" });
  });

  it("item helpers no-op when the log does not end on an assistant turn", () => {
    const s = appendUserTurn(emptySession(), { text: "hi", settings });
    expect(appendAssistantItem(s, { type: "text", text: "x" })).toBe(s);
    expect(completeAssistantTurn(s)).toBe(s);
  });

  it("markCritiqueApplied flips the card in place and no-ops on wrong targets", () => {
    let s = appendAssistantTurn(emptySession(), "critique");
    s = appendAssistantItem(s, {
      type: "critique-card",
      score: 62,
      verdict: "",
      subscores: [],
      fixes: ["add music"],
      applied: false,
    });
    const applied = markCritiqueApplied(s, 0, 0);
    const turn = applied.turns[0];
    if (turn.role !== "assistant" || turn.items[0].type !== "critique-card") {
      throw new Error("expected critique card");
    }
    expect(turn.items[0].applied).toBe(true);
    // Wrong indices leave the session untouched.
    expect(markCritiqueApplied(s, 5, 0)).toBe(s);
    expect(markCritiqueApplied(s, 0, 9)).toBe(s);
  });
});

describe("buildRunArgs", () => {
  it("maps composer settings and trims notes", () => {
    expect(buildRunArgs(DEFAULT_COMPOSER_SETTINGS, { notes: "  tighter hook  ", adjust: true })).toEqual({
      notes: "tighter hook",
      durationSec: 12,
      effort: "high",
      fastMode: false,
      referenceMode: "literal",
      adjust: true,
    });
  });

  it("omits empty notes and non-adjust runs", () => {
    const args = buildRunArgs(DEFAULT_COMPOSER_SETTINGS);
    expect(args.notes).toBeUndefined();
    expect(args.adjust).toBeUndefined();
  });
});
