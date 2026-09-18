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
  return (
    <>
      <section style={sectionStyle}>
        <h2 style={{ marginTop: 0 }}>
          시공 DB
        </h2>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr auto",
            gap: "8px",
          }}
        >
          <input
            value={jobSearch}
            onChange={(event) =>
              setJobSearch(event.target.value)
            }
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                searchJobs();
              }
            }}
            placeholder="부위, 세부부위, 메모 검색"
            style={inputStyle}
          />

          <button
            type="button"
            onClick={searchJobs}
            style={{
              border: "none",
              borderRadius: "10px",
              padding: "0 18px",
              background: "#111827",
              color: "#ffffff",
              fontWeight: "bold",
            }}
          >
            검색
          </button>
        </div>

        {jobSearchApplied && (
          <button
            type="button"
            onClick={clearJobSearch}
            style={{
              ...secondaryButtonStyle,
              marginTop: "8px",
            }}
          >
            검색 초기화
          </button>
        )}

        <div
          style={{
            marginTop: "12px",
            fontSize: "14px",
            color: "#6b7280",
          }}
        >
          총 {jobTotal.toLocaleString("ko-KR")}건
        </div>
      </section>

      {jobsMessage && (
        <pre
          style={{
            whiteSpace: "pre-wrap",
            background: "#ffffff",
            padding: "12px",
            borderRadius: "10px",
            border: "1px solid #e5e7eb",
          }}
        >
          {jobsMessage}
        </pre>
      )}

      {jobsLoading ? (
        <section style={sectionStyle}>
          불러오는 중...
        </section>
      ) : jobs.length === 0 ? (
        <section style={sectionStyle}>
          등록된 시공 데이터가 없습니다.
        </section>
      ) : (
        jobs.map((job) => (
          <section
            key={job.id}
            style={sectionStyle}
          >
            {editingId === job.id ? (
              <JobEditForm
                editCategory={editCategory}
                setEditCategory={
                  setEditCategory
                }
                editSubCategory={
                  editSubCategory
                }
                setEditSubCategory={
                  setEditSubCategory
                }
                editCost={editCost}
                setEditCost={setEditCost}
                editMemo={editMemo}
                setEditMemo={setEditMemo}
                onSave={() =>
                  saveJobEdit(job.id)
                }
                onCancel={cancelEdit}
              />
            ) : (
              <JobSummary
                job={job}
                open={openJobId === job.id}
                onToggle={() =>
                  toggleJobDetail(job.id)
                }
                onEdit={() => startEdit(job)}
                onDelete={() => deleteJob(job)}
              />
            )}

            {openJobId === job.id && (
              <div
                style={{
                  marginTop: "14px",
                  paddingTop: "14px",
                  borderTop:
                    "1px solid #e5e7eb",
                }}
              >
                {jobPhotoLoadingId === job.id ? (
                  <div>
                    사진정보 불러오는 중...
                  </div>
                ) : (jobPhotos[job.id] || [])
                    .length === 0 ? (
                  <div>
                    연결된 사진이 없습니다.
                  </div>
                ) : (
                  (jobPhotos[job.id] || []).map(
                    (photo) => (
                      <PhotoCard
                        key={photo.id}
                        photo={photo}
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
                        deletePhoto={deletePhoto}
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
                    )
                  )
                )}
              </div>
            )}
          </section>
        ))
      )}

      <Pagination
        currentPage={jobPage}
        totalPages={totalJobPages}
        onPrevious={() =>
          loadJobs(
            jobPage - 1,
            jobSearchApplied
          )
        }
        onNext={() =>
          loadJobs(
            jobPage + 1,
            jobSearchApplied
          )
        }
        marginTop="14px"
      />
    </>
  );
}

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
        value={editCategory}
        onChange={(event) =>
          setEditCategory(event.target.value)
        }
        placeholder="시공 부위"
        style={{
          ...inputStyle,
          marginBottom: "8px",
        }}
      />

      <input
        value={editSubCategory}
        onChange={(event) =>
          setEditSubCategory(
            event.target.value
          )
        }
        placeholder="세부 부위"
        style={{
          ...inputStyle,
          marginBottom: "8px",
        }}
      />

      <input
        value={editCost}
        onChange={(event) =>
          setEditCost(event.target.value)
        }
        inputMode="numeric"
        placeholder="실제 시공금액"
        style={{
          ...inputStyle,
          marginBottom: "8px",
        }}
      />

      <textarea
        value={editMemo}
        onChange={(event) =>
          setEditMemo(event.target.value)
        }
        placeholder="메모"
        rows={4}
        style={{
          ...inputStyle,
          resize: "vertical",
        }}
      />

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "8px",
          marginTop: "8px",
        }}
      >
        <button
          type="button"
          onClick={onSave}
          style={primaryButtonStyle}
        >
          저장
        </button>

        <button
          type="button"
          onClick={onCancel}
          style={secondaryButtonStyle}
        >
          취소
        </button>
      </div>
    </>
  );
}

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
          display: "flex",
          justifyContent: "space-between",
          gap: "12px",
        }}
      >
        <div>
          <div
            style={{
              fontSize: "18px",
              fontWeight: "bold",
            }}
          >
            {job.category || "-"}
          </div>

          <div
            style={{
              color: "#6b7280",
              fontSize: "14px",
              marginTop: "4px",
            }}
          >
            {job.sub_category || "-"}
          </div>
        </div>

        <div
          style={{
            fontWeight: "bold",
            textAlign: "right",
          }}
        >
          {formatWon(job.actual_cost)}
        </div>
      </div>

      {job.memo && (
        <div
          style={{
            marginTop: "10px",
            whiteSpace: "pre-wrap",
            fontSize: "14px",
          }}
        >
          {job.memo}
        </div>
      )}

      <div
        style={{
          marginTop: "10px",
          fontSize: "12px",
          color: "#9ca3af",
        }}
      >
        {formatDate(job.created_at)}
      </div>

      <button
        type="button"
        onClick={onToggle}
        style={{
          ...secondaryButtonStyle,
          marginTop: "12px",
        }}
      >
        {open
          ? "사진 닫기"
          : "📷 사진 / 상세 보기"}
      </button>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "8px",
          marginTop: "8px",
        }}
      >
        <button
          type="button"
          onClick={onEdit}
          style={secondaryButtonStyle}
        >
          수정
        </button>

        <button
          type="button"
          onClick={onDelete}
          style={{
            ...secondaryButtonStyle,
            color: "#b91c1c",
          }}
        >
          삭제
        </button>
      </div>
    </>
  );
      }
