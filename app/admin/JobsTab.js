import {
  formatDate,
  formatWon,
} from "./adminUtils";
import {
  inputStyle,
  primaryButtonStyle,
  secondaryButtonStyle,
  sectionStyle,
} from "./adminStyles";
import PhotoCard from "./PhotoCard";
import Pagination from "./Pagination";

export default function JobsTab({
  jobSearch,
  setJobSearch,
  searchJobs,
  clearJobSearch,
  jobSearchApplied,
  jobTotal,
  jobsMessage,

  structureAnalysis,
  runStructureAnalysis,
  stopStructureAnalysis,

  jobsLoading,
  jobs,
  editingId,
  editCategory,
  setEditCategory,
  editSubCategory,
  setEditSubCategory,
  editCost,
  setEditCost,
  editMemo,
  setEditMemo,
  saveJobEdit,
  cancelEdit,
  startEdit,
  deleteJob,
  openJobId,
  toggleJobDetail,
  jobPhotoLoadingId,
  jobPhotos,
  jobPhotoUrls,
  loadingPhotoId,
  editingPhotoId,
  setPreviewPhoto,
  loadSingleJobPhoto,
  startPhotoEdit,
  deletePhoto,
  editPhotoType,
  setEditPhotoType,
  editPhotoCategory,
  setEditPhotoCategory,
  editPhotoSubCategory,
  setEditPhotoSubCategory,
  editPhotoDescription,
  setEditPhotoDescription,
  photoEditLoading,
  savePhotoEdit,
  cancelPhotoEdit,
  jobPage,
  totalJobPages,
  loadJobs,
}) {
  const analysis =
    structureAnalysis || {
      total: 0,
      completed: 0,
      remaining: 0,
      failed: 0,
      processed: 0,
      running: false,
      finished: false,
      message: "",
    };

  const progress =
    analysis.total > 0
      ? Math.min(
          100,
          Math.max(
            0,
            Math.round(
              (analysis.completed /
                analysis.total) *
                100,
            ),
          ),
        )
      : 0;

  return (
    <>
      {/* =====================================================
          시공 DB 검색
      ===================================================== */}

      <section style={sectionStyle}>
        <h2
          style={{
            marginTop: 0,
          }}
        >
          시공 DB
        </h2>

        <div
          style={{
            display: "grid",
            gridTemplateColumns:
              "1fr auto",
            gap: "8px",
          }}
        >
          <input
            value={jobSearch}
            onChange={(event) =>
              setJobSearch(
                event.target.value,
              )
            }
            onKeyDown={(
              event,
            ) => {
              if (
                event.key ===
                "Enter"
              ) {
                searchJobs();
              }
            }}
            placeholder="부위, 세부부위, 메모 검색"
            style={inputStyle}
          />

          <button
            type="button"
            onClick={
              searchJobs
            }
            style={{
              border: "none",
              borderRadius:
                "10px",
              padding:
                "0 18px",
              background:
                "#111827",
              color:
                "#ffffff",
              fontWeight:
                "bold",
              cursor:
                "pointer",
            }}
          >
            검색
          </button>
        </div>

        {jobSearchApplied && (
          <button
            type="button"
            onClick={
              clearJobSearch
            }
            style={{
              ...secondaryButtonStyle,
              marginTop:
                "8px",
            }}
          >
            검색 초기화
          </button>
        )}

        <div
          style={{
            marginTop:
              "12px",
            fontSize:
              "14px",
            color:
              "#6b7280",
          }}
        >
          총{" "}
          {Number(
            jobTotal || 0,
          ).toLocaleString(
            "ko-KR",
          )}
          건
        </div>
      </section>

      {/* =====================================================
          AI 시공사진 구조분석
      ===================================================== */}

      <section style={sectionStyle}>
        <div
          style={{
            display: "flex",
            alignItems:
              "flex-start",
            justifyContent:
              "space-between",
            gap: "12px",
          }}
        >
          <div>
            <h3
              style={{
                margin:
                  "0 0 5px",
                fontSize:
                  "17px",
              }}
            >
              AI 시공사진 구조분석
            </h3>

            <div
              style={{
                fontSize:
                  "12px",
                lineHeight:
                  1.5,
                color:
                  "#6b7280",
              }}
            >
              기존 시공사진의
              색상이 아닌 구조와
              형태를 분석합니다.
            </div>
          </div>

          {analysis.finished && (
            <div
              style={{
                flexShrink: 0,
                padding:
                  "5px 9px",
                borderRadius:
                  "999px",
                background:
                  "#ecfdf5",
                color:
                  "#047857",
                fontSize:
                  "11px",
                fontWeight:
                  "800",
              }}
            >
              완료
            </div>
          )}

          {analysis.running && (
            <div
              style={{
                flexShrink: 0,
                padding:
                  "5px 9px",
                borderRadius:
                  "999px",
                background:
                  "#eff6ff",
                color:
                  "#1d4ed8",
                fontSize:
                  "11px",
                fontWeight:
                  "800",
              }}
            >
              분석 중
            </div>
          )}
        </div>

        {/* 숫자 현황 */}

        <div
          style={{
            display: "grid",
            gridTemplateColumns:
              "repeat(4, minmax(0, 1fr))",
            gap: "6px",
            marginTop:
              "14px",
          }}
        >
          <AnalysisStat
            label="전체"
            value={
              analysis.total
            }
          />

          <AnalysisStat
            label="완료"
            value={
              analysis.completed
            }
          />

          <AnalysisStat
            label="남음"
            value={
              analysis.remaining
            }
          />

          <AnalysisStat
            label="이번 실패"
            value={
              analysis.failed
            }
          />
        </div>

        {/* 진행률 */}

        <div
          style={{
            marginTop:
              "14px",
          }}
        >
          <div
            style={{
              display:
                "flex",
              alignItems:
                "center",
              justifyContent:
                "space-between",
              gap: "10px",
              marginBottom:
                "6px",
              fontSize:
                "12px",
            }}
          >
            <span
              style={{
                color:
                  "#6b7280",
              }}
            >
              진행률
            </span>

            <strong>
              {progress}%
            </strong>
          </div>

          <div
            style={{
              width: "100%",
              height: "9px",
              borderRadius:
                "999px",
              overflow:
                "hidden",
              background:
                "#e5e7eb",
            }}
          >
            <div
              style={{
                width: `${progress}%`,
                height:
                  "100%",
                borderRadius:
                  "999px",
                background:
                  "#111827",
                transition:
                  "width 0.25s ease",
              }}
            />
          </div>
        </div>

        {/* 처리 숫자 */}

        {analysis.processed >
          0 && (
          <div
            style={{
              marginTop:
                "9px",
              fontSize:
                "12px",
              color:
                "#6b7280",
            }}
          >
            이번 실행에서{" "}
            {Number(
              analysis.processed,
            ).toLocaleString(
              "ko-KR",
            )}
            장 처리
          </div>
        )}

        {/* 메시지 */}

        {analysis.message && (
          <div
            style={{
              marginTop:
                "12px",
              padding:
                "10px 12px",
              borderRadius:
                "10px",
              background:
                analysis.message.startsWith(
                  "❌",
                )
                  ? "#fef2f2"
                  : analysis.message.startsWith(
                        "⚠️",
                      )
                    ? "#fffbeb"
                    : analysis.message.startsWith(
                          "✅",
                        )
                      ? "#ecfdf5"
                      : "#f8fafc",
              border:
                "1px solid #e5e7eb",
              fontSize:
                "12px",
              lineHeight:
                1.55,
              whiteSpace:
                "pre-wrap",
            }}
          >
            {analysis.message}
          </div>
        )}

        {/* 버튼 */}

        {!analysis.running ? (
          <button
            type="button"
            onClick={
              runStructureAnalysis
            }
            style={{
              ...primaryButtonStyle,
              width: "100%",
              marginTop:
                "14px",
            }}
          >
            {analysis.remaining >
              0 &&
            analysis.completed >
              0
              ? "남은 사진 구조분석 계속"
              : analysis.finished
                ? "구조분석 다시 확인"
                : "기존 사진 구조분석 시작"}
          </button>
        ) : (
          <button
            type="button"
            onClick={
              stopStructureAnalysis
            }
            style={{
              ...secondaryButtonStyle,
              width: "100%",
              marginTop:
                "14px",
              color:
                "#b45309",
              borderColor:
                "#f59e0b",
            }}
          >
            분석 중지
          </button>
        )}

        <div
          style={{
            marginTop:
              "10px",
            fontSize:
              "11px",
            lineHeight:
              1.5,
            color:
              "#9ca3af",
          }}
        >
          기존 카테고리,
          시공금액, 임베딩은
          변경하지 않습니다.
          구조분석 결과만 추가
          저장합니다.
        </div>
      </section>

      {/* =====================================================
          시공 DB 메시지
      ===================================================== */}

      {jobsMessage && (
        <pre
          style={{
            whiteSpace:
              "pre-wrap",
            background:
              "#ffffff",
            padding:
              "12px",
            borderRadius:
              "10px",
            border:
              "1px solid #e5e7eb",
          }}
        >
          {jobsMessage}
        </pre>
      )}

      {/* =====================================================
          시공 DB 목록
      ===================================================== */}

      {jobsLoading ? (
        <section
          style={
            sectionStyle
          }
        >
          불러오는 중...
        </section>
      ) : jobs.length ===
        0 ? (
        <section
          style={
            sectionStyle
          }
        >
          등록된 시공
          데이터가 없습니다.
        </section>
      ) : (
        jobs.map((job) => (
          <section
            key={job.id}
            style={
              sectionStyle
            }
          >
            {editingId ===
            job.id ? (
              <JobEditForm
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
                onSave={() =>
                  saveJobEdit(
                    job.id,
                  )
                }
                onCancel={
                  cancelEdit
                }
              />
            ) : (
              <JobSummary
                job={job}
                open={
                  openJobId ===
                  job.id
                }
                onToggle={() =>
                  toggleJobDetail(
                    job.id,
                  )
                }
                onEdit={() =>
                  startEdit(
                    job,
                  )
                }
                onDelete={() =>
                  deleteJob(
                    job,
                  )
                }
              />
            )}

            {openJobId ===
              job.id && (
              <div
                style={{
                  marginTop:
                    "14px",
                  paddingTop:
                    "14px",
                  borderTop:
                    "1px solid #e5e7eb",
                }}
              >
                {jobPhotoLoadingId ===
                job.id ? (
                  <div>
                    사진정보
                    불러오는
                    중...
                  </div>
                ) : (
                    jobPhotos[
                      job.id
                    ] || []
                  ).length ===
                  0 ? (
                  <div>
                    연결된 사진이
                    없습니다.
                  </div>
                ) : (
                  (
                    jobPhotos[
                      job.id
                    ] || []
                  ).map(
                    (
                      photo,
                    ) => (
                      <PhotoCard
                        key={
                          photo.id
                        }
                        photo={
                          photo
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
                      />
                    ),
                  )
                )}
              </div>
            )}
          </section>
        ))
      )}

      <Pagination
        currentPage={
          jobPage
        }
        totalPages={
          totalJobPages
        }
        onPrevious={() =>
          loadJobs(
            jobPage - 1,
            jobSearchApplied,
          )
        }
        onNext={() =>
          loadJobs(
            jobPage + 1,
            jobSearchApplied,
          )
        }
        marginTop="14px"
      />
    </>
  );
}

/* =========================================================
   구조분석 숫자 카드
========================================================= */

function AnalysisStat({
  label,
  value,
}) {
  return (
    <div
      style={{
        minWidth: 0,
        padding:
          "10px 4px",
        borderRadius:
          "10px",
        background:
          "#f8fafc",
        border:
          "1px solid #e5e7eb",
        textAlign:
          "center",
      }}
    >
      <div
        style={{
          fontSize:
            "10px",
          color:
            "#6b7280",
          whiteSpace:
            "nowrap",
        }}
      >
        {label}
      </div>

      <div
        style={{
          marginTop:
            "3px",
          fontSize:
            "16px",
          fontWeight:
            "800",
        }}
      >
        {Number(
          value || 0,
        ).toLocaleString(
          "ko-KR",
        )}
      </div>
    </div>
  );
}

/* =========================================================
   시공 수정
========================================================= */

function JobEditForm({
  editCategory,
  setEditCategory,
  editSubCategory,
  setEditSubCategory,
  editCost,
  setEditCost,
  editMemo,
  setEditMemo,
  onSave,
  onCancel,
}) {
  return (
    <>
      <input
        value={
          editCategory
        }
        onChange={(
          event,
        ) =>
          setEditCategory(
            event.target
              .value,
          )
        }
        placeholder="시공 부위"
        style={{
          ...inputStyle,
          marginBottom:
            "8px",
        }}
      />

      <input
        value={
          editSubCategory
        }
        onChange={(
          event,
        ) =>
          setEditSubCategory(
            event.target
              .value,
          )
        }
        placeholder="세부 부위"
        style={{
          ...inputStyle,
          marginBottom:
            "8px",
        }}
      />

      <input
        value={
          editCost
        }
        onChange={(
          event,
        ) =>
          setEditCost(
            event.target
              .value,
          )
        }
        inputMode="numeric"
        placeholder="실제 시공금액"
        style={{
          ...inputStyle,
          marginBottom:
            "8px",
        }}
      />

      <textarea
        value={
          editMemo
        }
        onChange={(
          event,
        ) =>
          setEditMemo(
            event.target
              .value,
          )
        }
        placeholder="메모"
        rows={4}
        style={{
          ...inputStyle,
          resize:
            "vertical",
        }}
      />

      <div
        style={{
          display:
            "grid",
          gridTemplateColumns:
            "1fr 1fr",
          gap: "8px",
          marginTop:
            "8px",
        }}
      >
        <button
          type="button"
          onClick={
            onSave
          }
          style={
            primaryButtonStyle
          }
        >
          저장
        </button>

        <button
          type="button"
          onClick={
            onCancel
          }
          style={
            secondaryButtonStyle
          }
        >
          취소
        </button>
      </div>
    </>
  );
}

/* =========================================================
   시공 목록 카드
========================================================= */

function JobSummary({
  job,
  open,
  onToggle,
  onEdit,
  onDelete,
}) {
  return (
    <>
      <div
        style={{
          display:
            "flex",
          justifyContent:
            "space-between",
          gap: "12px",
        }}
      >
        <div>
          <div
            style={{
              fontSize:
                "18px",
              fontWeight:
                "bold",
            }}
          >
            {job.category ||
              "-"}
          </div>

          <div
            style={{
              color:
                "#6b7280",
              fontSize:
                "14px",
              marginTop:
                "4px",
            }}
          >
            {job.sub_category ||
              "-"}
          </div>
        </div>

        <div
          style={{
            fontWeight:
              "bold",
            textAlign:
              "right",
          }}
        >
          {formatWon(
            job.actual_cost,
          )}
        </div>
      </div>

      {job.memo && (
        <div
          style={{
            marginTop:
              "10px",
            whiteSpace:
              "pre-wrap",
            fontSize:
              "14px",
          }}
        >
          {job.memo}
        </div>
      )}

      <div
        style={{
          marginTop:
            "10px",
          fontSize:
            "12px",
          color:
            "#9ca3af",
        }}
      >
        {formatDate(
          job.created_at,
        )}
      </div>

      <button
        type="button"
        onClick={
          onToggle
        }
        style={{
          ...secondaryButtonStyle,
          marginTop:
            "12px",
        }}
      >
        {open
          ? "사진 닫기"
          : "📷 사진 / 상세 보기"}
      </button>

      <div
        style={{
          display:
            "grid",
          gridTemplateColumns:
            "1fr 1fr",
          gap: "8px",
          marginTop:
            "8px",
        }}
      >
        <button
          type="button"
          onClick={
            onEdit
          }
          style={
            secondaryButtonStyle
          }
        >
          수정
        </button>

        <button
          type="button"
          onClick={
            onDelete
          }
          style={{
            ...secondaryButtonStyle,
            color:
              "#b91c1c",
          }}
        >
          삭제
        </button>
      </div>
    </>
  );
            }
