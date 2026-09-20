"use client";

import {
  useEffect,
  useRef,
  useState,
} from "react";

import {
  supabase,
} from "../../lib/supabase";

import {
  JOB_PAGE_SIZE,
} from "./adminConstants";

/* =========================================================
   화면 컴포넌트
========================================================= */

import PhotoPreviewModal from "./PhotoPreviewModal";
import AdminTabs from "./AdminTabs";
import NewLeadAlert from "./NewLeadAlert";

import JobsTab from "./JobsTab";
import RegisterTab from "./RegisterTab";
import UsageTab from "./UsageTab";
import LeadsTab from "./LeadsTab";
import SiteManagementTab from "./SiteManagementTab";

/* =========================================================
   관리자 hooks
========================================================= */

import useAdminCompany from "./hooks/useAdminCompany";
import useJobs from "./hooks/useJobs";
import useJobRegister from "./hooks/useJobRegister";
import useStructureAnalysis from "./hooks/useStructureAnalysis";
import useCompanySettings from "./hooks/useCompanySettings";
import useUsage from "./hooks/useUsage";
import useLeads from "./hooks/useLeads";
import useWorkers from "./hooks/useWorkers";

/* =========================================================
   공용 현장 hook
========================================================= */

import useSites from "../hooks/useSites";

export default function AdminPage() {
  /* =========================================================
     관리자 / 업체
  ========================================================= */

  const {
    currentCompany,
    adminReady,
    companyId,
    companyName,
  } = useAdminCompany();

  /* =========================================================
     탭
  ========================================================= */

  const [
    activeTab,
    setActiveTab,
  ] = useState("jobs");

  const activeTabRef =
    useRef("jobs");

  /* =========================================================
     사진 크게 보기
  ========================================================= */

  const [
    previewPhoto,
    setPreviewPhoto,
  ] = useState(null);

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
    setJobsMessage,

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

    loadJobPhotos,
    toggleJobDetail,
    loadSingleJobPhoto,

    startEdit,
    cancelEdit,
    saveJobEdit,

    startPhotoEdit,
    cancelPhotoEdit,
    savePhotoEdit,

    deletePhoto,
    deleteJob,
  } = jobsHook;

  /* =========================================================
     AI 유사도 설정
  ========================================================= */

  const {
    similarityThreshold,
    setSimilarityThreshold,

    settingMessage,
    settingLoading,

    loadSettings,
    saveSimilaritySetting,
  } =
    useCompanySettings({
      companyId,
    });

  /* =========================================================
     시공 등록
  ========================================================= */

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
  } =
    useJobRegister({
      companyId,
      similarityThreshold,
      loadJobs,
      jobSearchApplied,
    });

  /* =========================================================
     기존 시공사진 AI 구조분석
  ========================================================= */

  const {
    structureAnalysis,
    runStructureAnalysis,
    stopStructureAnalysis,
  } =
    useStructureAnalysis();

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

    assignSiteWorkers,
    loadSiteWorkers,
  } =
    useWorkers({
      companyId,
    });

  /* =========================================================
     로그 분석
  ========================================================= */

  const {
    usageStats,
    usageRecent,

    usageLoading,
    usageMessage,

    openUsagePhotoId,
    usagePhotoUrls,
    usagePhotoLoadingId,

    toggleUsagePhotos,
    loadUsageStats,
  } =
    useUsage({
      companyId,
    });

  /* =========================================================
     고객 상담
  ========================================================= */

  const {
    leads,
    leadsLoading,

    leadsMessage,
    setLeadsMessage,

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

    enableNotifications,

    handleRealtimeLead,
    syncNotificationPermission,
  } =
    useLeads({
      companyId,
      companyName,
    });

  /* =========================================================
     시공 DB 페이지 수
  ========================================================= */

  const totalJobPages =
    Math.max(
      1,
      Math.ceil(
        jobTotal /
          JOB_PAGE_SIZE,
      ),
    );

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
      );
    }
  }

  /* =========================================================
     activeTab ref 동기화
  ========================================================= */

  useEffect(() => {
    activeTabRef.current =
      activeTab;
  }, [activeTab]);

  /* =========================================================
     관리자 초기 데이터
  ========================================================= */

  useEffect(() => {
    if (
      !adminReady ||
      !companyId
    ) {
      return;
    }

    loadSettings(
      companyId,
    );

    loadJobs(
      1,
      "",
    );

    loadUnreadCount(
      companyId,
    );

    syncNotificationPermission();
  }, [
    adminReady,
    companyId,
  ]);

  /* =========================================================
     신규 고객 상담 실시간 구독
  ========================================================= */

  useEffect(() => {
    if (
      !adminReady ||
      !companyId
    ) {
      return;
    }

    const channel =
      supabase
        .channel(
          `customer-leads-admin-${companyId}`,
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
              activeTabRef.current ===
                "leads",
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
    adminReady,
    companyId,
  ]);

  /* =========================================================
     관리자 확인 중
  ========================================================= */

  if (
    !adminReady ||
    !companyId
  ) {
    return (
      <main
        style={{
          minHeight:
            "100vh",
          display:
            "flex",
          alignItems:
            "center",
          justifyContent:
            "center",
          background:
            "#f8fafc",
          color:
            "#6b7280",
          fontSize:
            "14px",
          fontWeight:
            "700",
        }}
      >
        관리자 계정을 확인하고 있습니다...
      </main>
    );
  }

  /* =========================================================
     관리자 화면
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
            "8px 0 16px",
        }}
      >
        {companyName} 관리자
      </h1>

      {/* =====================================================
          메뉴
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

          structureAnalysis={
            structureAnalysis
          }
          runStructureAnalysis={
            runStructureAnalysis
          }
          stopStructureAnalysis={
            stopStructureAnalysis
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

          editingPhotoId={
            editingPhotoId
          }

          setPreviewPhoto={
            setPreviewPhoto
          }

          loadSingleJobPhoto={
            loadSingleJobPhoto
          }

          startPhotoEdit={
            startPhotoEdit
          }
          deletePhoto={
            deletePhoto
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

          savePhotoEdit={
            savePhotoEdit
          }
          cancelPhotoEdit={
            cancelPhotoEdit
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
          현장 관리 - 진단 표시 포함
      ===================================================== */}

      {activeTab ===
        "sites" && (
        <div>
          <div
            style={{
              padding:
                "12px",
              marginBottom:
                "12px",
              background:
                "#fef3c7",
              border:
                "2px solid #f59e0b",
              borderRadius:
                "10px",
              fontWeight:
                "900",
              color:
                "#92400e",
            }}
          >
            현장관리 렌더링 진입 성공
          </div>

          <SiteManagementTab
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
        </div>
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

          setLeadsMessage={
            setLeadsMessage
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
          사진 크게 보기
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
