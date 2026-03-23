import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const buildServiceWorkerScript = () => {
  const firebaseConfig = {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
    measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID
  };
  const requiredConfig = {
    apiKey: firebaseConfig.apiKey,
    authDomain: firebaseConfig.authDomain,
    projectId: firebaseConfig.projectId,
    storageBucket: firebaseConfig.storageBucket,
    messagingSenderId: firebaseConfig.messagingSenderId,
    appId: firebaseConfig.appId
  };
  const configReady = Object.values(requiredConfig).every(
    (value) => typeof value === "string" && value.trim().length > 0
  );

  return `
self.addEventListener("notificationclick", function(event) {
  event.notification.close();
  var target = "/";
  if (event.notification && event.notification.data && event.notification.data.link) {
    target = event.notification.data.link;
  }
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(function(clients) {
      for (var i = 0; i < clients.length; i += 1) {
        var client = clients[i];
        if ("focus" in client) {
          client.navigate(target);
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(target);
      }
      return undefined;
    })
  );
});

${configReady ? `
importScripts("https://www.gstatic.com/firebasejs/12.11.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/12.11.0/firebase-messaging-compat.js");
firebase.initializeApp(${JSON.stringify(firebaseConfig)});
var messaging = firebase.messaging();
messaging.onBackgroundMessage(function(payload) {
  var notification = payload && payload.notification ? payload.notification : {};
  var data = payload && payload.data ? payload.data : {};
  var title = notification.title || "Korra notification";
  var options = {
    body: notification.body || "",
    icon: notification.icon || "/favicon.ico",
    badge: notification.badge || "/favicon.ico",
    data: {
      link: data.link || "/settings/account"
    }
  };
  self.registration.showNotification(title, options);
});
` : ""}
`;
};

export async function GET() {
  return new NextResponse(buildServiceWorkerScript(), {
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "no-store, max-age=0",
      "Service-Worker-Allowed": "/"
    }
  });
}
