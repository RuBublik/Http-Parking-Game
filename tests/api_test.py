"""API tests. Starts its own server (fresh seed data) on a separate port.
Checks general rules only, so editing seed.json should not break them.

Run from the project root:  python3 tests/api_test.py
"""
from helpers import MISSING, check, expect, get_page, request, run_with_server, section


def free_spot(kind):
    """First free spot of a kind: 'plain', 'ev', 'charger' or 'handicap'."""
    _, spots, _ = request("GET", "/spots?status=free")
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
    section("spots")
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

    section("close a spot")
    expect("PATCH", f"/spots/{free['id']}", 200, {"status": "closed"}, status="closed")
    expect("POST", "/sessions", 409, {"plate": "CLOSED-1", "spotId": free["id"]})  # can't park in a closed spot
    expect("PATCH", f"/spots/{free['id']}", 200, {"status": "free"}, status="free")
    expect("PATCH", f"/spots/{occupied['id']}", 409, {"status": "closed"})  # can't close an occupied spot
    expect("PATCH", f"/spots/{free['id']}", 400, {"status": "broken"})

    section("sessions")
    sessions = expect("GET", "/sessions", 200)
    expect("GET", f"/sessions/{sessions[0]['id']}", 200, id=sessions[0]["id"])
    expect("GET", f"/sessions/{MISSING}", 404)

    section("EV: park > charge > pay > leave")
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

    section("pay the exact amount")
    car = park(free_spot("plain"), "EXACT-1")
    expect("POST", f"/sessions/{car['id']}/payment", 200, {"amount": car["amount"]}, paid=True, change=0)

    section("bad requests")
    free = free_spot("plain")
    expect("POST", "/sessions", 400)
    expect("POST", "/sessions", 400, '{"plate": }')  # broken JSON
    expect("POST", "/sessions", 415, '{"plate": "BAD-1", "spotId": 101}', content_type="text/plain")  # not sent as JSON
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

    section("penalties (compared to a plain spot)")
    base = park(free_spot("plain"), "PRICE-1")["amount"]
    non_ev_on_ev_spot = park(free_spot("ev"), "PRICE-2")["amount"]
    no_permit_on_handicap_spot = park(free_spot("handicap"), "PRICE-3")["amount"]
    check("non-EV on an EV spot pays more", non_ev_on_ev_spot > base, non_ev_on_ev_spot)
    check("no permit on a handicap spot pays more", no_permit_on_handicap_spot > base, no_permit_on_handicap_spot)

    section("schemas page")
    status, content_type, html = get_page("/schemas")
    check("GET /schemas is an HTML page", status == 200 and content_type.startswith("text/html"), f"{status} {content_type}")
    check("rendered on the server (no <script>)", "<script" not in html)
    levels = expect("GET", "/levels", 200)
    hint = expect("GET", "/levels/1/hint", 200)
    for name, item in [("spot", spots[0]), ("session", sessions[0]), ("level", levels[0]), ("hint", hint)]:
        missing = [field for field in item if f"<code>{field}</code>" not in html]
        check(f"every {name} field from the API is on the page", not missing, missing)

    section("reset")
    parked = expect("GET", "/sessions", 200)
    check("the tests parked more cars than the seed has", len(parked) > len(sessions), len(parked))
    expect("POST", "/reset", 204)
    expect("GET", f"/spots/{spots[0]['id']}", 200, status=spots[0]["status"])  # back to how it started
    check("back to the seed's cars", len(expect("GET", "/sessions", 200)) == len(sessions))
    expect("GET", "/reset", 405)


if __name__ == "__main__":
    run_with_server(run_tests)
