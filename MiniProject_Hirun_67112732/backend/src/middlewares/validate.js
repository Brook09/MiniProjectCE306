// src/middlewares/validate.js — ตัวตรวจข้อมูลรวมศูนย์ด้วย Zod
// ผ่านด่านนี้แล้ว ข้อมูลที่ตรวจและแปลงแล้วจะอยู่ใน res.locals.valid
// ผิดที่ path/query = คำขอผิดรูป → 400 · ผิดที่ body = เนื้อหาใช้ไม่ได้ → 422
const STATUS_OF = { params: 400, query: 400, body: 422 };

export function validate(schemas) {
  return (req, res, next) => {
    const valid = {};
    for (const source of ["params", "query", "body"]) {
      const schema = schemas[source];
      if (!schema) continue;

      const result = schema.safeParse(req[source] ?? {});
      if (!result.success) {
        result.error.httpStatus = STATUS_OF[source];
        return next(result.error);
      }
      valid[source] = result.data;
    }
    res.locals.valid = valid;
    next();
  };
}
