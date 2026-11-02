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
from fastapi.responses import FileResponse, JSONResponse, Response
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
    ParentLinkCreate,
    PasswordChange,
    PaymentCreate,
    ProfileUpdate,
    ResultsSave,
    QuestionScoresSave,
    SessionCreate,
    SessionUpdate,
    UserCreate,
    UserPasswordReset,
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
        "SELECT * FROM classes WHERE (class_id = %s OR class_code = %s) AND teacher_user_id = %s",
        (class_id, class_id, user_id),
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
               u.avatar_text, u.status, u.created_at, u.updated_at,
               p.date_of_birth, p.address, p.biography
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
    if "full_name" in user_values:
        user_values["full_name"] = (user_values["full_name"] or "").strip()
        if not user_values["full_name"]:
            raise HTTPException(status_code=422, detail="Họ và tên không được để trống.")
    for field in ("email", "phone"):
        if field in user_values:
            user_values[field] = (user_values[field] or "").strip() or None
    for field in ("address", "biography"):
        if field in values and values[field] is not None:
            values[field] = values[field].strip() or None

    if user_values:
        columns = ", ".join(f"{key} = %s" for key in user_values)
        connection.execute(
            f"UPDATE users SET {columns}, updated_at = NOW() WHERE user_id = %s",
            (*user_values.values(), user["user_id"]),
        )
    else:
        connection.execute(
            "UPDATE users SET updated_at = NOW() WHERE user_id = %s",
            (user["user_id"],),
        )
    if values:
        profile_columns = ", ".join(values)
        placeholders = ", ".join(["%s"] * len(values))
        update_columns = ", ".join(
            f"{key} = EXCLUDED.{key}" for key in values
        )
        connection.execute(
            f"""
            INSERT INTO user_profiles (user_id, {profile_columns})
            VALUES (%s, {placeholders})
            ON CONFLICT (user_id) DO UPDATE SET {update_columns}
            """,
            (user["user_id"], *values.values()),
        )
    if user.get("role") == "parent":
        connection.execute(
            """
            INSERT INTO parents (user_id, full_name, phone, email)
            SELECT user_id, full_name, phone, email
            FROM users
            WHERE user_id = %s
            ON CONFLICT (user_id) DO UPDATE SET
              full_name = EXCLUDED.full_name,
              phone = EXCLUDED.phone,
              email = EXCLUDED.email
            """,
            (user["user_id"],),
        )
    return get_profile(connection, user)


@app.get("/api/profile/avatar")
def get_profile_avatar(connection: Connection, user: Annotated[dict, Depends(current_user)]):
    row = fetch_one(
        connection,
        "SELECT mime_type, image_data FROM user_avatars WHERE user_id = %s",
        (user["user_id"],),
    )
    if not row:
        return Response(status_code=204)
    return Response(
        content=row["image_data"],
        media_type=row["mime_type"],
        headers={
            "Cache-Control": "private, no-store",
            "X-Content-Type-Options": "nosniff",
        },
    )


@app.put("/api/profile/avatar")
def update_profile_avatar(
    file: Annotated[UploadFile, File(...)],
    connection: Connection,
    user: Annotated[dict, Depends(current_user)],
):
    content = file.file.read(5 * 1024 * 1024 + 1)
    if not content:
        raise HTTPException(status_code=400, detail="Ảnh đại diện đang trống.")
    if len(content) > 5 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="Ảnh đại diện không được vượt quá 5 MB.")

    image_types = {
        "image/jpeg": content.startswith(b"\xff\xd8\xff"),
        "image/png": content.startswith(b"\x89PNG\r\n\x1a\n"),
        "image/webp": content.startswith(b"RIFF") and content[8:12] == b"WEBP",
    }
    if file.content_type not in image_types or not image_types[file.content_type]:
        raise HTTPException(status_code=415, detail="Chỉ chấp nhận ảnh JPEG, PNG hoặc WebP hợp lệ.")

    connection.execute(
        """
        INSERT INTO user_avatars (user_id, mime_type, image_data, updated_at)
        VALUES (%s, %s, %s, NOW())
        ON CONFLICT (user_id) DO UPDATE
        SET mime_type = EXCLUDED.mime_type,
            image_data = EXCLUDED.image_data,
            updated_at = NOW()
        """,
        (user["user_id"], file.content_type, content),
    )
    return {"message": "Đã cập nhật ảnh đại diện."}


