import PhotoHierarchyRegister from './PhotoHierarchyRegister';
import CaseClassificationFields from "../components/CaseClassificationFields";
import GuidedForm, {InputStep, InputFinal} from "../components/GuidedForm";
import ui from "./AdminUi.module.css";

import {
  inputStyle,
  primaryButtonStyle,
  secondaryButtonStyle,
  sectionStyle,
} from "./adminStyles";

export default function RegisterTab({
  loadJobs, onPendingChange,
  caseProfile, setCaseProfile, suggestClassification,
  category,
  setCategory,
  actualCost,
  setActualCost,
  material,
  setMaterial,
  memo,
  setMemo,
  beforeImages,
  setBeforeImages,
  afterImages,
  setAfterImages,
  loading,
  handleSave,
  message,
  similarityThreshold,
  setSimilarityThreshold,
  settingLoading,
  saveSimilaritySetting,
  settingMessage,
}) {
  return (
    <>
      <PhotoHierarchyRegister loadJobs={loadJobs} onPendingChange={onPendingChange} />

      <details className={ui.more}>
        <summary>AI 검색 설정</summary>

        <div
          style={{
            fontSize: "14px",
            color: "#6b7280",
            marginBottom: "8px",
          }}
        >
          현재 유사도 기준:{" "}
          {Math.round(
            Number(similarityThreshold) * 100
          )}
          %
        </div>

        <input
          type="number"
          min="0"
          max="1"
          step="0.01"
          value={similarityThreshold}
          onChange={(event) =>
            setSimilarityThreshold(
              event.target.value
            )
          }
          style={{
            ...inputStyle,
            marginBottom: "8px",
          }}
        />

        <button
          type="button"
          disabled={settingLoading}
          onClick={saveSimilaritySetting}
          style={secondaryButtonStyle}
        >
          {settingLoading
            ? "저장 중..."
            : "유사도 설정 저장"}
        </button>

        {settingMessage && (
          <div
            style={{
              marginTop: "10px",
              whiteSpace: "pre-wrap",
            }}
          >
            {settingMessage}
          </div>
        )}
      </details>
    </>
  );
}

const labelStyle = {
  display: "block",
  fontWeight: "bold",
  marginBottom: "6px",
};

const countStyle = {
  fontSize: "13px",
  color: "#6b7280",
  marginBottom: "14px",
};

