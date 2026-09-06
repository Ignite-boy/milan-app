import asyncio
import base64
import difflib
import json
import os
import re
import subprocess
import time
from pathlib import Path
from typing import Any

from agents import Agent, Runner, function_tool, ToolOutputImage

from playwright.async_api import async_playwright, Page, BrowserContext

ROOT = Path("/mnt/d/milan-app").resolve()
FRONTEND = (ROOT / "frontend").resolve()
ARTIFACTS = (ROOT / ".agent-artifacts").resolve()
URL = "http://172.23.80.1:5000/app"

START = time.monotonic()
DEADLINE_SECONDS = 600

_pw = None
_context: BrowserContext | None = None
_page: Page | None = None


def time_left() -> int:
    return max(0, int(DEADLINE_SECONDS - (time.monotonic() - START)))


def safe_frontend_path(raw: str) -> Path:
    p = (ROOT / raw).resolve()
    if p != FRONTEND and FRONTEND not in p.parents:
        raise ValueError(f"Frontend-only violation: {raw}")
    return p


def is_frontend_file(path: Path) -> bool:
    try:
        path.resolve().relative_to(FRONTEND)
        return path.is_file()
    except Exception:
        return False


def frontend_files() -> list[str]:
    out = []
    for p in FRONTEND.rglob("*"):
        if p.is_file():
            try:
                out.append(str(p.relative_to(ROOT)))
            except Exception:
                pass
    return sorted(out)


@function_tool
async def inspect_frontend() -> str:
    """Inspect the frontend file inventory and relevant HTML/CSS/JS structure.

    Only reads files under frontend/. Returns a compact inventory, app.html
    structure summary, loaded stylesheet/script paths, and CSS class/id counts.
    """
    app = FRONTEND / "app.html"
    html = app.read_text(errors="ignore")

    ids = sorted(set(re.findall(r'id=["\']([^"\']+)["\']', html)))
    classes = sorted(set(
        c
        for blob in re.findall(r'class=["\']([^"\']+)["\']', html)
        for c in blob.split()
    ))
    scripts = re.findall(r'<script[^>]+src=["\']([^"\']+)["\']', html, re.I)
    styles = re.findall(r'<link[^>]+href=["\']([^"\']+\.css[^"\']*)["\']', html, re.I)

    summary = {
        "time_left_seconds": time_left(),
        "files": frontend_files(),
        "app_html_bytes": app.stat().st_size,
        "element_ids_sample": ids[:160],
        "class_count": len(classes),
        "class_sample": classes[:180],
        "scripts": scripts,
        "stylesheets": styles,
    }

    (ARTIFACTS / "frontend_inventory.json").write_text(
        json.dumps(summary, indent=2)
    )
    return json.dumps(summary, indent=2)


@function_tool
async def read_frontend_file(path: str, start: int = 1, lines: int = 260) -> str:
    """Read a frontend source file.

    Args:
        path: Repo-relative path. Must be inside frontend/.
        start: 1-based starting line.
        lines: Maximum number of lines to return.
    """
    p = safe_frontend_path(path)
    text = p.read_text(errors="ignore").splitlines()
    start = max(1, int(start))
    end = min(len(text), start + max(1, int(lines)) - 1)
    numbered = [
        f"{i}: {text[i-1]}"
        for i in range(start, end + 1)
    ]
    return "\n".join(numbered)


@function_tool
async def check_frontend() -> str:
    """Run safe frontend-only validation checks. Never modifies files."""
    results: list[str] = []

    for p in sorted(FRONTEND.rglob("*.js")):
        proc = subprocess.run(
            ["node", "--check", str(p)],
            cwd=ROOT,
            text=True,
            capture_output=True,
        )
        if proc.returncode != 0:
            results.append(
                f"JS FAIL: {p.relative_to(ROOT)}\n{proc.stderr[-3000:]}"
            )

    proc = subprocess.run(
        ["git", "diff", "--check", "--", "frontend"],
        cwd=ROOT,
        text=True,
        capture_output=True,
    )
    if proc.returncode != 0:
        results.append(f"GIT DIFF CHECK FAIL\n{proc.stdout}\n{proc.stderr}")

    if not results:
        return "✅ Frontend validation passed."
    return "\n\n".join(results)


@function_tool
async def apply_frontend_patch(patch: str) -> str:
    """Apply a unified git patch ONLY to files inside frontend/.

    The patch is rejected if it references backend/, .git/, or any path outside
    frontend/. No commit or push is ever performed.
    """
    if time_left() <= 0:
        return "Deadline reached; patch rejected."

    files = re.findall(r"^\+\+\+ b/(.+)$", patch, re.M)
    files += re.findall(r"^--- a/(.+)$", patch, re.M)

    if not files:
        raise ValueError("Patch contains no recognizable file paths.")

    bad = [f for f in files if not f.startswith("frontend/")]
    if bad:
        raise ValueError(f"Rejected non-frontend patch paths: {bad}")

    check = subprocess.run(
        ["git", "apply", "--check", "--whitespace=error", "-"],
        cwd=ROOT,
        input=patch,
        text=True,
        capture_output=True,
    )

    if check.returncode != 0:
        return (
            "PATCH REJECTED BY git apply --check\n"
            + check.stdout
            + check.stderr
        )

    applied = subprocess.run(
        ["git", "apply", "--whitespace=error", "-"],
        cwd=ROOT,
        input=patch,
        text=True,
        capture_output=True,
    )

    if applied.returncode != 0:
        return "PATCH FAILED\n" + applied.stdout + applied.stderr

    return "✅ Frontend patch applied successfully. No commit/push performed."


