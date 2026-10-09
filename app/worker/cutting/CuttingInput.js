"use client";

import FilmThumbnail, {
  filmLabel,
} from "./FilmThumbnail";

const normalize = value =>
  String(value || "").trim().toUpperCase();

const fieldStyle = {
  width: "100%",
  minWidth: 0,
  minHeight: 44,
  padding: "10px 8px",
  border: "1px solid #cbd5e1",
  borderRadius: 9,
  boxSizing: "border-box",
  fontSize: 16,
  background: "#fff",
  color: "#182c47",
};

function FilmSelect({
  value,
  choices,
  onChange,
  label = "현장 필름 선택",
}) {
  const current = normalize(value);
  const valid = !current || choices.includes(current);

  return (
    <div style={{ flex: 1, minWidth: 0 }}>
      <select
        aria-label={label}
        style={fieldStyle}
        value={valid ? current : ""}
        onChange={event =>
          onChange(event.target.value)
        }
      >
        <option value="">
          {valid ? "필름 선택" : "필름 다시 선택"}
        </option>

        {choices.map(color => (
          <option key={color} value={color}>
            {color}
          </option>
        ))}
      </select>

      {!valid && (
        <small
          style={{
            display: "block",
            color: "#b91c1c",
            marginTop: 4,
          }}
        >
          기존 {value} → 등록된 필름으로 다시 선택
        </small>
      )}
    </div>
  );
}

