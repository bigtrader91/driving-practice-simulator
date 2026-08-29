# Cloudflare Pages Deployment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish the exact current `origin/main` build of the driving simulator at `https://driving.pysyntax.com` with public runtime proof and no mutation of the dirty canonical checkout.

**Architecture:** Build an immutable `origin/main` commit in a detached release worktree, upload only `dist/` to a Direct Upload Cloudflare Pages project, then attach one custom hostname and one proxied CNAME. Every Cloudflare mutation is preceded by an exact-resource read; conflicts stop visibly, and public HTTP, TLS, asset, browser, and local-persistence readbacks determine success.

**Tech Stack:** React 19, TypeScript 5.7, Vite 6, Vitest 4, Cloudflare Pages Direct Upload, Wrangler, Cloudflare REST API, Playwright Chromium

**Spec:** `docs/superpowers/specs/2026-08-29-cloudflare-pages-deployment-design.md`

## Global Constraints

- Pages project: `driving-practice-simulator`; production branch: `main`.
- Public hostname: `driving.pysyntax.com`; DNS target is the exact `subdomain` returned by the Pages project API.
- Release source must be one 40-character SHA equal to the live `origin/main` at execution time.
- Deploy only `dist/` produced in a clean detached release worktree.
- Direct Upload cannot later switch to Cloudflare Git integration; future automation must keep using Wrangler uploads or use an explicitly migrated project.
- Do not add GitHub Actions, Cloudflare Git integration, GA4, GTM, GSC, sitemap work, or application changes.
- Never print or commit Cloudflare tokens. Never overwrite or delete a conflicting project, hostname, or DNS record.
- Preserve the canonical checkout and every unrelated worktree.
- Hard ceiling: one Pages project create, one Pages deployment, one custom-domain attach, and one DNS record create. No automatic retries of mutations.

---

### Task 1: Prepare an immutable release worktree and artifact

**Files:**
- Read: `package.json`
- Read: `package-lock.json`
- Generate: `/tmp/dps-cloudflare-release/dist/`

**Interfaces:**
- Consumes: live `refs/heads/main` from `origin`
- Produces: `RELEASE_SHA`, `RELEASE_WORKTREE`, and a verified `dist/` directory

- [ ] **Step 1: Resolve the live release commit and ensure the target worktree path is unused**

```bash
CANONICAL_ROOT=/home/bigtrader91/src/github.com/bigtrader91/driving-practice-simulator
RELEASE_SHA=$(git -C "$CANONICAL_ROOT" ls-remote origin refs/heads/main | awk '{print $1}')
test "${#RELEASE_SHA}" -eq 40
RELEASE_WORKTREE=/tmp/dps-cloudflare-release
test ! -e "$RELEASE_WORKTREE"
git -C "$CANONICAL_ROOT" status --porcelain -uall | tee /tmp/dps-canonical-status-before.txt
```

Expected: `RELEASE_SHA` is 40 characters and the final `test` exits 0. If the path exists, inspect it and stop; do not remove it automatically.

- [ ] **Step 2: Fetch and create the detached release worktree**

```bash
CANONICAL_ROOT=/home/bigtrader91/src/github.com/bigtrader91/driving-practice-simulator
RELEASE_SHA=$(git -C "$CANONICAL_ROOT" ls-remote origin refs/heads/main | awk '{print $1}')
RELEASE_WORKTREE=/tmp/dps-cloudflare-release
git -C "$CANONICAL_ROOT" fetch origin main
test "$(git -C "$CANONICAL_ROOT" rev-parse origin/main)" = "$RELEASE_SHA"
git -C "$CANONICAL_ROOT" worktree add --detach "$RELEASE_WORKTREE" "$RELEASE_SHA"
```

Expected: the worktree HEAD equals `RELEASE_SHA` and no canonical-checkout file changes.

- [ ] **Step 3: Install locked dependencies and run the complete local gates**

```bash
RELEASE_WORKTREE=/tmp/dps-cloudflare-release
cd "$RELEASE_WORKTREE"
npm ci
npm test -- --run
npx tsc --noEmit
npm run build
git status --porcelain -uall
```

Expected: 29 test files and 177 tests pass, typecheck and build exit 0, and Git status is empty. The existing bundle-size and dependency-audit warnings do not authorize dependency or code changes.

