import { spawn } from "node:child_process";
import { createInterface } from "node:readline";

export async function runCodex({ sessionId, prompt, cwd, onEvent }) {
  // Docker blocks the user namespaces needed by bubblewrap. Landlock keeps
  // filesystem writes and command network access restricted without them.
  const args = ["exec", "--ignore-user-config", "--enable", "use_legacy_landlock", "-c", 'sandbox_mode="read-only"', "-c", 'approval_policy="never"'];
  if (sessionId) {
    args.push("resume", sessionId);
  }
  args.push("--model", "gpt-5.6-luna", "--json", "--skip-git-repo-check", "-");
  const child = spawn("codex", args, { cwd, stdio: ["pipe", "pipe", "pipe"], detached: true });
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    if (child.pid) {
      try {
        process.kill(-child.pid, "SIGKILL");
      } catch {}
    }
  }, 10 * 60 * 1000);
  const result = new Promise((resolve) => {
    child.once("error", (error) => resolve({ error }));
    child.once("close", (code) => resolve({ code }));
  });
  child.stderr.resume();
  child.stdin.on("error", () => {});
  child.stdin.end(prompt);
  let failure;
  try {
    for await (const line of createInterface({ input: child.stdout })) {
      let event;
      try {
        event = JSON.parse(line);
      } catch {
        continue;
      }
      if (event.type === "turn.failed" || event.type === "error") {
        failure = event.error?.message || event.message || "Codex could not complete this turn.";
      }
      await onEvent(event);
    }
    const outcome = await result;
    if (timedOut) {
      throw new Error("The review agent timed out. Send another message to continue the session.");
    }
    if (outcome.error || outcome.code !== 0 || failure) {
      throw new Error(failure || (outcome.error ? "Could not start Codex. Check the devcontainer installation." : `Codex exited with code ${outcome.code}. Check Codex authentication in the devcontainer.`));
    }
  } finally {
    clearTimeout(timeout);
    if (child.pid && child.exitCode === null && child.signalCode === null) {
      try {
        process.kill(-child.pid, "SIGKILL");
      } catch {}
    }
  }
}
