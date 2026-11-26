// src/routes/requests.routes.js — /api/requests
//   ทุกเส้นต้องล็อกอิน · ขอบเขตข้อมูล (ใครเห็นรายการไหน) ตรวจต่อใน service/repository
import { Router } from "express";
import * as requestController from "../controllers/request.controller.js";
import { authenticate, authorize } from "../middlewares/auth.js";
import { uploadImage } from "../middlewares/upload.js";
import { validate } from "../middlewares/validate.js";
import { assignSchema, changeStatusSchema, createRequestSchema, idParam, listRequestsQuery } from "../schemas/index.js";

export const requestsRouter = Router();

requestsRouter.use(authenticate);

requestsRouter.get("/", validate({ query: listRequestsQuery }), requestController.list);
requestsRouter.get("/:id", validate({ params: idParam }), requestController.getById);

// แจ้งซ่อม: ผู้ใช้และแอดมิน (multer อ่าน multipart/form-data ก่อน แล้วค่อยตรวจ body)
requestsRouter.post("/", authorize("ADMIN", "USER"), uploadImage, validate({ body: createRequestSchema }), requestController.create);

// เปลี่ยนสถานะ: ทุกบทบาท แต่กฎต่างกัน (ดูใน request.service.js)
requestsRouter.patch("/:id/status", validate({ params: idParam, body: changeStatusSchema }), requestController.changeStatus);

// มอบหมายช่าง + ลบ: แอดมินเท่านั้น
requestsRouter.patch("/:id/assign", authorize("ADMIN"), validate({ params: idParam, body: assignSchema }), requestController.assign);
requestsRouter.delete("/:id", authorize("ADMIN"), validate({ params: idParam }), requestController.remove);
