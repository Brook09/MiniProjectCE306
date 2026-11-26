// src/lib/jwt.js — ออกและตรวจ token
// token คือ "บัตรผ่าน" ที่เซิร์ฟเวอร์เซ็นด้วย JWT_SECRET — ใครแก้ข้อมูลในบัตร ลายเซ็นจะไม่ตรงทันที
import "dotenv/config";
import jwt from "jsonwebtoken";

const secret = process.env.JWT_SECRET;
if (!secret || secret.length < 32) {
  throw new Error("JWT_SECRET ใน .env ต้องยาวอย่างน้อย 32 ตัวอักษร");
}

/** ฝังแค่ id + บทบาท (ห้ามใส่ข้อมูลลับ เพราะใครก็ถอดอ่านได้ แต่แก้ไม่ได้) */
export function signToken({ id, role }) {
  return jwt.sign({ userId: id, role }, secret, { expiresIn: "8h" });
}

/** ถูกต้อง → { userId, role } · ปลอม/หมดอายุ → null */
export function verifyToken(token) {
  try {
    const { userId, role } = jwt.verify(token, secret, { algorithms: ["HS256"] });
    return { userId, role };
  } catch {
    return null;
  }
}
