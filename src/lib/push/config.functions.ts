import { createServerFn } from "@tanstack/react-start";

// Firebase Web apiKey is a public identifier — safe to expose in client bundles.
// Real access is gated by Firebase Security Rules + App Check.
export const getFirebaseWebConfig = createServerFn({ method: "GET" }).handler(async () => {
  return {
    apiKey: "AIzaSyAVG62xS2aZLm8op7fHZT5UYupYtW5qh5I",
    authDomain: "sthapc.firebaseapp.com",
    projectId: "sthapc",
    storageBucket: "sthapc.firebasestorage.app",
    messagingSenderId: "668562750529",
    appId: "1:668562750529:web:e9d69f1d309d1c59935ac0",
    measurementId: "G-SWD6ZNHDM7",
    vapidKey: "XgFInSGMfTHmFQO8ru85oijLb6OUC5orxuNambqMQbg",
  };
});
