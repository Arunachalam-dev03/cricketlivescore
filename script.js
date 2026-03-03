const API = {
  getScore: "/api/get-score",
  updateScore: "/api/update-score",
  login: "/api/login"
};

const STORAGE_KEYS = {
  state: "cricket_score_state_v3",
  token: "cricket_admin_token"
};

const defaultState = {
  activeMatchId: null,
  matches: {},
  history: [],
  fixtures: [],
  settings: {
    tournamentName: "Live Cricket Dashboard",
    defaultOvers: 20
  },
  updatedAt: new Date().toISOString()
};

const byId = (id) => document.getElementById(id);
const copy = (obj) => JSON.parse(JSON.stringify(obj));
const safeNum = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

function makeFixture(payload) {
  return {
    id: `fx_${Date.now()}`,
    teamA: (payload.teamA || "").trim(),
    teamB: (payload.teamB || "").trim(),
    date: payload.date || "",
    venue: (payload.venue || "").trim(),
    status: "upcoming",
    result: ""
  };
}

function buildMatch(payload) {
  const teamA = (payload.teamA || "Team A").trim();
  const teamB = (payload.teamB || "Team B").trim();
  const striker = (payload.batsman || "Batsman").trim();
  const bowler = (payload.bowler || "Bowler").trim();
  return {
    id: `match_${Date.now()}`,
    teamA,
    teamB,
    tossWinner: (payload.tossWinner || "").trim(),
    innings: 1,
    maxOvers: Math.max(1, safeNum(payload.maxOvers || 20)),
    battingTeam: teamA,
    bowlingTeam: teamB,
    status: "not_started",
    winner: "",
    target: 0,
    currentBatsman: striker,
    currentBowler: bowler,
    partnership: { runs: 0, balls: 0 },
    firstInningsScore: null,
    createdAt: new Date().toISOString(),
    startedAt: null,
    endedAt: null,
    score: {
      runs: 0,
      wickets: 0,
      overs: 0,
      balls: 0,
      extras: { wide: 0, noBall: 0 },
      timeline: [],
      undoStack: []
    },
    players: {
      batsmen: [{ name: striker, runs: 0, balls: 0, fours: 0, sixes: 0 }],
      bowler: { name: bowler, overs: "0.0", runsConceded: 0, wickets: 0 }
    }
  };
}

function normalizeState(state) {
  const out = state && typeof state === "object" ? state : copy(defaultState);
  out.activeMatchId = out.activeMatchId || null;
  out.matches = out.matches && typeof out.matches === "object" ? out.matches : {};
  out.history = Array.isArray(out.history) ? out.history : [];
  out.fixtures = Array.isArray(out.fixtures) ? out.fixtures : [];
  out.settings = out.settings && typeof out.settings === "object" ? out.settings : {};
  out.settings.tournamentName = out.settings.tournamentName || "Live Cricket Dashboard";
  out.settings.defaultOvers = Math.max(1, safeNum(out.settings.defaultOvers || 20));
  out.updatedAt = out.updatedAt || new Date().toISOString();
  return out;
}

function oversText(score) {
  return `${score.overs}.${score.balls}`;
}

function oversFloat(score) {
  return score.overs + (score.balls / 6);
}

function runRate(match) {
  const o = oversFloat(match.score);
  return o > 0 ? (match.score.runs / o).toFixed(2) : "0.00";
}

function requiredRunRate(match) {
  if (match.innings !== 2 || !match.target) return "-";
  const ballsBowled = (match.score.overs * 6) + match.score.balls;
  const ballsLeft = (match.maxOvers * 6) - ballsBowled;
  const runsLeft = match.target - match.score.runs;
  if (runsLeft <= 0) return "0.00";
  if (ballsLeft <= 0) return "INF";
  return ((runsLeft * 6) / ballsLeft).toFixed(2);
}

function ensureBatsman(match, name) {
  const playerName = (name || "Batsman").trim();
  let p = match.players.batsmen.find((b) => b.name === playerName);
  if (!p) {
    p = { name: playerName, runs: 0, balls: 0, fours: 0, sixes: 0 };
    match.players.batsmen.push(p);
  }
  return p;
}

