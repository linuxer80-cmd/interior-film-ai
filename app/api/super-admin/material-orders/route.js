import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

function createServiceClient() {
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Supabase 환경변수가 설정되지 않았습니다.");
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

function getAccessToken(request) {
  const authorization = request.headers.get("authorization") || "";

  if (!authorization.startsWith("Bearer ")) {
    return "";
  }

  return authorization.slice(7).trim();
}

async function requireSuperAdmin(request) {
  const accessToken = getAccessToken(request);

  if (!accessToken) {
    throw new Error("로그인이 필요합니다.");
  }

  const supabase = createServiceClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser(accessToken);

  if (userError || !user) {
    throw new Error("로그인 정보를 확인할 수 없습니다.");
  }

  const { data: superAdmin, error: adminError } = await supabase
    .from("super_admins")
    .select("user_id, is_active")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .maybeSingle();

  if (adminError) {
    throw new Error(`슈퍼관리자 확인 실패: ${adminError.message}`);
  }

  if (!superAdmin) {
    throw new Error("슈퍼관리자 권한이 없습니다.");
  }

  return {
    supabase,
    user,
  };
}

function errorResponse(error, status = 400) {
  console.error("자재 주문관리 API 오류:", error);

  return NextResponse.json(
    {
      ok: false,
      error: error?.message || "요청 처리 중 오류가 발생했습니다.",
    },
    {
      status,
    }
  );
}

/*
 * 주문 목록 조회
 */
export async function GET(request) {
  try {
    const { supabase } = await requireSuperAdmin(request);

    const { searchParams } = new URL(request.url);

    const status = String(searchParams.get("status") || "").trim();
    const search = String(searchParams.get("search") || "").trim();

    let orderQuery = supabase
      .from("material_orders")
      .select("*")
      .order("created_at", {
        ascending: false,
      })
      .limit(300);

    if (status && status !== "all") {
      orderQuery = orderQuery.eq("status", status);
    }

    if (search) {
      orderQuery = orderQuery.or(
        [
          `order_number.ilike.%${search}%`,
          `recipient_name.ilike.%${search}%`,
          `recipient_phone.ilike.%${search}%`,
        ].join(",")
      );
    }

    const { data: orders, error: ordersError } = await orderQuery;

    if (ordersError) {
      throw new Error(`주문 조회 실패: ${ordersError.message}`);
    }

    if (!orders || orders.length === 0) {
      return NextResponse.json({
        ok: true,
        orders: [],
      });
    }

    const orderIds = orders.map((order) => order.id).filter(Boolean);

    const addressIds = [
      ...new Set(
        orders
          .map((order) => order.shipping_address_id)
          .filter(Boolean)
      ),
    ];

    const { data: items, error: itemsError } = await supabase
      .from("material_order_items")
      .select("*")
      .in("order_id", orderIds)
      .order("created_at", {
        ascending: true,
      });

    if (itemsError) {
      throw new Error(`주문 상품 조회 실패: ${itemsError.message}`);
    }

    let addresses = [];

    if (addressIds.length > 0) {
      const { data, error } = await supabase
        .from("material_shipping_addresses")
        .select("*")
        .in("id", addressIds);

      if (error) {
        throw new Error(`배송지 조회 실패: ${error.message}`);
      }

      addresses = data || [];
    }

    const itemsByOrderId = {};

    for (const item of items || []) {
      if (!itemsByOrderId[item.order_id]) {
        itemsByOrderId[item.order_id] = [];
      }

      itemsByOrderId[item.order_id].push(item);
    }

    const addressById = {};

    for (const address of addresses) {
      addressById[address.id] = address;
    }

    const combinedOrders = orders.map((order) => ({
      ...order,
      items: itemsByOrderId[order.id] || [],
      shipping_address:
        addressById[order.shipping_address_id] || null,
    }));

    return NextResponse.json({
      ok: true,
      orders: combinedOrders,
    });
  } catch (error) {
    const status =
      error?.message === "로그인이 필요합니다." ? 401 :
      error?.message?.includes("권한") ? 403 :
      400;

    return errorResponse(error, status);
  }
}

/*
 * 주문 상태 변경
 */
export async function PATCH(request) {
  try {
    const { supabase, user } = await requireSuperAdmin(request);
    const body = await request.json();

    const orderId = String(body?.orderId || "").trim();
    const nextStatus = String(body?.status || "").trim();
    const memo = String(body?.memo || "").trim().slice(0, 1000);

    const allowedStatuses = [
      "payment_pending",
      "paid",
      "preparing",
      "shipped",
      "delivered",
      "cancel_requested",
      "cancelled",
      "payment_failed",
    ];

    if (!orderId) {
      throw new Error("주문 ID가 없습니다.");
    }

    if (!allowedStatuses.includes(nextStatus)) {
      throw new Error("변경할 주문 상태가 올바르지 않습니다.");
    }

    const { data: currentOrder, error: currentError } = await supabase
      .from("material_orders")
      .select("*")
      .eq("id", orderId)
      .maybeSingle();

    if (currentError) {
      throw new Error(`주문 확인 실패: ${currentError.message}`);
    }

    if (!currentOrder) {
      throw new Error("주문을 찾을 수 없습니다.");
    }

    const updateData = {
      status: nextStatus,
      updated_at: new Date().toISOString(),
    };

    const { data: updatedOrder, error: updateError } = await supabase
      .from("material_orders")
      .update(updateData)
      .eq("id", orderId)
      .select("*")
      .single();

    if (updateError) {
      throw new Error(`주문 상태 변경 실패: ${updateError.message}`);
    }

    /*
     * 상태 이력 저장에 실패해도 주문 상태 변경은 유지합니다.
     */
    const historyResult = await supabase
      .from("material_order_status_history")
      .insert({
        order_id: orderId,
        old_status: currentOrder.status || null,
        new_status: nextStatus,
        changed_by: user.id,
        memo: memo || null,
        created_at: new Date().toISOString(),
      });

    if (historyResult.error) {
      console.warn(
        "주문 상태 이력 저장 실패:",
        historyResult.error.message
      );
    }

    /*
     * 주문한 업체에 상태 변경 알림 저장
     * notifications 구조가 다를 경우 주문 변경에는 영향을 주지 않습니다.
     */
    if (currentOrder.company_id) {
      const notificationResult = await supabase
        .from("notifications")
        .insert({
          company_id: currentOrder.company_id,
          recipient_type: "company_admin",
          type: "material_order_status",
          priority:
            nextStatus === "shipped" || nextStatus === "delivered"
              ? "high"
              : "normal",
          title: "자재 주문 상태가 변경되었습니다.",
          message: `${
            currentOrder.order_number || "자재 주문"
          } 상태가 변경되었습니다.`,
          link: "/admin/material-order",
          reference_type: "material_order",
          reference_id: orderId,
          dedupe_key: `material-order-${orderId}-${nextStatus}`,
          is_read: false,
          push_sent: false,
        });

      if (notificationResult.error) {
        console.warn(
          "업체 알림 저장 실패:",
          notificationResult.error.message
        );
      }
    }

    return NextResponse.json({
      ok: true,
      order: updatedOrder,
      message: "주문 상태가 변경되었습니다.",
    });
  } catch (error) {
    const status =
      error?.message === "로그인이 필요합니다." ? 401 :
      error?.message?.includes("권한") ? 403 :
      400;

    return errorResponse(error, status);
  }
          }
