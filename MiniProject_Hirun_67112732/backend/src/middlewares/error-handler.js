// src/middlewares/error-handler.js — ตัวดักข้อผิดพลาดรวมศูนย์
// ทุก error ตอบรูปเดียวกัน: { error: { code, message, details? } }
import { unlink } from "node:fs/promises";
import multer from "multer";
import { ZodError } from "zod";
import { AppError } from "../lib/errors.js";

export function notFoundHandler(req, res) {
  res.status(404).json({ error: { code: "ROUTE_NOT_FOUND", message: `ไม่มีเส้นทาง ${req.method} ${req.originalUrl}` } });
}

// error จาก PostgreSQL → HTTP (ดูรหัสได้ที่ https://www.postgresql.org/docs/current/errcodes-appendix.html)
const PG_ERRORS = {
  23505: { status: 409, code: "DUPLICATE", message: "ข้อมูลนี้มีอยู่แล้วในระบบ" }, // unique_violation
  23503: { status: 409, code: "IN_USE", message: "ข้อมูลนี้ถูกใช้งานอยู่ หรืออ้างถึงข้อมูลที่ไม่มีอยู่" }, // foreign_key_violation
  23514: { status: 400, code: "RULE_VIOLATION", message: "ข้อมูลขัดกับกฎของระบบ" }, // check_violation
  P0001: { status: 400, code: "RULE_VIOLATION", message: "ข้อมูลขัดกับกฎของระบบ" }, // RAISE EXCEPTION ใน trigger
};

// eslint-disable-next-line no-unused-vars
export async function errorHandler(err, req, res, _next) {
  // คำขอพัง แต่ multer บันทึกรูปไปแล้ว → ลบไฟล์ทิ้ง ไม่ให้ค้าง
  if (req.file) await unlink(req.file.path).catch(() => {});

  if (err instanceof ZodError) {
    return res.status(err.httpStatus ?? 422).json({
      error: {
        code: "VALIDATION_ERROR",
        message: err.issues[0]?.message ?? "ข้อมูลที่ส่งมาไม่ถูกต้อง",
        details: err.issues.map((i) => ({ field: i.path.join(".") || "(ทั้งก้อน)", message: i.message })),
      },
    });
  }

  if (err instanceof AppError) {
    return res.status(err.statusCode).json({ error: { code: err.code, message: err.message } });
  }

  if (err instanceof multer.MulterError) {
    const message = err.code === "LIMIT_FILE_SIZE" ? "รูปภาพมีขนาดใหญ่เกิน 5 MB" : "อัปโหลดไฟล์ไม่สำเร็จ";
    return res.status(400).json({ error: { code: "UPLOAD_ERROR", message } });
  }

  const pg = PG_ERRORS[err?.code];
  if (pg) {
    const message = err.code === "P0001" ? err.message : pg.message; // ข้อความจาก trigger เขียนเป็นภาษาไทยไว้แล้ว
    return res.status(pg.status).json({ error: { code: pg.code, message } });
  }

  if (err?.type === "entity.parse.failed") {
    return res.status(400).json({ error: { code: "BAD_JSON", message: "รูปแบบ JSON ไม่ถูกต้อง" } });
  }
  if (err?.type === "entity.too.large") {
    return res.status(413).json({ error: { code: "TOO_LARGE", message: "ข้อมูลที่ส่งมาใหญ่เกินไป" } });
  }

  // ที่เหลือคือ bug — ไม่ส่งรายละเอียดภายใน (SQL, stack) ให้ client
  console.error("[UNHANDLED]", err);
  res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "เกิดข้อผิดพลาดภายในระบบ" } });
}
