import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

export function createTourStore(root) {
  const queues = new Map();
  function file(key, name) {
    if (!/^[a-f0-9]{64}\/[1-9]\d*\/[a-f0-9]{64}$/.test(key)) {
      throw new Error("Invalid tour key");
    }
    return path.join(root, key, name);
  }
  async function read(key) {
    try {
      return JSON.parse(await readFile(file(key, "tour.json"), "utf8"));
    } catch (error) {
      if (error.code !== "ENOENT") {
        throw error;
      }
      return { status: "idle", tour: null, error: null };
    }
  }
  async function write(destination, value) {
    await mkdir(path.dirname(destination), { recursive: true });
    const temporary = `${destination}.${randomUUID()}.tmp`;
    await writeFile(temporary, JSON.stringify(value), { mode: 0o600 });
    await rename(temporary, destination);
  }
  async function update(key, transform) {
    const pending = (queues.get(key) ?? Promise.resolve()).catch(() => {}).then(async () => {
      const state = await transform(await read(key));
      await write(file(key, "tour.json"), state);
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
  async function context(key, input) {
    const destination = file(key, "context.json");
    await write(destination, input);
    return destination;
  }
  return { read, update, context };
}
