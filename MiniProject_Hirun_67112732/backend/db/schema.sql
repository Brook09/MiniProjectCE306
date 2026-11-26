-- =====================================================================
--  UNI FIX — ระบบแจ้งซ่อมภายในมหาวิทยาลัย
--  schema.sql : โครงสร้างฐานข้อมูล (PostgreSQL 14+)
--
--  รันด้วย:  psql -U postgres -d unifix -f schema.sql
--  แล้วตามด้วย seed.sql เพื่อใส่ข้อมูลตัวอย่าง
--
--  ตาราง
--    users                  บัญชีผู้ใช้ (ADMIN / USER / TECHNICIAN)
--    technicians            ข้อมูลช่างซ่อม (ผูกกับ users แบบ 1:1)
--    categories             ประเภทงานซ่อม (ไฟฟ้า, ประปา, ...)
--    technician_skills      ช่างคนไหนถนัดงานประเภทไหน (N:M)
--    buildings              อาคาร
--    repair_requests        รายการแจ้งซ่อม (ตารางหลัก)
--    request_images         รูปภาพประกอบการแจ้งซ่อม
--    request_status_history ประวัติการเปลี่ยนสถานะ (บันทึกอัตโนมัติด้วย trigger)
-- =====================================================================

DROP SCHEMA IF EXISTS public CASCADE;
CREATE SCHEMA public;

CREATE EXTENSION IF NOT EXISTS pgcrypto;   -- ใช้ crypt() แฮชรหัสผ่านใน seed

-- ---------------------------------------------------------------------
-- ENUM
-- ---------------------------------------------------------------------
CREATE TYPE user_role AS ENUM ('ADMIN', 'USER', 'TECHNICIAN');

-- สถานะในฐานข้อมูลเป็นภาษาอังกฤษ หน้าเว็บค่อยแปลงเป็นภาษาไทย
--   PENDING     = รอรับเรื่อง
--   RECEIVED    = รับเรื่องแล้ว
--   IN_PROGRESS = กำลังดำเนินการ
--   DONE        = ซ่อมเสร็จแล้ว
--   CANCELLED   = ยกเลิกคำร้อง
CREATE TYPE request_status AS ENUM ('PENDING', 'RECEIVED', 'IN_PROGRESS', 'DONE', 'CANCELLED');

CREATE TYPE request_priority AS ENUM ('LOW', 'NORMAL', 'HIGH', 'URGENT');

-- ---------------------------------------------------------------------
-- users : ทุกคนที่ล็อกอินได้
-- ---------------------------------------------------------------------
CREATE TABLE users (
    id            INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    username      VARCHAR(30)  NOT NULL UNIQUE,
    password_hash TEXT         NOT NULL,                 -- เก็บค่าแฮช (bcrypt) เท่านั้น
    full_name     VARCHAR(150) NOT NULL,
    email         VARCHAR(150) UNIQUE,
    phone         VARCHAR(10),
    role          user_role    NOT NULL DEFAULT 'USER',
    is_active     BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),

    CONSTRAINT users_username_format CHECK (username ~ '^[a-z0-9_]{3,30}$'),
    CONSTRAINT users_phone_format    CHECK (phone IS NULL OR phone ~ '^0[0-9]{8,9}$')
);

