# PRView

PRView is a Next.js application powered by React and Bun.

## Development

Open this repository in the included devcontainer. Dependencies are installed automatically and the development server runs on port `9999`.

```sh
bun run dev
```

The app uses the Next.js App Router with `/`, `/pull-requests`, and `/pull-requests/:number` routes.

## Syncing pull requests

The devcontainer includes Python, uv, and the GitHub CLI. Authenticate `gh`, then sync the open pull requests for a repository into PRView's local artifact format:

```sh
gh auth login
uv run ./pr sync OWNER/REPO
```

By default, the command writes `artifacts/prs.json` plus `details.json` and `diff.json` under `artifacts/pr/<number>/`. Use `--output` to choose another directory and `--limit` to change the default limit of 100 open pull requests.
