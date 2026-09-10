# PRView

PRView is a local PR review workspace built with Next.js, React and Bun. Importing a PR is read-only. Explicit final review actions submit reviews and their comments to GitHub through the authenticated `gh` CLI; the auto-merge control also updates GitHub.

## Development

Open this repository in the included devcontainer. Dependencies are installed automatically and the development server runs on port `9999`.

The image includes Bun, Python, uv and the GitHub CLI. To rebuild and restart the same development image with Docker Compose, first run `sh .devcontainer/prepare-gh-auth.sh` on the host, then `docker compose up -d --build` from the checkout. Run project commands inside the container (`docker compose exec prview …`) or a devcontainer terminal.

```sh
bun run dev
```

The app uses the Next.js App Router with `/`, `/pull-requests`, and `/pull-requests/:number` routes.

## Syncing pull requests

The devcontainer reuses the host's GitHub login. Authenticate `gh` on the host first. The devcontainer initialization exports the Keychain-backed token to `.devcontainer/gh-auth/hosts.yml` (owner-only permissions), excluded from Git and Docker build context, and mounts the directory read-only at `/run/gh-auth`. For Docker Compose, run the preparation script above explicitly. Rerun it after rotating the host token; the mounted directory makes the updated file available without rebuilding.

Run the CLI from the repository root inside the devcontainer:

```sh
# Show available commands and sync options
uv run ./pr --help
uv run ./pr sync --help

# Sync one PR (automatically includes its entire native GitHub stack)
uv run ./pr sync dmirmilshteyn/PRView 23

# Repository URLs are also accepted
uv run ./pr sync https://github.com/dmirmilshteyn/PRView 23

# Sync all open PRs and their native stacks
uv run ./pr sync dmirmilshteyn/PRView --all

# Limit the initial selection to 10 open PRs, including all their stack members
uv run ./pr sync dmirmilshteyn/PRView --all --limit 10

# Write to a separate directory
uv run ./pr sync dmirmilshteyn/PRView 23 --output /tmp/prview-artifacts
```

To invoke the CLI from the host through the running Compose container:

```sh
docker compose exec prview uv run ./pr sync dmirmilshteyn/PRView 23
docker compose exec prview uv run ./pr sync dmirmilshteyn/PRView --all
```

Supply either a positive PR number or `--all`, never both. `--limit` accepts a positive number and requires `--all`; there is no default limit. Stack membership comes only from native GitHub metadata, and every member is included, even closed or merged PRs. PRs without that metadata sync individually.

By default, the command writes `artifacts/prs.json` plus `details.json` and `diff.json` under `artifacts/pr/<number>/`. A targeted sync preserves other imported PRs from the same repository. `--all` refreshes the dashboard list. `--output` changes the destination for that invocation; it does not change the app's artifact directory.

Sync includes the complete Markdown description, review requests and decisions, checks with detail links, issue discussion, and inline GitHub threads with replies and resolution state. It also fetches changed files at the diff's merge base and head commit for expanded context and full-file viewing. Binary, oversized and unavailable files retain an explicit context-unavailable message. A PR changing during import causes sync to fail so it can be retried consistently.

## Local review