-- ---------------------------------------------------------------------
-- technicians : ช่างซ่อม (1 user ที่ role = TECHNICIAN ↔ 1 แถว)
-- ---------------------------------------------------------------------
CREATE TABLE technicians (
    id            INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id       INT          NOT NULL UNIQUE REFERENCES users(id) ON DELETE RESTRICT,
    employee_code VARCHAR(20)  NOT NULL UNIQUE,          -- รหัสพนักงาน เช่น TC-001
    department    VARCHAR(100) NOT NULL DEFAULT 'งานอาคารสถานที่',
    is_available  BOOLEAN      NOT NULL DEFAULT TRUE,    -- ว่างรับงาน / ลาพัก
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------
-- categories : ประเภทงานซ่อม
-- ---------------------------------------------------------------------
CREATE TABLE categories (
    id   INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name VARCHAR(50) NOT NULL UNIQUE
);

-- ---------------------------------------------------------------------
-- technician_skills : ช่างถนัดงานประเภทไหน (ตารางเชื่อม N:M)
-- ---------------------------------------------------------------------
CREATE TABLE technician_skills (
    technician_id INT NOT NULL REFERENCES technicians(id) ON DELETE CASCADE,
    category_id   INT NOT NULL REFERENCES categories(id)  ON DELETE CASCADE,
    PRIMARY KEY (technician_id, category_id)
);

-- ---------------------------------------------------------------------
-- buildings : อาคาร
-- ---------------------------------------------------------------------
CREATE TABLE buildings (
    id   INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE
);

-- ---------------------------------------------------------------------
-- repair_requests : รายการแจ้งซ่อม
-- ---------------------------------------------------------------------
CREATE TABLE repair_requests (
    id              INT GENERATED ALWAYS AS IDENTITY (START WITH 1001) PRIMARY KEY,
    code            VARCHAR(20) GENERATED ALWAYS AS ('UR-' || id) STORED UNIQUE,  -- UR-1001
    title           VARCHAR(100)     NOT NULL,
    description     TEXT             NOT NULL,
    category_id     INT              NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
    building_id     INT              NOT NULL REFERENCES buildings(id)  ON DELETE RESTRICT,
    room            VARCHAR(100)     NOT NULL,            -- ห้อง / ตำแหน่ง
    priority        request_priority NOT NULL DEFAULT 'NORMAL',

    reporter_id     INT              NOT NULL REFERENCES users(id) ON DELETE RESTRICT,  -- ใครเป็นคนกดแจ้ง
    reporter_name   VARCHAR(150)     NOT NULL,            -- ชื่อผู้แจ้ง (admin แจ้งแทนคนอื่นได้)
    reporter_phone  VARCHAR(10),

    technician_id   INT              REFERENCES technicians(id) ON DELETE RESTRICT,     -- ว่างได้จนกว่าจะมอบหมาย
    assigned_at     TIMESTAMPTZ,

    status          request_status   NOT NULL DEFAULT 'PENDING',
    status_changed_by INT            REFERENCES users(id),  -- ใครเปลี่ยนสถานะล่าสุด (trigger ใช้บันทึกประวัติ)
    status_note     VARCHAR(500),                            -- หมายเหตุของการเปลี่ยนสถานะล่าสุด
    completed_at    TIMESTAMPTZ,
    created_at      TIMESTAMPTZ      NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ      NOT NULL DEFAULT now(),

    CONSTRAINT rr_phone_format CHECK (reporter_phone IS NULL OR reporter_phone ~ '^0[0-9]{8,9}$'),
    -- จะ "กำลังดำเนินการ" หรือ "ซ่อมเสร็จ" ได้ ต้องมีช่างรับผิดชอบก่อน
    CONSTRAINT rr_need_technician CHECK (status NOT IN ('IN_PROGRESS', 'DONE') OR technician_id IS NOT NULL),
    -- ซ่อมเสร็จต้องมีเวลาเสร็จ และสถานะอื่นต้องไม่มี
    CONSTRAINT rr_completed_at    CHECK ((status = 'DONE') = (completed_at IS NOT NULL))
);

CREATE INDEX idx_rr_status     ON repair_requests(status);
CREATE INDEX idx_rr_reporter   ON repair_requests(reporter_id);
CREATE INDEX idx_rr_technician ON repair_requests(technician_id);
CREATE INDEX idx_rr_created_at ON repair_requests(created_at DESC);

-- ---------------------------------------------------------------------
-- request_images : รูปภาพประกอบ (1 รายการมีได้หลายรูป)
--   แนะนำให้เก็บไฟล์จริงไว้ในโฟลเดอร์ uploads/ แล้วเก็บแค่ path ไว้ที่นี่
-- ---------------------------------------------------------------------
CREATE TABLE request_images (
    id          INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    request_id  INT          NOT NULL REFERENCES repair_requests(id) ON DELETE CASCADE,
    image_url   VARCHAR(500) NOT NULL,
    uploaded_by INT          REFERENCES users(id),
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX idx_images_request ON request_images(request_id);

-- ---------------------------------------------------------------------
-- request_status_history : ประวัติสถานะ (ไม่ต้อง INSERT เอง trigger ทำให้)
-- ---------------------------------------------------------------------
CREATE TABLE request_status_history (
    id         INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    request_id INT            NOT NULL REFERENCES repair_requests(id) ON DELETE CASCADE,
    status     request_status NOT NULL,
    changed_by INT            REFERENCES users(id),
    note       VARCHAR(500),
    changed_at TIMESTAMPTZ    NOT NULL DEFAULT now()
);

CREATE INDEX idx_history_request ON request_status_history(request_id, changed_at);

-- =====================================================================
-- TRIGGERS
-- =====================================================================

-- 1) ก่อนบันทึก: อัปเดต updated_at / completed_at / assigned_at อัตโนมัติ
CREATE FUNCTION trg_repair_requests_before() RETURNS trigger AS $$
BEGIN
    NEW.updated_at := now();

    IF NEW.status = 'DONE' AND NEW.completed_at IS NULL THEN
        NEW.completed_at := now();
    ELSIF NEW.status <> 'DONE' THEN
        NEW.completed_at := NULL;
    END IF;

    IF NEW.technician_id IS NULL THEN
        NEW.assigned_at := NULL;
    ELSIF TG_OP = 'INSERT' OR NEW.technician_id IS DISTINCT FROM OLD.technician_id THEN
        NEW.assigned_at := now();
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER repair_requests_before
BEFORE INSERT OR UPDATE ON repair_requests
FOR EACH ROW EXECUTE FUNCTION trg_repair_requests_before();

-- 2) หลังบันทึก: ถ้าสร้างใหม่ หรือสถานะเปลี่ยน → เขียนประวัติ 1 แถว
CREATE FUNCTION trg_repair_requests_history() RETURNS trigger AS $$
BEGIN
    IF TG_OP = 'INSERT' OR NEW.status IS DISTINCT FROM OLD.status THEN
        INSERT INTO request_status_history (request_id, status, changed_by, note)
        VALUES (NEW.id, NEW.status,
                COALESCE(NEW.status_changed_by, NEW.reporter_id),
                NEW.status_note);
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER repair_requests_history
AFTER INSERT OR UPDATE OF status ON repair_requests
FOR EACH ROW EXECUTE FUNCTION trg_repair_requests_history();

