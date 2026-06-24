import { durationSeconds } from "@reel/edl";
import { useEditor } from "../store";

export function LeftPanel(): JSX.Element {
  const edl = useEditor((s) => s.edl);
  const promptText = useEditor((s) => s.promptText);

  if (!edl) return <aside className="panel left" />;

  const dur = durationSeconds(edl);

  return (
    <aside className="panel left">
      <div className="section">
        <div className="section-h">Project</div>
        <div className="kv">
          <span>Format</span>
          <span>
            {edl.format.width}&times;{edl.format.height}
          </span>
        </div>
        <div className="kv">
          <span>Frame rate</span>
          <span>{edl.format.fps} fps</span>
        </div>
        <div className="kv">
          <span>Duration</span>
          <span>{dur.toFixed(1)}s</span>
        </div>
      </div>

      <div className="section grow">
        <div className="section-h">Prompt</div>
        <p className="prompt">{promptText.trim() || "No prompt.md in this project."}</p>
      </div>

      <div className="section">
        <div className="section-h">Media</div>
        {edl.assets.length === 0 ? (
          <div className="dropzone">
            <div className="dropzone-title">No clips yet</div>
            <div className="dropzone-sub">Drop video into the project to begin.</div>
          </div>
        ) : (
          <ul className="asset-list">
            {edl.assets.map((a) => (
              <li key={a.id}>
                <span className={`asset-kind ${a.kind}`}>{a.kind}</span>
                <span className="asset-name">{a.src}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </aside>
  );
}
