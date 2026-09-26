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
      title: "기분좋은공간",
      body: event.data
        ? event.data.text()
        : "신규 상담이 들어왔습니다.",
    };
  }

  const title =
    data.title ||
    "🔴 기분좋은공간 신규 상담";

  const options = {
    body:
      data.body ||
      "새로운 고객 상담이 들어왔습니다.",

    icon:
      "/icon-192.png",

    badge:
      "/icon-192.png",

    tag:
      data.tag ||
      "new-customer-lead",

    renotify:
      true,

    data: {
      url:
        data.url ||
        "/admin",
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

    const rawUrl =
      event.notification?.data?.url ||
      "/admin";

    /*
     * 현재 사이트 기준 절대 URL로 변환
     */
    const targetUrl =
      new URL(
        rawUrl,
        self.location.origin
      ).href;

    event.waitUntil(
      (async () => {
        const clientsList =
          await self.clients.matchAll({
            type: "window",
            includeUncontrolled: true,
          });

        /*
         * 정확히 같은 페이지가 이미 열려 있으면
         * 그 창을 앞으로 가져오기
         */
        for (const client of clientsList) {
          try {
            if (
              client.url ===
              targetUrl
            ) {
              await client.focus();

              return;
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
                await client.navigate(
                  targetUrl
                );
              }

              if (
                "focus" in client
              ) {
                await client.focus();
              }

              return;
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
