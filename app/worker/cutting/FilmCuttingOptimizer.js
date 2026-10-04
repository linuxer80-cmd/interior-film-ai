"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import styles from "./FilmCuttingOptimizer.module.css";
import CuttingInput from "./CuttingInput";
import CuttingResult from "./CuttingResult";
import { FILM_WIDTH, optimizeCutting } from "./cuttingOptimizer";
import { filmLabel } from "./FilmThumbnail";

const DRAFT_KEY = "film-cutting-draft-v1";

const makeId = (prefix = "id") =>
  `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const normalizeColor = value =>
  String(value || "").trim().toUpperCase();

const createRoll = () => ({
  id: makeId("roll"),
  color: "",
  lengthM: "",
  grainDirection: false,
});

const createSize = () => ({
  id: makeId("size"),
  width: "",
  height: "",
  quantity: 1,
});

const createColorGroup = (color = "") => ({
  id: makeId("color"),
  color,
  sizes: [createSize()],
});

const createSection = (location = "", color = "") => ({
  id: makeId("section"),
  location,
  part: "",
  colors: [createColorGroup(color)],
});

const isBlankSize = size =>
  !String(size.width ?? "").trim() &&
  !String(size.height ?? "").trim();

function parseBulkSizes(value) {
  const sizes = [];
  const errors = [];

  String(value || "").split(/\r?\n/).forEach((raw, index) => {
    const line = raw.trim();
    if (!line) return;

    const parts = line.replace(/[xX×*,\s]+/g, ".").split(".");

    if (
      parts.length < 2 ||
      parts.length > 3 ||
      parts.some(part => !/^\d+$/.test(part))
    ) {
      errors.push(
        `${index + 1}행: 가로.세로.수량 형식으로 입력해주세요.`
      );
      return;
    }

    const [width, height] = parts.map(Number);
    const quantity = parts.length === 3 ? Number(parts[2]) : 1;

    if (
      ![width, height, quantity].every(Number.isSafeInteger) ||
      width <= 0 ||
      height <= 0 ||
      quantity < 1 ||
      quantity > 500
    ) {
      errors.push(
        `${index + 1}행: 크기는 양수, 수량은 1~500 정수로 입력해주세요.`
      );
      return;
    }

    sizes.push({
      id: makeId("size"),
      width,
      height,
      quantity,
    });
  });

  return { sizes, errors };
}

function validDraft(draft) {
  return (
    draft?.version === 1 &&
    Array.isArray(draft.rolls) &&
    draft.rolls.length > 0 &&
    draft.rolls.length <= 100 &&
    draft.rolls.every(roll => roll && typeof roll.id === "string") &&
    Array.isArray(draft.sections) &&
    draft.sections.length > 0 &&
    draft.sections.length <= 500 &&
    draft.sections.every(section =>
      section &&
      typeof section.id === "string" &&
      Array.isArray(section.colors) &&
      section.colors.length > 0 &&
      section.colors.every(group =>
        group &&
        typeof group.id === "string" &&
        Array.isArray(group.sizes) &&
        group.sizes.length > 0 &&
        group.sizes.every(size =>
          size && typeof size.id === "string"
        )
      )
    )
  );
}

export default function FilmCuttingOptimizer({ context }) {
  const storageKey = context.storageKey;
  const materials = context.materials || [];
  const selectedMaterial = materials.find(
    material => material.material_id === context.selectedMaterialId
  );

  const [progress, setProgress] = useState({});
  const [showResult, setShowResult] = useState(false);
  const [rolls, setRolls] = useState(() => [createRoll()]);
  const [sections, setSections] = useState(() => [createSection()]);
  const [rollMode, setRollMode] = useState("waste");
  const [result, setResult] = useState(null);
  const [errors, setErrors] = useState([]);
  const [calculating, setCalculating] = useState(false);
  const [bulkEditor, setBulkEditor] = useState(null);
  const [draftReady, setDraftReady] = useState(false);
  const [saveStatus, setSaveStatus] = useState("");

  const calculationTimer = useRef(null);
  const calculationLock = useRef(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;

    try {
      const raw =
        window.localStorage.getItem(storageKey) ||
        (!context.site
          ? window.localStorage.getItem(DRAFT_KEY)
          : null);

      const draft = raw ? JSON.parse(raw) : null;

      if (validDraft(draft)) {
        setRolls(draft.rolls);
        setSections(draft.sections);
        setRollMode(
          draft.rollMode === "short-first" ? "short-first" : "waste"
        );

        if (Array.isArray(draft.result?.usedRolls)) {
          setResult(draft.result);
          setProgress(draft.progress || {});
        }

        setSaveStatus(
          "저장한 입력·재단 도면·완료 체크를 불러왔습니다."
        );
      } else if (selectedMaterial) {
        const color = filmLabel(selectedMaterial);
        setRolls([{ ...createRoll(), color }]);
        setSections([createSection("", color)]);
      }
    } catch {
      setSaveStatus(
        "자동 저장을 사용할 수 없습니다. 화면을 닫기 전에 입력 내용을 확인해주세요."
      );
    }

    setDraftReady(true);

    return () => {
      mounted.current = false;
      window.clearTimeout(calculationTimer.current);
    };
  }, []);

  useEffect(() => {
    if (!draftReady) return;

    const save = () => {
      try {
        window.localStorage.setItem(
          storageKey,
          JSON.stringify({
            version: 1,
            rolls,
            sections,
            rollMode,
            result,
            progress,
          })
        );

        setSaveStatus(
          "현재 기기에 현장별 입력·도면·완료 체크를 저장했습니다."
        );
      } catch {
        setSaveStatus(
          "저장 공간이 부족하거나 자동 저장을 사용할 수 없습니다."
        );
      }
    };

    save();
    window.addEventListener("pagehide", save);

    return () => window.removeEventListener("pagehide", save);
  }, [
    rolls,
    sections,
    rollMode,
    draftReady,
    result,
    progress,
    storageKey,
  ]);

  const colors = useMemo(
    () => [
      ...new Set(
        rolls.map(roll => normalizeColor(roll.color)).filter(Boolean)
      ),
    ],
    [rolls]
  );

  const summary = useMemo(
    () => ({
      rollCount: rolls.filter(
        roll => normalizeColor(roll.color) && Number(roll.lengthM) > 0
      ).length,
      colorCount: colors.length,
      sectionCount: sections.length,
      pieceCount: sections.reduce(
        (sum, section) =>
          sum +
          section.colors.reduce(
            (count, group) =>
              count +
              group.sizes.reduce(
                (n, size) =>
                  n +
                  (
                    Number(size.width) > 0 &&
                    Number(size.height) > 0 &&
                    Number.isSafeInteger(Number(size.quantity)) &&
                    Number(size.quantity) > 0
                      ? Number(size.quantity)
                      : 0
                  ),
                0
              ),
            0
          ),
        0
      ),
    }),
    [rolls, sections, colors]
  );

  function clearResult() {
    setResult(null);
    setProgress({});
    setShowResult(false);
    setErrors([]);
  }

  function changeSections(update) {
    if (calculationLock.current) return;
    setSections(update);
    clearResult();
  }

  function changeGroup(sectionId, groupId, update) {
    changeSections(previous =>
      previous.map(section =>
        section.id === sectionId
          ? {
              ...section,
              colors: section.colors.map(group =>
                group.id === groupId ? update(group) : group
              ),
            }
          : section
      )
    );
  }

  function addRoll() {
    setRolls(previous => [...previous, createRoll()]);
    clearResult();
  }

  function removeRoll(id) {
    setRolls(previous =>
      previous.length > 1
        ? previous.filter(roll => roll.id !== id)
        : previous
    );
    clearResult();
  }

  function updateRoll(id, field, value) {
    const nextValue =
      field === "color" ? normalizeColor(value) : value;

    if (field === "color" && nextValue) {
      const previousColor = normalizeColor(
        rolls.find(roll => roll.id === id)?.color
      );

      const renameUnique =
        previousColor &&
        !rolls.some(
          roll =>
            roll.id !== id &&
            normalizeColor(roll.color) === previousColor
        );

      const firstColor = colors.length === 0;

      if (renameUnique || firstColor) {
        setSections(previous =>
          previous.map(section => ({
            ...section,
            colors: section.colors.map(group =>
              (
                renameUnique &&
                normalizeColor(group.color) === previousColor
              ) ||
              (
                firstColor &&
                !normalizeColor(group.color)
              )
                ? { ...group, color: nextValue }
                : group
            ),
          }))
        );
      }
    }

    setRolls(previous =>
      previous.map(roll =>
        roll.id === id ? { ...roll, [field]: nextValue } : roll
      )
    );

    clearResult();
  }

  function addSection() {
    changeSections(previous => [
      ...previous,
      createSection(
        previous.at(-1)?.location || "",
        colors[0] || ""
      ),
    ]);
  }

  function removeSection(id) {
    changeSections(previous =>
      previous.length > 1
        ? previous.filter(section => section.id !== id)
        : previous
    );
  }

  function updateSection(id, field, value) {
    changeSections(previous =>
      previous.map(section =>
        section.id === id
          ? { ...section, [field]: value }
          : section
      )
    );
  }

  function copySection(id) {
    changeSections(previous => {
      const index = previous.findIndex(section => section.id === id);
      if (index < 0) return previous;

      const source = previous[index];

      const copy = {
        ...source,
        id: makeId("section"),
        colors: source.colors.map(group => ({
          ...group,
          id: makeId("color"),
          sizes: group.sizes.map(size => ({
            ...size,
            id: makeId("size"),
          })),
        })),
      };

      const next = [...previous];
      next.splice(index + 1, 0, copy);
      return next;
    });
  }

  function addColorGroup(id) {
    changeSections(previous =>
      previous.map(section => {
        if (section.id !== id) return section;

        const used = new Set(
          section.colors.map(group => normalizeColor(group.color))
        );

        return {
          ...section,
          colors: [
            ...section.colors,
            createColorGroup(
              colors.find(color => !used.has(color)) ||
              colors[0] ||
              ""
            ),
          ],
        };
      })
    );
  }

  function removeColorGroup(id, groupId) {
    changeSections(previous =>
      previous.map(section =>
        section.id === id && section.colors.length > 1
          ? {
              ...section,
              colors: section.colors.filter(
                group => group.id !== groupId
              ),
            }
          : section
      )
    );
  }

  function updateColorGroup(id, groupId, color) {
    changeGroup(id, groupId, group => ({
      ...group,
      color: normalizeColor(color),
    }));
  }

  function addSize(id, groupId) {
    changeGroup(id, groupId, group => ({
      ...group,
      sizes: [...group.sizes, createSize()],
    }));
  }

  function removeSize(id, groupId, sizeId) {
    changeGroup(id, groupId, group =>
      group.sizes.length > 1
        ? {
            ...group,
            sizes: group.sizes.filter(size => size.id !== sizeId),
          }
        : group
    );
  }

  function updateSize(id, groupId, sizeId, field, value) {
    changeGroup(id, groupId, group => ({
      ...group,
      sizes: group.sizes.map(size =>
        size.id === sizeId
          ? { ...size, [field]: value }
          : size
      ),
    }));
  }

  function changeQuantity(id, groupId, sizeId, amount) {
    changeGroup(id, groupId, group => ({
      ...group,
      sizes: group.sizes.map(size =>
        size.id === sizeId
          ? {
              ...size,
              quantity: Math.max(
                1,
                Math.min(
                  500,
                  Math.floor(Number(size.quantity) || 1) + amount
                )
              ),
            }
          : size
      ),
    }));
  }

  function openBulkEditor(sectionId, colorGroupId) {
    setBulkEditor({ sectionId, colorGroupId, text: "" });
  }

  function closeBulkEditor() {
    setBulkEditor(null);
  }

  function applyBulkEditor() {
    if (!bulkEditor) return;

    const parsed = parseBulkSizes(bulkEditor.text);

    if (parsed.errors.length || !parsed.sizes.length) {
      window.alert(
        parsed.errors.length
          ? parsed.errors.slice(0, 10).join("\n")
          : "사이즈를 입력해주세요. 예: 480.2100.2"
      );
      return;
    }

    changeGroup(
      bulkEditor.sectionId,
      bulkEditor.colorGroupId,
      group => ({
        ...group,
        sizes:
          group.sizes.length === 1 &&
          isBlankSize(group.sizes[0])
            ? parsed.sizes
            : [...group.sizes, ...parsed.sizes],
      })
    );

    setBulkEditor(null);
  }

  function resetAll() {
    if (
      !window.confirm(
        "입력·재단 도면·완료 체크를 모두 초기화하시겠습니까? 실제 재단한 필름은 복구되지 않습니다."
      )
    ) return;

    setRolls([createRoll()]);
    setSections([createSection()]);
    setRollMode("waste");
    clearResult();
    setBulkEditor(null);
  }

  function calculate() {
    if (calculationLock.current) return;
    calculationLock.current = true;

    if (
      Object.values(progress).some(Boolean) &&
      !window.confirm(
        "다시 계산하면 완료 체크가 초기화됩니다. 실제 재단 후 남은 롤 길이를 확인하셨나요?"
      )
    ) {
      calculationLock.current = false;
      return;
    }

    clearResult();
    setCalculating(true);

    calculationTimer.current = window.setTimeout(() => {
      try {
        const response = optimizeCutting({
          rolls,
          sections,
          rollMode,
        });

        if (mounted.current) {
          setErrors(response.errors || []);
          setResult(response.result || null);
          setShowResult(Boolean(response.result));
        }
      } catch (error) {
        if (mounted.current) {
          setErrors([
            error?.message || "재단 계산 중 오류가 발생했습니다.",
          ]);
        }
      } finally {
        calculationLock.current = false;
        if (mounted.current) setCalculating(false);
      }
    }, 30);
  }

  const hasProgress = Object.values(progress).some(Boolean);

  return (
    <main className={styles.page}>
      <div className={styles.container}>
        <header className={styles.header}>
          <div>
            <p className={styles.eyebrow}>FILM CUTTING</p>
            <h1 className={styles.title}>필름 재단</h1>
            <p className={styles.description}>
              폭 {FILM_WIDTH}mm · 컬러별 보유 롤 최적 재단
            </p>
          </div>
          <button
            type="button"
            className={styles.resetButton}
            onClick={resetAll}
            disabled={calculating || !draftReady}
          >
            전체 초기화
          </button>
        </header>

        <a
          href={
            context.site
              ? `/worker/site/${context.site.site_id}`
              : "/worker"
          }
        >
          ← 내 현장으로
        </a>

        {context.site && (
          <h2>{context.site.site_name || "현장"}</h2>
        )}

        {selectedMaterial && (
          <p>
            선택한 필름: {filmLabel(selectedMaterial)}
            {result
              ? " · 저장된 도면을 우선 불러왔습니다."
              : ""}
          </p>
        )}

        {result && (
          <button
            type="button"
            className={styles.calculateButton}
            onClick={() => setShowResult(true)}
          >
            저장한 재단 이어보기
          </button>
        )}

        {hasProgress && (
          <p>
            완료 체크가 있는 도면은 입력을 잠갔습니다.{" "}
            <button
              type="button"
              onClick={() => {
                if (
                  window.confirm(
                    "도면과 완료 체크를 지우고 다시 작성하시겠습니까? 실제 재단 후 남은 길이를 새로 입력해주세요."
                  )
                ) clearResult();
              }}
            >
              재단 계획 다시 작성
            </button>
          </p>
        )}

        <p
          role="status"
          style={{ color: "#64748b", fontSize: 12, lineHeight: 1.6 }}
        >
          {saveStatus || "입력 내용을 준비하고 있습니다…"}
        </p>

        <div className={styles.summaryBar}>
          <SummaryPill label="롤" value={`${summary.rollCount}개`} />
          <SummaryPill label="컬러" value={`${summary.colorCount}종`} />
          <SummaryPill label="부위" value={`${summary.sectionCount}개`} />
          <SummaryPill label="재단" value={`${summary.pieceCount}장`} />
        </div>

        <fieldset
          disabled={calculating || !draftReady || hasProgress}
          style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}
        >
          <CuttingInput
            materials={materials}
            styles={styles}
            rolls={rolls}
            sections={sections}
            colors={colors}
            bulkEditor={bulkEditor}
            setBulkEditor={setBulkEditor}
            addRoll={addRoll}
            removeRoll={removeRoll}
            updateRoll={updateRoll}
            addSection={addSection}
            removeSection={removeSection}
            copySection={copySection}
            updateSection={updateSection}
            addColorGroup={addColorGroup}
            removeColorGroup={removeColorGroup}
            updateColorGroup={updateColorGroup}
            addSize={addSize}
            removeSize={removeSize}
            updateSize={updateSize}
            changeQuantity={changeQuantity}
            openBulkEditor={openBulkEditor}
            closeBulkEditor={closeBulkEditor}
            applyBulkEditor={applyBulkEditor}
          />
        </fieldset>

        <section className={styles.card}>
          <div className={styles.cardHeader}>
            <div>
              <span className={styles.step}>3</span>
              <div>
                <h2>최적 재단 계산</h2>
                <p>
                  같은 길이는 함께 배치하고 남는 난단에 작은
                  재단물을 넣습니다.
                </p>
              </div>
            </div>
          </div>

          <div className={styles.optionRow}>
            <label>
              <span>롤 사용 기준</span>
              <select
                disabled={calculating || !draftReady || hasProgress}
                value={rollMode}
                onChange={event => {
                  setRollMode(event.target.value);
                  clearResult();
                }}
              >
                <option value="waste">사용 길이 최소</option>
                <option value="short-first">짧은 롤 우선</option>
              </select>
            </label>
          </div>

          <p
            style={{
              color: "#64748b",
              fontSize: 12,
              lineHeight: 1.6,
            }}
          >
            짧은 롤 우선은 짧은 롤부터 사용합니다. 현재 롤에 들어갈
            재단물이 남아 있으면 다음 롤로 넘어가지 않습니다.
          </p>

          <button
            type="button"
            className={styles.calculateButton}
            disabled={calculating || !draftReady}
            onClick={calculate}
          >
            {calculating ? "계산 중..." : "최적 재단 계산"}
          </button>

          {errors.length > 0 && (
            <div role="alert" className={styles.errorBox}>
              {errors.map((error, index) => (
                <p key={index}>• {error}</p>
              ))}
            </div>
          )}
        </section>

        <CuttingResult
          result={showResult ? result : null}
          progress={progress}
          onProgress={setProgress}
          materials={materials}
          preferredColor={
            selectedMaterial ? filmLabel(selectedMaterial) : ""
          }
          onClose={() => setShowResult(false)}
        />
      </div>
    </main>
  );
}

function SummaryPill({ label, value }) {
  return (
    <div className={styles.summaryPill}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
            }
