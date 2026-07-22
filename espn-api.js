/**
 * espn-api.js
 * Wrapper untuk mengambil data PIALA AFF 2026 (ASEAN Championship / ASEAN Hyundai Cup 2026)
 * langsung dari endpoint publik ESPN (tidak perlu API key). Dipakai di semua halaman.
 *
 * Endpoint ESPN yang dipakai:
 *  - /scoreboard?dates=YYYYMMDD-YYYYMMDD  -> jadwal + skor + detail kejadian (gol, dst)
 *
 * Klasemen & Top Skor TIDAK diambil dari endpoint terpisah (endpoint tersebut tidak stabil
 * untuk turnamen regional seperti AFF), melainkan DIHITUNG SENDIRI dari data pertandingan
 * yang sama supaya tetap 100% bersumber dari ESPN dan otomatis update setiap kali ada
 * pertandingan baru yang selesai.
 *
 * Hasil di-cache sebentar di sessionStorage supaya pindah halaman/refresh tidak
 * fetch ulang terus-menerus, tapi tetap "segar" (auto expired ~25 detik).
 */

// League slug ESPN untuk ASEAN Championship (AFF Championship)
const ESPN_BASE = 'https://site.api.espn.com/apis/site/v2/sports/soccer/aff.championship';

// Rentang tanggal turnamen PIALA AFF 2026 (dengan buffer beberapa hari di awal & akhir
// supaya laga pembuka/penutup atau jadwal yang berubah tetap ke-cover).
// Sumber: ASEAN Hyundai Cup 2026 berlangsung 24 Juli - 26 Agustus 2026.
const AFF_2026_RANGE = { start: '20260715', end: '20260905' };

const ESPN_CACHE_TTL_MS = 25 * 1000; // 25 detik (lebih pendek dari interval polling live)

async function espnFetchJSON(url) {
  const cacheKey = 'espn_cache_' + url;
  try {
    const cached = sessionStorage.getItem(cacheKey);
    if (cached) {
      const parsed = JSON.parse(cached);
      if (Date.now() - parsed.ts < ESPN_CACHE_TTL_MS) {
        return parsed.data;
      }
    }
  } catch (e) {
    /* sessionStorage tidak tersedia, lanjut fetch biasa */
  }

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error('ESPN API error: HTTP ' + res.status);
  }
  const data = await res.json();

  try {
    sessionStorage.setItem(cacheKey, JSON.stringify({ ts: Date.now(), data }));
  } catch (e) {
    /* storage penuh / tidak tersedia, abaikan */
  }

  return data;
}

/**
 * Ambil semua event (pertandingan) ESPN dalam rentang tanggal tertentu.
 * @param {{start: string, end: string}} range format YYYYMMDD
 * @returns {Promise<Array>} array event mentah dari ESPN
 */
async function fetchEspnEvents(range) {
  const url = `${ESPN_BASE}/scoreboard?dates=${range.start}-${range.end}&limit=200`;
  const data = await espnFetchJSON(url);
  return Array.isArray(data.events) ? data.events : [];
}

/**
 * Ubah 1 event mentah ESPN jadi objek pertandingan yang lebih ringkas
 * dan gampang dipakai buat render UI.
 */
function normalizeEspnEvent(ev) {
  const comp = (ev.competitions && ev.competitions[0]) || {};
  const competitors = comp.competitors || [];
  const home = competitors.find((c) => c.homeAway === 'home') || {};
  const away = competitors.find((c) => c.homeAway === 'away') || {};

  const statusType = (comp.status && comp.status.type) || {};
  const state = statusType.state || 'pre'; // pre | in | post
  let status = 'scheduled';
  if (state === 'in') status = 'live';
  else if (state === 'post') status = statusType.completed ? 'finished' : 'finished';

  const venue = comp.venue || {};
  const groupNote = comp.altGameNote || comp.notes?.[0]?.headline || '';
  const groupMatch = groupNote.match(/Group\s+([A-Z])/i);
  const lowerNote = groupNote.toLowerCase();

  return {
    id: ev.id,
    date: ev.date, // ISO string UTC
    status,
    statusDetail: statusType.shortDetail || statusType.detail || '',
    home: {
      id: home.team ? home.team.id : null,
      name: home.team ? home.team.displayName : '',
      abbrev: home.team ? home.team.abbreviation : '',
      score: home.score !== undefined ? parseInt(home.score, 10) : null,
      winner: !!home.winner,
      logo: home.team ? home.team.logo : '',
    },
    away: {
      id: away.team ? away.team.id : null,
      name: away.team ? away.team.displayName : '',
      abbrev: away.team ? away.team.abbreviation : '',
      score: away.score !== undefined ? parseInt(away.score, 10) : null,
      winner: !!away.winner,
      logo: away.team ? away.team.logo : '',
    },
    venueName: venue.fullName || '',
    venueCity: venue.address ? venue.address.city : '',
    venueCountry: venue.address ? venue.address.country : '',
    group: groupMatch
      ? groupMatch[1]
      : lowerNote.includes('semifinal')
      ? 'SF'
      : lowerNote.includes('final')
      ? 'F'
      : lowerNote.includes('3rd') || lowerNote.includes('third')
      ? '3RD'
      : 'OTHER',
    note: groupNote,
    details: comp.details || [],
    raw: ev,
  };
}

/**
 * Ambil & normalisasi semua pertandingan dalam satu rentang tanggal.
 */
async function getMatches(range) {
  const events = await fetchEspnEvents(range || AFF_2026_RANGE);
  return events.map(normalizeEspnEvent).sort((a, b) => new Date(a.date) - new Date(b.date));
}