- [ ] **Step 4: Record artifact boundaries**

```bash
RELEASE_WORKTREE=/tmp/dps-cloudflare-release
test -f dist/index.html
find dist -type f | LC_ALL=C sort
find dist -type f | wc -l
find dist -type f -size +25M -print
```

Expected: `dist/index.html` exists, the file inventory is visible, and the final command prints nothing because Wrangler Pages uploads permit at most 25 MiB per file.

### Task 2: Perform read-only Cloudflare identity and resource preflight

**Files:**
- Read only: `/home/bigtrader91/.config/.wrangler/config/default.toml`
- Temporary secret state: process-local shell variables only

**Interfaces:**
- Consumes: Pages project name, account ID `2afd6a64c43c506cb297aabcd6c246b7`, zone `pysyntax.com`
- Produces: a visible classification of project, custom-domain, and exact DNS-record state without mutation

- [ ] **Step 1: Verify Wrangler identity and supported Pages commands**

```bash
RELEASE_WORKTREE=/tmp/dps-cloudflare-release
cd "$RELEASE_WORKTREE"
npx wrangler whoami
npx wrangler pages project list --json
npx wrangler pages project create --help
npx wrangler pages deploy --help
npx wrangler pages deployment list --help
```

Expected: identity is `dahy949@gmail.com`, account ID is `2afd6a64c43c506cb297aabcd6c246b7`, and help shows project-name, production-branch, branch, commit-hash, and JSON/list support needed below. If an expected flag is absent, stop and revise the exact command instead of guessing.

- [ ] **Step 2: Inspect the exact Pages project and custom hostname through the API**

```bash
ACCOUNT_ID=2afd6a64c43c506cb297aabcd6c246b7
PROJECT_NAME=driving-practice-simulator
CUSTOM_HOST=driving.pysyntax.com
PAGES_TOKEN=$(python3 -c 'import pathlib,re; text=pathlib.Path("/home/bigtrader91/.config/.wrangler/config/default.toml").read_text(); match=re.search(r"oauth_token = \"([^\"]+)\"", text); assert match; print(match.group(1))')
curl -sS -o /tmp/dps-pages-project-preflight.json -w '%{http_code}\n' \
  "https://api.cloudflare.com/client/v4/accounts/$ACCOUNT_ID/pages/projects/$PROJECT_NAME" \
  -H "Authorization: Bearer $PAGES_TOKEN"
curl -sS -o /tmp/dps-pages-domain-preflight.json -w '%{http_code}\n' \
  "https://api.cloudflare.com/client/v4/accounts/$ACCOUNT_ID/pages/projects/$PROJECT_NAME/domains/$CUSTOM_HOST" \
  -H "Authorization: Bearer $PAGES_TOKEN"
curl -sS -o /tmp/dps-pages-deployments-before.json -w '%{http_code}\n' \
  "https://api.cloudflare.com/client/v4/accounts/$ACCOUNT_ID/pages/projects/$PROJECT_NAME/deployments" \
  -H "Authorization: Bearer $PAGES_TOKEN"
unset PAGES_TOKEN
python3 -m json.tool /tmp/dps-pages-project-preflight.json
python3 -m json.tool /tmp/dps-pages-domain-preflight.json
python3 -m json.tool /tmp/dps-pages-deployments-before.json
```

Expected: each response is either Cloudflare `404`/not-found or an exact compatible resource. When the project exists, record its current production deployment as the rollback candidate. If the project has a different production branch, custom-domain set, or unrelated deployment purpose, stop. Do not update it.

Record the IDs that existed before the permitted deployment, and record the actual Pages subdomain when the project already exists:

```bash
python3 - <<'PY'
import json
from pathlib import Path

deployments = json.loads(Path('/tmp/dps-pages-deployments-before.json').read_text())
before_ids = [] if not deployments.get('success') else [item['id'] for item in deployments['result']]
Path('/tmp/dps-pages-deployment-ids-before.txt').write_text('\n'.join(before_ids) + ('\n' if before_ids else ''))

project = json.loads(Path('/tmp/dps-pages-project-preflight.json').read_text())
if project.get('success'):
    subdomain = project['result']['subdomain']
    assert subdomain.endswith('.pages.dev'), subdomain
    Path('/tmp/dps-pages-subdomain.txt').write_text(subdomain + '\n')
PY
```

