// src/controllers/request.controller.js — รายการแจ้งซ่อม
// res.locals.user = ผู้ใช้จาก token · res.locals.valid = ข้อมูลที่ผ่าน Zod แล้ว
import * as requestService from "../services/request.service.js";

export async function dashboard(_req, res) {
  res.status(200).json({ data: await requestService.dashboard(res.locals.user) });
}

export async function list(_req, res) {
  res.status(200).json({ data: await requestService.list(res.locals.user, res.locals.valid.query) });
}

export async function getById(_req, res) {
  res.status(200).json({ data: await requestService.getDetail(res.locals.user, res.locals.valid.params.id) });
}

export async function create(req, res) {
  const created = await requestService.create(res.locals.user, res.locals.valid.body, req.file);
  res.status(201).location(`/api/requests/${created.id}`).json({ data: created });
}

export async function changeStatus(_req, res) {
  const { params, body } = res.locals.valid;
  res.status(200).json({ data: await requestService.changeStatus(res.locals.user, params.id, body) });
}

export async function assign(_req, res) {
  const { params, body } = res.locals.valid;
  res.status(200).json({ data: await requestService.assignTechnician(res.locals.user, params.id, body) });
}

export async function remove(_req, res) {
  await requestService.remove(res.locals.user, res.locals.valid.params.id);
  res.status(204).end();
}
