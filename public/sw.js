/**
 * vapush service worker
 * Handles push notifications and notification clicks
 */

self.addEventListener("push", (event) => {
  if (!event.data) return;

  let data;
  try {
    data = event.data.json();
  } catch {
    data = { title: "Notification", body: event.data.text() };
  }

  const options = {
    body: data.body || "",
    icon: data.icon,
    badge: data.badge,
    data: { url: data.url },
    requireInteraction: true,
  };

  event.waitUntil(
    self.registration.showNotification(data.title || "vapush", options)
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const url = event.notification.data?.url;
  if (url) {
    event.waitUntil(clients.openWindow(url));
  }
});
