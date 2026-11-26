// src/controllers/auth.controller.js — ชั้นแปลภาษา HTTP
// หน้าที่ 3 อย่าง: หยิบข้อมูลที่ผ่านการตรวจแล้ว → เรียก service 1 ครั้ง → ตอบพร้อม status code
import * as authService from "../services/auth.service.js";

export async function register(_req, res) {
  res.status(201).json({ data: await authService.register(res.locals.valid.body) });
}

export async function login(_req, res) {
  res.status(200).json({ data: await authService.login(res.locals.valid.body) });
}

export async function me(_req, res) {
  res.status(200).json({ data: await authService.getMe(res.locals.user.userId) });
}
