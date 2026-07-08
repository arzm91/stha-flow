import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import { getMessaging, getToken, onMessage, isSupported, type Messaging } from "firebase/messaging";
import { supabase } from "@/integrations/supabase/client";
import { getFirebaseWebConfig } from "./config.functions";
import { toast } from "sonner";

let appPromise: Promise<FirebaseApp> | null = null;
let cachedVapid: string | null = null;

async function getApp(): Promise<{ app: FirebaseApp; vapidKey: string }> {
  if (!appPromise) {
    appPromise = (async () => {
      const cfg = await getFirebaseWebConfig();
      cachedVapid = cfg.vapidKey;
      const { vapidKey: _v, ...firebaseConfig } = cfg;
      return getApps()[0] ?? initializeApp(firebaseConfig);
    })();
  }
  const app = await appPromise;
  return { app, vapidKey: cachedVapid ?? "" };
}

export async function isPushSupported(): Promise<boolean> {
  if (typeof window === "undefined") return false;
  if (!("serviceWorker" in navigator) || !("Notification" in window)) return false;
  try {
    return await isSupported();
  } catch {
    return false;
  }
}

export async function getMessagingInstance(): Promise<Messaging> {
  const { app } = await getApp();
  return getMessaging(app);
}

async function registerServiceWorker(): Promise<ServiceWorkerRegistration> {
  const existing = await navigator.serviceWorker.getRegistration("/firebase-messaging-sw.js");
  if (existing) return existing;
  return navigator.serviceWorker.register("/firebase-messaging-sw.js", { scope: "/" });
}

function detectPlatform(): string {
  const ua = navigator.userAgent;
  if (/android/i.test(ua)) return "android";
  if (/iphone|ipad|ipod/i.test(ua)) return "ios";
  if (/mac/i.test(ua)) return "macos";
  if (/windows/i.test(ua)) return "windows";
  if (/linux/i.test(ua)) return "linux";
  return "web";
}

export async function enablePushNotifications(rotulo?: string): Promise<{ ok: boolean; token?: string; reason?: string }> {
  if (!(await isPushSupported())) return { ok: false, reason: "unsupported" };

  const perm = Notification.permission === "granted"
    ? "granted"
    : await Notification.requestPermission();
  if (perm !== "granted") return { ok: false, reason: "permission_denied" };

  const registration = await registerServiceWorker();
  const { vapidKey } = await getApp();
  const messaging = await getMessagingInstance();

  const token = await getToken(messaging, {
    vapidKey,
    serviceWorkerRegistration: registration,
  });
  if (!token) return { ok: false, reason: "no_token" };

  const { data: u } = await supabase.auth.getUser();
  if (!u.user) return { ok: false, reason: "not_authenticated" };

  const { error } = await supabase.from("push_devices").upsert(
    {
      user_id: u.user.id,
      owner_id: u.user.id,
      fcm_token: token,
      plataforma: detectPlatform(),
      rotulo: rotulo || `${detectPlatform()} • ${new Date().toLocaleDateString("pt-BR")}`,
      ativo: true,
      user_agent: navigator.userAgent.slice(0, 300),
    },
    { onConflict: "fcm_token" },
  );
  if (error) return { ok: false, reason: error.message };

  // Foreground messages: show toast (SW handles background)
  onMessage(messaging, (payload) => {
    const title = payload.notification?.title || payload.data?.title || "STHApc";
    const body = payload.notification?.body || payload.data?.body || "";
    toast(title, { description: body });
  });

  return { ok: true, token };
}

export async function disablePushDevice(deviceId: string): Promise<{ ok: boolean; reason?: string }> {
  const { error } = await supabase.from("push_devices").update({ ativo: false }).eq("id", deviceId);
  if (error) return { ok: false, reason: error.message };
  return { ok: true };
}
