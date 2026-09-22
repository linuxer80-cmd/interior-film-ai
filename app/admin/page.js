"use client";

import {
  useEffect,
  useRef,
  useState,
} from "react";

import { supabase } from "../../lib/supabase";

import PhotoPreviewModal from "./PhotoPreviewModal";
import AdminTabs from "./AdminTabs";
import NewLeadAlert from "./NewLeadAlert";
import JobsTab from "./JobsTab";
import RegisterTab from "./RegisterTab";
import UsageTab from "./UsageTab";
import LeadsTab from "./LeadsTab";
import SiteManagementTab from "./SiteManagementTab";

import useAdminCompany from "./hooks/useAdminCompany";
import useJobs from "./hooks/useJobs";
import useJobRegister from "./hooks/useJobRegister";
import useLeads from "./hooks/useLeads";
import useUsage from "./hooks/useUsage";
import useCompanySettings from "./hooks/useCompanySettings";
import useWorkers from "./hooks/useWorkers";

import useSites from "../hooks/useSites";

import {
  JOB_PAGE_SIZE,
} from "./adminConstants";

export default function AdminPage() {
  /* =========================================================
     화면 공통 상태
  ========================================================= */

  const [
    activeTab,
    setActiveTab,
  ] = useState("jobs");

  const activeTabRef =
    useRef("jobs");

  const [
    previewPhoto,
    setPreviewPhoto,
  ] = useState(null);

  /* =========================================================
     회사 / 로그인
  ========================================================= */

  const companyHook =
    useAdminCompany();

  const {
    adminReady,
    adminError,

    companyId,
    companyName,

    customerEstimateUrl,

    copyMessage,

    initializeCompany,
    markAdminReady,

    copyCustomerEstimateUrl,
    openCustomerEstimatePage,
  } = companyHook;

  /* =========================================================
     시공 DB
  ========================================================= */

  const jobsHook =
    useJobs({
      companyId,
      setPreviewPhoto,
    });

  const {
    jobs,
    jobsLoading,
    jobsMessage,

    jobSearch,
    setJobSearch,
    jobSearchApplied,

    jobPage,
    jobTotal,

    openJobId,

    jobPhotos,
    jobPhotoLoadingId,

    jobPhotoUrls,
    loadingPhotoId,

    editingId,

    editCategory,
    setEditCategory,

    editSubCategory,
    setEditSubCategory,

    editCost,
    setEditCost,

    editMemo,
    setEditMemo,

    editingPhotoId,

    editPhotoType,
    setEditPhotoType,

    editPhotoCategory,
    setEditPhotoCategory,

    editPhotoSubCategory,
    setEditPhotoSubCategory,

    editPhotoDescription,
    setEditPhotoDescription,

    photoEditLoading,

    loadJobs,
    searchJobs,
    clearJobSearch,

    toggleJobDetail,

    loadSingleJobPhoto,
    openJobPhoto,

    startEdit,
    cancelEdit,
    saveJobEdit,

    startPhotoEdit,
    cancelPhotoEdit,
    savePhotoEdit,

    deletePhoto,
    deleteJob,
  } = jobsHook;

  const totalJobPages =
    Math.max(
      1,
      Math.ceil(
        jobTotal /
          JOB_PAGE_SIZE,
      ),
    );

  /* =========================================================
     현장 관리
  ========================================================= */

  const {
    sites,
    sitesLoading,
    sitesMessage,

    selectedSite,

    loadSites,
    createSite,
    updateSiteStatus,

    openSite,
    closeSite,
  } =
    useSites({
      companyId,
    });

  /* =========================================================
     시공자 관리
  ========================================================= */

  const {
    workers,
    workersLoading,
    workersMessage,

    loadWorkers,
    createWorker,
    updateWorker,
    setWorkerActive,

    createWorkerInvite,

    assignSiteWorkers,
    loadSiteWorkers,
  } =
    useWorkers({
      companyId,
    });

  /* =========================================================
     고객 상담
  ========================================================= */

  const leadsHook =
    useLeads({
      companyId,
      companyName,
      activeTabRef,
    });

  const {
    leads,
    leadsLoading,
    leadsMessage,

    leadPage,
    leadTotal,
    totalLeadPages,

    leadFilter,
    setLeadFilter,

    unreadCount,

    openLeadId,

    leadPhotoUrls,
    leadPhotoLoadingId,

    newLeadAlert,
    setNewLeadAlert,

    notificationEnabled,

    loadUnreadCount,
    loadLeads,

    toggleLeadDetail,
    loadLeadPhotos,

    updateLeadStatus,
    saveLeadMemo,
    updateLeadLocal,
    saveFinalQuote,

    handleRealtimeLead,
    enableNotifications,
    syncNotificationPermission,
  } = leadsHook;

  /* =========================================================
     사용 로그
  ========================================================= */

  const usageHook =
    useUsage({
      companyId,
    });

  const {
    usageStats,
    usageRecent,
    usageLoading,
    usageMessage,

    openUsagePhotoId,
    usagePhotoUrls,
    usagePhotoLoadingId,

    loadUsageStats,
    toggleUsagePhotos,
  } = usageHook;

  /* =========================================================
     회사 설정
  ========================================================= */

  const settingsHook =
    useCompanySettings({
      companyId,
    });

  const {
    similarityThreshold,
    setSimilarityThreshold,

    settingMessage,
    settingLoading,

    loadSettings,
    saveSimilaritySetting,
  } = settingsHook;

  /* =========================================================
     시공 등록
  ========================================================= */

  const registerHook =
    useJobRegister({
      companyId,

      loadJobs,

      jobSearchApplied,

      onSaved: () => {
        activeTabRef.current =
          "jobs";

        setActiveTab(
          "jobs",
        );
      },
    });

  const {
    beforeImages,
    setBeforeImages,

    afterImages,
    setAfterImages,

    category,
    setCategory,

    actualCost,
    setActualCost,

    material,
    setMaterial,

    memo,
    setMemo,

    message,

    loading,

    handleBeforeFiles,
    handleAfterFiles,

    removeBeforeImage,
    removeAfterImage,

    handleSave,
  } = registerHook;

  /* =========================================================
     탭 변경
  ========================================================= */

  function changeTab(tab) {
    activeTabRef.current =
      tab;

    setActiveTab(tab);

    if (
      tab === "sites"
    ) {
      loadSites(
        companyId,
      );

      loadWorkers(
        companyId,
      );
    }

    if (
      tab === "usage"
    ) {
      loadUsageStats();
    }

    if (
      tab === "leads"
    ) {
      loadLeads(
        1,
        leadFilter,
        companyId,
      );
    }
  }

  useEffect(() => {
    activeTabRef.current =
      activeTab;
  }, [activeTab]);

  /* =========================================================
     관리자 초기화
  ========================================================= */

  useEffect(() => {
    let mounted = true;

    async function initializeAdmin() {
      const result =
        await initializeCompany();

      if (!mounted) {
        return;
      }

      if (!result) {
        markAdminReady();
        return;
      }

      const resolvedCompanyId =
        result.companyId;

      try {
        await Promise.all([
          loadSettings(
            resolvedCompanyId,
          ),

          loadJobs(
            1,
            "",
            resolvedCompanyId,
          ),

          loadUnreadCount(
            resolvedCompanyId,
          ),
        ]);

        if (!mounted) {
          return;
        }

        syncNotificationPermission();

        markAdminReady();
      } catch (error) {
        console.error(
          "관리자 데이터 초기화:",
          error,
        );

        if (mounted) {
          markAdminReady();
        }
      }
    }

    initializeAdmin();

    return () => {
      mounted = false;
    };
  }, []);

  /* =========================================================
     회사 ID 반영 후 시공 DB 재조회
  ========================================================= */

  useEffect(() => {
    if (!companyId) {
      return;
    }

    loadJobs(
      1,
      "",
      companyId,
    );
  }, [companyId]);

  /* =========================================================
     신규 상담 실시간 구독
  ========================================================= */

  useEffect(() => {
    if (!companyId) {
      return;
    }

    const channel =
      supabase
        .channel(
          `customer-leads-admin-realtime-${companyId}`,
        )
        .on(
          "postgres_changes",
          {
            event:
              "INSERT",

            schema:
              "public",

            table:
              "customer_leads",

            filter:
              `company_id=eq.${companyId}`,
          },
          (payload) => {
            handleRealtimeLead(
              payload.new,
              companyId,
            );
          },
        )
        .subscribe();

    return () => {
      supabase.removeChannel(
        channel,
      );
    };
  }, [
    companyId,
    companyName,
  ]);

  /* =========================================================
     관리자 로딩
  ========================================================= */

  if (!adminReady) {
    return (
      <main
        style={{
          maxWidth:
            "900px",

          margin:
            "0 auto",

          padding:
            "40px 16px",

          minHeight:
            "100vh",

          background:
            "#f8fafc",

          color:
            "#111827",
        }}
      >
        관리자 정보를 확인하고 있습니다...
      </main>
    );
  }

  /* =========================================================
     화면
  ========================================================= */

  return (
    <main
      style={{
        maxWidth:
          "900px",

        margin:
          "0 auto",

        padding:
          "16px 14px 80px",

        background:
          "#f8fafc",

        minHeight:
          "100vh",

        color:
          "#111827",
      }}
    >
      {/* =====================================================
          신규 상담 알림
      ===================================================== */}

      <NewLeadAlert
        newLeadAlert={
          newLeadAlert
        }
        setNewLeadAlert={
          setNewLeadAlert
        }
        changeTab={
          changeTab
        }
      />

      {/* =====================================================
          관리자 제목
      ===================================================== */}

      <h1
        style={{
          fontSize:
            "24px",

          margin:
            "8px 0 12px",
        }}
      >
        {companyName} 관리자
      </h1>

      {/* =====================================================
          관리자 초기화 오류
      ===================================================== */}

      {adminError && (
        <div
          style={{
            padding:
              "12px",

            marginBottom:
              "14px",

            borderRadius:
              "10px",

            border:
              "1px solid #fecaca",

            background:
              "#fef2f2",

            color:
              "#b91c1c",

            fontSize:
              "13px",

            fontWeight:
              "600",

            whiteSpace:
              "pre-wrap",
          }}
        >
          {adminError}
        </div>
      )}

      {/* =====================================================
          회사별 고객 AI 견적 페이지
      ===================================================== */}

      {customerEstimateUrl && (
        <section
          style={{
            background:
              "#ffffff",

            border:
              "1px solid #e5e7eb",

            borderRadius:
              "14px",

            padding:
              "14px",

            marginBottom:
              "16px",

            boxShadow:
              "0 1px 3px rgba(0,0,0,0.05)",
          }}
        >
          <div
            style={{
              fontSize:
                "15px",

              fontWeight:
                "700",

              marginBottom:
                "8px",
            }}
          >
            고객 AI 견적 페이지
          </div>

          <div
            style={{
              fontSize:
                "12px",

              color:
                "#64748b",

              marginBottom:
                "8px",
            }}
          >
            블로그, 홈페이지, 문자, 카카오톡 등에 아래 주소를 게시하세요.
          </div>

          <div
            style={{
              padding:
                "10px 12px",

              background:
                "#f8fafc",

              border:
                "1px solid #e2e8f0",

              borderRadius:
                "9px",

              fontSize:
                "13px",

              lineHeight:
                "1.5",

              wordBreak:
                "break-all",

              marginBottom:
                "10px",

              userSelect:
                "all",
            }}
          >
            {customerEstimateUrl}
          </div>

          <div
            style={{
              display:
                "grid",

              gridTemplateColumns:
                "1fr 1fr",

              gap:
                "8px",
            }}
          >
            <button
              type="button"
              onClick={
                openCustomerEstimatePage
              }
              style={{
                width:
                  "100%",

                border:
                  "none",

                borderRadius:
                  "9px",

                padding:
                  "11px 8px",

                background:
                  "#111827",

                color:
                  "#ffffff",

                fontWeight:
                  "700",

                fontSize:
                  "14px",

                cursor:
                  "pointer",
              }}
            >
              고객페이지 열기
            </button>

            <button
              type="button"
              onClick={
                copyCustomerEstimateUrl
              }
              style={{
                width:
                  "100%",

                border:
                  "1px solid #cbd5e1",

                borderRadius:
                  "9px",

                padding:
                  "11px 8px",

                background:
                  "#ffffff",

                color:
                  "#111827",

                fontWeight:
                  "700",

                fontSize:
                  "14px",

                cursor:
                  "pointer",
              }}
            >
              주소 복사
            </button>
          </div>

          {copyMessage && (
            <div
              style={{
                marginTop:
                  "9px",

                fontSize:
                  "13px",

                fontWeight:
                  "600",

                color:
                  copyMessage.startsWith(
                    "✅",
                  )
                    ? "#166534"
                    : "#b91c1c",
              }}
            >
              {copyMessage}
            </div>
          )}
        </section>
      )}

      {/* =====================================================
          탭
      ===================================================== */}

      <AdminTabs
        activeTab={
          activeTab
        }
        changeTab={
          changeTab
        }
        unreadCount={
          unreadCount
        }
      />

      {/* =====================================================
          시공 DB
      ===================================================== */}

      {activeTab ===
        "jobs" && (
        <JobsTab
          jobSearch={
            jobSearch
          }
          setJobSearch={
            setJobSearch
          }
          searchJobs={
            searchJobs
          }
          clearJobSearch={
            clearJobSearch
          }
          jobSearchApplied={
            jobSearchApplied
          }
          jobTotal={
            jobTotal
          }
          jobsMessage={
            jobsMessage
          }

          jobsLoading={
            jobsLoading
          }
          jobs={
            jobs
          }

          editingId={
            editingId
          }

          editCategory={
            editCategory
          }
          setEditCategory={
            setEditCategory
          }

          editSubCategory={
            editSubCategory
          }
          setEditSubCategory={
            setEditSubCategory
          }

          editCost={
            editCost
          }
          setEditCost={
            setEditCost
          }

          editMemo={
            editMemo
          }
          setEditMemo={
            setEditMemo
          }

          saveJobEdit={
            saveJobEdit
          }
          cancelEdit={
            cancelEdit
          }
          startEdit={
            startEdit
          }
          deleteJob={
            deleteJob
          }

          openJobId={
            openJobId
          }
          toggleJobDetail={
            toggleJobDetail
          }

          jobPhotoLoadingId={
            jobPhotoLoadingId
          }
          jobPhotos={
            jobPhotos
          }

          jobPhotoUrls={
            jobPhotoUrls
          }
          loadingPhotoId={
            loadingPhotoId
          }

          loadSingleJobPhoto={
            loadSingleJobPhoto
          }
          openJobPhoto={
            openJobPhoto
          }

          editingPhotoId={
            editingPhotoId
          }

          editPhotoType={
            editPhotoType
          }
          setEditPhotoType={
            setEditPhotoType
          }

          editPhotoCategory={
            editPhotoCategory
          }
          setEditPhotoCategory={
            setEditPhotoCategory
          }

          editPhotoSubCategory={
            editPhotoSubCategory
          }
          setEditPhotoSubCategory={
            setEditPhotoSubCategory
          }

          editPhotoDescription={
            editPhotoDescription
          }
          setEditPhotoDescription={
            setEditPhotoDescription
          }

          photoEditLoading={
            photoEditLoading
          }

          startPhotoEdit={
            startPhotoEdit
          }
          cancelPhotoEdit={
            cancelPhotoEdit
          }
          savePhotoEdit={
            savePhotoEdit
          }
          deletePhoto={
            deletePhoto
          }

          jobPage={
            jobPage
          }
          totalJobPages={
            totalJobPages
          }
          loadJobs={
            loadJobs
          }
        />
      )}
      {/* =====================================================
          시공 등록
      ===================================================== */}

      {activeTab ===
        "register" && (
        <RegisterTab
          category={
            category
          }
          setCategory={
            setCategory
          }

          actualCost={
            actualCost
          }
          setActualCost={
            setActualCost
          }

          material={
            material
          }
          setMaterial={
            setMaterial
          }

          memo={
            memo
          }
          setMemo={
            setMemo
          }

          beforeImages={
            beforeImages
          }
          setBeforeImages={
            setBeforeImages
          }

          afterImages={
            afterImages
          }
          setAfterImages={
            setAfterImages
          }

          handleBeforeFiles={
            handleBeforeFiles
          }
          handleAfterFiles={
            handleAfterFiles
          }

          removeBeforeImage={
            removeBeforeImage
          }
          removeAfterImage={
            removeAfterImage
          }

          loading={
            loading
          }
          handleSave={
            handleSave
          }
          message={
            message
          }

          similarityThreshold={
            similarityThreshold
          }
          setSimilarityThreshold={
            setSimilarityThreshold
          }

          settingLoading={
            settingLoading
          }
          saveSimilaritySetting={
            saveSimilaritySetting
          }
          settingMessage={
            settingMessage
          }
        />
      )}

      {/* =====================================================
          현장 관리
      ===================================================== */}

      {activeTab ===
        "sites" && (
        <SiteManagementTab
          companyId={
            companyId
          }

          sites={
            sites
          }
          sitesLoading={
            sitesLoading
          }
          sitesMessage={
            sitesMessage
          }

          createSite={
            createSite
          }

          updateSiteStatus={
            updateSiteStatus
          }

          selectedSite={
            selectedSite
          }

          openSite={
            openSite
          }
          closeSite={
            closeSite
          }

          workers={
            workers
          }
          workersLoading={
            workersLoading
          }
          workersMessage={
            workersMessage
          }

          loadWorkers={
            loadWorkers
          }
          createWorker={
            createWorker
          }
          updateWorker={
            updateWorker
          }
          setWorkerActive={
            setWorkerActive
          }

          createWorkerInvite={
            createWorkerInvite
          }

          assignSiteWorkers={
            assignSiteWorkers
          }
          loadSiteWorkers={
            loadSiteWorkers
          }

          reloadSites={() =>
            loadSites(
              companyId,
            )
          }
        />
      )}

      {/* =====================================================
          로그 분석
      ===================================================== */}

      {activeTab ===
        "usage" && (
        <UsageTab
          usageStats={
            usageStats
          }
          usageMessage={
            usageMessage
          }
          usageLoading={
            usageLoading
          }
          loadUsageStats={
            loadUsageStats
          }

          usageRecent={
            usageRecent
          }

          usagePhotoUrls={
            usagePhotoUrls
          }
          openUsagePhotoId={
            openUsagePhotoId
          }
          usagePhotoLoadingId={
            usagePhotoLoadingId
          }
          toggleUsagePhotos={
            toggleUsagePhotos
          }

          setPreviewPhoto={
            setPreviewPhoto
          }
        />
      )}

      {/* =====================================================
          고객 상담
      ===================================================== */}

      {activeTab ===
        "leads" && (
        <LeadsTab
          leadFilter={
            leadFilter
          }
          setLeadFilter={
            setLeadFilter
          }

          loadLeads={
            loadLeads
          }

          leadTotal={
            leadTotal
          }
          unreadCount={
            unreadCount
          }

          notificationEnabled={
            notificationEnabled
          }
          enableNotifications={
            enableNotifications
          }

          leadsMessage={
            leadsMessage
          }
          leadsLoading={
            leadsLoading
          }
          leads={
            leads
          }

          updateLeadStatus={
            updateLeadStatus
          }

          openLeadId={
            openLeadId
          }
          toggleLeadDetail={
            toggleLeadDetail
          }

          leadPhotoUrls={
            leadPhotoUrls
          }
          leadPhotoLoadingId={
            leadPhotoLoadingId
          }
          loadLeadPhotos={
            loadLeadPhotos
          }

          setPreviewPhoto={
            setPreviewPhoto
          }

          saveLeadMemo={
            saveLeadMemo
          }
          updateLeadLocal={
            updateLeadLocal
          }
          saveFinalQuote={
            saveFinalQuote
          }

          leadPage={
            leadPage
          }
          totalLeadPages={
            totalLeadPages
          }
        />
      )}

      {/* =====================================================
          사진 확대
      ===================================================== */}

      <PhotoPreviewModal
        previewPhoto={
          previewPhoto
        }
        setPreviewPhoto={
          setPreviewPhoto
        }
      />
    </main>
  );
}
