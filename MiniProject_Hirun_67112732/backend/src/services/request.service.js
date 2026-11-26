// src/services/request.service.js — กฎของการแจ้งซ่อม (หัวใจของระบบ)
//
//  ใครทำอะไรได้บ้าง
//    USER        แจ้งซ่อม · ดูเฉพาะของตัวเอง · ยกเลิกได้เฉพาะรายการที่ยัง "รอรับเรื่อง"
//    TECHNICIAN  ดูเฉพาะงานที่ได้รับมอบหมาย · เดินสถานะได้ทีละขั้น: รับเรื่องแล้ว → กำลังดำเนินการ → ซ่อมเสร็จแล้ว
//    ADMIN       ดู/แจ้ง/ลบได้ทุกรายการ · มอบหมายช่าง · เปลี่ยนสถานะได้ทุกแบบ (แต่ต้องมีช่างก่อนจะเริ่มซ่อม)
import { unlink } from "node:fs/promises";
import { join } from "node:path";
import { withTransaction } from "../lib/db.js";
import { badRequest, conflict, forbidden, notFound } from "../lib/errors.js";
import { UPLOAD_DIR } from "../lib/paths.js";
import * as metaRepository from "../repositories/meta.repository.js";
import * as requestRepository from "../repositories/request.repository.js";
import * as technicianRepository from "../repositories/technician.repository.js";
import * as userRepository from "../repositories/user.repository.js";

const scopeOf = (user) => ({ role: user.role, userId: user.userId });

// ช่างเดินสถานะได้ทีละขั้นเท่านั้น
const TECHNICIAN_NEXT = { RECEIVED: "IN_PROGRESS", IN_PROGRESS: "DONE" };
const CLOSED = ["DONE", "CANCELLED"];

/* ======================= อ่าน ======================= */

export function list(user, filters) {
  return requestRepository.findMany(scopeOf(user), filters);
}

export async function dashboard(user) {
  const scope = scopeOf(user);
  const [stats, recent] = await Promise.all([
    requestRepository.stats(scope),
    requestRepository.findMany(scope, { limit: 5 }),
  ]);
  return { stats, recent };
}

/** รายละเอียด + รูป + ประวัติ (ถ้าไม่ใช่ของตัวเอง จะ "ไม่พบ" — ไม่บอกด้วยซ้ำว่ามีอยู่จริง) */
export async function getDetail(user, id) {
  const item = await requestRepository.findById(scopeOf(user), id);
  if (!item) throw notFound("ไม่พบรายการแจ้งซ่อม");

  const [images, history] = await Promise.all([
    requestRepository.findImages(id),
    requestRepository.findHistory(id),
  ]);
  return { ...item, images, history };
}

/* ======================= แจ้งซ่อมใหม่ ======================= */

export async function create(user, input, file) {
  const [category, building, account] = await Promise.all([
    metaRepository.findCategoryById(input.categoryId),
    metaRepository.findBuildingById(input.buildingId),
    userRepository.findById(user.userId),
  ]);
  if (!category) throw notFound("ไม่พบประเภทงานซ่อมที่เลือก");
  if (!building) throw notFound("ไม่พบอาคารที่เลือก");

  // ผู้ใช้ทั่วไป: ชื่อผู้แจ้งมาจากบัญชีเสมอ (แจ้งในนามคนอื่นไม่ได้) · แอดมินแจ้งแทนคนอื่นได้
  const isUser = user.role === "USER";
  const reporterName = isUser ? account.fullName : (input.reporterName ?? account.fullName);
  const reporterPhone = input.reporterPhone ?? (isUser ? account.phone : undefined);

  // บันทึกรายการ + รูปเป็นก้อนเดียว — ถ้าบันทึกรูปพัง รายการก็ไม่ถูกสร้าง
  const created = await withTransaction(async (client) => {
    const row = await requestRepository.create(
      { ...input, reporterId: user.userId, reporterName, reporterPhone },
      client,
    );
    if (file) {
      await requestRepository.addImage({ requestId: row.id, imageUrl: `/uploads/${file.filename}`, uploadedBy: user.userId }, client);
    }
    return row;
  });

  return getDetail(user, created.id);
}

