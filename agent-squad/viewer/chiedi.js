// The 💬 buttons of the flow and history pages. A question about something on the page goes,
// through a squadra:// link (chiedi.ps1, registered by /squadra collega), to the prompt box of the
// session that did the work when it is open; otherwise a menu offers to resume it or to pick an
// open one. The text is copied to the clipboard too, for when the link is not registered.
(() => {
  const base = document.currentScript.src.replace(/[^/]*$/, '')
  // Linked only when a session says so: an older agent-squad writing vive.js does not.
  let live = [], linked = false
  window.__VIVE = (list, isLinked) => { live = list; linked = isLinked === true }
  const poll = () => { const s = document.createElement('script'); s.src = base + 'vive.js?' + Date.now(); s.onload = s.onerror = () => s.remove(); document.head.appendChild(s) }
  setInterval(poll, 5000); poll()

  const css = document.createElement('style')
  css.textContent = `
.ask { background: none; border: 1px solid transparent; border-radius: 6px; cursor: pointer; padding: 0 4px; font-size: 13px; opacity: .55; color: inherit; }
.ask:hover, .ask:focus-visible { opacity: 1; border-color: var(--line); }
.ask-menu { position: fixed; z-index: 50; min-width: 260px; max-width: 420px; background: var(--panel); border: 1px solid var(--line); border-radius: 8px; box-shadow: 0 8px 24px #0008; padding: 4px; font-size: 12px; }
.ask-menu .h { color: var(--dim); padding: 6px 8px 4px; }
.ask-menu button { display: block; width: 100%; text-align: left; background: none; border: 0; border-radius: 6px; color: var(--text); padding: 6px 8px; cursor: pointer; font: inherit; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ask-menu button:hover, .ask-menu button:focus-visible { background: #21262d; }
.ask-toast { position: fixed; bottom: 16px; left: 50%; transform: translateX(-50%); z-index: 60; background: var(--panel); border: 1px solid var(--line); border-radius: 8px; padding: 8px 14px; }`
  document.head.appendChild(css)

  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
  const name = p => String(p).replace(/\\/g, '/').split('/').filter(Boolean).pop() || p
  let menu = null
  const close = () => { menu?.remove(); menu = null }
  document.addEventListener('click', ev => { if (menu && !menu.contains(ev.target)) close() })
  document.addEventListener('keydown', ev => { if (ev.key === 'Escape') close() })

  function toast(text) {
    const t = document.createElement('div'); t.className = 'ask-toast'; t.textContent = text
    document.body.appendChild(t); setTimeout(() => t.remove(), 6000)
  }
  function send(verb, q, text) {
    close()
    location.href = `squadra://${verb}?` + Object.entries({ ...q, text }).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&')
    toast(verb === 'riprendi' ? '↻ Riapro la sessione in un nuovo terminale, la domanda sarà nel prompt' : '💬 Domanda inviata al prompt del terminale (anche negli appunti)')
  }

  // owner: the session the thing on the page belongs to, { id, project }.
  window.chiedi = (ev, text, owner) => {
    ev.preventDefault(); ev.stopPropagation()
    text = text.slice(0, 1500)
    navigator.clipboard?.writeText(text).catch(() => {})
    if (!linked) return toast('📋 Domanda copiata: incollala nel terminale. Per mandarla lì con un clic, lancia una volta /squadra collega in Claude Code')
    if (live.some(b => b.id === owner.id)) return send('chiedi', { to: owner.id }, text)
    close()
    menu = document.createElement('div'); menu.className = 'ask-menu'
    menu.innerHTML = `<div class="h">Questa sessione è chiusa. Dove mando la domanda?</div>
      <button data-i="-1">↻ Riprendi questa sessione <span style="color:var(--dim)">(nuovo terminale, ricorda tutto)</span></button>
      ${live.length ? '<div class="h">Sessioni aperte</div>' : ''}
      ${live.map((b, i) => `<button data-i="${i}" title="${esc(b.project)}">→ <b>${esc(name(b.project))}</b> <span style="color:var(--dim)">${esc(b.prompt || '')}</span></button>`).join('')}`
    menu.onclick = e => {
      const i = e.target.closest('button')?.dataset.i; if (i == null) return
      e.stopPropagation()
      if (i === '-1') send('riprendi', { to: owner.id }, text)
      else send('chiedi', { to: live[+i].id }, text)
    }
    document.body.appendChild(menu)
    const r = ev.target.getBoundingClientRect()
    menu.style.left = Math.max(8, Math.min(r.left, innerWidth - menu.offsetWidth - 8)) + 'px'
    menu.style.top = (r.bottom + menu.offsetHeight + 8 > innerHeight ? r.top - menu.offsetHeight - 4 : r.bottom + 4) + 'px'
    menu.querySelector('button').focus()
  }
})()
