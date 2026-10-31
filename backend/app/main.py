from __future__ import annotations

import uuid
from io import BytesIO
from zipfile import BadZipFile, ZipFile
from contextlib import contextmanager
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Annotated, Any, Callable

import psycopg
from fastapi import Depends, FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from .config import CORS_ORIGINS, DATABASE_URL, MAX_UPLOAD_BYTES, SESSION_HOURS, UPLOAD_DIR
from .db import get_db
from .schemas import (
    AssignmentCreate,
    AssignmentUpdate,
    AttendanceSave,
    ClassCreate,
    ClassUpdate,
    EnrollmentCreate,
    InvoiceGenerate,
    LoginRequest,
    PasswordChange,
    PaymentCreate,
    ProfileUpdate,
    ResultsSave,
    QuestionScoresSave,
    SessionCreate,
    SessionUpdate,
    UserCreate,
    UserUpdate,
)
from .security import (
    LOGIN_LOCKOUT_MINUTES,
    MAX_FAILED_LOGIN_ATTEMPTS,
    create_session_token,
    hash_password,
    hash_session_token,
    verify_password,
)

app = FastAPI(title="Lớp Mình API", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=False,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)

bearer = HTTPBearer(auto_error=False)
Connection = Annotated[psycopg.Connection, Depends(get_db)]


@contextmanager
def transaction(connection: psycopg.Connection):
    with connection.transaction():
        yield


def fetch_one(connection: psycopg.Connection, query: str, params: tuple = ()) -> dict | None:
    return connection.execute(query, params).fetchone()


def fetch_all(connection: psycopg.Connection, query: str, params: tuple = ()) -> list[dict]:
    return connection.execute(query, params).fetchall()


def clean_user(row: dict) -> dict:
    return {
        "id": row["user_id"],
        "username": row["username"],
        "email": row["email"],
        "role": row["role"],
        "fullName": row["full_name"],
        "phone": row["phone"],
        "avatarText": row["avatar_text"],
        "status": row["status"],
        "studentCode": row.get("student_code"),
        "classId": row.get("class_id"),
        "linkedStudentName": row.get("linked_student_name"),
    }


def current_user(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer)],
    connection: Connection,
) -> dict:
    if not credentials:
        raise HTTPException(status_code=401, detail="Vui lòng đăng nhập.")
    token_digest = hash_session_token(credentials.credentials)
    row = fetch_one(
        connection,
        """
        SELECT u.*, s.student_code, e.class_id,
               linked.full_name AS linked_student_name
        FROM auth_sessions AS a
        JOIN users AS u ON u.user_id = a.user_id
        LEFT JOIN students AS s ON s.user_id = u.user_id
        LEFT JOIN LATERAL (
          SELECT ce.class_id
          FROM class_enrollments ce
          WHERE ce.student_id = s.student_id AND ce.status = 'active'
          ORDER BY ce.enrolled_on DESC LIMIT 1
        ) e ON TRUE
        LEFT JOIN parents p ON p.user_id = u.user_id
        LEFT JOIN LATERAL (
          SELECT child.full_name
          FROM student_parents sp
          JOIN students child_s ON child_s.student_id = sp.student_id
          JOIN users child ON child.user_id = child_s.user_id
          WHERE sp.parent_id = p.parent_id
          ORDER BY sp.is_primary DESC, sp.linked_at LIMIT 1
        ) linked ON TRUE
        WHERE a.token_hash = %s AND a.revoked_at IS NULL
          AND a.expires_at > NOW() AND u.status = 'active'
        """,
        (token_digest,),
    )
    if not row:
        raise HTTPException(status_code=401, detail="Phiên đăng nhập hết hạn hoặc không hợp lệ.")
    return row


def require_roles(*roles: str) -> Callable:
    def role_dependency(user: Annotated[dict, Depends(current_user)]) -> dict:
        if user["role"] not in roles:
            raise HTTPException(status_code=403, detail="Bạn không có quyền thực hiện thao tác này.")
        return user

    return role_dependency


Teacher = Annotated[dict, Depends(require_roles("teacher"))]
StudentOrParent = Annotated[dict, Depends(require_roles("student", "parent"))]


def require_class_teacher(connection: psycopg.Connection, class_id: str, user_id: str) -> dict:
    row = fetch_one(
        connection,
        "SELECT * FROM classes WHERE class_id = %s AND teacher_user_id = %s",
        (class_id, user_id),
    )
    if not row:
        raise HTTPException(status_code=404, detail="Không tìm thấy lớp học.")
    return row


def require_student_id(connection: psycopg.Connection, user_id: str) -> dict:
    row = fetch_one(
        connection,
        """
        SELECT s.student_id, s.student_code, u.full_name
        FROM students s JOIN users u ON u.user_id = s.user_id
        WHERE s.user_id = %s
        """,
        (user_id,),
    )
    if not row:
        raise HTTPException(status_code=403, detail="Tài khoản chưa được liên kết hồ sơ học sinh.")
    return row


def linked_student_ids(connection: psycopg.Connection, user_id: str) -> list[int]:
    return [
        row["student_id"]
        for row in fetch_all(
            connection,
            """
            SELECT sp.student_id
            FROM parents p
            JOIN student_parents sp ON sp.parent_id = p.parent_id
            WHERE p.user_id = %s
            """,
            (user_id,),
        )
    ]


def can_view_student(connection: psycopg.Connection, user: dict, student_code: str) -> dict:
    student = fetch_one(
        connection,
        """
        SELECT s.student_id, s.student_code, s.user_id, u.full_name
        FROM students s JOIN users u ON u.user_id = s.user_id
        WHERE s.student_code = %s
        """,
        (student_code,),
    )
    if not student:
        raise HTTPException(status_code=404, detail="Không tìm thấy học sinh.")
    if user["role"] == "student" and student["user_id"] != user["user_id"]:
        raise HTTPException(status_code=403, detail="Bạn chỉ được xem dữ liệu của mình.")
    if user["role"] == "teacher":
        taught_here = fetch_one(
            connection,
            """
            SELECT 1
            FROM class_enrollments ce
            JOIN classes c ON c.class_id = ce.class_id
            WHERE ce.student_id = %s AND ce.status = 'active'
              AND c.teacher_user_id = %s
            LIMIT 1
            """,
            (student["student_id"], user["user_id"]),
        )
        if not taught_here:
            raise HTTPException(status_code=403, detail="Học sinh này không thuộc lớp bạn phụ trách.")
    if user["role"] == "parent":
        linked = fetch_one(
            connection,
            """
            SELECT 1
            FROM parents p JOIN student_parents sp ON sp.parent_id = p.parent_id
            WHERE p.user_id = %s AND sp.student_id = %s
            """,
            (user["user_id"], student["student_id"]),
        )
        if not linked:
            raise HTTPException(status_code=403, detail="Học sinh này chưa được liên kết với tài khoản.")
    return student


def create_notification(
    connection: psycopg.Connection,
    recipient_id: str,
    title: str,
    body: str,
    category: str,
    invoice_id: str | None = None,
) -> None:
    connection.execute(
        """
        INSERT INTO notifications (recipient_user_id, title, body, category, invoice_id)
        VALUES (%s, %s, %s, %s, %s)
        """,
        (recipient_id, title, body, category, invoice_id),
    )


@app.exception_handler(psycopg.IntegrityError)
async def integrity_error_handler(_, exc: psycopg.IntegrityError):
    return JSONResponse(
        status_code=409,
        content={"detail": "Dữ liệu bị trùng hoặc vi phạm ràng buộc."},
    )


@app.get("/api/health")
def health(connection: Connection):
    connection.execute("SELECT 1")
    return {"status": "ok", "database": "postgresql"}


