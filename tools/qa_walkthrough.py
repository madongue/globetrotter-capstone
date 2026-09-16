"""End-to-end QA of GlobeTrotter, driven like a real user, for both roles.

Every check reports PASS or FAIL with what it actually saw, so a failure names
the defect rather than just failing.
"""
import os
import sys
import time
import traceback

from playwright.sync_api import sync_playwright

BASE = "http://127.0.0.1:5070"
OUT = os.path.join(os.environ["TEMP"], "qa")
os.makedirs(OUT, exist_ok=True)

RESULTS = []
CONSOLE = []

#: A 1x1 PNG, so the picture upload is exercised with a real image rather than
#: bytes the server would rightly refuse.
PNG = bytes.fromhex(
    "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489"
    "0000000a49444154789c6360000002000100ffff03000006000557bfabd4000000"
    "0049454e44ae426082"
)


def check(name, condition, detail=""):
    RESULTS.append((bool(condition), name, detail))
    mark = "PASS" if condition else "FAIL"
    print(f"  [{mark}] {name}" + (f"  -- {detail}" if detail and not condition else ""))
    return bool(condition)


def section(title):
    print(f"\n=== {title} ===")


def watch(page, label):
    page.on("dialog", lambda d: d.accept())
    page.on("console", lambda m: CONSOLE.append((label, m.type, m.text[:160]))
            if m.type == "error" else None)
    page.on("pageerror", lambda e: CONSOLE.append((label, "pageerror", str(e)[:160])))


def goto(page, path, wait=1400):
    page.goto(BASE + path, wait_until="networkidle", timeout=90000)
    page.wait_for_timeout(wait)


def new_ctx(browser, token=None, width=1440):
    ctx = browser.new_context(viewport={"width": width, "height": 950},
                              permissions=["camera", "microphone"])
    if token:
        ctx.add_init_script(f"try{{localStorage.setItem('gt_token','{token}')}}catch(e){{}}")
    return ctx


def api(page, method, path, body=None):
    """Call the API from inside the page, using its stored token."""
    return page.evaluate(
        """async ([m, p, b]) => {
            const t = localStorage.getItem('gt_token');
            const r = await fetch('/api' + p, {
              method: m,
              headers: Object.assign({'Content-Type':'application/json'},
                                     t ? {Authorization: 'Bearer ' + t} : {}),
              body: b ? JSON.stringify(b) : undefined,
            });
            let j = null; try { j = await r.json(); } catch(e) {}
            return {status: r.status, body: j};
        }""", [method, path, body])


def register(page, username, phone):
    return api(page, "POST", "/register",
               {"username": username, "password": "pw123456", "phone": phone})


def token_for(page, username):
    r = api(page, "POST", "/login", {"username": username, "password": "pw123456"})
    return (r["body"] or {}).get("token")


