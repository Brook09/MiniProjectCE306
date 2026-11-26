// src/controllers/technician.controller.js — ช่างซ่อม
import * as technicianService from "../services/technician.service.js";

export async function list(req, res) {
  const categoryId = Number(req.query.categoryId) || undefined;
  const onlyAvailable = req.query.available === "true";
  res.status(200).json({ data: await technicianService.list({ categoryId, onlyAvailable }) });
}

export async function create(_req, res) {
  const created = await technicianService.create(res.locals.valid.body);
  res.status(201).location(`/api/technicians/${created.id}`).json({ data: created });
}

export async function update(_req, res) {
  const { params, body } = res.locals.valid;
  res.status(200).json({ data: await technicianService.update(params.id, body) });
}
