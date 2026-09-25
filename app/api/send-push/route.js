import webpush from "web-push";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

/* =========================================================
   공통 JSON 응답
========================================================= */

function json(data, status = 200) {
  return Response.json(data, {
    status,
  });
}

/* =========================================================
   문자열 정리
========================================================= */

function cleanText(value, fallback = "") {
  if (typeof value !== "string") {
    return fallback;
  }

  const text = value.trim();

  return text || fallback;
}

/* =========================================================
   Supabase Admin Client
========================================================= */

function createAdminClient() {
  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL;

  const serviceRoleKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL이 설정되지 않았습니다.",
    );
  }

  if (!serviceRoleKey) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY가 설정되지 않았습니다.",
    );
  }

  return createClient(
    supabaseUrl,
    serviceRoleKey,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    },
  );
}

/* =========================================================
   VAPID 설정
========================================================= */

function configureWebPush() {
  const publicKey =
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

  const privateKey =
    process.env.VAPID_PRIVATE_KEY;

  if (!publicKey) {
    throw new Error(
      "NEXT_PUBLIC_VAPID_PUBLIC_KEY가 설정되지 않았습니다.",
    );
  }

  if (!privateKey) {
    throw new Error(
      "VAPID_PRIVATE_KEY가 설정되지 않았습니다.",
    );
  }

  webpush.setVapidDetails(
    "https://interior-film-ai.vercel.app",
    publicKey,
    privateKey,
  );
}

/* =========================================================
   Webhook 인증
========================================================= */

function verifyWebhookSecret(request) {
  const expectedSecret =
    process.env.PUSH_WEBHOOK_SECRET;

  const receivedSecret =
    request.headers.get(
      "x-push-secret",
    );

  if (!expectedSecret) {
    throw new Error(
      "PUSH_WEBHOOK_SECRET이 설정되지 않았습니다.",
    );
  }

  return (
    Boolean(receivedSecret) &&
    receivedSecret === expectedSecret
  );
}

/* =========================================================
   Notification 레코드 추출
========================================================= */

function extractNotificationRecord(body) {
  const record =
    body?.record ||
    body?.notification ||
    body;

  if (!record || typeof record !== "object") {
    throw new Error(
      "알림 데이터가 없습니다.",
    );
  }

  return record;
}

/* =========================================================
   알림 클릭 이동주소 생성

   중요:
   1. notification.link가 이미 있으면 그대로 사용
   2. link가 없을 때만 자동 생성
   3. 외부 URL은 허용하지 않음
========================================================= */

function buildNotificationUrl(notification) {
  const explicitLink =
    cleanText(
      notification?.link,
      "",
    );

  /*
   * 기존 link가 정상적인 내부 주소라면
   * 기존 기능 그대로 유지
   */
  if (
    explicitLink &&
    explicitLink.startsWith("/") &&
    !explicitLink.startsWith("//")
  ) {
    return explicitLink;
  }

  const recipientType =
    cleanText(
      notification?.recipient_type,
      "",
    );

  const referenceType =
    cleanText(
      notification?.reference_type,
      "",
    ).toLowerCase();

  const referenceId =
    cleanText(
      notification?.reference_id,
      "",
    );

  const encodedReferenceId =
    referenceId
      ? encodeURIComponent(
          referenceId,
        )
      : "";

  /* =====================================================
     업체 관리자
  ===================================================== */

  if (
    recipientType ===
    "company_admin"
  ) {
    /*
     * 고객 상담
     */
    if (
      encodedReferenceId &&
      [
        "lead",
        "customer_lead",
        "customer_leads",
        "consultation",
      ].includes(
        referenceType,
      )
    ) {
      return `/admin?tab=leads&lead=${encodedReferenceId}`;
    }

    /*
     * 현장
     */
    if (
      encodedReferenceId &&
      [
        "site",
        "sites",
        "site_assignment",
        "site_schedule",
        "site_status",
      ].includes(
        referenceType,
      )
    ) {
      return `/admin?tab=sites&site=${encodedReferenceId}`;
    }

    /*
     * 기존 기본 관리자 페이지
     */
    return "/admin";
  }

  /* =====================================================
     시공자
  ===================================================== */

  if (
    recipientType ===
    "worker"
  ) {
    if (
      encodedReferenceId &&
      [
        "site",
        "sites",
        "site_assignment",
        "site_schedule",
        "site_status",
      ].includes(
        referenceType,
      )
    ) {
      return `/worker?site=${encodedReferenceId}`;
    }

    return "/worker";
  }

  /* =====================================================
     슈퍼관리자
  ===================================================== */

  if (
    recipientType ===
    "super_admin"
  ) {
    /*
     * 업체 관련 알림
     */
    if (
      encodedReferenceId &&
      [
        "company",
        "companies",
      ].includes(
        referenceType,
      )
    ) {
      return `/super-admin/company/${encodedReferenceId}`;
    }

    /*
     * 결제 관련
     */
    if (
      [
        "payment",
        "subscription",
        "billing",
      ].includes(
        referenceType,
      )
    ) {
      return "/super-admin/billing";
    }

    return "/super-admin/notifications";
  }

  return "/";
}