async def ensure_browser() -> Page:
    global _pw, _context, _page

    if _page and not _page.is_closed():
        return _page

    _pw = await async_playwright().start()

    _browser = await _pw.chromium.launch(
        headless=False,
        args=[
            "--no-sandbox",
            "--disable-dev-shm-usage",
            "--disable-background-networking",
            "--disable-background-timer-throttling",
            "--disable-renderer-backgrounding",
            "--disable-sync",
            "--disable-default-apps",
            "--no-first-run",
        ],
    )

    _context = await _browser.new_context(
        viewport={"width": 1440, "height": 920}
    )

    _page = await _context.new_page()

    # The MILAN app intentionally sends CSP: upgrade-insecure-requests.
    # When the app is opened through the Windows-host HTTP address from WSL,
    # Chromium upgrades local asset URLs to HTTPS, but port 5000 is HTTP-only.
    # Intercept only this local host/port and fetch it back over HTTP.
    async def _local_http_route(route):
        req_url = route.request.url

        # Keep local MILAN HTTP resources local. CSP upgrades them to HTTPS;
        # this test browser must downgrade only the local development host.
        if req_url.startswith("https://172.23.80.1:5000/"):
            http_url = "http://" + req_url[len("https://"):]

            # Skip obsolete legacy JS that is not part of the current UI.
            legacy = (
                "milan-v87-android-diagnostic-logger.js",
                "milan-v91-android-no-reload-smooth-login.js",
                "milan-v92-new-era-ui-settings.js",
                "milan-v93-desktop-video-upload-ui.js",
                "milan-v94-product-grade-ui.js",
                "milan-v95-mobile-parity.js",
                "milan-v97-android-video-playback-fix.js",
                "milan-v98-android-video-hard-play.js",
                "milan-v100-background-audio.js",
            )

            if any(name in http_url for name in legacy):
                await route.abort()
                return

            try:
                response = await route.fetch(url=http_url)
                await route.fulfill(
                    status=response.status,
                    headers=response.headers,
                    body=await response.body(),
                )
            except Exception:
                try:
                    await route.abort()
                except Exception:
                    pass
            return

        await route.continue_()

    await _context.route(
        "https://172.23.80.1:5000/**",
        _local_http_route,
    )

    await _page.goto(URL, wait_until="commit", timeout=15000)
    return _page


@function_tool
async def browser_inspect() -> Any:
    """Open localhost MILAN app and return DOM diagnostics plus a screenshot image."""
    page = await ensure_browser()

    await page.wait_for_timeout(800)

    title = await page.title()
    url = page.url

    body_text = await page.locator("body").inner_text(timeout=5000)
    body_text = body_text[:12000]

    viewport = await page.evaluate(
        """() => ({
            width: window.innerWidth,
            height: window.innerHeight,
            dpr: window.devicePixelRatio,
            scrollHeight: document.documentElement.scrollHeight
        })"""
    )

    visible = await page.locator("body *:visible").count()

    screenshot = await page.screenshot(
        path=str(ARTIFACTS / f"ui-{int(time.time())}.png"),
        full_page=True,
    )

    b64 = base64.b64encode(screenshot).decode()

    return [
        {
            "type": "text",
            "text": json.dumps({
                "time_left_seconds": time_left(),
                "url": url,
                "title": title,
                "viewport": viewport,
                "visible_elements": visible,
                "body_text": body_text,
            }, indent=2),
        },
        ToolOutputImage(
            image_url=f"data:image/png;base64,{b64}",
            detail="high",
        ),
    ]


@function_tool
async def browser_action(
    action: str,
    selector: str = "",
    value: str = "",
) -> str:
    """Perform safe browser UI testing on localhost MILAN.

    Args:
        action: One of reload, click, hover, fill, viewport.
        selector: CSS selector for click/hover/fill.
        value: Text for fill, or WIDTHxHEIGHT for viewport.
    """
    page = await ensure_browser()

    if action == "reload":
        await page.reload(wait_until="domcontentloaded", timeout=30000)
        await page.wait_for_timeout(700)
        return "✅ Reloaded localhost MILAN."

    if action == "click":
        await page.locator(selector).first.click(timeout=7000)
        await page.wait_for_timeout(500)
        return f"✅ Clicked {selector}"

    if action == "hover":
        await page.locator(selector).first.hover(timeout=7000)
        await page.wait_for_timeout(350)
        return f"✅ Hovered {selector}"

    if action == "fill":
        await page.locator(selector).first.fill(value, timeout=7000)
        return f"✅ Filled {selector}"

    if action == "viewport":
        m = re.fullmatch(r"\s*(\d+)\s*x\s*(\d+)\s*", value)
        if not m:
            raise ValueError("Viewport must look like 1440x920")
        await page.set_viewport_size(
            {"width": int(m.group(1)), "height": int(m.group(2))}
        )
        await page.wait_for_timeout(300)
        return f"✅ Viewport set to {value}"

    raise ValueError(f"Unsupported browser action: {action}")


