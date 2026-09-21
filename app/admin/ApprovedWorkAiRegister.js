"use client";

import { useState } from "react";
import { supabase } from "../../lib/supabase";
import {
  resizeImage,
  getImageHash,
} from "./imageUtils";
import {
  analyzeImage,
  createEmbedding,
} from "./aiUtils";
import { PROJECT_ID } from "./adminConstants";

export default function ApprovedWorkAiRegister({
  siteId,
  report,
  materials = [],
  beforePhotos = [],
  afterPhotos = [],
  onRegistered,
}) {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] =
