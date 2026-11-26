// src/controllers/meta.controller.js — ประเภทงาน + อาคาร (ใช้เติมช่องเลือกในฟอร์ม)
import * as metaService from "../services/meta.service.js";

export async function getMeta(_req, res) {
  res.status(200).json({ data: await metaService.getMeta() });
}
