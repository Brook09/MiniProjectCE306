-- =====================================================================
--  UNI FIX — seed.sql : ข้อมูลตัวอย่างสำหรับทดสอบ / นำเสนอ
--  รันหลัง schema.sql:  psql -U postgres -d unifix -f seed.sql
--
--  บัญชีทดลอง (รหัสผ่านถูกแฮชด้วย bcrypt ผ่าน pgcrypto)
--    admin  / admin123   ผู้ดูแลระบบ
--    user   / user123    ผู้ใช้งาน
--    tech1  / tech123    ช่างไฟฟ้า
--    tech2  / tech123    ช่างประปา / อาคาร
--    tech3  / tech123    ช่างคอมพิวเตอร์ / เครือข่าย
-- =====================================================================

BEGIN;

-- ---------- ประเภทงาน ----------
INSERT INTO categories (name) VALUES
  ('ไฟฟ้า'), ('ประปา'), ('อาคารสถานที่'), ('อุปกรณ์คอมพิวเตอร์'), ('อินเทอร์เน็ต'), ('อื่น ๆ');

-- ---------- อาคาร ----------
INSERT INTO buildings (name) VALUES
  ('อาคารเรียน 1'), ('อาคารเรียน 2'), ('อาคารกิจกรรม'), ('อาคารปฏิบัติการ'), ('หอสมุด');

-- ---------- ผู้ใช้ ----------
INSERT INTO users (username, password_hash, full_name, email, phone, role) VALUES
  ('admin', crypt('admin123', gen_salt('bf', 10)), 'ผู้ดูแลระบบ',       'admin@unifix.local', NULL,         'ADMIN'),
  ('user',  crypt('user123',  gen_salt('bf', 10)), 'ผู้ใช้งาน',          'user@unifix.local',  '0812345678', 'USER'),
  ('tech1', crypt('tech123',  gen_salt('bf', 10)), 'นายประเสริฐ ช่างไฟ', NULL,                 '0891112222', 'TECHNICIAN'),
  ('tech2', crypt('tech123',  gen_salt('bf', 10)), 'นายวิชัย ซ่อมดี',    NULL,                 '0893334444', 'TECHNICIAN'),
  ('tech3', crypt('tech123',  gen_salt('bf', 10)), 'นางสาวสุดา ไอทีเก่ง', NULL,                 '0895556666', 'TECHNICIAN');

-- ---------- ช่างซ่อม ----------
INSERT INTO technicians (user_id, employee_code, department)
SELECT id, code, dept FROM (VALUES
  ('tech1', 'TC-001', 'งานไฟฟ้า'),
  ('tech2', 'TC-002', 'งานอาคารสถานที่'),
  ('tech3', 'TC-003', 'ศูนย์เทคโนโลยีสารสนเทศ')
) AS v(username, code, dept)
JOIN users u USING (username);

-- ---------- ความถนัดของช่าง ----------
INSERT INTO technician_skills (technician_id, category_id)
SELECT t.id, c.id FROM (VALUES
  ('TC-001', 'ไฟฟ้า'),
  ('TC-002', 'ประปา'),
  ('TC-002', 'อาคารสถานที่'),
  ('TC-003', 'อุปกรณ์คอมพิวเตอร์'),
  ('TC-003', 'อินเทอร์เน็ต')
) AS v(code, cat)
JOIN technicians t ON t.employee_code = v.code
JOIN categories  c ON c.name = v.cat;

-- ---------- รายการแจ้งซ่อม (ตรงกับข้อมูลตัวอย่างใน script.js: UR-1001 ถึง UR-1004) ----------
-- สร้างทุกรายการเป็น "รอรับเรื่อง" ก่อน แล้วค่อยเปลี่ยนสถานะ เพื่อให้ trigger สร้างประวัติครบทุกขั้น
INSERT INTO repair_requests (title, description, category_id, building_id, room, reporter_id, reporter_name, created_at)
SELECT v.title, v.descr, c.id, b.id, v.room, u.id, v.reporter, v.created::timestamptz
FROM (VALUES
  ('หลอดไฟในห้องเรียนไม่ติด',    'หลอดไฟบริเวณหน้าห้องเรียนไม่ติด 2 หลอด',  'ไฟฟ้า',              'อาคารเรียน 1',    'ห้อง 204 ชั้น 2', 'นายสมชาย ใจดี',     '2026-10-18 09:15+07'),
  ('ก๊อกน้ำรั่วในห้องน้ำ',        'ก๊อกน้ำอ่างล้างมือมีน้ำหยดตลอดเวลา',      'ประปา',              'อาคารกิจกรรม',    'ห้องน้ำชั้น 1',   'นางสาวพิมพ์ชนก',    '2026-10-17 10:30+07'),
  ('คอมพิวเตอร์เปิดไม่ติด',       'เครื่องคอมพิวเตอร์หมายเลข 08 เปิดไม่ติด', 'อุปกรณ์คอมพิวเตอร์', 'อาคารปฏิบัติการ', 'ห้อง Lab 3',      'นายกิตติ',          '2026-10-16 13:00+07'),
  ('สัญญาณอินเทอร์เน็ตไม่เสถียร', 'เชื่อมต่อ Wi-Fi แล้วหลุดบ่อย',             'อินเทอร์เน็ต',       'อาคารเรียน 2',    'ห้อง 301 ชั้น 3', 'นางสาวอรทัย',       '2026-10-15 08:45+07')
) AS v(title, descr, cat, bld, room, reporter, created)
JOIN categories c ON c.name = v.cat
JOIN buildings  b ON b.name = v.bld
JOIN users      u ON u.username = 'user'
ORDER BY v.created DESC;   -- ให้ UR-1001 เป็นรายการล่าสุด ตามข้อมูลเดิม

-- แอดมินรับเรื่อง + มอบหมายช่าง
UPDATE repair_requests r
SET status = 'RECEIVED',
    technician_id = t.id,
    status_changed_by = (SELECT id FROM users WHERE username = 'admin'),
    status_note = 'รับเรื่องและมอบหมายช่างแล้ว'
FROM technicians t
WHERE (r.code, t.employee_code) IN (('UR-1002', 'TC-002'), ('UR-1003', 'TC-003'), ('UR-1004', 'TC-003'));

-- ช่างเริ่มซ่อม
UPDATE repair_requests r
SET status = 'IN_PROGRESS',
    status_changed_by = t.user_id,
    status_note = 'ช่างเข้าตรวจสอบหน้างาน'
FROM technicians t
WHERE t.id = r.technician_id AND r.code IN ('UR-1002', 'UR-1003', 'UR-1004');

-- ช่างซ่อมเสร็จ
UPDATE repair_requests r
SET status = 'DONE',
    status_changed_by = t.user_id,
    status_note = 'เปลี่ยนพาวเวอร์ซัพพลายใหม่ ใช้งานได้ปกติ'
FROM technicians t
WHERE t.id = r.technician_id AND r.code = 'UR-1003';

-- ปรับเวลาในประวัติให้ดูสมจริง (ห่างกันขั้นละ 2 ชั่วโมงนับจากวันที่แจ้ง)
UPDATE request_status_history h
SET changed_at = r.created_at
    + (array_position(ARRAY['PENDING','RECEIVED','IN_PROGRESS','DONE']::request_status[], h.status) - 1) * INTERVAL '2 hours'
FROM repair_requests r
WHERE r.id = h.request_id;

UPDATE repair_requests r
SET completed_at = h.changed_at
FROM request_status_history h
WHERE h.request_id = r.id AND h.status = 'DONE';

COMMIT;
