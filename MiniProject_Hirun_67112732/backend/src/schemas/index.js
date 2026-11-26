// src/schemas/index.js — กฎตรวจข้อมูลขาเข้าทั้งหมด (Zod)
// strictObject = ส่งฟิลด์ที่ไม่รู้จักมาจะถูกตีกลับ (กันการแอบส่ง status / reporterId / role มาเอง)
import { z } from "zod";

export const STATUSES = ["PENDING", "RECEIVED", "IN_PROGRESS", "DONE", "CANCELLED"];
export const PRIORITIES = ["LOW", "NORMAL", "HIGH", "URGENT"];

const UNKNOWN_FIELD = "ส่งฟิลด์ที่ระบบไม่รู้จักมาด้วย";
const id = (label) => z.coerce.number({ error: `ต้องเลือก${label}` }).int().positive(`ต้องเลือก${label}`);
const text = (label, max) => z.string({ error: `ต้องระบุ${label}` }).trim().min(1, `ต้องระบุ${label}`).max(max, `${label}ยาวเกิน ${max} ตัวอักษร`);
const phone = z.string().trim().regex(/^0\d{8,9}$/, "เบอร์โทรต้องขึ้นต้นด้วย 0 และมี 9–10 หลัก");
// ช่องที่ไม่บังคับจากฟอร์ม HTML จะส่งมาเป็น "" → แปลงเป็น undefined
const optional = (schema) => z.preprocess((v) => (v === "" || v === null ? undefined : v), schema.optional());

/* ---------- พารามิเตอร์ใน URL ---------- */
export const idParam = z.strictObject({ id: id("รหัส") });

/* ---------- เข้าสู่ระบบ ---------- */
export const loginSchema = z.strictObject(
  {
    username: z.string({ error: "ต้องระบุชื่อผู้ใช้" }).trim().toLowerCase().min(1, "ต้องระบุชื่อผู้ใช้"),
    password: z.string({ error: "ต้องระบุรหัสผ่าน" }).min(1, "ต้องระบุรหัสผ่าน").max(72),
  },
  { error: UNKNOWN_FIELD },
);

/* ---------- สมัครสมาชิก (ได้บทบาท USER เสมอ — ส่ง role มาจะถูกตีกลับเพราะ strictObject) ---------- */
export const registerSchema = z.strictObject(
  {
    username: z
      .string({ error: "ต้องระบุชื่อผู้ใช้" })
      .trim()
      .toLowerCase()
      .regex(/^[a-z0-9_]{3,30}$/, "ชื่อผู้ใช้ใช้ a-z, 0-9, _ ได้ 3–30 ตัว"),
    password: z
      .string({ error: "ต้องระบุรหัสผ่าน" })
      .min(8, "รหัสผ่านต้องมีอย่างน้อย 8 ตัว")
      .max(72, "รหัสผ่านยาวเกิน 72 ตัว") // bcrypt ใช้ได้สูงสุด 72 ไบต์
      .regex(/[A-Za-z]/, "รหัสผ่านต้องมีตัวอักษรภาษาอังกฤษอย่างน้อย 1 ตัว")
      .regex(/\d/, "รหัสผ่านต้องมีตัวเลขอย่างน้อย 1 ตัว"),
    fullName: text("ชื่อ-นามสกุล", 150),
    email: optional(z.string().trim().toLowerCase().max(150).pipe(z.email("รูปแบบอีเมลไม่ถูกต้อง"))),
    phone: optional(phone),
  },
  { error: UNKNOWN_FIELD },
);

/* ---------- ค้นหา/กรองรายการแจ้งซ่อม: GET /requests?search=&status=&categoryId= ---------- */
export const listRequestsQuery = z.object({
  search: optional(z.string().trim().max(100)),
  status: optional(z.enum(STATUSES, { error: "สถานะไม่ถูกต้อง" })),
  categoryId: optional(id("ประเภท")),
});

/* ---------- แจ้งซ่อมใหม่ (multipart/form-data จึงต้อง coerce ตัวเลข) ---------- */
export const createRequestSchema = z.strictObject(
  {
    title: text("หัวข้อปัญหา", 100),
    description: text("รายละเอียดปัญหา", 2000),
    categoryId: id("ประเภทงานซ่อม"),
    buildingId: id("อาคาร"),
    room: text("ห้อง / ตำแหน่ง", 100),
    priority: optional(z.enum(PRIORITIES, { error: "ความเร่งด่วนไม่ถูกต้อง" })),
    reporterName: optional(text("ชื่อผู้แจ้ง", 150)), // ผู้ใช้ทั่วไป: server ใช้ชื่อจากบัญชีแทนเสมอ
    reporterPhone: optional(phone),
  },
  { error: UNKNOWN_FIELD },
);

/* ---------- เปลี่ยนสถานะ ---------- */
export const changeStatusSchema = z.strictObject(
  {
    status: z.enum(STATUSES, { error: "สถานะไม่ถูกต้อง" }),
    note: optional(z.string().trim().max(500, "หมายเหตุยาวเกิน 500 ตัวอักษร")),
  },
  { error: UNKNOWN_FIELD },
);

/* ---------- มอบหมายช่าง (null = ถอนช่างออก) ---------- */
export const assignSchema = z.strictObject(
  {
    technicianId: id("ช่าง").nullable(),
    note: optional(z.string().trim().max(500, "หมายเหตุยาวเกิน 500 ตัวอักษร")),
  },
  { error: UNKNOWN_FIELD },
);

/* ---------- เพิ่มช่างใหม่ ---------- */
export const createTechnicianSchema = z.strictObject(
  {
    username: z.string({ error: "ต้องระบุชื่อผู้ใช้" }).trim().toLowerCase().regex(/^[a-z0-9_]{3,30}$/, "ชื่อผู้ใช้ใช้ a-z, 0-9, _ ได้ 3–30 ตัว"),
    password: z.string({ error: "ต้องระบุรหัสผ่าน" }).min(6, "รหัสผ่านต้องมีอย่างน้อย 6 ตัว").max(72),
    fullName: text("ชื่อ-นามสกุล", 150),
    phone: optional(phone),
    employeeCode: z.string({ error: "ต้องระบุรหัสพนักงาน" }).trim().toUpperCase().regex(/^[A-Z0-9-]{2,20}$/, "รหัสพนักงานใช้ A-Z, 0-9, - ได้ 2–20 ตัว"),
    department: optional(text("ฝ่าย", 100)),
    categoryIds: z.array(id("ประเภท"), { error: "ต้องเลือกความถนัดอย่างน้อย 1 ประเภท" }).min(1, "ต้องเลือกความถนัดอย่างน้อย 1 ประเภท"),
  },
  { error: UNKNOWN_FIELD },
);

/* ---------- แก้ข้อมูลช่าง ---------- */
export const updateTechnicianSchema = z
  .strictObject(
    {
      isAvailable: z.boolean({ error: "isAvailable ต้องเป็น true/false" }),
      department: text("ฝ่าย", 100),
      categoryIds: z.array(id("ประเภท")).min(1, "ต้องเลือกความถนัดอย่างน้อย 1 ประเภท"),
    },
    { error: UNKNOWN_FIELD },
  )
  .partial()
  .refine((body) => Object.keys(body).length > 0, { error: "ต้องส่งอย่างน้อยหนึ่งฟิลด์ที่ต้องการแก้" });
