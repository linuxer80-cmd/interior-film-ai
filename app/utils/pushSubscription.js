"use client";

import { supabase } from "../../lib/supabase";

/* =========================================================
   VAPID 공개키 변환
========================================================= */

function urlBase64ToUint8Array(base64String) {
  const padding =
    "=".repeat(
      (4 - (base64String.length % 4)) % 4,
    );

  const base64 =
    (base64String + padding)
      .replace(/-/g, "+")
      .replace(/_/g, "/");

  const rawData =
    window.atob(base64);

  return Uint8Array.from(
    [...rawData].map(
      (char) =>
        char.charCodeAt(0),
    ),
  );
}

/* =========================================================
   Push 지원 여부 확인
========================================================= */

export function isPushSupported() {
  if (
    typeof window ===
    "undefined"
  ) {
    return false;
  }

  return (
    "Notification" in
      window &&
    "serviceWorker" in
      navigator &&
    "PushManager" in
      window
  );
}

/* =========================================================
   현재 로그인 사용자
========================================================= */

async function getCurrentUser() {
  const {
    data,
    error,
  } =
    await supabase.auth.getUser();

  if (error) {
    throw new Error(
      `로그인 확인 실패: ${error.message}`,
    );
  }

  const user =
    data?.user;

  if (!user?.id) {
    throw new Error(
      "로그인이 필요합니다.",
    );
  }

  return user;
}

/* =========================================================
   Service Worker 등록
========================================================= */

async function getServiceWorkerRegistration() {
  if (
    typeof navigator ===
      "undefined" ||
    !(
      "serviceWorker" in
      navigator
    )
  ) {
    throw new Error(
      "이 브라우저는 Service Worker를 지원하지 않습니다.",
    );
  }

  await navigator.serviceWorker.register(
    "/sw.js",
  );

  return await navigator.serviceWorker.ready;
}

/* =========================================================
   PushSubscription → DB 저장용 데이터
========================================================= */

