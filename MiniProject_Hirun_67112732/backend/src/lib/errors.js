// src/lib/errors.js — ข้อผิดพลาดที่ "เราตั้งใจให้เกิด"
// error-handler จะแปลงเป็น HTTP response ตาม statusCode ที่ระบุ
export class AppError extends Error {
  constructor(statusCode, code, message) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
  }
}

export const badRequest = (message) => new AppError(400, "BAD_REQUEST", message);
export const unauthorized = (message) => new AppError(401, "UNAUTHORIZED", message);
export const forbidden = (message) => new AppError(403, "FORBIDDEN", message);
export const notFound = (message) => new AppError(404, "NOT_FOUND", message);
export const conflict = (message) => new AppError(409, "CONFLICT", message);
