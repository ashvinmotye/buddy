(() => {
  'use strict';
  const ENABLED = 'buddy-reminders-enabled';
  const TOKEN = 'buddy-reminders-device-token';
  const PENDING_DISABLE = 'buddy-reminders-disable-pending';
  const url = (window.BUDDY_REMINDER_URL || '').replace(/\/+$/, '');
  const toggle = document.getElementById('reminder-toggle');
  const help = document.getElementById('reminder-help');
  const usualHelp = help.textContent;
  let getSnapshot;
  let pending = Promise.resolve();

  function supported() {
    return location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1';
  }
  function ready() {
    return /^https:\/\/[^/]+\/functions\/v1\/buddy-reminders$/.test(url) && supported() &&
      'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  }
  function deviceToken() {
    let token = localStorage.getItem(TOKEN);
    if (!token) {
      const bytes = crypto.getRandomValues(new Uint8Array(32));
      token = btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
      localStorage.setItem(TOKEN, token);
    }
    return token;
  }
  function enqueue(task) {
    const result = pending.then(task);
    pending = result.catch(() => {});
    return result;
  }
  async function call(route, data) {
    const response = await fetch(`${url}/${route}`, {
      method: data === undefined ? 'GET' : 'POST',
      headers: data === undefined ? {} : {'Content-Type': 'application/json', Authorization: `Bearer ${deviceToken()}`},
      ...(data === undefined ? {} : {body: JSON.stringify(data)})
    });
    if (!response.ok) { const error = new Error('Buddy could not connect to reminders'); error.status = response.status; throw error; }
    return response.json();
  }
  function fromBase64Url(value) {
    const raw = atob(value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - value.length % 4) % 4));
    return Uint8Array.from(raw, char => char.charCodeAt(0));
  }
  async function subscription(forceNew = false) {
    const registration = await navigator.serviceWorker.register('./sw.js');
    const existing = await registration.pushManager.getSubscription();
    if (existing && !forceNew) return existing;
    if (existing) await existing.unsubscribe();
    const {publicKey} = await call('public-key');
    return registration.pushManager.subscribe({userVisibleOnly: true, applicationServerKey: fromBase64Url(publicKey)});
  }
  async function register(forceNew = false) {
    const current = await subscription(forceNew);
    await call('register', {subscription: current.toJSON(), ...getSnapshot()});
    return current;
  }
  async function syncNow() {
    if (!ready() || localStorage.getItem(ENABLED) !== 'true' || !getSnapshot) return;
    if (Notification.permission !== 'granted') {
      await disableNow(); toggle.checked = false;
      help.textContent = 'Allow notifications in your device settings, then turn reminders on again.';
      return;
    }
    try {
      await call('status', getSnapshot());
      help.textContent = usualHelp;
    } catch (error) {
      if (error.status === 404) {
        try { await register(true); help.textContent = usualHelp; return; } catch { /* Retry on reconnect. */ }
      }
      help.textContent = 'Saved on this device. Reminder status will sync when Buddy reconnects.';
    }
  }
  function sync() { return enqueue(syncNow); }
  async function unsubscribe() {
    const registration = await navigator.serviceWorker.getRegistration('./');
    const current = await registration?.pushManager.getSubscription();
    if (current) await current.unsubscribe();
  }
  async function disableNow() {
    localStorage.removeItem(ENABLED);
    localStorage.setItem(PENDING_DISABLE, 'true');
    try { await unsubscribe(); } catch { /* Server disable still takes priority. */ }
    try {
      await call('disable', {});
      localStorage.removeItem(PENDING_DISABLE);
      help.textContent = usualHelp;
    } catch {
      help.textContent = 'Reminders are off here. Buddy will finish disconnecting when online.';
    }
  }
  async function changeEnabled(wanted) {
    // iPhone requires this prompt directly inside the user's tap.
    const permission = wanted ? Notification.requestPermission() : null;
    toggle.disabled = true;
    try {
      if (wanted) {
        if (await permission !== 'granted') throw new Error('Notifications were not allowed');
        await enqueue(async () => {
          await register();
          localStorage.setItem(ENABLED, 'true');
          localStorage.removeItem(PENDING_DISABLE);
        });
        help.textContent = usualHelp;
      } else {
        await enqueue(disableNow);
      }
    } catch {
      toggle.checked = localStorage.getItem(ENABLED) === 'true';
      help.textContent = wanted ? 'Could not enable reminders. Check notification permission and your connection.' : 'Could not turn off reminders. Try again.';
    } finally { toggle.disabled = false; }
  }
  function init(snapshot) {
    getSnapshot = snapshot;
    if (!url) {toggle.disabled = true; help.textContent = 'Reminders will be available after Buddy is connected to Supabase.'; return;}
    if (!ready()) {toggle.disabled = true; help.textContent = 'Install Buddy to your Home Screen and open it there to enable notifications.'; return;}
    toggle.checked = localStorage.getItem(ENABLED) === 'true';
    toggle.addEventListener('change', () => { void changeEnabled(toggle.checked); });
    if (toggle.checked) void sync();
    else if (localStorage.getItem(PENDING_DISABLE) === 'true') void enqueue(disableNow);
    window.addEventListener('online', () => {
      if (localStorage.getItem(ENABLED) === 'true') void sync();
      else if (localStorage.getItem(PENDING_DISABLE) === 'true') void enqueue(disableNow);
    });
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && localStorage.getItem(ENABLED) === 'true') void sync();
    });
  }
  window.BuddyReminders = {init, sync};
})();
