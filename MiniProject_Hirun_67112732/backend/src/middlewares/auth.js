// src/middlewares/auth.js — ด่านตรวจสิทธิ์
//   authenticate = "คุณคือใคร"          ไม่มี/บัตรปลอม/หมดอายุ → 401
//   authorize    = "คุณทำสิ่งนี้ได้ไหม"   บทบาทไม่ตรง          → 403
import { forbidden, unauthorized } from "../lib/errors.js";
import { verifyToken } from "../lib/jwt.js";

export function authenticate(req, res, next) {
  const [scheme, token] = (req.get("authorization") ?? "").split(" ");
  if (scheme !== "Bearer" || !token) return next(unauthorized("กรุณาเข้าสู่ระบบก่อน"));

  const user = verifyToken(token);
  if (!user) return next(unauthorized("เซสชันหมดอายุหรือไม่ถูกต้อง กรุณาเข้าสู่ระบบใหม่"));

  res.locals.user = user; // { userId, role } — ใช้ได้เฉพาะคำขอนี้
  next();
}

/** authorize("ADMIN") หรือ authorize("ADMIN", "USER") */
export function authorize(...roles) {
  return (_req, res, next) => {
    if (!roles.includes(res.locals.user.role)) return next(forbidden("คุณไม่มีสิทธิ์ใช้งานส่วนนี้"));
    next();
  };
}