@app.post("/api/auth/login")
def login(payload: LoginRequest, connection: Connection):
    identity = payload.identity.strip().lower()
    row = fetch_one(
        connection,
        """
        SELECT u.*
        FROM users u
        WHERE LOWER(u.username) = %s OR LOWER(COALESCE(u.email, '')) = %s
           OR EXISTS (
             SELECT 1 FROM user_aliases a
             WHERE a.user_id = u.user_id AND LOWER(a.alias) = %s
           )
        LIMIT 1
        FOR UPDATE OF u
        """,
        (identity, identity, identity),
    )
    if not row or row["status"] != "active":
        raise HTTPException(status_code=401, detail="Tên đăng nhập hoặc mật khẩu không chính xác.")

    if row["locked_until"] is not None:
        lock_state = fetch_one(
            connection,
            """
            SELECT locked_until > NOW() AS is_locked,
                   CEIL(EXTRACT(EPOCH FROM (locked_until - NOW())) / 60)::INTEGER AS minutes_left
            FROM users WHERE user_id = %s
            """,
            (row["user_id"],),
        )
        if lock_state["is_locked"]:
            raise HTTPException(
                status_code=429,
                detail=f"Tài khoản tạm khóa do đăng nhập sai quá {MAX_FAILED_LOGIN_ATTEMPTS} lần. "
                       f"Thử lại sau khoảng {lock_state['minutes_left']} phút.",
            )
        connection.execute(
            "UPDATE users SET locked_until = NULL, failed_login_attempts = 0 WHERE user_id = %s",
            (row["user_id"],),
        )

    if not verify_password(payload.password, row["password_hash"]):
        attempt_state = fetch_one(
            connection,
            """
            UPDATE users
            SET failed_login_attempts = CASE
                  WHEN failed_login_attempts + 1 >= %s THEN 0
                  ELSE failed_login_attempts + 1
                END,
                locked_until = CASE
                  WHEN failed_login_attempts + 1 >= %s
                    THEN NOW() + (%s * INTERVAL '1 minute')
                  ELSE NULL
                END
            WHERE user_id = %s
            RETURNING locked_until
            """,
            (
                MAX_FAILED_LOGIN_ATTEMPTS,
                MAX_FAILED_LOGIN_ATTEMPTS,
                LOGIN_LOCKOUT_MINUTES,
                row["user_id"],
            ),
        )
        connection.commit()
        if attempt_state["locked_until"] is not None:
            raise HTTPException(
                status_code=429,
                detail=f"Tài khoản tạm khóa trong {LOGIN_LOCKOUT_MINUTES} phút "
                       f"sau {MAX_FAILED_LOGIN_ATTEMPTS} lần đăng nhập sai.",
            )
        raise HTTPException(
            status_code=401,
            detail=(
                "Tên đăng nhập hoặc mật khẩu không chính xác. "
                f"Sai {MAX_FAILED_LOGIN_ATTEMPTS} lần liên tiếp sẽ khóa tài khoản "
                f"tạm thời trong {LOGIN_LOCKOUT_MINUTES} phút."
            ),
        )

    connection.execute(
        "UPDATE users SET failed_login_attempts = 0, locked_until = NULL WHERE user_id = %s",
        (row["user_id"],),
    )
    token = create_session_token()
    connection.execute(
        """
        INSERT INTO auth_sessions (user_id, token_hash, expires_at)
        VALUES (%s, %s, NOW() + (%s * INTERVAL '1 hour'))
        """,
        (row["user_id"], hash_session_token(token), SESSION_HOURS),
    )
    full_user = fetch_one(
        connection,
        """
        SELECT u.*, s.student_code,
          (SELECT ce.class_id FROM class_enrollments ce
           WHERE ce.student_id = s.student_id AND ce.status = 'active'
           ORDER BY ce.enrolled_on DESC LIMIT 1) AS class_id,
          (SELECT child.full_name FROM parents p
           JOIN student_parents sp ON sp.parent_id = p.parent_id
           JOIN students cs ON cs.student_id = sp.student_id
           JOIN users child ON child.user_id = cs.user_id
           WHERE p.user_id = u.user_id
           ORDER BY sp.is_primary DESC, sp.linked_at LIMIT 1) AS linked_student_name
        FROM users u LEFT JOIN students s ON s.user_id = u.user_id
        WHERE u.user_id = %s
        """,
        (row["user_id"],),
    )
    return {"access_token": token, "token_type": "bearer", "user": clean_user(full_user)}


@app.get("/api/auth/me")
def me(user: Annotated[dict, Depends(current_user)]):
    return clean_user(user)


@app.post("/api/auth/logout", status_code=204)
def logout(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer)],
    connection: Connection,
):
    if credentials:
        connection.execute(
            "UPDATE auth_sessions SET revoked_at = NOW() WHERE token_hash = %s AND revoked_at IS NULL",
            (hash_session_token(credentials.credentials),),
        )


@app.post("/api/auth/change-password")
def change_password(
    payload: PasswordChange,
    connection: Connection,
    user: Annotated[dict, Depends(current_user)],
):
    row = fetch_one(connection, "SELECT password_hash FROM users WHERE user_id = %s", (user["user_id"],))
    if not row or not verify_password(payload.current_password, row["password_hash"]):
        raise HTTPException(status_code=400, detail="Mật khẩu hiện tại không chính xác.")
    if payload.current_password == payload.new_password:
        raise HTTPException(status_code=400, detail="Mật khẩu mới phải khác mật khẩu hiện tại.")
    connection.execute(
        "UPDATE users SET password_hash = %s, updated_at = NOW() WHERE user_id = %s",
        (hash_password(payload.new_password), user["user_id"]),
    )
    connection.execute(
        "UPDATE auth_sessions SET revoked_at = NOW() WHERE user_id = %s AND revoked_at IS NULL",
        (user["user_id"],),
    )
    return {"message": "Đã đổi mật khẩu. Vui lòng đăng nhập lại."}


@app.get("/api/profile")
def get_profile(connection: Connection, user: Annotated[dict, Depends(current_user)]):
    return fetch_one(
        connection,
        """
        SELECT u.user_id, u.username, u.email, u.role, u.full_name, u.phone,
               u.avatar_text, u.status, p.date_of_birth, p.address, p.biography
        FROM users u LEFT JOIN user_profiles p ON p.user_id = u.user_id
        WHERE u.user_id = %s
        """,
        (user["user_id"],),
    )


@app.patch("/api/profile")
def update_profile(
    payload: ProfileUpdate,
    connection: Connection,
    user: Annotated[dict, Depends(current_user)],
):
    values = payload.model_dump(exclude_unset=True)
    if not values:
        raise HTTPException(status_code=400, detail="Không có thông tin cần cập nhật.")
    user_values = {key: values.pop(key) for key in ("full_name", "email", "phone") if key in values}
    if user_values:
        columns = ", ".join(f"{key} = %s" for key in user_values)
        connection.execute(
            f"UPDATE users SET {columns}, updated_at = NOW() WHERE user_id = %s",
            (*user_values.values(), user["user_id"]),
        )
    if values:
        connection.execute(
            """
            INSERT INTO user_profiles (user_id, date_of_birth, address, biography)
            VALUES (%s, %s, %s, %s)
            ON CONFLICT (user_id) DO UPDATE SET
              date_of_birth = COALESCE(EXCLUDED.date_of_birth, user_profiles.date_of_birth),
              address = COALESCE(EXCLUDED.address, user_profiles.address),
              biography = COALESCE(EXCLUDED.biography, user_profiles.biography)
            """,
            (
                user["user_id"],
                values.get("date_of_birth"),
                values.get("address"),
                values.get("biography"),
            ),
        )
    return get_profile(connection, user)


@app.get("/api/users")
def list_users(connection: Connection, teacher: Teacher, role: str | None = None):
    if role and role not in {"teacher", "student", "parent"}:
        raise HTTPException(status_code=400, detail="Vai trò không hợp lệ.")
    return fetch_all(
        connection,
        """
        SELECT u.user_id AS id, u.username, u.email, u.role, u.full_name, u.phone,
               u.avatar_text, u.status, s.student_code,
               (SELECT string_agg(alias, ',') FROM user_aliases a WHERE a.user_id = u.user_id) AS aliases
        FROM users u LEFT JOIN students s ON s.user_id = u.user_id
        WHERE (%s IS NULL OR u.role = %s)
        ORDER BY u.created_at DESC
        """,
        (role, role),
    )


@app.post("/api/users", status_code=201)
def create_user(payload: UserCreate, connection: Connection, teacher: Teacher):
    user_id = str(uuid.uuid4())
    with transaction(connection):
        connection.execute(
            """
            INSERT INTO users (user_id, username, email, password_hash, role, full_name, phone, avatar_text)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
            """,
            (
                user_id,
                payload.username.strip(),
                payload.email.strip().lower() if payload.email else None,
                hash_password(payload.password),
                payload.role,
                payload.full_name.strip(),
                payload.phone,
                "".join(part[0] for part in payload.full_name.split()[:2]).upper(),
            ),
        )
        if payload.role == "student":
            connection.execute(
                "INSERT INTO students (student_code, user_id) VALUES (%s, %s)",
                (payload.student_code.strip(), user_id),
            )
        else:
            student = fetch_one(
                connection,
                """
                SELECT s.student_id, s.user_id
                FROM students s WHERE s.student_code = %s AND s.status = 'active'
                """,
                (payload.linked_student_code,),
            )
            if not student:
                raise HTTPException(status_code=404, detail="Không tìm thấy học sinh cần liên kết.")
            parent = fetch_one(
                connection,
                """
                INSERT INTO parents (user_id, full_name, phone, email)
                VALUES (%s, %s, %s, %s) RETURNING parent_id
                """,
                (user_id, payload.full_name.strip(), payload.phone, payload.email),
            )
            connection.execute(
                """
                INSERT INTO student_parents (student_id, parent_id, relationship, is_primary)
                VALUES (%s, %s, %s, TRUE)
                """,
                (student["student_id"], parent["parent_id"], payload.relationship),
            )
    return {"id": user_id, "username": payload.username, "role": payload.role}


@app.patch("/api/users/{user_id}")
def update_user(user_id: str, payload: UserUpdate, connection: Connection, teacher: Teacher):
    values = payload.model_dump(exclude_unset=True)
    if not values:
        raise HTTPException(status_code=400, detail="Không có thông tin cần cập nhật.")
    if values.get("status") == "active" and user_id == teacher["user_id"]:
        values.pop("status")
    if not values:
        raise HTTPException(status_code=400, detail="Không thể thay đổi trạng thái tài khoản đang đăng nhập.")
    columns = ", ".join(f"{key} = %s" for key in values)
    row = fetch_one(
        connection,
        f"UPDATE users SET {columns}, updated_at = NOW() WHERE user_id = %s RETURNING user_id, username, role, full_name, email, phone, status",
        (*values.values(), user_id),
    )
    if not row:
        raise HTTPException(status_code=404, detail="Không tìm thấy tài khoản.")
    return row


@app.delete("/api/users/{user_id}", status_code=204)
def deactivate_user(user_id: str, connection: Connection, teacher: Teacher):
    if user_id == teacher["user_id"]:
        raise HTTPException(status_code=400, detail="Không thể tự vô hiệu hóa tài khoản đang đăng nhập.")
    cursor = connection.execute(
        "UPDATE users SET status = 'inactive', updated_at = NOW() WHERE user_id = %s",
        (user_id,),
    )
    if cursor.rowcount == 0:
        raise HTTPException(status_code=404, detail="Không tìm thấy tài khoản.")
    connection.execute(
        "UPDATE auth_sessions SET revoked_at = NOW() WHERE user_id = %s AND revoked_at IS NULL",
        (user_id,),
    )