/* =========================================================
   슈퍼관리자 수신자 조회
========================================================= */

async function getSuperAdminUserIds(
  supabase,
) {
  const {
    data,
    error,
  } = await supabase
    .from("super_admins")
    .select("user_id")
    .eq("is_active", true);

  if (error) {
    throw new Error(
      `슈퍼관리자 조회 실패: ${error.message}`,
    );
  }

  return [
    ...new Set(
      (data || [])
        .map(
          (item) =>
            item?.user_id,
        )
        .filter(Boolean),
    ),
  ];
}

/* =========================================================
   회사 관리자(owner) 수신자 조회
========================================================= */

async function getCompanyAdminUserIds(
  supabase,
  companyId,
) {
  if (!companyId) {
    throw new Error(
      "company_admin 알림에는 company_id가 필요합니다.",
    );
  }

  const {
    data,
    error,
  } = await supabase
    .from("profiles")
    .select("id")
    .eq(
      "company_id",
      companyId,
    )
    .eq(
      "role",
      "owner",
    )
    .eq(
      "is_active",
      true,
    );

  if (error) {
    throw new Error(
      `회사 관리자 조회 실패: ${error.message}`,
    );
  }

  return [
    ...new Set(
      (data || [])
        .map(
          (item) =>
            item?.id,
        )
        .filter(Boolean),
    ),
  ];
}

/* =========================================================
   시공자 Push 수신자 조회

   workers.id
   workers.company_id
   workers.user_id
========================================================= */

async function getWorkerUserIds(
  supabase,
  notification,
) {
  const companyId =
    cleanText(
      notification?.company_id,
    );

  const workerId =
    cleanText(
      notification?.recipient_worker_id,
    );

  const recipientUserId =
    cleanText(
      notification?.recipient_user_id,
    );

  if (!companyId) {
    throw new Error(
      "worker 알림에는 company_id가 필요합니다.",
    );
  }

  if (!workerId) {
    throw new Error(
      "worker 알림에는 recipient_worker_id가 필요합니다.",
    );
  }

  let query =
    supabase
      .from("workers")
      .select(
        "id, company_id, user_id, is_active",
      )
      .eq(
        "id",
        workerId,
      )
      .eq(
        "company_id",
        companyId,
      )
      .eq(
        "is_active",
        true,
      );

  if (recipientUserId) {
    query =
      query.eq(
        "user_id",
        recipientUserId,
      );
  }

  const {
    data,
    error,
  } =
    await query.maybeSingle();

  if (error) {
    throw new Error(
      `시공자 Push 수신자 조회 실패: ${error.message}`,
    );
  }

  if (!data) {
    return [];
  }

  if (!data.user_id) {
    return [];
  }

  return [
    data.user_id,
  ];
}

/* =========================================================
   알림 대상 사용자 결정
========================================================= */

async function resolveRecipientUserIds(
  supabase,
  notification,
) {
  const recipientType =
    cleanText(
      notification?.recipient_type,
    );

  const recipientUserId =
    cleanText(
      notification?.recipient_user_id,
    );

  if (
    recipientType ===
    "worker"
  ) {
    return await getWorkerUserIds(
      supabase,
      notification,
    );
  }

  if (recipientUserId) {
    if (
      recipientType ===
      "super_admin"
    ) {
      const {
        data,
        error,
      } =
        await supabase
          .from(
            "super_admins",
          )
          .select(
            "user_id",
          )
          .eq(
            "user_id",
            recipientUserId,
          )
          .eq(
            "is_active",
            true,
          )
          .maybeSingle();

      if (error) {
        throw new Error(
          `슈퍼관리자 수신자 확인 실패: ${error.message}`,
        );
      }

      return data?.user_id
        ? [
            data.user_id,
          ]
        : [];
    }

    if (
      recipientType ===
      "company_admin"
    ) {
      if (
        !notification?.company_id
      ) {
        throw new Error(
          "company_admin 알림에는 company_id가 필요합니다.",
        );
      }

      const {
        data,
        error,
      } =
        await supabase
          .from(
            "profiles",
          )
          .select("id")
          .eq(
            "id",
            recipientUserId,
          )
          .eq(
            "company_id",
            notification.company_id,
          )
          .eq(
            "role",
            "owner",
          )
          .eq(
            "is_active",
            true,
          )
          .maybeSingle();

      if (error) {
        throw new Error(
          `회사 관리자 수신자 확인 실패: ${error.message}`,
        );
      }

      return data?.id
        ? [
            data.id,
          ]
        : [];
    }

    return [];
  }

  if (
    recipientType ===
    "super_admin"
  ) {
    return await getSuperAdminUserIds(
      supabase,
    );
  }

  if (
    recipientType ===
    "company_admin"
  ) {
    return await getCompanyAdminUserIds(
      supabase,
      notification?.company_id,
    );
  }

  throw new Error(
    `지원하지 않는 recipient_type입니다: ${
      recipientType ||
      "없음"
    }`,
  );
}

