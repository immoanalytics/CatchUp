# CLAUDE.md — AI Assistant Guide for CatchUp

> This file provides context and conventions for AI assistants (such as Claude) working
> in this repository. It is the single source of truth for codebase structure,
> development workflows, and contribution guidelines.

## Project Overview

**CatchUp** is a real-time availability-sharing app that lets users broadcast when
they are free so friends can see and call them instantly via phone or WhatsApp.

- **Organization**: immoanalytics
- **Repository**: CatchUp
- **Type**: Full-stack web application (mobile-first PWA)
- **Core idea**: Tap "I'm Available" → friends see you're free → they call you directly

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Backend** | Node.js + Express |
| **Database** | SQLite via better-sqlite3 (WAL mode) |
| **Real-time** | Socket.IO (WebSocket with polling fallback) |
| **Auth** | JWT (jsonwebtoken) + bcryptjs |
| **Frontend** | React 18 + Vite |
| **Routing** | react-router-dom v6 |
| **Icons** | lucide-react |
| **Styling** | Plain CSS (mobile-first, dark theme) |
| **Package manager** | npm |

## Directory Structure

```
CatchUp/
├── CLAUDE.md              # This file — AI assistant guide
├── .gitignore             # Git ignore rules
├── package.json           # Root package.json (server deps + scripts)
├── server/
│   ├── index.js           # Express + Socket.IO server entry point
│   ├── database.js        # SQLite schema initialization and connection
│   ├── auth.js            # JWT token generation and middleware
│   └── routes.js          # All REST API route handlers
├── client/
│   ├── package.json       # Frontend dependencies
│   ├── vite.config.js     # Vite config with API proxy
│   ├── index.html         # HTML entry point
│   ├── public/
│   │   ├── manifest.json  # PWA manifest
│   │   └── favicon.svg    # App icon
│   └── src/
│       ├── main.jsx       # React entry point
│       ├── App.jsx        # Root component with routing
│       ├── context/
│       │   ├── AuthContext.jsx    # Auth state, login/register/logout, apiFetch helper
│       │   └── SocketContext.jsx  # Socket.IO connection management
│       ├── components/
│       │   ├── BottomNav.jsx      # Tab navigation (Home, Circles, Profile)
│       │   └── CallSheet.jsx      # Call action sheet (phone + WhatsApp)
│       ├── pages/
│       │   ├── Auth.jsx           # Login / Register screen
│       │   ├── Home.jsx           # Availability toggle + available friends list
│       │   ├── Circles.jsx        # Circle management + member management
│       │   └── Profile.jsx        # Profile editing, schedules, preferences
│       └── styles/
│           └── global.css         # All CSS styles (single file, CSS custom properties)
└── catchup.db             # SQLite database file (auto-created, gitignored)
```

## Build & Run

### First-time setup
```bash
npm run setup          # Installs root + client dependencies
```

### Development (concurrent server + client)
```bash
npm run dev            # Runs server on :3001 and Vite dev server on :5173
```

### Individual dev servers
```bash
npm run dev:server     # Backend only (port 3001)
npm run dev:client     # Frontend only (port 5173, proxies API to :3001)
```

### Production build & run
```bash
npm run build          # Build frontend to client/dist/
npm start              # Serve everything from Express (NODE_ENV=production)
```

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3001` | Server port |
| `JWT_SECRET` | dev fallback | **Must be set in production** (warning logged otherwise) |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` | dev fallback | Web Push keys — generate with `npx web-push generate-vapid-keys`. **Set in production** |
| `VAPID_EMAIL` | `mailto:admin@catchup.app` | Web Push contact email |
| `DATABASE_PATH` | `./catchup.db` | SQLite file location |
| `SSL_KEY_PATH` / `SSL_CERT_PATH` | unset | Enable built-in HTTPS (otherwise use a reverse proxy) |

## Database Schema

SQLite tables (auto-created on first run; column migrations run automatically):

