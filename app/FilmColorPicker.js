"use client";

import { useEffect, useRef, useState } from "react";
import FilmColorPickerContent from "./FilmColorPickerContent";

export default function FilmColorPicker(props) {
  const frameRef = useRef(null);
  const [viewportHeight, setViewportHeight] = useState(null);

  useEffect(() => {
    function updateHeight() {
      setViewportHeight(
        window.visualViewport?.height || window.innerHeight,
      );
    }

    updateHeight();

    window.addEventListener("resize", updateHeight);
    window.visualViewport?.addEventListener("resize", updateHeight);

    return () => {
      window.removeEventListener("resize", updateHeight);
      window.visualViewport?.removeEventListener(
        "resize",
        updateHeight,
      );

      if (frameRef.current !== null) {
        cancelAnimationFrame(frameRef.current);
      }
    };
  }, []);

  function handleSelection(event) {
    const button = event.target.closest("button");
    const dialog = button?.closest('[role="dialog"]');

    // 제조사·패턴·컬러 선택 버튼에만 적용합니다.
    if (!dialog || button.style.borderRadius !== "999px") {
      return;
    }

    const row = button.parentElement;
    const section = row?.parentElement;
    const scroller = dialog.lastElementChild;

    if (!row || !section || !scroller) return;

    if (frameRef.current !== null) {
      cancelAnimationFrame(frameRef.current);
    }

    // 선택 결과가 화면에 반영된 다음 이동합니다.
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = requestAnimationFrame(() => {
        frameRef.current = null;

        if (!button.isConnected || !dialog.isConnected) return;

        const behavior = window.matchMedia(
          "(prefers-reduced-motion: reduce)",
        ).matches
          ? "auto"
          : "smooth";

        // 가로 메뉴에서 선택한 항목을 가운데로 이동합니다.
        if (row.scrollWidth > row.clientWidth) {
          const rowBox = row.getBoundingClientRect();
          const buttonBox = button.getBoundingClientRect();

          row.scrollTo({
            left:
              row.scrollLeft +
              buttonBox.left -
              rowBox.left -
              (row.clientWidth - buttonBox.width) / 2,
            behavior,
          });
        }

        // 다음 선택 단계나 제품 목록으로 이동합니다.
        const next = section.nextElementSibling;

        if (!next) return;

        const scrollerBox = scroller.getBoundingClientRect();
        const nextBox = next.getBoundingClientRect();

        scroller.scrollTo({
          top: Math.max(
            0,
            scroller.scrollTop +
              nextBox.top -
              scrollerBox.top -
              12,
          ),
          behavior,
        });
      });
    });
  }

  return (
    <div
      className="film-scroll-fix"
      onClickCapture={handleSelection}
      style={
        viewportHeight
          ? { "--film-visible-height": `${viewportHeight}px` }
          : undefined
      }
    >
      <FilmColorPickerContent {...props} />

      <style jsx global>{`
        .film-scroll-fix [role="dialog"] {
          box-sizing: border-box;
          max-height: min(
            88dvh,
            calc(var(--film-visible-height, 100dvh) - 12px)
          ) !important;
        }

        .film-scroll-fix [role="dialog"] > div:not(:last-child) {
          flex-shrink: 0;
        }

        .film-scroll-fix [role="dialog"] > div:last-child {
          min-height: 0;
          overflow-y: auto !important;
          overscroll-behavior-y: contain;
          padding-bottom: calc(
            32px + env(safe-area-inset-bottom, 0px)
          ) !important;
          scroll-padding-top: 12px;
        }

        .film-scroll-fix [role="dialog"] input {
          box-sizing: border-box;
          max-width: 100%;
          font-size: 16px !important;
        }

        .film-scroll-fix [role="dialog"] button {
          touch-action: manipulation;
        }
      `}</style>
    </div>
  );
}
// 파일 끝
