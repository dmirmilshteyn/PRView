import { expect, test } from "bun:test";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createRepositorySyncService } from "../lib/repository-sync.js";
import { readPRSnapshot } from "../lib/pr-snapshot.js";

test("dashboard sync runs in the background, deduplicates and allows retry after failure", async () => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), 'prview-sync-'));
  try {
    await mkdir(path.join(cwd, 'artifacts'));
    await writeFile(path.join(cwd, 'artifacts/workspace.json'), JSON.stringify({ activeRepository: 'owner/repo', repositories: ['owner/repo'] }));
    let reject;
    let calls = 0;
    const service = createRepositorySyncService(cwd, async () => { calls += 1; return new Promise((resolve, fail) => { reject = fail; }); });
    expect(service.start('OWNER/repo').status).toBe('running');
    service.start('owner/repo');
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(calls).toBe(1);
    reject(new Error('PR 2 failed'));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(service.read('owner/repo')).toMatchObject({ status: 'error', error: 'PR 2 failed' });
    expect(service.start('owner/repo').status).toBe('running');
    expect(() => service.start('other/repo')).toThrow('Add the repository');
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("readers never mix compatibility files with a published snapshot", async () => {
  const folder = await mkdtemp(path.join(os.tmpdir(), 'prview-snapshot-'));
  try {
    const snapshot = { details: { revision: 'old' }, diff: { files: ['old'] } };
    await writeFile(path.join(folder, 'snapshot.json'), JSON.stringify(snapshot));
    await writeFile(path.join(folder, 'details.json'), JSON.stringify({ revision: 'new' }));
    await writeFile(path.join(folder, 'diff.json'), JSON.stringify({ files: ['new'] }));
    expect(readPRSnapshot(folder)).toEqual(snapshot);
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});
