// src/repositories/request.repository.js — รายการแจ้งซ่อม
import { query, queryOne } from "../lib/db.js";

/**
 * เงื่อนไขว่าใครเห็นรายการไหน (ตรวจที่ฐานข้อมูลทุกครั้ง ไม่ใช่แค่ซ่อนที่หน้าเว็บ)
 *   ADMIN      เห็นทั้งหมด
 *   USER       เห็นเฉพาะที่ตัวเองแจ้ง
 *   TECHNICIAN เห็นเฉพาะงานที่ได้รับมอบหมาย
 */
function scopeCondition({ role, userId }, params) {
  if (role === "USER") {
    params.push(userId);
    return `reporter_id = $${params.length}`;
  }
  if (role === "TECHNICIAN") {
    params.push(userId);
    return `technician_user_id = $${params.length}`;
  }
  return "TRUE";
}

export function findMany(scope, { search, status, categoryId, limit } = {}) {
  const params = [];
  const where = [scopeCondition(scope, params)];

  if (search) {
    params.push(`%${search}%`);
    const p = `$${params.length}`;
    where.push(`(code ILIKE ${p} OR title ILIKE ${p} OR building ILIKE ${p} OR room ILIKE ${p} OR reporter_name ILIKE ${p})`);
  }
  if (status) {
    params.push(status);
    where.push(`status = $${params.length}`);
  }
  if (categoryId) {
    params.push(categoryId);
    where.push(`category_id = $${params.length}`);
  }

  let sql = `SELECT * FROM v_repair_requests WHERE ${where.join(" AND ")} ORDER BY created_at DESC`;
  if (limit) {
    params.push(limit);
    sql += ` LIMIT $${params.length}`;
  }
  return query(sql, params);
}

/** หารายการเดียว "ภายในขอบเขตของผู้ใช้คนนี้" — ของคนอื่นจะได้ null */
export function findById(scope, id) {
  const params = [id];
  const condition = scopeCondition(scope, params);
  return queryOne(`SELECT * FROM v_repair_requests WHERE id = $1 AND ${condition}`, params);
}

export function findImages(requestId) {
  return query(`SELECT id, image_url, created_at FROM request_images WHERE request_id = $1 ORDER BY created_at`, [requestId]);
}

export function findHistory(requestId) {
  return query(
    `SELECT h.status, h.note, h.changed_at, u.full_name AS changed_by_name, u.role AS changed_by_role
     FROM request_status_history h
     LEFT JOIN users u ON u.id = h.changed_by
     WHERE h.request_id = $1
     ORDER BY h.changed_at, h.id`,
    [requestId],
  );
}

export function stats(scope) {
  const params = [];
  const condition = scopeCondition(scope, params);
  return queryOne(
    `SELECT COUNT(*)::int                                       AS total,
            COUNT(*) FILTER (WHERE status = 'PENDING')::int     AS pending,
            COUNT(*) FILTER (WHERE status = 'RECEIVED')::int    AS received,
            COUNT(*) FILTER (WHERE status = 'IN_PROGRESS')::int AS in_progress,
            COUNT(*) FILTER (WHERE status = 'DONE')::int        AS done,
            COUNT(*) FILTER (WHERE status = 'CANCELLED')::int   AS cancelled
     FROM v_repair_requests WHERE ${condition}`,
    params,
  );
}

/** สร้างรายการ — trigger ในฐานข้อมูลบันทึกประวัติ "รอรับเรื่อง" ให้เอง */
export function create(data, client) {
  return queryOne(
    `INSERT INTO repair_requests
       (title, description, category_id, building_id, room, priority, reporter_id, reporter_name, reporter_phone)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING id, code`,
    [
      data.title, data.description, data.categoryId, data.buildingId, data.room,
      data.priority ?? "NORMAL", data.reporterId, data.reporterName, data.reporterPhone ?? null,
    ],
    client,
  );
}

export function addImage({ requestId, imageUrl, uploadedBy }, client) {
  return queryOne(
    `INSERT INTO request_images (request_id, image_url, uploaded_by) VALUES ($1, $2, $3) RETURNING id`,
    [requestId, imageUrl, uploadedBy],
    client,
  );
}

/** เปลี่ยนสถานะ — trigger บันทึกประวัติ (สถานะ, ผู้เปลี่ยน, หมายเหตุ) ให้เอง */
export function updateStatus(id, { status, changedBy, note }) {
  return queryOne(
    `UPDATE repair_requests
     SET status = $2, status_changed_by = $3, status_note = $4
     WHERE id = $1
     RETURNING id`,
    [id, status, changedBy, note ?? null],
  );
}

/** มอบหมาย/เปลี่ยน/ถอนช่าง · ถ้ายัง "รอรับเรื่อง" และมีช่างแล้ว → เปลี่ยนเป็น "รับเรื่องแล้ว" ให้ด้วย */
export function assignTechnician(id, { technicianId, changedBy, note }) {
  return queryOne(
    `UPDATE repair_requests
     SET technician_id     = $2,
         status            = CASE WHEN status = 'PENDING' AND $2::int IS NOT NULL THEN 'RECEIVED'::request_status ELSE status END,
         status_changed_by = $3,
         status_note       = $4
     WHERE id = $1
     RETURNING id`,
    [id, technicianId, changedBy, note ?? null],
  );
}

/** ลบรายการ — รูปและประวัติในฐานข้อมูลถูกลบตามด้วย ON DELETE CASCADE */
export function remove(id) {
  return queryOne(`DELETE FROM repair_requests WHERE id = $1 RETURNING id`, [id]);
}
