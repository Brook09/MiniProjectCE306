// src/services/technician.service.js — การจัดการช่างซ่อม (ADMIN)
import bcrypt from "bcryptjs";
import { withTransaction } from "../lib/db.js";
import { conflict, notFound } from "../lib/errors.js";
import * as technicianRepository from "../repositories/technician.repository.js";
import * as userRepository from "../repositories/user.repository.js";

export function list(filters) {
  return technicianRepository.findMany(filters);
}

/** เพิ่มช่าง = สร้าง 3 อย่างพร้อมกัน: บัญชีผู้ใช้ (role TECHNICIAN) + ข้อมูลช่าง + ความถนัด */
export async function create(input) {
  if (await userRepository.existsByUsername(input.username)) throw conflict("ชื่อผู้ใช้นี้ถูกใช้แล้ว");

  const passwordHash = await bcrypt.hash(input.password, 10);

  const technicianId = await withTransaction(async (client) => {
    const user = await userRepository.create(
      { username: input.username, passwordHash, fullName: input.fullName, phone: input.phone, role: "TECHNICIAN" },
      client,
    );
    const technician = await technicianRepository.create(
      { userId: user.id, employeeCode: input.employeeCode, department: input.department },
      client,
    );
    await technicianRepository.replaceSkills(technician.id, input.categoryIds, client);
    return technician.id;
  });

  return technicianRepository.findById(technicianId);
}

export async function update(id, input) {
  if (!(await technicianRepository.findById(id))) throw notFound("ไม่พบช่างที่เลือก");

  await withTransaction(async (client) => {
    await technicianRepository.update(id, input, client);
    if (input.categoryIds) await technicianRepository.replaceSkills(id, input.categoryIds, client);
  });

  return technicianRepository.findById(id);
}
