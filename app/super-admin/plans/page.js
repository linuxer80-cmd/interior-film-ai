"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "../../../lib/supabase";
import ToolIllustration from "../../components/ui/ToolIllustration";

const LIMIT_FIELDS = [
  ["ai_photo_analysis_limit", "AI 사진분석", "회"],
  ["auto_estimate_limit", "자동견적", "회"],
  ["similar_image_search_limit", "유사이미지 검색", "회"],
  ["virtual_remodel_limit", "가상시공", "회"],
  ["image_upload_limit", "이미지 업로드", "장"],
  ["storage_mb_limit", "저장용량", "MB"],
  ["customer_lead_limit", "고객상담", "건"],
];

const PLAN_ICONS = {
  trial: "🎁",
  light: "🌱",
  basic: "🥉",
  pro: "🥈",
  business: "🥇",
};

export default function PlansPage() {
  const [loading, setLoading] = useState(true);
  const [authorized, setAuthorized] = useState(false);
  const [email, setEmail] = useState("");
  const [plans, setPlans] = useState([]);
  const [saving, setSaving] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    start();
  }, []);

  async function start() {
    setLoading(true);
    setMessage("");

    try {
      const {
        data: authData,
        error: authError,
      } = await supabase.auth.getUser();

      if (authError) throw authError;

      const user = authData?.user;

      if (!user) {
        throw new Error("로그인이 필요합니다.");
      }

      setEmail(user.email || "");

      const {
        data: adminData,
        error: adminError,
      } = await supabase.rpc("get_super_admin_status");

      if (adminError) throw adminError;

      const admin = Array.isArray(adminData)
        ? adminData[0]
        : adminData;

      if (!admin?.is_super_admin) {
        throw new Error("슈퍼관리자 권한이 없습니다.");
      }

      setAuthorized(true);
      await loadPlans();
    } catch (error) {
      console.error("요금제 초기화:", error);
      setMessage(
        `❌ ${error?.message || "페이지를 불러오지 못했습니다."}`
      );
    } finally {
      setLoading(false);
    }
  }

  async function loadPlans() {
    const
