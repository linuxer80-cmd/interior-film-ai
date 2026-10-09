"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import styles from "./FilmCuttingOptimizer.module.css";
import CuttingInput from "./CuttingInput";
import CuttingResult from "./CuttingResult";
import {
  FILM_WIDTH,
  optimizeCutting,
} from "./cuttingOptimizer";
import { filmLabel } from "./FilmThumbnail";

const DRAFT_KEY = "film-cutting-draft-v1";

const makeId = (prefix = "id") =>
  `${prefix}-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 10)}`;

const normalizeColor = value =>
  String(value || "").trim().toUpperCase();

const createRoll = (color = "") => ({
  id: makeId("roll"),
  color,
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

function validDraft(draft) {
  return (
    draft?.version === 1 &&
    Array.isArray(draft.rolls) &&
    draft.rolls.length > 0 &&
    draft.rolls.length <= 100 &&
    draft.rolls.every(
      roll => roll && typeof roll.id === "string"
    ) &&
    Array.isArray(draft.sections) &&
    draft.sections.length > 0 &&
    draft.sections.length <= 500 &&
    draft.sections.every(
      section =>
        section &&
        typeof section.id === "string" &&
        Array.isArray(section.colors) &&
        section.colors.length > 0 &&
        section.colors.every(
          group =>
            group &&
            typeof group.id === "string" &&
            Array.isArray(group.sizes) &&
            group.sizes.length > 0 &&
            group.sizes.every(
              size =>
                size && typeof size.id === "string"
            )
        )
    )
  );
}

function restrictedErrors(
  rolls,
  sections,
  labels,
  restricted
) {
  if (!restricted) return [];

  if (!labels.length) {
    return ["현장에 등록된 필름이 없습니다."];
  }

  const allowed = new Set(labels);

  const bad = [
    ...rolls.map(roll => roll.color),
    ...sections.flatMap(section =>
      section.colors.map(group => group.color)
    ),
  ].filter(
    color =>
      color &&
      !allowed.has(normalizeColor(color))
  );

  return bad.length
    ? [
        "현장에 등록된 필름으로 다시 선택해주세요: " +
          [...new Set(bad)].join(", "),
      ]
    : [];
}

function parseBulkSizes(value) {
  const sizes = [];
  const errors = [];

  String(value || "")
    .split(/\r?\n/)
    .forEach((raw, index) => {
      const line = raw.trim();
      if (!line) return;

      const parts = line
        .replace(/[xX×*,\s]+/g, ".")
        .split(".");

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
      const quantity =
        parts.length === 3 ? Number(parts[2]) : 1;

      if (
        ![width, height, quantity].every(
          Number.isSafeInteger
        ) ||
        width <= 0 ||
        height <= 0 ||
        quantity < 1 ||
        quantity > 500
      ) {
        errors.push(
          `${index + 1}행: 크기는 양수, 수량은 1~500으로 입력해주세요.`
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

export default function FilmCuttingOptimizer({
  context,
}) {
  const storageKey = context.storageKey;
  const materials = context.materials || [];
  const restricted = Boolean(
    context.restrictMaterials || context.site
  );

  const labels = [
    ...new Set(materials.map(filmLabel)),
  ];

  const initialColor =
    restricted && labels.length === 1
      ? labels[0]
      : "";

  const [rolls, setRolls] = useState(() => [
    createRoll(initialColor),
  ]);
  const [sections, setSections] = useState(() => [
    createSection("", initialColor),
  ]);
  const [rollMode, setRollMode] = useState("waste");
  const [result, setResult] = useState(null);
  const [progress, setProgress] = useState({});
  const [showResult, setShowResult] = useState(false);
  const [errors, setErrors] = useState([]);
  const [calculating, setCalculating] = useState(false);
  const [bulkEditor, setBulkEditor] = useState(null);
  const [draftReady, setDraftReady] = useState(false);
  const [saveStatus, setSaveStatus] = useState("");

  const timer = useRef(null);
  const lock = useRef(false);
  const mounted = useRef(true);
  const saveBlocked = useRef(false);

  useEffect(() => {
    mounted.current = true;

    try {
      const raw =
        window.localStorage.getItem(storageKey) ||
        (!context.site
          ? window.localStorage.getItem(DRAFT_KEY)
          : null);

      const draft = raw ? JSON.parse(raw) : null;

      if (raw && !validDraft(draft)) {
        saveBlocked.current = true;
        setErrors([
          "저장된 기록을 읽지 못했습니다. 기존 기록을 보호하기 위해 자동 저장을 중단했습니다.",
        ]);
      } else if (draft) {
        setRolls(draft.rolls);
        setSections(draft.sections);
        setRollMode(
          draft.rollMode === "short-first"
            ? "short-first"
            : "waste"
        );

        if (Array.isArray(draft.result?.usedRolls)) {
          setResult(draft.result);
          setProgress(draft.progress || {});
        }

        setSaveStatus("저장한 재단 기록을 불러왔습니다.");
      }
    } catch {
      saveBlocked.current = true;
      setErrors([
        "저장된 기록을 읽지 못했습니다. 자동 저장이 중단되어 있습니다.",
      ]);
    }

    setDraftReady(true);

    return () => {
      mounted.current = false;
      window.clearTimeout(timer.current);
    };
  }, []);

  useEffect(() => {
    if (!draftReady || saveBlocked.current) return;

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

        setSaveStatus("현재 기기에 자동 저장되었습니다.");
      } catch {
        setSaveStatus(
          "자동 저장에 실패했습니다. 저장 공간을 확인해주세요."
        );
      }
    };

    save();
    window.addEventListener("pagehide", save);

    return () =>
      window.removeEventListener("pagehide", save);
  }, [
    draftReady,
    rolls,
    sections,
    rollMode,
    result,
    progress,
    storageKey,
  ]);

  const colors = useMemo(
    () => [
      ...new Set(
        rolls
          .map(roll => normalizeColor(roll.color))
          .filter(Boolean)
      ),
    ],
    [rolls]
  );

  const hasProgress =
    Object.values(progress).some(Boolean);

  function clearResult() {
    setResult(null);
    setProgress({});
    setShowResult(false);
    setErrors([]);
  }

  function changeSections(update) {
    if (lock.current || hasProgress) return;
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
                group.id === groupId
                  ? update(group)
                  : group
              ),
            }
          : section
      )
    );
  }

  function addRoll() {
    if (lock.current || hasProgress) return;

    setRolls(previous => [
      ...previous,
      createRoll(
        normalizeColor(previous.at(-1)?.color) ||
          initialColor
      ),
    ]);
    clearResult();
  }

  function removeRoll(id) {
    if (lock.current || hasProgress) return;

    setRolls(previous =>
      previous.length > 1
        ? previous.filter(roll => roll.id !== id)
        : previous
    );
    clearResult();
  }

  function updateRoll(id, field, value) {
    if (lock.current || hasProgress) return;

    const nextValue =
      field === "color"
        ? normalizeColor(value)
        : value;

    if (
      field === "color" &&
      restricted &&
      nextValue &&
      !labels.includes(nextValue)
    ) {
      return;
    }

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
                normalizeColor(group.color) ===
                  previousColor
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
        roll.id === id
          ? { ...roll, [field]: nextValue }
          : roll
      )
    );
    clearResult();
  }

  function addSection() {
    changeSections(previous => [
      ...previous,
      createSection(
        previous.at(-1)?.location || "",
        colors.find(
          color => !restricted || labels.includes(color)
        ) || initialColor
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
      const index = previous.findIndex(
        section => section.id === id
      );
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
    const choices = restricted ? labels : colors;

    changeSections(previous =>
      previous.map(section => {
        if (section.id !== id) return section;

        const used = new Set(
          section.colors.map(group =>
            normalizeColor(group.color)
          )
        );

        return {
          ...section,
          colors: [
            ...section.colors,
            createColorGroup(
              choices.find(color => !used.has(color)) ||
                choices[0] ||
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
        section.id === id &&
        section.colors.length > 1
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

  function updateColorGroup(id, groupId, value) {
    const color = normalizeColor(value);

    if (
      restricted &&
      color &&
      !labels.includes(color)
    ) {
      return;
    }

    changeGroup(id, groupId, group => ({
      ...group,
      color,
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
            sizes: group.sizes.filter(
              size => size.id !== sizeId
            ),
          }
        : group
    );
  }

  function updateSize(
    id,
    groupId,
    sizeId,
    field,
    value
  ) {
    changeGroup(id, groupId, group => ({
      ...group,
      sizes: group.sizes.map(size =>
        size.id === sizeId
          ? { ...size, [field]: value }
          : size
      ),
    }));
  }

  function changeQuantity(
    id,
    groupId,
    sizeId,
    amount
  ) {
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
                  Math.floor(
                    Number(size.quantity) || 1
                  ) + amount
                )
              ),
            }
          : size
      ),
    }));
  }

  function openBulkEditor(sectionId, colorGroupId) {
    setBulkEditor({
      sectionId,
      colorGroupId,
      text: "",
    });
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
          !String(group.sizes[0].width ?? "").trim() &&
          !String(group.sizes[0].height ?? "").trim()
            ? parsed.sizes
            : [...group.sizes, ...parsed.sizes],
      })
    );

    setBulkEditor(null);
  }

  function resetAll() {
    if (
      !window.confirm(
        "이 현장의 입력·도면·완료 체크를 초기화하시겠습니까?"
      )
    ) {
      return;
    }

    saveBlocked.current = false;
    setRolls([createRoll(initialColor)]);
    setSections([createSection("", initialColor)]);
    setRollMode("waste");
    setBulkEditor(null);
    clearResult();
  }

  function calculate() {
    if (lock.current || !draftReady) return;

    if (saveBlocked.current) {
      setErrors([
        "기존 기록을 읽지 못해 계산을 중단했습니다. 기록을 확인하거나 전체 초기화 후 다시 입력해주세요.",
      ]);
      return;
    }

    const blocked = restrictedErrors(
      rolls,
      sections,
      labels,
      restricted
    );

    if (blocked.length) {
      setErrors(blocked);
      return;
    }

    if (
      hasProgress &&
      !window.confirm(
        "다시 계산하면 완료 체크가 초기화됩니다. 실제 남은 롤 길이를 확인하셨나요?"
      )
    ) {
      return;
    }

    lock.current = true;
    clearResult();
    setCalculating(true);

    timer.current = window.setTimeout(() => {
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
      } catch (cause) {
        if (mounted.current) {
          setErrors([
            cause?.message ||
              "재단 계산 중 오류가 발생했습니다.",
          ]);
        }
      } finally {
        lock.current = false;
        if (mounted.current) setCalculating(false);
      }
    }, 30);
  }

  return (
    <main className={styles.page}>
      <div className={styles.container}>
        <header className={styles.header}>
          <div>
            <h1 className={styles.title}>
              {context.site?.site_name || "필름"} 재단
            </h1>
            <p className={styles.description}>
              필름 선택 → 롤 길이 → 부위·사이즈
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
              ? `/worker/site/${context.site.site_id}?section=film`
              : "/worker"
          }
        >
          ← 내 현장으로
        </a>

        <p
          role="status"
          style={{ color: "#64748b", fontSize: 12 }}
        >
          {saveStatus || "입력 내용을 준비하고 있습니다…"}
        </p>

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
            완료 체크가 있어 입력을 잠갔습니다.{" "}
            <button
              type="button"
              onClick={() => {
                if (
                  window.confirm(
                    "도면과 완료 체크를 지우고 다시 작성하시겠습니까? 실제 남은 롤 길이를 확인해주세요."
                  )
                ) {
                  clearResult();
                }
              }}
            >
              재단 계획 다시 작성
            </button>
          </p>
        )}

        <fieldset
          disabled={
            calculating ||
            !draftReady ||
            hasProgress ||
            saveBlocked.current
          }
          style={{
            border: 0,
            padding: 0,
            margin: 0,
            minWidth: 0,
          }}
        >
          <CuttingInput
            restricted={restricted}
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
          <details>
            <summary
              style={{
                fontWeight: 800,
                cursor: "pointer",
                padding: "8px 0",
              }}
            >
              롤 사용 옵션 · 폭 {FILM_WIDTH}mm
            </summary>

            <label
              style={{
                display: "block",
                marginTop: 12,
              }}
            >
              롤 사용 기준{" "}
              <select
                disabled={
                  calculating ||
                  !draftReady ||
                  hasProgress ||
                  saveBlocked.current
                }
                value={rollMode}
                onChange={event => {
                  setRollMode(event.target.value);
                  clearResult();
                }}
              >
                <option value="waste">
                  사용 길이 최소
                </option>
                <option value="short-first">
                  짧은 롤 우선
                </option>
              </select>
            </label>
          </details>

          <button
            type="button"
            className={styles.calculateButton}
            style={{ marginTop: 16 }}
            disabled={
              calculating ||
              !draftReady ||
              saveBlocked.current
            }
            onClick={calculate}
          >
            {calculating
              ? "계산 중…"
              : "재단 도면 만들기"}
          </button>

          {errors.length > 0 && (
            <div
              role="alert"
              className={styles.errorBox}
            >
              {errors.map((error, index) => (
                <p key={index}>{error}</p>
              ))}
            </div>
          )}
        </section>

        <CuttingResult
          result={showResult ? result : null}
          progress={progress}
          onProgress={setProgress}
          materials={materials}
          preferredColor=""
          onClose={() => setShowResult(false)}
        />
      </div>
    </main>
  );
    }