- [ ] **Step 3: Inspect only the exact DNS name in the authenticated Cloudflare dashboard**

Open `pysyntax.com` → DNS → Records in the already authenticated Cloudflare browser session, enter `driving` in the record search box, and inspect the complete filtered row set before opening the add form. Do not discover or enumerate credentials from unrelated applications. If dashboard access is unavailable, stop and request one explicitly identified, least-privilege `pysyntax.com` DNS Edit credential through an approved secret-input mechanism; never place the credential in command arguments or logs.

Expected: the result is empty or is exactly one proxied CNAME whose target equals `/tmp/dps-pages-subdomain.txt` when the Pages project already exists. Any other result is a stop condition.

### Task 3: Create or reuse the Pages project and deploy once

**Files:**
- Deploy: `$RELEASE_WORKTREE/dist/`
- Record: `/tmp/dps-pages-deploy-output.txt`

**Interfaces:**
- Consumes: verified `dist/`, compatible/absent project state, `RELEASE_SHA`
- Produces: one production Pages deployment URL associated with `RELEASE_SHA`

- [ ] **Step 1: Create the project only when preflight proved it absent**

```bash
RELEASE_WORKTREE=/tmp/dps-cloudflare-release
cd "$RELEASE_WORKTREE"
npx wrangler pages project create driving-practice-simulator --production-branch main
```

Expected when absent: project creation succeeds once. If preflight proved the compatible project already exists, skip this command and record the skip visibly. In either case, read back the project and persist its API-returned subdomain:

```bash
ACCOUNT_ID=2afd6a64c43c506cb297aabcd6c246b7
PROJECT_NAME=driving-practice-simulator
PAGES_TOKEN=$(python3 -c 'import pathlib,re; text=pathlib.Path("/home/bigtrader91/.config/.wrangler/config/default.toml").read_text(); match=re.search(r"oauth_token = \"([^\"]+)\"", text); assert match; print(match.group(1))')
curl -fsS \
  "https://api.cloudflare.com/client/v4/accounts/$ACCOUNT_ID/pages/projects/$PROJECT_NAME" \
  -H "Authorization: Bearer $PAGES_TOKEN" -o /tmp/dps-pages-project-final.json
unset PAGES_TOKEN
python3 - <<'PY'
import json
from pathlib import Path

project = json.loads(Path('/tmp/dps-pages-project-final.json').read_text())
assert project['success'], project.get('errors')
result = project['result']
assert result['name'] == 'driving-practice-simulator', result
assert result['production_branch'] == 'main', result
subdomain = result['subdomain']
assert subdomain.endswith('.pages.dev'), subdomain
Path('/tmp/dps-pages-subdomain.txt').write_text(subdomain + '\n')
print({'name': result['name'], 'subdomain': subdomain})
PY
```

Expected: the project name and production branch are exact, and `/tmp/dps-pages-subdomain.txt` contains the returned `.pages.dev` hostname. Do not derive it from the requested project name.

- [ ] **Step 2: Deploy the verified artifact once**

```bash
RELEASE_WORKTREE=/tmp/dps-cloudflare-release
RELEASE_SHA=$(git -C "$RELEASE_WORKTREE" rev-parse HEAD)
cd "$RELEASE_WORKTREE"
set -o pipefail
npx wrangler pages deploy dist \
  --project-name driving-practice-simulator \
  --branch main \
  --commit-hash "$RELEASE_SHA" \
  --commit-message "Deploy driving simulator $RELEASE_SHA" | tee /tmp/dps-pages-deploy-output.txt
```

Expected: one deployment URL is printed. Do not repeat the deploy command automatically if it fails or returns an ambiguous result.

- [ ] **Step 3: Read back the deployment metadata**

