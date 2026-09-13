"""Level tests: one section per level, played like the game does.
Each level: reset the lot to the level's start, send wrong requests (the level must NOT pass),
the SOLUTION (the level must pass), then check that the lot really changed.

Run from the project root:  python3 tests/levels_test.py
"""
from helpers import MISSING, check, expect, ids, request, report, run_with_server, section

current_level = None


def level(level_id, title):
    """Start a level: print its header and reset the lot to its starting state (like entering it in the game)."""
    global current_level
    current_level = level_id
    section(f"level {level_id}: {title}")
    reset_level()


def reset_level():
    """Like the 'Reset level' button: undo whatever the wrong attempts changed."""
    status, reply, _ = request("PUT", "/levels/current", {"id": current_level})
    if status != 200:
        report(f"reset level {current_level}", False, 200, f"{status} {reply}")


def wrong(method, path, code, body=None):
    """A wrong answer: the API replies with `code`, and the level does not pass."""
    return expect(method, path, code, body, level=current_level, passes=False, label="(wrong) ")


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
    expect("PUT", "/levels/current", 200, {"id": 5}, id=5)
    expect("PUT", "/levels/current", 400, {"id": "5"})
    expect("PUT", "/levels/current", 404, {"id": MISSING})
    expect("POST", "/levels", 405)
    _, _, headers = request("GET", "/spots")
    check("no verdict without X-Level-Id", headers.get("X-Level-Passed") is None)

    level(1, "show every parking spot")
    wrong("GET", "/spot", 404)
    wrong("POST", "/spots", 405)
    solution("GET", "/spots", 200)
    solution("GET", "/spots/", 200)  # a trailing slash is fine too

    level(2, "show the details of spot 107")
    wrong("GET", "/spots/701", 404)
    wrong("GET", "/spots/107/session", 200)  # a real address, but not the question
    solution("GET", "/spots/107", 200, id=107)

    level(3, "show the free spots on floor 2")
    wrong("GET", "/spots?floor=2", 200)  # free spots only
    wrong("GET", "/spots?floor=2&status=free&size=ev", 200)  # an extra filter
    wrong("GET", "/spots/free?floor=2", 404)
    solution("GET", "/spots?floor=2&status=free", 200, floor=2, status="free")
    solution("GET", "/spots?status=free&floor=2", 200, floor=2, status="free")  # any param order

    level(4, "show the free EV spots, cheapest charging first")
    wrong("GET", "/spots?size=ev&status=free&sortBy=price&order=desc", 200)  # most expensive first
    wrong("GET", "/spots?size=ev&status=free", 200)  # not sorted
    wrong("GET", "/spots/ev/asc", 404)
    solution("GET", "/spots?size=ev&status=free&sortBy=price&order=asc", 200, size="ev", status="free")
    solution("GET", "/spots?sortBy=price&order=asc&size=ev&status=free", 200)  # any param order

    level(5, "close spot 110 for repairs")
    wrong("PATCH", "/spots/110", 400, {"status": "broken"})
    wrong("PATCH", "/spots/107", 409, {"status": "closed"})  # occupied
    wrong("PUT", "/spots/110", 405, {"status": "closed"})
    solution("PATCH", "/spots/110", 200, {"status": "closed"}, status="closed")
    verify("GET", "/spots/110", 200, status="closed")
    check("110 is no longer a free spot", 110 not in ids(verify("GET", "/spots?status=free", 200)))

    level(6, "EV 12-345-67 parks in charger spot 106")
    wrong("POST", "/sessions", 400, {"plate": "12-345-67", "spotId": "106", "ev": True})
    wrong("POST", "/sessions", 409, {"plate": "12-345-67", "spotId": 107, "ev": True})  # spot taken
    wrong("POST", "/sessions", 201, {"plate": "12-345-67", "spotId": 106})  # parked, but not as an EV
    reset_level()
    solution("POST", "/sessions", 201, {"plate": "12-345-67", "spotId": 106, "ev": True},
             id=7, spotId=106, ev=True, paid=False, amount=20)
    verify("GET", "/spots/106", 200, status="occupied")
    verify("GET", "/spots/106/session", 200, plate="12-345-67")
    check("106 is no longer a free spot", 106 not in ids(verify("GET", "/spots?status=free", 200)))
    reset_level()
    solution("POST", "/sessions", 201, {"plate": "12-345-67", "spotId": 106, "ev": True, "handicap": False})  # extra fields are fine

    level(7, "the EV charges 20 kWh")
    wrong("PATCH", "/sessions/7", 400, {"chargedKwh": "20"})
    wrong("PATCH", "/sessions/1", 409, {"chargedKwh": 20})  # not an EV
    wrong("PATCH", "/sessions/7", 200, {"chargedKwh": 10})  # a real charge, but not 20 kWh
    solution("PATCH", "/sessions/7", 200, {"chargedKwh": 20}, chargedKwh=20, amount=60)
    verify("GET", "/sessions/7", 200, chargedKwh=20, amount=60)

    level(8, "how much does the driver owe?")
    wrong("GET", "/sessions/6", 200)  # another car
    wrong("GET", "/sessions/abc", 404)
    solution("GET", "/sessions/7", 200, amount=60)
    solution("GET", "/spots/106/session", 200, amount=60)  # asking the spot works too

    level(9, "the driver pays what is due")
    wrong("DELETE", "/sessions/7", 409)  # can't leave before paying
    wrong("POST", "/sessions/7/payment", 402, {"amount": 59})  # not enough
    wrong("POST", "/sessions/7/payment", 400, {"amount": "60"})
    solution("POST", "/sessions/7/payment", 200, {"amount": 60}, paid=True, change=0)
    verify("GET", "/sessions/7", 200, paid=True)
    reset_level()
    solution("POST", "/sessions/7/payment", 200, {"amount": 100}, paid=True, change=40)  # paying more is fine

    level(10, "the car leaves the lot")
    wrong("DELETE", "/sessions/3", 409)  # another car, not paid
    wrong("DELETE", "/spots/106", 405)
    solution("DELETE", "/sessions/7", 204)
    verify("GET", "/sessions/7", 404)
    verify("GET", "/spots/106", 200, status="free")
    check("106 is a free spot again", 106 in ids(verify("GET", "/spots?status=free", 200)))

    level(11, "who is parked in spot 107?")
    wrong("GET", "/spots/107", 200)  # the spot, not the car
    wrong("GET", "/spots/106/session", 404)  # 106 is empty now
    solution("GET", "/spots/107/session", 200, id=3, plate="71-455-09")

    level(12, "that car tries to leave without paying")
    wrong("DELETE", "/sessions/7", 404)  # that car already left
    wrong("GET", "/sessions/3", 200)  # looking is not trying to leave
    solution("DELETE", "/sessions/3", 409)
    verify("GET", "/sessions/3", 200, paid=False)
    verify("GET", "/spots/107", 200, status="occupied")

    level(13, "park in spot 110, which is closed")
    wrong("POST", "/sessions", 400, {"spotId": 110})  # no plate
    wrong("POST", "/sessions", 201, {"plate": "98-765-43", "spotId": 104})  # parked, but in another spot
    reset_level()
    solution("POST", "/sessions", 409, {"plate": "98-765-43", "spotId": 110})
    verify("GET", "/spots/110", 200, status="closed")
    verify("GET", "/spots/110/session", 404)


if __name__ == "__main__":
    run_with_server(run_tests)