export default function CuttingInput({
  restricted = false,
  materials = [],
  styles,
  rolls,
  sections,
  colors,
  bulkEditor,
  setBulkEditor,
  addRoll,
  removeRoll,
  updateRoll,
  addSection,
  removeSection,
  copySection,
  updateSection,
  addColorGroup,
  removeColorGroup,
  updateColorGroup,
  addSize,
  removeSize,
  updateSize,
  changeQuantity,
  openBulkEditor,
  closeBulkEditor,
  applyBulkEditor,
}) {
  const labels = [
    ...new Set(materials.map(filmLabel)),
  ];

  const choices = restricted ? labels : colors;

  function materialFor(color) {
    return materials.find(
      material =>
        filmLabel(material) === normalize(color)
    );
  }

  return (
    <>
      <section className={styles.card}>
        <h2 style={{ marginTop: 0 }}>
          1. 필름 · 롤 길이
        </h2>

        <p
          style={{
            fontSize: 13,
            color: "#64748b",
          }}
        >
          {restricted
            ? "이 현장에 등록된 필름만 선택할 수 있습니다."
            : "필름 코드와 실제 남은 롤 길이를 입력하세요."}
        </p>

        {rolls.map((roll, index) => (
          <article
            key={roll.id}
            style={{
              padding: 12,
              marginTop: 10,
              background: "#f8fafc",
              borderRadius: 12,
              border: "1px solid #e2e8f0",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                marginBottom: 10,
              }}
            >
              <strong>롤 {index + 1}</strong>

              <button
                type="button"
                onClick={() => removeRoll(roll.id)}
                disabled={rolls.length <= 1}
                style={{ marginLeft: "auto" }}
              >
                삭제
              </button>
            </div>

            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              <FilmThumbnail
                material={materialFor(roll.color)}
                size={40}
              />

              {restricted ? (
                <FilmSelect
                  value={roll.color}
                  choices={labels}
                  onChange={value =>
                    updateRoll(
                      roll.id,
                      "color",
                      value
                    )
                  }
                />
              ) : (
                <input
                  aria-label="필름 코드"
                  style={fieldStyle}
                  value={roll.color}
                  placeholder="예: S115"
                  onChange={event =>
                    updateRoll(
                      roll.id,
                      "color",
                      event.target.value
                    )
                  }
                />
              )}
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns:
                  "minmax(0, 1fr) minmax(0, 1fr)",
                gap: 10,
                marginTop: 10,
              }}
            >
              <label>
                <span
                  style={{
                    display: "block",
                    fontSize: 12,
                    marginBottom: 5,
                  }}
                >
                  남은 길이(m)
                </span>

                <input
                  aria-label={`롤 ${index + 1} 남은 길이`}
                  style={fieldStyle}
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.1"
                  value={roll.lengthM}
                  placeholder="예: 11"
                  onChange={event =>
                    updateRoll(
                      roll.id,
                      "lengthM",
                      event.target.value
                    )
                  }
                />
              </label>

              <label>
                <span
                  style={{
                    display: "block",
                    fontSize: 12,
                    marginBottom: 5,
                  }}
                >
                  결 방향
                </span>

                <select
                  style={fieldStyle}
                  value={
                    roll.grainDirection
                      ? "grain"
                      : "free"
                  }
                  onChange={event =>
                    updateRoll(
                      roll.id,
                      "grainDirection",
                      event.target.value === "grain"
                    )
                  }
                >
                  <option value="free">결 없음</option>
                  <option value="grain">결 있음</option>
                </select>
              </label>
            </div>
          </article>
        ))}

        <button
          type="button"
          className={styles.blackButton}
          onClick={addRoll}
          style={{ width: "100%", marginTop: 12 }}
        >
          + 롤 추가
        </button>
      </section>

      <section className={styles.card}>
        <h2 style={{ marginTop: 0 }}>
          2. 부위 · 사이즈
        </h2>

        {sections.map((section, sectionIndex) => (
          <article
            key={section.id}
            className={styles.sectionCard}
          >
            <div className={styles.sectionHeader}>
              <strong>부위 {sectionIndex + 1}</strong>

              <div className={styles.sectionActions}>
                <button
                  type="button"
                  onClick={() =>
                    copySection(section.id)
                  }
                >
                  복사
                </button>

                <button
                  type="button"
                  disabled={sections.length <= 1}
                  onClick={() =>
                    removeSection(section.id)
                  }
                >
                  삭제
                </button>
              </div>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns:
                  "repeat(2, minmax(0, 1fr))",
                gap: 8,
                marginBottom: 12,
              }}
            >
              <input
                style={fieldStyle}
                aria-label="시공 위치"
                value={section.location}
                placeholder="위치 · 방1"
                onChange={event =>
                  updateSection(
                    section.id,
                    "location",
                    event.target.value
                  )
                }
              />

              <input
                style={fieldStyle}
                aria-label="시공 부위"
                value={section.part}
                placeholder="부위 · 문틀"
                onChange={event =>
                  updateSection(
                    section.id,
                    "part",
                    event.target.value
                  )
                }
              />
            </div>

            {section.colors.map(group => {
              const editing =
                bulkEditor?.sectionId === section.id &&
                bulkEditor?.colorGroupId === group.id;

              return (
                <div
                  key={group.id}
                  className={styles.colorBlock}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      marginBottom: 10,
                    }}
                  >
                    <FilmThumbnail
                      material={materialFor(group.color)}
                      size={36}
                    />

                    <FilmSelect
                      value={group.color}
                      choices={choices}
                      label="부위에 사용할 필름"
                      onChange={value =>
                        updateColorGroup(
                          section.id,
                          group.id,
                          value
                        )
                      }
                    />

                    {section.colors.length > 1 && (
                      <button
                        type="button"
                        onClick={() =>
                          removeColorGroup(
                            section.id,
                            group.id
                          )
                        }
                      >
                        삭제
                      </button>
                    )}
                  </div>

                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns:
                        "minmax(0, 1fr) minmax(0, 1fr) 62px 36px",
                      gap: 5,
                      marginBottom: 6,
                      fontSize: 12,
                      color: "#64748b",
                    }}
                  >
                    <span>가로(mm)</span>
                    <span>세로(mm)</span>
                    <span>수량</span>
                    <span />
                  </div>

                  {group.sizes.map((size, index) => (
                    <div
                      key={size.id}
                      style={{
                        display: "grid",
                        gridTemplateColumns:
                          "minmax(0, 1fr) minmax(0, 1fr) 62px 36px",
                        gap: 5,
                        marginBottom: 7,
                        alignItems: "center",
                      }}
                    >
                      <input
                        style={fieldStyle}
                        aria-label={`${index + 1}번 가로 mm`}
                        type="number"
                        inputMode="numeric"
                        min="1"
                        value={size.width}
                        placeholder="480"
                        onChange={event =>
                          updateSize(
                            section.id,
                            group.id,
                            size.id,
                            "width",
                            event.target.value
                          )
                        }
                      />

                      <input
                        style={fieldStyle}
                        aria-label={`${index + 1}번 세로 mm`}
                        type="number"
                        inputMode="numeric"
                        min="1"
                        value={size.height}
                        placeholder="2100"
                        onChange={event =>
                          updateSize(
                            section.id,
                            group.id,
                            size.id,
                            "height",
                            event.target.value
                          )
                        }
                      />

                      <div>
                        <input
                          style={{
                            ...fieldStyle,
                            padding: "8px 3px",
                            textAlign: "center",
                          }}
                          aria-label={`${index + 1}번 수량`}
                          type="number"
                          inputMode="numeric"
                          min="1"
                          max="500"
                          step="1"
                          value={size.quantity}
                          onChange={event =>
                            updateSize(
                              section.id,
                              group.id,
                              size.id,
                              "quantity",
                              event.target.value
                            )
                          }
                        />

                        <div
                          style={{
                            display: "flex",
                            gap: 2,
                            marginTop: 3,
                          }}
                        >
                          <button
                            type="button"
                            aria-label="수량 줄이기"
                            style={{ flex: 1 }}
                            onClick={() =>
                              changeQuantity(
                                section.id,
                                group.id,
                                size.id,
                                -1
                              )
                            }
                          >
                            −
                          </button>

                          <button
                            type="button"
                            aria-label="수량 늘리기"
                            style={{ flex: 1 }}
                            onClick={() =>
                              changeQuantity(
                                section.id,
                                group.id,
                                size.id,
                                1
                              )
                            }
                          >
                            +
                          </button>
                        </div>
                      </div>

                      <button
                        type="button"
                        aria-label="사이즈 삭제"
                        disabled={group.sizes.length <= 1}
                        onClick={() =>
                          removeSize(
                            section.id,
                            group.id,
                            size.id
                          )
                        }
                        style={{ minHeight: 44 }}
                      >
                        ×
                      </button>
                    </div>
                  ))}

                  <div className={styles.sizeActions}>
                    <button
                      type="button"
                      onClick={() =>
                        addSize(section.id, group.id)
                      }
                    >
                      + 사이즈
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        openBulkEditor(
                          section.id,
                          group.id
                        )
                      }
                    >
                      여러개 한번에
                    </button>
                  </div>

                  {editing && (
                    <div className={styles.bulkBox}>
                      <p>가로.세로.수량 · mm</p>

                      <textarea
                        autoFocus
                        value={bulkEditor.text}
                        placeholder={
                          "480.2100.2\n400.2100\n340.2100.3"
                        }
                        onChange={event =>
                          setBulkEditor(previous => ({
                            ...previous,
                            text: event.target.value,
                          }))
                        }
                      />

                      <small>
                        480.2100.2 = 480×2100 2장
                        <br />
                        수량 생략 시 1장
                      </small>

                      <div className={styles.bulkActions}>
                        <button
                          type="button"
                          onClick={closeBulkEditor}
                        >
                          취소
                        </button>

                        <button
                          type="button"
                          className={styles.applyButton}
                          onClick={applyBulkEditor}
                        >
                          추가
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}

            <details style={{ marginTop: 12 }}>
              <summary
                style={{
                  fontSize: 13,
                  cursor: "pointer",
                }}
              >
                이 부위에 필름을 추가로 사용하나요?
              </summary>

              <button
                type="button"
                className={styles.addColorButton}
                disabled={choices.length === 0}
                onClick={() =>
                  addColorGroup(section.id)
                }
                style={{ marginTop: 8 }}
              >
                + 다른 필름 추가
              </button>
            </details>
          </article>
        ))}

        <button
          type="button"
          className={styles.blackButton}
          onClick={addSection}
          style={{
            width: "100%",
            minHeight: 48,
            marginTop: 10,
            fontSize: 15,
          }}
        >
          + 다음 부위 추가
        </button>
      </section>
    </>
  );
                    }