- Click **Refresh** beside Pin in the PR header to sync the latest GitHub comments, discussions, review decisions, and CI results. It runs the targeted CLI sync, including native stack members and updated code, then updates the page. Saved review notes and chat sessions are preserved.
- Below Info, switch between **Code** and **Tour**. Opening Tour asks Luna to build a guided review route: before/after behavior, component interactions, prioritized stops with source excerpts, specific review questions, test scenarios, and explicit coverage gaps. The tour is one continuous page. The left sidebar replaces file search with section links, highlights the section as you scroll, and lets you jump directly to any stop. **Open in Code** jumps to the cited snapshot and lines; returning to Tour resumes your section. Generation continues while you read Code, and a loading screen shows its progress.
- Tours are saved under `.pr-tours/<repository-hash>/<number>/<snapshot-fingerprint>/` with their model, generation time, session ID, validated references, and immutable input snapshot. Reopening a completed tour reuses it without calling Codex. Code/base changes select a new tour; GitHub status refreshes alone do not. Failed or interrupted generation can be retried. Tours use a separate Luna session from the sidebar chat, omit CI/reviewer status, never execute PR code, and do not mark files reviewed. The browser remembers your position in each tour.
- Every tour section is collapsible. Luna separates behavior-preserving prop plumbing, repetitive wiring, formatting, and similar edits into **Mechanical changes**, collapsed by default. Behavioral sections start expanded, and selecting any section in the sidebar expands it and scrolls there. Tour format updates generate a fresh cached tour on the next visit while retaining older saved versions.
- Mark individual tour sections **Reviewed** in their headers, even while collapsed. The sidebar shows completed sections with a green check and the tour displays a reviewed count. These flags save with the tour snapshot and survive reloads; uncheck a section to review it again. Tour progress is separate from file review flags and GitHub approvals.
- PRs use one page with Info above Code. Native GitHub stacks appear below the PR title and above Info, with the topmost PR first and the trunk at the bottom. Click a member to switch PRs. Approval and CI each have a check: green for at least one synced approval or successful CI, grey otherwise. Hover for the status; absent checks never count as passing. Branch relationships alone never create a stack. Unsynced or merged members without local artifacts link to GitHub instead.
- Pin a PR from its card or detail page to move it into the Pinned section on the dashboard and pull request list. Pins persist alongside review data; unpinning returns a PR to its regular group.
- Use Review chat on the right edge to talk to Luna about the PR. The sidebar starts expanded and can be collapsed to its icon button. Messages and the Codex session ID are saved per repository/PR under `.pr-chats/`; follow-ups resume that exact session, including after reloads. Codex session files persist in the `prview-codex-data` Docker volume, with host authentication mounted read-only. Chat runs `gpt-5.6-luna` in a read-only sandbox and receives the PR metadata, diff, and review notes. The current CLI uses its legacy Landlock sandbox because Docker blocks bubblewrap user namespaces; this deprecated option will need revisiting on a future CLI upgrade. Only one response runs per PR at a time. Interrupted turns retain the session and show an error so another message can continue it.
- Hover a line number to reveal **+**, or click the old/new line number, to open a comment box directly below that line. Drag across line numbers, or click the first and Shift-click the last on the same side, to select a range in either direction. The selected code is highlighted and the composer appears below the range. Saved comments and replies stay inline in unified, split and full-file views, with local drafts, Markdown, severity, resolution and reopening. Comments on hidden lines or older revisions remain accessible below the diff. File comments are also available.
- Drafts (including reply drafts), reviewed flags, diff preferences, expanded/full-file settings and reading position save automatically. The status indicator confirms when they are on disk; a failed save can be retried. Wait for “Saved locally” before closing the page.
- Finish a review below the changed files with Comment, Request changes, or Approve. A preview shows the action, summary, and exact saved file/line comments before confirmation. If that feedback changes before confirmation, the submission is rejected so you can preview it again. The summary and action then save locally and submit to GitHub as one review with saved, unresolved comments that have not been submitted previously. Replies on those local notes are included in their thread text. Unsaved comment drafts and pending chat context are not submitted. File comments become file-level GitHub threads; line comments retain their side and range. The current head/base must match the reviewed snapshot, and earlier or incremental-comparison anchors must be re-anchored or resolved before submission.
- Failed GitHub submissions keep the local review and can be retried, including after reload. Hidden identifiers in review/comment bodies allow retries to reconcile previously accepted requests without duplicating them. **Return to draft** removes only this submission's pending GitHub review and restores its summary for correction; already submitted reviews are preserved. After GitHub accepts an approval, PRView advances toward the next available PR in the stack and opens it at the top.
- “Next unreviewed file” (keyboard shortcut **N**, outside text inputs) navigates the visible file list. Filename search, unified/split view, ignore leading/trailing whitespace, expandable context and full old/new files are available.
- “Changes since last review” defaults to your latest submitted review, excluding failed or cancelled submissions. It highlights changed files, lists newly imported commits, and offers a focused diff or a GitHub comparison link. Without a submitted review, marking the first file reviewed sets a baseline; you can also select one explicitly. Missing snapshots or file contents are shown as unavailable. Commit history is captured on Refresh. Changed files lose their checked state; unchanged files remain checked.
- Merge readiness lists PR state, conflicts, CI, approvals, outstanding review requests, unresolved threads, and GitHub’s aggregate merge requirements. It uses existing cached status and saved artifacts without additional polling. Approvals and threads are labeled as saved snapshots and update through the main Refresh button; unknown status never appears as passed. Optional checks or reviewer requests can need attention without blocking GitHub’s merge rules.
- GitHub file and line threads in PR discussion support **Reply**, **Resolve thread**, and **Unresolve**. Replies post directly into the original GitHub thread; Ctrl/Cmd+Enter submits the reply. Failed requests preserve the composer, and retrying the same reply checks GitHub for a previously accepted post. Resolution verifies the thread’s PR and GitHub permissions. Successful actions update the visible discussion and readiness checklist; the main Refresh imports the latest shared discussion. These actions add no background polling.
- Notes keep their original snapshot, side, line range and code excerpt. Earlier snapshots can be opened from the snapshot selector or an anchored note. Notes on files no longer in the diff remain accessible below the file list. Older drafts remain available when selecting their snapshot.

