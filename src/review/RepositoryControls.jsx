import { useState } from "react";
import { useRouter } from "next/navigation";
import Modal from "./Modal.jsx";
import { pullsUrl } from "../routes.js";

export default function RepositoryControls({ workspace, showTrack }) {
  const router = useRouter();
  const [dialog, setDialog] = useState(null);
  const [repository, setRepository] = useState(workspace.activeRepository ?? "");
  const [number, setNumber] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  async function submit(action, selected) {
    if (busy) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/workspace", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, repository: selected.trim(), ...(action === "track" ? { number: Number(number.replace(/^#/, "")) } : {}) }) });
      if (!response.headers.get("content-type")?.includes("application/json")) {
        throw new Error("Repository service unavailable. Please try again.");
      }
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || "Could not update the workspace");
      }
      setDialog(null);
      setNumber("");
      router.push(pullsUrl(result.activeRepository));
      router.refresh();
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusy(false);
    }
  }
  return <div className="repository-controls">
    <label><span className="stack-sr-only">Active repository</span><select aria-label="Active repository" disabled={busy} value={workspace.activeRepository ?? ""} onChange={(event) => {
      if (event.target.value === "add") {
        setRepository(""); setDialog("register"); setError(null);
      } else {
        submit("select", event.target.value);
      }
    }}>
      {!workspace.activeRepository && <option value="" disabled>Select a repository</option>}
      {workspace.repositories.map((repo) => <option key={repo} value={repo}>{repo}</option>)}
      <option value="add">＋ Add repository…</option>
    </select></label>
    {showTrack && <button className="top-review-button" type="button" disabled={busy} onClick={() => { setRepository(workspace.activeRepository ?? ""); setDialog("track"); setError(null); }}>＋ Track PR</button>}
    {busy && <span role="status" className="review-muted">{dialog === "track" ? "Tracking PR and stack…" : "Selecting repository…"}</span>}
    {error && !dialog && <span className="pr-refresh-error" role="alert">{error}</span>}
    {dialog && <Modal hideCloseButton title={dialog === "track" ? "Track a pull request" : "Add repository"} onClose={() => { if (!busy) { setDialog(null); } }}>
      <form className="repository-form" onSubmit={(event) => { event.preventDefault(); submit(dialog, repository); }}>
        <label>Repository<input autoFocus={dialog === "register"} required pattern="[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+" placeholder="OWNER/REPO" value={repository} disabled={busy} onChange={(event) => setRepository(event.target.value)} /></label>
        {dialog === "track" && <label>PR number<input autoFocus required inputMode="numeric" pattern="#?[0-9]+" placeholder="123" value={number} disabled={busy} onChange={(event) => setNumber(event.target.value)} /></label>}
        <p className="review-muted">{dialog === "track" ? "Imports this PR and its GitHub stack into the selected repository." : "Select a GitHub repository, then track PRs by number."}</p>
        {error && <p role="alert" className="pr-refresh-error">{error}</p>}
        <div className="pr-confirm-actions"><button className="pr-pin" type="button" disabled={busy} onClick={() => setDialog(null)}>Cancel <kbd>⎋</kbd></button><button className="top-review-button" type="submit" disabled={busy}>{busy ? "Working…" : dialog === "track" ? "Track PR" : "Add repository"} <kbd>↵</kbd></button></div>
      </form>
    </Modal>}
  </div>;
}