@app.get("/api/classes")
def list_classes(connection: Connection, user: Annotated[dict, Depends(current_user)]):
    base = """
      SELECT c.class_id AS id, c.class_code AS code, c.name, c.subject,
             c.monthly_fee, c.default_room AS room, c.description, c.status,
             u.full_name AS teacher_name,
             COUNT(DISTINCT ce.student_id) FILTER (WHERE ce.status = 'active') AS student_count
      FROM classes c
      JOIN users u ON u.user_id = c.teacher_user_id
      LEFT JOIN class_enrollments ce ON ce.class_id = c.class_id
    """
    params: tuple = ()
    if user["role"] == "teacher":
        condition = "WHERE c.teacher_user_id = %s"
        params = (user["user_id"],)
    elif user["role"] == "student":
        condition = "WHERE EXISTS (SELECT 1 FROM class_enrollments e JOIN students s ON s.student_id = e.student_id WHERE e.class_id = c.class_id AND e.status = 'active' AND s.user_id = %s)"
        params = (user["user_id"],)
    else:
        condition = "WHERE EXISTS (SELECT 1 FROM class_enrollments e JOIN student_parents sp ON sp.student_id = e.student_id JOIN parents p ON p.parent_id = sp.parent_id WHERE e.class_id = c.class_id AND e.status = 'active' AND p.user_id = %s)"
        params = (user["user_id"],)
    return fetch_all(
        connection,
        f"{base} {condition} GROUP BY c.class_id, u.full_name ORDER BY c.class_code",
        params,
    )


@app.post("/api/classes", status_code=201)
def create_class(payload: ClassCreate, connection: Connection, teacher: Teacher):
    class_id = str(uuid.uuid4())
    row = fetch_one(
        connection,
        """
        INSERT INTO classes
          (class_id, class_code, name, subject, teacher_user_id, monthly_fee, default_room, description, status)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
        RETURNING class_id AS id, class_code AS code, name, subject, monthly_fee, status
        """,
        (
            class_id,
            payload.class_code.strip().upper(),
            payload.name.strip(),
            payload.subject.strip(),
            teacher["user_id"],
            payload.monthly_fee,
            payload.default_room,
            payload.description,
            payload.status,
        ),
    )
    return row


@app.patch("/api/classes/{class_id}")
def update_class(class_id: str, payload: ClassUpdate, connection: Connection, teacher: Teacher):
    require_class_teacher(connection, class_id, teacher["user_id"])
    values = payload.model_dump(exclude_unset=True)
    if not values:
        raise HTTPException(status_code=400, detail="Không có thông tin cần cập nhật.")
    columns = ", ".join(f"{key} = %s" for key in values)
    return fetch_one(
        connection,
        f"UPDATE classes SET {columns}, updated_at = NOW() WHERE class_id = %s RETURNING *",
        (*values.values(), class_id),
    )


@app.get("/api/classes/{class_id}/students")
def list_class_students(class_id: str, connection: Connection, teacher: Teacher):
    require_class_teacher(connection, class_id, teacher["user_id"])
    return fetch_all(
        connection,
        """
        SELECT s.student_id, s.student_code, u.full_name, u.email, u.phone,
               ce.enrolled_on, ce.status
        FROM class_enrollments ce
        JOIN students s ON s.student_id = ce.student_id
        JOIN users u ON u.user_id = s.user_id
        WHERE ce.class_id = %s
        ORDER BY u.full_name
        """,
        (class_id,),
    )


@app.post("/api/classes/{class_id}/students", status_code=201)
def enroll_student(
    class_id: str,
    payload: EnrollmentCreate,
    connection: Connection,
    teacher: Teacher,
):
    require_class_teacher(connection, class_id, teacher["user_id"])
    student = fetch_one(
        connection,
        "SELECT student_id FROM students WHERE student_code = %s AND status = 'active'",
        (payload.student_code,),
    )
    if not student:
        raise HTTPException(status_code=404, detail="Không tìm thấy học sinh.")
    return fetch_one(
        connection,
        """
        INSERT INTO class_enrollments (class_id, student_id, enrolled_on)
        VALUES (%s, %s, %s)
        RETURNING enrollment_id, class_id, student_id, enrolled_on, status
        """,
        (class_id, student["student_id"], payload.enrolled_on),
    )


@app.delete("/api/classes/{class_id}/students/{student_code}", status_code=204)
def unenroll_student(
    class_id: str,
    student_code: str,
    connection: Connection,
    teacher: Teacher,
):
    require_class_teacher(connection, class_id, teacher["user_id"])
    cursor = connection.execute(
        """
        UPDATE class_enrollments ce SET status = 'ended', ended_on = CURRENT_DATE
        FROM students s
        WHERE ce.class_id = %s AND ce.student_id = s.student_id
          AND s.student_code = %s AND ce.status = 'active'
        """,
        (class_id, student_code),
    )
    if cursor.rowcount == 0:
        raise HTTPException(status_code=404, detail="Không tìm thấy ghi danh đang hoạt động.")


@app.get("/api/students")
def list_students(
    connection: Connection,
    teacher: Teacher,
    class_id: str | None = None,
):
    return fetch_all(
        connection,
        """
        SELECT s.student_id, s.student_code, u.user_id, u.full_name, u.email, u.phone,
               c.class_id, c.class_code, c.name AS class_name,
               (SELECT COUNT(*) FROM attendance_records ar
                JOIN class_sessions cs ON cs.session_id = ar.session_id
                WHERE ar.student_id = s.student_id AND cs.class_id = c.class_id
                  AND ar.status IN ('present', 'late')) AS attended_sessions,
               (SELECT COUNT(*) FROM attendance_records ar
                JOIN class_sessions cs ON cs.session_id = ar.session_id
                WHERE ar.student_id = s.student_id AND cs.class_id = c.class_id) AS marked_sessions,
               (SELECT ROUND(AVG(r.score)::numeric, 2) FROM assignment_results r
                JOIN assignments a ON a.assignment_id = r.assignment_id
                WHERE r.student_id = s.student_id AND a.class_id = c.class_id) AS average_score,
               COALESCE((SELECT SUM(v.amount_remaining) FROM v_tuition_invoice_balances v
                         WHERE v.student_id = s.student_id AND v.class_id = c.class_id), 0)::numeric(12,2) AS amount_due
        FROM students s
        JOIN users u ON u.user_id = s.user_id
        LEFT JOIN class_enrollments ce ON ce.student_id = s.student_id AND ce.status = 'active'
        LEFT JOIN classes c ON c.class_id = ce.class_id AND c.teacher_user_id = %s
        WHERE c.class_id IS NOT NULL AND (%s IS NULL OR c.class_id = %s)
        ORDER BY u.full_name
        """,
        (teacher["user_id"], class_id, class_id),
    )


@app.get("/api/students/me")
def student_me(connection: Connection, user: Annotated[dict, Depends(require_roles("student"))]):
    student = require_student_id(connection, user["user_id"])
    return fetch_one(
        connection,
        """
        SELECT s.student_id, s.student_code, u.full_name, u.email, u.phone
        FROM students s JOIN users u ON u.user_id = s.user_id
        WHERE s.student_id = %s
        """,
        (student["student_id"],),
    )


@app.get("/api/sessions")
def list_sessions(
    connection: Connection,
    user: Annotated[dict, Depends(current_user)],
    class_id: str | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
):
    params: list[Any] = []
    where = ["cs.status <> 'cancelled'"]
    if user["role"] == "teacher":
        where.append("c.teacher_user_id = %s")
        params.append(user["user_id"])
    elif user["role"] == "student":
        where.append("EXISTS (SELECT 1 FROM class_enrollments ce JOIN students s ON s.student_id = ce.student_id WHERE ce.class_id = c.class_id AND ce.status = 'active' AND s.user_id = %s)")
        params.append(user["user_id"])
    else:
        where.append("EXISTS (SELECT 1 FROM class_enrollments ce JOIN student_parents sp ON sp.student_id = ce.student_id JOIN parents p ON p.parent_id = sp.parent_id WHERE ce.class_id = c.class_id AND ce.status = 'active' AND p.user_id = %s)")
        params.append(user["user_id"])
    if class_id:
        where.append("c.class_id = %s")
        params.append(class_id)
    if date_from:
        where.append("cs.starts_at::date >= %s")
        params.append(date_from)
    if date_to:
        where.append("cs.starts_at::date <= %s")
        params.append(date_to)
    return fetch_all(
        connection,
        f"""
        SELECT cs.session_id, cs.class_id, c.class_code, c.name AS class_name,
               cs.starts_at, cs.ends_at, cs.room, cs.topic, cs.status,
               u.full_name AS teacher_name
        FROM class_sessions cs JOIN classes c ON c.class_id = cs.class_id
        JOIN users u ON u.user_id = c.teacher_user_id
        WHERE {' AND '.join(where)}
        ORDER BY cs.starts_at
        """,
        tuple(params),
    )


