"use client";

import {
  useEffect,
  useRef,
  useState,
} from "react";
import dynamic from "next/dynamic";
import ui from "./AdminUi.module.css";

import { supabase } from "../../lib/supabase";

import PhotoPreviewModal from "./PhotoPreviewModal";
import AdminTabs from "./AdminTabs";
import HelpChat from "./HelpChat";
import NewLeadAlert from "./NewLeadAlert";
import JobsTab from "./JobsTab";
import RegisterTab from "./RegisterTab";
const UsageTab = dynamic(() => import("./UsageTab"));
const ProfitTab = dynamic(() => import("./ProfitTab"));
const LeadsTab = dynamic(() => import("./LeadsTab"));
const SiteManagementTab = dynamic(() => import("./SiteManagementTab"));
const AdminTodayTasks = dynamic(() => import("./AdminTodayTasks"));
import PlanUsageButton from "./PlanUsageButton";

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
  ] = useState("today");

  const activeTabRef =
    useRef("today");

  const pendingSiteIdRef =
    useRef(null);

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

    updateSiteBasicInfo,
    updateSiteSchedule,
    updateSiteStatus,

    addSiteRequestPhotos,
    deleteSiteRequestPhoto,

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
    const destination = new URL(window.location.href);
    destination.searchParams.set("tab", tab);
    for (const key of ["site", "section", "lead"]) destination.searchParams.delete(key);
    window.history.replaceState(null, "", destination);
    if (tab !== "sites") {
      pendingSiteIdRef.current = null;
      closeSite();
    }
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
      loadLeads(1, leadFilter);
    }
  }

  useEffect(() => {
    activeTabRef.current =
      activeTab;
  }, [activeTab]);

  /* 알림에서 열린 현장 관리 탭과 현장 상세로 이동 */
  useEffect(() => {
    if (!companyId) return;

    const params = new URLSearchParams(window.location.search);
    const tab = params.get("tab");

    if (tab === "sites") {
      pendingSiteIdRef.current = params.get("site");
      activeTabRef.current = "sites";
      setActiveTab("sites");
      loadSites(companyId);
      loadWorkers(companyId);
    } else if (tab === "register") {
      activeTabRef.current = "register";
      setActiveTab("register");
    } else if (tab === "leads") {
      activeTabRef.current = "leads";
      setActiveTab("leads");
      loadLeads(1, "all", params.get("lead"));
    } else if (["today", "jobs", "usage", "profit"].includes(tab)) {
      changeTab(tab);
    }
  }, [companyId]);

  useEffect(() => {
    const siteId = pendingSiteIdRef.current;
    if (!siteId || sitesLoading) return;

    const site = sites.find((item) => String(item.id) === siteId);
    if (site) {
      pendingSiteIdRef.current = null;
      openSite(site);
    }
  }, [sites, sitesLoading]);

  /* =========================================================
     관리자 초기화

     순서:
     1. 로그인 / 회사 확인
     2. 신규 회사 샘플 데이터 확인 및 생성
     3. 시공 DB / 설정 / 상담 데이터 조회
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
        /* =====================================================
           신규 관리자 샘플 데이터 확인 / 자동 생성
        ===================================================== */

        try {
          const {
            data: sessionData,
            error: sessionError,
          } =
            await supabase.auth.getSession();

          if (sessionError) {
            throw sessionError;
          }

          const accessToken =
            sessionData
              ?.session
              ?.access_token;

          if (accessToken) {
            const sampleResponse =
              await fetch(
                "/api/admin/ensure-sample-data",
                {
                  method: "POST",

                  headers: {
                    Authorization:
                      `Bearer ${accessToken}`,
                  },

                  cache: "no-store",
                },
              );

            let sampleResult =
              null;

            try {
              sampleResult =
                await sampleResponse.json();
            } catch (jsonError) {
              console.error(
                "샘플 데이터 응답 확인:",
                jsonError,
              );
            }

            if (
              !sampleResponse.ok ||
              sampleResult?.success ===
                false
            ) {
              console.error(
                "샘플 데이터 확인:",
                sampleResult,
              );
            } else {
              console.log(
                "샘플 데이터 확인:",
                sampleResult,
              );
            }
          }
        } catch (sampleError) {
          console.error(
            "샘플 데이터 자동 생성:",
            sampleError,
          );
        }

        if (!mounted) {
          return;
        }

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
              activeTabRef.current === "leads",
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
     관리자 준비 전
  ========================================================= */

  if (!adminReady) {
    return (
      <main
        style={{
          maxWidth: "900px",
          margin: "0 auto",
          padding: "40px 16px",
          minHeight: "100vh",
          background: "#f8fafc",
          color: "#111827",
        }}
      >
        관리자 정보를 확인하고 있습니다...
      </main>
    );
  }

  /* =========================================================
     관리자 화면
  ========================================================= */

  return (
    <main className={ui.page}>
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

      <header className={ui.header}>
        <div style={{ minWidth: 0 }}>
          <div className={ui.eyebrow}>관리자</div>
          <h1 className={ui.title}>{companyName}</h1>
        </div>
        <PlanUsageButton />
      </header>

      {adminError && (
        <div
          style={{
            padding: "12px",
            marginBottom: "14px",
            borderRadius: "10px",
            border:
              "1px solid #fecaca",
            background: "#fef2f2",
            color: "#b91c1c",
            fontSize: "13px",
            fontWeight: "600",
            whiteSpace: "pre-wrap",
          }}
        >
          {adminError}
        </div>
      )}

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
      {activeTab === "today" && companyId && <AdminTodayTasks key={companyId} companyId={companyId} />}
                {activeTab ===
        "jobs" && (
        <JobsTab
          jobSearch={jobSearch}
          setJobSearch={setJobSearch}
          searchJobs={searchJobs}
          clearJobSearch={clearJobSearch}
          jobSearchApplied={jobSearchApplied}
          jobTotal={jobTotal}
          jobsMessage={jobsMessage}
          jobsLoading={jobsLoading}
          jobs={jobs}
          editingId={editingId}
          editCategory={editCategory}
          setEditCategory={setEditCategory}
          editSubCategory={editSubCategory}
          setEditSubCategory={setEditSubCategory}
          editCost={editCost}
          setEditCost={setEditCost}
          editMemo={editMemo}
          setEditMemo={setEditMemo}
          saveJobEdit={saveJobEdit}
          cancelEdit={cancelEdit}
          startEdit={startEdit}
          deleteJob={deleteJob}
          openJobId={openJobId}
          toggleJobDetail={toggleJobDetail}
          jobPhotoLoadingId={jobPhotoLoadingId}
          jobPhotos={jobPhotos}
          jobPhotoUrls={jobPhotoUrls}
          loadingPhotoId={loadingPhotoId}
          loadSingleJobPhoto={loadSingleJobPhoto}
          openJobPhoto={openJobPhoto}
          editingPhotoId={editingPhotoId}
          editPhotoType={editPhotoType}
          setEditPhotoType={setEditPhotoType}
          editPhotoCategory={editPhotoCategory}
          setEditPhotoCategory={setEditPhotoCategory}
          editPhotoSubCategory={editPhotoSubCategory}
          setEditPhotoSubCategory={setEditPhotoSubCategory}
          editPhotoDescription={editPhotoDescription}
          setEditPhotoDescription={setEditPhotoDescription}
          photoEditLoading={photoEditLoading}
          startPhotoEdit={startPhotoEdit}
          cancelPhotoEdit={cancelPhotoEdit}
          savePhotoEdit={savePhotoEdit}
          deletePhoto={deletePhoto}
          jobPage={jobPage}
          totalJobPages={totalJobPages}
          loadJobs={loadJobs}
        />
      )}

      {/* =====================================================
          시공 등록
      ===================================================== */}

      {activeTab === "register" && (
        <RegisterTab
          category={category}
          setCategory={setCategory}
          actualCost={actualCost}
          setActualCost={setActualCost}
          material={material}
          setMaterial={setMaterial}
          memo={memo}
          setMemo={setMemo}
          beforeImages={beforeImages}
          setBeforeImages={setBeforeImages}
          afterImages={afterImages}
          setAfterImages={setAfterImages}
          handleBeforeFiles={handleBeforeFiles}
          handleAfterFiles={handleAfterFiles}
          removeBeforeImage={removeBeforeImage}
          removeAfterImage={removeAfterImage}
          loading={loading}
          handleSave={handleSave}
          message={message}
          similarityThreshold={similarityThreshold}
          setSimilarityThreshold={setSimilarityThreshold}
          settingLoading={settingLoading}
          saveSimilaritySetting={saveSimilaritySetting}
          settingMessage={settingMessage}
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

          updateSiteBasicInfo={
            updateSiteBasicInfo
          }

          updateSiteSchedule={
            updateSiteSchedule
          }

          updateSiteStatus={
            updateSiteStatus
          }

          addSiteRequestPhotos={
            addSiteRequestPhotos
          }

          deleteSiteRequestPhoto={
            deleteSiteRequestPhoto
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

      {activeTab ===
        "usage" && (
        <UsageTab
          usageStats={usageStats}
          usageMessage={usageMessage}
          usageLoading={usageLoading}
          loadUsageStats={loadUsageStats}
          usageRecent={usageRecent}
          usagePhotoUrls={usagePhotoUrls}
          openUsagePhotoId={openUsagePhotoId}
          usagePhotoLoadingId={usagePhotoLoadingId}
          toggleUsagePhotos={toggleUsagePhotos}
          setPreviewPhoto={setPreviewPhoto}
        />
      )}

      {activeTab === "profit" && <ProfitTab />}

      {activeTab ===
        "leads" && (
        <LeadsTab
          companyName={companyName}
          leadFilter={leadFilter}
          setLeadFilter={setLeadFilter}
          loadLeads={loadLeads}
          leadTotal={leadTotal}
          unreadCount={unreadCount}
          notificationEnabled={notificationEnabled}
          enableNotifications={enableNotifications}
          leadsMessage={leadsMessage}
          leadsLoading={leadsLoading}
          leads={leads}
          updateLeadStatus={updateLeadStatus}
          openLeadId={openLeadId}
          toggleLeadDetail={toggleLeadDetail}
          leadPhotoUrls={leadPhotoUrls}
          leadPhotoLoadingId={leadPhotoLoadingId}
          loadLeadPhotos={loadLeadPhotos}
          setPreviewPhoto={setPreviewPhoto}
          saveLeadMemo={saveLeadMemo}
          updateLeadLocal={updateLeadLocal}
          saveFinalQuote={saveFinalQuote}
          leadPage={leadPage}
          totalLeadPages={totalLeadPages}
        />
      )}

      <AdminTabs activeTab={activeTab} changeTab={changeTab} unreadCount={unreadCount} secondaryOnly />
      {customerEstimateUrl && (
        <details className={ui.share}>
          <summary>고객 AI 견적 링크 공유</summary>
          <div className={ui.shareBody}>
            <div className={ui.shareUrl}>{customerEstimateUrl}</div>
            <div className={ui.actionRow}>
              <button type="button" className={ui.secondary} onClick={openCustomerEstimatePage}>고객페이지 열기</button>
              <button type="button" className={ui.secondary} onClick={copyCustomerEstimateUrl}>주소 복사</button>
            </div>
            {copyMessage && <p role="status" className={ui.help}>{copyMessage}</p>}
          </div>
        </details>
      )}

      <PhotoPreviewModal
        previewPhoto={
          previewPhoto
        }
        setPreviewPhoto={
          setPreviewPhoto
        }
      />
      <HelpChat />
    </main>
  );
            }
