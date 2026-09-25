/* =========================================================
   기분좋은공간 Push Service Worker

   역할
   1. Push 알림 표시
   2. 알림별 이동 URL 저장
   3. 알림 클릭 시 정확한 페이지로 이동
   4. 이미 앱이 열려 있으면 해당 창을 재사용
========================================================= */

/* =========================================================
   안전한 내부 이동 주소 만들기
========================================================= */

function getSafeUrl(value, fallback = "/") {
  const text =
    typeof value === "string"
      ? value.trim()
      : "";

  /*
   * 외부 사이트 이동 방지
   * 반드시 현재 사이트의 / 내부 경로만 허용
   */
  if (
    !text ||
    !text.startsWith("/") ||
    text.startsWith("//")
  ) {
    return fallback;
  }

  return text;
}

/* =========================================================
   Push 수신
========================================================= */

self.addEventListener(
  "push",
  (event) => {
    let data = {};

    try {
      data =
        event.data
          ? event.data.json()
          : {};
    } catch {
      data = {
        title:
          "기분좋은공간",

        body:
          event.data
            ? event.data.text()
            : "새로운 알림이 도착했습니다.",
      };
    }

    const title =
      data.title ||
      "🔔 새 알림";

    const url =
      getSafeUrl(
        data.url,
        "/"
      );

    const notificationId =
      data.notificationId ||
      null;

    const notificationType =
      data.type ||
      "notification";

    const priority =
      data.priority ||
      "info";

    const options = {
      body:
        data.body ||
        "새로운 알림이 도착했습니다.",

      icon:
        "/icon-192.png",

      badge:
        "/icon-192.png",

      tag:
        data.tag ||
        (
          notificationId
            ? `notification-${notificationId}`
            : `${notificationType}-${Date.now()}`
        ),

      renotify: true,

      requireInteraction:
        priority ===
        "critical",

      data: {
        url,

        notificationId,

        type:
          notificationType,

        priority,
      },
    };

    event.waitUntil(
      self.registration
        .showNotification(
          title,
          options
        )
    );
  }
);

/* =========================================================
   알림 클릭

   예:
   회사 관리자 신규 상담
   /admin?tab=leads&lead=상담ID

   시공자 현장 배정
   /worker?site=현장ID

   슈퍼관리자 업체 알림
   /super-admin/company/업체ID

   슈퍼관리자 시스템 알림
   /super-admin/notifications
========================================================= */

self.addEventListener(
  "notificationclick",
  (event) => {
    event.notification.close();

    const notificationData =
      event.notification.data ||
      {};

    const path =
      getSafeUrl(
        notificationData.url,
        "/"
      );

    const targetUrl =
      new URL(
        path,
        self.location.origin
      ).href;

    event.waitUntil(
      (async () => {
        /*
         * 현재 브라우저에 열려 있는
         * 우리 사이트 창 확인
         */
        const windowClients =
          await self.clients.matchAll({
            type: "window",
            includeUncontrolled: true,
          });

        /*
         * 이미 정확히 같은 페이지가
         * 열려 있다면 그 창으로 이동
         */
        for (
          const client
          of windowClients
        ) {
          try {
            const clientUrl =
              new URL(
                client.url
              );

            if (
              clientUrl.href ===
              targetUrl
            ) {
              await client.focus();

              return;
            }
          } catch {
            // URL 확인 실패 시 다음 창 확인
          }
        }

        /*
         * 같은 사이트 창이 이미 열려 있다면
         * 새 창을 계속 만들지 않고
         * 기존 창을 목적지로 이동
         */
        for (
          const client
          of windowClients
        ) {
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
                "navigate" in
                client
              ) {
                await client.navigate(
                  targetUrl
                );
              }

              await client.focus();

              return;
            }
          } catch {
            // 실패하면 새 창 열기로 진행
          }
        }

        /*
         * 열려 있는 우리 사이트 창이 없으면
         * 목적지 페이지를 새로 엶
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