- **users** — id, username, display_name, password_hash, phone, whatsapp, email, avatar_color, photo, is_available, available_since, available_until
- **circles** — id, user_id, name, icon, color (user's friend groups)
- **friendships** — id, user_id, friend_id, status, watching (bidirectional friend links; watching controls availability notifications)
- **friend_circles** — friendship_id, circle_id (which circles a friend belongs to)
- **schedules** — id, user_id, days, start_time, end_time, enabled (recurring availability)
- **pings** — id, from_user_id, to_user_id, status, created_at, responded_at (nudge a friend to become available)
- **push_subscriptions** — id, user_id, endpoint, p256dh, auth (Web Push subscriptions)
- **password_reset_codes** — id, user_id, code, expires_at, used, attempts (6-digit reset codes, 15-min expiry, max 5 guesses)

## API Endpoints

All API routes are prefixed with `/api`.

Auth endpoints are rate-limited per IP (in-memory).

### Auth
- `POST /api/auth/register` — Create account (auto-creates default circles)
- `POST /api/auth/login` — Sign in, returns JWT token (30-day expiry)
- `POST /api/auth/request-reset` — Generate password reset code for an email (code returned in response; no email server configured)
- `POST /api/auth/reset-password` — Verify code + set new password (max 5 wrong guesses per code)

### User (requires auth)
- `GET /api/me` — Get current user profile + schedules
- `PUT /api/me` — Update display name, phone, whatsapp, email
- `PUT /api/me/photo` — Upload profile photo (data URL, max 2MB)
- `GET /api/users/search?q=` — Search users by username/display name/phone
- `POST /api/users/lookup` — Match phone numbers against registered users (contact import)

### Availability (requires auth)
- `POST /api/availability/toggle` — Toggle current user's availability
- `POST /api/availability/set` — Explicitly set availability state
- `GET /api/available` — List all available friends with circle info

### Circles (requires auth)
- `GET /api/circles` — List user's circles with member counts
- `POST /api/circles` — Create new circle
- `PUT /api/circles/:id` — Update circle
- `DELETE /api/circles/:id` — Delete circle
- `GET /api/circles/:id/members` — List circle members

### Friends (requires auth)
- `GET /api/friends` — List all friends with circle assignments
- `GET /api/friends/all` — List mutual friends (available + offline) with circles and last ping time
- `POST /api/friends/add` — Add friend by username (+ optional circle assignment)
- `DELETE /api/friends/:friendId` — Remove friend
- `POST /api/friends/:friendId/circles` — Add friend to circle
- `DELETE /api/friends/:friendId/circles/:circleId` — Remove friend from circle
- `PUT /api/friends/:friendId/watching` — Toggle availability notifications for a friend

### Schedules (requires auth)
- `GET /api/schedules` — List user's recurring schedules
- `POST /api/schedules` — Create schedule
- `PUT /api/schedules/:id` — Update schedule
- `DELETE /api/schedules/:id` — Delete schedule

### Pings (requires auth)
- `POST /api/pings` — Ping a mutual friend (5-min cooldown per friend)
- `GET /api/pings` — Pending pings received in the last hour
- `PUT /api/pings/:id` — Respond to a ping (`responded` / `dismissed`)

### Push (Web Push)
- `GET /api/push/vapid-key` — Public VAPID key for subscribing
- `POST /api/push/subscribe` — Save a push subscription (requires auth)
- `POST /api/push/unsubscribe` — Remove a push subscription (requires auth)

## WebSocket Events

Socket.IO authenticates via `auth.token` in handshake.

### Client → Server
- `availability:set` — Set availability (with optional duration; broadcasts to watching friends)
- `ping:send` — Ping a mutual friend (5-min cooldown)

### Server → Client
- `availability:changed` — A friend's availability changed (includes user info)
- `availability:updated` — Confirmation of own availability change
- `ping:received` — A friend pinged you
- `ping:sent` — Confirmation your ping was delivered
- `ping:error` — Ping failed (cooldown / not mutual friends)
- `friend:online` — A friend connected
- `friend:offline` — A friend disconnected

### Server background jobs
- Every 30s: expire `available_until` timers and broadcast the change
- Every 60s: auto-enable availability from recurring schedules (notifies watching friends)

## Frontend Architecture

### Screens (3 tabs)
1. **Home** — "I'm Available" toggle card (with duration picker + schedule indicator), filter chips by circle, available friends with call buttons, offline friends with ping buttons, ping-received modal
2. **Circles** — List of circles with member counts, drill into circle to manage members, watch/unwatch per friend, search/add friends (incl. phone lookup + .vcf import)
3. **Profile** — Avatar with photo upload, contact info (phone/WhatsApp/email), recurring schedules with toggle, push notification preference + test button, language switch, sign out

### State Management
- **AuthContext** — User session, JWT token, `apiFetch` helper (auto-attaches auth header, handles 401)
- **SocketContext** — Socket.IO connection lifecycle tied to auth token

### Calling Integration
- **Phone calls**: `tel:` URI scheme (opens native dialer)
- **WhatsApp**: `https://wa.me/{number}` deep link (opens WhatsApp)
- Both triggered from a bottom sheet (CallSheet component) when tapping the phone icon on a contact card

### Styling
- Single CSS file using CSS custom properties (variables) for theming
- Dark theme matching the design mockups
- Mobile-first layout with `max-width: 480px` centered container
- Bottom tab navigation with safe area inset support
- Bottom sheet modals for forms and actions

## Code Conventions

- **Keep it simple** — prefer clarity over cleverness
- **Don't over-engineer** — only build what is needed now
- **Consistent style** — follow patterns already in the codebase
- **Minimal changes** — when fixing a bug, fix the bug; don't refactor surrounding code
- **No dead code** — remove unused code rather than commenting it out
- **Security first** — never commit secrets, credentials, or API keys
- **CSS variables** — use `var(--name)` from `global.css` for all colors/spacing
- **Component pattern** — functional components with hooks, no class components
- **API calls** — always use `apiFetch` from AuthContext (handles auth headers + session expiry)

## Development Workflow

### Branch Naming
- Feature branches: `claude/<description>-<id>` or `feature/<description>`
- Bug fixes: `fix/<description>`
- Documentation: `docs/<description>`

### Commits
- Write clear, descriptive commit messages
- Use imperative mood (e.g., "Add feature" not "Added feature")
- Keep the subject line under 72 characters

### Testing

> Testing framework not yet configured. When adding tests:
> - Backend: consider `jest` or `vitest` for API route testing
> - Frontend: consider `vitest` + `@testing-library/react`

### Linting & Formatting

> Not yet configured. When adding:
> - Consider ESLint for both server and client
> - Consider Prettier for consistent formatting

## Maintaining This File

Update this file when making significant changes to the project (new tooling,
new conventions, architecture changes, new API endpoints). Every contributor
— human or AI — benefits from accurate documentation.
