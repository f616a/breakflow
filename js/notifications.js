/**
 * js/notifications.js
 * ---------------------------------------------------------------------
 * Two layers, per requirement #22:
 *   1. Toasts — transient, on-screen, disappear on their own.
 *   2. Notification Center — persisted via dataService, has unread
 *      state, "mark as read" / "mark all as read".
 *
 * This is the "In-App Notifications + Toasts" version. The events list
 * (booking created, break started, 5-min warning, break ended, booking
 * cancelled, swap requested/accepted/declined, waitlist available) is
 * ready to be wired to Web Push / FCM / OneSignal later — that would
 * mean adding a second listener here, not restructuring this file.
 * ---------------------------------------------------------------------
 */

const NotificationCenter = (() => {

  // ---------------------------------------------------------------
  // SOUND EFFECTS — short synthesized tones via the Web Audio API, so
  // there are no audio files to host. Each event gets a distinct,
  // pleasant sound. Browsers require a user gesture before audio can
  // play, which is already satisfied here (every call happens inside a
  // click handler somewhere up the chain).
  // ---------------------------------------------------------------
  function playTone(freqSequence, options) {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const gap = (options && options.gap) || 90;
      freqSequence.forEach(([freq, duration], i) => {
        const start = ctx.currentTime + (i * gap) / 1000;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = (options && options.wave) || "sine";
        osc.frequency.setValueAtTime(freq, start);
        gain.gain.setValueAtTime(0.001, start);
        gain.gain.exponentialRampToValueAtTime(0.09, start + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
        osc.connect(gain); gain.connect(ctx.destination);
        osc.start(start); osc.stop(start + duration + 0.02);
      });
    } catch (e) { /* Web Audio unsupported/blocked — sound is a nice-to-have, never fatal */ }
  }

  const SoundEffects = {
    success: () => playTone([[720, 0.12], [1080, 0.16]], { gap: 90 }),      // booking confirmed
    gentle: () => playTone([[640, 0.18]], {}),                              // reminders / ending soon
    error: () => playTone([[300, 0.16], [220, 0.2]], { gap: 110 }),         // rejections
    cheer: () => playTone([[660, 0.1], [880, 0.1], [1100, 0.18]], { gap: 80 }) // swap accepted, fun win
  };

  function showToast(message, variant) {
    let host = document.getElementById("toastHost");
    if (!host) {
      host = document.createElement("div");
      host.id = "toastHost";
      host.className = "toast-host";
      document.body.appendChild(host);
    }
    const toast = document.createElement("div");
    toast.className = "toast" + (variant === "danger" ? " toast-danger" : "");
    toast.textContent = message;
    host.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add("show"));
    setTimeout(() => {
      toast.classList.remove("show");
      setTimeout(() => toast.remove(), 250);
    }, 3400);
    if (variant === "danger") SoundEffects.error();
  }

  /** Push into the persisted center AND show a toast — the common case. */
  function notify(title, body, type) {
    dataService.addNotification({ title, body, type });
    showToast(body, type === "error" ? "danger" : "default");
    if (type !== "error") SoundEffects.gentle();
    renderBell();
  }

  function renderBell() {
    const badge = document.getElementById("notifUnreadBadge");
    if (!badge) return;
    const unread = dataService.getNotifications().filter(n => !n.read).length;
    badge.textContent = unread > 0 ? String(unread) : "";
    badge.classList.toggle("hidden", unread === 0);
  }

  function renderList(containerEl) {
    const list = dataService.getNotifications();
    if (list.length === 0) {
      containerEl.innerHTML = `<div class="empty-state">
        <div class="empty-title">${i18n.t("noNotifications")}</div>
      </div>`;
      return;
    }
    containerEl.innerHTML = list.map(n => `
      <div class="notif-item ${n.read ? "" : "notif-unread"}" data-id="${n.id}">
        <div class="notif-title">${n.title}</div>
        <div class="notif-body">${n.body}</div>
      </div>
    `).join("");
    containerEl.querySelectorAll(".notif-item").forEach(el => {
      el.addEventListener("click", () => {
        dataService.markNotificationRead(el.dataset.id);
        el.classList.remove("notif-unread");
        renderBell();
      });
    });
  }

  function markAllRead() {
    dataService.markAllNotificationsRead();
    renderBell();
  }

  return { showToast, notify, renderBell, renderList, markAllRead, SoundEffects };
})();