@app.get("/api/sessions/{session_id}")
def get_session(
    session_id: int,
    connection: Connection,
    user: Annotated[dict, Depends(current_user)],
):
    session = fetch_one(
        connection,
        """
        SELECT cs.session_id, cs.class_id, cs.starts_at, cs.ends_at, cs.room,
               cs.topic, cs.status, c.class_code, c.name AS class_name,
               c.teacher_user_id, teacher.full_name AS teacher_name
        FROM class_sessions cs
        JOIN classes c ON c.class_id = cs.class_id
        JOIN users teacher ON teacher.user_id = c.teacher_user_id
        WHERE cs.session_id = %s
        """,
        (session_id,),
    )
    if not session:
        raise HTTPException(status_code=404, detail="Không tìm thấy buổi học.")
    if user["role"] == "teacher":
        allowed = session["teacher_user_id"] == user["user_id"]
    elif user["role"] == "student":
        allowed = fetch_one(
            connection,
            """
            SELECT 1 FROM class_enrollments ce JOIN students s ON s.student_id = ce.student_id
            WHERE ce.class_id = %s AND ce.status = 'active' AND s.user_id = %s
            """,
            (session["class_id"], user["user_id"]),
        ) is not None
    else:
        allowed = fetch_one(
            connection,
            """
            SELECT 1 FROM class_enrollments ce
            JOIN student_parents sp ON sp.student_id = ce.student_id
            JOIN parents p ON p.parent_id = sp.parent_id
            WHERE ce.class_id = %s AND ce.status = 'active' AND p.user_id = %s
            """,
            (session["class_id"], user["user_id"]),
        ) is not None
    if not allowed:
        raise HTTPException(status_code=403, detail="Bạn không có quyền xem buổi học này.")
    return session


@app.post("/api/sessions", status_code=201)
def create_session(payload: SessionCreate, connection: Connection, teacher: Teacher):
    require_class_teacher(connection, payload.class_id, teacher["user_id"])
    return fetch_one(
        connection,
        """
        INSERT INTO class_sessions (class_id, starts_at, ends_at, room, topic, created_by)
        VALUES (%s, %s, %s, %s, %s, %s)
        RETURNING *
        """,
        (
            payload.class_id,
            payload.starts_at,
            payload.ends_at,
            payload.room,
            payload.topic,
            teacher["user_id"],
        ),
    )


@app.patch("/api/sessions/{session_id}")
def update_session(
    session_id: int,
    payload: SessionUpdate,
    connection: Connection,
    teacher: Teacher,
):
    existing = fetch_one(
        connection,
        """
        SELECT cs.* FROM class_sessions cs JOIN classes c ON c.class_id = cs.class_id
        WHERE cs.session_id = %s AND c.teacher_user_id = %s
        """,
        (session_id, teacher["user_id"]),
    )
    if not existing:
        raise HTTPException(status_code=404, detail="Không tìm thấy buổi học.")
    values = payload.model_dump(exclude_unset=True)
    starts = values.get("starts_at", existing["starts_at"])
    ends = values.get("ends_at", existing["ends_at"])
    if ends <= starts:
        raise HTTPException(status_code=400, detail="Thời điểm kết thúc phải sau thời điểm bắt đầu.")
    if not values:
        return existing
    columns = ", ".join(f"{key} = %s" for key in values)
    return fetch_one(
        connection,
        f"UPDATE class_sessions SET {columns}, updated_at = NOW() WHERE session_id = %s RETURNING *",
        (*values.values(), session_id),
    )


@app.get("/api/sessions/{session_id}/attendance")
def get_attendance(
    session_id: int,
    connection: Connection,
    user: Annotated[dict, Depends(current_user)],
):
    session = fetch_one(
        connection,
        """
        SELECT cs.class_id, c.teacher_user_id FROM class_sessions cs
        JOIN classes c ON c.class_id = cs.class_id WHERE cs.session_id = %s
        """,
        (session_id,),
    )
    if not session:
        raise HTTPException(status_code=404, detail="Không tìm thấy buổi học.")
    if user["role"] == "teacher":
        if session["teacher_user_id"] != user["user_id"]:
            raise HTTPException(status_code=403, detail="Bạn không phụ trách lớp này.")
    else:
        authorized = fetch_one(
            connection,
            """
            SELECT 1 FROM class_enrollments ce JOIN students s ON s.student_id = ce.student_id
            WHERE ce.class_id = %s AND ce.status = 'active' AND s.user_id = %s
            UNION ALL
            SELECT 1 FROM class_enrollments ce
            JOIN student_parents sp ON sp.student_id = ce.student_id
            JOIN parents p ON p.parent_id = sp.parent_id
            WHERE ce.class_id = %s AND ce.status = 'active' AND p.user_id = %s
            LIMIT 1
            """,
            (session["class_id"], user["user_id"], session["class_id"], user["user_id"]),
        )
        if not authorized:
            raise HTTPException(status_code=403, detail="Bạn không có quyền xem điểm danh lớp này.")
    return fetch_all(
        connection,
        """
        SELECT s.student_code, u.full_name, ar.status, ar.note, ar.marked_at
        FROM class_enrollments ce
        JOIN students s ON s.student_id = ce.student_id
        JOIN users u ON u.user_id = s.user_id
        LEFT JOIN attendance_records ar ON ar.student_id = s.student_id AND ar.session_id = %s
        WHERE ce.class_id = %s AND ce.status = 'active'
        ORDER BY u.full_name
        """,
        (session_id, session["class_id"]),
    )


@app.put("/api/sessions/{session_id}/attendance")
def save_attendance(
    session_id: int,
    payload: AttendanceSave,
    connection: Connection,
    teacher: Teacher,
):
    session = fetch_one(
        connection,
        """
        SELECT cs.class_id FROM class_sessions cs JOIN classes c ON c.class_id = cs.class_id
        WHERE cs.session_id = %s AND c.teacher_user_id = %s
        """,
        (session_id, teacher["user_id"]),
    )
    if not session:
        raise HTTPException(status_code=404, detail="Không tìm thấy buổi học.")
    saved = []
    with transaction(connection):
        for record in payload.records:
            student = fetch_one(
                connection,
                """
                SELECT s.student_id FROM students s
                JOIN class_enrollments ce ON ce.student_id = s.student_id
                WHERE s.student_code = %s AND ce.class_id = %s AND ce.status = 'active'
                """,
                (record.student_code, session["class_id"]),
            )
            if not student:
                raise HTTPException(
                    status_code=400,
                    detail=f"Học sinh {record.student_code} không thuộc lớp của buổi học.",
                )
            saved.append(
                fetch_one(
                    connection,
                    """
                    INSERT INTO attendance_records
                      (session_id, student_id, status, note, marked_by, marked_at)
                    VALUES (%s, %s, %s, %s, %s, NOW())
                    ON CONFLICT (session_id, student_id) DO UPDATE SET
                      status = EXCLUDED.status, note = EXCLUDED.note,
                      marked_by = EXCLUDED.marked_by, marked_at = NOW()
                    RETURNING session_id, student_id, status, note, marked_at
                    """,
                    (session_id, student["student_id"], record.status, record.note, teacher["user_id"]),
                )
            )
    return {"records": saved}


@app.get("/api/attendance")
def attendance_history(
    connection: Connection,
    user: Annotated[dict, Depends(current_user)],
    student_code: str | None = None,
    class_id: str | None = None,
):
    if user["role"] == "teacher":
        params: list[Any] = [user["user_id"]]
        where = ["c.teacher_user_id = %s"]
        if student_code:
            where.append("s.student_code = %s")
            params.append(student_code)
        if class_id:
            where.append("c.class_id = %s")
            params.append(class_id)
    elif user["role"] == "student":
        student = require_student_id(connection, user["user_id"])
        where, params = ["s.student_id = %s"], [student["student_id"]]
    else:
        ids = linked_student_ids(connection, user["user_id"])
        if not ids:
            return []
        where, params = ["s.student_id = ANY(%s)"], [ids]
        if student_code:
            where.append("s.student_code = %s")
            params.append(student_code)
    return fetch_all(
        connection,
        f"""
        SELECT cs.session_id, cs.starts_at, c.class_code, c.name AS class_name,
               s.student_code, u.full_name AS student_name, ar.status, ar.note
        FROM attendance_records ar
        JOIN class_sessions cs ON cs.session_id = ar.session_id
        JOIN classes c ON c.class_id = cs.class_id
        JOIN students s ON s.student_id = ar.student_id
        JOIN users u ON u.user_id = s.user_id
        WHERE {' AND '.join(where)}
        ORDER BY cs.starts_at DESC
        """,
        tuple(params),
    )


@app.get("/api/assignments")
def list_assignments(
    connection: Connection,
    user: Annotated[dict, Depends(current_user)],
    class_id: str | None = None,
    student_code: str | None = None,
):
    params: list[Any] = []
    where: list[str] = []
    viewer_student_id = -1  # Chỉ học sinh được truy vấn trạng thái nộp bài của mình.
    if user["role"] == "teacher":
        where.append("c.teacher_user_id = %s")
        params.append(user["user_id"])
    elif user["role"] == "student":
        student = require_student_id(connection, user["user_id"])
        viewer_student_id = student["student_id"]
        where.append("a.status <> 'draft'")
        where.append("EXISTS (SELECT 1 FROM class_enrollments ce WHERE ce.class_id = c.class_id AND ce.student_id = %s AND ce.status = 'active')")
        params.append(student["student_id"])
    else:
        ids = linked_student_ids(connection, user["user_id"])
        where.append("a.status <> 'draft'")
        where.append("EXISTS (SELECT 1 FROM class_enrollments ce WHERE ce.class_id = c.class_id AND ce.student_id = ANY(%s) AND ce.status = 'active')")
        params.append(ids)
    if class_id:
        where.append("c.class_id = %s")
        params.append(class_id)
    if student_code:
        if user["role"] != "teacher":
            raise HTTPException(status_code=403, detail="Chỉ giáo viên được tra cứu theo mã học sinh.")
        where.append("EXISTS (SELECT 1 FROM students s JOIN class_enrollments ce ON ce.student_id = s.student_id WHERE s.student_code = %s AND ce.class_id = c.class_id AND ce.status = 'active')")
        params.append(student_code)
    return fetch_all(
        connection,
        f"""
        SELECT a.assignment_id AS id, a.class_id, c.class_code, c.name AS class_name,
               a.title, a.assignment_type, a.description, a.assigned_at, a.due_at, a.status,
               att.file_name AS attachment_file_name, att.file_size AS attachment_file_size,
               (SELECT COUNT(*) FROM class_enrollments ce WHERE ce.class_id = c.class_id AND ce.status = 'active') AS student_count,
               (SELECT ROUND(AVG(r.score)::numeric, 2) FROM assignment_results r WHERE r.assignment_id = a.assignment_id) AS average_score,
               own.submission_id AS my_submission_id, own.submitted_at AS my_submitted_at,
               own.status AS my_submission_status
        FROM assignments a JOIN classes c ON c.class_id = a.class_id
        LEFT JOIN assignment_attachments att ON att.assignment_id = a.assignment_id
        LEFT JOIN LATERAL (
          SELECT sub.submission_id, sub.submitted_at, sub.status
          FROM assignment_submissions sub
          WHERE sub.assignment_id = a.assignment_id AND sub.student_id = %s
          ORDER BY sub.submitted_at DESC, sub.submission_id DESC LIMIT 1
        ) own ON TRUE
        WHERE {' AND '.join(where)}
        ORDER BY a.assigned_at DESC, a.created_at DESC
        """,
        (viewer_student_id, *params),
    )


