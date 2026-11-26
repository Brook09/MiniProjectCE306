// src/routes/technicians.routes.js — /api/technicians (ADMIN เท่านั้น)
import { Router } from "express";
import * as technicianController from "../controllers/technician.controller.js";
import { authenticate, authorize } from "../middlewares/auth.js";
import { validate } from "../middlewares/validate.js";
import { createTechnicianSchema, idParam, updateTechnicianSchema } from "../schemas/index.js";

export const techniciansRouter = Router();

techniciansRouter.use(authenticate, authorize("ADMIN"));

techniciansRouter.get("/", technicianController.list); // ?categoryId=1&available=true
techniciansRouter.post("/", validate({ body: createTechnicianSchema }), technicianController.create);
techniciansRouter.patch("/:id", validate({ params: idParam, body: updateTechnicianSchema }), technicianController.update);
