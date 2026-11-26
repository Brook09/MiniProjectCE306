// src/repositories/meta.repository.js — ข้อมูลสำหรับช่องเลือกในฟอร์ม (ประเภทงาน, อาคาร)
import { query, queryOne } from "../lib/db.js";

export const findCategories = () => query(`SELECT id, name FROM categories ORDER BY id`);
export const findBuildings = () => query(`SELECT id, name FROM buildings ORDER BY name`);

export const findCategoryById = (id) => queryOne(`SELECT id, name FROM categories WHERE id = $1`, [id]);
export const findBuildingById = (id) => queryOne(`SELECT id, name FROM buildings WHERE id = $1`, [id]);