# UC-07: tệp đề và bài nộp là hai thực thể riêng biệt; không cho phép tải công khai.
ATTACHMENT_MIME = {
    ".pdf": "application/pdf",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
}


def _validated_attachment(file: UploadFile) -> tuple[str, str, bytes, str]:
    name = (file.filename or "").replace("\\", "/").split("/")[-1].strip()
    if not name or len(name) > 255 or any(ord(ch) < 32 for ch in name):
        raise HTTPException(status_code=400, detail="Tên tệp đề không hợp lệ (tối đa 255 ký tự).")
    ext = Path(name).suffix.lower()
    if ext not in ATTACHMENT_MIME:
        raise HTTPException(status_code=415, detail="Chỉ nhận đề PDF, DOCX, PNG, JPG/JPEG.")
    content = file.file.read(MAX_UPLOAD_BYTES + 1)
    if not content:
        raise HTTPException(status_code=400, detail="Tệp đề đang trống.")
    if len(content) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="Tệp đề vượt giới hạn dung lượng.")
    valid = {
        ".pdf": lambda: content.startswith(b"%PDF-"),
        ".png": lambda: content.startswith(b"\x89PNG\r\n\x1a\n"),
        ".jpg": lambda: content.startswith(b"\xff\xd8\xff"),
        ".jpeg": lambda: content.startswith(b"\xff\xd8\xff"),
    }
    if ext == ".docx":
        try:
            with ZipFile(BytesIO(content)) as doc:
                entries = set(doc.namelist())
                good = "[Content_Types].xml" in entries and "word/document.xml" in entries
        except (BadZipFile, OSError, ValueError):
            good = False
    else:
        good = valid[ext]()
    if not good:
        raise HTTPException(status_code=415, detail="Nội dung tệp không khớp định dạng PDF/DOCX/ảnh.")
    return name, ext, content, ATTACHMENT_MIME[ext]


def _store_attachment(file: UploadFile) -> tuple[str, str, str, int, Path]:
    name, ext, content, mime = _validated_attachment(file)
    root = (Path(UPLOAD_DIR).resolve() / "assignment_prompts")
    root.mkdir(parents=True, exist_ok=True)
    key = f"{uuid.uuid4().hex}{ext}"
    destination = root / key
    destination.write_bytes(content)
    return name, key, mime, len(content), destination


def _save_attachment_record(
    connection: psycopg.Connection, assignment_id: str, teacher_id: str,
    name: str, key: str, mime: str, size: int,
):
    connection.execute(
        """INSERT INTO assignment_attachments
           (assignment_id, file_name, storage_key, mime_type, file_size, uploaded_by)
           VALUES (%s, %s, %s, %s, %s, %s)
           ON CONFLICT (assignment_id) DO UPDATE SET
             file_name = EXCLUDED.file_name, storage_key = EXCLUDED.storage_key,
             mime_type = EXCLUDED.mime_type, file_size = EXCLUDED.file_size,
             uploaded_by = EXCLUDED.uploaded_by, uploaded_at = NOW()""",
        (assignment_id, name, key, mime, size, teacher_id),
    )


@app.post("/api/assignments/with-attachment", status_code=201)
def create_assignment_with_attachment(
    connection: Connection,
    teacher: Teacher,
    class_id: str = Form(...),
    title: str = Form(...),
    assignment_type: str = Form(...),
    description: str = Form(""),
    assigned_at: date = Form(...),
    due_at: datetime | None = Form(None),
    status: str = Form("published"),
    file: UploadFile = File(...),
):
    # Validate toàn bộ dữ liệu và tệp trước khi tạo bài hoặc gửi thông báo.
    payload = AssignmentCreate(
        class_id=class_id, title=title, assignment_type=assignment_type,
        description=description, assigned_at=assigned_at, due_at=due_at, status=status,
    )
    require_class_teacher(connection, payload.class_id, teacher["user_id"])
    name, key, mime, size, destination = _store_attachment(file)
    try:
        row = create_assignment(payload, connection, teacher)
        _save_attachment_record(connection, row["assignment_id"], teacher["user_id"], name, key, mime, size)
        connection.commit()  # Không công bố bài nếu lưu tệp đề vào DB thất bại.
        return {**row, "attachment_file_name": name, "attachment_file_size": size}
    except Exception:
        connection.rollback()
        destination.unlink(missing_ok=True)
        raise


@app.put("/api/assignments/{assignment_id}/attachment")
def replace_assignment_attachment(
    assignment_id: str, connection: Connection, teacher: Teacher,
    file: UploadFile = File(...),
):
    assignment = fetch_one(
        connection,
        """SELECT a.assignment_id FROM assignments a JOIN classes c ON c.class_id = a.class_id
           WHERE a.assignment_id = %s AND c.teacher_user_id = %s""",
        (assignment_id, teacher["user_id"]),
    )
    if not assignment:
        raise HTTPException(status_code=404, detail="Không tìm thấy bài hoặc không có quyền sửa.")
    previous = fetch_one(
        connection, "SELECT storage_key FROM assignment_attachments WHERE assignment_id = %s",
        (assignment_id,),
    )
    name, key, mime, size, destination = _store_attachment(file)
    try:
        _save_attachment_record(connection, assignment_id, teacher["user_id"], name, key, mime, size)
        connection.commit()
    except Exception:
        connection.rollback()
        destination.unlink(missing_ok=True)
        raise
    if previous:
        try:
            (Path(UPLOAD_DIR).resolve() / "assignment_prompts" / previous["storage_key"]).unlink(missing_ok=True)
        except OSError:
            # Cơ sở dữ liệu đã cập nhật; tệp cũ có thể được dọn sau.
            pass
    return {"assignment_id": assignment_id, "file_name": name, "file_size": size}


@app.get("/api/assignments/{assignment_id}/attachment")
def download_assignment_attachment(
    assignment_id: str, connection: Connection,
    user: Annotated[dict, Depends(current_user)],
):
    row = fetch_one(
        connection,
        """SELECT att.*, a.class_id, a.status, c.teacher_user_id
           FROM assignment_attachments att
           JOIN assignments a ON a.assignment_id = att.assignment_id
           JOIN classes c ON c.class_id = a.class_id
           WHERE att.assignment_id = %s""",
        (assignment_id,),
    )
    if not row:
        raise HTTPException(status_code=404, detail="Chưa có tệp đề cho bài này.")
    allowed = user["role"] == "teacher" and row["teacher_user_id"] == user["user_id"]
    if not allowed and row["status"] != "draft" and user["role"] == "student":
        student = require_student_id(connection, user["user_id"])
        allowed = fetch_one(
            connection,
            """SELECT 1 FROM class_enrollments WHERE class_id = %s AND student_id = %s
               AND status = 'active'""",
            (row["class_id"], student["student_id"]),
        ) is not None
    if not allowed and row["status"] != "draft" and user["role"] == "parent":
        allowed = fetch_one(
            connection,
            """SELECT 1 FROM parents p JOIN student_parents sp ON sp.parent_id = p.parent_id
               JOIN class_enrollments ce ON ce.student_id = sp.student_id
               WHERE p.user_id = %s AND ce.class_id = %s AND ce.status = 'active' LIMIT 1""",
            (user["user_id"], row["class_id"]),
        ) is not None
    if not allowed:
        raise HTTPException(status_code=403, detail="Bạn không có quyền xem tệp đề.")
    path = (Path(UPLOAD_DIR).resolve() / "assignment_prompts" / row["storage_key"])
    if not path.is_file():
        raise HTTPException(status_code=404, detail="Tệp đề không còn tồn tại trên máy chủ.")
    return FileResponse(
        path, filename=row["file_name"], media_type=row["mime_type"],
        content_disposition_type="attachment", headers={"X-Content-Type-Options": "nosniff"},
    )


