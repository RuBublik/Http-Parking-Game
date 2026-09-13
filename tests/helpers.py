"""Shared test helpers: send requests, print numbered results, run the tests on a fresh server."""
import json
import os
import subprocess
import sys
import time
import urllib.error
import urllib.request

PORT = 1337
SERVER = f"http://localhost:{PORT}"
BASE = f"{SERVER}/api"
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MISSING = 999999

count = 0
failures = 0
section_failures = {}  # section name -> number of failed tests
current_section = None


def request(method, path, body=None, level=None, content_type="application/json"):
    """Send a request. body: dict (sent as JSON) or str (sent as is). level: sent as X-Level-Id.
    Returns (status code, reply, headers)."""
    data = None
    if body is not None:
        data = (body if isinstance(body, str) else json.dumps(body)).encode()
    headers = {"Content-Type": content_type}
    if level is not None:
        headers["X-Level-Id"] = str(level)
    req = urllib.request.Request(BASE + path, data=data, method=method, headers=headers)
    try:
        with urllib.request.urlopen(req) as res:
            status, text, reply_headers = res.status, res.read().decode(), res.headers
    except urllib.error.HTTPError as err:
        status, text, reply_headers = err.code, err.read().decode(), err.headers
    return status, (json.loads(text) if text else None), reply_headers


def get_page(path):
    """GET a web page (not under /api). Returns (status code, content type, html)."""
    with urllib.request.urlopen(SERVER + path) as res:
        return res.status, res.headers.get("Content-Type"), res.read().decode()


def section(name):
    global current_section
    current_section = name
    section_failures[name] = 0
    print(f"\n{name}")


def report(name, ok, expected, got):
    global count, failures
    count += 1
    print(f"[{count}] {name} --> {'OK' if ok else 'FAILED'}")
    if not ok:
        failures += 1
        section_failures[current_section] = section_failures.get(current_section, 0) + 1
        print(f"      expected: {expected}  |  got: {str(got)[:300]}")


def has_fields(item, fields):
    return isinstance(item, dict) and all(item.get(key) == value for key, value in fields.items())


def expect(method, path, code, body=None, level=None, passes=None, label="", content_type="application/json", **fields):
    """Send a request, check the status code and (optionally) fields of the reply.
    Example: expect("GET", "/spots/106", 200, status="occupied")
    For a list reply, every item must have the fields.
    level + passes: send X-Level-Id and check the level verdict (X-Level-Passed).
    Returns the reply."""
    got, reply, headers = request(method, path, body, level, content_type)
    verdict = headers.get("X-Level-Passed") == "true"
    items = reply if isinstance(reply, list) else [reply]
    ok = got == code and (not fields or all(has_fields(item, fields) for item in items))
    if passes is not None:
        ok = ok and verdict == passes

    shown_body = "" if body is None else " " + (body if isinstance(body, str) else json.dumps(body))
    expected = f"{code} {fields or ''}" + ("" if passes is None else f" passes={passes}")
    got_text = f"{got}" + ("" if passes is None else f" passes={verdict}") + f" {json.dumps(reply)}"
    report(f"{label}{method} {path}{shown_body}", ok, expected, got_text)
    return reply


def check(name, ok, got=""):
    report(name, ok, "true", got)


def ids(items):
    return [item["id"] for item in items]


def run_with_server(run_tests):
    """Start a fresh server, run the tests, print a summary, exit with 1 if anything failed."""
    env = {**os.environ, "PORT": str(PORT)}
    server = subprocess.Popen(["npm", "start"], cwd=ROOT, env=env,
                              stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
    try:
        for _ in range(50):  # wait up to 5 s for the server
            try:
                urllib.request.urlopen(BASE + "/spots")
                break
            except OSError:
                time.sleep(0.1)
        else:
            server.terminate()
            print("Server did not start:\n" + server.stderr.read().decode())
            sys.exit(1)
        run_tests()
    finally:
        server.terminate()

    print("\nsummary")
    for name, failed in section_failures.items():
        print(f"  {name} --> {'OK' if failed == 0 else f'BROKEN ({failed} failed)'}")
    print(f"\n{'[>] ALL TESTS PASSED' if failures == 0 else f'[>] {failures} FAILED'}")
    sys.exit(1 if failures else 0)
