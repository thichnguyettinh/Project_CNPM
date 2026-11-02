from datetime import date, datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from .security import password_policy_errors


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class LoginRequest(StrictModel):
    identity: str = Field(min_length=1, max_length=254)
    password: str = Field(min_length=1, max_length=256)


class UserCreate(StrictModel):
    username: str = Field(min_length=3, max_length=50)
    email: str | None = Field(default=None, max_length=254)
    full_name: str = Field(min_length=1, max_length=150)
    phone: str | None = Field(default=None, max_length=30)
    role: Literal["student", "parent"]
    password: str = Field(min_length=8, max_length=128)
    student_code: str | None = Field(default=None, max_length=30)
    linked_student_code: str | None = Field(default=None, max_length=30)
    relationship: str | None = Field(default=None, max_length=40)

    @model_validator(mode="after")
    def role_fields_match(self):
        if self.role == "student" and not self.student_code:
            raise ValueError("Tài khoản học sinh cần mã học sinh.")
        if self.role == "parent" and not self.linked_student_code:
            raise ValueError("Tài khoản phụ huynh cần mã học sinh được liên kết.")
        password_errors = password_policy_errors(self.password)
        if password_errors:
            raise ValueError("Mật khẩu cần đáp ứng: " + ", ".join(password_errors) + ".")
        return self


class UserUpdate(StrictModel):
    full_name: str | None = Field(default=None, min_length=1, max_length=150)
    email: str | None = Field(default=None, max_length=254)
    phone: str | None = Field(default=None, max_length=30)
    status: Literal["active", "inactive", "locked"] | None = None


class ParentLinkCreate(StrictModel):
    student_code: str = Field(min_length=1, max_length=30)
    relationship: str | None = Field(default=None, max_length=40)


class UserPasswordReset(StrictModel):
    new_password: str = Field(min_length=8, max_length=128)

    @model_validator(mode="after")
    def validate_password_policy(self):
        password_errors = password_policy_errors(self.new_password)
        if password_errors:
            raise ValueError("Mật khẩu cần đáp ứng: " + ", ".join(password_errors) + ".")
        return self


class PasswordChange(StrictModel):
    current_password: str = Field(min_length=1, max_length=256)
    new_password: str = Field(min_length=8, max_length=128)

    @model_validator(mode="after")
    def validate_password_policy(self):
        password_errors = password_policy_errors(self.new_password)
        if password_errors:
            raise ValueError("Mật khẩu cần đáp ứng: " + ", ".join(password_errors) + ".")
        return self


class ProfileUpdate(StrictModel):
    full_name: str | None = Field(default=None, min_length=1, max_length=150)
    email: str | None = Field(default=None, max_length=254)
    phone: str | None = Field(default=None, max_length=30)
    date_of_birth: date | None = None
    address: str | None = Field(default=None, max_length=255)
    biography: str | None = None


class ClassCreate(StrictModel):
    class_code: str = Field(min_length=2, max_length=30)
    name: str = Field(min_length=1, max_length=150)
    subject: str = Field(min_length=1, max_length=100)
    monthly_fee: Decimal = Field(ge=0, max_digits=12, decimal_places=2)
    default_room: str | None = Field(default=None, max_length=100)
    description: str | None = None
    schedule_info: str | None = None
    status: Literal["planned", "active"] = "active"


class ClassUpdate(StrictModel):
    name: str | None = Field(default=None, min_length=1, max_length=150)
    subject: str | None = Field(default=None, min_length=1, max_length=100)
    monthly_fee: Decimal | None = Field(default=None, ge=0, max_digits=12, decimal_places=2)
    default_room: str | None = Field(default=None, max_length=100)
    description: str | None = None
    schedule_info: str | None = None
    status: Literal["planned", "active", "completed", "archived"] | None = None


class EnrollmentCreate(StrictModel):
    student_code: str = Field(min_length=1, max_length=30)
    enrolled_on: date = Field(default_factory=date.today)


class SessionCreate(StrictModel):
    class_id: str = Field(min_length=1, max_length=36)
    starts_at: datetime
    ends_at: datetime
    room: str | None = Field(default=None, max_length=100)
    topic: str | None = Field(default=None, max_length=255)

    @model_validator(mode="after")
    def validate_order(self):
        if self.ends_at <= self.starts_at:
            raise ValueError("Thời điểm kết thúc phải sau thời điểm bắt đầu.")
        return self


