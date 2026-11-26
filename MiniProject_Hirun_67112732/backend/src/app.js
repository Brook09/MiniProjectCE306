// src/app.js — ที่ประกอบร่าง: คำขอหนึ่งใบเดินผ่านอะไรบ้าง ตามลำดับไหน
// (Express 5 ดัก error จาก async handler ให้เอง จึงไม่ต้องเขียน try/catch ใน controller)
import express from "express";
import { FRONTEND_DIR, UPLOAD_DIR } from "./lib/paths.js";
import { errorHandler, notFoundHandler } from "./middlewares/error-handler.js";
import { logger } from "./middlewares/logger.js";
import { authRouter } from "./routes/auth.routes.js";
import { metaRouter } from "./routes/meta.routes.js";
import { requestsRouter } from "./routes/requests.routes.js";
import { techniciansRouter } from "./routes/technicians.routes.js";

export const app = express();
app.disable("x-powered-by");

/* ---------- 1) ไฟล์หน้าเว็บ + รูปที่อัปโหลด (เปิดจากพอร์ตเดียวกัน จึงไม่ติด CORS) ---------- */
app.use(express.static(FRONTEND_DIR));
app.use("/uploads", express.static(UPLOAD_DIR));

/* ---------- 2) middleware ของ API ---------- */
app.use("/api", express.json({ limit: "20kb" }), logger);

app.get("/api/health", (_req, res) => res.json({ status: "ok" }));

/* ---------- 3) เส้นทาง API ---------- */
app.use("/api/auth", authRouter);
app.use("/api/requests", requestsRouter);
app.use("/api/technicians", techniciansRouter);
app.use("/api", metaRouter);

/* ---------- 4) สองตัวนี้ต้องอยู่ท้ายสุดเสมอ ---------- */
app.use("/api", notFoundHandler);
app.use(errorHandler);
