// src/repositories/technician.repository.js — ช่างซ่อม
import { query, queryOne } from "../lib/db.js";

/** รายชื่อช่าง + ความถนัด + จำนวนงานค้าง/เสร็จ (จาก view v_technician_workload) */
export function findMany({ categoryId, onlyAvailable } = {}) {
  const params = [];
  const where = ["TRUE"];
  if (categoryId) {
    params.push(categoryId);
    where.push(`$${params.length} = ANY(category_ids)`);
  }
  if (onlyAvailable) where.push("is_available");
  return query(
    `SELECT * FROM v_technician_workload WHERE ${where.join(" AND ")} ORDER BY active_jobs, full_name`,
    params,
  );
}

export function findById(id) {
  return queryOne(`SELECT * FROM v_technician_workload WHERE id = $1`, [id]);
}

export function create({ userId, employeeCode, department }, client) {
  return queryOne(
    `INSERT INTO technicians (user_id, employee_code, department)
     VALUES ($1, $2, COALESCE($3, 'งานอาคารสถานที่')) RETURNING id`,
    [userId, employeeCode, department ?? null],
    client,
  );
}

export function update(id, { isAvailable, department }, client) {
  return queryOne(
    `UPDATE technicians
     SET is_available = COALESCE($2, is_available),
         department   = COALESCE($3, department)
     WHERE id = $1 RETURNING id`,
    [id, isAvailable ?? null, department ?? null],
    client,
  );
}

/** แทนที่ความถนัดทั้งหมดของช่างคนนี้ด้วยรายการใหม่ */
export async function replaceSkills(technicianId, categoryIds, client) {
  await query(`DELETE FROM technician_skills WHERE technician_id = $1`, [technicianId], client);
  await query(
    `INSERT INTO technician_skills (technician_id, category_id)
     SELECT $1, unnest($2::int[]) ON CONFLICT DO NOTHING`,
    [technicianId, categoryIds],
    client,
  );
}
