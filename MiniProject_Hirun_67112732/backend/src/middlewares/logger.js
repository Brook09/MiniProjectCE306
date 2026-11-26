// src/middlewares/logger.js — บันทึกทุกคำขอ API ลง console
export function logger(req, res, next) {
  const startedAt = Date.now();
  res.on("finish", () => {
    console.log(`${req.method} ${req.originalUrl} → ${res.statusCode} (${Date.now() - startedAt} ms)`);
  });
  next();
}
