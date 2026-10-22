# claude-code-mods

A growing collection of mods for [Claude Code](https://claude.com/claude-code).

| Mod | What it does |
|-----|--------------|
| **agent-squad** | Side pane listing the agents at work: nickname, icon, role, status and current activity. `/squadra flusso` (or a click on an agent) opens a live map in the browser: call graph, timeline, files touched and crucial files. `/squadra storico` lists past sessions and the files each one changed. A 💬 button on sessions, files and calls puts a question about them in the prompt of the session that did the work (`/squadra collega` registers the `squadra://` link once). Windows only for now |
| **token-bar** | Bar above the prompt showing account usage (5h and 7-day limits), context, cost, model, effort and login token expiry (🔑, read from `.credentials.json`; absent on macOS, where credentials live in the Keychain) |

The in-app labels are in Italian.

## Install

Inside Claude Code:

```
/plugin marketplace add Lerma4/claude-code-mods
/plugin install agent-squad@claude-code-mods
/plugin install token-bar@claude-code-mods
```

Then restart Claude Code.

## Update

```
/plugin marketplace update claude-code-mods
```

Or enable auto-update for this marketplace from the `/plugin` menu.

## agent-squad: setup and use

The pane works as soon as the plugin is installed. The browser pages and the 💬 buttons need Windows (for now).

1. **Install and restart** Claude Code (see above). The squad pane opens by itself; `/squadra` opens it again.
2. **Open the flow map**: `/squadra flusso`, the 🗺 Flusso button in the pane, or a click on an agent's name. It opens in your default browser and updates live.
3. **Open the history**: `/squadra storico`, or the 📚 Storico link in the flow page.
4. **Optional, once: link the 💬 buttons to the terminal** with `/squadra collega`.
   - Without it, 💬 copies a ready-made question to the clipboard and you paste it in the terminal.
   - With it, 💬 writes the question straight into the prompt of the session that did the work. If that session is closed, a menu lets you resume it in a new terminal (`claude --resume`) or pick another open session.
   - The first click, the browser asks whether to open the `squadra` link: allow it (tick "always allow" to skip the question next time).
   - The question is never sent on its own: you finish it and press Enter.

| Command | What it does |
|---|---|
| `/squadra` | Opens the pane |
| `/squadra flusso [name]` | Flow map of the session, or of one agent and its subagents |
| `/squadra storico` | Past sessions, the files each one changed, search by file, project or request |
| `/squadra collega` | Registers the `squadra://` link for your Windows user (no admin rights) |
| `/squadra scollega` | Removes it |
| `/squadra pulisci` | Clears finished agents from the pane |
| `/squadra tombola [name]` | New random nicknames |

**Settings** (`/plugin` → agent-squad → configure): `keepSessions`, how many recent sessions keep their full flow map (default 20). Older ones keep only the list of files they changed.

**What it writes on your machine**
- `%USERPROFILE%\.claude\agent-flow\`: the pages, one folder per recent session, the history data. Delete it any time; it is rebuilt.
- With `/squadra collega` only: the key `HKCU\Software\Classes\squadra`, which runs `agent-flow\chiedi.ps1` on a `squadra://` link. That script takes only a known session id from the link and puts text in that session's prompt box; `/squadra scollega` removes the key.

**Troubleshooting**
- *💬 only copies to the clipboard*: run `/squadra collega`, then reload the page.
- *Nothing happens on 💬 after linking*: the browser may have blocked the link; click again and allow it.
- *The page says "ultimo aggiornamento …" instead of "live"*: that session is closed or idle; the page shows what it recorded.
