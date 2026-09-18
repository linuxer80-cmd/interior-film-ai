import {
  formatDate,
  formatWon,
  getLeadPhotoPaths,
} from "./adminUtils";
import {
  inputStyle,
  primaryButtonStyle,
  secondaryButtonStyle,
  sectionStyle,
} from "./adminStyles";
import {
  STATUS_OPTIONS,
} from "./adminConstants";
import {
  shareQuote,
} from "./quoteUtils";
import Pagination from "./Pagination";

export default function LeadsTab({
  leadFilter,
  setLeadFilter,
  loadLeads,
  leadTotal,
  unreadCount,
  notificationEnabled,
  enableNotifications,
  leadsMessage,
  leadsLoading,
  leads,
  updateLeadStatus,
  openLeadId,
  toggleLeadDetail,
  leadPhotoUrls,
  leadPhotoLoadingId,
  loadLeadPhotos,
  setPreviewPhoto,
  saveLeadMemo,
  updateLeadLocal,
  saveFinalQuote,
  setLeadsMessage,
  leadPage,
  totalLeadPages,
}) {
  return (
    <>
      <section style={sectionStyle}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: "10px",
          }}
        >
          <h2 style={{ margin: 0 }}>
            고객 상담
          </h2>

          <button
            type="button"
            onClick={enableNotifications}
            style={{
              border:
                "1px solid #d1d5db",
              background: notificationEnabled
                ? "#dcfce7"
                : "#ffffff",
              borderRadius: "9px",
              padding: "8px 10px",
              fontSize: "12px",
              fontWeight: "bold",
            }}
          >
            {notificationEnabled
              ? "🔔 알림 ON"
              : "🔕 알림 켜기"}
          </button>
        </div>

        <select
          value={leadFilter}
          onChange={(event) => {
            const next = event.target.value;
            setLeadFilter(next);
            loadLeads(1, next);
          }}
          style={{
            ...inputStyle,
            marginTop: "14px",
          }}
        >
          <option value="all">
            전체 상담
          </option>

          {STATUS_OPTIONS.map((status) => (
            <option
              key={status}
              value={status}
            >
              {status}
            </option>
          ))}
        </select>

        <div
          style={{
            marginTop: "10px",
            fontSize: "14px",
            color: "#6b7280",
          }}
        >
          총{" "}
          {leadTotal.toLocaleString("ko-KR")}
          건 · 미확인 {unreadCount}건
        </div>
      </section>

      {leadsMessage && (
        <div
          style={{
            ...sectionStyle,
            whiteSpace: "pre-wrap",
          }}
        >
          {leadsMessage}
        </div>
      )}

      {leadsLoading ? (
        <section style={sectionStyle}>
          상담 목록 불러오는 중...
        </section>
      ) : leads.length === 0 ? (
        <section style={sectionStyle}>
          상담 내역이 없습니다.
        </section>
      ) : (
        leads.map((lead) => (
          <LeadCard
            key={lead.id}
            lead={lead}
            updateLeadStatus={
              updateLeadStatus
            }
            open={
              openLeadId === lead.id
            }
            toggleLeadDetail={
              toggleLeadDetail
            }
            photos={
              leadPhotoUrls[lead.id] || []
            }
            leadPhotoLoadingId={
              leadPhotoLoadingId
            }
            loadLeadPhotos={loadLeadPhotos}
            setPreviewPhoto={setPreviewPhoto}
            saveLeadMemo={saveLeadMemo}
            updateLeadLocal={
              updateLeadLocal
            }
            saveFinalQuote={saveFinalQuote}
            setLeadsMessage={
              setLeadsMessage
            }
          />
        ))
      )}

      <Pagination
        currentPage={leadPage}
        totalPages={totalLeadPages}
        onPrevious={() =>
          loadLeads(
            leadPage - 1,
            leadFilter
          )
        }
        onNext={() =>
          loadLeads(
            leadPage + 1,
            leadFilter
          )
        }
      />
    </>
  );
}

