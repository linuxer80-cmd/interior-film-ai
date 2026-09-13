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

self.addEvent
