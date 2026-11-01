"""Run the Python and JavaScript test suites from the repository root."""
from pathlib import Path
import shutil
import subprocess
import sys


ROOT = Path(__file__).resolve().parents[1]


def main() -> int:
    failed = False
    python_command = [
        sys.executable,
        "-m",
        "unittest",
        "discover",
        "-s",
        str(ROOT / "tests"),
        "-p",
        "test_*.py",
        "-v",
    ]
    python_result = subprocess.run(python_command, cwd=ROOT, check=False)
    if python_result.returncode:
        failed = True

    node = shutil.which("node")
    if node is None:
        print("JavaScript tests could not run: Node.js was not found on PATH.", file=sys.stderr)
        failed = True
    else:
        js_tests = sorted(
            str(path)
            for pattern in ("test_*.js", "test_*.cjs")
            for path in (ROOT / "tests").glob(pattern)
        )
        if not js_tests:
            print("JavaScript tests could not run: no test files were found.", file=sys.stderr)
            failed = True
        elif subprocess.run([node, "--test", *js_tests], cwd=ROOT, check=False).returncode:
            failed = True

    return int(failed)


if __name__ == "__main__":
    raise SystemExit(main())
