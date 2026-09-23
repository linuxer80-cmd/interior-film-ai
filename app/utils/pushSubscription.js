"use client";

import { supabase } from "../../lib/supabase";

/* =========================================================
   VAPID 공개키 변환
========================================================= */

function urlBase64ToUint8Array(base64String) {
  const padding =
    "=".repeat((4 - (base64String.length % 4)) % 4);

  const base64 = (base64String + padding)
    .replace(/-/g, "+")
    .replace(/_/g, "/");

  const rawData = window.atob(base64);

  return Uint8Array.from(
    [...rawData].map((char) => char.charCodeAt(0)),
  );
}

/* =========================================================
   Push 지원 여부 확인
========================================================= */

export function isPushSupported() {
  if (typeof window === "undefined") {
    return false;
  }

  return (
    "Notification" in window &&
    "serviceWorker" in navigator &&
    "PushManager" in window
  );
}

/* =========================================================
   현재 로그인 사용자
========================================================= */

async function getCurrentUser() {
  const {
    data,
    error,
  } = await supabase.auth.getUser();

  if (error) {
    throw new Error(
      `로그인 확인 실패: ${error.message}`,
    );
  }

  const user = data?.user;

  if (!user?.id) {
    throw new Error("로그인이 필요합니다.");
  }

  return user;
}

/* =========================================================
   Service Worker 등록
========================================================= */

async function getServiceWorkerRegistration() {
  if (
    typeof navigator === "undefined" ||
    !("serviceWorker" in navigator)
  ) {
    throw new Error(
      "이 브라우저는 Service Worker를 지원하지 않습니다.",
    );
  }

  await navigator.serviceWorker.register("/sw.js");

  return await navigator.serviceWorker.ready;
}

/* =========================================================
   PushSubscription → DB 저장용 데이터
========================================================= */

function getSubscriptionKeys(subscription) {
  const json = subscription.toJSON();

  const endpoint =
    subscription.endpoint ||
    json?.endpoint ||
    "";

  const p256dh =
    json?.keys?.p256dh ||
    "";

  const auth =
    json?.keys?.auth ||
    "";

  if (!endpoint || !p256dh || !auth) {
    throw new Error(
      "휴대폰 Push 구독정보를 가져오지 못했습니다.",
    );
  }

  return {
    endpoint,
    p256dh,
    auth,
  };
}

/* =========================================================
   Push 구독 DB 저장

   - 같은 endpoint가 이미 현재 사용자에게 있으면 UPDATE
   - 없으면 INSERT
   - RLS에서 auth.uid() = user_id 보호
========================================================= */

async function saveSubscriptionToDatabase(
  userId,
  subscription,
) {
  const {
    endpoint,
    p256dh,
    auth,
  } = getSubscriptionKeys(subscription);

  const {
    data: existing,
    error: selectError,
  } = await supabase
    .from("push_subscriptions")
    .select("id")
    .eq("user_id", userId)
    .eq("endpoint", endpoint)
    .maybeSingle();

  if (selectError) {
    throw new Error(
      `Push 구독 확인 실패: ${selectError.message}`,
    );
  }

  if (existing?.id) {
    const {
      error: updateError,
    } = await supabase
      .from("push_subscriptions")
      .update({
        p256dh,
        auth,
        updated_at: new Date().toISOString(),
      })
      .eq("id", existing.id)
      .eq("user_id", userId);

    if (updateError) {
      throw new Error(
        `Push 구독 갱신 실패: ${updateError.message}`,
      );
    }

    return {
      id: existing.id,
      endpoint,
      updated: true,
    };
  }

  const {
    data: inserted,
    error: insertError,
  } = await supabase
    .from("push_subscriptions")
    .insert({
      user_id: userId,
      endpoint,
      p256dh,
      auth,
    })
    .select("id")
    .single();

  if (insertError) {
    throw new Error(
      `Push 구독 저장 실패: ${insertError.message}`,
    );
  }

  return {
    id: inserted?.id || null,
    endpoint,
    updated: false,
  };
}

