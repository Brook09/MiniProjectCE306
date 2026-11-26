// src/services/meta.service.js — ข้อมูลสำหรับช่องเลือกในฟอร์ม
import * as metaRepository from "../repositories/meta.repository.js";

export async function getMeta() {
  const [categories, buildings] = await Promise.all([metaRepository.findCategories(), metaRepository.findBuildings()]);
  return { categories, buildings };
}
