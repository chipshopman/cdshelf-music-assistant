// Only change this document's presentation; never modify Home Assistant's DOM.
export function setupDisplayMode(doc = document, win = window) {
  const button = doc.getElementById('fullscreen');
  const standalone = doc.getElementById('open-standalone');
  const message = doc.getElementById('display-status');
  const embedded = win.self !== win.top;
  standalone.hidden = !embedded;
  // Keep the current Ingress path/session. No new server port or MA credentials.
  if (embedded) standalone.href = new URL('.', doc.baseURI).href;
  const supported = typeof doc.documentElement.requestFullscreen === 'function';
  button.disabled = !supported;
  if (!supported) button.title = 'Full screen is not supported by this browser. Open CD Shelf on its own instead.';
  const update = () => {
    const active = Boolean(doc.fullscreenElement);
    button.textContent = active ? 'Exit full screen' : 'Full screen';
    button.setAttribute('aria-pressed', String(active));
  };
  doc.addEventListener('fullscreenchange', update);
  button.onclick = async () => {
    if (!supported) return;
    button.disabled = true; message.hidden = true;
    try {
      if (doc.fullscreenElement) await doc.exitFullscreen();
      else await doc.documentElement.requestFullscreen({ navigationUI: 'hide' });
    } catch {
      message.textContent = embedded ? 'Full screen is blocked here. Choose Open on its own, then try Full screen in that tab.' : 'This browser could not enter full screen. Try opening CD Shelf in Chrome or use the browser’s full-screen control.';
      message.hidden = false;
    } finally { button.disabled = false; update(); }
  };
  update();
}
