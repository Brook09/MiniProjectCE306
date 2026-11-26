// src/services/auth.service.js — กฎของการเข้าสู่ระบบ
// กฎของชั้น service: ไม่รู้จัก express (ไม่มี req/res) · ไม่เขียน SQL เอง (ขอผ่าน repository)
import bcrypt from "bcryptjs";
import { conflict, notFound, unauthorized } from "../lib/errors.js";
import { signToken } from "../lib/jwt.js";
import * as userRepository from "../repositories/user.repository.js";

// ใช้เทียบเมื่อ "ไม่พบชื่อผู้ใช้" ให้ใช้เวลาตอบพอ ๆ กับกรณีรหัสผิด (เดาไม่ได้ว่าชื่อนี้มีอยู่จริงไหม)
const DUMMY_HASH = bcrypt.hashSync("not-a-real-password", 10);

/** ข้อมูลผู้ใช้ที่ส่งให้หน้าเว็บ */
export function toUserView(user) {
  return {
    id: user.id,
    username: user.username,
    fullName: user.fullName,
    phone: user.phone,
    role: user.role,
    technicianId: user.technicianId, // มีค่าเฉพาะบัญชีช่าง
  };
}

/** สมัครสมาชิก → ได้บัญชี USER แล้วเข้าสู่ระบบให้ทันที (ตอบ token กลับไปเลย) */
export async function register(input) {
  // ตรวจก่อนเพื่อให้ได้ข้อความที่ชัด — ถ้ามีคนสมัครชื่อเดียวกันพร้อมกัน UNIQUE ในฐานข้อมูลกันเป็นด่านสุดท้าย (409)
  if (await userRepository.existsByUsername(input.username)) throw conflict("ชื่อผู้ใช้นี้ถูกใช้แล้ว");
  if (input.email && (await userRepository.existsByEmail(input.email))) throw conflict("อีเมลนี้ถูกใช้สมัครแล้ว");

  const passwordHash = await bcrypt.hash(input.password, 10);
  const { id } = await userRepository.create({ ...input, passwordHash, role: "USER" }); // role ล็อกไว้ที่ server

  const user = await userRepository.findById(id);
  return { token: signToken(user), user: toUserView(user) };
}

export async function login({ username, password }) {
  const found = await userRepository.findByUsernameWithHash(username);
  const ok = await bcrypt.compare(password, found?.passwordHash ?? DUMMY_HASH);

  // ชื่อผิดหรือรหัสผิด ตอบข้อความเดียวกัน — ไม่บอกใบ้ว่าผิดตรงไหน
  if (!found || !ok) throw unauthorized("ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง");

  return { token: signToken(found), user: toUserView(found) };
}

export async function getMe(userId) {
  const user = await userRepository.findById(userId);
  if (!user) throw notFound("ไม่พบบัญชีผู้ใช้");
  return toUserView(user);
}
