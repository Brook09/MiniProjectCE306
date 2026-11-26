// scripts/setup-db.js — สร้างตารางและใส่ข้อมูลตัวอย่าง (รันซ้ำได้ จะล้างของเก่าทิ้งทุกครั้ง)
// รันด้วย: npm run db:setup
import "dotenv/config";
import { readFile } from "node:fs/promises";
import pg from "pg";

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });

try {
  await client.connect();
  for (const file of ["schema.sql", "seed.sql"]) {
    const sql = await readFile(new URL(`../db/${file}`, import.meta.url), "utf8");
    await client.query(sql);
    console.log(`✓ รัน db/${file} แล้ว`);
  }
  console.log("ฐานข้อมูลพร้อมใช้งาน — บัญชีทดลอง: admin/admin123, user/user123, tech1/tech123");
} catch (err) {
  console.error("✗ ตั้งค่าฐานข้อมูลไม่สำเร็จ:", err.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
