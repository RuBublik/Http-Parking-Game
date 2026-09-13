"""Level tests: one section per level, played in order on one shared lot, like the game.
Each level: wrong requests (the level must NOT pass), the hint must be the solution,
the SOLUTION (the level must pass), then checks that the lot really changed.

Run from the project root:  python3 tests/levels_test.py
"""
from helpers import MISSING, check, expect, ids, request, report, run_with_server, section

current_level = None


def level(level_id, title):
    global current_level
    current_level = level_id
    section(f"level {level_id}: {title}")


def wrong(method, path, code, body=None):
    """A wrong answer: the API replies with `code`, and the level does not pass."""
    return expect(method, path, code, body, level=current_level, passes=False, label="(wrong) ")


def hint_is(method, path, query=None, body=None):
    """The level's hint must be exactly this request (path without the query string)."""
    status, hint, _ = request("GET", f"/levels/{current_level}/hint")
    expected = {"method": method, "path": "/api" + path, "query": query or {}, "body": body}
    report("(hint) is the solution", status == 200 and hint == expected, expected, hint)


def solution(method, path, code, body=None, **fields):
    """A correct answer: the API replies with `code` (and fields), and the level passes."""
    return expect(method, path, code, body, level=current_level, passes=True, label="(SOLUTION) ", **fields)


def verify(method, path, code, **fields):
    """A plain request (no level) to check the state of the lot after the solution."""
    return expect(method, path, code, label="(verify) ", **fields)