class SessionUpdate(StrictModel):
    starts_at: datetime | None = None
    ends_at: datetime | None = None
    room: str | None = Field(default=None, max_length=100)
    topic: str | None = Field(default=None, max_length=255)
    status: Literal["scheduled", "completed", "cancelled"] | None = None


class AttendanceEntry(StrictModel):
    student_code: str = Field(min_length=1, max_length=30)
    status: Literal["present", "absent", "late", "excused"]
    note: str | None = Field(default=None, max_length=500)


class AttendanceSave(StrictModel):
    records: list[AttendanceEntry] = Field(min_length=1, max_length=500)


class AssignmentCreate(StrictModel):
    class_id: str = Field(min_length=1, max_length=36)
    title: str = Field(min_length=1, max_length=200)
    assignment_type: str = Field(min_length=1, max_length=50)
    description: str | None = None
    assigned_at: date = Field(default_factory=date.today)
    due_at: datetime | None = None
    status: Literal["draft", "published"] = "published"


class AssignmentUpdate(StrictModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    assignment_type: str | None = Field(default=None, min_length=1, max_length=50)
    description: str | None = None
    assigned_at: date | None = None
    due_at: datetime | None = None
    status: Literal["draft", "published", "closed"] | None = None


class ResultEntry(StrictModel):
    student_code: str = Field(min_length=1, max_length=30)
    score: Decimal | None = Field(default=None, ge=0, le=10, max_digits=4, decimal_places=2)
    teacher_comment: str | None = None
    change_reason: str | None = Field(default=None, max_length=500)

    @model_validator(mode="after")
    def validate_half_points(self):
        if self.score is not None and self.score * 2 != (self.score * 2).to_integral_value():
            raise ValueError("Điểm phải theo bước 0,5.")
        return self


class ResultsSave(StrictModel):
    results: list[ResultEntry] = Field(min_length=1, max_length=500)


class QuestionScoreEntry(StrictModel):
    question_no: int = Field(ge=1, le=100)
    max_score: Decimal = Field(gt=0, le=10, max_digits=4, decimal_places=2)
    earned_score: Decimal = Field(ge=0, le=10, max_digits=4, decimal_places=2)

    @model_validator(mode="after")
    def validate_question_score(self):
        if self.earned_score > self.max_score:
            raise ValueError("Điểm đạt không được vượt điểm tối đa của câu.")
        for value in (self.earned_score, self.max_score):
            if value * 2 != (value * 2).to_integral_value():
                raise ValueError("Điểm từng câu phải theo bước 0,5.")
        return self


class QuestionScoresSave(StrictModel):
    questions: list[QuestionScoreEntry] = Field(min_length=1, max_length=100)

    @model_validator(mode="after")
    def unique_questions(self):
        numbers = [q.question_no for q in self.questions]
        if len(numbers) != len(set(numbers)):
            raise ValueError("Không được trùng số câu.")
        return self


class InvoiceGenerate(StrictModel):
    class_id: str = Field(min_length=1, max_length=36)
    billing_year: int = Field(ge=2000, le=2200)
    billing_month: int = Field(ge=1, le=12)
    period_start: date
    period_end: date
    amount_due: Decimal | None = Field(default=None, ge=0, max_digits=12, decimal_places=2)
    charge_per_session: Decimal | None = Field(default=None, ge=0, max_digits=12, decimal_places=2)
    note: str | None = Field(default=None, max_length=500)

    @model_validator(mode="after")
    def validate_invoice(self):
        if self.period_end < self.period_start:
            raise ValueError("Ngày kết thúc kỳ thu phải sau ngày bắt đầu.")
        if (self.amount_due is None) == (self.charge_per_session is None):
            raise ValueError("Cần cung cấp chính xác một trong amount_due hoặc charge_per_session.")
        return self


class PaymentCreate(StrictModel):
    amount: Decimal = Field(gt=0, max_digits=12, decimal_places=2)
    payment_method: Literal["cash", "bank_transfer", "other"]
    paid_at: datetime = Field(default_factory=datetime.now)
    reference_code: str | None = Field(default=None, max_length=100)
    note: str | None = Field(default=None, max_length=500)


class TuitionReminderRequest(StrictModel):
    custom_note: str | None = Field(default=None, max_length=500)
    include_student: bool = False


class BulkTuitionReminderRequest(StrictModel):
    class_id: str | None = Field(default=None, max_length=36)
    billing_year: int | None = Field(default=None, ge=2000, le=2200)
    billing_month: int | None = Field(default=None, ge=1, le=12)
    custom_note: str | None = Field(default=None, max_length=500)
    include_student: bool = False