Imported snapshots live in `artifacts/history/OWNER/REPO/NUMBER/COMMIT.json`. Personal review data lives separately in `.local-reviews/<repository-hash>/<number>.json`; both directories are ignored by Git. Sync never writes `.local-reviews`. Back up that directory to retain your work. Local updates use serialized, atomic file replacement within the single running app server. There is no user authentication or shared multi-server storage.

The active dashboard displays one imported repository at a time. Local review state and historical snapshots are isolated by repository and PR number. Existing artifacts without commit/content data still display their imported patches; sync again for full context, and capture at least two revisions to compare changes over time. Legacy file comments in `artifacts/comments.json` are preserved and displayed separately because they did not record a repository or commit.

Use **Restart** in the PR chat header to start a fresh conversation. It archives the old transcript under `.pr-chats/history/<repository-hash>/<PR>/<restart-id>.json`, clears the active session, and preserves your unsent message and attachments. Restart is disabled while Luna is responding; interrupted sessions can be restarted. The next message starts a new session with the current PR context.

The PR sidebar switches between **Chat** and **Threads**. Threads lists unresolved GitHub file/line discussions, including outdated ones, with reply and resolve actions. It shares the imported discussion and adds no polling. Adding code to chat switches back to Chat while retaining the draft. The top-right **Review** button opens the same saved review draft and GitHub submission preview as the bottom review form, with Comment, Request changes, and Approve choices inside the dialog.

Press **M** in Code or Tour to mark the current file/section reviewed, collapse it, and advance to the next unreviewed item (wrapping if needed). Tour advancement waits for the save to succeed. **[** and **]** move to the previous/next available open PR in the stack, starting at the top. Shortcuts pause in editors and dialogs. Every dashboard group, including Pinned, has independent search, author, label, CI and conflict filters using saved data only.

## Verification

Run inside the devcontainer:

```sh
bun run test
python3 -m unittest discover -s tests -v
bun run build
```

For a deterministic browser fixture without GitHub access, run `python3 -m tests.create_demo artifacts`, then open `/pull-requests/900001`. This adds a clearly labeled local demo PR and two commit snapshots while preserving existing PRs. It contains a full description, discussions, detailed checks, whitespace-only changes and a changed file between revisions.

Inline comment composers and saved code threads have a **Send to chat** button. Collect code ranges with or without comments as attachments, inspect or remove them in the chat composer, then add a question and send the batch to Luna. Draft comments sent this way are not saved as PR comments. Sent attachments retain their code excerpts, before/after side, and revision in the conversation history. Unsent messages and attachments persist in browser local storage per repository and PR, including across reloads and PR switches. Successful sends clear only the submitted draft/context, and retry identifiers survive reloads to avoid duplicate messages.

Press **?** on a PR page for keyboard help. **C + G** copies its GitHub link; **E + A** opens self-assignment; **E + R** opens the restricted reviewer picker. Shortcuts are ignored while typing or inside another dialog.

Individual PR pages load live open/closed/merged state, merge conflicts, and outstanding review requests. Visible, online PR pages check at most once a minute; hidden/offline pages pause and dashboards never poll. Server caches and shared in-flight requests prevent duplicate GitHub calls across tabs. Conditional ETags reuse unchanged results, completed CI is not fetched repeatedly, closed/merged PRs back off to five minutes, and errors/rate limits extend the retry interval. Code snapshots stay unchanged until a full Refresh.

Stacks show personal review progress for each imported PR: reviewed at the current snapshot, needs re-review, in progress, or unreviewed. Previous/next navigation follows base-to-tip review order and opens at the top. A local completed review or a successfully submitted GitHub review counts as reviewed; pending, failed, or cancelled submissions do not.

Tour code excerpts support inline comments: click a line number, or drag/Shift-click to select a range. Tour and Code share saved comments, replies, resolution, drafts, and chat attachments. Threads appear on matching revision/side excerpts, including ranges that overlap an excerpt.
