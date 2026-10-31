"""Schema validation test. Can run without PostgreSQL or psycopg."""
import importlib.util
import sys
from pathlib import Path
from types import ModuleType

BASE = Path(__file__).resolve().parents[1]
base_source = Path(__file__).resolve().parents[1] / 'backend/app'
orig_source = base_source
for mod in ['backend', 'backend.app']:
    p = ModuleType(mod)
    p.__path__ = [str(base_source if mod == 'backend.app' else base_source.parent)]
    sys.modules[mod] = p

spec = importlib.util.spec_from_file_location('backend.app.security', orig_source / 'security.py')
security = importlib.util.module_from_spec(spec)
sys.modules['backend.app.security'] = security
spec.loader.exec_module(security)
spec = importlib.util.spec_from_file_location('backend.app.schemas', base_source / 'schemas.py')
schemas = importlib.util.module_from_spec(spec)
sys.modules['backend.app.schemas'] = schemas
spec.loader.exec_module(schemas)

from pydantic import ValidationError

def accept(data):
    return schemas.QuestionScoresSave.model_validate({'questions': data})

def reject(data):
    try: accept(data)
    except ValidationError: return
    raise AssertionError('Expected ValidationError')

accept([{'question_no': 1,'max_score':2.5,'earned_score':2}, {'question_no':2,'max_score':7.5,'earned_score':7}])
reject([])
reject([{'question_no': 1,'max_score':2,'earned_score':2.5}])
reject([{'question_no': 1,'max_score':2.3,'earned_score':2}])
reject([{'question_no': 1,'max_score':2,'earned_score':1.3}])
reject([{'question_no': 1,'max_score':2,'earned_score':1},{'question_no': 1,'max_score':2,'earned_score':2}])
reject([{'question_no': 101,'max_score':2,'earned_score':1}])
print('UC11 Pydantic schema: 7/7 checks passed')
