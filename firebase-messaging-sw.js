importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey:            "AIzaSyDBnLbLb-mOHIoS29k-G9hzPj285XG3QeI",
  authDomain:        "conteo-de-puntos-golner-sports.firebaseapp.com",
  projectId:         "conteo-de-puntos-golner-sports",
  storageBucket:     "conteo-de-puntos-golner-sports.firebasestorage.app",
  messagingSenderId: "440898623228",
  appId:             "1:440898623228:web:e4c0bc3693080e4e0d2979"
});

// NO inicializamos firebase.messaging() aquí para que no registre
// su propio listener de push. Solo manejamos el push nosotros.

self.addEventListener('push', event => {
  let payload = {};
  try { payload = event.data ? event.data.json() : {}; } catch(e) {}

  const title = (payload.data && payload.data.title)
    || (payload.notification && payload.notification.title)
    || 'GOLNER SPORTS';
  const body  = (payload.data && payload.data.body)
    || (payload.notification && payload.notification.body)
    || '';

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon:     '/icons/icon-192.png',
      badge:    '/icons/icon-192.png',
      vibrate:  [200, 100, 200],
      tag:      'golner-notif',
      renotify: true,
      data:     payload.data || {}
    })
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const client of list) {
        if (client.url.includes('golner-sports') && 'focus' in client) return client.focus();
      }
      return clients.openWindow('https://conteo-de-puntos-golner-sports.web.app');
    })
  );
});
