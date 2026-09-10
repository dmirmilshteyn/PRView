import { spawn } from "node:child_process";

export function runGitHubAPI(method, endpoint, payload) {
  return new Promise((resolve, reject) => {
    const args = ["api", "--method", method, endpoint];
    if (payload !== null) {
      args.push("--input", "-");
    }
    const child = spawn("gh", args, { stdio: ["pipe", "pipe", "pipe"] });
    let output = "";
    let errors = "";
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; child.kill("SIGKILL"); }, 30000);
    child.stdout.on("data", (chunk) => { output += chunk; });
    child.stderr.on("data", (chunk) => { errors = (errors + chunk).slice(-4000); });
    child.stdin.on("error", () => {});
    child.on("error", () => { clearTimeout(timer); reject(new Error("Could not start gh. Check the devcontainer installation.")); });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (timedOut) {
        reject(new Error("GitHub timed out. Please try again."));
        return;
      }
      if (code !== 0) {
        reject(new Error(errors.trim() || "GitHub request failed"));
        return;
      }
      try {
        const result = JSON.parse(output);
        if (result.errors?.length) {
          throw new Error(result.errors.map((error) => error.message).join("; "));
        }
        resolve(result);
      } catch (error) {
        reject(error);
      }
    });
    child.stdin.end(payload === null ? undefined : JSON.stringify(payload));
  });
}
