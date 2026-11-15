
const KEY = "pagecrew_notifications";

export function getNotifications() {
  try {
    const data = JSON.parse(localStorage.getItem(KEY) || "[]");
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

export function addNotification(title, message, type = "info") {
  const notification = {
    id: crypto.randomUUID(),
    title,
    message,
    type,
    read: false,
    createdAt: new Date().toISOString()
  };

  const updated = [notification, ...getNotifications()].slice(0, 100);
  localStorage.setItem(KEY, JSON.stringify(updated));
  window.dispatchEvent(new Event("pagecrew:notifications-updated"));

  return notification;
}

export function markAllNotificationsRead() {
  const updated = getNotifications().map((item) => ({
    ...item,
    read: true
  }));

  localStorage.setItem(KEY, JSON.stringify(updated));
  window.dispatchEvent(new Event("pagecrew:notifications-updated"));
}

export function clearNotifications() {
  localStorage.removeItem(KEY);
  window.dispatchEvent(new Event("pagecrew:notifications-updated"));
}
