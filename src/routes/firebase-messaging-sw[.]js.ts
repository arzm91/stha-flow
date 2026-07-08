import { createFileRoute } from "@tanstack/react-router";

// Serve the Firebase Messaging service worker dynamically so the public
// (safe-to-expose) Firebase Web config lives in one place server-side.
export const Route = createFileRoute("/firebase-messaging-sw.js")({
  server: {
    handlers: {
      GET: async () => {
        const apiKey = process.env.GOOGLE_API_KEY ?? "";
        const config = {
          apiKey,
          authDomain: "sthapc.firebaseapp.com",
          projectId: "sthapc",
          storageBucket: "sthapc.firebasestorage.app",
          messagingSenderId: "668562750529",
          appId: "1:668562750529:web:e9d69f1d309d1c59935ac0",
        };
        const body = `// STHApc — Firebase Messaging Service Worker (auto-generated)
importScripts("https://www.gstatic.com/firebasejs/10.13.2/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.13.2/firebase-messaging-compat.js");

firebase.initializeApp(${JSON.stringify(config)});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const title = (payload.notification && payload.notification.title) || (payload.data && payload.data.title) || "STHApc";
  const body = (payload.notification && payload.notification.body) || (payload.data && payload.data.body) || "";
  const options = {
    body,
    icon: "/favicon.ico",
    badge: "/favicon.ico",
    data: payload.data || {},
    tag: (payload.data && payload.data.tag) || undefined,
  };
  self.registration.showNotification(title, options);
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((wins) => {
      for (const w of wins) {
        if ("focus" in w) return w.focus();
      }
      if (clients.openWindow) return clients.openWindow(url);
    }),
  );
});
`;
        return new Response(body, {
          status: 200,
          headers: {
            "content-type": "application/javascript; charset=utf-8",
            "cache-control": "public, max-age=300",
            "service-worker-allowed": "/",
          },
        });
      },
    },
  },
});
