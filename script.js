// ============================================================
// KONFIGURASI (SUDAH DIISI DENGAN DATA KAMU)
// ============================================================
const CLIENT_ID = '616cec747de64e629c42df7f74c1888f'; 
const REDIRECT_URI = 'https://spotify-itel.vercel.app'; 
const SCOPES = [
    'user-read-private',
    'user-read-email',
    'playlist-read-private',
    'playlist-read-collaborative',
    'user-read-playback-state',
    'user-modify-playback-state',
];

let accessToken = null;

// ============================================================
// PKCE HELPERS (Untuk Keamanan Login)
// ============================================================
function generateRandomString(length) {
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let text = '';
    for (let i = 0; i < length; i++)
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    return text;
}

async function generateCodeChallenge(verifier) {
    const data = new TextEncoder().encode(verifier);
    const digest = await crypto.subtle.digest('SHA-256', data);
    return btoa(String.fromCharCode(...new Uint8Array(digest)))
        .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// ============================================================
// PROSES LOGIN
// ============================================================
async function redirectToAuth() {
    const verifier = generateRandomString(128);
    const challenge = await generateCodeChallenge(verifier);
    localStorage.setItem('code_verifier', verifier);

    const params = new URLSearchParams({
        client_id: CLIENT_ID,
        response_type: 'code',
        redirect_uri: REDIRECT_URI,
        scope: SCOPES.join(' '),
        code_challenge_method: 'S256',
        code_challenge: challenge,
    });
    window.location.href = `https://accounts.spotify.com/authorize?${params}`;
}

async function exchangeCodeForToken(code) {
    const verifier = localStorage.getItem('code_verifier');
    const body = new URLSearchParams({
        client_id: CLIENT_ID,
        grant_type: 'authorization_code',
        code,
        redirect_uri: REDIRECT_URI,
        code_verifier: verifier,
    });

    const res = await fetch('https://accounts.spotify.com/api/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
    });
    const data = await res.json();
    if (data.access_token) {
        localStorage.setItem('access_token', data.access_token);
        return data.access_token;
    }
    throw new Error('Gagal mendapatkan access token');
}

