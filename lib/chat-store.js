import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

export function chatKey(repository, number) {
  if (!/^[\w.-]+\/[\w.-]+$/.test(repository) || repository.split("/").some((part) => part === "." || part === "..") || !Number.isSafeInteger(number) || number < 1) {
    throw new Error("A repository and positive PR number are required");
  }
  return `${createHash("sha256").update(repository.toLowerCase()).digest("hex")}/${number}`;
}

export function createChatStore(root) {
  const queues = new Map();
  async function read(key) {
    try {
      return JSON.parse(await readFile(path.join(root, `${key}.json`), "utf8"));
    } catch (error) {
      if (error.code !== "ENOENT") {
        throw error;
      }
      return { sessionId: null, messages: [], status: "idle", error: null, contextRevision: null };
    }
  }
  async function update(key, transform) {
    const previous = queues.get(key) ?? Promise.resolve();
    const pending = previous.catch(() => {}).then(async () => {
      const state = await transform(await read(key));
      const destination = path.join(root, `${key}.json`);
      await mkdir(path.dirname(destination), { recursive: true });
      const temporary = `${destination}.${randomUUID()}.tmp`;
      await writeFile(temporary, JSON.stringify(state, null, 2) + "\n", { mode: 0o600 });
      await rename(temporary, destination);
      return state;
    });
    queues.set(key, pending);
    try {
      return await pending;
    } finally {
      if (queues.get(key) === pending) {
        queues.delete(key);
      }
    }
  }
  return { read, update };
}
