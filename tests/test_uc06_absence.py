"""UC-06 request permissions; mocking DB access (never touches PostgreSQL)."""
import sys
import types
from contextlib import nullcontext
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import patch

import pytest
from fastapi import HTTPException
from pydantic import ValidationError

# CI/dev host can run these route-level unit tests without a PostgreSQL driver.
try:
    import psycopg
except ModuleNotFoundError:
    psycopg = types.ModuleType('psycopg')
    psycopg.Connection = type('Connection', (), {})
    psycopg.Error = type('Error', (Exception,), {})
    psycopg.IntegrityError = type('IntegrityError', (psycopg.Error,), {})
    psycopg.connect = lambda *args, **kwargs: None
    rows = types.ModuleType('psycopg.rows')
    rows.dict_row = object()
    sys.modules['psycopg'] = psycopg
    sys.modules['psycopg.rows'] = rows

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from backend.app import main
from backend.app.schemas import AbsenceRequestCreate

STUDENT = {'user_id': 'S1', 'role': 'student'}
PARENT = {'user_id': 'P1', 'role': 'parent'}
TEACHER = {'user_id': 'T1', 'role': 'teacher'}
FUTURE = datetime.now(timezone.utc) + timedelta(days=3)


def fake_db(sql, params=()):
    if 'FROM class_sessions cs' in sql:
        return {'session_id': 5, 'class_id': 'C1', 'starts_at': FUTURE,
                'status': 'scheduled', 'class_name': 'Toán 10', 'teacher_user_id': 'T1'}
    if 'FROM students s JOIN users u' in sql:
        return {'student_id': 1, 'student_code': 'HS001', 'full_name': 'Học sinh 1'}
    if 'FROM students s JOIN users u' in sql and 'student_code' in sql:
        return {'student_id': 1, 'student_code': 'HS001', 'user_id': 'S1'}
    if 'FROM class_enrollments' in sql:
        return {'exists': 1}
    if 'INSERT INTO absence_requests' in sql:
        return {'request_id': 7, 'session_id': 5, 'student_id': 1,
                'requested_by': 'S1', 'reason': 'Bị ốm', 'status': 'pending',
                'created_at': FUTURE}
    raise AssertionError('Unexpected query ' + sql[:90])


@pytest.fixture
def stub_db():
    with patch.object(main, 'transaction', lambda conn: nullcontext()), \
         patch.object(main, 'fetch_one', side_effect=lambda conn, query, params=(): fake_db(query, params)) as fetch, \
         patch.object(main, 'create_notification') as notification:
        yield fetch, notification


def test_student_can_submit_for_own_session(stub_db):
    fetch, notification = stub_db
    result = main.submit_absence_request(5, AbsenceRequestCreate(reason='  Bị ốm  '), object(), STUDENT)
    assert result['request_id'] == 7 and result['student_code'] == 'HS001'
    assert result['reason'] == 'Bị ốm'
    notification.assert_called_once()
    assert notification.call_args.args[1] == 'T1'
    assert any('INSERT INTO absence_requests' in call.args[1] for call in fetch.call_args_list)


def test_student_cannot_impersonate_another_student(stub_db):
    with pytest.raises(HTTPException) as exc:
        main.submit_absence_request(5, AbsenceRequestCreate(reason='Bị ốm', student_code='HS004'), object(), STUDENT)
    assert exc.value.status_code == 403


def test_parent_cannot_submit_unlinked_child(stub_db):
    with patch.object(main, 'can_view_student', side_effect=HTTPException(status_code=403, detail='Không liên kết')):
        with pytest.raises(HTTPException) as exc:
            main.submit_absence_request(5, AbsenceRequestCreate(reason='Bị ốm', student_code='HS004'), object(), PARENT)
        assert exc.value.status_code == 403


def test_parent_can_submit_for_linked_child(stub_db):
    with patch.object(main, 'can_view_student', return_value={
        'student_id': 1, 'student_code': 'HS001', 'user_id': 'S1'
    }):
        result = main.submit_absence_request(5, AbsenceRequestCreate(reason='Bị ốm', student_code='HS001'), object(), PARENT)
        assert result['student_code'] == 'HS001'


def test_parent_must_choose_child(stub_db):
    with pytest.raises(HTTPException) as exc:
        main.submit_absence_request(5, AbsenceRequestCreate(reason='Bị ốm'), object(), PARENT)
    assert exc.value.status_code == 422


def test_past_session_rejected(stub_db):
    original = main.fetch_one
    def past(conn, query, params=()):
        result = original(conn, query, params)
        if 'FROM class_sessions cs' in query:
            return {**result, 'starts_at': datetime.now(timezone.utc) - timedelta(hours=1)}
        return result
    with patch.object(main, 'fetch_one', side_effect=past):
        with pytest.raises(HTTPException) as exc:
            main.submit_absence_request(5, AbsenceRequestCreate(reason='Bị ốm'), object(), STUDENT)
        assert exc.value.status_code == 400


def test_duplicate_request_rejected(stub_db):
    original = main.fetch_one
    def duplicate(conn, query, params=()):
        if 'INSERT INTO absence_requests' in query:
            return None
        return original(conn, query, params)
    with patch.object(main, 'fetch_one', side_effect=duplicate):
        with pytest.raises(HTTPException) as exc:
            main.submit_absence_request(5, AbsenceRequestCreate(reason='Bị ốm'), object(), STUDENT)
        assert exc.value.status_code == 409


def test_parent_cannot_read_unlinked_child():
    with patch.object(main, 'can_view_student', side_effect=HTTPException(status_code=403, detail='Không liên kết')):
        with pytest.raises(HTTPException) as exc:
            main.list_absence_requests(object(), PARENT, session_id=5, student_code='HS004')
    assert exc.value.status_code == 403


def test_student_cannot_read_other_student(stub_db):
    with pytest.raises(HTTPException) as exc:
        main.list_absence_requests(object(), STUDENT, session_id=5, student_code='HS004')
    assert exc.value.status_code == 403


def test_teacher_list_is_scoped_to_own_classes():
    with patch.object(main, 'fetch_all', return_value=[]) as fetch:
        assert main.list_absence_requests(object(), TEACHER, session_id=5) == []
        query = fetch.call_args.args[1]
        assert 'c.teacher_user_id = %s' in query
        assert fetch.call_args.args[2] == ('T1', 5)


def test_blank_reason_rejected():
    with pytest.raises(ValidationError):
        AbsenceRequestCreate(reason='  ')


def test_overlong_reason_rejected():
    with pytest.raises(ValidationError):
        AbsenceRequestCreate(reason='a' * 501)


def test_unexpected_body_field_rejected():
    with pytest.raises(ValidationError):
        AbsenceRequestCreate(reason='Bị ốm', status='approved')