function LeadCard({
  lead,
  updateLeadStatus,
  open,
  toggleLeadDetail,
  photos,
  leadPhotoLoadingId,
  loadLeadPhotos,
  setPreviewPhoto,
  saveLeadMemo,
  updateLeadLocal,
  saveFinalQuote,
  setLeadsMessage,
}) {
  const photoPaths =
    getLeadPhotoPaths(lead);

  return (
    <section
      style={{
        ...sectionStyle,
        border:
          lead.is_read === false
            ? "2px solid #dc2626"
            : "1px solid #e5e7eb",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: "10px",
        }}
      >
        <div>
          <div
            style={{
              fontSize: "18px",
              fontWeight: "bold",
            }}
          >
            {lead.is_read === false && "🔴 "}
            {lead.customer_name || "고객"}
          </div>

          <div
            style={{
              marginTop: "4px",
              fontSize: "14px",
              color: "#4b5563",
            }}
          >
            {lead.phone || "-"}
          </div>
        </div>

        <select
          value={lead.status || "신규문의"}
          onChange={(event) =>
            updateLeadStatus(
              lead.id,
              event.target.value
            )
          }
          style={{
            border:
              "1px solid #d1d5db",
            borderRadius: "8px",
            padding: "7px",
            background: "#ffffff",
          }}
        >
          {STATUS_OPTIONS.map((status) => (
            <option
              key={status}
              value={status}
            >
              {status}
            </option>
          ))}
        </select>
      </div>

      <div
        style={{
          marginTop: "10px",
          fontSize: "14px",
          lineHeight: 1.6,
        }}
      >
        <div>
          <b>지역:</b>{" "}
          {lead.region ||
            lead.address ||
            "-"}
        </div>

        <div>
          <b>희망일:</b>{" "}
          {lead.preferred_date || "-"}
        </div>

        <div>
          <b>AI 평균:</b>{" "}
          {formatWon(
            lead.estimate_average
          )}
        </div>

        <div>
          <b>접수:</b>{" "}
          {formatDate(lead.created_at)}
        </div>
      </div>

      <button
        type="button"
        onClick={() =>
          toggleLeadDetail(lead)
        }
        style={{
          ...secondaryButtonStyle,
          marginTop: "12px",
        }}
      >
        {open
          ? "상세 닫기"
          : "상세 보기"}
      </button>

      {open && (
        <div
          style={{
            marginTop: "14px",
            paddingTop: "14px",
            borderTop:
              "1px solid #e5e7eb",
          }}
        >
          <div
            style={{
              whiteSpace: "pre-wrap",
              fontSize: "14px",
              lineHeight: 1.7,
            }}
          >
            <b>고객 요청</b>
            <br />
            {lead.request_text || "-"}
          </div>

          <LeadPhotos
            lead={lead}
            photoPaths={photoPaths}
            photos={photos}
            leadPhotoLoadingId={
              leadPhotoLoadingId
            }
            loadLeadPhotos={loadLeadPhotos}
            setPreviewPhoto={setPreviewPhoto}
          />

          <label
            style={{
              display: "block",
              marginTop: "16px",
              fontWeight: "bold",
              marginBottom: "6px",
            }}
          >
            관리자 메모
          </label>

          <textarea
            defaultValue={
              lead.admin_memo || ""
            }
            onBlur={(event) =>
              saveLeadMemo(
                lead.id,
                event.target.value
              )
            }
            rows={4}
            style={{
              ...inputStyle,
              resize: "vertical",
            }}
          />

          <QuoteForm
            lead={lead}
            updateLeadLocal={
              updateLeadLocal
            }
            saveFinalQuote={saveFinalQuote}
            setLeadsMessage={
              setLeadsMessage
            }
          />
        </div>
      )}
    </section>
  );
}

