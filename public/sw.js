self.addEventListener("push", (event) => {
  let data = {};

  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = {
      title: "기분좋은공간",
      body: event.data ? event.data.text() : "신규 상담이 들어왔습니다.",
    };
  }

  const title = data.title || "🔴 기분좋은공간 신규 상담";

  const options = {
    body: data.body || "새로운 고객 상담이 들어왔습니다.",
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    tag: data.tag || "new-customer-lead",
    renotify: true,
    data: {
      url: data.url || "/admin",
    },
  };

  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

/* =========================================================
   알림 클릭 시 해당 페이지로 이동

   기존 Push 표시 기능은 변경하지 않음.
   data.url이 있으면 그 주소로 이동.
   없으면 기존 기본값 /admin 사용.
========================================================= */

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const targetUrl =
    event.notification?.data?.url || "/admin";

  event.waitUntil(
    (async () => {
      const clientsList =
        await self.clients.matchAll({
          type: "window",
          includeUncontrolled: true,
        });

      /*
       * 이미 사이트가 열려 있으면
       * 기존 창을 목적지로 이동
       */
      for (const client of clientsList) {
        try {
          if ("navigate" in client) {
            await client.navigate(targetUrl);
          }

          if ("focus" in client) {
            await client.focus();
          }

          return;
        } catch {
          // 실패하면 아래에서 새 창 열기
        }
      }

      /*
       * 열려 있는 창이 없으면
       * 새 창으로 목적지 열기
       */
      if (self.clients.openWindow) {
        await self.clients.openWindow(targetUrl);
      }
    })()
  );
});
