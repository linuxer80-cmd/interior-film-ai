"use client";

import FilmThumbnail, { filmLabel } from "./FilmThumbnail";

export default function CuttingInput({
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
  return (
    <>
      <section className={styles.card}>
        <div className={styles.cardHeader}>
          <div>
            <span className={styles.step}>1</span>
            <div>
              <h2>보유 필름</h2>
              <p>컬러와 실제 남은 롤 길이를 입력하세요.</p>
            </div>
          </div>
          <button
            type="button"
            className={styles.blackButton}
            onClick={addRoll}
          >
            + 롤
          </button>
        </div>

        <div className={styles.rollList}>
          {rolls.map((roll, index) => (
            <div key={roll.id} className={styles.rollRow}>
              <strong className={styles.rowIndex}>
                {index + 1}
              </strong>

              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  minWidth: 0,
                }}
              >
                <FilmThumbnail
                  material={materials.find(
                    material => filmLabel(material) === roll.color
                  )}
                  size={32}
                />

                {materials.length ? (
                  <select
                    aria-label="현장 필름 선택"
                    className={styles.colorInput}
                    style={{ minWidth: 0, width: "100%" }}
                    value={roll.color}
                    onChange={event =>
                      updateRoll(roll.id, "color", event.target.value)
                    }
                  >
                    <option value="">필름 선택</option>

                    {roll.color &&
                      !materials.some(
                        material => filmLabel(material) === roll.color
                      ) && (
                        <option value={roll.color}>{roll.color}</option>
                      )}

                    {[...new Set(materials.map(filmLabel))].map(label => (
                      <option key={label} value={label}>
                        {label}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    aria-label="필름 코드"
                    className={styles.colorInput}
                    style={{ minWidth: 0, width: "100%" }}
                    value={roll.color}
                    placeholder="S115"
                    onChange={event =>
                      updateRoll(roll.id, "color", event.target.value)
                    }
                  />
                )}
              </div>

              <div className={styles.lengthInput}>
                <input
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.1"
                  value={roll.lengthM}
                  placeholder="11"
                  onChange={event =>
                    updateRoll(roll.id, "lengthM", event.target.value)
                  }
                />
                <span>m</span>
              </div>

              <select
                className={styles.grainSelect}
                value={roll.grainDirection ? "grain" : "free"}
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

              <button
                type="button"
                className={styles.iconDelete}
                disabled={rolls.length <= 1}
                onClick={() => removeRoll(roll.id)}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      </section>

      <section className={styles.card}>
        <div className={styles.cardHeader}>
          <div>
            <span className={styles.step}>2</span>
            <div>
              <h2>재단 입력</h2>
              <p>위치와 부위별로 컬러와 사이즈를 입력하세요.</p>
            </div>
          </div>
        </div>

        {colors.length === 0 && (
          <div
            style={{
              marginBottom: 10,
              padding: "10px 11px",
              borderRadius: 9,
              background: "#fff7ed",
              color: "#9a3412",
              fontSize: 12,
              fontWeight: 800,
            }}
          >
            먼저 보유 필름의 컬러번호를 입력하세요.
          </div>
        )}

        {sections.map((section, sectionIndex) => (
          <article key={section.id} className={styles.sectionCard}>
            <div className={styles.sectionHeader}>
              <strong>#{sectionIndex + 1}</strong>
              <div className={styles.sectionActions}>
                <button
                  type="button"
                  onClick={() => copySection(section.id)}
                >
                  복사
                </button>
                <button
                  type="button"
                  disabled={sections.length <= 1}
                  onClick={() => removeSection(section.id)}
                >
                  삭제
                </button>
              </div>
            </div>

            <div className={styles.locationRow}>
              <label>
                <span>시공 위치</span>
                <input
                  value={section.location}
                  placeholder="예: 방1"
                  onChange={event =>
                    updateSection(
                      section.id,
                      "location",
                      event.target.value
                    )
                  }
                />
              </label>
              <label>
                <span>시공 부위</span>
                <input
                  value={section.part}
                  placeholder="예: 샤시"
                  onChange={event =>
                    updateSection(section.id, "part", event.target.value)
                  }
                />
              </label>
            </div>

            {section.colors.map((group, colorIndex) => (
              <div key={group.id} className={styles.colorBlock}>
                <div className={styles.colorBlockHeader}>
                  <div className={styles.colorTitle}>
                    <span>컬러 {colorIndex + 1}</span>

                    <FilmThumbnail
                      material={materials.find(
                        material =>
                          filmLabel(material) === group.color
                      )}
                      size={32}
                    />

                    <select
                      value={group.color}
                      onChange={event =>
                        updateColorGroup(
                          section.id,
                          group.id,
                          event.target.value
                        )
                      }
                    >
                      <option value="">컬러 선택</option>
                      {colors.map(color => (
                        <option key={color} value={color}>
                          {color}
                        </option>
                      ))}
                    </select>
                  </div>

                  <button
                    type="button"
                    className={styles.textDelete}
                    disabled={section.colors.length <= 1}
                    onClick={() =>
                      removeColorGroup(section.id, group.id)
                    }
                  >
                    컬러 삭제
                  </button>
                </div>

                <div className={styles.sizeList}>
                  {group.sizes.map((size, sizeIndex) => (
                    <div key={size.id} className={styles.sizeRow}>
                      <span className={styles.sizeIndex}>
                        {sizeIndex + 1}
                      </span>

                      <input
                        className={styles.dimensionInput}
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

                      <span className={styles.multiply}>×</span>

                      <input
                        className={styles.dimensionInput}
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

                      <span className={styles.mm}>mm</span>

                      <QuantityStepper
                        className={styles.quantityStepper}
                        value={size.quantity}
                        onMinus={() =>
                          changeQuantity(
                            section.id,
                            group.id,
                            size.id,
                            -1
                          )
                        }
                        onPlus={() =>
                          changeQuantity(
                            section.id,
                            group.id,
                            size.id,
                            1
                          )
                        }
                        onChange={value =>
                          updateSize(
                            section.id,
                            group.id,
                            size.id,
                            "quantity",
                            Math.max(1, Number(value) || 1)
                          )
                        }
                      />

                      <button
                        type="button"
                        className={styles.iconDelete}
                        disabled={group.sizes.length <= 1}
                        onClick={() =>
                          removeSize(section.id, group.id, size.id)
                        }
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>

                <div className={styles.sizeActions}>
                  <button
                    type="button"
                    onClick={() => addSize(section.id, group.id)}
                  >
                    + 사이즈
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      openBulkEditor(section.id, group.id)
                    }
                  >
                    여러개 한번에
                  </button>
                </div>

                {bulkEditor?.sectionId === section.id &&
                  bulkEditor?.colorGroupId === group.id && (
                    <div className={styles.bulkBox}>
                      <p>가로.세로.수량</p>
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
                        예: 480.2100.2
                        <br />
                        = 480×2100 2장
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
                          적용
                        </button>
                      </div>
                    </div>
                  )}
              </div>
            ))}

            <button
              type="button"
              className={styles.addColorButton}
              disabled={colors.length === 0}
              onClick={() => addColorGroup(section.id)}
            >
              + 다른 컬러
            </button>
          </article>
        ))}

        <button
          type="button"
          className={styles.blackButton}
          onClick={addSection}
          style={{
            width: "100%",
            minHeight: 48,
            marginTop: 4,
            fontSize: 14,
          }}
        >
          + 다음 부위
        </button>
      </section>
    </>
  );
}

function QuantityStepper({
  className,
  value,
  onMinus,
  onPlus,
  onChange,
}) {
  const quantity = Math.max(1, Number(value) || 1);

  return (
    <div className={className}>
      <button
        type="button"
        onClick={onMinus}
        disabled={quantity <= 1}
      >
        −
      </button>
      <input
        type="number"
        inputMode="numeric"
        min="1"
        value={quantity}
        onChange={event => onChange(event.target.value)}
      />
      <button type="button" onClick={onPlus}>
        +
      </button>
    </div>
  );
                                  }