```bash
ACCOUNT_ID=2afd6a64c43c506cb297aabcd6c246b7
PROJECT_NAME=driving-practice-simulator
RELEASE_WORKTREE=/tmp/dps-cloudflare-release
RELEASE_SHA=$(git -C "$RELEASE_WORKTREE" rev-parse HEAD)
PAGES_TOKEN=$(python3 -c 'import pathlib,re; text=pathlib.Path("/home/bigtrader91/.config/.wrangler/config/default.toml").read_text(); match=re.search(r"oauth_token = \"([^\"]+)\"", text); assert match; print(match.group(1))')
curl -sS "https://api.cloudflare.com/client/v4/accounts/$ACCOUNT_ID/pages/projects/$PROJECT_NAME/deployments" \
  -H "Authorization: Bearer $PAGES_TOKEN" -o /tmp/dps-pages-deployments.json
unset PAGES_TOKEN
RELEASE_SHA="$RELEASE_SHA" python3 - <<'PY'
import json
import os
from pathlib import Path

release_sha = os.environ['RELEASE_SHA']
payload = json.loads(Path('/tmp/dps-pages-deployments.json').read_text())
assert payload['success'], payload.get('errors')
deployments = payload['result']
before_ids = set(Path('/tmp/dps-pages-deployment-ids-before.txt').read_text().splitlines())
created = [item for item in deployments if item['id'] not in before_ids]
assert len(created) == 1, created
deployment = created[0]
metadata = deployment.get('deployment_trigger', {}).get('metadata', {})
assert deployment.get('environment') == 'production', deployment
assert deployment.get('latest_stage', {}).get('status') == 'success', deployment
assert metadata.get('branch') == 'main', metadata
assert metadata.get('commit_hash') == release_sha, metadata
deployment_url = deployment['url']
Path('/tmp/dps-pages-deployment-id.txt').write_text(deployment['id'] + '\n')
Path('/tmp/dps-pages-deployment-url.txt').write_text(deployment_url + '\n')
print(deployment_url)
PY
```

Expected: exactly one deployment ID was added after preflight; that deployment is a successful `main` production deployment for the full release SHA, and its ID and URL are stored. A previous deployment of the same SHA does not make this readback ambiguous.

### Task 4: Attach the custom hostname and create only the expected DNS record

**Files:**
- Temporary API response: `/tmp/dps-pages-domain-attach.json`
- Browser evidence: exact filtered DNS row before and after the single permitted save

**Interfaces:**
- Consumes: healthy Pages deployment, exact preflight states
- Produces: attached `driving.pysyntax.com` and one compatible proxied CNAME

- [ ] **Step 1: Attach the Pages custom hostname only when absent**

```bash
ACCOUNT_ID=2afd6a64c43c506cb297aabcd6c246b7
PROJECT_NAME=driving-practice-simulator
CUSTOM_HOST=driving.pysyntax.com
PAGES_TOKEN=$(python3 -c 'import pathlib,re; text=pathlib.Path("/home/bigtrader91/.config/.wrangler/config/default.toml").read_text(); match=re.search(r"oauth_token = \"([^\"]+)\"", text); assert match; print(match.group(1))')
curl -sS -X POST \
  "https://api.cloudflare.com/client/v4/accounts/$ACCOUNT_ID/pages/projects/$PROJECT_NAME/domains" \
  -H "Authorization: Bearer $PAGES_TOKEN" \
  -H 'Content-Type: application/json' \
  --data '{"name":"driving.pysyntax.com"}' \
  -o /tmp/dps-pages-domain-attach.json
unset PAGES_TOKEN
python3 -m json.tool /tmp/dps-pages-domain-attach.json
```

Expected when absent: `success: true`. If preflight proved the exact hostname already attached, skip this mutation. Attaching the hostname before creating the CNAME follows Cloudflare's required custom-domain flow.

- [ ] **Step 2: Create the DNS record in the dashboard only when the exact-name preflight was empty**

Read the exact target from `/tmp/dps-pages-subdomain.txt`. In the still-authenticated `pysyntax.com` DNS dashboard, open **Add record** and set Type `CNAME`, Name `driving`, Target to that exact Pages subdomain, Proxy status `Proxied`, and TTL `Auto`. Read the completed form back before clicking **Save**, then click it once. If the exact compatible record already existed, skip this mutation. Do not overwrite, delete, or retry an ambiguous save.

Expected when absent: the filtered table contains exactly one row for `driving.pysyntax.com`, with Type `CNAME`, the recorded Pages subdomain as Content, Proxy status `Proxied`, and TTL `Auto`.

- [ ] **Step 3: Re-read both resources without mutating them**

