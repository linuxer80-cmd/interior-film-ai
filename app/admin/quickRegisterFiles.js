import * as exifr from "exifr";
import { resizeImage, getImageHash } from "./imageUtils.js";

export async function prepareBulkPhoto(original, dependencies = {}) {
  const resize = dependencies.resize || resizeImage;
  const hash = dependencies.hash || getImageHash;
  const parse = dependencies.parse || exifr.parse;
  // Snapshot the bytes while the picker still grants access. Do not keep a
  // mobile/cloud provider's File handle through a long classification/edit flow.
  const bytes = await original.arrayBuffer();
  if (!bytes.byteLength) throw new Error("빈 사진 파일입니다.");
  const owned = new File([bytes], original.name, { type: original.type, lastModified: original.lastModified });
  let exif = {};
  try { exif = await parse(owned, { gps: true, pick: ["DateTimeOriginal", "CreateDate", "GPSLatitude", "GPSLongitude", "latitude", "longitude"] }) || {}; } catch {}
  const file = await resize(owned, 1200, 0.7);
  if (!file?.size) throw new Error("사진을 변환하지 못했습니다. JPG 또는 PNG 사진을 선택해주세요.");
  const taken = exif.DateTimeOriginal || exif.CreateDate;
  return {
    file, name: original.name, imageHash: await hash(file), fileError: "",
    takenAt: taken instanceof Date && !Number.isNaN(taken.getTime()) ? taken.toISOString() : null,
    latitude: Number.isFinite(exif.latitude) ? exif.latitude : null,
    longitude: Number.isFinite(exif.longitude) ? exif.longitude : null,
  };
}