/* =========================================================
   현재 브라우저 Push 상태 확인

   enabled:
   - 브라우저 권한 granted
   - Service Worker PushSubscription 존재
   - 현재 사용자 DB에도 endpoint 존재
========================================================= */

export async function getPushSubscriptionStatus() {
  if (!isPushSupported()) {
    return {
      supported: false,
      enabled: false,
      permission:
        typeof Notification !== "undefined"
          ? Notification.permission
          : "unsupported",
    };
  }

  const user = await getCurrentUser();

  const registration =
    await getServiceWorkerRegistration();

  const subscription =
    await registration.pushManager.getSubscription();

  if (!subscription) {
    return {
      supported: true,
      enabled: false,
      permission: Notification.permission,
      userId: user.id,
    };
  }

  const {
    endpoint,
  } = getSubscriptionKeys(subscription);

  const {
    data,
    error,
  } = await supabase
    .from("push_subscriptions")
    .select("id")
    .eq("user_id", user.id)
    .eq("endpoint", endpoint)
    .maybeSingle();

  if (error) {
    throw new Error(
      `Push 등록상태 확인 실패: ${error.message}`,
    );
  }

  return {
    supported: true,
    enabled:
      Notification.permission === "granted" &&
      Boolean(data?.id),
    permission: Notification.permission,
    userId: user.id,
    subscriptionId: data?.id || null,
  };
}

/* =========================================================
   휴대폰 Push 알림 켜기
========================================================= */

export async function enablePushNotifications() {
  if (!isPushSupported()) {
    throw new Error(
      "이 브라우저에서는 휴대폰 Push 알림을 사용할 수 없습니다.",
    );
  }

  const vapidPublicKey =
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

  if (!vapidPublicKey) {
    throw new Error(
      "VAPID 공개키가 설정되지 않았습니다.",
    );
  }

  const user = await getCurrentUser();

  let permission = Notification.permission;

  if (permission === "denied") {
    throw new Error(
      "알림 권한이 차단되어 있습니다. 휴대폰 브라우저 설정에서 이 사이트의 알림 권한을 허용해주세요.",
    );
  }

  if (permission !== "granted") {
    permission =
      await Notification.requestPermission();
  }

  if (permission !== "granted") {
    throw new Error(
      "알림 권한이 허용되지 않았습니다.",
    );
  }

  const registration =
    await getServiceWorkerRegistration();

  let subscription =
    await registration.pushManager.getSubscription();

  if (!subscription) {
    subscription =
      await registration.pushManager.subscribe({
        userVisibleOnly: true,

        applicationServerKey:
          urlBase64ToUint8Array(
            vapidPublicKey,
          ),
      });
  }

  const saved =
    await saveSubscriptionToDatabase(
      user.id,
      subscription,
    );

  return {
    success: true,
    supported: true,
    enabled: true,
    permission,
    userId: user.id,
    subscriptionId: saved.id,
    endpoint: saved.endpoint,
  };
}

/* =========================================================
   현재 휴대폰 Push 알림 끄기

   현재 브라우저의 endpoint만 DB에서 삭제하고
   브라우저 PushSubscription도 해제
========================================================= */

export async function disablePushNotifications() {
  if (!isPushSupported()) {
    return {
      success: true,
      enabled: false,
    };
  }

  const user = await getCurrentUser();

  const registration =
    await getServiceWorkerRegistration();

  const subscription =
    await registration.pushManager.getSubscription();

  if (!subscription) {
    return {
      success: true,
      enabled: false,
    };
  }

  const {
    endpoint,
  } = getSubscriptionKeys(subscription);

  const {
    error: deleteError,
  } = await supabase
    .from("push_subscriptions")
    .delete()
    .eq("user_id", user.id)
    .eq("endpoint", endpoint);

  if (deleteError) {
    throw new Error(
      `Push 구독 삭제 실패: ${deleteError.message}`,
    );
  }

  try {
    await subscription.unsubscribe();
  } catch (error) {
    console.warn(
      "브라우저 Push 구독 해제:",
      error,
    );
  }

  return {
    success: true,
    enabled: false,
  };
      }
