import { useEffect, useRef, useState } from "react";
import type { Workbench } from "./useWorkbench";
import { recordPresentationVideo } from "./presentationVideo";

export function PresentationExports({
  w,
  onBusy,
}: {
  w: Workbench;
  onBusy: (busy: boolean) => void;
}) {
  const [busy, setBusy] = useState(false),
    [progress, setProgress] = useState<number | null>(null),
    [status, setStatus] = useState("");
  const [duration, setDuration] = useState(6),
    [mode, setMode] = useState<"bubble" | "pipeline">("bubble");
  const [preview, setPreview] = useState("");
  const captureCanvas = useRef<HTMLCanvasElement>(null);
  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview);
    },
    [preview],
  );
  useEffect(() => {
    setPreview("");
    setStatus("");
  }, [w.run?.id, w.bubbleSource]);
  const execute = async (video: boolean) => {
    if (!w.run) return;
    setBusy(true);
    onBusy(true);
    setStatus("");
    setProgress(video ? 0 : null);
    try {
      const result = video
        ? await recordPresentationVideo(
            w,
            mode,
            duration,
            20,
            captureCanvas.current!,
            setProgress,
            (blob) => setPreview(URL.createObjectURL(blob)),
          )
        : await window.pam.exportReport(w.run.id, "run", {
            roi_radius_m: 0.002,
            histogram_bins: 100,
            peaks: w.peakSettings,
          });
      setStatus(result ? `Exported ${result.path}` : "Export cancelled");
      if (result) w.log(`Exported research presentation: ${result.path}`);
    } catch (e) {
      setStatus(String(e));
      w.log(String(e), "error");
    } finally {
      setBusy(false);
      onBusy(false);
      setProgress(null);
    }
  };
  return (
    <section className="presentation-exports">
      <h3>Research report and video</h3>
      <p>
        PDF includes actual scores, settings, plots, references and a companion
        provenance JSON. WebM uses saved numerical data and includes a SHA-256
        context file.
      </p>
      <div className="presentation-controls">
        <button
          disabled={busy || w.locked || !w.run}
          onClick={() => void execute(false)}
        >
          Export PDF report…
        </button>
        <label>
          Video
          <select
            aria-label="Presentation video content"
            disabled={busy}
            value={mode}
            onChange={(e) => setMode(e.target.value as "bubble" | "pipeline")}
          >
            <option value="bubble" disabled={!w.bubbleTrace}>
              Bubble + source curves
            </option>
            <option value="pipeline" disabled={!w.movie}>
              Wave / RF / final PAM
            </option>
          </select>
        </label>
        <label>
          Duration
          <select
            aria-label="Presentation video duration"
            disabled={busy}
            value={duration}
            onChange={(e) => setDuration(Number(e.target.value))}
          >
            {[2, 6, 10, 20].map((s) => (
              <option key={s} value={s}>
                {s} s
              </option>
            ))}
          </select>
        </label>
        <button
          disabled={
            busy ||
            w.locked ||
            !w.run ||
            (mode === "bubble" ? !w.bubbleTrace : !w.movie)
          }
          onClick={() => void execute(true)}
        >
          Export WebM video…
        </button>
      </div>
      <canvas
        ref={captureCanvas}
        hidden={progress === null}
        aria-label="Research video recording preview"
        style={{ width: "100%", maxHeight: 240, objectFit: "contain" }}
      />
      {progress !== null ? (
        <>
          <progress
            aria-label="Video recording progress"
            max={1}
            value={progress}
          />
          <p>Encoding saved numerical frames. Keep this export dialog open.</p>
        </>
      ) : null}
      {status ? (
        <p role="status" className="presentation-status">
          {status}
        </p>
      ) : null}
      {preview ? (
        <details>
          <summary>Preview generated video</summary>
          <video
            controls
            src={preview}
            aria-label="Generated research video"
            style={{ width: "100%", maxHeight: 260 }}
          />
        </details>
      ) : null}
    </section>
  );
}
