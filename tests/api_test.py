"""API tests. Starts its own server (fresh seed data) on a separate port.
Checks general rules only, so editing seed.json should not break them.

Run from the project root:  python3 tests/api_test.py
"""
import json
import os
import subprocess
import sys
import time
import urllib.error
import urllib.request

PORT = 1337
BASE = f"http://localhost:{PORT}/api"
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MISSING = 999999
count = 0
failures = 0


def request(method, path, body=None):
    """Send a request. body: dict (sent as JSON) or str (sent as is). Returns (status code, reply)."""
    data = None
    if body is not None:
        data = (body if isinstance(body, str) else json.dumps(body)).encode()
    req = urllib.request.Request(BASE + path, data=data, method=method,
                                 headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req) as res:
            status, text = res.status, res.read().decode()
    except urllib.error.HTTPError as err:
        status, text = err.code, err.read().decode()
    return status, (json.loads(text) if text else None)


def report(name, ok, expected, got):
    global count, failures
    count += 1
    print(f"[{count}] {name} --> {'OK' if ok else 'FAILED'}")
    if not ok:
        failures += 1
        print(f"      expected: {expected}  |  got: {str(got)[:300]}")


def has_fields(item, fields):
    return isinstance(item, dict) and all(item.get(key) == value for key, value in fields.items())


def expect(method, path, code, body=None, **fields):
    """Send a request, check the status code and (optionally) fields of the reply.
    Example: expect("GET", "/spots/106", 200, status="occupied")
    For a list reply, every item must have the fields. Returns the reply."""
    got, reply = request(method, path, body)
    items = reply if isinstance(reply, list) else [reply]
    ok = got == code and (not fields or all(has_fields(item, fields) for item in items))
    shown_body = "" if body is None else " " + (body if isinstance(body, str) else json.dumps(body))
    report(f"{method} {path}{shown_body}", ok, f"{code} {fields or ''}", f"{got} {json.dumps(reply)}")
    return reply


def check(name, ok, got=""):
    report(name, ok, "true", got)


def free_spot(kind):
    """First free spot of a kind: 'plain', 'ev', 'charger' or 'handicap'."""
    _, spots = request("GET", "/spots?status=free")
    for spot in spots:
        if kind == "plain" and spot["size"] != "ev" and not spot["handicap"]:
            return spot
        if kind == "ev" and spot["size"] == "ev":
            return spot
        if kind == "charger" and spot["charger"]:
            return spot
        if kind == "handicap" and spot["handicap"]:
            return spot


def park(spot, plate, ev=False):
    return expect("POST", "/sessions", 201, {"plate": plate, "spotId": spot["id"], "ev": ev})


def charger_prices(spots):
    return [spot["charger"]["pricePerKwh"] if spot["charger"] else float("inf") for spot in spots]


