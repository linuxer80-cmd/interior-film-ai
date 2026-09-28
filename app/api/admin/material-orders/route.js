import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { payWithTossBillingKey } from "../../../utils/tossBilling";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function createServiceClient() {
  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL;

  const serviceRoleKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      "Supabase 서버 환경변수가 설정되지 않았습니다.",
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

function createUserClient(accessToken) {
  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL;

  const anonKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !anonKey) {
    throw new Error(
      "Supabase 공개 환경변수가 설정되지 않았습니다.",
    );
  }

  return createClient(supabaseUrl, anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  });
}

function getAccessToken(request) {
  const authorization =
    request.headers.get("authorization") || "";

  if (!authorization.startsWith("Bearer ")) {
    return "";
  }

  return authorization.slice(7).trim();
}

async function requireCompanyAdmin(request) {
  const accessToken = getAccessToken(request);

  if (!accessToken) {
    return {
      ok: false,
      status: 401,
      error: "로그인이 필요합니다.",
    };
  }

  const serviceClient = createServiceClient();

  const {
    data: { user },
    error: userError,
  } = await serviceClient.auth.getUser(accessToken);

  if (userError || !user) {
    return {
      ok: false,
      status: 401,
      error: "로그인 정보가 올바르지 않습니다.",
    };
  }

  const userClient = createUserClient(accessToken);

  const {
    data: companyRows,
    error: companyError,
  } = await userClient.rpc("get_my_company");

  if (companyError) {
    console.error(
      "업체 확인 오류:",
      companyError,
    );

    return {
      ok: false,
      status: 403,
      error:
        "관리자 업체 정보를 확인하지 못했습니다.",
    };
  }

  const company = Array.isArray(companyRows)
    ? companyRows[0]
    : companyRows;

  if (!company?.company_id) {
    return {
      ok: false,
      status: 403,
      error:
        "업체에 연결된 관리자 계정이 아닙니다.",
    };
  }

  if (company.is_active === false) {
    return {
      ok: false,
      status: 403,
      error: "현재 사용이 중지된 업체입니다.",
    };
  }

  return {
    ok: true,
    user,
    company,
    supabase: serviceClient,
  };
}

function cleanText(value, maxLength = 300) {
  return String(value || "")
    .trim()
    .slice(0, maxLength);
}

function createOrderNumber() {
  const now = new Date();

  const datePart = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("");

  const timePart = [
    String(now.getHours()).padStart(2, "0"),
    String(now.getMinutes()).padStart(2, "0"),
    String(now.getSeconds()).padStart(2, "0"),
  ].join("");

  const randomPart = Math.random()
    .toString(36)
    .slice(2, 8)
    .toUpperCase();

  return `MAT-${datePart}-${timePart}-${randomPart}`;
}

function normalizeItems(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  const itemMap = new Map();

  value.slice(0, 30).forEach((item) => {
    const productId = cleanText(
      item?.productId,
      100,
    );

    const quantityM = Number(item?.quantityM);

    if (
      !productId ||
      !Number.isFinite(quantityM) ||
      quantityM <= 0
    ) {
      return;
    }

    if (itemMap.has(productId)) {
      itemMap.set(
        productId,
        itemMap.get(productId) + quantityM,
      );
    } else {
      itemMap.set(productId, quantityM);
    }
  });

  return [...itemMap.entries()].map(
    ([productId, quantityM]) => ({
      productId,
      quantityM:
        Math.round(quantityM * 100) / 100,
    }),
  );
}

function validateQuantity(product, quantityM) {
  const minimumOrder = Number(
    product.minimum_order_m || 1,
  );

  const orderUnit = Number(
    product.order_unit_m || 1,
  );

  if (quantityM < minimumOrder) {
    throw new Error(
      `${product.product_code}의 최소 주문량은 ` +
        `${minimumOrder}m입니다.`,
    );
  }

  const difference = quantityM - minimumOrder;
  const remainder =
    Math.round(
      ((difference % orderUnit) + orderUnit) %
        orderUnit *
        100,
    ) / 100;

  const allowedError = 0.001;

  if (
    remainder > allowedError &&
    Math.abs(remainder - orderUnit) >
      allowedError
  ) {
    throw new Error(
      `${product.product_code}는 ` +
        `${orderUnit}m 단위로 주문할 수 있습니다.`,
    );
  }
}