@app.get("/api/users")
def list_users(connection: Connection, teacher: Teacher, role: str | None = None):
    if role and role not in {"teacher", "student", "parent"}:
        raise HTTPException(status_code=400, detail="Vai trò không hợp lệ.")
    return fetch_all(
        connection,
        """
        SELECT u.user_id AS id, u.username, u.email, u.role, u.full_name, u.phone,
               u.avatar_text, u.status, s.student_code,
               (SELECT string_agg(DISTINCT CASE WHEN u.role = 'student'
                                                  THEN linked_parent_user.full_name
                                                  ELSE linked_student_user.full_name END, ', ')
                FROM student_parents sp
                JOIN parents linked_parent ON linked_parent.parent_id = sp.parent_id
                JOIN students linked_student ON linked_student.student_id = sp.student_id
                JOIN users linked_parent_user ON linked_parent_user.user_id = linked_parent.user_id
                JOIN users linked_student_user ON linked_student_user.user_id = linked_student.user_id
                WHERE linked_parent.user_id = u.user_id OR linked_student.user_id = u.user_id
               ) AS linked_names,
               (SELECT array_agg(DISTINCT CASE WHEN u.role = 'student'
                                                THEN linked_parent.user_id
                                                ELSE linked_student.user_id END)
                FROM student_parents sp
                JOIN parents linked_parent ON linked_parent.parent_id = sp.parent_id
                JOIN students linked_student ON linked_student.student_id = sp.student_id
                WHERE linked_parent.user_id = u.user_id OR linked_student.user_id = u.user_id
               ) AS linked_user_ids,
               (SELECT string_agg(DISTINCT c.name, ', ')
                FROM students enrolled_student
                JOIN class_enrollments ce ON ce.student_id = enrolled_student.student_id
                  AND ce.status = 'active'
                JOIN classes c ON c.class_id = ce.class_id
                WHERE enrolled_student.user_id = u.user_id
               ) AS class_names,
               (SELECT string_agg(alias, ',') FROM user_aliases a WHERE a.user_id = u.user_id) AS aliases
        FROM users u LEFT JOIN students s ON s.user_id = u.user_id
        WHERE (%s::text IS NULL OR u.role = %s)
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


@app.post("/api/users/{user_id}/parent-link", status_code=201)
def link_parent_to_student(
    user_id: str,
    payload: ParentLinkCreate,
    connection: Connection,
    teacher: Teacher,
):
    parent = fetch_one(
        connection,
        """SELECT p.parent_id FROM parents p
           JOIN users u ON u.user_id = p.user_id
           WHERE p.user_id = %s AND u.role = 'parent' AND u.status = 'active'""",
        (user_id,),
    )
    if not parent:
        raise HTTPException(status_code=404, detail="Không tìm thấy hồ sơ tài khoản phụ huynh.")
    student = fetch_one(
        connection,
        """SELECT s.student_id FROM students s
           JOIN users u ON u.user_id = s.user_id
           WHERE s.student_code = %s AND s.status = 'active' AND u.status = 'active'""",
        (payload.student_code,),
    )
    if not student:
        raise HTTPException(status_code=404, detail="Không tìm thấy học sinh đang hoạt động.")
    row = fetch_one(
        connection,
        """INSERT INTO student_parents (student_id, parent_id, relationship, is_primary)
           VALUES (%s, %s, %s, NOT EXISTS (
             SELECT 1 FROM student_parents WHERE student_id = %s
           ))
           ON CONFLICT (student_id, parent_id) DO NOTHING
           RETURNING student_id, parent_id, relationship, is_primary, linked_at""",
        (student["student_id"], parent["parent_id"], payload.relationship, student["student_id"]),
    )
    if not row:
        raise HTTPException(status_code=409, detail="Tài khoản phụ huynh đã được liên kết với học sinh này.")
    return row


@app.post("/api/users/{user_id}/reset-password")
def reset_user_password(
    user_id: str,
    payload: UserPasswordReset,
    connection: Connection,
    teacher: Teacher,
):
    user = fetch_one(
        connection,
        "SELECT role FROM users WHERE user_id = %s",
        (user_id,),
    )
    if not user or user["role"] not in {"student", "parent"}:
        raise HTTPException(status_code=404, detail="Không tìm thấy tài khoản học sinh hoặc phụ huynh.")
    with transaction(connection):
        connection.execute(
            """UPDATE users
               SET password_hash = %s, failed_login_attempts = 0, locked_until = NULL,
                   updated_at = NOW()
               WHERE user_id = %s""",
            (hash_password(payload.new_password), user_id),
        )
        connection.execute(
            """UPDATE auth_sessions SET revoked_at = NOW()
               WHERE user_id = %s AND revoked_at IS NULL""",
            (user_id,),
        )
    return {"message": "Đã đặt lại mật khẩu và thu hồi các phiên đăng nhập."}


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
      SELECT c.class_id, c.class_code, c.class_id AS id, c.class_code AS code, c.name, c.subject,
             c.monthly_fee, c.default_room AS room, c.description, c.status,
             u.full_name AS teacher_name,
             COUNT(DISTINCT ce.student_id) FILTER (WHERE ce.status = 'active') AS student_count,
             sched.schedule_summary
      FROM classes c
      JOIN users u ON u.user_id = c.teacher_user_id
      LEFT JOIN class_enrollments ce ON ce.class_id = c.class_id
      LEFT JOIN LATERAL (
        SELECT string_agg(
          CASE weekday
            WHEN 1 THEN 'Thứ 2' WHEN 2 THEN 'Thứ 3' WHEN 3 THEN 'Thứ 4' WHEN 4 THEN 'Thứ 5'
            WHEN 5 THEN 'Thứ 6' WHEN 6 THEN 'Thứ 7' WHEN 7 THEN 'Chủ nhật'
          END, ', ' ORDER BY weekday
        ) || ' · ' || TO_CHAR(starts_at, 'HH24:MI') || '–' || TO_CHAR(ends_at, 'HH24:MI') AS schedule_summary
        FROM class_schedule_rules csr
        WHERE csr.class_id = c.class_id
        GROUP BY starts_at, ends_at
        LIMIT 1
      ) sched ON TRUE
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
        f"{base} {condition} GROUP BY c.class_id, u.full_name, sched.schedule_summary ORDER BY c.class_code",
        params,
    )


@app.get("/api/classes/{class_id}")
def get_class(class_id: str, connection: Connection, user: Annotated[dict, Depends(current_user)]):
    row = fetch_one(
        connection,
        """
        SELECT c.class_id, c.class_code, c.class_id AS id, c.class_code AS code, c.name, c.subject,
               c.monthly_fee, c.default_room AS room, c.description, c.status,
               u.full_name AS teacher_name,
               COUNT(DISTINCT ce.student_id) FILTER (WHERE ce.status = 'active') AS student_count,
               sched.schedule_summary
        FROM classes c
        JOIN users u ON u.user_id = c.teacher_user_id
        LEFT JOIN class_enrollments ce ON ce.class_id = c.class_id
        LEFT JOIN LATERAL (
          SELECT string_agg(
            CASE weekday
              WHEN 1 THEN 'Thứ 2' WHEN 2 THEN 'Thứ 3' WHEN 3 THEN 'Thứ 4' WHEN 4 THEN 'Thứ 5'
              WHEN 5 THEN 'Thứ 6' WHEN 6 THEN 'Thứ 7' WHEN 7 THEN 'Chủ nhật'
            END, ', ' ORDER BY weekday
          ) || ' · ' || TO_CHAR(starts_at, 'HH24:MI') || '–' || TO_CHAR(ends_at, 'HH24:MI') AS schedule_summary
          FROM class_schedule_rules csr
          WHERE csr.class_id = c.class_id
          GROUP BY starts_at, ends_at
          LIMIT 1
        ) sched ON TRUE
        WHERE (c.class_id = %s OR c.class_code = %s)
        GROUP BY c.class_id, u.full_name, sched.schedule_summary
        """,
        (class_id, class_id),
    )
    if not row:
        raise HTTPException(status_code=404, detail="Không tìm thấy lớp học.")
    return row


@app.post("/api/classes", status_code=201)
def create_class(payload: ClassCreate, connection: Connection, teacher: Teacher):
    code = payload.class_code.strip().upper()
    existing = fetch_one(connection, "SELECT 1 FROM classes WHERE class_code = %s", (code,))
    if existing:
        raise HTTPException(status_code=409, detail=f"Mã lớp '{code}' đã tồn tại trong hệ thống.")
    class_id = str(uuid.uuid4())
    row = fetch_one(
        connection,
        """
        INSERT INTO classes
          (class_id, class_code, name, subject, teacher_user_id, monthly_fee, default_room, description, status)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
        RETURNING class_id, class_code, class_id AS id, class_code AS code, name, subject, monthly_fee, default_room AS room, status, description
        """,
        (
            class_id,
            code,
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
    cls = require_class_teacher(connection, class_id, teacher["user_id"])
    values = payload.model_dump(exclude_unset=True)
    values.pop("schedule_info", None)
    if not values:
        raise HTTPException(status_code=400, detail="Không có thông tin cần cập nhật.")
    columns = ", ".join(f"{key} = %s" for key in values)
    return fetch_one(
        connection,
        f"UPDATE classes SET {columns}, updated_at = NOW() WHERE class_id = %s RETURNING *",
        (*values.values(), cls["class_id"]),
    )


@app.get("/api/classes/{class_id}/students")
def list_class_students(class_id: str, connection: Connection, teacher: Teacher):
    cls = require_class_teacher(connection, class_id, teacher["user_id"])
    return fetch_all(
        connection,
        """
        SELECT s.student_id, s.student_code,
               COALESCE(u.full_name, s.student_code) AS full_name,
               u.email, u.phone,
               up.date_of_birth,
               p.full_name AS parent_name,
               p.phone AS parent_phone,
               ce.enrolled_on, ce.status
        FROM class_enrollments ce
        JOIN students s ON s.student_id = ce.student_id
        LEFT JOIN users u ON u.user_id = s.user_id
        LEFT JOIN user_profiles up ON up.user_id = u.user_id
        LEFT JOIN student_parents sp ON sp.student_id = s.student_id AND sp.is_primary = TRUE
        LEFT JOIN parents p ON p.parent_id = sp.parent_id
        WHERE ce.class_id = %s AND ce.status = 'active'
        ORDER BY s.student_code
        """,
        (cls["class_id"],),
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
    # Không cho ghi danh trùng, nhưng hỗ trợ phục hồi ghi danh đã kết thúc cùng ngày.
    with transaction(connection):
        active = fetch_one(
            connection,
            """SELECT enrollment_id FROM class_enrollments
               WHERE class_id = %s AND student_id = %s AND status = 'active'""",
            (class_id, student["student_id"]),
        )
        if active:
            raise HTTPException(status_code=409, detail="Học sinh đã có trong lớp.")
        old = fetch_one(
            connection,
            """SELECT enrollment_id FROM class_enrollments
               WHERE class_id = %s AND student_id = %s AND enrolled_on = %s
                 AND status <> 'active'""",
            (class_id, student["student_id"], payload.enrolled_on),
        )
        if old:
            return fetch_one(
                connection,
                """UPDATE class_enrollments SET status = 'active', ended_on = NULL
                   WHERE enrollment_id = %s
                   RETURNING enrollment_id, class_id, student_id, enrolled_on, status""",
                (old["enrollment_id"],),
            )
        return fetch_one(
            connection,
            """INSERT INTO class_enrollments (class_id, student_id, enrolled_on)
               VALUES (%s, %s, %s)
               RETURNING enrollment_id, class_id, student_id, enrolled_on, status""",
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


@app.post("/api/classes/{class_id}/archive")
def archive_class(class_id: str, connection: Connection, teacher: Teacher):
    cls = require_class_teacher(connection, class_id, teacher["user_id"])
    return fetch_one(
        connection,
        "UPDATE classes SET status = 'archived', updated_at = NOW() WHERE class_id = %s RETURNING *",
        (cls["class_id"],),
    )


@app.post("/api/classes/{class_id}/close")
def close_class(class_id: str, connection: Connection, teacher: Teacher):
    cls = require_class_teacher(connection, class_id, teacher["user_id"])
    return fetch_one(
        connection,
        "UPDATE classes SET status = 'completed', updated_at = NOW() WHERE class_id = %s RETURNING *",
        (cls["class_id"],),
    )


@app.post("/api/classes/{class_id}/restore")
def restore_class(class_id: str, connection: Connection, teacher: Teacher):
    cls = require_class_teacher(connection, class_id, teacher["user_id"])
    return fetch_one(
        connection,
        "UPDATE classes SET status = 'active', updated_at = NOW() WHERE class_id = %s RETURNING *",
        (cls["class_id"],),
    )


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
        WHERE c.class_id IS NOT NULL AND (%s::varchar IS NULL OR c.class_id = %s)
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
        SELECT s.student_id, s.student_code, s.status AS student_status, s.created_at,
               u.full_name, u.email, u.phone, p.date_of_birth, p.address,
               guardian.full_name AS guardian_name,
               guardian.phone AS guardian_phone,
               guardian.email AS guardian_email,
               guardian.relationship AS guardian_relationship
        FROM students s JOIN users u ON u.user_id = s.user_id
        LEFT JOIN user_profiles p ON p.user_id = u.user_id
        LEFT JOIN LATERAL (
          SELECT parent.full_name, parent.phone, parent.email, sp.relationship
          FROM student_parents sp
          JOIN parents parent ON parent.parent_id = sp.parent_id
          WHERE sp.student_id = s.student_id
          ORDER BY sp.is_primary DESC, sp.linked_at
          LIMIT 1
        ) guardian ON TRUE
        WHERE s.student_id = %s
        """,
        (student["student_id"],),
    )