function LeadPhotos({
  lead,
  photoPaths,
  photos,
  leadPhotoLoadingId,
  loadLeadPhotos,
  setPreviewPhoto,
}) {
  if (photoPaths.length === 0) {
    return (
      <div
        style={{
          marginTop: "12px",
          fontSize: "13px",
          color: "#9ca3af",
        }}
      >
        저장된 고객 사진 없음
      </div>
    );
  }

  return (
    <>
      <button
        type="button"
        disabled={
          leadPhotoLoadingId === lead.id
        }
        onClick={() =>
          loadLeadPhotos(lead)
        }
        style={{
          ...secondaryButtonStyle,
          marginTop: "12px",
        }}
      >
        {leadPhotoLoadingId === lead.id
          ? "사진 불러오는 중..."
          : `📷 고객 사진 보기 (${photoPaths.length})`}
      </button>

      {photos.length > 0 && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns:
              photos.length === 1
                ? "1fr"
                : "repeat(2, minmax(0, 1fr))",
            gap: "8px",
            marginTop: "10px",
          }}
        >
          {photos.map((item, index) => (
            <img
              key={`${item.path}-${index}`}
              src={item.url}
              alt=""
              loading="lazy"
              decoding="async"
              onClick={() =>
                setPreviewPhoto(item.url)
              }
              style={{
                width: "100%",
                height:
                  photos.length === 1
                    ? "320px"
                    : "180px",
                objectFit: "contain",
                background: "#111827",
                borderRadius: "10px",
                cursor: "pointer",
              }}
            />
          ))}
        </div>
      )}
    </>
  );
}

function QuoteForm({
  lead,
  updateLeadLocal,
  saveFinalQuote,
  setLeadsMessage,
}) {
  return (
    <div
      style={{
        marginTop: "18px",
        padding: "14px",
        borderRadius: "12px",
        background: "#faf7f2",
        border: "1px solid #e7dfd6",
      }}
    >
      <h3
        style={{
          margin: "0 0 12px",
          color: "#5d4037",
        }}
      >
        최종 견적
      </h3>

      <label style={quoteLabelStyle}>
        최종 견적금액
      </label>

      <input
        value={lead.final_price || ""}
        onChange={(event) =>
          updateLeadLocal(
            lead.id,
            "final_price",
            event.target.value
          )
        }
        inputMode="numeric"
        placeholder="예: 550000"
        style={{
          ...inputStyle,
          marginBottom: "10px",
        }}
      />

      {lead.final_price && (
        <div
          style={{
            marginTop: "-4px",
            marginBottom: "12px",
            fontWeight: "bold",
            color: "#5d4037",
          }}
        >
          {formatWon(lead.final_price)}
        </div>
      )}

      <label style={quoteLabelStyle}>
        시공 내용
      </label>

      <textarea
        value={
          lead.quote_work_details || ""
        }
        onChange={(event) =>
          updateLeadLocal(
            lead.id,
            "quote_work_details",
            event.target.value
          )
        }
        rows={4}
        placeholder="예: 방문 및 문틀 인테리어필름 시공"
        style={{
          ...inputStyle,
          resize: "vertical",
          marginBottom: "10px",
        }}
      />

      <label style={quoteLabelStyle}>
        사용 자재
      </label>

      <input
        value={lead.quote_material || ""}
        onChange={(event) =>
          updateLeadLocal(
            lead.id,
            "quote_material",
            event.target.value
          )
        }
        placeholder="예: 현대 L&C 인테리어필름"
        style={{
          ...inputStyle,
          marginBottom: "10px",
        }}
      />

      <label style={quoteLabelStyle}>
        안내사항
      </label>

      <textarea
        value={lead.quote_note || ""}
        onChange={(event) =>
          updateLeadLocal(
            lead.id,
            "quote_note",
            event.target.value
          )
        }
        rows={3}
        placeholder="현장 상태에 따라 추가 비용이 발생할 수 있습니다."
        style={{
          ...inputStyle,
          resize: "vertical",
        }}
      />

      <button
        type="button"
        onClick={() =>
          saveFinalQuote(lead)
        }
        style={{
          ...primaryButtonStyle,
          background: "#5d4037",
          marginTop: "12px",
        }}
      >
        최종 견적 저장
      </button>

      {lead.quote_created_at && (
        <div
          style={{
            marginTop: "8px",
            fontSize: "12px",
            color: "#78716c",
          }}
        >
          저장:{" "}
          {formatDate(
            lead.quote_created_at
          )}
        </div>
      )}

      <button
        type="button"
        onClick={() =>
          shareQuote(
            lead,
            setLeadsMessage
          )
        }
        style={{
          ...secondaryButtonStyle,
          marginTop: "8px",
          borderColor: "#5d4037",
          color: "#5d4037",
        }}
      >
        📤 견적 이미지 만들기 /
        고객에게 전송
      </button>
    </div>
  );
}

const quoteLabelStyle = {
  display: "block",
  fontWeight: "bold",
  marginBottom: "6px",
};