function calculateItemAmounts(product, quantityM) {
  const unitPrice = Math.round(
    Number(product.dealer_price_per_m),
  );

  if (
    !Number.isFinite(unitPrice) ||
    unitPrice <= 0
  ) {
    throw new Error(
      `${product.product_code}의 판매단가가 ` +
        "올바르지 않습니다.",
    );
  }

  if (product.price_vat_included === true) {
    const totalAmount = Math.round(
      unitPrice * quantityM,
    );

    const supplyAmount = Math.round(
      totalAmount / 1.1,
    );

    const vatAmount =
      totalAmount - supplyAmount;

    return {
      unitPrice,
      supplyAmount,
      vatAmount,
      totalAmount,
    };
  }

  const supplyAmount = Math.round(
    unitPrice * quantityM,
  );

  const vatAmount = Math.round(
    supplyAmount * 0.1,
  );

  const totalAmount =
    supplyAmount + vatAmount;

  return {
    unitPrice,
    supplyAmount,
    vatAmount,
    totalAmount,
  };
}

async function insertStatusHistory({
  supabase,
  orderId,
  previousStatus,
  newStatus,
  changedBy,
  reason,
}) {
  const { error } = await supabase
    .from("material_order_status_history")
    .insert({
      order_id: orderId,
      previous_status: previousStatus,
      new_status: newStatus,
      changed_by: changedBy || null,
      change_reason: reason || null,
      created_at: new Date().toISOString(),
    });

  if (error) {
    console.error(
      "주문 상태 이력 저장 오류:",
      error,
    );
  }
}

async function notifySuperAdmins({
  supabase,
  companyId,
  order,
  success,
  failureMessage,
}) {
  try {
    const { data: superAdmins, error } =
      await supabase
        .from("super_admins")
        .select("user_id")
        .eq("is_active", true);

    if (error) {
      throw error;
    }

    if (!superAdmins?.length) {
      return;
    }

    const notificationRows = superAdmins.map(
      (superAdmin) => ({
        company_id: companyId,

        recipient_type: "super_admin",
        recipient_user_id: superAdmin.user_id,
        recipient_worker_id: null,

        type: success
          ? "material_order_paid"
          : "material_order_payment_failed",

        priority: success
          ? "success"
          : "critical",

        title: success
          ? "📦 신규 자재 주문"
          : "🚨 자재 주문 결제 실패",

        message: success
          ? `${order.order_number} · ` +
            `${order.item_count}개 제품 · ` +
            `${Number(
              order.total_quantity_m,
            ).toLocaleString("ko-KR")}m · ` +
            `${Number(
              order.total_amount,
            ).toLocaleString("ko-KR")}원`
          : `${order.order_number} · ` +
            `${failureMessage || "결제 실패"}`,

        link: "/super-admin/material-orders",

        reference_type: "material_order",
        reference_id: order.id,

        dedupe_key: success
          ? `material-order-paid:${order.id}`
          : `material-order-failed:${order.id}`,

        is_read: false,
        push_sent: false,
      }),
    );

    const { error: insertError } =
      await supabase
        .from("notifications")
        .insert(notificationRows);

    if (insertError) {
      throw insertError;
    }
  } catch (error) {
    // 알림 실패가 결제 결과를 바꾸면 안 됨
    console.error(
      "슈퍼관리자 자재주문 알림 오류:",
      error,
    );
  }
}

/**
 * GET
 *
 * 현재 업체의 자재 주문내역
 */
export async function GET(request) {
  try {
    const auth =
      await requireCompanyAdmin(request);

    if (!auth.ok) {
      return NextResponse.json(
        {
          ok: false,
          error: auth.error,
        },
        {
          status: auth.status,
        },
      );
    }

    const { searchParams } =
      new URL(request.url);

    const requestedPage = Number(
      searchParams.get("page") || 1,
    );

    const page =
      Number.isInteger(requestedPage) &&
      requestedPage > 0
        ? requestedPage
        : 1;

    const limit = 20;
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    const {
      data,
      error,
      count,
    } = await auth.supabase
      .from("material_orders")
      .select(
        `
          *,
          material_order_items (*)
        `,
        {
          count: "exact",
        },
      )
      .eq(
        "company_id",
        auth.company.company_id,
      )
      .order("created_at", {
        ascending: false,
      })
      .range(from, to);

    if (error) {
      console.error(
        "자재 주문내역 조회 오류:",
        error,
      );

      return NextResponse.json(
        {
          ok: false,
          error:
            "자재 주문내역을 불러오지 못했습니다.",
          detail: error.message,
        },
        {
          status: 500,
        },
      );
    }

    return NextResponse.json({
      ok: true,
      orders: data || [],

      pagination: {
        page,
        limit,
        total: count || 0,
        totalPages: Math.max(
          1,
          Math.ceil((count || 0) / limit),
        ),
      },
    });
  } catch (error) {
    console.error(
      "자재 주문내역 API 오류:",
      error,
    );

    return NextResponse.json(
      {
        ok: false,
        error:
          error?.message ||
          "자재 주문내역을 불러오지 못했습니다.",
      },
      {
        status: 500,
      },
    );
  }
}

