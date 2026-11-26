// src/repositories/user.repository.js — บัญชีผู้ใช้
// กฎของชั้น repository: ชั้นเดียวที่เขียน SQL · ไม่รู้จัก express · ไม่โยน AppError
import { queryOne } from "../lib/db.js";

// ฟิลด์ที่ส่งออกไปนอกระบบได้ — ไม่มี password_hash เด็ดขาด
const PUBLIC = `u.id, u.username, u.full_name, u.phone, u.role, t.id AS technician_id`;

/** ใช้ตอนล็อกอินเท่านั้น (ต้องได้ hash มาเทียบรหัสผ่าน) */
export function findByUsernameWithHash(username) {
  return queryOne(
    `SELECT ${PUBLIC}, u.password_hash
     FROM users u LEFT JOIN technicians t ON t.user_id = u.id
     WHERE u.username = $1 AND u.is_active`,
    [username],
  );
}

export function findById(id) {
  return queryOne(
    `SELECT ${PUBLIC}
     FROM users u LEFT JOIN technicians t ON t.user_id = u.id
     WHERE u.id = $1 AND u.is_active`,
    [id],
  );
}

export function create({ username, passwordHash, fullName, email, phone, role }, client) {
  return queryOne(
    `INSERT INTO users (username, password_hash, full_name, email, phone, role)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [username, passwordHash, fullName, email ?? null, phone ?? null, role],
    client,
  );
}

export function existsByUsername(username) {
  return queryOne(`SELECT 1 FROM users WHERE username = $1`, [username]).then(Boolean);
}

export function existsByEmail(email) {
  return queryOne(`SELECT 1 FROM users WHERE email = $1`, [email]).then(Boolean);
}
