/**
 * main.js
 * Merender halaman Piala AFF 2026 (Jadwal, Klasemen, Top Skor) memakai
 * data dari espn-api.js. Semua data diambil ulang otomatis lewat startAutoRefresh().
 */

const GROUP_LABELS = {
  SF: 'Semifinal',
  F: 'Final',
  '3RD': 'Perebutan Juara 3',
  OTHER: 'Lainnya',
};

let activeGroupFilter = 'ALL';
let lastMatches = [];

const scheduleEl = document.getElementById('schedule-container');
const filtersEl = document.getElementById('group-filters');
const standingsEl = document.getElementById('standings-container');
const scorerEl = document.getElementById('topscorer-container');
const indicatorEl = document.getElementById('live-indicator');

function fmtDateLabel(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}
function fmtTime(iso) {
  const d = new Date(iso);
  return d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) + ' WIB';
}
function groupLabel(g) {
  return GROUP_LABELS[g] || `Grup ${g}`;
}
function badgeForStatus(m) {
  if (m.status === 'live') return `<span class="badge badge-live">${m.statusDetail || 'LIVE'}</span>`;
  if (m.status === 'finished') return `<span class="badge badge-finished">Selesai</span>`;
  return `<span class="badge badge-scheduled">${fmtTime(m.date)}</span>`;
}
function teamLogo(t) {
  return t.logo || 'https://a.espncdn.com/i/teamlogos/soccer/500/default-team-logo-500.png';
}

/* ------------------------------- JADWAL -------------------------------- */

function renderGroupFilters(matches) {
  const groups = Array.from(new Set(matches.map((m) => m.group))).sort();
  filtersEl.innerHTML = '<button class="chip' + (activeGroupFilter === 'ALL' ? ' active' : '') + '" data-group="ALL">Semua</button>' +
    groups.map((g) => `<button class="chip${activeGroupFilter === g ? ' active' : ''}" data-group="${g}">${groupLabel(g)}</button>`).join('');

  filtersEl.querySelectorAll('.chip').forEach((btn) => {
    btn.addEventListener('click', () => {
      activeGroupFilter = btn.dataset.group;
      renderSchedule(lastMatches);
      renderGroupFilters(lastMatches);
    });
  });
}

function renderSchedule(matches) {
  const filtered = activeGroupFilter === 'ALL' ? matches : matches.filter((m) => m.group === activeGroupFilter);

  if (!filtered.length) {
    scheduleEl.innerHTML = `<div class="empty-state"><strong>Belum ada jadwal</strong>Data pertandingan akan muncul otomatis setelah tersedia dari ESPN.</div>`;
    return;
  }

  const cards = filtered
    .map(
      (m) => `
    <article class="match-card">
      <div class="match-top">
        <span class="badge badge-group">${groupLabel(m.group)}</span>
        ${badgeForStatus(m)}
      </div>
      <div class="match-date">${fmtDateLabel(m.date)}</div>
      <div class="match-teams">
        <div class="team home">
          <img src="${teamLogo(m.home)}" alt="" loading="lazy" onerror="this.style.visibility='hidden'"/>
          <span class="team-name">${m.home.name || 'TBD'}</span>
        </div>
        <div class="score-box">
          ${m.status === 'scheduled'
            ? '<span class="score-vs">VS</span>'
            : `<span>${m.home.score ?? '-'}</span><span class="score-vs">:</span><span>${m.away.score ?? '-'}</span>`}
        </div>
        <div class="team away">
          <img src="${teamLogo(m.away)}" alt="" loading="lazy" onerror="this.style.visibility='hidden'"/>
          <span class="team-name">${m.away.name || 'TBD'}</span>
        </div>
      </div>
      <div class="match-meta">
        <span>${m.venueName || 'Venue belum diumumkan'}</span>
        <span>${m.venueCity || ''}</span>
      </div>
    </article>`
    )
    .join('');

  scheduleEl.innerHTML = `<div class="match-grid">${cards}</div>`;
}

/* ------------------------------ KLASEMEN -------------------------------- */

function renderStandings(matches) {
  const standings = computeStandings(matches);
  const groups = Object.keys(standings);

  if (!groups.length) {
    standingsEl.innerHTML = `<div class="empty-state" style="grid-column:1/-1"><strong>Klasemen belum tersedia</strong>Klasemen akan otomatis terhitung begitu ada pertandingan fase grup yang selesai.</div>`;
    return;
  }

  standingsEl.innerHTML = groups
    .map((g) => {
      const rows = standings[g]
        .map(
          (r, i) => `
        <tr class="${i < 2 ? 'qualify' : ''}">
          <td><span class="pos-cell">${i + 1}</span></td>
          <td><div class="team-cell"><img src="${r.logo || ''}" alt="" onerror="this.style.display='none'"/>${r.name}</div></td>
          <td>${r.played}</td>
          <td>${r.win}</td>
          <td>${r.draw}</td>
          <td>${r.lose}</td>
          <td>${r.gd > 0 ? '+' : ''}${r.gd}</td>
          <td class="pts">${r.pts}</td>
        </tr>`
        )
        .join('');
      return `
      <div class="card card-dark standings-card">
        <div class="group-title"><span>${groupLabel(g)}</span><span>${standings[g].length} Tim</span></div>
        <table class="standings">
          <thead><tr><th>#</th><th>Tim</th><th>M</th><th>M</th><th>S</th><th>K</th><th>SG</th><th>Poin</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
    })
    .join('');
}

/* ------------------------------ TOP SKOR -------------------------------- */

function renderTopScorers(matches) {
  const scorers = computeTopScorers(matches).slice(0, 10);

  if (!scorers.length) {
    scorerEl.innerHTML = `<div class="empty-state"><strong>Belum ada data gol</strong>Daftar top skor otomatis muncul begitu ada gol yang tercatat di pertandingan.</div>`;
    return;
  }

  scorerEl.innerHTML = `<div class="scorer-list">${scorers
    .map(
      (s, i) => `
    <div class="scorer-row">
      <span class="rank">${i + 1}</span>
      <img src="${s.teamLogo || ''}" alt="" onerror="this.style.visibility='hidden'"/>
      <div class="scorer-info">
        <div class="scorer-name">${s.name}</div>
        <div class="scorer-team">${s.team}</div>
      </div>
      <div class="scorer-goals">${s.goals}<span>gol</span></div>
    </div>`
    )
    .join('')}</div>`;
}

/* -------------------------------- MAIN ----------------------------------- */

async function renderAll() {
  const matches = await getMatches(AFF_2026_RANGE);
  lastMatches = matches;

  renderGroupFilters(matches);
  renderSchedule(matches);
  renderStandings(matches);
  renderTopScorers(matches);

  return matches.some((m) => m.status === 'live');
}

startAutoRefresh(renderAll, indicatorEl);