AGENT = Agent(
    name="MILAN Frontend Specialist",
    instructions="""
You are an expert product UI/UX engineer working ONLY on the MILAN frontend.

Goal:
Make the logged-in MILAN dashboard look exceptionally polished, premium,
cohesive, visually calm, and delightful on Windows desktop browsers.

You may:
- inspect frontend HTML/CSS/JS
- inspect localhost:5000/app through Playwright
- take screenshots
- test hover/click/reload/viewport behavior
- edit ONLY files inside /mnt/d/milan-app/frontend/
- make incremental, reversible frontend improvements

You must NOT:
- modify backend/
- modify database files
- modify server code
- modify .env files
- commit
- push
- change authentication logic
- change API contracts
- remove working functionality merely for aesthetics

Priority:
1. Remove visual clutter and duplicated/stray components.
2. Establish one consistent visual hierarchy.
3. Make the logged-in dashboard feel like one premium product.
4. Keep navigation, feed, profile, composer, notifications, My People,
   dialogs and responsive layouts visually consistent.
5. Preserve existing behavior.
6. Prefer small, targeted CSS/HTML changes over rewrites.
7. Before changing something, inspect the actual DOM and screenshot.
8. After every meaningful change, validate the frontend and re-inspect.
9. Do not make changes just to create activity. Change something only when
   there is a concrete visual/usability improvement.
10. Never touch anything outside frontend/.

The user asked for a 10-minute autonomous refinement session.
Work incrementally until the deadline is reached.
""",
    tools=[
        inspect_frontend,
        read_frontend_file,
        check_frontend,
        browser_inspect,
        browser_action,
        apply_frontend_patch,
    ],
)


async def main():
    if not os.getenv("OPENAI_API_KEY"):
        raise SystemExit("OPENAI_API_KEY is not set in this shell.")

    page = await ensure_browser()

    text = await page.locator("body").inner_text(timeout=5000)

    if "Welcome back" in text or "Login" in text:
        print()
        print("🔐 MILAN login screen detected.")
        print("👉 Login manually in the opened Chromium browser.")
        print("⏳ Agent will automatically detect successful login.")
        
        login_deadline = time.monotonic() + 300  # up to 5 minutes for manual login

        while time.monotonic() < login_deadline:
            if page.is_closed():
                raise RuntimeError("Chromium page was closed before login.")

            try:
                token = await page.evaluate(
                    "() => localStorage.getItem('milan_token') || ''"
                )
            except Exception:
                token = ""

            current_url = page.url
            dashboard_signal = False

            try:
                dashboard_signal = await page.locator(
                    ".layout, #feed, #appView"
                ).count() > 0
            except Exception:
                pass

            if token.strip() and (
                "/app" in current_url or dashboard_signal
            ):
                print("✅ MILAN login detected.")
                break

            await asyncio.sleep(1)
        else:
            raise RuntimeError(
                "Login was not detected within 5 minutes. Chromium remains usable for manual inspection."
            )

    # Start the 10-minute optimization window AFTER login.
    deadline = time.monotonic() + DEADLINE_SECONDS
    iteration = 0

    while time.monotonic() < deadline:
        iteration += 1
        remaining = int(deadline - time.monotonic())

        if remaining <= 0:
            break

        prompt = f"""
Iteration {iteration}.
You have approximately {remaining} seconds remaining.

Start by inspecting the current logged-in MILAN dashboard with browser_inspect.
Then identify ONE OR TWO highest-value visual problems.
Use the screenshot and DOM evidence.

Examples:
- cluttered or duplicated UI
- poor spacing/alignment
- weak visual hierarchy
- awkward component placement
- inconsistent card/button/input treatment
- excessive chrome
- bad desktop proportions
- poor hover/focus behavior
- mobile/tablet breakage
- visual loading/reload issues

Apply only concrete frontend improvements.
Run check_frontend after edits.
Re-inspect the browser after edits.

Do not touch backend or authentication.
Do not commit or push.
"""

        try:
            result = await Runner.run(AGENT, prompt)
            print(f"\n===== ITERATION {iteration} =====")
            print(result.final_output[:5000])
        except Exception as exc:
            print(f"\n⚠️ Agent iteration {iteration} failed: {exc}")

        await asyncio.sleep(2)

    print("\n==============================")
    print("✅ MILAN FRONTEND AGENT FINISHED")
    print(f"Iterations: {iteration}")
    print("Time limit: 600 seconds")
    print("Backend untouched.")
    print("Git commit/push: NOT performed.")
    print("==============================")


if __name__ == "__main__":
    asyncio.run(main())