@app.post("/api/assignments", status_code=201)
def create_assignment(payload: AssignmentCreate, connection: Connection, teacher: Teacher):
    require_class_teacher(connection, payload.class_id, teacher["user_id"])
    assignment_id = str(uuid.uuid4())
    row = fetch_one(
        connection,
        """
        INSERT INTO assignments
          (assignment_id, class_id, title, assignment_type, description, assigned_at, due_at, status, created_by)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
        RETURNING *
        """,
        (
            assignment_id,
            payload.class_id,
            payload.title.strip(),
            payload.assignment_type,
            payload.description,
            payload.assigned_at,
            payload.due_at,
            payload.status,
            teacher["user_id"],
        ),
    )
    if payload.status == "published":
        connection.execute(
            """
            INSERT INTO notifications (recipient_user_id, title, body, category)
            SELECT DISTINCT u.user_id, %s, %s, 'assignment'
            FROM class_enrollments ce JOIN students s ON s.student_id = ce.student_id
            JOIN users u ON u.user_id = s.user_id
            WHERE ce.class_id = %s AND ce.status = 'active'
            """,
            ("Bài tập mới", payload.title, payload.class_id),
        )
    return row


@app.patch("/api/assignments/{assignment_id}")
def update_assignment(
    assignment_id: str,
    payload: AssignmentUpdate,
    connection: Connection,
    teacher: Teacher,
):
    row = fetch_one(
        connection,
        """
        SELECT a.* FROM assignments a JOIN classes c ON c.class_id = a.class_id
        WHERE a.assignment_id = %s AND c.teacher_user_id = %s
        """,
        (assignment_id, teacher["user_id"]),
    )
    if not row:
        raise HTTPException(status_code=404, detail="Không tìm thấy bài tập.")
    values = payload.model_dump(exclude_unset=True)
    if not values:
        return row
    columns = ", ".join(f"{key} = %s" for key in values)
    return fetch_one(
        connection,
        f"UPDATE assignments SET {columns}, updated_at = NOW() WHERE assignment_id = %s RETURNING *",
        (*values.values(), assignment_id),
    )


@app.get("/api/assignments/{assignment_id}/results")
def get_results(assignment_id: str, connection: Connection, teacher: Teacher):
    assignment = fetch_one(
        connection,
        """
        SELECT a.class_id FROM assignments a JOIN classes c ON c.class_id = a.class_id
        WHERE a.assignment_id = %s AND c.teacher_user_id = %s
        """,
        (assignment_id, teacher["user_id"]),
    )
    if not assignment:
        raise HTTPException(status_code=404, detail="Không tìm thấy bài tập.")
    return fetch_all(
        connection,
        """
        SELECT s.student_code, u.full_name, r.score, r.teacher_comment, r.graded_at,
               sub.submission_id, sub.file_name, sub.submitted_at
        FROM class_enrollments ce
        JOIN students s ON s.student_id = ce.student_id
        JOIN users u ON u.user_id = s.user_id
        LEFT JOIN assignment_results r ON r.assignment_id = %s AND r.student_id = s.student_id
        LEFT JOIN LATERAL (
          SELECT submission_id, file_name, submitted_at FROM assignment_submissions
          WHERE assignment_id = %s AND student_id = s.student_id
          ORDER BY submitted_at DESC, submission_id DESC LIMIT 1
        ) sub ON TRUE
        WHERE ce.class_id = %s AND ce.status = 'active'
        ORDER BY u.full_name
        """,
        (assignment_id, assignment_id, assignment["class_id"]),
    )


@app.put("/api/assignments/{assignment_id}/results")
def save_results(
    assignment_id: str,
    payload: ResultsSave,
    connection: Connection,
    teacher: Teacher,
):
    assignment = fetch_one(
        connection,
        """
        SELECT a.class_id FROM assignments a JOIN classes c ON c.class_id = a.class_id
        WHERE a.assignment_id = %s AND c.teacher_user_id = %s
        """,
        (assignment_id, teacher["user_id"]),
    )
    if not assignment:
        raise HTTPException(status_code=404, detail="Không tìm thấy bài tập.")
    saved = []
    with transaction(connection):
        for entry in payload.results:
            student = fetch_one(
                connection,
                """
                SELECT s.student_id FROM students s JOIN class_enrollments ce ON ce.student_id = s.student_id
                WHERE s.student_code = %s AND ce.class_id = %s AND ce.status = 'active'
                """,
                (entry.student_code, assignment["class_id"]),
            )
            if not student:
                raise HTTPException(status_code=400, detail=f"Học sinh {entry.student_code} không thuộc lớp.")
            old = fetch_one(
                connection,
                "SELECT score FROM assignment_results WHERE assignment_id = %s AND student_id = %s",
                (assignment_id, student["student_id"]),
            )
            old_score = old["score"] if old else None
            if old and old_score != entry.score and not (entry.change_reason or "").strip():
                raise HTTPException(status_code=400, detail=f"Cần ghi lý do sửa điểm cho {entry.student_code}.")
            # Khi thay đổi điểm tổng, chi tiết từng câu cũ không còn đúng.
            if old and old_score != entry.score:
                connection.execute(
                    "DELETE FROM assignment_question_scores WHERE assignment_id = %s AND student_id = %s",
                    (assignment_id, student["student_id"]),
                )
            result = fetch_one(
                connection,
                """
                INSERT INTO assignment_results
                  (assignment_id, student_id, score, teacher_comment, graded_by, graded_at)
                VALUES (%s, %s, %s, %s, %s, NOW())
                ON CONFLICT (assignment_id, student_id) DO UPDATE SET
                  score = EXCLUDED.score, teacher_comment = EXCLUDED.teacher_comment,
                  graded_by = EXCLUDED.graded_by, graded_at = NOW()
                RETURNING assignment_id, student_id, score, teacher_comment, graded_at
                """,
                (
                    assignment_id,
                    student["student_id"],
                    entry.score,
                    entry.teacher_comment,
                    teacher["user_id"],
                ),
            )
            if old and old_score != entry.score:
                connection.execute(
                    """
                    INSERT INTO grade_change_logs
                      (assignment_id, student_id, old_score, new_score, reason, changed_by)
                    VALUES (%s, %s, %s, %s, %s, %s)
                    """,
                    (
                        assignment_id,
                        student["student_id"],
                        old_score,
                        entry.score,
                        entry.change_reason.strip(),
                        teacher["user_id"],
                    ),
                )
            if entry.score is not None:
                connection.execute(
                    """
                    INSERT INTO notifications (recipient_user_id, title, body, category)
                    SELECT user_id, %s, %s, 'academic'
                    FROM students WHERE student_id = %s AND user_id IS NOT NULL
                    """,
                    ("Đã cập nhật kết quả", f"Điểm của bài tập đã được cập nhật: {entry.score}", student["student_id"]),
                )
            saved.append(result)
    return {"results": saved}


@app.get("/api/grade-history/{student_code}")
def grade_history(student_code: str, connection: Connection, teacher: Teacher):
    student = fetch_one(
        connection,
        """
        SELECT s.student_id FROM students s
        JOIN class_enrollments ce ON ce.student_id = s.student_id
        JOIN classes c ON c.class_id = ce.class_id
        WHERE s.student_code = %s AND c.teacher_user_id = %s
        LIMIT 1
        """,
        (student_code, teacher["user_id"]),
    )
    if not student:
        raise HTTPException(status_code=404, detail="Không tìm thấy học sinh.")
    return fetch_all(
        connection,
        """
        SELECT l.*, a.title, u.full_name AS changed_by_name
        FROM grade_change_logs l
        JOIN assignments a ON a.assignment_id = l.assignment_id
        JOIN users u ON u.user_id = l.changed_by
        WHERE l.student_id = %s
        ORDER BY l.changed_at DESC
        """,
        (student["student_id"],),
    )


# UC-11: điểm chi tiết từng câu, ràng buộc với điểm tổng đã lưu ở UC-08.
def _uc11_teacher_result(connection: psycopg.Connection, assignment_id: str, student_code: str, user_id: str) -> dict:
    row = fetch_one(
        connection,
        """
        SELECT s.student_id, r.score
        FROM assignments a
        JOIN classes c ON c.class_id = a.class_id
        JOIN class_enrollments ce ON ce.class_id = a.class_id AND ce.status = 'active'
        JOIN students s ON s.student_id = ce.student_id
        JOIN assignment_results r ON r.assignment_id = a.assignment_id AND r.student_id = s.student_id
        WHERE a.assignment_id = %s AND s.student_code = %s AND c.teacher_user_id = %s
        """,
        (assignment_id, student_code, user_id),
    )
    if not row:
        raise HTTPException(status_code=404, detail="Chưa có điểm tổng hoặc không có quyền chấm học sinh này.")
    return row


@app.get("/api/assignments/{assignment_id}/question-scores/{student_code}")
def uc11_get_question_scores(assignment_id: str, student_code: str, connection: Connection, teacher: Teacher):
    result = _uc11_teacher_result(connection, assignment_id, student_code, teacher["user_id"])
    return fetch_all(
        connection,
        """SELECT question_no, max_score, earned_score FROM assignment_question_scores
           WHERE assignment_id = %s AND student_id = %s ORDER BY question_no""",
        (assignment_id, result["student_id"]),
    )


@app.put("/api/assignments/{assignment_id}/question-scores/{student_code}")
def uc11_save_question_scores(
    assignment_id: str,
    student_code: str,
    payload: QuestionScoresSave,
    connection: Connection,
    teacher: Teacher,
):
    with transaction(connection):
        result = _uc11_teacher_result(connection, assignment_id, student_code, teacher["user_id"])
        if result["score"] is None:
            raise HTTPException(status_code=400, detail="Cần lưu điểm tổng tại UC-08 trước.")
        earned = sum((part.earned_score for part in payload.questions), 0)
        maximum = sum((part.max_score for part in payload.questions), 0)
        if earned != result["score"]:
            raise HTTPException(status_code=400, detail="Tổng điểm từng câu phải bằng điểm tổng UC-08.")
        if maximum > 10:
            raise HTTPException(status_code=400, detail="Tổng điểm tối đa không được vượt 10.")
        connection.execute(
            "DELETE FROM assignment_question_scores WHERE assignment_id = %s AND student_id = %s",
            (assignment_id, result["student_id"]),
        )
        for part in payload.questions:
            connection.execute(
                """INSERT INTO assignment_question_scores
                   (assignment_id, student_id, question_no, max_score, earned_score)
                   VALUES (%s, %s, %s, %s, %s)""",
                (assignment_id, result["student_id"], part.question_no, part.max_score, part.earned_score),
            )
    return {"saved": len(payload.questions)}


