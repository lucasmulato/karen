# Notes UI — research references

Evaluated 2026-11-19. All projects below are MIT-licensed and were checked for
recent activity. KAREN's notes UI is integrated into the existing app; these
are references only, not dependencies or second deployments.

## Integrated into KAREN

- [@uiw/react-md-editor](https://github.com/uiwjs/react-md-editor) — MIT,
  2.9k stars, active Nov 2026. Markdown editor used by the Notes panel.
- [react-markdown](https://github.com/remarkjs/react-markdown) — MIT, 15.9k
  stars. Used indirectly by the editor's preview.
- [@json-canvas-viewer/react](https://github.com/hesprs/json-canvas-viewer) —
  MIT, active Oct 2026. Renders exported `.canvas` files in the Canvas tab.
- [obsidianmd/jsoncanvas](https://github.com/obsidianmd/jsoncanvas) — MIT, the
  open JSON Canvas 1.0 format we export/import.

## Inspiration only (not installed)

- [xnohat/webobsidian](https://github.com/xnohat/webobsidian) — MIT. A
  self-hosted Obsidian-compatible web app over a plain markdown folder: folder
  tree + CodeMirror editor. Borrowed: file-tree layout over a real vault.
- [nodummd/nodum](https://github.com/nodummd/nodum) — MIT, active Nov 2026.
  Backlinks + GPU knowledge graph. Borrowed: the idea of surfacing link health
  in the Garden tab.
- [oleeskild/obsidian-digital-garden](https://github.com/oleeskild/obsidian-digital-garden)
  — MIT, 2.5k stars. Maturity states for notes. Borrowed: seedling → budding →
  evergreen vocabulary (see `api/prompts/notes.md`).
- [usememos/memos](https://github.com/usememos/memos) — MIT, 64.5k stars.
  Quick-capture timeline; good reference for a future fast inbox.
- [KallerTobias/obsidian-web-vault](https://github.com/KallerTobias/obsidian-web-vault)
  — MIT. Live preview and passkey auth; useful security/UI reference.

## Deliberately not used

- A separate self-hosted notes app deployment: it would duplicate KAREN's
  auth, storage and UI. The vault is already exposed through KAREN's API.
- Non-free or license-unclear editors.
