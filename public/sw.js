/* =========================================================
   기분좋은공간 Push Service Worker
========================================================= */

/* =========================================================
   새 Service Worker 즉시 활성화

   기존 Service Worker가 휴대폰에 남아
   notificationclick 코드가 적용되지 않는 문제 방지
========================================================= */

self.addEventListener("install", (event) => {
  event.waitUntil(
    self.skipWaiting()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    self.clients.claim()
  );
});

/* =========================================================
   Push 수신
   기존 기능 유지
========================================================= */

self.addEventListener("push", (event) => {
  let data = {};

  try {
    data = event.data
      ? event.data.json()
      : {};
  } catch {
    data = {
      title: "필름장이",
      body: event.data
        ? event.data.text()
        : "신규 상담이 들어왔습니다.",
    };
  }

  const title =
    data.title ||
    "필름장이 · 새 알림";

  const options = {
    body:
      data.body ||
      "새로운 알림이 도착했습니다.",

    icon:
      "/app-icon/192",

    badge:
      "/notification-badge",

    tag:
      data.tag ||
      `notification-${Date.now()}`,

    renotify: false,
    actions: [{ action: "open", title: data.actionLabel || "내용 확인" }],
    timestamp: Date.now(),

    data: {
      url:
        data.url || data.link ||
        "/start",
      recipientType: data.recipientType,
    },
  };

  event.waitUntil(
    self.registration.showNotification(
      title,
      options
    )
  );
});

/* =========================================================
   알림 클릭

   data.url
   예:
   /admin
   /admin?tab=leads&lead=...
   /worker?site=...
   /super-admin/billing
========================================================= */

self.addEventListener(
  "notificationclick",
  (event) => {
    event.notification.close();

    let rawUrl =
      event.notification?.data?.url ||
      "/start";

    // Previously delivered registration notices may still contain a generic destination.
    if (/신규\s*시공자\s*등록/.test(event.notification.title || "") &&
      ["/super-admin", "/super-admin/notifications"].includes(rawUrl)) rawUrl = "/super-admin/workers";

    /*
     * 현재 사이트 기준 절대 URL로 변환
     */
    let targetUrl;

    try {
      const parsed = new URL(rawUrl, self.location.origin);
      targetUrl = parsed.origin === self.location.origin
        ? parsed.href
        : `${self.location.origin}/`;
    } catch {
      targetUrl = `${self.location.origin}/`;
    }

    event.waitUntil(
      (async () => {
        const clientsList =
          await self.clients.matchAll({
            type: "window",
            includeUncontrolled: true,
          });

        /*
         * 정확히 같은 페이지가 이미 열려 있으면
         * 최신 배정을 다시 읽도록 같은 URL도 이동 후 앞으로 가져오기
         */
        for (const client of clientsList) {
          try {
            if (
              client.url ===
              targetUrl
            ) {
              if ("navigate" in client) {
                const refreshed = await client.navigate(targetUrl);
                if (refreshed) {
                  await refreshed.focus();
                  return;
                }
              }
              // If navigation fails, try another client or a new window.
              continue;
            }
          } catch {
            // 다음 창 확인
          }
        }

        /*
         * 같은 사이트 창이 열려 있으면
         * 기존 창을 목적지로 이동
         */
        for (const client of clientsList) {
          try {
            const clientUrl =
              new URL(
                client.url
              );

            if (
              clientUrl.origin ===
              self.location.origin
            ) {
              if (
                "navigate" in client
              ) {
                const navigated = await client.navigate(targetUrl);
                if (navigated) {
                  await navigated.focus();
                  return;
                }
              }
            }
          } catch {
            // 새 창 열기로 진행
          }
        }

        /*
         * 사이트가 열려 있지 않으면
         * 새 창으로 목적지 열기
         */
        if (
          self.clients.openWindow
        ) {
          await self.clients.openWindow(
            targetUrl
          );
        }
      })()
    );
  }
);