/* =========================================================
   사용자 Push 구독 조회
========================================================= */

async function getPushSubscriptions(
  supabase,
  userIds,
) {
  if (
    !Array.isArray(
      userIds,
    )
  ) {
    return [];
  }

  const ids = [
    ...new Set(
      userIds.filter(
        Boolean,
      ),
    ),
  ];

  if (
    ids.length === 0
  ) {
    return [];
  }

  const {
    data,
    error,
  } =
    await supabase
      .from(
        "push_subscriptions",
      )
      .select(
        "id, user_id, endpoint, p256dh, auth",
      )
      .in(
        "user_id",
        ids,
      );

  if (error) {
    throw new Error(
      `Push 구독 조회 실패: ${error.message}`,
    );
  }

  return data || [];
}

/* =========================================================
   Push Payload 생성
========================================================= */

function buildPayload(
  notification,
) {
  const title =
    cleanText(
      notification?.title,
      "🔔 새 알림",
    );

  const body =
    cleanText(
      notification?.message,
      "새로운 알림이 도착했습니다.",
    );

  /*
   * 기존 notification.link 우선.
   *
   * link가 없을 때만
   * 역할 / reference_type / reference_id로
   * 자동 목적지 생성.
   */
  const url =
    buildNotificationUrl(
      notification,
    );

  const notificationId =
    cleanText(
      notification?.id,
      "",
    );

  const type =
    cleanText(
      notification?.type,
      "notification",
    );

  return JSON.stringify({
    title,

    body,

    url,

    tag:
      notificationId
        ? `notification-${notificationId}`
        : `${type}-${Date.now()}`,

    notificationId:
      notificationId ||
      null,

    type,

    priority:
      cleanText(
        notification?.priority,
        "info",
      ),
  });
}

/* =========================================================
   만료된 Push 구독 삭제
========================================================= */

async function deleteExpiredSubscription(
  supabase,
  subscriptionId,
) {
  if (!subscriptionId) {
    return;
  }

  const {
    error,
  } =
    await supabase
      .from(
        "push_subscriptions",
      )
      .delete()
      .eq(
        "id",
        subscriptionId,
      );

  if (error) {
    console.error(
      "만료 Push 구독 삭제 실패:",
      error,
    );
  }
}

/* =========================================================
   Push 발송
========================================================= */

async function sendPushToSubscriptions({
  supabase,
  subscriptions,
  payload,
}) {
  let sent = 0;
  let failed = 0;
  let expiredRemoved = 0;

  for (
    const item of
    subscriptions
  ) {
    try {
      if (
        !item?.endpoint ||
        !item?.p256dh ||
        !item?.auth
      ) {
        failed += 1;
        continue;
      }

      await webpush.sendNotification(
        {
          endpoint:
            item.endpoint,

          keys: {
            p256dh:
              item.p256dh,

            auth:
              item.auth,
          },
        },
        payload,
      );

      sent += 1;
    } catch (
      pushError
    ) {
      const statusCode =
        Number(
          pushError?.statusCode,
        ) || 0;

      console.error(
        "Push 발송 실패:",
        {
          subscriptionId:
            item?.id,

          userId:
            item?.user_id,

          statusCode,

          message:
            pushError?.message,
        },
      );

      if (
        statusCode ===
          404 ||
        statusCode ===
          410
      ) {
        await deleteExpiredSubscription(
          supabase,
          item?.id,
        );

        expiredRemoved += 1;
      } else {
        failed += 1;
      }
    }
  }

  return {
    sent,
    failed,
    expiredRemoved,
  };
}

/* =========================================================
   Notification Push 상태 기록
========================================================= */

