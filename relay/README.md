# Wish Jar relay

A Cloudflare Worker on the Workers Free plan. It carries a photo from a
parent's phone to Wish Jar (WJ-41) and holds each family's online jar, shared
by the family's devices (WJ-46). `wrangler.jsonc` has its setup and
`src/jar/api.ts` its API. Merges to main that touch `relay/` deploy it
(`.github/workflows/relay.yml`).

```bash
pnpm install
pnpm dev                # http://localhost:8787
pnpm run typecheck
pnpm test               # workerd locally, no Cloudflare account needed
```

## Keeping one caller from using it up for every family (WJ-51)

Every family shares one Free account: 100,000 requests a day, 100,000 rows
written a day and 5 GB of storage. Some endpoints need no token, and anyone can
get a token by starting a family. Without limits, one script could take the
relay down for everyone until 00:00 UTC, or fill its storage. There are five
guards.

### 1. The edge rules (set by hand in the dashboard)

Two WAF rules on the blastin.dev zone turn requests away before they reach the
Worker, so they don't count toward the 100,000 requests: a rate limiting rule
for fast floods, and a custom rule for the paths and methods the relay doesn't
serve. They cover the relay's `wish-jar-api.blastin.dev`, and its paths on
`wish-jar.blastin.dev`, which the site passes on to it (WJ-63). The
`workers.dev` address answers only the old builds' photo-code paths
([below](#the-workersdev-address-wj-58)).

#### The rate limiting rule

The Free plan has one rate limiting rule, counts by IP only, and its period
and duration are fixed at 10 seconds. Its expression can only use the URI path
(no host, no method).

In the dashboard, go to **blastin.dev → Security → WAF → Rate limiting rules →
Create rule** and fill it in like this:

| Setting | Value |
| --- | --- |
| Rule name | `Wish Jar relay: open endpoints` |
| If incoming requests match | Field **URI Path**, operator **is in**, values `/families`, `/codes`, `/devices/codes`, `/devices/join`, `/devices/echo-show`, `/jar/live` |
| With the same characteristics | IP (the only choice on Free) |
| When rate exceeds | **10** requests per **10 seconds** |
| Then take action | **Block** (Cloudflare answers 429) |
| For duration | **10 seconds** |

The same rule as an expression (**Edit expression**):

```
(http.request.uri.path in {"/families" "/codes" "/devices/codes" "/devices/join" "/devices/echo-show" "/jar/live"})
```

If the builder has no **is in**, use one **equals** line per path, joined with
**Or**.

Why these paths and this rate:

- They're the endpoints a script would loop on: starting families, asking for
  codes, joining, the Echo Show's rejoin (none needs a token), and opening the
  live socket, which wakes a family's jar.
- `/codes` is matched exactly, so the device polling `/codes/:code/photo`
  every 2 seconds isn't counted. `/photos` isn't in the rule: a new family
  uploads its 7 starter photos at once.
- The rule can't tell methods apart, so CORS preflights (`OPTIONS`) count
  too. Browsers keep a preflight for 10 minutes (`Access-Control-Max-Age`).
- A family does a few of these a minute at most. When the Wi-Fi comes back,
  each device opens its socket once, with retries backing off from 1 second.
  Six devices on one home connection still stay under 10 in 10 seconds.
- Without a host in the expression, the rule matches these paths on every
  hostname of the zone, not only the relay's. Check that nothing else on
  blastin.dev uses them. The site at `wish-jar.blastin.dev` has no page at
  any of them: it passes them on to the relay (`site/worker.js`), so the rule
  guards them there too.
- A blocked call reaches Wish Jar's pages without CORS headers. The browser
  reports it as a lost connection, and the app tries again by itself a few
  seconds later.

#### Paths and methods the relay doesn't serve (WJ-58)

A WAF custom rule blocks every request to the relay that isn't one of its
routes, with one of the methods it answers there. The Free
plan has 5 custom rules, with Block and Managed Challenge among their actions,
and no regex. Its expressions can still use the host, the method, the path and
the query, and the `wildcard` operator (`*` is any run of characters, `/`
included, ignoring case).

The routes are `ROUTES` in `src/routes.ts`, with `OPTIONS` wherever Wish Jar's
pages send a CORS preflight. The Worker answers 404 to any path not in the
list, and `test/routes.test.ts` checks that the expression below is the one
`ROUTES` makes. So a route added to the Worker but not to the list fails its
own tests, and one added to the list but not here fails that test. When it
fails, the test prints the new expression: put it here and in the dashboard.

The relay is reached at two hosts, and the rule covers each in its own way:

- **`wish-jar-api.blastin.dev`**, the relay's own address: every path.
- **`wish-jar.blastin.dev`**, the site's since WJ-63: only the paths its
  Worker passes on to the relay through a service binding
  (`run_worker_first` in the root `wrangler.jsonc`, `SITE_FORWARDED_PATHS` in
  `src/routes.ts`; the test keeps the two the same). The site's pages and
  files are every other path, so the rule never blocks them. The service
  binding doesn't go through the zone again, so the rules see these requests
  once, at the site's host.

`site/worker.js` passes on whatever reaches it, any method and any path under
those globs (`/jar/anything`, `PUT /codes`), and the relay turns away what it
doesn't serve with a 404. Without the rule each of those costs a request of
the site's Worker and wakes the relay; with it, they're blocked at the edge
like the same requests at the relay's own address.

In the dashboard, go to **blastin.dev → Security → WAF → Custom rules →
Create rule** and fill it in like this:

| Setting | Value |
| --- | --- |
| Rule name | `Wish Jar relay: paths and methods it doesn't serve` |
| If incoming requests match | **Edit expression**, and paste the expression below (the builder can't make its parentheses) |
| Then take action | **Block** (Cloudflare answers 403) |

```
(http.host in {"wish-jar-api.blastin.dev" "wish-jar.blastin.dev"} and (http.host eq "wish-jar-api.blastin.dev" or http.request.uri.path wildcard "/codes" or http.request.uri.path wildcard "/codes/*" or http.request.uri.path wildcard "/families" or http.request.uri.path wildcard "/jar/*" or http.request.uri.path wildcard "/devices" or http.request.uri.path wildcard "/devices/*" or http.request.uri.path wildcard "/photos" or http.request.uri.path wildcard "/photos/*" or http.request.uri.path wildcard "/s" or http.request.uri.path wildcard "/s/*" or http.request.uri.path wildcard "/qr/*") and not ((http.request.uri.path eq "/" and http.request.method in {"GET"}) or (http.request.uri.path eq "/s" and http.request.method in {"GET"}) or (http.request.uri.path wildcard "/s/*" and http.request.method in {"GET" "POST"}) or (http.request.uri.path wildcard "/qr/*.svg" and http.request.method in {"GET"}) or (http.request.uri.path eq "/codes" and http.request.method in {"POST" "OPTIONS"}) or (http.request.uri.path wildcard "/codes/*" and http.request.method in {"GET" "DELETE" "OPTIONS"}) or (http.request.uri.path eq "/turnstile" and http.request.method in {"GET"}) or (http.request.uri.path eq "/families" and http.request.method in {"POST" "OPTIONS"}) or (http.request.uri.path eq "/jar/call" and http.request.method in {"POST" "OPTIONS"}) or (http.request.uri.path eq "/jar/live" and http.request.method in {"GET"}) or (http.request.uri.path eq "/devices" and http.request.method in {"GET" "OPTIONS"}) or (http.request.uri.path wildcard "/devices/*" and http.request.method in {"POST" "DELETE" "OPTIONS"}) or (http.request.uri.path eq "/photos" and http.request.method in {"POST" "OPTIONS"}) or (http.request.uri.path wildcard "/photos/*/*.jpg" and http.request.method in {"GET" "HEAD" "DELETE" "OPTIONS"})))
```

Why this rule and this action:

- **Block, not Managed Challenge.** Nothing Wish Jar or the phone's page calls
  matches it, so there's no person to let through, and a challenge is a page
  that a `fetch` or a WebSocket can't solve.
- **What it takes off the Worker's day:** scans for `/wp-login.php`, `/.env`
  and the like, and methods the relay never answers, such as `PUT`. Floods of
  requests that look like the app's are left to the rate limiting rule and the
  Worker's own limits below.
- **Query strings** (`/turnstile?sitekey=…`, `/s?code=…`,
  `/jar/live?client=…`, `?sig=` on photo URLs) aren't matched; the Worker
  checks them.
- **The hosts are in the expression**, so other sites on blastin.dev aren't
  touched. It uses 1 of the 5 custom rules, and about 1,800 of the 4,096
  characters an expression can have.
- **Paths are matched with `wildcard`**, which ignores case, so on the site's
  host it may take in a case variant the site doesn't pass on (`/JAR/x`).
  None of those is a page of the site.

### The workers.dev address (WJ-58)

The relay's `workers.dev` address stays on (`workers_dev: true` in
`wrangler.jsonc`) because builds of Wish Jar made while it was
`PHOTO_RELAY_URL` (WJ-41, until WJ-42 moved the app to the blastin.dev
addresses on 2026-10-17) still call it. The frame app bundles the web export
it was built with, so a frame built then keeps calling it until it's built
again.

Those builds only knew the photo codes, so there the Worker answers only their
paths (`WORKERS_DEV_PATHS` in `src/routes.ts`), and 404 to everything else
before any Durable Object is woken:

| Who | Calls |
| --- | --- |
| The device | `POST /codes`, `GET /codes/:code/photo`, `DELETE /codes/:code` (with their preflights), `GET /qr/:code.svg` |
| The parent's phone, at the address the device showed or its QR code | `GET /`, `GET /s?code=…`, `GET /s/:code`, `POST /s/:code/photo` |

- **Served, not redirected** to `wish-jar-api.blastin.dev`: the device's
  `GET /codes/:code/photo` sends a token, so the browser asks a preflight
  first, and a preflight can't follow a redirect. The per-caller limits below
  apply there too.
- **No family jar** was ever reached through `workers.dev`: the app's
  `JAR_URL` came after WJ-42. So no photo URL kept in a jar (WJ-49) starts
  with it.
- **Preview URLs** are `workers.dev` addresses too, each running the version of
  the Worker it was made for. `preview_urls` is off.

**Retiring it:** once no frame or phone build from before WJ-42 is in use, set
`workers_dev` to `false` in `wrangler.jsonc`, and drop `WORKERS_DEV_PATHS` and
`isWorkersDev` from `src/routes.ts`.

### The Origin check

The device endpoints check the `Origin` header against `ALLOWED_ORIGINS` in
`wrangler.jsonc` (`corsReply` in `src/http.ts`), which keeps other websites'
pages out. What opens a family's jar is a device's token, signed since WJ-55
(below).

### 2. Per-caller limits in the Worker

`src/CallerLimits.ts` has a Durable Object for each caller. A caller is an IP
address, or a whole IPv6 /64, which is what one home network gets. It counts
what the caller does in fixed windows. Past a limit the Worker answers **429**
with `Retry-After` (seconds), exposed to Wish Jar's pages through CORS, and the
app says how long to wait. The request that is turned away isn't counted.

| What | Endpoint | Per caller | Kept in |
| --- | --- | --- | --- |
| Start a family | `POST /families` | 5 a day | storage |
| Photo code | `POST /codes` | 30 an hour | storage |
| Phone sends a photo | `POST /s/:code/photo` | 30 an hour | storage |
| Join code | `POST /devices/codes` | 20 an hour | storage |
| Join with a code | `POST /devices/join` | 20 an hour | storage |
| Echo Show rejoins | `POST /devices/echo-show` | 60 an hour | storage |
| Upload a photo | `POST /photos` | 120 an hour | storage |
| Live socket | `GET /jar/live` | 120 per 10 minutes | memory |

Wrong join codes still have their own tighter limit (`JoinAttempts`: 10 per 15
minutes).

- **Storage or memory.** Counts kept in storage survive the object being put
  to sleep. They're used for the rare actions that a slow script could still
  pile up: a new family a few minutes apart can bring a 10 MB jar each time.
  Each request counted writes one row, and the alarm removes the count when
  its window ends. Live sockets are frequent, so their count stays in memory
  and writes nothing. A caller fast enough to matter keeps the object awake
  anyway.
- **Isolate cache.** Once a caller has hit a limit, the Worker instance
  remembers it until the window ends. More requests from that caller are
  turned away without waking its object.
- **Rate Limiting binding.** Workers' own binding (`ratelimits` in wrangler)
  would cost no Durable Object requests. It isn't used because it only has
  10- and 60-second periods, counts separately in each Cloudflare location,
  and its docs don't say it's on the Free plan.

### 3. A daily write budget for each family (WJ-56)

A token opens only its own family's jar, but every family's writes come out of
the same 100,000 rows a day. `FamilyJar` counts what each family writes in the
UTC day, which is when the Free plan's allowance starts again too
(`src/jar/dailyWrites.ts`). Past its budget, the family's writes, removes and
uploads get **429** until 00:00 UTC, with `Retry-After` exposed through CORS
like the per-caller limits, and the app says how long to wait. Reads are always
answered.

| What | Counts | Per family | Kept in |
| --- | --- | --- | --- |
| Rows written | Writes and removes on `POST /jar/call`, `POST /photos` | 5,000 a day | memory, and storage every 20 rows |
| Photo bytes | `POST /photos`, and `POST /jar/call` bringing `data:` URIs | 10 MB a day | memory, and storage every 1 MB |

- **The numbers.** Rows are counted as the Free plan counts them: each
  statement's `rowsWritten`, indexes included. A tick is 3 rows. Several kids
  ticking all of their tasks, and a parent setting the jar up on its first
  day, are a few hundred to a thousand rows. 5,000 is 5% of the account's
  day. 10 MB is a whole jar (`MAX_JAR_BYTES`, guard 5) a day, so a family
  can fill its jar on its first day; a photo is 100 to 300 KB. What a jar
  keeps is capped by its size; the bytes budget caps a family putting photos
  up and deleting them again.
- **The call that reaches the budget** goes through, whatever it brings: one
  call is a few rows, and its photos are capped by `MAX_CALL_BYTES`.
- **Memory, and storage in steps.** The jar is awake for the call anyway, so
  counting costs no extra Durable Object request. A row written for every
  call counted would add a third to what a tick costs, but the jar forgets
  its memory when it sleeps (as soon as 10 seconds after the last call, with
  only sockets open). What's kept is the count rounded up by a step, written
  only when the count gets past it, and a jar that wakes up counts from
  there. So sleeping never gives a family budget back; each wake costs it a
  step at most. Keeping the count is one row per 20 counted, 5% more.
- **Not counted:** starting a family or importing a jar (limited per caller
  and by Turnstile), joining, Echo Show rejoins, and a device's `last_seen_at`
  (once per 10 minutes).

### 4. Families that clean themselves up

`FamilyJar.alarm` deletes a family when it's abandoned:

- **Abandoned:** no device has been seen in the family for 6 months (183
  days).
- **Never used:** no device came back in the 7 days after the family was
  made. "Came back" means a device was seen at least 10 minutes after the
  family started; `last_seen_at` isn't written more often than that. This
  covers a family made by a script and left, or a setup tried and given up
  on.

A family with a live socket open is alive whatever `last_seen_at` says, and is
checked again a day later. A new family's alarm is set for its 7th day, and
each check sets the next one. Families from before WJ-51 get their alarm the
next time their jar is opened.

Deleting a family removes all of its rows and photos. Its sockets close with
4401, so its devices see that they're out. Its Echo Shows' links are dropped,
and a link that was missed answers 404 on rejoin and is dropped then. A join
code still open (10 minutes at most) answers 410. A photo already in a data
centre's edge cache can still be served from there for up to a day.

### 5. Storage that fits in the Free plan's 5 GB (WJ-57)

Every family's jar comes out of the same 5 GB. Two numbers keep what a script
can store well under it:

| What | Where | Limit |
| --- | --- | --- |
| A family's jar, photos included | `MAX_JAR_BYTES` in `src/jar/limits.ts` | 10 MB |
| New families, every caller together | `FAMILIES_PER_DAY` in `src/FamilyStarts.ts` | 25 a UTC day |

- **The jar.** Past 10 MB a jar takes no more writes or photos (**507**,
  "The jar is full") until something is deleted. Reads and removes are always
  answered. A jar brought along to start a family must fit too, or the family
  isn't started (**507**, nothing kept). A photo is a JPEG up to 1024 px at
  0.8 (`src/photos/shrink.ts` in the app), 100 to 300 KB, and the 7 starter
  photos are 250 KB in all. Three kids, ten tasks of their own and twenty
  wishes, all with photos, are about 5 MB at a typical 150 KB a photo: half
  the cap. 10 MB is 50 to 100 photos.
- **Jars from before.** A jar already past 10 MB (the cap was 50 MB) keeps
  being read, photos too, but takes nothing more. Once the family deletes
  enough to be back under, it takes writes again.
- **New families.** `FamilyStarts` is one Durable Object counting the families
  started in the UTC day. It's checked last, after Turnstile, the
  per-caller limit and reading the body, and a start the jar turns down
  (a jar too big, or not valid) is given back, so only families that start
  count. Past 25, `POST
  /families` gets **429** with `Retry-After` until 00:00 UTC, and the app says
  how long to wait. Families already started are never touched, and joining
  with a code still works.
- **The sum.** A family nobody comes back to is deleted after 7 days (guard
  4), and holds at most a full jar until then. The families alive at any
  moment were made in the last 7 days, which touch 8 UTC days:
  8 × 25 × 10 MB = 2 GB (2.1 GB in 10⁹ bytes), well under half of the 5 GB,
  leaving the rest for the families in use.

## Starting a family needs a Turnstile check (WJ-54)

`POST /families` is the only way to get a device token without having one, so
a script that can start families can use their tokens to flood `/jar/call`.
Starting a family needs a [Turnstile](https://developers.cloudflare.com/turnstile/)
token in the `Turnstile-Token` header. The Worker checks it with Cloudflare's
siteverify and its secret key (`src/turnstile.ts`), before the per-caller
limit:

- **403** without a token, or with one Cloudflare turns down. A token works
  once, for 5 minutes. The app goes back to its choices for a new check.
- **503** when siteverify can't be reached or has trouble of its own. The app
  tries again by itself.

Every device can start a family, so every one of them does the check:

- **The site, the frame and the Echo Show** are web pages. They render the
  widget themselves (`src/family/TurnstileCheck.web.tsx` in the app).
- **The phone app** shows the relay's `GET /turnstile?sitekey=…` page in a
  WebView (`src/family/TurnstileCheck.tsx`). The page sends the token back
  through `window.ReactNativeWebView`.

Joining with a code and the Echo Show's rejoin don't need the check.

### Making the widget (set up by hand in the dashboard)

1. In the dashboard, go to **Turnstile → Add widget**, and fill it in like
   this:

   | Setting | Value |
   | --- | --- |
   | Widget name | `Wish Jar: start a family` |
   | Hostnames | `wish-jar.blastin.dev` (the site and the Echo Show), `wish-jar-api.blastin.dev` (the relay's page for the phone app), `appassets.androidplatform.net` (the frame's pages, frame/README.md), `localhost` (dev builds) |
   | Widget mode | Managed |
   | Pre-clearance | No |

   A hostname lets in its subdomains too, but not its siblings: the site's
   `wish-jar.blastin.dev` doesn't cover the relay's `wish-jar-api.blastin.dev`,
   so both are listed. The phone app opens the page at `JAR_URL`
   (`src/db/jar.ts`), the relay's own address: the site doesn't pass
   `/turnstile` on to the relay (`run_worker_first` in the root
   `wrangler.jsonc`).

2. Put the **site key** in the `TURNSTILE_SITE_KEY` repository variable in
   GitHub (**Settings → Secrets and variables → Actions → Variables**). It
   isn't a secret. The site's build passes it to the app as
   `EXPO_PUBLIC_TURNSTILE_SITE_KEY` (`.github/workflows/site.yml`) and fails
   without it; build the frame with the same variable set
   (`frame/build.sh`). The relay's page takes the key from the app, so it's
   only set there.
3. Give the Worker the **secret key**:

   ```bash
   cd relay
   pnpm exec wrangler secret put TURNSTILE_SECRET_KEY
   ```

   Do this before the change is merged. `wrangler.jsonc` lists the secret as
   required, so a deploy fails while it isn't set.

Once the relay has the real secret, only the real site key passes. Builds of
the app from before the check can't start a family any more (403); joining
still works. The phone app needs a new build for `react-native-webview` (Expo
Go has it already), and the frame app a new build so its WebView keeps
Turnstile's cookies.

### In development and tests

`pnpm dev` gives the Worker Cloudflare's test secret,
`1x0000000000000000000000000000000AA`, unless `TURNSTILE_SECRET_KEY` is set in
the environment. It passes only the dummy token that Cloudflare's test site
keys hand out. Point a dev build of the app at it with the test site key:

```bash
EXPO_PUBLIC_JAR_URL=http://localhost:8787 \
EXPO_PUBLIC_TURNSTILE_SITE_KEY=1x00000000000000000000AA pnpm start
```

`2x00000000000000000000AB` is the test site key that always fails, and
`2x0000000000000000000000000000000AA` the test secret that turns every token
down. A dev build on the real relay uses the real site key, which works on
`localhost`.

The tests use the test secret too (`vitest.config.ts`). `test/setup.ts`
answers for siteverify, so they need no network.

## Made-up tokens and photo URLs wake no jar (WJ-55)

Any request that names a family wakes its jar (a Durable Object), and every
wake counts against the Free plan's daily requests, shared by every family.
So the Worker signs what it hands out and checks the signature first
(`src/signing.ts`), with an HMAC keyed by the Worker secret `SIGNING_KEY`:

- **Device tokens** are `<familyId>.<secret>.<deviceId>.<signature>`, signed
  over the family id and the device's id in its jar. A made-up or changed one
  gets **401** on `/jar/call`, `/devices…` and `/photos`, and a socket closed
  with 4401 on `/jar/live`, without any jar being woken. The jar still checks
  the secret, so a removed device's token opens nothing.
- **Photo URLs** are `/photos/<familyId>/<photoId>.jpg?sig=<signature>`, signed
  over the family id and the photo id. A made-up one gets **404** without
  waking the jar. The edge cache keeps a photo by its path only, so a made-up
  query (`?x=1`) is served from the cache like the photo itself. A photo the
  jar doesn't have is cached as a 404 for a minute. The signature doesn't
  cover the address: a URL kept from when the relay was
  `wish-jar.blastin.dev` still works there, where the site passes it on to
  the relay unchanged (`site/worker.js`), and keeps its address when the jar
  signs it.

### Tokens and photo URLs from before the signatures

Until `UNSIGNED_UNTIL` in `src/signing.ts` (60 days after the change was
merged), they work as before: an unsigned token goes to the jar to be
checked, and so does an unsigned photo URL.

- The app swaps its unsigned token for a signed one at launch:
  `POST /devices/token` checks the old token in the jar and answers with the
  device's signed token, the same secret signed. It tries again at every
  launch until it works. The Echo Show gets a new, signed token at every
  launch anyway.
- A jar signs the photo URLs it keeps at its first call after the deploy, and
  the family's devices load them again.

After the cut-off, an unsigned token gets 401 and an unsigned photo URL 404,
without waking any jar, everywhere but `POST /devices/token`: a device opened
for the first time since then still swaps its token at launch, and keeps its
family. Those swaps count toward a limit per caller (`tokenSwaps` in
`src/CallerLimits.ts`). A build of the app from before the swap has to join
its family again with a code.

### Setting the signing key

Give the Worker a long random key, before the change is merged:

```bash
cd relay
openssl rand -base64 48 | pnpm exec wrangler secret put SIGNING_KEY
```

`wrangler.jsonc` lists it as required, so a deploy fails while it isn't set.
Keep it: a new key turns away every token and photo URL handed out under the
old one, and every device would have to join its family again.

`pnpm dev` signs with `wish-jar-dev-signing-key` unless `SIGNING_KEY` is set in
the environment, and the tests with the fixed key in `test/signingKey.ts`.