@app.get("/api/assignments/{assignment_id}/my-question-scores")
def uc11_my_question_scores(
    assignment_id: str,
    connection: Connection,
    student_user: Annotated[dict, Depends(require_roles("student"))],
):
    student = require_student_id(connection, student_user["user_id"])
    exists = fetch_one(
        connection,
        """SELECT 1 FROM assignments a
           JOIN class_enrollments ce ON ce.class_id = a.class_id
           WHERE a.assignment_id = %s AND ce.student_id = %s AND ce.status = 'active'
           AND a.status <> 'draft'""",
        (assignment_id, student["student_id"]),
    )
    if not exists:
        raise HTTPException(status_code=404, detail="Không tìm thấy bài được phép xem.")
    return fetch_all(
        connection,
        """SELECT question_no, max_score, earned_score FROM assignment_question_scores
           WHERE assignment_id = %s AND student_id = %s ORDER BY question_no""",
        (assignment_id, student["student_id"]),
    )


@app.post("/api/assignments/{assignment_id}/submissions", status_code=201)
def submit_assignment(
    assignment_id: str,
    connection: Connection,
    user: Annotated[dict, Depends(require_roles("student"))],
    file: UploadFile = File(...),
):
    student = require_student_id(connection, user["user_id"])
    assignment = fetch_one(
        connection,
        """
        SELECT a.assignment_id, a.due_at
        FROM assignments a
        JOIN class_enrollments ce ON ce.class_id = a.class_id
        WHERE a.assignment_id = %s AND ce.student_id = %s
          AND ce.status = 'active' AND a.status = 'published'
        """,
        (assignment_id, student["student_id"]),
    )
    if not assignment:
        raise HTTPException(status_code=404, detail="Không tìm thấy bài tập đang mở.")
    contents = file.file.read(MAX_UPLOAD_BYTES + 1)
    if not contents:
        raise HTTPException(status_code=400, detail="Tệp nộp đang trống.")
    if len(contents) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="Tệp vượt quá giới hạn dung lượng.")
    safe_name = Path(file.filename or "submission").name[:255]
    extension = Path(safe_name).suffix.lower()
    if extension not in {".pdf", ".png", ".jpg", ".jpeg"}:
        raise HTTPException(status_code=415, detail="Chỉ chấp nhận PDF hoặc ảnh JPG/PNG.")
    storage_key = f"{uuid.uuid4().hex}{extension}"
    upload_root = Path(UPLOAD_DIR).resolve()
    upload_root.mkdir(parents=True, exist_ok=True)
    destination = upload_root / storage_key
    destination.write_bytes(contents)
    try:
        status = "late" if assignment["due_at"] and datetime.now(timezone.utc) > assignment["due_at"] else "submitted"
        return fetch_one(
            connection,
            """
            INSERT INTO assignment_submissions
              (assignment_id, student_id, file_name, storage_key, mime_type, file_size, status)
            VALUES (%s, %s, %s, %s, %s, %s, %s)
            RETURNING submission_id, assignment_id, file_name, submitted_at, status
            """,
            (
                assignment_id,
                student["student_id"],
                safe_name,
                storage_key,
                file.content_type,
                len(contents),
                status,
            ),
        )
    except (OSError, psycopg.Error):
        destination.unlink(missing_ok=True)
        raise


@app.get("/api/submissions/{submission_id}/file")
def download_submission(
    submission_id: int,
    connection: Connection,
    user: Annotated[dict, Depends(current_user)],
):
    row = fetch_one(
        connection,
        """
        SELECT sub.*, s.user_id AS student_user_id, c.teacher_user_id
        FROM assignment_submissions sub
        JOIN students s ON s.student_id = sub.student_id
        JOIN assignments a ON a.assignment_id = sub.assignment_id
        JOIN classes c ON c.class_id = a.class_id
        WHERE sub.submission_id = %s
        """,
        (submission_id,),
    )
    if not row:
        raise HTTPException(status_code=404, detail="Không tìm thấy bài nộp.")
    allowed = user["role"] == "teacher" and user["user_id"] == row["teacher_user_id"]
    allowed = allowed or (user["role"] == "student" and user["user_id"] == row["student_user_id"])
    if user["role"] == "parent":
        allowed = fetch_one(
            connection,
            """
            SELECT 1 FROM parents p JOIN student_parents sp ON sp.parent_id = p.parent_id
            JOIN students s ON s.student_id = sp.student_id
            WHERE p.user_id = %s AND s.student_id = %s
            """,
            (user["user_id"], row["student_id"]),
        ) is not None
    if not allowed:
        raise HTTPException(status_code=403, detail="Bạn không có quyền tải tệp này.")
    path = Path(UPLOAD_DIR).resolve() / row["storage_key"]
    if not path.is_file():
        raise HTTPException(status_code=404, detail="Tệp bài nộp không còn tồn tại.")
    return FileResponse(path, filename=row["file_name"], media_type=row["mime_type"])


@app.get("/api/tuition/invoices")
def list_invoices(
    connection: Connection,
    user: Annotated[dict, Depends(current_user)],
    class_id: str | None = None,
    student_code: str | None = None,
    billing_year: int | None = None,
    billing_month: int | None = None,
):
    where: list[str] = ["i.status = 'open'"]
    params: list[Any] = []
    if user["role"] == "teacher":
        where.append("c.teacher_user_id = %s")
        params.append(user["user_id"])
    elif user["role"] == "student":
        student = require_student_id(connection, user["user_id"])
        where.append("i.student_id = %s")
        params.append(student["student_id"])
    else:
        ids = linked_student_ids(connection, user["user_id"])
        where.append("i.student_id = ANY(%s)")
        params.append(ids)
    for column, value in (
        ("i.class_id", class_id),
        ("s.student_code", student_code),
        ("i.billing_year", billing_year),
        ("i.billing_month", billing_month),
    ):
        if value is not None:
            where.append(f"{column} = %s")
            params.append(value)
    return fetch_all(
        connection,
        f"""
        SELECT v.*, s.student_code, u.full_name AS student_name, c.class_code, c.name AS class_name,
               i.period_start, i.period_end, i.sessions_count
        FROM v_tuition_invoice_balances v
        JOIN tuition_invoices i ON i.invoice_id = v.invoice_id
        JOIN students s ON s.student_id = i.student_id
        JOIN users u ON u.user_id = s.user_id
        JOIN classes c ON c.class_id = i.class_id
        WHERE {' AND '.join(where)}
        ORDER BY i.billing_year DESC, i.billing_month DESC, u.full_name
        """,
        tuple(params),
    )


@app.post("/api/tuition/invoices/generate", status_code=201)
def generate_invoices(
    payload: InvoiceGenerate,
    connection: Connection,
    teacher: Teacher,
):
    class_row = require_class_teacher(connection, payload.class_id, teacher["user_id"])
    enrolled = fetch_all(
        connection,
        """
        SELECT s.student_id, s.student_code, s.user_id
        FROM class_enrollments ce JOIN students s ON s.student_id = ce.student_id
        WHERE ce.class_id = %s AND ce.status = 'active'
        """,
        (payload.class_id,),
    )
    invoices = []
    with transaction(connection):
        for student in enrolled:
            session_count = fetch_one(
                connection,
                """
                SELECT COUNT(*) AS count
                FROM class_sessions cs
                LEFT JOIN attendance_records ar
                  ON ar.session_id = cs.session_id AND ar.student_id = %s
                WHERE cs.class_id = %s AND cs.status = 'completed'
                  AND cs.starts_at::date BETWEEN %s AND %s
                  AND (ar.status IS NULL OR ar.status IN ('present', 'late'))
                """,
                (student["student_id"], payload.class_id, payload.period_start, payload.period_end),
            )["count"]
            amount = (
                payload.amount_due
                if payload.amount_due is not None
                else payload.charge_per_session * session_count
            )
            invoice_id = f"INV-{payload.billing_year}-{payload.billing_month:02d}-{uuid.uuid4().hex[:8].upper()}"
            invoice = fetch_one(
                connection,
                """
                INSERT INTO tuition_invoices
                  (invoice_id, student_id, class_id, billing_year, billing_month,
                   period_start, period_end, sessions_count, amount_due, note, issued_by)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (student_id, class_id, billing_year, billing_month) DO NOTHING
                RETURNING invoice_id, student_id, class_id, amount_due, sessions_count
                """,
                (
                    invoice_id,
                    student["student_id"],
                    payload.class_id,
                    payload.billing_year,
                    payload.billing_month,
                    payload.period_start,
                    payload.period_end,
                    session_count,
                    amount,
                    payload.note,
                    teacher["user_id"],
                ),
            )
            if invoice:
                invoices.append(invoice)
                recipients = [student["user_id"]] if student["user_id"] else []
                recipients.extend(
                    row["user_id"]
                    for row in fetch_all(
                        connection,
                        """
                        SELECT p.user_id FROM student_parents sp
                        JOIN parents p ON p.parent_id = sp.parent_id
                        WHERE sp.student_id = %s AND p.user_id IS NOT NULL
                        """,
                        (student["student_id"],),
                    )
                )
                for recipient in set(recipients):
                    create_notification(
                        connection,
                        recipient,
                        "Thông báo học phí",
                        f"Hóa đơn tháng {payload.billing_month}/{payload.billing_year} đã được tạo.",
                        "tuition",
                        invoice_id,
                    )
    return {"created": len(invoices), "invoices": invoices}