function ballLabel(event) {
  if (event.type === "run") return `${event.runs}`;
  if (event.type === "wicket") return "W";
  if (event.type === "wide") return "Wd";
  if (event.type === "noball") return "Nb";
  return ".";
}

function setWinnerIfNeeded(match) {
  if (match.winner || match.innings !== 2 || !match.target) return;

  if (match.score.runs >= match.target) {
    const wicketsLeft = Math.max(0, 10 - match.score.wickets);
    match.winner = `${match.battingTeam} won by ${wicketsLeft} wickets`;
    match.status = "ended";
    match.endedAt = new Date().toISOString();
    return;
  }

  const ballsBowled = (match.score.overs * 6) + match.score.balls;
  const allOut = match.score.wickets >= 10;
  const inningsDone = ballsBowled >= (match.maxOvers * 6);

  if (allOut || inningsDone) {
    const diff = (match.target - 1) - match.score.runs;
    match.winner = diff === 0 ? "Match tied" : `${match.bowlingTeam} won by ${Math.max(1, diff)} runs`;
    match.status = "ended";
    match.endedAt = new Date().toISOString();
  }
}

function applyBall(match, event) {
  match.score.undoStack.push(copy({
    score: match.score,
    players: match.players,
    partnership: match.partnership,
    status: match.status,
    winner: match.winner,
    endedAt: match.endedAt
  }));

  const striker = ensureBatsman(match, match.currentBatsman);
  let legal = false;
  let conceded = 0;

  if (event.type === "run") {
    legal = true;
    conceded = event.runs;
    match.score.runs += event.runs;
    striker.runs += event.runs;
    striker.balls += 1;
    match.partnership.runs += event.runs;
    match.partnership.balls += 1;
    if (event.runs === 4) striker.fours += 1;
    if (event.runs === 6) striker.sixes += 1;
  }

  if (event.type === "dot") {
    legal = true;
    striker.balls += 1;
    match.partnership.balls += 1;
  }

  if (event.type === "wicket") {
    legal = true;
    striker.balls += 1;
    match.score.wickets += 1;
    match.players.bowler.wickets += 1;
    match.partnership = { runs: 0, balls: 0 };
  }

  if (event.type === "wide") {
    conceded = 1;
    match.score.runs += 1;
    match.score.extras.wide += 1;
    match.partnership.runs += 1;
  }

  if (event.type === "noball") {
    conceded = 1;
    match.score.runs += 1;
    match.score.extras.noBall += 1;
    match.partnership.runs += 1;
  }

  if (legal) {
    match.score.balls += 1;
    if (match.score.balls >= 6) {
      match.score.overs += 1;
      match.score.balls = 0;
    }
  }

  match.players.bowler.runsConceded += conceded;
  match.players.bowler.overs = oversText(match.score);

  match.score.timeline.push({
    over: oversText(match.score),
    label: ballLabel(event),
    event,
    at: new Date().toISOString()
  });

  if (match.status === "not_started") {
    match.status = "live";
    match.startedAt = match.startedAt || new Date().toISOString();
  }

  setWinnerIfNeeded(match);
}

function undoBall(match) {
  const snap = match.score.undoStack.pop();
  if (!snap) return;
  match.score = snap.score;
  match.players = snap.players;
  match.partnership = snap.partnership;
  match.status = snap.status;
  match.winner = snap.winner;
  match.endedAt = snap.endedAt;
}

function saveLocal(state) {
  localStorage.setItem(STORAGE_KEYS.state, JSON.stringify(state));
}

function loadLocal() {
  const raw = localStorage.getItem(STORAGE_KEYS.state);
  if (!raw) return copy(defaultState);
  try {
    return normalizeState(JSON.parse(raw));
  } catch {
    return copy(defaultState);
  }
}

