# Cricket Live Score Website

Production-ready live cricket website for Cloudflare Pages with:
- Public dashboard UI
- Admin control room
- Manual scoring
- Points table
- Fixtures
- Match insights
- Cloudflare KV + Pages Functions
- No traditional backend server

## 1) Project Structure

```text
/
  index.html
  admin.html
  style.css
  script.js
  data.json
  wrangler.toml
  /functions/api
    _utils.js
    login.js
    get-score.js
    update-score.js
```

## 2) Public Dashboard Features

- Live tab:
  - Team names
  - Runs/Wickets/Overs
  - Current batsman/bowler
  - Match status
  - Toss + innings
  - Run rate + required run rate
  - Partnership
  - Last over summary
  - Over progress bar
  - Ball-by-ball timeline
  - Player scorecard
- Points Table tab:
  - Team ranking
  - Played, wins, losses, ties, points
  - NRR (computed)
- Fixtures tab:
  - Upcoming fixtures
  - Recent results
- Insights tab:
  - Total matches
  - Live matches
  - Completed matches
  - Average RR
  - Top scorer
  - Best team (by points table)
- Auto refresh every 5 seconds
- Mobile responsive premium dark UI

## 3) Admin Features

- Secure password login
- Tournament settings:
  - Tournament name
  - Default overs
- Match management:
  - Create match
  - Select active match
  - Start match
  - End match
  - Reset match
  - Start second innings
- Score entry:
  - `+1 +2 +3 +4 +6`
  - Wicket
  - Wide
  - No ball
  - Dot
  - Undo
- Match controls:
  - Target
  - Batsman
  - Bowler
  - Batting team
  - Bowling team
  - Status
- Fixture management:
  - Add fixture
  - Date/time and venue
- Share:
  - Share link
  - QR code
  - Printable scorecard export

## 4) Cloudflare Function Endpoints

### `POST /api/login`
File: `functions/api/login.js`

What it does:
- Validates password against `ADMIN_PASSWORD`.
- Returns signed admin token (8 hour expiry).
- Rate limits login attempts.

Request body:
```json
{ "password": "your_password" }
```

### `GET /api/get-score`
File: `functions/api/get-score.js`

What it does:
- Loads score state from KV key `score:state`.
- Falls back to `data.json` if KV is empty.

### `POST /api/update-score`
File: `functions/api/update-score.js`

What it does:
- Validates `Bearer` token.
- Validates payload shape.
- Writes latest state to KV.
- Rate limits update API calls.

Required header:
```text
Authorization: Bearer <token>
```

### Shared helpers
File: `functions/api/_utils.js`

- HMAC token sign/verify
- JSON response utility
- KV-based rate limiting

## 5) Data Model (Stored in KV)

State object contains:
- `activeMatchId`
- `matches`
- `history`
- `fixtures`
- `settings`:
  - `tournamentName`
  - `defaultOvers`
- `updatedAt`

## 6) Cloudflare Deployment Steps

1. Push code to GitHub.
2. Cloudflare Dashboard -> `Workers & Pages` -> `Create` -> `Pages`.
3. Connect your GitHub repository.
4. Build settings:
   - Build command: leave empty
   - Build output directory: `/`
5. Create KV namespace from Cloudflare KV page.
6. Bind KV to Pages project with binding name `SCORE_KV`.
7. Set environment variables for Preview and Production:
   - `ADMIN_PASSWORD`
   - `ADMIN_TOKEN_SECRET`
8. Update `wrangler.toml` ids:
   - `id`
   - `preview_id`
9. Deploy.

## 7) Push to GitHub

Run from project root:

```bash
git init
git add .
git commit -m "feat: complete cricket live dashboard with admin, points table, fixtures, and cloudflare functions"
git branch -M main
git remote add origin <your-repo-url>
git push -u origin main
```

If your repo is already initialized, run:

```bash
git add .
git commit -m "feat: upgrade UI and add full live score dashboard features"
git push
```

## 8) Local Test

```bash
npx wrangler pages dev .
```

- Public: `http://localhost:8788/`
- Admin: `http://localhost:8788/admin.html`

## 9) Security Notes

- Do not hardcode admin password in frontend files.
- Keep `ADMIN_PASSWORD` and `ADMIN_TOKEN_SECRET` only in Cloudflare environment variables.
- Update API is token protected and rate limited.