function getSubscriptionKeys(
  subscription,
) {
  const json =
    subscription.toJSON();

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

  if (
    !endpoint ||
    !p256dh ||
    !auth
  ) {
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

   구조:
   UNIQUE (user_id, endpoint)

   같은 휴대폰 endpoint라도
   서로 다른 로그인 계정이면 각각 저장 가능.

   예:
   endpoint ABC + A업체 사용자
   endpoint ABC + B업체 사용자
   endpoint ABC + 슈퍼관리자

   모두 동시에 유지 가능.
========================================================= */

async function saveSubscriptionToDatabase(
  userId,
  subscription,
) {
  const {
    endpoint,
    p256dh,
    auth,
  } =
    getSubscriptionKeys(
      subscription,
    );

  const {
    data: existing,
    error: selectError,
  } =
    await supabase
      .from(
        "push_subscriptions",
      )
      .select(
        "id",
      )
      .eq(
        "user_id",
        userId,
      )
      .eq(
        "endpoint",
        endpoint,
      )
      .maybeSingle();

  if (selectError) {
    throw new Error(
      `Push 구독 확인 실패: ${selectError.message}`,
    );
  }

  /*
   * 현재 사용자 + 현재 휴대폰이
   * 이미 등록되어 있으면 키만 갱신
   */
  if (
    existing?.id
  ) {
    const {
      error:
        updateError,
    } =
      await supabase
        .from(
          "push_subscriptions",
        )
        .update({
          p256dh,
          auth,

          updated_at:
            new Date().toISOString(),
        })
        .eq(
          "id",
          existing.id,
        )
        .eq(
          "user_id",
          userId,
        );

    if (
      updateError
    ) {
      throw new Error(
        `Push 구독 갱신 실패: ${updateError.message}`,
      );
    }

    return {
      id:
        existing.id,

      endpoint,

      updated:
        true,
    };
  }

  /*
   * 현재 사용자에게 등록된 적이 없으면
   * 새 연결 추가
   */
  const {
    data: inserted,
    error: insertError,
  } =
    await supabase
      .from(
        "push_subscriptions",
      )
      .insert({
        user_id:
          userId,

        endpoint,

        p256dh,

        auth,
      })
      .select(
        "id",
      )
      .single();

  if (
    insertError
  ) {
    throw new Error(
      `Push 구독 저장 실패: ${insertError.message}`,
    );
  }

  return {
    id:
      inserted?.id ||
      null,

    endpoint,

    updated:
      false,
  };
}

/* =========================================================
   현재 브라우저 Push 상태 확인

   활성 조건:
   1. 브라우저 Push 지원
   2. 알림 권한 granted
   3. 브라우저 PushSubscription 존재
   4. 현재 사용자 + endpoint DB 연결 존재
========================================================= */

export async function getPushSubscriptionStatus() {
  if (
    !isPushSupported()
  ) {
    return {
      supported:
        false,

      enabled:
        false,

      subscribed:
        false,

      permission:
        typeof Notification !==
        "undefined"
          ? Notification.permission
          : "unsupported",
    };
  }

  const user =
    await getCurrentUser();

  const registration =
    await getServiceWorkerRegistration();

  const subscription =
    await registration
      .pushManager
      .getSubscription();

  if (
    !subscription
  ) {
    return {
      supported:
        true,

      enabled:
        false,

      subscribed:
        false,

      permission:
        Notification.permission,

      userId:
        user.id,
    };
  }

  const {
    endpoint,
  } =
    getSubscriptionKeys(
      subscription,
    );

  const {
    data,
    error,
  } =
    await supabase
      .from(
        "push_subscriptions",
      )
      .select(
        "id",
      )
      .eq(
        "user_id",
        user.id,
      )
      .eq(
        "endpoint",
        endpoint,
      )
      .maybeSingle();

  if (error) {
    throw new Error(
      `Push 등록상태 확인 실패: ${error.message}`,
    );
  }

  const subscribed =
    Boolean(
      data?.id,
    );

  return {
    supported:
      true,

    enabled:
      Notification.permission ===
        "granted" &&
      subscribed,

    subscribed,

    permission:
      Notification.permission,

    userId:
      user.id,

    subscriptionId:
      data?.id ||
      null,

    endpoint,
  };
}

/* =========================================================
   휴대폰 Push 알림 켜기

   이미 브라우저 PushSubscription이 존재하면
   그대로 재사용.

   현재 로그인 사용자와 endpoint 연결만 추가.
========================================================= */

export async function enablePushNotifications() {
  if (
    !isPushSupported()
  ) {
    throw new Error(
      "이 브라우저에서는 휴대폰 Push 알림을 사용할 수 없습니다.",
    );
  }

  const vapidPublicKey =
    process.env
      .NEXT_PUBLIC_VAPID_PUBLIC_KEY;

  if (
    !vapidPublicKey
  ) {
    throw new Error(
      "VAPID 공개키가 설정되지 않았습니다.",
    );
  }

  const user =
    await getCurrentUser();

  let permission =
    Notification.permission;

  if (
    permission ===
    "denied"
  ) {
    throw new Error(
      "알림 권한이 차단되어 있습니다. 휴대폰 브라우저 설정에서 이 사이트의 알림 권한을 허용해주세요.",
    );
  }

  if (
    permission !==
    "granted"
  ) {
    permission =
      await Notification.requestPermission();
  }

  if (
    permission !==
    "granted"
  ) {
    throw new Error(
      "알림 권한이 허용되지 않았습니다.",
    );
  }

  const registration =
    await getServiceWorkerRegistration();

  let subscription =
    await registration
      .pushManager
      .getSubscription();

  /*
   * 같은 휴대폰에서 이미 다른 업체가
   * Push를 사용 중이라면
   * 기존 subscription을 그대로 공유
   */
  if (
    !subscription
  ) {
    subscription =
      await registration
        .pushManager
        .subscribe({
          userVisibleOnly:
            true,

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
    success:
      true,

    supported:
      true,

    enabled:
      true,

    subscribed:
      true,

    permission,

    userId:
      user.id,

    subscriptionId:
      saved.id,

    endpoint:
      saved.endpoint,
  };
}

/* =========================================================
   현재 계정의 휴대폰 Push 알림 끄기

   중요:
   브라우저 PushSubscription 자체는 해제하지 않습니다.

   이유:
   동일한 휴대폰 endpoint를
   다른 업체 / 다른 사용자 / 슈퍼관리자가
   함께 사용하고 있을 수 있기 때문입니다.

   현재 로그인 사용자와 endpoint의 DB 연결만 삭제합니다.

   예:
   휴대폰 ABC
   ├─ A업체
   ├─ B업체
   └─ 슈퍼관리자

   A업체에서 알림 끄기
   ↓
   A업체 연결만 삭제
   B업체 / 슈퍼관리자 알림은 계속 유지
========================================================= */

export async function disablePushNotifications() {
  if (
    !isPushSupported()
  ) {
    return {
      success:
        true,

      enabled:
        false,

      subscribed:
        false,
    };
  }

  const user =
    await getCurrentUser();

  const registration =
    await getServiceWorkerRegistration();

  const subscription =
    await registration
      .pushManager
      .getSubscription();

  /*
   * 브라우저 subscription 자체가 없다면
   * 이미 비활성 상태
   */
  if (
    !subscription
  ) {
    return {
      success:
        true,

      enabled:
        false,

      subscribed:
        false,

      userId:
        user.id,
    };
  }

  const {
    endpoint,
  } =
    getSubscriptionKeys(
      subscription,
    );

  /*
   * 현재 로그인 사용자의 연결만 삭제
   */
  const {
    error:
      deleteError,
  } =
    await supabase
      .from(
        "push_subscriptions",
      )
      .delete()
      .eq(
        "user_id",
        user.id,
      )
      .eq(
        "endpoint",
        endpoint,
      );

  if (
    deleteError
  ) {
    throw new Error(
      `Push 구독 삭제 실패: ${deleteError.message}`,
    );
  }

  /*
   * 중요:
   * subscription.unsubscribe() 하지 않음.
   *
   * 다른 업체/사용자가 동일한 휴대폰
   * Push endpoint를 사용할 수 있으므로
   * 브라우저 구독 자체는 유지.
   */

  return {
    success:
      true,

    enabled:
      false,

    subscribed:
      false,

    userId:
      user.id,

    endpoint,
  };
}