-- 3) technicians ต้องผูกกับ user ที่ role = TECHNICIAN เท่านั้น
CREATE FUNCTION trg_technician_role_check() RETURNS trigger AS $$
BEGIN
    IF (SELECT role FROM users WHERE id = NEW.user_id) <> 'TECHNICIAN' THEN
        RAISE EXCEPTION 'user_id % ไม่ใช่บัญชีช่างซ่อม (role ต้องเป็น TECHNICIAN)', NEW.user_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER technician_role_check
BEFORE INSERT OR UPDATE OF user_id ON technicians
FOR EACH ROW EXECUTE FUNCTION trg_technician_role_check();

-- =====================================================================
-- VIEWS (ใช้ดึงข้อมูลไปแสดงหน้าเว็บได้เลย)
-- =====================================================================

-- รายการแจ้งซ่อมพร้อมชื่อประเภท อาคาร และช่าง (ใช้กับตาราง "รายการแจ้งซ่อม")
CREATE VIEW v_repair_requests AS
SELECT
    r.id, r.code, r.title, r.description,
    c.name            AS category,
    b.name            AS building,
    r.category_id, r.building_id,
    r.room, r.priority,
    r.reporter_id, r.reporter_name, r.reporter_phone,
    r.technician_id,
    t.user_id         AS technician_user_id,
    t.employee_code   AS technician_code,
    tu.full_name      AS technician_name,
    tu.phone          AS technician_phone,
    r.assigned_at,
    r.status, r.completed_at, r.created_at, r.updated_at
FROM repair_requests r
JOIN categories  c  ON c.id = r.category_id
JOIN buildings   b  ON b.id = r.building_id
LEFT JOIN technicians t  ON t.id = r.technician_id
LEFT JOIN users       tu ON tu.id = t.user_id;

-- ตัวเลขบนการ์ดหน้า Dashboard
CREATE VIEW v_dashboard_stats AS
SELECT
    COUNT(*)::int                                          AS total,
    COUNT(*) FILTER (WHERE status = 'PENDING')::int        AS pending,
    COUNT(*) FILTER (WHERE status = 'RECEIVED')::int       AS received,
    COUNT(*) FILTER (WHERE status = 'IN_PROGRESS')::int    AS in_progress,
    COUNT(*) FILTER (WHERE status = 'DONE')::int           AS done,
    COUNT(*) FILTER (WHERE status = 'CANCELLED')::int      AS cancelled
FROM repair_requests;

-- ภาระงานของช่างแต่ละคน (ใช้ตอนแอดมินเลือกว่าจะมอบงานให้ใคร)
CREATE VIEW v_technician_workload AS
SELECT
    t.id, t.user_id, u.username, t.employee_code, u.full_name, u.phone, t.department, t.is_available,
    COALESCE(string_agg(DISTINCT c.name, ', '), '-')                              AS skills,
    COALESCE(array_agg(DISTINCT c.id) FILTER (WHERE c.id IS NOT NULL), '{}')     AS category_ids,
    COUNT(DISTINCT r.id) FILTER (WHERE r.status IN ('RECEIVED', 'IN_PROGRESS'))::int AS active_jobs,
    COUNT(DISTINCT r.id) FILTER (WHERE r.status = 'DONE')::int                       AS completed_jobs
FROM technicians t
JOIN users u ON u.id = t.user_id
LEFT JOIN technician_skills ts ON ts.technician_id = t.id
LEFT JOIN categories c         ON c.id = ts.category_id
LEFT JOIN repair_requests r    ON r.technician_id = t.id
GROUP BY t.id, u.username, u.full_name, u.phone;