/**
 * Hitung klasemen fase grup dari daftar pertandingan yang sudah selesai.
 * Menghasilkan objek: { A: [ {team, main, played, win, draw, lose, gf, ga, gd, pts} ], B: [...] }
 * Hanya memakai match dengan group A-Z (fase grup), knockout (SF/F/3RD) diabaikan dari klasemen.
 */
function computeStandings(matches) {
  const table = {}; // group -> teamId -> row

  matches.forEach((m) => {
    if (m.status !== 'finished') return;
    if (!/^[A-Z]$/.test(m.group)) return; // hanya huruf tunggal = fase grup
    if (m.home.score === null || m.away.score === null) return;

    if (!table[m.group]) table[m.group] = {};
    const grp = table[m.group];

    [
      { team: m.home, gf: m.home.score, ga: m.away.score },
      { team: m.away, gf: m.away.score, ga: m.home.score },
    ].forEach(({ team, gf, ga }) => {
      const key = team.id || team.name;
      if (!grp[key]) {
        grp[key] = {
          id: key,
          name: team.name,
          abbrev: team.abbrev,
          logo: team.logo,
          played: 0,
          win: 0,
          draw: 0,
          lose: 0,
          gf: 0,
          ga: 0,
          pts: 0,
        };
      }
      const row = grp[key];
      row.played += 1;
      row.gf += gf;
      row.ga += ga;
      if (gf > ga) {
        row.win += 1;
        row.pts += 3;
      } else if (gf === ga) {
        row.draw += 1;
        row.pts += 1;
      } else {
        row.lose += 1;
      }
    });
  });

  const result = {};
  Object.keys(table)
    .sort()
    .forEach((group) => {
      const rows = Object.values(table[group]).map((r) => ({ ...r, gd: r.gf - r.ga }));
      rows.sort((a, b) => b.pts - a.pts || b.gd - a.gd || b.gf - a.gf || a.name.localeCompare(b.name));
      result[group] = rows;
    });
  return result;
}

/**
 * Hitung daftar top skor dari field `details` (kejadian gol) tiap pertandingan.
 * ESPN menandai kejadian gol lewat detail.type.text yang mengandung kata "Goal".
 * Gol bunuh diri ("Own Goal") sengaja tidak dihitung sebagai gol pencetak skor.
 */
function computeTopScorers(matches) {
  const scorers = {}; // playerKey -> { name, team, teamLogo, goals }

  matches.forEach((m) => {
    if (!Array.isArray(m.details)) return;
    const teamById = {
      [m.home.id]: m.home,
      [m.away.id]: m.away,
    };

    m.details.forEach((d) => {
      const label = ((d.type && d.type.text) || '').toLowerCase();
      const isGoal = label.includes('goal') && !label.includes('missed');
      const isOwnGoal = label.includes('own goal');
      if (!isGoal || isOwnGoal) return;

      const athletes = d.athletesInvolved || (d.athlete ? [d.athlete] : []);
      if (!athletes.length) return;

      const scorer = athletes[0];
      const teamId = d.team && d.team.id;
      const team = teamById[teamId] || {};
      const key = scorer.id || scorer.displayName;

      if (!scorers[key]) {
        scorers[key] = {
          id: key,
          name: scorer.displayName || scorer.shortName || 'Pemain',
          team: team.name || '-',
          teamAbbrev: team.abbrev || '',
          teamLogo: team.logo || '',
          goals: 0,
        };
      }
      scorers[key].goals += 1;
    });
  });

  return Object.values(scorers).sort((a, b) => b.goals - a.goals || a.name.localeCompare(b.name));
}

/**
 * Jalankan fungsi render berulang secara otomatis tanpa perlu refresh manual.
 * Interval dibuat adaptif: kalau ada pertandingan live, refresh tiap 30 detik;
 * kalau tidak ada yang live, refresh tiap 2 menit (hemat request ke ESPN);
 * kalau gagal fetch, coba lagi lebih cepat (15 detik).
 *
 * @param {() => Promise<boolean|'error'>} renderFn fungsi yang fetch + render halaman.
 *   Harus mengembalikan:
 *     - true   -> ada pertandingan live saat ini
 *     - false  -> berhasil, tidak ada yang live
 *     - 'error' -> fetch/render gagal
 * @param {HTMLElement} [indicatorEl] elemen kecil buat nunjukin status auto-update
 */
function startAutoRefresh(renderFn, indicatorEl) {
  let timer = null;

  function setIndicator(status) {
    if (!indicatorEl) return;
    indicatorEl.classList.remove('indicator-ok', 'indicator-live', 'indicator-error');

    if (status === 'error') {
      indicatorEl.classList.add('indicator-error');
      indicatorEl.textContent = '● Gagal Terhubung';
    } else if (status === true) {
      indicatorEl.classList.add('indicator-live');
      indicatorEl.textContent = '● LIVE UPDATE';
    } else {
      indicatorEl.classList.add('indicator-ok');
      indicatorEl.textContent = '● Otomatis Update';
    }
  }

  async function tick() {
    let status = false;
    try {
      status = await renderFn();
    } catch (err) {
      console.error('Auto-refresh gagal:', err);
      status = 'error';
    }

    setIndicator(status);

    clearTimeout(timer);
    const delay = status === 'error' ? 15 * 1000 : status === true ? 30 * 1000 : 120 * 1000;
    timer = setTimeout(tick, delay);
  }

  tick();

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      clearTimeout(timer);
      tick();
    }
  });
}