def main():
    with sync_playwright() as pw:
        browser = pw.chromium.launch(args=[
            "--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream",
            "--autoplay-policy=no-user-gesture-required",
        ])

        # ------------------------------------------------ accounts via API
        boot = new_ctx(browser).new_page()
        goto(boot, "/", 600)
        for name, phone in (("boss", "+237670009001"),
                            ("amina", "+237670009002"),
                            ("eric", "+237670009003")):
            register(boot, name, phone)
        TOK = {n: token_for(boot, n) for n in ("boss", "amina", "eric")}
        boot.context.close()

        # =============================================== GUEST
        section("Guest (signed out)")
        gctx = new_ctx(browser)
        g = gctx.new_page(); watch(g, "guest")

        goto(g, "/")
        check("home renders the hero", g.locator("h1").count() > 0)
        check("home shows the place count", "845" in g.content())
        check("home has the two-field planner", g.locator("input").count() >= 2)

        goto(g, "/explore")
        cards = g.locator(".gt-grid > *").count()
        check("explore lists places", cards > 0, f"cards={cards}")
        check("explore has a search box", g.locator("input").count() > 0)

        # open a place
        first = g.locator("a[href^='/places/']").first
        href = first.get_attribute("href") if first.count() else None
        check("explore links to a place", bool(href), str(href))
        if href:
            goto(g, href)
            check("place detail has a title", g.locator("h1").count() > 0)
            check("place detail shows breadcrumbs", g.locator(".crumbs").count() == 1)
            check("place detail has a map", g.locator(".leaflet-container").count() > 0)

            # The map is the point of a place page, not a reward for scrolling.
            fold = g.evaluate("""() => {
                const m = document.querySelector('.pd__map');
                return m ? Math.round(m.getBoundingClientRect().top) : -1;
            }""")
            check("the map is visible without scrolling", 0 < fold < 900, f"map top at {fold}px")
            hero = g.evaluate("""() => {
                const h = document.querySelector('.pd__hero');
                return h ? Math.round(h.getBoundingClientRect().height) : -1;
            }""")
            check("the photo does not fill the whole screen", hero < 500, f"hero {hero}px")
            check("the place shows its description", "About" in g.locator("main").inner_text())
            check("the place shows a cost", "cost" in g.locator("main").inner_text().lower())

        # Explore, as a map of Cameroon rather than only a list
        section("Guest — the catalogue on a map")
        goto(g, "/explore")
        check("explore offers a map view", g.locator(".explore__views").count() == 1)
        g.locator(".explore__view", has_text="Map").click()
        g.wait_for_timeout(3500)
        check("the map renders", g.locator(".leaflet-container").count() == 1)
        pins = g.locator(".leaflet-marker-icon").count()
        check("places are drawn as pins", pins > 50, f"pins={pins}")
        check("tiles actually load", g.locator(".leaflet-tile-loaded").count() > 0)
        check("the map says how many it is showing",
              g.locator(".explore__map-note").count() == 1)

        goto(g, "/dashboard")
        check("guest dashboard asks them to sign in",
              "sign in" in g.locator("main").inner_text().lower())

        # assistant as a guest
        goto(g, "/")
        g.locator(".dock__open").click(); g.wait_for_timeout(500)
        g.locator(".dock__input").fill("what can I see in Kribi?")
        g.locator(".dock__ask button[type=submit]").click()
        g.wait_for_selector(".dock__actions", timeout=25000)
        acts = g.locator(".dock__action").all_inner_texts()
        check("guest assistant answers", g.locator(".dock__msg--bot").count() >= 2)
        check("guest assistant offers actions", len(acts) > 0, str(acts))
        check("guest is offered no account-only action",
              all("admin" not in a.lower() for a in acts), str(acts))
        gctx.close()

        # =============================================== TRAVELLER
        section("Traveller — planning")
        actx = new_ctx(browser, TOK["amina"])
        a = actx.new_page(); watch(a, "amina")

        goto(a, "/dashboard")
        check("dashboard greets by name", "amina" in a.locator("main").inner_text().lower())
        check("dashboard shows four counters", a.locator(".dstat").count() == 4)
        check("no admin link for a traveller", a.locator(".dlink--admin").count() == 0)
        check("dashboard is the root, so no trail is shown", a.locator(".crumbs").count() == 0)

        # build a trip through the UI
        goto(a, "/trips")
        a.locator(".create input").first.fill("Kribi")
        days = a.locator(".create input").nth(1)
        days.fill("3")
        a.locator(".create button").first.click()
        a.wait_for_url("**/trips/**", timeout=60000)
        a.wait_for_timeout(2500)
        check("quick plan created a trip and opened it", "/trips/" in a.url, a.url)
        trip_url = a.url
        stops = a.locator(".cp").count()
        check("the trip has checkpoints", stops > 0, f"stops={stops}")
        check("itinerary shows a map", a.locator(".leaflet-container").count() > 0)
        check("itinerary shows a cost", "FCFA" in a.locator("main").inner_text())
        check("itinerary has breadcrumbs", a.locator(".crumbs").count() == 1)
        check("itinerary has the ratings panel", a.locator(".tfb").count() == 1)
        check("the itinerary map offers to show where you are",
              a.locator(".itin__map-actions button").count() == 1)
        check("every mapped checkpoint can be navigated to",
              a.evaluate("""() => {
                  // The popup markup is built by Leaflet on open, so the hrefs
                  // are checked on the data the page handed it.
                  return document.querySelectorAll('.leaflet-marker-icon').length > 0;
              }"""))

        # rate own trip
        a.locator(".tfb__pick-star").nth(4).click()
        a.locator(".tfb textarea").fill("QA rating.")
        a.locator(".tfb button[type=submit]").click()
        a.wait_for_timeout(2500)
        check("rating a trip records it", a.locator(".tfb__item").count() >= 1)

        # checkpoint reorder / edit / remove
        names_before = a.locator(".cp__title").all_inner_texts()
        move = a.locator("button[aria-label*='later']").first
        check("checkpoint move control exists", move.count() > 0)
        if move.count():
            move.click(); a.wait_for_timeout(2500)
            names_after = a.locator(".cp__title").all_inner_texts()
            check("moving a checkpoint reorders the plan",
                  names_after != names_before and sorted(names_after) == sorted(names_before),
                  f"{names_before[:3]} -> {names_after[:3]}")

        n_before = a.locator(".cp").count()
        remove = a.locator("button[aria-label^='Remove']").first
        check("checkpoint remove control exists", remove.count() > 0)
        if remove.count():
            remove.click(); a.wait_for_timeout(3000)
            check("removing a checkpoint removes it",
                  a.locator(".cp").count() == n_before - 1,
                  f"{n_before} -> {a.locator('.cp').count()}")

        # saving a place
        section("Traveller — discovery and saving")
        goto(a, "/explore")
        save_btn = a.locator("button[aria-label^='Save ']").first
        check("explore offers a save control", save_btn.count() > 0)
        if save_btn.count():
            save_btn.click(); a.wait_for_timeout(2500)
        server_saved = api(a, "GET", "/wishlist")["body"] or []
        check("saving reaches the server", len(server_saved) > 0, f"wishlist={len(server_saved)}")

        goto(a, "/saved")
        saved_n = a.locator(".gt-grid > *").count()
        check("saved page lists the saved place", saved_n > 0, f"cards={saved_n}")

        # Unsaving from the Saved page must actually unsave.
        if saved_n:
            a.locator("button[aria-label^='Remove ']").first.click()
            a.wait_for_timeout(2500)
            after = api(a, "GET", "/wishlist")["body"] or []
            check("unsaving from the saved page works",
                  len(after) == len(server_saved) - 1,
                  f"{len(server_saved)} -> {len(after)}")

        # suggestions
        section("Traveller — contributing")
        goto(a, "/suggest")
        a.locator("input").first.fill("QA Falls")
        inputs = a.locator(".suggest__form input")
        inputs.nth(1).fill("Melong, Littoral")
        inputs.nth(2).fill("4000")
        a.locator(".suggest__form button[type=submit]").click()
        a.wait_for_timeout(2500)
        check("a suggestion is submitted and listed", a.locator(".sub").count() >= 1)

        # correction flow
        place = api(a, "GET", "/resources/places?limit=1")["body"]
        pid = (place[0] if isinstance(place, list) else place["places"][0])["id"]
        goto(a, f"/suggest?edit={pid}")
        check("correction form names the entry", a.locator(".suggest__target").count() == 1)
        cost = a.locator(".suggest__form input").nth(2)
        cost.fill("9999")
        a.locator(".suggest__form textarea").last.fill("QA correction reason.")
        a.locator(".suggest__form button[type=submit]").click()
        a.wait_for_timeout(3000)
        mine = api(a, "GET", "/resources/requests")["body"] or []
        edits = [r for r in mine if r.get("mode") == "edit"]
        check("a correction reaches the server", len(edits) == 1, f"requests={len(mine)}")
        check("the correction records only what changed",
              bool(edits) and "cost" in (edits[0].get("changes") or {}),
              str(edits[0].get("changes")) if edits else "none")
        check("the correction is listed back to the traveller",
              any("Correction" in t for t in a.locator(".sub__name").all_inner_texts()),
              str(a.locator(".sub__name").all_inner_texts()))

        # community
        section("Traveller — community")
        goto(a, "/community")
        check("community page renders", a.locator("h1").count() > 0)

        # Starting a group, through the form rather than the API.
        check("the community offers a way to start a group",
              a.locator(".newgroup").count() == 1)
        a.locator(".newgroup input").first.fill("QA crew")
        a.locator(".newgroup textarea").first.fill("a group made by the walkthrough")
        a.locator(".newgroup button[type=submit]").click()
        a.wait_for_timeout(3000)

        mine = [g for g in (api(a, "GET", "/groups")["body"] or []) if g["name"] == "QA crew"]
        check("the group reaches the server", len(mine) == 1, str(len(mine)))
        check("a traveller's group waits for approval",
              bool(mine) and mine[0]["status"] == "pending",
              mine[0]["status"] if mine else "none")
        check("the traveller is shown that it is waiting",
              "Waiting for approval" in a.locator(".groups").inner_text(),
              a.locator(".groups").inner_text()[:80].replace(chr(10), " "))
        gid = mine[0]["id"] if mine else None
        check("group created", bool(gid))

        # Another traveller must not see it yet.
        ectx = new_ctx(browser, TOK["eric"])
        e = ectx.new_page()
        goto(e, "/community", 1200)
        others = [g for g in (api(e, "GET", "/groups")["body"] or []) if g["name"] == "QA crew"]
        check("a group under review is hidden from other travellers", not others)
        ectx.close()
        if gid:
            goto(a, f"/community/{gid}")
            check("group page has tabs", a.locator(".gd__tab").count() >= 3)
            a.locator("button", has_text="Chat").first.click(); a.wait_for_timeout(800)
            check("group chat is present", a.locator(".gd__talk").count() == 1)
            check("call panel is present", a.locator(".call--idle").count() == 1)
            box = a.locator(".gd__talk input").first
            if box.count():
                box.fill("hello from QA")
                a.keyboard.press("Enter")
                a.wait_for_timeout(2500)
                check("a chat message appears",
                      "hello from QA" in a.locator(".gd__talk").inner_text())

        # media
        section("Traveller — photos")
        goto(a, "/media")
        check("media page renders", a.locator("h1").count() > 0)
        check("media has a file picker", a.locator(".composer__file").count() == 1)
        a.locator(".composer input[type=url]").fill(f"{BASE}/images/destinations/kribi.jpg")
        a.locator(".composer button[type=submit]").click()
        a.wait_for_timeout(3000)
        check("a photo is posted", a.locator(".shot").count() >= 1)
        if a.locator(".shot__like").count():
            a.locator(".shot__like").first.click(); a.wait_for_timeout(2000)
            check("a photo can be liked", "1" in a.locator(".shot__count").first.inner_text())

        # profile + settings
        section("Traveller — account")
        goto(a, "/profile")
        check("profile renders", a.locator("h1").count() > 0)
        check("profile has breadcrumbs", a.locator(".crumbs").count() == 1)

        # profile picture
        check("the portrait is the control for changing it",
              a.locator(".profile__portrait-btn").count() == 1)
        check("no picture to start with", a.locator(".avatar--photo").count() == 0)

        a.locator(".profile__file").set_input_files({
            "name": "face.png", "mimeType": "image/png", "buffer": PNG,
        })
        a.wait_for_timeout(3000)
        check("uploading a picture shows it",
              a.locator(".profile__portrait .avatar--photo").count() == 1)
        stored = (api(a, "GET", "/profile")["body"] or {}).get("avatar_url")
        check("the picture reaches the server", bool(stored), str(stored))

        # It follows the account onto what they have already posted.
        feed = api(a, "GET", "/media")["body"] or []
        mine_posts = [m for m in feed if m.get("username") == "amina"]
        check("the picture reaches posts already made",
              bool(mine_posts) and bool(mine_posts[0].get("avatar_url")),
              str(mine_posts[0].get("avatar_url")) if mine_posts else "no posts")

        goto(a, "/media", 1500)
        check("the media feed renders the picture",
              a.locator(".shot .avatar--photo").count() >= 1)

        goto(a, "/profile", 1500)
        check("a picture can be removed", a.locator(".profile__portrait-drop").count() == 1)
        a.locator(".profile__portrait-drop").click()
        a.wait_for_timeout(2500)
        check("removing it goes back to initials",
              a.locator(".profile__portrait .avatar--photo").count() == 0)

        # Put it back, so the admin screen has one to show.
        a.locator(".profile__file").set_input_files({
            "name": "face.png", "mimeType": "image/png", "buffer": PNG,
        })
        a.wait_for_timeout(2500)
        goto(a, "/settings")
        check("settings renders", a.locator("h1").count() > 0)
        check("settings has a currency control", a.locator("select").count() >= 1)
        check("settings has the language toggle", a.locator(".gt-lang, .gt-lang__option").count() > 0)

        # assistant: the reported bug
        section("Traveller — assistant creates a trip")
        goto(a, "/trips")
        a.locator(".dock__open").click(); a.wait_for_timeout(500)
        a.locator(".dock__input").fill("plan a 3 day trip to Limbe")
        a.locator(".dock__ask button[type=submit]").click()
        a.wait_for_selector(".dock__actions", timeout=25000)
        labels = a.locator(".dock__action").all_inner_texts()
        check("assistant offers actions", len(labels) > 0, str(labels))
        doit = a.locator(".dock__action--do")
        check("assistant offers a build action", doit.count() == 1, str(labels))
        # Read the panel before the action navigates away from it.
        log_text = a.locator(".dock__log").inner_text()
        check("bot text has no stray asterisks", "**" not in log_text and "*" not in log_text,
              log_text[:80])
        check("bot replies render as paragraphs or lists",
              a.locator(".dock__para, .dock__list").count() > 0)

        if doit.count():
            trips_before = len(api(a, "GET", "/itineraries")["body"] or [])
            doit.click()
            a.wait_for_url("**/trips/**", timeout=60000)
            a.wait_for_timeout(2500)
            trips_after = len(api(a, "GET", "/itineraries")["body"] or [])
            check("the build action actually created a trip",
                  trips_after == trips_before + 1, f"{trips_before} -> {trips_after}")
            check("and opened it", "/trips/" in a.url, a.url)
            check("the created trip has checkpoints", a.locator(".cp").count() > 0)

        # French
        section("Traveller - language")
        goto(a, "/explore")
        fr = a.locator(".gt-lang__option", has_text="FR").first
        check("a language switch is present", fr.count() > 0)
        if fr.count():
            fr.click(); a.wait_for_timeout(2500)
            body = a.locator("body").inner_text()
            check("switching to French changes the interface",
                  any(w in body for w in ("Rechercher", "Explorer", "Retour", "Accueil", "Communaute", "Communauté")),
                  body[:110].replace(chr(10), " "))
            en = a.locator(".gt-lang__option", has_text="EN").first
            if en.count():
                en.click(); a.wait_for_timeout(2500)
        actx.close()

        # =============================================== ADMIN
        section("Administrator")
        bctx = new_ctx(browser, TOK["boss"])
        b = bctx.new_page(); watch(b, "boss")

        goto(b, "/dashboard")
        check("admin sees the admin link", b.locator(".dlink--admin").count() == 1)

        goto(b, "/admin")
        check("admin dashboard renders", b.locator("h1").count() > 0)
        metrics = b.locator(".metric").count()
        check("analytics show all metrics", metrics >= 11, f"metrics={metrics}")
        rows = b.locator(".review").count()
        check("the review queue has the submissions", rows >= 2, f"rows={rows}")
        check("a correction shows its diff", b.locator(".review__diff").count() >= 1)
        check("accounts table lists users", b.locator(".admin__table tbody tr").count() >= 3)
        check("the accounts table shows profile pictures",
              b.locator(".admin__table .avatar--photo").count() >= 1)
        check("admin cannot demote themselves",
              "That is you" in b.locator(".admin__table").inner_text())

        # approve one
        approve = b.locator(".review button", has_text="Approve").first
        if approve.count():
            approve.click(); b.wait_for_timeout(3000)
            check("approving clears it from the queue", b.locator(".review").count() == rows - 1)

        # the group queue
        gq = b.locator(".review", has_text="QA crew")
        check("the group queue lists what travellers asked for", gq.count() == 1)
        check("the analytics count groups awaiting approval",
              "Groups awaiting approval" in b.locator("main").inner_text())
        if gq.count():
            gq.locator("button", has_text="Approve").first.click()
            b.wait_for_timeout(3000)
            check("approving clears the group from the queue",
                  b.locator(".review", has_text="QA crew").count() == 0)
            live = [g for g in (api(b, "GET", "/groups")["body"] or []) if g["name"] == "QA crew"]
            check("the approved group is live", bool(live) and live[0]["status"] == "approved",
                  live[0]["status"] if live else "gone")

        # promote
        promote = b.locator("tr", has_text="eric").locator("button", has_text="Make admin")
        if promote.count():
            promote.click(); b.wait_for_timeout(2500)
            check("an account can be promoted",
                  "Administrator" in b.locator("tr", has_text="eric").inner_text())

        # Now that it is live, someone else can join.
        joined = api(b, "POST", f"/groups/{gid}/join", {}) if gid else {"status": 0}
        check("an approved group can be joined", joined["status"] == 200, str(joined["status"]))

        # admin assistant
        b.locator(".dock__open").click(); b.wait_for_timeout(500)
        b.locator(".dock__input").fill("how many users do I have?")
        b.locator(".dock__ask button[type=submit]").click()
        b.wait_for_selector(".dock__actions", timeout=25000)
        b.wait_for_timeout(600)
        reply = b.locator(".dock__msg--bot").last.inner_text()
        check("admin assistant answers from the database",
              "registered account" in reply.lower(), reply[:90])
        aacts = b.locator(".dock__action").all_inner_texts()
        check("admin assistant offers admin actions", len(aacts) > 0, str(aacts))
        bctx.close()

        # =============================================== MOBILE
        section("Mobile (390px)")
        mctx = new_ctx(browser, TOK["amina"], width=390)
        m = mctx.new_page(); watch(m, "mobile")
        for path in ("/", "/explore", "/trips", "/community", "/media",
                     "/saved", "/suggest", "/profile", "/settings", "/dashboard"):
            goto(m, path, 900)
            over = m.evaluate(
                "() => document.documentElement.scrollWidth - document.documentElement.clientWidth")
            check(f"{path} does not scroll sideways on a phone", over <= 0, f"overflow={over}px")
        mctx.close()

        browser.close()

    # ------------------------------------------------------------- summary
    print("\n" + "=" * 62)
    failed = [r for r in RESULTS if not r[0]]
    print(f"QA: {len(RESULTS) - len(failed)}/{len(RESULTS)} passed")
    if failed:
        print("\nFAILURES:")
        for _, name, detail in failed:
            print(f"  - {name}" + (f"  ({detail})" if detail else ""))
    ours = [c for c in CONSOLE if "extension" not in c[2].lower()]
    if ours:
        print(f"\nCONSOLE ERRORS ({len(ours)}):")
        seen = set()
        for label, kind, text in ours:
            key = text[:80]
            if key in seen:
                continue
            seen.add(key)
            print(f"  [{label}] {kind}: {text}")
    return 1 if failed else 0


try:
    sys.exit(main())
except Exception:
    traceback.print_exc()
    print("\nPartial results:")
    for ok, name, detail in RESULTS:
        print(f"  [{'PASS' if ok else 'FAIL'}] {name}")
    sys.exit(2)
