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
relay down for everyone until 00:00 UTC, or fill its storage. There are three
guards.

### 1. The edge rule (set by hand in the dashboard)

A WAF rate limiting rule turns away fast floods before they reach the Worker,
so they don't count toward the 100,000 requests. The Free plan has one rule,
counts by IP only, and its period and duration are fixed at 10 seconds. Its
expression can only use the URI path (no host, no method).

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
  blastin.dev uses them. The site at `wish-jar-app.blastin.dev` has no page
  at any of them.
- The rule doesn't cover the `workers.dev` address (`workers_dev: true` in
  `wrangler.jsonc`), which isn't part of the zone. The Worker's own limits
  below apply there too.
- A blocked call reaches Wish Jar's pages without CORS headers. The browser
  reports it as a lost connection, and the app tries again by itself a few
  seconds later.

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
  pile up: a new family a few minutes apart can bring a 20 MB jar each time.
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

### 3. Families that clean themselves up

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
