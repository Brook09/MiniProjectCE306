// src/middlewares/upload.js — รับไฟล์รูปภาพแนบการแจ้งซ่อม (multipart/form-data)
// เก็บไฟล์จริงไว้ในโฟลเดอร์ uploads/ แล้วเก็บแค่ path ไว้ในฐานข้อมูล
import { randomUUID } from "node:crypto";
import multer from "multer";
import { badRequest } from "../lib/errors.js";
import { UPLOAD_DIR } from "../lib/paths.js";

const EXT = { "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp", "image/gif": ".gif" };

export const uploadImage = multer({
  storage: multer.diskStorage({
    destination: UPLOAD_DIR,
    // ตั้งชื่อไฟล์ใหม่แบบสุ่ม — ไม่ใช้ชื่อเดิมจากผู้ใช้ (กันชื่อซ้ำและชื่อไฟล์แปลก ๆ)
    filename: (_req, file, cb) => cb(null, `${randomUUID()}${EXT[file.mimetype]}`),
  }),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 }, // ไม่เกิน 5 MB
  fileFilter: (_req, file, cb) => {
    if (EXT[file.mimetype]) cb(null, true);
    else cb(badRequest("รองรับเฉพาะไฟล์ภาพ JPG, PNG, WEBP หรือ GIF"));
  },
}).single("image");
