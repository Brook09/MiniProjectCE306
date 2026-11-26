// src/routes/meta.routes.js — /api/meta (ล็อกอินแล้วทุกบทบาท)
import { Router } from "express";
import * as metaController from "../controllers/meta.controller.js";
import * as requestController from "../controllers/request.controller.js";
import { authenticate } from "../middlewares/auth.js";

export const metaRouter = Router();

metaRouter.get("/meta", authenticate, metaController.getMeta);           // ประเภทงาน + อาคาร
metaRouter.get("/dashboard", authenticate, requestController.dashboard); // ตัวเลขสรุป + 5 รายการล่าสุด (ตามสิทธิ์ของผู้ใช้)
