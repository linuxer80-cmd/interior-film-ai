"use client";

import { useState } from "react";
import { supabase } from "../lib/supabase";

export default function Home() {
  const [images, setImages] = useState([]);
  const [previews, setPreviews] = useState([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  async function handleImages(e) {
    const files = Array.from(e.target.files || []);

    if (files.length === 0) return;

    setImages(files);
    setMessage("");

    const previewUrls = await Promise.all(
      files.map(
        (file) =>
          new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(file);
          })
      )
    );

    setPreviews(previewUrls);
  }

  async function handleAnalyze() {
    if (images.length === 0) {
      setMessage("먼저 시공 사진을 선택해주세요.");
      return;
    }

    setLoading(true);
    setMessage("사진을 저장하고 있습니다...");

    try {
      for (let i = 0; i < images.length; i++) {
        const file = images[i];

        const safeName = file.name
          .replace(/\s+/g, "-")
          .replace(/[^a-zA-Z0-9._-]/g, "");

        const filePath =
          "customer/" +
          Date.now() +
          "-" +
          i +
          "-" +
          (safeName || "photo.jpg");

        const { error } = await supabase.storage
          .from("work-photos")
          .upload