async function updateNotificationPushStatus({
  supabase,
  notification,
  sent,
  failed,
  errorMessage = null,
}) {
  const notificationId =
    cleanText(
      notification?.id,
      "",
    );

  if (
    !notificationId
  ) {
    return;
  }

  const updateData = {};

  if (
    sent > 0
  ) {
    updateData.push_sent =
      true;

    updateData.push_sent_at =
      new Date().toISOString();

    updateData.push_error =
      null;
  } else {
    updateData.push_sent =
      false;

    if (
      errorMessage
    ) {
      updateData.push_error =
        errorMessage;
    } else if (
      failed > 0
    ) {
      updateData.push_error =
        "Push 발송에 실패했습니다.";
    } else {
      updateData.push_error =
        "등록된 수신 기기가 없습니다.";
    }
  }

  const {
    error,
  } =
    await supabase
      .from(
        "notifications",
      )
      .update(
        updateData,
      )
      .eq(
        "id",
        notificationId,
      );

  if (error) {
    console.error(
      "Notification Push 상태 저장 실패:",
      error,
    );
  }
}

/* =========================================================
   POST
========================================================= */

export async function POST(
  request,
) {
  let supabase =
    null;

  let notification =
    null;

  try {
    /* -------------------------------------------------------
       1. Webhook Secret 확인
    ------------------------------------------------------- */

    if (
      !verifyWebhookSecret(
        request,
      )
    ) {
      return json(
        {
          success:
            false,

          error:
            "Unauthorized",
        },
        401,
      );
    }

    /* -------------------------------------------------------
       2. 서버 설정
    ------------------------------------------------------- */

    configureWebPush();

    supabase =
      createAdminClient();

    /* -------------------------------------------------------
       3. 요청 데이터
    ------------------------------------------------------- */

    const body =
      await request
        .json()
        .catch(
          () => ({}),
        );

    notification =
      extractNotificationRecord(
        body,
      );

    const recipientType =
      cleanText(
        notification?.recipient_type,
      );

    if (
      !recipientType
    ) {
      throw new Error(
        "recipient_type이 없습니다.",
      );
    }

    /* -------------------------------------------------------
       4. 수신자 사용자 UUID 결정
    ------------------------------------------------------- */

    const recipientUserIds =
      await resolveRecipientUserIds(
        supabase,
        notification,
      );

    if (
      recipientUserIds.length ===
      0
    ) {
      let errorMessage =
        "Push 수신 사용자를 찾지 못했습니다.";

      if (
        recipientType ===
        "worker"
      ) {
        errorMessage =
          "시공자 로그인 계정이 연결되지 않았거나 활성 시공자가 아닙니다.";
      }

      await updateNotificationPushStatus({
        supabase,

        notification,

        sent: 0,

        failed: 0,

        errorMessage,
      });

      return json({
        success:
          true,

        sent:
          0,

        recipient_type:
          recipientType,

        recipient_users:
          0,

        message:
          errorMessage,
      });
    }

    /* -------------------------------------------------------
       5. 해당 사용자 기기 조회
    ------------------------------------------------------- */

    const subscriptions =
      await getPushSubscriptions(
        supabase,
        recipientUserIds,
      );

    if (
      subscriptions.length ===
      0
    ) {
      await updateNotificationPushStatus({
        supabase,

        notification,

        sent: 0,

        failed: 0,

        errorMessage:
          "등록된 수신 기기가 없습니다.",
      });

      return json({
        success:
          true,

        sent:
          0,

        recipient_type:
          recipientType,

        recipient_users:
          recipientUserIds.length,

        registered_devices:
          0,

        message:
          "해당 수신자의 등록된 휴대폰이 없습니다.",
      });
    }

    /* -------------------------------------------------------
       6. Payload 생성
    ------------------------------------------------------- */

    const payload =
      buildPayload(
        notification,
      );

    /* -------------------------------------------------------
       7. Push 발송
    ------------------------------------------------------- */

    const result =
      await sendPushToSubscriptions({
        supabase,

        subscriptions,

        payload,
      });

    /* -------------------------------------------------------
       8. Notification 상태 기록
    ------------------------------------------------------- */

    await updateNotificationPushStatus({
      supabase,

      notification,

      sent:
        result.sent,

      failed:
        result.failed,
    });

    /* -------------------------------------------------------
       9. 완료
    ------------------------------------------------------- */

    return json({
      success:
        true,

      recipient_type:
        recipientType,

      recipient_users:
        recipientUserIds.length,

      registered_devices:
        subscriptions.length,

      sent:
        result.sent,

      failed:
        result.failed,

      expired_removed:
        result.expiredRemoved,
    });
  } catch (error) {
    console.error(
      "send-push 오류:",
      error,
    );

    if (
      supabase &&
      notification
    ) {
      await updateNotificationPushStatus({
        supabase,

        notification,

        sent: 0,

        failed: 1,

        errorMessage:
          error?.message ||
          "Push 발송 오류",
      });
    }

    return json(
      {
        success:
          false,

        error:
          error?.message ||
          "Push 발송 오류",
      },
      500,
    );
  }
     }
