// src/server.js — จุดเริ่มโปรแกรม: เปิดพอร์ต
import "dotenv/config";
import { app } from "./app.js";
import { pool } from "./lib/db.js";

const PORT = Number(process.env.PORT ?? 3000);

const server = app.listen(PORT, () => {
  console.log(`UNI FIX พร้อมใช้งานที่ http://localhost:${PORT}`);
});

// กด Ctrl+C แล้วคืน connection ให้ฐานข้อมูลก่อนปิด
async function shutdown() {
  console.log("\nกำลังปิดเซิร์ฟเวอร์...");
  server.close();
  await pool.end();
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
