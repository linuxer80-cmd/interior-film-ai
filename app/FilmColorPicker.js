"use client";

import { useEffect, useRef, useState } from "react";
import FilmColorPickerContent from "./FilmColorPickerContent";

export default function FilmColorPicker(props) {
  const frameRef = useRef(null);
  const [viewportHeight, setViewportHeight] = useState(null);

  useEffect(() => {
    function update() {
      setViewportHeight(
        window.visualViewport?.height || window.innerHeight
      );
    }

    update();
    window.addEventListener("resize", update);
    window.visualViewport?.addEventListener("resize", update);

    return () => {
      window.removeEventListener("resize", update);
      window.visualViewport?.removeEventListener("resize", update);
      if (frameRef.current !== null) {
        cancelAnimationFrame(frameRef.current);
      }
    };
  }, []);

  function handleSelection(event) {
    const button = event.target.closest("button");
    const dialog = button?.closest('[role="dialog"]');

    if (!dialog || button.style.borderRadius !== "999px") return;

    const row = button.parentElement;
    const section = row?.parentElement;
    const scroller = dialog.lastElementChild;

    if (!row || !section || !scroller) return;

    if (frameRef.current !== null) {
      cancelAnimationFrame(frameRef.current);
    }

    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = requestAnimationFrame(() => {
        frameRef.current = null;

        if (!button.isConnected || !dialog.isConnected) return;

        const behavior = window.matchMedia(
          "(prefers-reduced-motion: reduce)"
        ).matches ? "auto" : "smooth";

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

        const next = section.nextElementSibling;
        if (!next) return;

        const scrollerBox = scroller.getBoundingClientRect();
        const nextBox = next.getBoundingClientRect();

        scroller.scrollTo({
          top: Math.max(
            0,
            scroller.scrollTop + nextBox.top - scrollerBox.top - 12
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
