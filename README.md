# claude-code-mods

Mod per Claude Code.

- **agent-squad**: pannello laterale con gli agenti al lavoro (nome, logo, ruolo, stato, attività corrente)
- **token-bar**: barra sopra il prompt con il consumo dell'account (5h, 7gg), contesto e costo

## Installazione

```
/plugin marketplace add Lerma4/claude-code-mods
/plugin install agent-squad@claude-code-mods
/plugin install token-bar@claude-code-mods
```

Riavvia Claude Code.

## Aggiornamenti

`/plugin marketplace update claude-code-mods`, oppure attiva l'auto-update del marketplace da `/plugin`.

Chi modifica una mod deve alzare `version` nel suo `.claude-plugin/plugin.json`, altrimenti l'aggiornamento non viene rilevato.