@app.get("/api/children")
def get_linked_children(
    connection: Connection,
    parent: Annotated[dict, Depends(require_roles("parent"))],
):
    """Học sinh đã liên kết với phụ huynh, kể cả khi chưa có điểm danh."""
    return fetch_all(
        connection,
        """SELECT s.student_code, u.full_name, s.status AS student_status,
                  sp.relationship, sp.is_primary
           FROM parents p
           JOIN student_parents sp ON sp.parent_id = p.parent_id
           JOIN students s ON s.student_id = sp.student_id
           JOIN users u ON u.user_id = s.user_id
           WHERE p.user_id = %s
           ORDER BY sp.is_primary DESC, u.full_name""",
        (parent["user_id"],),
    )


@app.get("/api/sessions")
def list_sessions(
    connection: Connection,
    user: Annotated[dict, Depends(current_user)],
    class_id: str | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    student_code: str | None = None,
):
    params: list[Any] = []
    where = ["cs.status <> 'cancelled'"]
    if user["role"] == "teacher":
        if student_code:
            raise HTTPException(status_code=403, detail="Bạn không có quyền lọc lịch theo học sinh.")
        where.append("c.teacher_user_id = %s")
        params.append(user["user_id"])
    elif user["role"] == "student":
        if student_code:
            raise HTTPException(status_code=403, detail="Bạn không có quyền lọc lịch theo học sinh.")
        where.append("EXISTS (SELECT 1 FROM class_enrollments ce JOIN students s ON s.student_id = ce.student_id WHERE ce.class_id = c.class_id AND ce.status = 'active' AND s.user_id = %s)")
        params.append(user["user_id"])
    else:
        where.append("EXISTS (SELECT 1 FROM class_enrollments ce JOIN student_parents sp ON sp.student_id = ce.student_id JOIN parents p ON p.parent_id = sp.parent_id WHERE ce.class_id = c.class_id AND ce.status = 'active' AND p.user_id = %s)")
        params.append(user["user_id"])
        if student_code:
            student = can_view_student(connection, user, student_code)
            where.append(
                "EXISTS (SELECT 1 FROM class_enrollments selected_ce "
                "WHERE selected_ce.class_id = c.class_id "
                "AND selected_ce.student_id = %s AND selected_ce.status = 'active')"
            )
            params.append(student["student_id"])
    if class_id:
        where.append("(c.class_id = %s OR c.class_code = %s)")
        params.extend([class_id, class_id])
    if date_from:
        where.append("cs.starts_at::date >= %s")
        params.append(date_from)
    if date_to:
        where.append("cs.starts_at::date <= %s")
        params.append(date_to)
    return fetch_all(
        connection,
        f"""
        SELECT cs.session_id, cs.class_id, c.class_code, c.name AS class_name, c.subject,
               cs.starts_at, cs.ends_at, cs.room, cs.topic, cs.status,
               u.full_name AS teacher_name,
               COUNT(DISTINCT ce.student_id) FILTER (WHERE ce.status = 'active') AS student_count
        FROM class_sessions cs JOIN classes c ON c.class_id = cs.class_id
        JOIN users u ON u.user_id = c.teacher_user_id
        LEFT JOIN class_enrollments ce ON ce.class_id = c.class_id
        WHERE {' AND '.join(where)}
        GROUP BY cs.session_id, cs.class_id, c.class_code, c.name, c.subject, cs.starts_at, cs.ends_at, cs.room, cs.topic, cs.status, u.full_name
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
               cs.topic, cs.status, c.class_code, c.name AS class_name, c.subject,
               c.teacher_user_id, teacher.full_name AS teacher_name,
               COUNT(DISTINCT ce.student_id) FILTER (WHERE ce.status = 'active') AS student_count
        FROM class_sessions cs
        JOIN classes c ON c.class_id = cs.class_id
        JOIN users teacher ON teacher.user_id = c.teacher_user_id
        LEFT JOIN class_enrollments ce ON ce.class_id = c.class_id
        WHERE cs.session_id = %s
        GROUP BY cs.session_id, cs.class_id, cs.starts_at, cs.ends_at, cs.room,
                 cs.topic, cs.status, c.class_code, c.name, c.subject,
                 c.teacher_user_id, teacher.full_name
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
    conditions = ["ce.class_id = %s", "ce.status = 'active'"]
    params: list[Any] = [session_id, session["class_id"]]
    if user["role"] == "student":
        conditions.append("s.user_id = %s")
        params.append(user["user_id"])
    elif user["role"] == "parent":
        conditions.append("s.student_id = ANY(%s)")
        params.append(linked_student_ids(connection, user["user_id"]))
    return fetch_all(
        connection,
        f"""
        SELECT s.student_code, u.full_name, ar.status, ar.note, ar.marked_at
        FROM class_enrollments ce
        JOIN students s ON s.student_id = ce.student_id
        JOIN users u ON u.user_id = s.user_id
        LEFT JOIN attendance_records ar ON ar.student_id = s.student_id AND ar.session_id = %s
        WHERE {' AND '.join(conditions)}
        ORDER BY u.full_name
        """,
        tuple(params),
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
        SELECT cs.session_id, cs.starts_at, cs.ends_at, cs.room,
               c.class_code, c.name AS class_name, c.subject,
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
               grader.full_name AS graded_by_name,
               ROUND(AVG(r.score) OVER (PARTITION BY a.class_id)::numeric, 2) AS class_average
        FROM students s
        JOIN (
            SELECT DISTINCT student_id, class_id
            FROM class_enrollments
        ) ce ON ce.student_id = s.student_id
        JOIN classes c ON c.class_id = ce.class_id
        JOIN assignments a ON a.class_id = c.class_id AND a.status <> 'draft'
        LEFT JOIN assignment_results r ON r.assignment_id = a.assignment_id AND r.student_id = s.student_id
        LEFT JOIN users grader ON grader.user_id = r.graded_by
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


def safe_fetch_weekly_sessions(connection: psycopg.Connection, teacher_id: str) -> int:
    row = fetch_one(
        connection,
        """
        SELECT COUNT(*) AS count
        FROM class_sessions cs JOIN classes c ON c.class_id = cs.class_id
        WHERE c.teacher_user_id = %s AND cs.status <> 'cancelled'
          AND cs.starts_at >= date_trunc('week', NOW())
          AND cs.starts_at < date_trunc('week', NOW()) + INTERVAL '1 week'
        """,
        (teacher_id,),
    )
    return int(row["count"]) if row else 0


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
            "today_sessions": fetch_one(
                connection,
                """
                SELECT COUNT(*) AS session_count,
                       MIN(cs.starts_at) AS first_starts_at,
                       MAX(cs.ends_at) AS last_ends_at
                FROM class_sessions cs
                JOIN classes c ON c.class_id = cs.class_id
                WHERE c.teacher_user_id = %s
                  AND cs.status = 'scheduled'
                  AND cs.starts_at >= date_trunc('day', NOW())
                  AND cs.starts_at < date_trunc('day', NOW()) + INTERVAL '1 day'
                """,
                (user["user_id"],),
            ),
            "weekly_sessions": safe_fetch_weekly_sessions(connection, user["user_id"]),
            "upcoming_sessions": fetch_all(
                connection,
                """
                SELECT cs.session_id, cs.class_id, cs.starts_at, cs.ends_at, cs.topic, cs.room,
                       c.class_code, c.name AS class_name,
                       COUNT(DISTINCT ce.student_id) FILTER (WHERE ce.status = 'active') AS student_count
                FROM class_sessions cs JOIN classes c ON c.class_id = cs.class_id
                LEFT JOIN class_enrollments ce ON ce.class_id = c.class_id
                WHERE c.teacher_user_id = %s AND cs.status <> 'cancelled'
                GROUP BY cs.session_id, cs.class_id, cs.starts_at, cs.ends_at, cs.topic, cs.room, c.class_code, c.name
                ORDER BY cs.starts_at LIMIT 10
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
        return {
            "students": [],
            "upcoming_sessions": [],
            "unread_notifications": 0,
        }
    return {
        "students": fetch_all(
            connection,
            """
            SELECT s.student_code, u.full_name,
                   (SELECT ROUND(AVG(r.score)::numeric, 2)
                    FROM assignment_results r
                    WHERE r.student_id = s.student_id AND r.score IS NOT NULL
                   ) AS average_score,
                   (SELECT COUNT(*) FROM assignment_results r
                    WHERE r.student_id = s.student_id AND r.score IS NOT NULL
                   ) AS graded_count,
                   (SELECT r.score
                    FROM assignment_results r
                    JOIN assignments a ON a.assignment_id = r.assignment_id
                    WHERE r.student_id = s.student_id AND r.score IS NOT NULL
                    ORDER BY r.graded_at DESC NULLS LAST, a.assigned_at DESC, a.created_at DESC
                    LIMIT 1
                   ) AS latest_score,
                   (SELECT a.title
                    FROM assignment_results r
                    JOIN assignments a ON a.assignment_id = r.assignment_id
                    WHERE r.student_id = s.student_id AND r.score IS NOT NULL
                    ORDER BY r.graded_at DESC NULLS LAST, a.assigned_at DESC, a.created_at DESC
                    LIMIT 1
                   ) AS latest_assignment_title,
                   (SELECT COALESCE(r.graded_at, a.assigned_at::timestamptz)
                    FROM assignment_results r
                    JOIN assignments a ON a.assignment_id = r.assignment_id
                    WHERE r.student_id = s.student_id AND r.score IS NOT NULL
                    ORDER BY r.graded_at DESC NULLS LAST, a.assigned_at DESC, a.created_at DESC
                    LIMIT 1
                   ) AS latest_graded_at,
                   (SELECT COUNT(*) FROM class_enrollments ce
                    WHERE ce.student_id = s.student_id AND ce.status = 'active'
                   ) AS class_count,
                   (SELECT COUNT(*)
                    FROM assignments a
                    WHERE a.status IN ('published', 'closed')
                      AND EXISTS (
                        SELECT 1 FROM class_enrollments ce
                        WHERE ce.class_id = a.class_id
                          AND ce.student_id = s.student_id
                          AND ce.status = 'active'
                      )
                      AND NOT EXISTS (
                        SELECT 1 FROM assignment_submissions sub
                        WHERE sub.assignment_id = a.assignment_id
                          AND sub.student_id = s.student_id
                      )
                   ) AS pending_assignment_count,
                   (SELECT MIN(a.due_at)
                    FROM assignments a
                    WHERE a.status IN ('published', 'closed')
                      AND a.due_at IS NOT NULL
                      AND EXISTS (
                        SELECT 1 FROM class_enrollments ce
                        WHERE ce.class_id = a.class_id
                          AND ce.student_id = s.student_id
                          AND ce.status = 'active'
                      )
                      AND NOT EXISTS (
                        SELECT 1 FROM assignment_submissions sub
                        WHERE sub.assignment_id = a.assignment_id
                          AND sub.student_id = s.student_id
                      )
                   ) AS nearest_pending_due_at
            FROM students s JOIN users u ON u.user_id = s.user_id
            WHERE s.student_id = ANY(%s)
            """,
            (child_ids,),
        ),
        "upcoming_sessions": fetch_all(
            connection,
            """
            SELECT cs.session_id, cs.class_id, cs.starts_at, cs.ends_at, cs.topic, cs.room,
                   c.class_code, c.name AS class_name, teacher.full_name AS teacher_name
            FROM class_sessions cs
            JOIN classes c ON c.class_id = cs.class_id
            JOIN users teacher ON teacher.user_id = c.teacher_user_id
            JOIN class_enrollments ce ON ce.class_id = c.class_id AND ce.status = 'active'
            WHERE ce.student_id = ANY(%s) AND cs.status <> 'cancelled'
            GROUP BY cs.session_id, cs.class_id, cs.starts_at, cs.ends_at, cs.topic, cs.room, c.class_code, c.name, teacher.full_name
            ORDER BY cs.starts_at LIMIT 10
            """,
            (child_ids,),
        ),
        "unread_notifications": fetch_one(
            connection,
            "SELECT COUNT(*) AS count FROM notifications WHERE recipient_user_id = %s AND read_at IS NULL",
            (user["user_id"],),
        )["count"],
    }


# ==============================================================================
# UC-09 & UC-12: MỞ RỘNG API QUẢN LÝ HỌC PHÍ, ĐỐI SOÁT CÔNG NỢ & NHẮC PHÍ
# ==============================================================================
from .schemas import BulkTuitionReminderRequest, TuitionReminderRequest


def format_vnd_amount(value: Any) -> str:
    amount = int(round(float(value or 0)))
    return f"{amount:,}".replace(",", ".") + " ₫"


def build_tuition_reminder_message(invoice_row: dict, custom_note: str | None = None) -> tuple[str, str]:
    billing_month = int(invoice_row["billing_month"])
    billing_year = int(invoice_row["billing_year"])
    period_start = invoice_row["period_start"]
    period_end = invoice_row["period_end"]
    start_str = period_start.strftime("%d/%m/%Y") if hasattr(period_start, "strftime") else str(period_start)
    end_str = period_end.strftime("%d/%m/%Y") if hasattr(period_end, "strftime") else str(period_end)

    title = f"Nhắc học phí tháng {billing_month:02d}/{billing_year} · {invoice_row['student_name']}"
    body = (
        f"Kính gửi Quý Phụ huynh em {invoice_row['student_name']} "
        f"({invoice_row['student_code']} · Lớp {invoice_row['class_name']}), "
        f"khoản thu học phí kỳ {start_str}–{end_str} có tổng phải đóng "
        f"{format_vnd_amount(invoice_row['amount_due'])}, đã xác nhận đóng "
        f"{format_vnd_amount(invoice_row['amount_paid'])}, số tiền còn thiếu "
        f"{format_vnd_amount(invoice_row['amount_remaining'])}. "
        f"Hạn thanh toán: {end_str}. "
        f"Mọi khoản thanh toán được thực hiện ngoài hệ thống trực tiếp với giáo viên/trung tâm."
    )
    if custom_note and custom_note.strip():
        body += f" Ghi chú từ giáo viên: {custom_note.strip()}"
    return title, body


@app.get("/api/tuition/summary")
def tuition_summary(
    connection: Connection,
    user: Annotated[dict, Depends(current_user)],
    class_id: str | None = None,
    student_code: str | None = None,
    billing_year: int | None = None,
    billing_month: int | None = None,
):
    if user["role"] == "teacher":
        if class_id:
            require_class_teacher(connection, class_id, user["user_id"])

        available_periods = fetch_all(
            connection,
            """
            SELECT DISTINCT i.billing_year, i.billing_month
            FROM tuition_invoices i
            JOIN classes c ON c.class_id = i.class_id
            WHERE i.status = 'open' AND c.teacher_user_id = %s
            ORDER BY i.billing_year DESC, i.billing_month DESC
            """,
            (user["user_id"],),
        )

        where = ["i.status = 'open'", "c.teacher_user_id = %s"]
        params: list[Any] = [user["user_id"]]
        if class_id:
            where.append("i.class_id = %s")
            params.append(class_id)
        if student_code:
            where.append("s.student_code = %s")
            params.append(student_code)
        if billing_year is not None:
            where.append("i.billing_year = %s")
            params.append(billing_year)
        if billing_month is not None:
            where.append("i.billing_month = %s")
            params.append(billing_month)

        where_sql = " AND ".join(where)
        totals = fetch_one(
            connection,
            f"""
            SELECT
              COALESCE(SUM(v.amount_due), 0)::numeric(12,2) AS total_amount_due,
              COALESCE(SUM(v.amount_paid), 0)::numeric(12,2) AS total_amount_paid,
              COALESCE(SUM(v.amount_remaining), 0)::numeric(12,2) AS total_amount_remaining,
              COUNT(v.invoice_id) AS invoice_count,
              COUNT(DISTINCT v.student_id) AS student_count,
              COUNT(DISTINCT v.class_id) AS class_count,
              COUNT(v.invoice_id) FILTER (WHERE v.payment_status = 'paid') AS paid_count,
              COUNT(v.invoice_id) FILTER (WHERE v.payment_status = 'partial') AS partial_count,
              COUNT(v.invoice_id) FILTER (WHERE v.payment_status = 'unpaid') AS unpaid_count,
              COUNT(v.invoice_id) FILTER (WHERE v.payment_status IN ('partial', 'unpaid')) AS debt_count,
              MIN(i.period_end) FILTER (WHERE v.amount_remaining > 0) AS nearest_due_date,
              MAX(i.period_end) AS latest_period_end
            FROM v_tuition_invoice_balances v
            JOIN tuition_invoices i ON i.invoice_id = v.invoice_id
            JOIN students s ON s.student_id = i.student_id
            JOIN classes c ON c.class_id = i.class_id
            WHERE {where_sql}
            """,
            tuple(params),
        )

        due_val = float(totals["total_amount_due"] or 0)
        paid_val = float(totals["total_amount_paid"] or 0)
        progress_pct = round((paid_val / due_val) * 100, 1) if due_val > 0 else 0.0

        class_breakdown = fetch_all(
            connection,
            """
            SELECT
              c.class_id,
              c.class_code,
              c.name AS class_name,
              c.subject,
              c.monthly_fee,
              c.status AS class_status,
              (
                SELECT COUNT(DISTINCT ce.student_id)
                FROM class_enrollments ce
                WHERE ce.class_id = c.class_id AND ce.status = 'active'
              ) AS enrolled_count,
              COUNT(v.invoice_id) AS invoice_count,
              COALESCE(SUM(v.amount_due), 0)::numeric(12,2) AS total_amount_due,
              COALESCE(SUM(v.amount_paid), 0)::numeric(12,2) AS total_amount_paid,
              COALESCE(SUM(v.amount_remaining), 0)::numeric(12,2) AS total_amount_remaining,
              COUNT(v.invoice_id) FILTER (WHERE v.payment_status = 'paid') AS paid_count,
              COUNT(v.invoice_id) FILTER (WHERE v.payment_status = 'partial') AS partial_count,
              COUNT(v.invoice_id) FILTER (WHERE v.payment_status = 'unpaid') AS unpaid_count,
              COUNT(v.invoice_id) FILTER (WHERE v.payment_status IN ('partial', 'unpaid')) AS debt_count
            FROM classes c
            LEFT JOIN tuition_invoices i
              ON i.class_id = c.class_id
              AND i.status = 'open'
              AND (%s::int IS NULL OR i.billing_year = %s)
              AND (%s::int IS NULL OR i.billing_month = %s)
            LEFT JOIN v_tuition_invoice_balances v ON v.invoice_id = i.invoice_id
            WHERE c.teacher_user_id = %s
              AND (%s::varchar IS NULL OR c.class_id = %s)
            GROUP BY c.class_id
            ORDER BY c.class_code
            """,
            (
                billing_year,
                billing_year,
                billing_month,
                billing_month,
                user["user_id"],
                class_id,
                class_id,
            ),
        )

        watchlist = fetch_all(
            connection,
            f"""
            SELECT
              v.invoice_id,
              v.billing_year,
              v.billing_month,
              v.amount_due,
              v.amount_paid,
              v.amount_remaining,
              v.payment_status,
              s.student_code,
              u.full_name AS student_name,
              c.class_id,
              c.class_code,
              c.name AS class_name,
              i.period_start,
              i.period_end,
              i.sessions_count
            FROM v_tuition_invoice_balances v
            JOIN tuition_invoices i ON i.invoice_id = v.invoice_id
            JOIN students s ON s.student_id = i.student_id
            JOIN users u ON u.user_id = s.user_id
            JOIN classes c ON c.class_id = i.class_id
            WHERE {where_sql} AND v.amount_remaining > 0
            ORDER BY v.amount_remaining DESC, i.period_end ASC, u.full_name ASC
            LIMIT 25
            """,
            tuple(params),
        )

        return {
            "role": "teacher",
            "totals": {**totals, "progress_percent": progress_pct},
            "available_periods": available_periods,
            "class_breakdown": class_breakdown,
            "watchlist": watchlist,
        }

    # Student or Parent summary
    if user["role"] == "student":
        st = require_student_id(connection, user["user_id"])
        if student_code and student_code != st["student_code"]:
            raise HTTPException(status_code=403, detail="Bạn chỉ được xem dữ liệu học phí của mình.")
        all_student_ids = [st["student_id"]]
        target_student_ids = [st["student_id"]]
    else:
        all_student_ids = linked_student_ids(connection, user["user_id"])
        if student_code:
            checked = can_view_student(connection, user, student_code)
            target_student_ids = [checked["student_id"]]
        else:
            target_student_ids = all_student_ids

    if not all_student_ids:
        return {
            "role": user["role"],
            "children": [],
            "available_periods": [],
            "totals": {
                "total_amount_due": 0,
                "total_amount_paid": 0,
                "total_amount_remaining": 0,
                "invoice_count": 0,
                "paid_count": 0,
                "partial_count": 0,
                "unpaid_count": 0,
                "debt_count": 0,
                "payment_count": 0,
                "progress_percent": 0.0,
                "nearest_due_date": None,
                "latest_period_end": None,
            },
        }

    children = fetch_all(
        connection,
        """
        SELECT
          s.student_id,
          s.student_code,
          u.full_name,
          u.avatar_text,
          c.class_id,
          c.class_code,
          c.name AS class_name,
          c.subject,
          t.full_name AS teacher_name,
          t.phone AS teacher_phone,
          t.email AS teacher_email
        FROM students s
        JOIN users u ON u.user_id = s.user_id
        LEFT JOIN LATERAL (
          SELECT ce.class_id
          FROM class_enrollments ce
          WHERE ce.student_id = s.student_id AND ce.status = 'active'
          ORDER BY ce.enrolled_on DESC LIMIT 1
        ) active_ce ON TRUE
        LEFT JOIN classes c ON c.class_id = active_ce.class_id
        LEFT JOIN users t ON t.user_id = c.teacher_user_id
        WHERE s.student_id = ANY(%s)
        ORDER BY u.full_name
        """,
        (all_student_ids,),
    )

    available_periods = fetch_all(
        connection,
        """
        SELECT DISTINCT i.billing_year, i.billing_month
        FROM tuition_invoices i
        WHERE i.status = 'open' AND i.student_id = ANY(%s)
        ORDER BY i.billing_year DESC, i.billing_month DESC
        """,
        (target_student_ids,),
    )

    where = ["i.status = 'open'", "i.student_id = ANY(%s)"]
    params = [target_student_ids]
    if class_id:
        where.append("i.class_id = %s")
        params.append(class_id)
    if billing_year is not None:
        where.append("i.billing_year = %s")
        params.append(billing_year)
    if billing_month is not None:
        where.append("i.billing_month = %s")
        params.append(billing_month)

    where_sql = " AND ".join(where)
    totals = fetch_one(
        connection,
        f"""
        SELECT
          COALESCE(SUM(v.amount_due), 0)::numeric(12,2) AS total_amount_due,
          COALESCE(SUM(v.amount_paid), 0)::numeric(12,2) AS total_amount_paid,
          COALESCE(SUM(v.amount_remaining), 0)::numeric(12,2) AS total_amount_remaining,
          COUNT(v.invoice_id) AS invoice_count,
          COUNT(v.invoice_id) FILTER (WHERE v.payment_status = 'paid') AS paid_count,
          COUNT(v.invoice_id) FILTER (WHERE v.payment_status = 'partial') AS partial_count,
          COUNT(v.invoice_id) FILTER (WHERE v.payment_status = 'unpaid') AS unpaid_count,
          COUNT(v.invoice_id) FILTER (WHERE v.payment_status IN ('partial', 'unpaid')) AS debt_count,
          MIN(i.period_end) FILTER (WHERE v.amount_remaining > 0) AS nearest_due_date,
          MAX(i.period_end) AS latest_period_end,
          (
            SELECT COUNT(*)
            FROM tuition_payments p
            JOIN tuition_invoices inv2 ON inv2.invoice_id = p.invoice_id
            WHERE inv2.invoice_id IN (
              SELECT i2.invoice_id
              FROM tuition_invoices i2
              WHERE {where_sql.replace('i.', 'i2.')}
            )
          ) AS payment_count
        FROM v_tuition_invoice_balances v
        JOIN tuition_invoices i ON i.invoice_id = v.invoice_id
        WHERE {where_sql}
        """,
        tuple(params + params),
    )

    due_val = float(totals["total_amount_due"] or 0)
    paid_val = float(totals["total_amount_paid"] or 0)
    progress_pct = round((paid_val / due_val) * 100, 1) if due_val > 0 else 0.0

    return {
        "role": user["role"],
        "children": children,
        "available_periods": available_periods,
        "totals": {**totals, "progress_percent": progress_pct},
    }


@app.get("/api/tuition/payments")
def list_tuition_payments(
    connection: Connection,
    user: Annotated[dict, Depends(current_user)],
    class_id: str | None = None,
    student_code: str | None = None,
    billing_year: int | None = None,
    billing_month: int | None = None,
    payment_method: str | None = None,
):
    where = ["i.status = 'open'"]
    params: list[Any] = []
    if user["role"] == "teacher":
        where.append("c.teacher_user_id = %s")
        params.append(user["user_id"])
    elif user["role"] == "student":
        student = require_student_id(connection, user["user_id"])
        if student_code and student_code != student["student_code"]:
            raise HTTPException(status_code=403, detail="Bạn chỉ được xem lịch sử học phí của mình.")
        where.append("i.student_id = %s")
        params.append(student["student_id"])
    else:
        ids = linked_student_ids(connection, user["user_id"])
        if student_code:
            checked = can_view_student(connection, user, student_code)
            ids = [checked["student_id"]]
        if not ids:
            return []
        where.append("i.student_id = ANY(%s)")
        params.append(ids)

    for column, value in (
        ("i.class_id", class_id),
        ("s.student_code", student_code),
        ("i.billing_year", billing_year),
        ("i.billing_month", billing_month),
        ("p.payment_method", payment_method),
    ):
        if value is not None:
            where.append(f"{column} = %s")
            params.append(value)

    return fetch_all(
        connection,
        f"""
        SELECT
          p.payment_id,
          p.invoice_id,
          p.amount,
          p.payment_method,
          p.paid_at,
          p.reference_code,
          p.note,
          p.created_at,
          rec.full_name AS recorded_by_name,
          i.billing_year,
          i.billing_month,
          i.period_start,
          i.period_end,
          s.student_code,
          stu_u.full_name AS student_name,
          c.class_id,
          c.class_code,
          c.name AS class_name
        FROM tuition_payments p
        JOIN tuition_invoices i ON i.invoice_id = p.invoice_id
        JOIN students s ON s.student_id = i.student_id
        JOIN users stu_u ON stu_u.user_id = s.user_id
        JOIN classes c ON c.class_id = i.class_id
        JOIN users rec ON rec.user_id = p.recorded_by
        WHERE {' AND '.join(where)}
        ORDER BY p.paid_at DESC, p.payment_id DESC
        LIMIT 200
        """,
        tuple(params),
    )


@app.get("/api/tuition/invoices/{invoice_id}")
def get_tuition_invoice_detail(
    invoice_id: str,
    connection: Connection,
    user: Annotated[dict, Depends(current_user)],
):
    row = fetch_one(
        connection,
        """
        SELECT
          v.invoice_id,
          v.student_id,
          v.class_id,
          v.billing_year,
          v.billing_month,
          v.amount_due,
          v.amount_paid,
          v.amount_remaining,
          v.payment_status,
          i.period_start,
          i.period_end,
          i.sessions_count,
          i.note,
          i.issued_at,
          i.status,
          issuer.full_name AS issued_by_name,
          s.student_code,
          stu_u.full_name AS student_name,
          stu_u.email AS student_email,
          stu_u.phone AS student_phone,
          c.class_code,
          c.name AS class_name,
          c.subject,
          c.monthly_fee,
          c.teacher_user_id,
          teacher_u.full_name AS teacher_name,
          teacher_u.phone AS teacher_phone,
          teacher_u.email AS teacher_email,
          parent_info.parent_name,
          parent_info.parent_phone,
          parent_info.parent_email,
          parent_info.relationship
        FROM v_tuition_invoice_balances v
        JOIN tuition_invoices i ON i.invoice_id = v.invoice_id
        JOIN students s ON s.student_id = i.student_id
        JOIN users stu_u ON stu_u.user_id = s.user_id
        JOIN classes c ON c.class_id = i.class_id
        JOIN users teacher_u ON teacher_u.user_id = c.teacher_user_id
        JOIN users issuer ON issuer.user_id = i.issued_by
        LEFT JOIN LATERAL (
          SELECT p.full_name AS parent_name, p.phone AS parent_phone,
                 p.email AS parent_email, sp.relationship
          FROM student_parents sp
          JOIN parents p ON p.parent_id = sp.parent_id
          WHERE sp.student_id = s.student_id
          ORDER BY sp.is_primary DESC, sp.linked_at ASC
          LIMIT 1
        ) parent_info ON TRUE
        WHERE i.invoice_id = %s
        """,
        (invoice_id,),
    )
    if not row:
        raise HTTPException(status_code=404, detail="Không tìm thấy hóa đơn học phí.")

    allowed = user["role"] == "teacher" and row["teacher_user_id"] == user["user_id"]
    if user["role"] == "student":
        allowed = require_student_id(connection, user["user_id"])["student_id"] == row["student_id"]
    elif user["role"] == "parent":
        allowed = row["student_id"] in linked_student_ids(connection, user["user_id"])
    if not allowed:
        raise HTTPException(status_code=403, detail="Bạn không có quyền xem hóa đơn học phí này.")

    payments = fetch_all(
        connection,
        """
        SELECT p.payment_id, p.amount, p.payment_method, p.paid_at,
               p.reference_code, p.note, p.created_at, u.full_name AS recorded_by_name
        FROM tuition_payments p
        JOIN users u ON u.user_id = p.recorded_by
        WHERE p.invoice_id = %s
        ORDER BY p.paid_at DESC, p.payment_id DESC
        """,
        (invoice_id,),
    )

    sessions = fetch_all(
        connection,
        """
        SELECT cs.session_id, cs.starts_at, cs.ends_at, cs.room, cs.topic,
               cs.status AS session_status,
               ar.status AS attendance_status, ar.note AS attendance_note
        FROM class_sessions cs
        LEFT JOIN attendance_records ar
          ON ar.session_id = cs.session_id AND ar.student_id = %s
        WHERE cs.class_id = %s
          AND cs.status <> 'cancelled'
          AND cs.starts_at::date BETWEEN %s AND %s
        ORDER BY cs.starts_at ASC
        """,
        (row["student_id"], row["class_id"], row["period_start"], row["period_end"]),
    )

    due_val = float(row["amount_due"] or 0)
    paid_val = float(row["amount_paid"] or 0)
    progress_pct = round((paid_val / due_val) * 100, 1) if due_val > 0 else 100.0

    invoice_data = dict(row)
    invoice_data.pop("teacher_user_id", None)
    invoice_data["progress_percent"] = progress_pct
    invoice_data["payment_count"] = len(payments)

    return {
        "invoice": invoice_data,
        "payments": payments,
        "sessions": sessions,
    }


@app.post("/api/tuition/invoices/{invoice_id}/remind")
def remind_tuition_invoice(
    invoice_id: str,
    payload: TuitionReminderRequest,
    connection: Connection,
    teacher: Teacher,
):
    invoice = fetch_one(
        connection,
        """
        SELECT
          v.invoice_id, v.student_id, v.billing_year, v.billing_month,
          v.amount_due, v.amount_paid, v.amount_remaining, v.payment_status,
          i.period_start, i.period_end,
          s.student_code, s.user_id AS student_user_id,
          stu_u.full_name AS student_name,
          c.name AS class_name, c.class_code
        FROM v_tuition_invoice_balances v
        JOIN tuition_invoices i ON i.invoice_id = v.invoice_id
        JOIN students s ON s.student_id = i.student_id
        JOIN users stu_u ON stu_u.user_id = s.user_id
        JOIN classes c ON c.class_id = i.class_id
        WHERE i.invoice_id = %s AND i.status = 'open' AND c.teacher_user_id = %s
        """,
        (invoice_id, teacher["user_id"]),
    )
    if not invoice:
        raise HTTPException(status_code=404, detail="Không tìm thấy khoản thu học phí.")
    if float(invoice["amount_remaining"] or 0) <= 0:
        raise HTTPException(status_code=400, detail="Khoản thu này đã đóng đủ, không cần gửi nhắc phí.")

    parent_rows = fetch_all(
        connection,
        """
        SELECT DISTINCT p.user_id
        FROM student_parents sp
        JOIN parents p ON p.parent_id = sp.parent_id
        WHERE sp.student_id = %s AND p.user_id IS NOT NULL
        """,
        (invoice["student_id"],),
    )
    recipient_ids = [r["user_id"] for r in parent_rows]
    if payload.include_student and invoice["student_user_id"]:
        recipient_ids.append(invoice["student_user_id"])
    elif not recipient_ids and invoice["student_user_id"]:
        recipient_ids.append(invoice["student_user_id"])

    unique_recipients = list(dict.fromkeys(recipient_ids))
    if not unique_recipients:
        raise HTTPException(
            status_code=400,
            detail="Học sinh này chưa có tài khoản phụ huynh hoặc học sinh liên kết để nhận thông báo.",
        )

    title, body = build_tuition_reminder_message(invoice, payload.custom_note)
    with transaction(connection):
        for recipient_id in unique_recipients:
            create_notification(
                connection,
                recipient_id,
                title,
                body,
                "tuition",
                invoice_id,
            )

    return {
        "invoice_id": invoice_id,
        "sent_count": len(unique_recipients),
        "title": title,
    }


@app.post("/api/tuition/reminders/send")
def send_bulk_tuition_reminders(
    payload: BulkTuitionReminderRequest,
    connection: Connection,
    teacher: Teacher,
):
    if payload.class_id:
        require_class_teacher(connection, payload.class_id, teacher["user_id"])

    where = ["i.status = 'open'", "c.teacher_user_id = %s", "v.amount_remaining > 0"]
    params: list[Any] = [teacher["user_id"]]
    if payload.class_id:
        where.append("i.class_id = %s")
        params.append(payload.class_id)
    if payload.billing_year is not None:
        where.append("i.billing_year = %s")
        params.append(payload.billing_year)
    if payload.billing_month is not None:
        where.append("i.billing_month = %s")
        params.append(payload.billing_month)

    unpaid_invoices = fetch_all(
        connection,
        f"""
        SELECT
          v.invoice_id, v.student_id, v.billing_year, v.billing_month,
          v.amount_due, v.amount_paid, v.amount_remaining, v.payment_status,
          i.period_start, i.period_end,
          s.student_code, s.user_id AS student_user_id,
          stu_u.full_name AS student_name,
          c.name AS class_name, c.class_code
        FROM v_tuition_invoice_balances v
        JOIN tuition_invoices i ON i.invoice_id = v.invoice_id
        JOIN students s ON s.student_id = i.student_id
        JOIN users stu_u ON stu_u.user_id = s.user_id
        JOIN classes c ON c.class_id = i.class_id
        WHERE {' AND '.join(where)}
        ORDER BY u_order.full_name
        """.replace("ORDER BY u_order.full_name", "ORDER BY stu_u.full_name"),
        tuple(params),
    )

    if not unpaid_invoices:
        return {"invoices_reminded": 0, "sent_count": 0}

    sent_count = 0
    reminded_invoices = 0
    with transaction(connection):
        for inv in unpaid_invoices:
            parent_rows = fetch_all(
                connection,
                """
                SELECT DISTINCT p.user_id
                FROM student_parents sp
                JOIN parents p ON p.parent_id = sp.parent_id
                WHERE sp.student_id = %s AND p.user_id IS NOT NULL
                """,
                (inv["student_id"],),
            )
            recipients = [r["user_id"] for r in parent_rows]
            if payload.include_student and inv["student_user_id"]:
                recipients.append(inv["student_user_id"])
            elif not recipients and inv["student_user_id"]:
                recipients.append(inv["student_user_id"])

            unique_recipients = list(dict.fromkeys(recipients))
            if not unique_recipients:
                continue

            title, body = build_tuition_reminder_message(inv, payload.custom_note)
            for recipient_id in unique_recipients:
                create_notification(
                    connection,
                    recipient_id,
                    title,
                    body,
                    "tuition",
                    inv["invoice_id"],
                )
                sent_count += 1
            reminded_invoices += 1

    return {
        "invoices_reminded": reminded_invoices,
        "sent_count": sent_count,
    }