def run_tests():
    section("levels API")
    levels = expect("GET", "/levels", 200)
    check("13 levels", len(levels) == 13, len(levels))
    check("only id, title and story (no solutions)", all(set(lvl) == {"id", "title", "story"} for lvl in levels), levels[0])
    expect("GET", f"/levels/{MISSING}/hint", 404)
    expect("POST", "/levels", 405)
    expect("POST", "/levels/1/hint", 405)
    _, _, headers = request("GET", "/spots")
    check("no verdict without X-Level-Id", headers.get("X-Level-Passed") is None)
    expect("POST", "/reset", 204)  # new game: all levels below share this lot

    level(1, "show every parking spot")
    wrong("GET", "/spot", 404)
    wrong("POST", "/spots", 405)
    hint_is("GET", "/spots")
    solution("GET", "/spots", 200)
    solution("GET", "/spots/", 200)  # a trailing slash is fine too

    level(2, "show the details of spot 107")
    wrong("GET", "/spots/701", 404)
    wrong("GET", "/spots/107/session", 200)  # a real address, but not the question
    hint_is("GET", "/spots/107")
    solution("GET", "/spots/107", 200, id=107)

    level(3, "show the free spots on floor 2")
    wrong("GET", "/spots?floor=2", 200)  # free spots only
    wrong("GET", "/spots?floor=2&status=free&size=ev", 200)  # an extra filter
    wrong("GET", "/spots/free?floor=2", 404)
    hint_is("GET", "/spots", query={"floor": "2", "status": "free"})
    solution("GET", "/spots?floor=2&status=free", 200, floor=2, status="free")
    solution("GET", "/spots?status=free&floor=2", 200, floor=2, status="free")  # any param order

    level(4, "show the free EV spots, cheapest charging first")
    wrong("GET", "/spots?size=ev&status=free&sortBy=price&order=desc", 200)  # most expensive first
    wrong("GET", "/spots?size=ev&status=free", 200)  # not sorted
    wrong("GET", "/spots/ev/asc", 404)
    hint_is("GET", "/spots", query={"size": "ev", "status": "free", "sortBy": "price", "order": "asc"})
    solution("GET", "/spots?size=ev&status=free&sortBy=price&order=asc", 200, size="ev", status="free")
    solution("GET", "/spots?sortBy=price&order=asc&size=ev&status=free", 200)  # any param order

    level(5, "close spot 110 for repairs")
    wrong("PATCH", "/spots/110", 400, {"status": "broken"})
    wrong("PATCH", "/spots/107", 409, {"status": "closed"})  # occupied
    wrong("PUT", "/spots/110", 405, {"status": "closed"})
    hint_is("PATCH", "/spots/110", body={"status": "closed"})
    solution("PATCH", "/spots/110", 200, {"status": "closed"}, status="closed")
    verify("GET", "/spots/110", 200, status="closed")
    check("110 is no longer a free spot", 110 not in ids(verify("GET", "/spots?status=free", 200)))

    level(6, "EV 12-345-67 parks in charger spot 106")
    wrong("POST", "/sessions", 400, {"plate": "12-345-67", "spotId": "106", "ev": True})
    wrong("POST", "/sessions", 409, {"plate": "12-345-67", "spotId": 107, "ev": True})  # spot taken
    wrong("POST", "/sessions", 409, {"plate": "12-345-67", "spotId": 110, "ev": True})  # spot closed
    hint_is("POST", "/sessions", body={"plate": "12-345-67", "spotId": 106, "ev": True})
    ev = solution("POST", "/sessions", 201, {"plate": "12-345-67", "spotId": 106, "ev": True},
                  spotId=106, ev=True, paid=False, amount=20)
    verify("GET", "/spots/106", 200, status="occupied")
    verify("GET", "/spots/106/session", 200, plate="12-345-67")
    check("106 is no longer a free spot", 106 not in ids(verify("GET", "/spots?status=free", 200)))
    ticket = ev.get("id", MISSING)  # levels 7-10 use this ticket

    level(7, "the EV charges 20 kWh")
    wrong("PATCH", f"/sessions/{ticket}", 400, {"chargedKwh": "20"})
    wrong("PATCH", "/sessions/1", 409, {"chargedKwh": 20})  # not an EV
    wrong("PATCH", f"/sessions/{ticket}", 200, {"chargedKwh": 10})  # a real charge, but not 20 kWh
    hint_is("PATCH", f"/sessions/{ticket}", body={"chargedKwh": 20})
    solution("PATCH", f"/sessions/{ticket}", 200, {"chargedKwh": 20}, chargedKwh=20, amount=60)
    verify("GET", f"/sessions/{ticket}", 200, chargedKwh=20, amount=60)

    level(8, "how much does the driver owe?")
    wrong("GET", "/sessions/6", 200)  # another car
    wrong("GET", "/sessions/abc", 404)
    hint_is("GET", f"/sessions/{ticket}")
    solution("GET", f"/sessions/{ticket}", 200, amount=60)
    solution("GET", "/spots/106/session", 200, amount=60)  # asking the spot works too

    level(9, "the driver pays what is due")
    wrong("DELETE", f"/sessions/{ticket}", 409)  # can't leave before paying
    wrong("POST", f"/sessions/{ticket}/payment", 402, {"amount": 59})  # not enough
    wrong("POST", f"/sessions/{ticket}/payment", 400, {"amount": "60"})
    hint_is("POST", f"/sessions/{ticket}/payment", body={"amount": 60})
    solution("POST", f"/sessions/{ticket}/payment", 200, {"amount": 60}, paid=True, change=0)
    verify("GET", f"/sessions/{ticket}", 200, paid=True)

    level(10, "the car leaves the lot")
    wrong("DELETE", "/sessions/3", 409)  # another car, not paid
    wrong("DELETE", "/spots/106", 405)
    hint_is("DELETE", f"/sessions/{ticket}")
    solution("DELETE", f"/sessions/{ticket}", 204)
    verify("GET", f"/sessions/{ticket}", 404)
    verify("GET", "/spots/106", 200, status="free")
    check("106 is a free spot again", 106 in ids(verify("GET", "/spots?status=free", 200)))

    level(11, "who is parked in spot 107?")
    wrong("GET", "/spots/107", 200)  # the spot, not the car
    wrong("GET", "/spots/106/session", 404)  # 106 is empty now
    hint_is("GET", "/spots/107/session")
    solution("GET", "/spots/107/session", 200, id=3, plate="71-455-09")

    level(12, "that car tries to leave without paying")
    wrong("DELETE", f"/sessions/{ticket}", 404)  # the EV already left
    wrong("GET", "/sessions/3", 200)  # looking is not trying to leave
    hint_is("DELETE", "/sessions/3")
    solution("DELETE", "/sessions/3", 409)
    verify("GET", "/sessions/3", 200, paid=False)
    verify("GET", "/spots/107", 200, status="occupied")

    level(13, "park in spot 110, which is closed")
    wrong("POST", "/sessions", 400, {"spotId": 110})  # no plate
    wrong("POST", "/sessions", 404, {"plate": "98-765-43", "spotId": MISSING})
    hint_is("POST", "/sessions", body={"plate": "98-765-43", "spotId": 110})
    solution("POST", "/sessions", 409, {"plate": "98-765-43", "spotId": 110})
    verify("GET", "/spots/110", 200, status="closed")
    verify("GET", "/spots/110/session", 404)


if __name__ == "__main__":
    run_with_server(run_tests)