/**
 * POST
 *
 * 주문 생성 → 서버 가격 검증 → 기존 등록카드 결제
 *
 * 요청 예:
 * {
 *   "addressId": "배송지 UUID",
 *   "deliveryNote": "문 앞에 놓아주세요",
 *   "items": [
 *     {
 *       "productId": "film_products ID",
 *       "quantityM": 10
 *     }
 *   ]
 * }
 */
export async function POST(request) {
  let createdOrder = null;

  try {
    const auth =
      await requireCompanyAdmin(request);

    if (!auth.ok) {
      return NextResponse.json(
        {
          ok: false,
          error: auth.error,
        },
        {
          status: auth.status,
        },
      );
    }

    const body = await request.json();

    const addressId = cleanText(
      body?.addressId,
      100,
    );

    const deliveryNote = cleanText(
      body?.deliveryNote,
      300,
    );

    const requestedItems = normalizeItems(
      body?.items,
    );

    if (!addressId) {
      return NextResponse.json(
        {
          ok: false,
          error: "배송지를 선택해주세요.",
        },
        {
          status: 400,
        },
      );
    }

    if (requestedItems.length === 0) {
      return NextResponse.json(
        {
          ok: false,
          error: "주문할 제품을 담아주세요.",
        },
        {
          status: 400,
        },
      );
    }

    const {
      data: address,
      error: addressError,
    } = await auth.supabase
      .from("material_shipping_addresses")
      .select("*")
      .eq("id", addressId)
      .eq(
        "company_id",
        auth.company.company_id,
      )
      .eq("is_active", true)
      .maybeSingle();

    if (addressError) {
      console.error(
        "배송지 조회 오류:",
        addressError,
      );
    }

    if (!address) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "선택한 배송지를 찾을 수 없습니다.",
        },
        {
          status: 400,
        },
      );
    }

    const productIds = requestedItems.map(
      (item) => item.productId,
    );

    const {
      data: products,
      error: productsError,
    } = await auth.supabase
      .from("film_products")
      .select("*")
      .in("id", productIds)
      .eq("is_order_available", true)
      .eq("stock_status", "in_stock");

    if (productsError) {
      console.error(
        "주문 제품 확인 오류:",
        productsError,
      );

      return NextResponse.json(
        {
          ok: false,
          error:
            "주문 제품을 확인하지 못했습니다.",
        },
        {
          status: 500,
        },
      );
    }

    if (
      !products ||
      products.length !== productIds.length
    ) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "판매가 중지되거나 품절된 제품이 있습니다.",
        },
        {
          status: 400,
        },
      );
    }

    const productMap = new Map(
      products.map((product) => [
        String(product.id),
        product,
      ]),
    );

    let supplyAmount = 0;
    let vatAmount = 0;
    let totalAmount = 0;
    let totalQuantityM = 0;

    const orderItems = requestedItems.map(
      (requestedItem) => {
        const product = productMap.get(
          String(requestedItem.productId),
        );

        if (!product) {
          throw new Error(
            "주문할 제품을 찾을 수 없습니다.",
          );
        }

        validateQuantity(
          product,
          requestedItem.quantityM,
        );

        const amounts = calculateItemAmounts(
          product,
          requestedItem.quantityM,
        );

        supplyAmount += amounts.supplyAmount;
        vatAmount += amounts.vatAmount;
        totalAmount += amounts.totalAmount;
        totalQuantityM +=
          requestedItem.quantityM;

        return {
          film_product_id: String(product.id),

          brand: product.brand,
          product_code: product.product_code,
          product_name:
            product.product_name || null,

          sample_image_path:
            product.sample_image_path || null,

          flame_type:
            product.flame_type || null,

          quantity_m:
            requestedItem.quantityM,

          unit_price_per_m:
            amounts.unitPrice,

          price_vat_included:
            product.price_vat_included === true,

          supply_amount:
            amounts.supplyAmount,

          vat_amount:
            amounts.vatAmount,

          total_amount:
            amounts.totalAmount,

          created_at:
            new Date().toISOString(),
        };
      },
    );

    if (
      !Number.isInteger(totalAmount) ||
      totalAmount <= 0
    ) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "최종 결제금액이 올바르지 않습니다.",
        },
        {
          status: 400,
        },
      );
    }

    const {
      data: billingCustomer,
      error: billingError,
    } = await auth.supabase
      .from("billing_customers")
      .select(
        [
          "company_id",
          "customer_key",
          "billing_key",
          "card_company",
          "card_number_masked",
          "is_active",
        ].join(","),
      )
      .eq(
        "company_id",
        auth.company.company_id,
      )
      .eq("is_active", true)
      .not("billing_key", "is", null)
      .order("created_at", {
        ascending: false,
      })
      .limit(1)
      .maybeSingle();

    if (billingError) {
      console.error(
        "등록카드 확인 오류:",
        billingError,
      );
    }

    if (
      !billingCustomer?.billing_key ||
      !billingCustomer?.customer_key
    ) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "등록된 결제카드가 없습니다. " +
            "결제관리에서 카드를 먼저 등록해주세요.",
          code: "BILLING_CARD_NOT_FOUND",
        },
        {
          status: 400,
        },
      );
    }

    const orderNumber = createOrderNumber();

    const {
      data: order,
      error: orderError,
    } = await auth.supabase
      .from("material_orders")
      .insert({
        order_number: orderNumber,

        company_id:
          auth.company.company_id,

        ordered_by: auth.user.id,

        status: "payment_pending",
        payment_status: "pending",

        supply_amount: supplyAmount,
        vat_amount: vatAmount,
        total_amount: totalAmount,

        total_quantity_m:
          Math.round(totalQuantityM * 100) / 100,

        item_count: orderItems.length,

        shipping_address_id: address.id,
        recipient_name: address.recipient_name,
        recipient_phone:
          address.recipient_phone,
        postal_code: address.postal_code || null,
        address_line1: address.address_line1,
        address_line2:
          address.address_line2 || null,

        delivery_note:
          deliveryNote ||
          address.delivery_note ||
          null,

        toss_order_id: orderNumber,

        billing_key_reference:
          `company:${auth.company.company_id}`,

        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select("*")
      .single();

    if (orderError || !order) {
      console.error(
        "자재 주문 생성 오류:",
        orderError,
      );

      return NextResponse.json(
        {
          ok: false,
          error: "주문서를 생성하지 못했습니다.",
          detail: orderError?.message,
        },
        {
          status: 500,
        },
      );
    }

    createdOrder = order;

    const {
      error: itemInsertError,
    } = await auth.supabase
      .from("material_order_items")
      .insert(
        orderItems.map((item) => ({
          ...item,
          order_id: order.id,
        })),
      );

    if (itemInsertError) {
      console.error(
        "주문상품 저장 오류:",
        itemInsertError,
      );

      await auth.supabase
        .from("material_orders")
        .update({
          status: "payment_failed",
          payment_status: "failed",
          payment_failed_at:
            new Date().toISOString(),
          payment_failure_code:
            "ORDER_ITEM_SAVE_FAILED",
          payment_failure_message:
            "주문상품 저장 실패",
          updated_at: new Date().toISOString(),
        })
        .eq("id", order.id);

      await insertStatusHistory({
        supabase: auth.supabase,
        orderId: order.id,
        previousStatus: "payment_pending",
        newStatus: "payment_failed",
        changedBy: auth.user.id,
        reason: "주문상품 저장 실패",
      });

      return NextResponse.json(
        {
          ok: false,
          error:
            "주문상품을 저장하지 못해 결제를 진행하지 않았습니다.",
        },
        {
          status: 500,
        },
      );
    }

    const companyName =
      cleanText(
        auth.company.company_name,
        50,
      ) || "업체";

    const firstCode =
      orderItems[0]?.product_code || "자재";

    const orderName =
      orderItems.length === 1
        ? `${firstCode} 인테리어필름`
        : `${firstCode} 외 ${
            orderItems.length - 1
          }건`;

    let paymentResult;

    try {
      paymentResult = await payWithTossBillingKey({
        billingKey:
          billingCustomer.billing_key,

        customerKey:
          billingCustomer.customer_key,

        amount: totalAmount,

        orderId: orderNumber,

        orderName,

        customerEmail:
          auth.user.email || undefined,

        customerName:
          companyName,

        idempotencyKey:
          `material-order-${order.id}`,
      });
    } catch (paymentError) {
      const failureCode =
        cleanText(
          paymentError?.code,
          100,
        ) || "TOSS_PAYMENT_FAILED";

      const failureMessage =
        cleanText(
          paymentError?.message,
          500,
        ) || "토스 결제에 실패했습니다.";

      await auth.supabase
        .from("material_orders")
        .update({
          status: "payment_failed",
          payment_status: "failed",
          payment_failed_at:
            new Date().toISOString(),
          payment_failure_code: failureCode,
          payment_failure_message:
            failureMessage,
          updated_at: new Date().toISOString(),
        })
        .eq("id", order.id);

      await insertStatusHistory({
        supabase: auth.supabase,
        orderId: order.id,
        previousStatus: "payment_pending",
        newStatus: "payment_failed",
        changedBy: auth.user.id,
        reason: failureMessage,
      });

      await notifySuperAdmins({
        supabase: auth.supabase,
        companyId:
          auth.company.company_id,
        order,
        success: false,
        failureMessage,
      });

      return NextResponse.json(
        {
          ok: false,
          error: failureMessage,
          code: failureCode,
          orderId: order.id,
          orderNumber: order.order_number,
        },
        {
          status:
            Number(paymentError?.status) >= 400
              ? Number(paymentError.status)
              : 400,
        },
      );
    }

    const paymentApprovedAt =
      paymentResult?.approvedAt ||
      new Date().toISOString();

    const paymentMethod =
      paymentResult?.method ||
      paymentResult?.card?.issuerCode ||
      billingCustomer.card_company ||
      "카드";

    const {
      data: paidOrder,
      error: paidUpdateError,
    } = await auth.supabase
      .from("material_orders")
      .update({
        status: "paid",
        payment_status: "paid",

        payment_key:
          paymentResult?.paymentKey || null,

        payment_method: paymentMethod,

        payment_approved_at:
          paymentApprovedAt,

        payment_failure_code: null,
        payment_failure_message: null,

        updated_at: new Date().toISOString(),
      })
      .eq("id", order.id)
      .select("*")
      .single();

    if (paidUpdateError) {
      console.error(
        "결제완료 주문 업데이트 오류:",
        paidUpdateError,
      );

      return NextResponse.json(
        {
          ok: false,
          error:
            "결제는 완료됐지만 주문 상태 저장에 실패했습니다. " +
            "슈퍼관리자에게 문의해주세요.",
          code: "ORDER_PAYMENT_SAVE_FAILED",
          paymentKey:
            paymentResult?.paymentKey || null,
          orderId: order.id,
          orderNumber: order.order_number,
        },
        {
          status: 500,
        },
      );
    }

    await insertStatusHistory({
      supabase: auth.supabase,
      orderId: order.id,
      previousStatus: "payment_pending",
      newStatus: "paid",
      changedBy: auth.user.id,
      reason: "등록카드 결제 완료",
    });

    await notifySuperAdmins({
      supabase: auth.supabase,
      companyId:
        auth.company.company_id,
      order: paidOrder,
      success: true,
    });

    return NextResponse.json({
      ok: true,
      message:
        "결제가 완료되어 자재 주문이 접수됐습니다.",

      order: {
        id: paidOrder.id,
        orderNumber:
          paidOrder.order_number,
        status: paidOrder.status,
        paymentStatus:
          paidOrder.payment_status,
        supplyAmount:
          paidOrder.supply_amount,
        vatAmount:
          paidOrder.vat_amount,
        totalAmount:
          paidOrder.total_amount,
        totalQuantityM:
          paidOrder.total_quantity_m,
        itemCount:
          paidOrder.item_count,
        paymentApprovedAt:
          paidOrder.payment_approved_at,
      },
    });
  } catch (error) {
    console.error(
      "자재 주문 결제 API 오류:",
      error,
    );

    return NextResponse.json(
      {
        ok: false,
        error:
          error?.message ||
          "자재 주문을 처리하지 못했습니다.",
        orderId: createdOrder?.id || null,
      },
      {
        status: 500,
      },
    );
  }
      }
