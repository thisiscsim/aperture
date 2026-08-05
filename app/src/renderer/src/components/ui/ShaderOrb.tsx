import orbCritique from "../../assets/orbs/orb-critique.png";
import orbGeneration from "../../assets/orbs/orb-generation.png";

/**
 * The agent-presence orb from the Figma spec — a gradient sphere identifying
 * which tool is speaking (blue = generation, rose = critique). Static export
 * of the shader asset; `spinning` adds a slow rotation for in-progress states.
 */
export function ShaderOrb({
  type = "generation",
  size = 16,
  spinning = false,
}: {
  type?: "generation" | "critique";
  size?: number;
  spinning?: boolean;
}): JSX.Element {
  const cls = spinning ? "ui-orb ui-orb--spinning" : "ui-orb";
  return (
    <span className={cls} style={{ width: size, height: size }} aria-hidden>
      <img src={type === "critique" ? orbCritique : orbGeneration} alt="" />
    </span>
  );
}