/* ======================= เปลี่ยนสถานะ ======================= */

export async function changeStatus(user, id, { status, note }) {
  const item = await requestRepository.findById(scopeOf(user), id);
  if (!item) throw notFound("ไม่พบรายการแจ้งซ่อม");
  if (item.status === status) throw badRequest("รายการนี้อยู่ในสถานะนี้อยู่แล้ว");

  if (user.role === "USER") {
    if (status !== "CANCELLED") throw forbidden("ผู้แจ้งเปลี่ยนสถานะได้เฉพาะ \"ยกเลิกคำร้อง\" เท่านั้น");
    if (item.status !== "PENDING") throw conflict("ยกเลิกได้เฉพาะรายการที่ยังรอรับเรื่อง — รายการนี้เจ้าหน้าที่รับเรื่องแล้ว");
  }

  if (user.role === "TECHNICIAN") {
    if (TECHNICIAN_NEXT[item.status] !== status) {
      throw forbidden("ช่างเปลี่ยนสถานะได้ทีละขั้น: รับเรื่องแล้ว → กำลังดำเนินการ → ซ่อมเสร็จแล้ว");
    }
  }

  if (user.role === "ADMIN" && (status === "IN_PROGRESS" || status === "DONE") && !item.technicianId) {
    throw badRequest("ต้องมอบหมายช่างก่อน จึงจะเปลี่ยนเป็น \"กำลังดำเนินการ\" หรือ \"ซ่อมเสร็จแล้ว\" ได้");
  }

  await requestRepository.updateStatus(id, { status, changedBy: user.userId, note });
  return getDetail(user, id);
}

/* ======================= มอบหมายช่าง (ADMIN) ======================= */

export async function assignTechnician(user, id, { technicianId, note }) {
  const item = await requestRepository.findById(scopeOf(user), id);
  if (!item) throw notFound("ไม่พบรายการแจ้งซ่อม");
  if (CLOSED.includes(item.status)) throw conflict("รายการนี้ปิดงานแล้ว เปลี่ยนช่างไม่ได้");

  let defaultNote;
  if (technicianId === null) {
    if (item.status === "IN_PROGRESS") throw conflict("งานกำลังดำเนินการอยู่ ถอนช่างออกไม่ได้ — เปลี่ยนเป็นช่างคนอื่นแทน");
    defaultNote = "ถอนช่างออกจากงาน";
  } else {
    const technician = await technicianRepository.findById(technicianId);
    if (!technician) throw notFound("ไม่พบช่างที่เลือก");
    if (!technician.isAvailable) throw conflict(`${technician.fullName} ไม่ว่างรับงานในขณะนี้`);
    defaultNote = `มอบหมายงานให้ ${technician.fullName}`;
  }

  await requestRepository.assignTechnician(id, { technicianId, changedBy: user.userId, note: note ?? defaultNote });
  return getDetail(user, id);
}

/* ======================= ลบ (ADMIN) ======================= */

export async function remove(user, id) {
  const item = await requestRepository.findById(scopeOf(user), id);
  if (!item) throw notFound("ไม่พบรายการแจ้งซ่อม");

  const images = await requestRepository.findImages(id);
  await requestRepository.remove(id);

  // ลบไฟล์รูปจริงในโฟลเดอร์ uploads/ ด้วย (ถ้าลบไม่ได้ก็ไม่เป็นไร ข้อมูลในฐานข้อมูลลบแล้ว)
  await Promise.all(
    images.map((img) => unlink(join(UPLOAD_DIR, img.imageUrl.replace("/uploads/", ""))).catch(() => {})),
  );
}
