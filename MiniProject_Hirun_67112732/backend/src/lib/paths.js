// src/lib/paths.js — ที่อยู่โฟลเดอร์ที่ใช้ร่วมกันหลายชั้น
import { fileURLToPath } from "node:url";

export const UPLOAD_DIR = fileURLToPath(new URL("../../uploads/", import.meta.url));
export const FRONTEND_DIR = fileURLToPath(new URL("../../../frontend/", import.meta.url));