// ============================================================
// API CALLS
// ============================================================
async function apiGet(url) {
    const res = await fetch(url, {
        headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (res.status === 204) return null;
    return res.json();
}

async function fetchProfile() {
    return apiGet('https://api.spotify.com/v1/me');
}

async function fetchPlaylists() {
    return apiGet('https://api.spotify.com/v1/me/playlists?limit=24');
}

async function searchMusic(query) {
    const q = encodeURIComponent(query);
    return apiGet(
        `https://api.spotify.com/v1/search?q=${q}&type=track,artist,album&limit=10`
    );
}

// ============================================================
// TAMPILAN UI
// ============================================================
function showDashboard() {
    document.getElementById('login-section').classList.add('hidden');
    document.getElementById('dashboard').classList.remove('hidden');
}

function renderUser(user) {
    const avatar = user.images?.[0]?.url || 'https://via.placeholder.com/36';
    document.getElementById('sidebar-avatar').src = avatar;
    document.getElementById('sidebar-name').textContent = user.display_name || 'User';
    document.getElementById('greeting-name').textContent = user.display_name?.split(' ')[0] || 'User';
}

function createCard({ img, title, subtitle, onClick }) {
    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = `
        <img src="${img || 'https://via.placeholder.com/160'}" alt="${title}">
        <div class="card-title">${title}</div>
        ${subtitle ? `<div class="card-sub">${subtitle}</div>` : ''}
    `;
    if (onClick) card.addEventListener('click', onClick);
    return card;
}

function renderPlaylists(container, playlists) {
    container.innerHTML = '';
    const items = playlists?.items || [];

    if (items.length === 0) {
        container.innerHTML = '<p class="empty-msg">Belum ada playlist.</p>';
        return;
    }

    items.forEach((pl) => {
        if (!pl) return;
        container.appendChild(createCard({
            img: pl.images?.[0]?.url,
            title: pl.name,
            subtitle: `${pl.tracks?.total ?? 0} lagu`,
            onClick: () => pl.external_urls?.spotify && window.open(pl.external_urls.spotify, '_blank'),
        }));
    });
}

function renderSearchResults(data) {
    const container = document.getElementById('search-results');
    container.innerHTML = '';
    const results = [];

    (data.tracks?.items || []).forEach((t) => {
        results.push({
            img: t.album?.images?.[0]?.url,
            title: t.name,
            subtitle: t.artists?.map((a) => a.name).join(', '),
            url: t.external_urls?.spotify,
        });
    });

    (data.artists?.items || []).forEach((a) => {
        results.push({
            img: a.images?.[0]?.url,
            title: a.name,
            subtitle: 'Artis',
            url: a.external_urls?.spotify,
        });
    });

    (data.albums?.items || []).forEach((al) => {
        results.push({
            img: al.images?.[0]?.url,
            title: al.name,
            subtitle: al.artists?.map((a) => a.name).join(', '),
            url: al.external_urls?.spotify,
        });
    });

    if (results.length === 0) {
        container.innerHTML = '<p class="empty-msg">Tidak ada hasil ditemukan.</p>';
        return;
    }

    results.forEach((r) => {
        container.appendChild(createCard({
            img: r.img,
            title: r.title,
            subtitle: r.subtitle,
            onClick: () => r.url && window.open(r.url, '_blank'),
        }));
    });
}

// ============================================================
// NAVIGASI
// ============================================================
function switchView(viewName) {
    document.querySelectorAll('.view').forEach((v) => v.classList.add('hidden'));
    document.getElementById(`view-${viewName}`)?.classList.remove('hidden');

    document.querySelectorAll('.nav-item').forEach((n) =>
        n.classList.toggle('active', n.dataset.view === viewName)
    );
}

// ============================================================
// INISIALISASI SAAT HALAMAN DIBUKA
// ============================================================
document.addEventListener('DOMContentLoaded', async () => {
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');

    if (code) {
        try {
            accessToken = await exchangeCodeForToken(code);
            window.history.replaceState({}, document.title, '/');
        } catch (err) {
            console.error('Auth error:', err);
            alert('Gagal login. Cek console untuk detail.');
            return;
        }
    } else {
        accessToken = localStorage.getItem('access_token');
    }

    if (!accessToken) {
        document.getElementById('login-btn').addEventListener('click', redirectToAuth);
        return;
    }

    try {
        const [user, playlists] = await Promise.all([
            fetchProfile(),
            fetchPlaylists(),
        ]);
        showDashboard();
        renderUser(user);
        renderPlaylists(document.getElementById('playlists-grid'), playlists);
        renderPlaylists(document.getElementById('all-playlists'), playlists);
    } catch (err) {
        console.error('Load error:', err);
        localStorage.removeItem('access_token');
        document.getElementById('login-btn').addEventListener('click', redirectToAuth);
    }

    // Event Navigasi
    document.querySelectorAll('.nav-item').forEach((item) => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            switchView(item.dataset.view);
        });
    });

    // Event Pencarian
    const searchInput = document.getElementById('search-input');
    const searchBtn = document.getElementById('search-btn');

    async function doSearch() {
        const query = searchInput.value.trim();
        if (!query) return;
        switchView('search');
        document.getElementById('search-results').innerHTML = '<p class="empty-msg">Mencari...</p>';

        try {
            const data = await searchMusic(query);
            renderSearchResults(data);
        } catch (err) {
            console.error('Search error:', err);
            document.getElementById('search-results').innerHTML = '<p class="empty-msg">Gagal mencari. Coba lagi.</p>';
        }
    }

    searchBtn.addEventListener('click', doSearch);
    searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') doSearch();
    });
});