```bash
ACCOUNT_ID=2afd6a64c43c506cb297aabcd6c246b7
PROJECT_NAME=driving-practice-simulator
CUSTOM_HOST=driving.pysyntax.com
PAGES_TOKEN=$(python3 -c 'import pathlib,re; text=pathlib.Path("/home/bigtrader91/.config/.wrangler/config/default.toml").read_text(); match=re.search(r"oauth_token = \"([^\"]+)\"", text); assert match; print(match.group(1))')
for attempt in 1 2 3 4 5 6 7 8; do
  curl -fsS \
    "https://api.cloudflare.com/client/v4/accounts/$ACCOUNT_ID/pages/projects/$PROJECT_NAME/domains/$CUSTOM_HOST" \
    -H "Authorization: Bearer $PAGES_TOKEN" -o /tmp/dps-pages-domain-final.json
  status=$(python3 -c 'import json; print(json.load(open("/tmp/dps-pages-domain-final.json"))["result"]["status"])')
  echo "domain readback $attempt: $status"
  test "$status" = active && break
  test "$attempt" = 8 && exit 1
  sleep 20
done
unset PAGES_TOKEN
python3 - <<'PY'
import json
from pathlib import Path

domain = json.loads(Path('/tmp/dps-pages-domain-final.json').read_text())
result = domain['result']
assert domain['success'], domain
assert result['name'] == 'driving.pysyntax.com', result
assert result['status'] == 'active', result
assert result.get('validation_data', {}).get('status') == 'active', result
print({'domain': result['name'], 'status': result['status']})
PY
```

Re-run the dashboard `driving` filter and read back the exact single DNS row as in Step 2. Expected: the Pages project reports the custom domain and validation as `active`, and the dashboard shows exactly one proxied CNAME to the recorded Pages subdomain.

### Task 5: Verify public HTTP, TLS, assets, and browser behavior

**Files:**
- Create temporary: `/tmp/dps-cloudflare-browser-smoke.py`
- Create temporary screenshots: `/tmp/dps-cloudflare-*.png`

**Interfaces:**
- Consumes: Pages deployment URL and `https://driving.pysyntax.com`
- Produces: public runtime evidence for both desktop and mobile behavior

- [ ] **Step 1: Poll the custom hostname without retrying mutations**

```bash
PAGES_DEPLOYMENT_URL=$(python3 -c 'from pathlib import Path; print(Path("/tmp/dps-pages-deployment-url.txt").read_text().strip())')
test -n "$PAGES_DEPLOYMENT_URL"
curl -sS -o /dev/null -w '%{http_code} %{ssl_verify_result}\n' --max-time 10 "$PAGES_DEPLOYMENT_URL"
for attempt in 1 2 3 4 5 6 7 8; do
  result=$(curl -sS -o /dev/null -w '%{http_code} %{ssl_verify_result}' --max-time 10 https://driving.pysyntax.com/ || true)
  echo "readback $attempt: $result"
  test "$result" = '200 0' && break
  test "$attempt" = 8 && exit 1
  sleep 20
done
```

Expected: the immutable Pages deployment URL and the custom hostname both reach `200 0`. A transient `522` during propagation is observable but does not authorize another deploy or DNS mutation.

- [ ] **Step 2: Verify required public assets**

```bash
for asset in compact sedan suv truck traffic-compact; do
  curl -fsS -o /dev/null "https://driving.pysyntax.com/models/vehicles/$asset.glb"
done
curl -fsS -o /dev/null https://driving.pysyntax.com/
```

Expected: every request exits 0.

- [ ] **Step 3: Create the temporary Playwright public smoke script**

Create `/tmp/dps-cloudflare-browser-smoke.py` with `apply_patch` and this exact content:

```python
from contextlib import ExitStack

from playwright.sync_api import expect, sync_playwright


URL = "https://driving.pysyntax.com"
STORAGE_KEY = "driveprep.training-session.v1"
ASSETS = ["compact.glb", "sedan.glb", "suv.glb", "truck.glb"]


def verify(browser, label: str, width: int, height: int) -> None:
    page = browser.new_page(viewport={"width": width, "height": height})
    page.set_default_timeout(10_000)
    errors: list[str] = []
    page.on("console", lambda message: errors.append(message.text) if message.type == "error" else None)
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.goto(URL, wait_until="networkidle")
    page.evaluate("localStorage.clear()")
    page.reload(wait_until="networkidle")

    with ExitStack() as stack:
        responses = [
            stack.enter_context(page.expect_response(
                lambda response, asset=asset: response.url.endswith(f"/models/vehicles/{asset}")
            ))
            for asset in ASSETS
        ]
        page.get_by_role("button", name="훈련 시작", exact=True).click()
        loaded = [response.value for response in responses]
    assert all(response.ok for response in loaded), [(response.url, response.status) for response in loaded]
    main_canvas = page.locator("div.cursor-crosshair > canvas").first
    expect(main_canvas).to_be_visible(timeout=30_000)
    canvas_box = main_canvas.bounding_box()
    assert canvas_box is not None
    assert canvas_box["width"] >= width * 0.9, canvas_box
    assert canvas_box["height"] >= height * 0.9, canvas_box
    expect(page.get_by_text("조작 적응", exact=False).first).to_be_visible()
    page.wait_for_function("key => localStorage.getItem(key) !== null", arg=STORAGE_KEY)
    page.screenshot(path=f"/tmp/dps-cloudflare-{label}-active.png", full_page=True)

    page.reload(wait_until="networkidle")
    expect(page.get_by_role("button", name="훈련 이어하기", exact=True)).to_be_visible()
    expect(page.get_by_role("button", name="새 훈련 시작", exact=True)).to_be_visible()
    assert errors == [], errors
    print({"viewport": label, "errors": errors})
    page.close()


with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True)
    verify(browser, "desktop-1440x900", 1440, 900)
    verify(browser, "portrait-390x844", 390, 844)
    browser.close()
```

- [ ] **Step 4: Run the public browser smoke**

```bash
python3 /tmp/dps-cloudflare-browser-smoke.py
```

Expected: both viewports print an empty error list, the asynchronously inserted main WebGL canvas is visible and at least 90% of the viewport in both dimensions, the active training HUD is visible, vehicle asset responses succeed, and reload offers resume/new-session choices.

If any Task 5 check fails, do not deploy again or mutate DNS. Report the failed proof and the preflight production deployment from `/tmp/dps-pages-deployments-before.json`. If that prior deployment was known healthy, request explicit rollback approval before promoting or redeploying it; if this was the first deployment, preserve the diagnostic state and stop.

### Task 6: Final release audit and handoff

**Files:**
- Read: `/tmp/dps-pages-deployments.json`
- Read: temporary Pages, DNS, curl, and browser evidence

**Interfaces:**
- Consumes: all previous task evidence
- Produces: exact live URL, release SHA, deployment URL, and preservation report

- [ ] **Step 1: Confirm Cloudflare and public state one final time**

```bash
CANONICAL_ROOT=/home/bigtrader91/src/github.com/bigtrader91/driving-practice-simulator
RELEASE_WORKTREE=/tmp/dps-cloudflare-release
cd "$RELEASE_WORKTREE"
npx wrangler pages deployment list --project-name driving-practice-simulator --json > /tmp/dps-pages-deployments-final.json
curl -sS -o /dev/null -w '%{http_code} %{ssl_verify_result}\n' https://driving.pysyntax.com/
git -C "$RELEASE_WORKTREE" rev-parse HEAD
git -C "$RELEASE_WORKTREE" status --porcelain -uall
git -C "$CANONICAL_ROOT" status --porcelain -uall | tee /tmp/dps-canonical-status-after.txt
diff -u /tmp/dps-canonical-status-before.txt /tmp/dps-canonical-status-after.txt
git -C "$CANONICAL_ROOT" ls-remote origin refs/heads/main
```

Expected: custom hostname is `200 0`, release HEAD equals live `origin/main`, release worktree is clean, and canonical status matches its pre-release state.

- [ ] **Step 2: Remove only transient non-secret evidence after recording the result**

```bash
rm -f /tmp/dps-pages-project-preflight.json \
  /tmp/dps-pages-project-final.json \
  /tmp/dps-pages-domain-preflight.json \
  /tmp/dps-pages-deployments-before.json \
  /tmp/dps-pages-domain-attach.json
```

Expected: no token was written to disk. Preserve the release worktree, deployment output, deployment metadata, browser script, and screenshots until the user separately approves cleanup.

- [ ] **Step 3: Report the release without creating repository backlog noise**

Report the exact source SHA, Pages deployment URL, `https://driving.pysyntax.com`, HTTP/TLS result, asset/browser evidence, Cloudflare project/domain state, and canonical-checkout preservation. Create a GitHub issue only for a real product-quality, stability, result-changing, recurring-operating-cost, security, or blocking defect.