@app.get("/api/tuition/invoices/{invoice_id}/payments")
def invoice_payments(invoice_id: str, connection: Connection, user: Annotated[dict, Depends(current_user)]):
    invoice = fetch_one(
        connection,
        """
        SELECT i.student_id, c.teacher_user_id
        FROM tuition_invoices i JOIN classes c ON c.class_id = i.class_id
        WHERE i.invoice_id = %s
        """,
        (invoice_id,),
    )
    if not invoice:
        raise HTTPException(status_code=404, detail="Không tìm thấy hóa đơn.")
    allowed = user["role"] == "teacher" and invoice["teacher_user_id"] == user["user_id"]
    if user["role"] == "student":
        allowed = require_student_id(connection, user["user_id"])["student_id"] == invoice["student_id"]
    elif user["role"] == "parent":
        allowed = invoice["student_id"] in linked_student_ids(connection, user["user_id"])
    if not allowed:
        raise HTTPException(status_code=403, detail="Bạn không có quyền xem hóa đơn này.")
    return fetch_all(
        connection,
        """
        SELECT p.payment_id, p.amount, p.payment_method, p.paid_at,
               p.reference_code, p.note, u.full_name AS recorded_by_name
        FROM tuition_payments p JOIN users u ON u.user_id = p.recorded_by
        WHERE p.invoice_id = %s ORDER BY p.paid_at DESC
        """,
        (invoice_id,),
    )


@app.post("/api/tuition/invoices/{invoice_id}/payments", status_code=201)
def record_payment(
    invoice_id: str,
    payload: PaymentCreate,
    connection: Connection,
    teacher: Teacher,
):
    invoice = fetch_one(
        connection,
        """
        SELECT i.*, c.teacher_user_id FROM tuition_invoices i
        JOIN classes c ON c.class_id = i.class_id
        WHERE i.invoice_id = %s AND i.status = 'open' AND c.teacher_user_id = %s
        FOR UPDATE
        """,
        (invoice_id, teacher["user_id"]),
    )
    if not invoice:
        raise HTTPException(status_code=404, detail="Không tìm thấy hóa đơn đang mở.")
    balance = fetch_one(
        connection,
        "SELECT amount_remaining FROM v_tuition_invoice_balances WHERE invoice_id = %s",
        (invoice_id,),
    )
    if payload.amount > balance["amount_remaining"]:
        raise HTTPException(status_code=400, detail="Số tiền nhận vượt quá số tiền còn phải đóng.")
    with transaction(connection):
        payment = fetch_one(
            connection,
            """
            INSERT INTO tuition_payments
              (invoice_id, amount, payment_method, paid_at, reference_code, note, recorded_by)
            VALUES (%s, %s, %s, %s, %s, %s, %s)
            RETURNING *
            """,
            (
                invoice_id,
                payload.amount,
                payload.payment_method,
                payload.paid_at,
                payload.reference_code,
                payload.note,
                teacher["user_id"],
            ),
        )
        recipients = fetch_all(
            connection,
            """
            SELECT user_id FROM users WHERE user_id = (
              SELECT user_id FROM students WHERE student_id = %s
            )
            UNION
            SELECT p.user_id FROM student_parents sp JOIN parents p ON p.parent_id = sp.parent_id
            WHERE sp.student_id = %s AND p.user_id IS NOT NULL
            """,
            (invoice["student_id"], invoice["student_id"]),
        )
        for recipient in recipients:
            create_notification(
                connection,
                recipient["user_id"],
                "Đã ghi nhận thanh toán",
                f"Đã ghi nhận khoản thanh toán {payload.amount} cho hóa đơn {invoice_id}.",
                "tuition",
                invoice_id,
            )
    return payment


@app.get("/api/students/{student_code}/progress")
def student_progress(
    student_code: str,
    connection: Connection,
    user: Annotated[dict, Depends(current_user)],
):
    if user["role"] == "teacher":
        can_view_student(connection, user, student_code)
    else:
        can_view_student(connection, user, student_code)
    return fetch_all(
        connection,
        """
        SELECT a.assignment_id, a.title, a.assignment_type, a.assigned_at,
               c.class_code, c.name AS class_name, r.score, r.teacher_comment, r.graded_at,
               ROUND(AVG(r.score) OVER (PARTITION BY a.class_id)::numeric, 2) AS class_average
        FROM students s
        JOIN class_enrollments ce ON ce.student_id = s.student_id
        JOIN classes c ON c.class_id = ce.class_id
        JOIN assignments a ON a.class_id = c.class_id AND a.status <> 'draft'
        LEFT JOIN assignment_results r ON r.assignment_id = a.assignment_id AND r.student_id = s.student_id
        WHERE s.student_code = %s
        ORDER BY a.assigned_at DESC
        """,
        (student_code,),
    )


@app.get("/api/notifications")
def list_notifications(
    connection: Connection,
    user: Annotated[dict, Depends(current_user)],
    unread_only: bool = False,
):
    return fetch_all(
        connection,
        """
        SELECT notification_id, title, body, category, invoice_id, created_at, read_at
        FROM notifications
        WHERE recipient_user_id = %s AND (%s = FALSE OR read_at IS NULL)
        ORDER BY created_at DESC LIMIT 100
        """,
        (user["user_id"], unread_only),
    )


@app.get("/api/notifications/unread-count")
def unread_notification_count(connection: Connection, user: Annotated[dict, Depends(current_user)]):
    row = fetch_one(
        connection,
        """
        SELECT COUNT(*) AS count
        FROM notifications
        WHERE recipient_user_id = %s AND read_at IS NULL
        """,
        (user["user_id"],),
    )
    return {"count": row["count"]}


@app.post("/api/notifications/{notification_id}/read")
def mark_notification_read(
    notification_id: int,
    connection: Connection,
    user: Annotated[dict, Depends(current_user)],
):
    row = fetch_one(
        connection,
        """
        UPDATE notifications SET read_at = NOW()
        WHERE notification_id = %s AND recipient_user_id = %s
        RETURNING notification_id, read_at
        """,
        (notification_id, user["user_id"]),
    )
    if not row:
        raise HTTPException(status_code=404, detail="Không tìm thấy thông báo.")
    return row


@app.post("/api/notifications/read-all")
def mark_all_notifications_read(connection: Connection, user: Annotated[dict, Depends(current_user)]):
    cursor = connection.execute(
        "UPDATE notifications SET read_at = NOW() WHERE recipient_user_id = %s AND read_at IS NULL",
        (user["user_id"],),
    )
    return {"updated": cursor.rowcount}


@app.get("/api/dashboard")
def dashboard(connection: Connection, user: Annotated[dict, Depends(current_user)]):
    if user["role"] == "teacher":
        return {
            "classes": fetch_one(
                connection,
                """
                SELECT COUNT(*) AS class_count,
                       COUNT(*) FILTER (WHERE status = 'active') AS active_classes
                FROM classes WHERE teacher_user_id = %s
                """,
                (user["user_id"],),
            ),
            "students": fetch_one(
                connection,
                """
                SELECT COUNT(DISTINCT ce.student_id) AS student_count
                FROM class_enrollments ce JOIN classes c ON c.class_id = ce.class_id
                WHERE c.teacher_user_id = %s AND ce.status = 'active'
                """,
                (user["user_id"],),
            ),
            "upcoming_sessions": fetch_all(
                connection,
                """
                SELECT cs.session_id, cs.starts_at, cs.topic, cs.room, c.name AS class_name
                FROM class_sessions cs JOIN classes c ON c.class_id = cs.class_id
                WHERE c.teacher_user_id = %s AND cs.status = 'scheduled'
                  AND cs.starts_at >= NOW()
                ORDER BY cs.starts_at LIMIT 5
                """,
                (user["user_id"],),
            ),
        }
    if user["role"] == "student":
        student = require_student_id(connection, user["user_id"])
        child_ids = [student["student_id"]]
    else:
        child_ids = linked_student_ids(connection, user["user_id"])
    if not child_ids:
        return {"students": [], "upcoming_sessions": [], "unread_notifications": 0}
    return {
        "students": fetch_all(
            connection,
            """
            SELECT s.student_code, u.full_name,
                   ROUND(AVG(r.score)::numeric, 2) AS average_score,
                   COUNT(DISTINCT ce.class_id) AS class_count
            FROM students s JOIN users u ON u.user_id = s.user_id
            LEFT JOIN class_enrollments ce ON ce.student_id = s.student_id AND ce.status = 'active'
            LEFT JOIN assignment_results r ON r.student_id = s.student_id
            WHERE s.student_id = ANY(%s)
            GROUP BY s.student_id, u.user_id
            """,
            (child_ids,),
        ),
        "upcoming_sessions": fetch_all(
            connection,
            """
            SELECT cs.session_id, cs.starts_at, cs.topic, cs.room, c.name AS class_name
            FROM class_sessions cs JOIN classes c ON c.class_id = cs.class_id
            JOIN class_enrollments ce ON ce.class_id = c.class_id AND ce.status = 'active'
            WHERE ce.student_id = ANY(%s) AND cs.status = 'scheduled' AND cs.starts_at >= NOW()
            ORDER BY cs.starts_at LIMIT 5
            """,
            (child_ids,),
        ),
        "unread_notifications": fetch_one(
            connection,
            "SELECT COUNT(*) AS count FROM notifications WHERE recipient_user_id = %s AND read_at IS NULL",
            (user["user_id"],),
        )["count"],
    }
