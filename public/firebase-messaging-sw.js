// STHApc — Firebase Messaging Service Worker
// Firebase Web apiKey is safe to expose (public identifier); real access is gated by
// Firebase Security Rules + App Check. Keeping this file static ensures the correct
// application/javascript MIME type for service worker registration.
importScripts("https://www.gstatic.com/firebasejs/10.13.2/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.13.2/firebase-messaging-compat.js");

firebase.initializeApp({
  apiKey: "AIzaSyAVG62xS2aZLm8op7fHZT5UYupYtW5qh5I",
  authDomain: "sthapc.firebaseapp.com",
  projectId: "sthapc",
  storageBucket: "sthapc.firebasestorage.app",
  messagingSenderId: "668562750529",
  appId: "1:668562750529:web:e9d69f1d309d1c59935ac0",
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const title = (payload.notification && payload.notification.title) || (payload.data && payload.data.title) || "STHApc";
  const body = (payload.notification && payload.notification.body) || (payload.data && payload.data.body) || "";
  const options = {
    body,
    icon: "/icon-192.png",
    badge: "/icon-192.png",
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
