// src/lib/db.js — จุดเดียวที่เชื่อมต่อ PostgreSQL (ใช้ connection pool ร่วมกันทั้งโปรแกรม)
import "dotenv/config";
import pg from "pg";

if (!process.env.DATABASE_URL) {
  throw new Error("ไม่พบค่า DATABASE_URL — คัดลอก .env.example เป็น .env แล้วกรอกให้ครบก่อน");
}

export const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

/** snake_case → camelCase: ชื่อคอลัมน์ในฐานข้อมูลเป็น snake_case ส่วน JSON ที่ส่งให้หน้าเว็บเป็น camelCase */
const toCamel = (key) => key.replace(/_([a-z])/g, (_, ch) => ch.toUpperCase());
export const camel = (row) => (row ? Object.fromEntries(Object.entries(row).map(([k, v]) => [toCamel(k), v])) : null);

/** ยิง SQL แบบ parameterized ($1, $2, ...) — ค่าไม่ถูกต่อเป็นข้อความ จึงกัน SQL injection ได้ */
export async function query(text, params = [], client = pool) {
  const result = await client.query(text, params);
  return result.rows.map(camel);
}

export async function queryOne(text, params = [], client = pool) {
  return (await query(text, params, client))[0] ?? null;
}

/** ทำหลายคำสั่งเป็นก้อนเดียว — พังที่คำสั่งไหน ย้อนกลับทั้งหมด (ROLLBACK) */
export async function withTransaction(work) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await work(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