async function fetchState() {
  try {
    const res = await fetch(API.getScore, { headers: { "Cache-Control": "no-store" } });
    if (!res.ok) throw new Error("api");
    const data = normalizeState(await res.json());
    saveLocal(data);
    return data;
  } catch {
    try {
      const res = await fetch("/data.json", { headers: { "Cache-Control": "no-store" } });
      if (!res.ok) throw new Error("file");
      const data = normalizeState(await res.json());
      saveLocal(data);
      return data;
    } catch {
      return loadLocal();
    }
  }
}

async function loginAdmin(password) {
  const res = await fetch(API.login, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password })
  });
  if (!res.ok) throw new Error("Invalid login");
  return res.json();
}

async function pushState(state) {
  const token = sessionStorage.getItem(STORAGE_KEYS.token) || "";
  const res = await fetch(API.updateScore, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify(state)
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

function setupTabs() {
  const tabs = document.querySelectorAll(".tab-btn");
  if (!tabs.length) return;
  tabs.forEach((btn) => {
    btn.addEventListener("click", () => {
      const tabId = btn.getAttribute("data-tab");
      document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
      document.querySelectorAll(".tab-panel").forEach((p) => p.classList.remove("active"));
      btn.classList.add("active");
      byId(tabId)?.classList.add("active");
    });
  });
}

function calculatePointsTable(state) {
  const map = {};
  const ensure = (team) => {
    if (!map[team]) {
      map[team] = {
        team,
        played: 0,
        win: 0,
        loss: 0,
        tie: 0,
        points: 0,
        forRuns: 0,
        forOvers: 0,
        againstRuns: 0,
        againstOvers: 0,
        nrr: 0
      };
    }
    return map[team];
  };

  Object.values(state.matches).forEach((m) => {
    ensure(m.teamA);
    ensure(m.teamB);
    if (m.status !== "ended") return;

    const a = ensure(m.teamA);
    const b = ensure(m.teamB);
    a.played += 1;
    b.played += 1;

    const firstTeam = m.innings === 2 ? m.bowlingTeam : m.teamA;
    const secondTeam = m.innings === 2 ? m.battingTeam : m.teamB;
    const firstRuns = m.firstInningsScore || Math.max(0, (m.target || 1) - 1);
    const secondRuns = m.score.runs;
    const secondOvers = oversFloat(m.score) || m.maxOvers;
    const firstOvers = m.maxOvers;

    const first = ensure(firstTeam);
    const second = ensure(secondTeam);
    first.forRuns += firstRuns;
    first.forOvers += firstOvers;
    first.againstRuns += secondRuns;
    first.againstOvers += secondOvers;

    second.forRuns += secondRuns;
    second.forOvers += secondOvers;
    second.againstRuns += firstRuns;
    second.againstOvers += firstOvers;

    if (!m.winner || m.winner.toLowerCase().includes("tied")) {
      a.tie += 1;
      b.tie += 1;
      a.points += 1;
      b.points += 1;
      return;
    }

    if (m.winner.startsWith(m.teamA)) {
      a.win += 1;
      b.loss += 1;
      a.points += 2;
    } else if (m.winner.startsWith(m.teamB)) {
      b.win += 1;
      a.loss += 1;
      b.points += 2;
    }
  });

  const rows = Object.values(map).map((r) => {
    const forRate = r.forOvers > 0 ? (r.forRuns / r.forOvers) : 0;
    const againstRate = r.againstOvers > 0 ? (r.againstRuns / r.againstOvers) : 0;
    r.nrr = forRate - againstRate;
    return r;
  });

  rows.sort((x, y) => (y.points - x.points) || (y.nrr - x.nrr) || (y.win - x.win) || x.team.localeCompare(y.team));
  return rows;
}

function renderPointsTable(state) {
  const body = byId("pointsTableBody");
  if (!body) return;
  const rows = calculatePointsTable(state);
  body.innerHTML = rows.length
    ? rows.map((r, idx) => `<tr><td>${idx + 1}</td><td>${r.team}</td><td>${r.played}</td><td>${r.win}</td><td>${r.loss}</td><td>${r.tie}</td><td>${r.points}</td><td>${r.nrr.toFixed(3)}</td></tr>`).join("")
    : "<tr><td colspan='8'>No teams yet</td></tr>";
}

function renderFixtures(state) {
  const upcoming = byId("upcomingList");
  const recent = byId("recentResultsList");
  if (!upcoming || !recent) return;

  const list = [...state.fixtures];
  const upcomingRows = list.filter((f) => f.status === "upcoming");
  const resultRows = list.filter((f) => f.status !== "upcoming");

  upcoming.innerHTML = upcomingRows.length
    ? upcomingRows.map((f) => `<div class="history-item">${f.teamA} vs ${f.teamB}<br><span class="muted">${f.date || "TBA"} • ${f.venue || "Venue TBA"}</span></div>`).join("")
    : "<div class='history-item'>No upcoming fixtures.</div>";

  recent.innerHTML = resultRows.length
    ? resultRows.map((f) => `<div class="history-item">${f.teamA} vs ${f.teamB}<br><span class="muted">${f.result || f.status}</span></div>`).join("")
    : "<div class='history-item'>No results yet.</div>";
}

function renderInsights(state) {
  const matches = Object.values(state.matches);
  const live = matches.filter((m) => m.status === "live").length;
  const completed = matches.filter((m) => m.status === "ended").length;
  const total = matches.length;
  const avgRR = total ? (matches.reduce((sum, m) => sum + safeNum(runRate(m)), 0) / total).toFixed(2) : "0.00";

  let topScorer = { name: "-", runs: -1 };
  matches.forEach((m) => {
    m.players.batsmen.forEach((p) => {
      if (p.runs > topScorer.runs) topScorer = { name: `${p.name} (${p.runs})`, runs: p.runs };
    });
  });

  const table = calculatePointsTable(state);
  const bestTeam = table.length ? table[0].team : "-";

  const set = (id, value) => { if (byId(id)) byId(id).textContent = value; };
  set("kpiTotalMatches", String(total));
  set("kpiLiveMatches", String(live));
  set("kpiCompleted", String(completed));
  set("kpiAvgRR", avgRR);
  set("kpiTopScorer", topScorer.name);
  set("kpiBestTeam", bestTeam);
}

function renderHistory(state) {
  const box = byId("history");
  if (!box) return;
  box.innerHTML = state.history.length
    ? state.history.map((id) => {
      const m = state.matches[id];
      if (!m) return "";
      return `<div class="history-item">${m.teamA} vs ${m.teamB}<br><span class="muted">${m.winner || m.status}</span></div>`;
    }).join("")
    : "<div class='history-item'>No completed matches yet.</div>";
}

function renderPublic(state, explicitMatchId) {
  const selector = byId("matchSelector");
  const badge = byId("refreshBadge");
  const tournament = byId("tournamentTitle");
  if (tournament) tournament.textContent = state.settings.tournamentName || "Live Cricket Dashboard";
  if (!selector) return;

  const ids = Object.keys(state.matches);
  if (!ids.length) {
    selector.innerHTML = "";
    const idsToReset = ["teamA", "teamB", "score", "overs", "batsman", "bowler", "status", "target", "toss", "innings", "runRate", "requiredRate", "partnership", "lastOver"];
    idsToReset.forEach((id) => {
      const el = byId(id);
      if (el) el.textContent = id === "score" ? "0/0" : "-";
    });
    if (byId("timeline")) byId("timeline").innerHTML = "<div class='timeline-item'>No active match.</div>";
    if (byId("scorecard")) byId("scorecard").innerHTML = "<div class='scorecard-row'><span>Create a match from admin panel.</span><span>-</span><span>-</span><span>-</span><span>-</span></div>";
    if (badge) badge.textContent = "Idle";
    renderPointsTable(state);
    renderFixtures(state);
    renderInsights(state);
    renderHistory(state);
    return;
  }

  let matchId = explicitMatchId;
  if (!matchId || !state.matches[matchId]) {
    matchId = state.activeMatchId && state.matches[state.activeMatchId] ? state.activeMatchId : ids[0];
  }

  selector.innerHTML = ids.map((id) => {
    const m = state.matches[id];
    return `<option value="${id}" ${id === matchId ? "selected" : ""}>${m.teamA} vs ${m.teamB}</option>`;
  }).join("");

  const match = state.matches[matchId];
  byId("teamA").textContent = match.teamA;
  byId("teamB").textContent = match.teamB;
  byId("score").textContent = `${match.score.runs}/${match.score.wickets}`;
  byId("overs").textContent = oversText(match.score);
  byId("batsman").textContent = match.currentBatsman || "-";
  byId("bowler").textContent = match.currentBowler || "-";
  byId("status").textContent = match.winner || match.status;
  byId("target").textContent = match.target > 0 ? String(match.target) : "-";
  byId("toss").textContent = match.tossWinner || "-";
  byId("innings").textContent = match.innings === 2 ? "2nd" : "1st";
  byId("runRate").textContent = runRate(match);
  byId("requiredRate").textContent = requiredRunRate(match);
  byId("partnership").textContent = `${match.partnership.runs} (${match.partnership.balls})`;
  byId("lastOver").textContent = match.score.timeline.slice(-6).map((x) => x.label).join(" ") || "-";
  byId("overProgress").style.width = `${(match.score.balls / 6) * 100}%`;

  byId("timeline").innerHTML = match.score.timeline.length
    ? match.score.timeline.slice().reverse().slice(0, 18).map((i) => `<div class="timeline-item">${i.over} • ${i.label}</div>`).join("")
    : "<div class='timeline-item'>No ball-by-ball updates yet.</div>";

  const head = "<div class='scorecard-row'><strong>Batter</strong><strong>R</strong><strong>B</strong><strong>4s</strong><strong>6s</strong></div>";
  const rows = match.players.batsmen.map((p) => `<div class='scorecard-row'><span>${p.name}</span><span>${p.runs}</span><span>${p.balls}</span><span>${p.fours}</span><span>${p.sixes}</span></div>`).join("");
  byId("scorecard").innerHTML = head + rows;

  selector.onchange = () => renderPublic(state, selector.value);
  if (badge) badge.textContent = `Synced ${new Date().toLocaleTimeString()}`;

  renderPointsTable(state);
  renderFixtures(state);
  renderInsights(state);
  renderHistory(state);
}

function attachAdmin(state) {
  const loginCard = byId("loginCard");
  const panel = byId("adminPanel");
  const selector = byId("adminMatchSelector");
  const saveMsg = byId("saveMsg");
  const loginMsg = byId("loginMsg");

  const setAuth = (ok) => {
    panel.classList.toggle("hidden", !ok);
    loginCard.classList.toggle("hidden", ok);
  };

  setAuth(Boolean(sessionStorage.getItem(STORAGE_KEYS.token)));

  byId("loginBtn")?.addEventListener("click", async () => {
    const password = byId("adminPassword").value.trim();
    if (!password) {
      loginMsg.textContent = "Password required";
      return;
    }
    try {
      const data = await loginAdmin(password);
      sessionStorage.setItem(STORAGE_KEYS.token, data.token);
      loginMsg.textContent = "Login successful";
      setAuth(true);
    } catch {
      loginMsg.textContent = "Invalid password";
      setAuth(false);
    }
  });

  const activeMatch = () => state.activeMatchId ? state.matches[state.activeMatchId] : null;

  const touch = () => {
    state.updatedAt = new Date().toISOString();
    saveLocal(state);
  };

  const renderMatchSelector = () => {
    const ids = Object.keys(state.matches);
    selector.innerHTML = ids.map((id) => {
      const m = state.matches[id];
      return `<option value="${id}" ${id === state.activeMatchId ? "selected" : ""}>${m.teamA} vs ${m.teamB}</option>`;
    }).join("");
  };

  const renderAdminFixtures = () => {
    const box = byId("adminFixtureList");
    if (!box) return;
    box.innerHTML = state.fixtures.length
      ? state.fixtures.map((f) => `<div class="history-item">${f.teamA} vs ${f.teamB}<br><span class="muted">${f.date || "TBA"} • ${f.venue || "Venue TBA"} • ${f.status}</span></div>`).join("")
      : "<div class='history-item'>No fixtures added.</div>";
  };

  const syncInputsFromState = () => {
    byId("tournamentNameInput").value = state.settings.tournamentName || "";
    byId("defaultOversInput").value = state.settings.defaultOvers || 20;
    const m = activeMatch();
    if (!m) return;
    byId("targetInput").value = m.target || 0;
    byId("batsmanInput").value = m.currentBatsman || "";
    byId("bowlerInput").value = m.currentBowler || "";
    byId("statusInput").value = m.status || "";
    byId("battingTeamInput").value = m.battingTeam || "";
    byId("bowlingTeamInput").value = m.bowlingTeam || "";
    byId("adminQuickScore").textContent = `${m.score.runs}/${m.score.wickets} (${oversText(m.score)})`;
    renderQR(m.id);
  };

  const syncStateFromInputs = () => {
    state.settings.tournamentName = byId("tournamentNameInput").value.trim() || "Live Cricket Dashboard";
    state.settings.defaultOvers = Math.max(1, safeNum(byId("defaultOversInput").value || 20));

    const m = activeMatch();
    if (!m) return;
    m.target = Math.max(0, safeNum(byId("targetInput").value));
    m.currentBatsman = byId("batsmanInput").value.trim() || m.currentBatsman;
    m.currentBowler = byId("bowlerInput").value.trim() || m.currentBowler;
    m.status = byId("statusInput").value.trim() || m.status;
    m.battingTeam = byId("battingTeamInput").value.trim() || m.battingTeam;
    m.bowlingTeam = byId("bowlingTeamInput").value.trim() || m.bowlingTeam;
    m.players.bowler.name = m.currentBowler;
  };

  byId("createMatchBtn")?.addEventListener("click", () => {
    syncStateFromInputs();
    const match = buildMatch({
      teamA: byId("newTeamA").value,
      teamB: byId("newTeamB").value,
      maxOvers: byId("newMaxOvers").value || state.settings.defaultOvers,
      tossWinner: byId("newTossWinner").value,
      batsman: byId("newBatsman").value,
      bowler: byId("newBowler").value
    });
    state.matches[match.id] = match;
    state.activeMatchId = match.id;
    renderMatchSelector();
    syncInputsFromState();
    touch();
  });

  selector?.addEventListener("change", () => {
    state.activeMatchId = selector.value;
    syncInputsFromState();
  });

  byId("addFixtureBtn")?.addEventListener("click", () => {
    const fixture = makeFixture({
      teamA: byId("fixtureTeamA").value,
      teamB: byId("fixtureTeamB").value,
      date: byId("fixtureDate").value,
      venue: byId("fixtureVenue").value
    });
    if (!fixture.teamA || !fixture.teamB) {
      saveMsg.textContent = "Fixture teams are required";
      return;
    }
    state.fixtures.push(fixture);
    renderAdminFixtures();
    touch();
    saveMsg.textContent = "Fixture added";
  });

  document.querySelectorAll("[data-action]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const m = activeMatch();
      if (!m) return;
      syncStateFromInputs();
      const action = btn.getAttribute("data-action");

      if (action === "start") {
        m.status = "live";
        m.startedAt = m.startedAt || new Date().toISOString();
      }

      if (action === "end") {
        m.status = "ended";
        m.endedAt = new Date().toISOString();
        setWinnerIfNeeded(m);
        if (!state.history.includes(m.id)) state.history.unshift(m.id);
        const fx = state.fixtures.find((f) => f.status === "upcoming" && ((f.teamA === m.teamA && f.teamB === m.teamB) || (f.teamA === m.teamB && f.teamB === m.teamA)));
        if (fx) {
          fx.status = "completed";
          fx.result = m.winner || "Match completed";
        }
      }

      if (action === "reset") {
        if (!confirm("Reset this match score?")) return;
        const reset = buildMatch({
          teamA: m.teamA,
          teamB: m.teamB,
          maxOvers: m.maxOvers,
          tossWinner: m.tossWinner,
          batsman: m.currentBatsman,
          bowler: m.currentBowler
        });
        reset.id = m.id;
        state.matches[m.id] = reset;
      }

      if (action === "switch-innings" && m.innings === 1) {
        m.firstInningsScore = m.score.runs;
        m.target = m.score.runs + 1;
        m.innings = 2;
        const oldBat = m.battingTeam;
        m.battingTeam = m.bowlingTeam;
        m.bowlingTeam = oldBat;
        m.status = "live";
        m.score = {
          runs: 0,
          wickets: 0,
          overs: 0,
          balls: 0,
          extras: { wide: 0, noBall: 0 },
          timeline: [],
          undoStack: []
        };
        m.partnership = { runs: 0, balls: 0 };
        m.players = {
          batsmen: [{ name: m.currentBatsman || "Batsman", runs: 0, balls: 0, fours: 0, sixes: 0 }],
          bowler: { name: m.currentBowler || "Bowler", overs: "0.0", runsConceded: 0, wickets: 0 }
        };
      }

      renderAdminFixtures();
      syncInputsFromState();
      touch();
    });
  });

  document.querySelectorAll("[data-ball]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const m = activeMatch();
      if (!m) return;
      syncStateFromInputs();
      const type = btn.getAttribute("data-ball");
      if (type === "UNDO") undoBall(m);
      if (type === "DOT") applyBall(m, { type: "dot" });
      if (type === "W") applyBall(m, { type: "wicket" });
      if (type === "WD") applyBall(m, { type: "wide" });
      if (type === "NB") applyBall(m, { type: "noball" });
      if (["1", "2", "3", "4", "6"].includes(type)) applyBall(m, { type: "run", runs: safeNum(type) });
      syncInputsFromState();
      touch();
    });
  });

  byId("saveBtn")?.addEventListener("click", async () => {
    syncStateFromInputs();
    touch();
    try {
      await pushState(state);
      saveMsg.textContent = `Saved to cloud at ${new Date().toLocaleTimeString()}`;
    } catch (err) {
      saveMsg.textContent = `Cloud save failed. Local backup available (${err.message || "error"})`;
    }
  });

  byId("shareBtn")?.addEventListener("click", async () => {
    const m = activeMatch();
    if (!m) return;
    const url = `${window.location.origin}/?match=${encodeURIComponent(m.id)}`;
    try {
      await navigator.clipboard.writeText(url);
      saveMsg.textContent = "Share link copied";
    } catch {
      saveMsg.textContent = url;
    }
  });

  byId("pdfBtn")?.addEventListener("click", () => window.print());

  function renderQR(matchId) {
    const wrap = byId("qrWrap");
    if (!wrap || !window.QRCode || !matchId) return;
    wrap.innerHTML = "";
    const url = `${window.location.origin}/?match=${encodeURIComponent(matchId)}`;
    window.QRCode.toCanvas(url, { width: 180 }, (err, canvas) => {
      if (!err && canvas) wrap.appendChild(canvas);
    });
  }

  if (!state.activeMatchId && Object.keys(state.matches).length) {
    state.activeMatchId = Object.keys(state.matches)[0];
  }

  renderMatchSelector();
  renderAdminFixtures();
  syncInputsFromState();
}

async function initPublic() {
  setupTabs();
  let state = await fetchState();
  const queryMatch = new URLSearchParams(window.location.search).get("match");
  renderPublic(state, queryMatch);
  setInterval(async () => {
    state = await fetchState();
    renderPublic(state, byId("matchSelector")?.value || queryMatch);
  }, 5000);
}

async function initAdmin() {
  const state = await fetchState();
  attachAdmin(state);
}

document.addEventListener("DOMContentLoaded", () => {
  const page = document.body.getAttribute("data-page");
  if (page === "public") initPublic();
  if (page === "admin") initAdmin();
});
