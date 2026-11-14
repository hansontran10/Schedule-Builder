/** Styles live inside a shadow root, so the school's CSS can't break ours and ours can't leak out. */
export const STYLES = `
:host { all: initial; --brand: #1d1d1b; --on-brand: #fff; --accent: #2f6fdf; --on-accent: #fff; font-family: system-ui, -apple-system, "Segoe UI", sans-serif; color: #1d1d1b; }
* { box-sizing: border-box; }
.wrap { margin: 12px 0; padding-bottom: 80px; }
.toolbar { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-bottom: 10px; font-size: 14px;
  background: var(--brand); color: var(--on-brand); padding: 10px 14px; border-radius: 10px; border-bottom: 3px solid var(--accent); }
.toolbar button.ghost { color: var(--on-brand); border-color: var(--on-brand); }
.toolbar strong { font-size: 16px; }
.cards { display: grid; gap: 12px; }
.card { background: #fff; border: 1px solid #e4e2da; border-radius: 10px; overflow: hidden; }
.card-head { border-left: 4px solid var(--brand); display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 10px 14px; background: #fbfaf7; border-bottom: 1px solid #e4e2da; }
.code { font-weight: 700; font-size: 15px; }
.title { color: #6b6a64; margin-left: 8px; font-size: 14px; }
table { width: 100%; border-collapse: collapse; font-size: 14px; }
th { text-align: left; font-size: 12px; color: #6b6a64; font-weight: 600; padding: 6px 14px; }
td { padding: 8px 14px; border-top: 1px solid #efede6; vertical-align: top; }
.mono { font-family: ui-monospace, Consolas, monospace; }
.muted { color: #6b6a64; }
button { font: inherit; font-size: 13px; border: 1px solid var(--brand); background: var(--brand); color: var(--on-brand); border-radius: 6px; padding: 5px 12px; cursor: pointer; white-space: nowrap; }
button.ghost { background: transparent; color: #1d1d1b; border-color: #c9c4b6; }
button.added { background: #e6f4ec; color: #1f7a4d; border-color: #b9dcc8; cursor: default; }
button:focus-visible { outline: 2px solid #2f6fdf; outline-offset: 1px; }
.bar { position: fixed; right: 16px; bottom: 16px; z-index: 2147483000; display: flex; align-items: center; gap: 10px;
  background: var(--brand); color: var(--on-brand); border-bottom: 3px solid var(--accent); border-radius: 10px; padding: 10px 14px; font-size: 14px; box-shadow: 0 4px 16px rgb(0 0 0 / 0.25); max-width: 420px; }
.bar button { background: var(--accent); color: var(--on-accent); border-color: var(--accent); }
.pre { white-space: pre-line; }
.bar button.quiet { background: transparent; color: var(--on-brand); border-color: var(--on-brand); }
.bar .note { font-size: 13px; opacity: 0.9; }
`;