def run_tests():
    print("\nspots")
    spots = expect("GET", "/spots", 200)
    check("there are spots", len(spots) > 0)
    expect("GET", "/spots?floor=2&status=free", 200, floor=2, status="free")
    cheapest_first = expect("GET", "/spots?size=ev&status=free&sortBy=price&order=asc", 200, size="ev", status="free")
    check("cheapest charger first", charger_prices(cheapest_first) == sorted(charger_prices(cheapest_first)))
    expensive_first = expect("GET", "/spots?size=ev&status=free&sortBy=price&order=desc", 200)
    check("desc is the reverse order", charger_prices(expensive_first) == sorted(charger_prices(cheapest_first), reverse=True))
    expect("GET", f"/spots/{spots[0]['id']}", 200, id=spots[0]["id"])
    expect("GET", f"/spots/{MISSING}", 404)

    occupied = next(spot for spot in spots if spot["status"] == "occupied")
    free = free_spot("plain")
    expect("GET", f"/spots/{occupied['id']}/session", 200, spotId=occupied["id"])
    expect("GET", f"/spots/{free['id']}/session", 404)

    print("\nclose a spot")
    expect("PATCH", f"/spots/{free['id']}", 200, {"status": "closed"}, status="closed")
    expect("POST", "/sessions", 409, {"plate": "CLOSED-1", "spotId": free["id"]})  # can't park in a closed spot
    expect("PATCH", f"/spots/{free['id']}", 200, {"status": "free"}, status="free")
    expect("PATCH", f"/spots/{occupied['id']}", 409, {"status": "closed"})  # can't close an occupied spot
    expect("PATCH", f"/spots/{free['id']}", 400, {"status": "broken"})

    print("\nsessions")
    sessions = expect("GET", "/sessions", 200)
    expect("GET", f"/sessions/{sessions[0]['id']}", 200, id=sessions[0]["id"])
    expect("GET", f"/sessions/{MISSING}", 404)

    print("\nEV: park > charge > pay > leave")
    spot = free_spot("charger")
    car = park(spot, "12-345-67", ev=True)
    expect("GET", f"/spots/{spot['id']}", 200, status="occupied")
    charged = expect("PATCH", f"/sessions/{car['id']}", 200, {"chargedKwh": 20},
                     chargedKwh=20, amount=car["amount"] + 20 * spot["charger"]["pricePerKwh"])
    expect("PATCH", f"/sessions/{car['id']}", 409, {"chargedKwh": 10})  # the meter can't go down
    expect("DELETE", f"/sessions/{car['id']}", 409)  # can't leave before paying
    expect("POST", f"/sessions/{car['id']}/payment", 402, {"amount": charged["amount"] - 1})  # not enough
    expect("POST", f"/sessions/{car['id']}/payment", 200, {"amount": charged["amount"] + 15}, paid=True, change=15)
    expect("POST", f"/sessions/{car['id']}/payment", 409, {"amount": charged["amount"]})  # already paid
    expect("PATCH", f"/sessions/{car['id']}", 409, {"chargedKwh": 30})  # can't charge after paying
    expect("DELETE", f"/sessions/{car['id']}", 204)
    expect("GET", f"/spots/{spot['id']}", 200, status="free")
    expect("GET", f"/sessions/{car['id']}", 404)
    next_car = park(spot, "12-345-68")
    check("ids are never reused", next_car["id"] > car["id"], next_car["id"])

    print("\npay the exact amount")
    car = park(free_spot("plain"), "EXACT-1")
    expect("POST", f"/sessions/{car['id']}/payment", 200, {"amount": car["amount"]}, paid=True, change=0)

    print("\nbad requests")
    free = free_spot("plain")
    expect("POST", "/sessions", 400)
    expect("POST", "/sessions", 400, '{"plate": }')  # broken JSON
    expect("POST", "/sessions", 400, {"plate": " ", "spotId": free["id"]})
    expect("POST", "/sessions", 400, {"plate": "BAD-1", "spotId": str(free["id"])})
    expect("POST", "/sessions", 400, {"plate": "BAD-1", "spotId": free["id"], "ev": "yes"})
    expect("POST", "/sessions", 404, {"plate": "BAD-1", "spotId": MISSING})
    expect("POST", "/sessions", 409, {"plate": "BAD-1", "spotId": occupied["id"]})  # spot taken
    expect("POST", "/sessions", 409, {"plate": sessions[0]["plate"], "spotId": free["id"]})  # car already parked
    non_ev = next(session for session in sessions if not session["ev"])
    expect("PATCH", f"/sessions/{non_ev['id']}", 409, {"chargedKwh": 10})  # only an EV can charge
    expect("PATCH", f"/sessions/{non_ev['id']}", 400, {"chargedKwh": "10"})
    expect("POST", f"/sessions/{non_ev['id']}/payment", 400, {"amount": "100"})
    expect("POST", f"/sessions/{MISSING}/payment", 404, {"amount": 100})
    expect("POST", "/spots", 405)  # right address, wrong method
    expect("DELETE", f"/spots/{free['id']}", 405)
    expect("GET", "/nope", 404)

    print("\npenalties (compared to a plain spot)")
    base = park(free_spot("plain"), "PRICE-1")["amount"]
    non_ev_on_ev_spot = park(free_spot("ev"), "PRICE-2")["amount"]
    no_permit_on_handicap_spot = park(free_spot("handicap"), "PRICE-3")["amount"]
    check("non-EV on an EV spot pays more", non_ev_on_ev_spot > base, non_ev_on_ev_spot)
    check("no permit on a handicap spot pays more", no_permit_on_handicap_spot > base, no_permit_on_handicap_spot)


def main():
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

    print(f"\n{'[>] ALL TESTS PASSED' if failures == 0 else f'[>] {failures} FAILED'}")
    sys.exit(1 if failures else 0)


if __name__ == "__main__":
    main()
