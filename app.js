/**
 * ==========================================================================
 * KDP-Factory Visitor Dashboard Script (app.js)
 * Standalone, client-side bookshelf that reads 'books.json' and streams
 * audiobooks and book deliverables directly from Google Drive.
 * ==========================================================================
 */

// State Management
let allBooks = [];
let activeGenreFilter = 'all';
let groupGenreView = false;
let collapsedGenres = new Set();
let searchQuery = '';
let activeSort = 'date-desc';
let allowedHashes = [];
let userToken = ''; // Store validated email address

// Audio Player State
let currentPlaylist = [];
let currentTrackIndex = -1;

// DOM Elements
const galleryContainer = document.getElementById('gallery-container');
const galleryCountBadge = document.getElementById('gallery-count-badge');
const btnRefreshGallery = document.getElementById('btn-refresh-gallery');
const gallerySearchInput = document.getElementById('gallery-search');
const btnClearSearch = document.getElementById('clear-search-btn');
const gallerySortSelect = document.getElementById('gallery-sort');
const btnToggleView = document.getElementById('btn-toggle-view');
const toggleViewText = document.getElementById('toggle-view-text');
const filterPillsContainer = document.getElementById('filter-pills-container');

// Authentication Modal Elements
const authModal = document.getElementById('auth-modal');
const authForm = document.getElementById('auth-form');
const authEmailInput = document.getElementById('auth-email');
const authErrorMsg = document.getElementById('auth-error-msg');

// Audio Player Elements
const audioPlayerModal = document.getElementById('audio-player-modal');
const btnClosePlayer = document.getElementById('btn-close-player');
const playerBookTitle = document.getElementById('player-book-title');
const playerCurrentTrackTitle = document.getElementById('player-current-track-title');
const mainAudioElement = document.getElementById('main-audio-element');
const playerDiscArt = document.getElementById('player-disc-art');
const playerTimeCurrent = document.getElementById('player-time-current');
const playerTimeTotal = document.getElementById('player-time-total');
const playerScrubber = document.getElementById('player-scrubber');
const playerSpeedSelect = document.getElementById('player-speed');
const playerPlaylistContainer = document.getElementById('player-playlist-container');

// Audio Player Buttons
const playerBtnPrev = document.getElementById('player-btn-prev');
const playerBtnRewind = document.getElementById('player-btn-rewind');
const playerBtnPlayPause = document.getElementById('player-btn-play-pause');
const playerBtnForward = document.getElementById('player-btn-forward');
const playerBtnNext = document.getElementById('player-btn-next');

// --- SHA-256 Hashing Utility ---
async function sha256(message) {
    const msgBuffer = new TextEncoder().encode(message.trim().toLowerCase());
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// --- Token Validation ---
async function validateToken(token) {
    if (!token) return false;
    const hashed = await sha256(token);
    return allowedHashes.includes(hashed);
}

// Initial Setup
document.addEventListener('DOMContentLoaded', () => {
    // Load data and handle authentication
    fetchBooks();
    
    // Setup search focus shortcut (/)
    document.addEventListener('keydown', e => {
        if (e.key === '/' && document.activeElement !== gallerySearchInput) {
            e.preventDefault();
            gallerySearchInput.focus();
            gallerySearchInput.select();
        }
    });

    // Gallery Actions
    btnRefreshGallery.addEventListener('click', fetchBooks);
    
    gallerySearchInput.addEventListener('input', () => {
        searchQuery = gallerySearchInput.value.toLowerCase().trim();
        btnClearSearch.style.display = searchQuery ? 'block' : 'none';
        applyGalleryFiltersAndSort();
    });
    
    btnClearSearch.addEventListener('click', () => {
        gallerySearchInput.value = '';
        searchQuery = '';
        btnClearSearch.style.display = 'none';
        applyGalleryFiltersAndSort();
        gallerySearchInput.focus();
    });
    
    gallerySortSelect.addEventListener('change', () => {
        activeSort = gallerySortSelect.value;
        applyGalleryFiltersAndSort();
    });
    
    btnToggleView.addEventListener('click', () => {
        groupGenreView = !groupGenreView;
        const icon = btnToggleView.querySelector('.view-icon');
        if (toggleViewText) {
            toggleViewText.textContent = groupGenreView ? 'Grid View' : 'Group by Genre';
        }
        if (icon) {
            icon.textContent = groupGenreView ? '🎛️' : '📂';
        }
        applyGalleryFiltersAndSort();
    });

    // Authentication Form Submit Handler
    authForm.addEventListener('submit', async e => {
        e.preventDefault();
        const email = authEmailInput.value.trim();
        authErrorMsg.style.display = 'none';
        
        const isValid = await validateToken(email);
        if (isValid) {
            userToken = email;
            localStorage.setItem('visitor_email_token', userToken);
            authModal.classList.remove('visible');
            renderGenreFilters();
            applyGalleryFiltersAndSort();
        } else {
            authErrorMsg.style.display = 'block';
            authEmailInput.focus();
            authEmailInput.select();
        }
    });

    // Audiobook Player Setup
    btnClosePlayer.addEventListener('click', closeAudioPlayer);
    playerBtnPlayPause.addEventListener('click', toggleAudioPlayback);
    playerBtnRewind.addEventListener('click', () => { mainAudioElement.currentTime = Math.max(0, mainAudioElement.currentTime - 10); });
    playerBtnForward.addEventListener('click', () => { mainAudioElement.currentTime = Math.min(mainAudioElement.duration || 0, mainAudioElement.currentTime + 30); });
    playerBtnPrev.addEventListener('click', playPreviousTrack);
    playerBtnNext.addEventListener('click', playNextTrack);
    playerSpeedSelect.addEventListener('change', () => { mainAudioElement.playbackRate = parseFloat(playerSpeedSelect.value); });
    
    // Scrubber
    playerScrubber.addEventListener('input', () => {
        if (mainAudioElement.duration) {
            mainAudioElement.currentTime = (playerScrubber.value / 100) * mainAudioElement.duration;
        }
    });

    // Audio Event Listeners
    mainAudioElement.addEventListener('timeupdate', updatePlayerTime);
    mainAudioElement.addEventListener('durationchange', updatePlayerDuration);
    mainAudioElement.addEventListener('ended', playNextTrack);
    mainAudioElement.addEventListener('play', () => {
        playerBtnPlayPause.textContent = '⏸️';
        playerDiscArt.classList.add('playing');
    });
    mainAudioElement.addEventListener('pause', () => {
        playerBtnPlayPause.textContent = '▶️';
        playerDiscArt.classList.remove('playing');
    });

    // Delegate Audiobook play button clicks
    document.addEventListener('click', e => {
        const listenBtn = e.target.closest('.listen-audio-btn');
        if (listenBtn) {
            const slug = listenBtn.dataset.slug;
            const lang = listenBtn.dataset.lang || 'en';
            openAudioPlayer(slug, lang);
        }
    });
});

// --- Fetch Data ---
async function fetchBooks() {
    galleryContainer.innerHTML = '<div class="gallery-placeholder"><p>Loading bookshelf from Google Drive...</p></div>';
    try {
        const response = await fetch('books.json?cache_bust=' + Date.now());
        if (!response.ok) {
            throw new Error('Failed to load books.json');
        }
        const data = await response.json();
        
        // Parse whitelist hashes and books
        allowedHashes = data.allowed_hashes || [];
        allBooks = data.books || [];
        
        // Check for URL token parameter (e.g. ?token=docwilliam@email.com) or localStorage token
        const urlParams = new URLSearchParams(window.location.search);
        const paramToken = urlParams.get('token') || urlParams.get('email');
        const storedToken = localStorage.getItem('visitor_email_token');
        
        const tokenToValidate = paramToken || storedToken;
        const isValid = await validateToken(tokenToValidate);
        
        if (isValid) {
            userToken = tokenToValidate;
            localStorage.setItem('visitor_email_token', userToken);
            authModal.classList.remove('visible');
            
            // Clean up URL parameter for a clean looks
            if (paramToken) {
                const cleanUrl = window.location.protocol + "//" + window.location.host + window.location.pathname;
                window.history.replaceState({ path: cleanUrl }, '', cleanUrl);
            }
            
            // Render Filters and Gallery
            renderGenreFilters();
            applyGalleryFiltersAndSort();
        } else {
            // Show verification overlay
            authModal.classList.add('visible');
            // Clear any invalid cached token
            localStorage.removeItem('visitor_email_token');
        }
    } catch (err) {
        console.error('Error fetching books and auth config:', err);
        galleryContainer.innerHTML = `
            <div class="gallery-placeholder" style="border-color: var(--danger);">
                <p style="color: var(--danger);">⚠️ Error loading bookshelf: ${err.message}</p>
                <p style="font-size: 0.8rem; margin-top: 8px;">Make sure you have run the data compiler script: <code>python3 scripts/generate_visitor_data.py</code></p>
            </div>
        `;
    }
}

// --- Render Genre Filter Pills ---
function renderGenreFilters() {
    if (!filterPillsContainer) return;
    
    // Count books per genre
    const counts = { all: allBooks.length };
    allBooks.forEach(book => {
        const g = book.genre || 'General Niche';
        counts[g] = (counts[g] || 0) + 1;
    });
    
    // Sort unique genres by name
    const uniqueGenres = Object.keys(counts).filter(g => g !== 'all').sort((a, b) => a.localeCompare(b));
    
    filterPillsContainer.innerHTML = '';
    
    // Always render 'All' pill
    const allPill = document.createElement('div');
    allPill.className = `filter-pill ${activeGenreFilter === 'all' ? 'active' : ''}`;
    allPill.dataset.genre = 'all';
    allPill.dataset.theme = 'all';
    allPill.innerHTML = `All <span class="filter-pill-count">${counts.all}</span>`;
    allPill.addEventListener('click', () => selectGenreFilter('all'));
    filterPillsContainer.appendChild(allPill);
    
    // Render other pills
    uniqueGenres.forEach(genre => {
        const theme = getGenreTheme(genre);
        const pill = document.createElement('div');
        pill.className = `filter-pill ${activeGenreFilter === genre ? 'active' : ''}`;
        pill.dataset.genre = genre;
        pill.dataset.theme = theme;
        pill.innerHTML = `${genre} <span class="filter-pill-count">${counts[genre]}</span>`;
        pill.addEventListener('click', () => selectGenreFilter(genre));
        filterPillsContainer.appendChild(pill);
    });
}

function selectGenreFilter(genre) {
    activeGenreFilter = genre;
    // Update active class on pills
    const pills = filterPillsContainer.querySelectorAll('.filter-pill');
    pills.forEach(pill => {
        if (pill.dataset.genre === genre) {
            pill.classList.add('active');
        } else {
            pill.classList.remove('active');
        }
    });
    applyGalleryFiltersAndSort();
}

function getGenreTheme(genre) {
    const g = genre.toLowerCase();
    if (g.includes('screenplay')) return 'screenplay';
    if (g.includes('romance')) return 'romance';
    if (g.includes('crime')) return 'crime';
    if (g.includes('cookbook') || g.includes('recipe')) return 'recipe';
    return 'niche';
}

// --- Filter and Sort Gallery ---
function applyGalleryFiltersAndSort() {
    let filtered = [...allBooks];
    
    // Search filter
    if (searchQuery) {
        filtered = filtered.filter(b => 
            b.title.toLowerCase().includes(searchQuery) ||
            (b.summary && b.summary.toLowerCase().includes(searchQuery)) ||
            b.date.includes(searchQuery) ||
            b.genre.toLowerCase().includes(searchQuery) ||
            b.niche.toLowerCase().includes(searchQuery)
        );
    }
    
    // Genre filter
    if (activeGenreFilter !== 'all') {
        filtered = filtered.filter(b => b.genre === activeGenreFilter);
    }
    
    // Sort
    filtered.sort((a, b) => {
        let valA, valB;
        let comparison = 0;
        
        if (activeSort.startsWith('date')) {
            valA = a.date;
            valB = b.date;
            comparison = valA.localeCompare(valB);
            if (activeSort.endsWith('desc')) comparison = -comparison;
        } else if (activeSort.startsWith('title')) {
            valA = a.title.toLowerCase();
            valB = b.title.toLowerCase();
            comparison = valA.localeCompare(valB);
            if (activeSort.endsWith('desc')) comparison = -comparison;
        } else if (activeSort.startsWith('genre')) {
            valA = a.genre.toLowerCase();
            valB = b.genre.toLowerCase();
            comparison = valA.localeCompare(valB);
            if (comparison === 0) {
                // Secondary sort: date desc
                comparison = -a.date.localeCompare(b.date);
            }
        }
        return comparison;
    });
    
    // Update Badge
    galleryCountBadge.textContent = `${filtered.length} Book${filtered.length === 1 ? '' : 's'}`;
    
    renderGallery(filtered);
}

// --- Render Gallery to DOM ---
function renderGallery(booksList) {
    galleryContainer.innerHTML = '';
    
    if (booksList.length === 0) {
        galleryContainer.innerHTML = `
            <div class="gallery-placeholder">
                <p>No books match your filters.</p>
            </div>
        `;
        return;
    }
    
    if (!groupGenreView) {
        // Grid View
        galleryContainer.className = 'gallery-grid';
        booksList.forEach(book => {
            galleryContainer.appendChild(createBookCard(book));
        });
    } else {
        // Grouped by Genre View
        galleryContainer.className = 'heavy-section-deferred';
        
        // Group books by genre
        const grouped = {};
        booksList.forEach(book => {
            const g = book.genre;
            if (!grouped[g]) grouped[g] = [];
            grouped[g].push(book);
        });
        
        // Sort grouped genres
        const sortedGenres = Object.keys(grouped).sort((a, b) => a.localeCompare(b));
        
        sortedGenres.forEach(genreName => {
            const genreBooks = grouped[genreName];
            const groupTheme = getGenreTheme(genreName);
            const isCollapsed = collapsedGenres.has(genreName);
            
            const groupDiv = document.createElement('div');
            groupDiv.className = `niche-group ${isCollapsed ? 'collapsed' : ''}`;
            groupDiv.dataset.theme = groupTheme;
            
            const header = document.createElement('div');
            header.className = 'niche-group-header';
            
            const titleWrapper = document.createElement('div');
            titleWrapper.className = 'niche-group-title-wrapper';
            
            const title = document.createElement('h3');
            title.className = 'niche-group-title';
            title.innerHTML = `📂 ${genreName}`;
            titleWrapper.appendChild(title);
            
            const badge = document.createElement('span');
            badge.className = `niche-group-badge badge-${groupTheme}`;
            badge.textContent = `${genreBooks.length} Book${genreBooks.length === 1 ? '' : 's'}`;
            titleWrapper.appendChild(badge);
            header.appendChild(titleWrapper);
            
            const chevron = document.createElement('span');
            chevron.className = `niche-group-chevron ${isCollapsed ? 'collapsed-icon' : ''}`;
            chevron.textContent = '▼';
            header.appendChild(chevron);
            
            groupDiv.appendChild(header);
            
            // Subgrid
            const subGrid = document.createElement('div');
            subGrid.className = 'niche-group-grid gallery-grid';
            genreBooks.forEach(book => {
                subGrid.appendChild(createBookCard(book));
            });
            groupDiv.appendChild(subGrid);
            
            // Collapse Event
            header.addEventListener('click', () => toggleGenreGroupCollapse(genreName, groupDiv));
            
            galleryContainer.appendChild(groupDiv);
        });
    }
}

function toggleGenreGroupCollapse(genreName, groupDiv) {
    const chevron = groupDiv.querySelector('.niche-group-chevron');
    if (groupDiv.classList.contains('collapsed')) {
        groupDiv.classList.remove('collapsed');
        if (chevron) chevron.classList.remove('collapsed-icon');
        collapsedGenres.delete(genreName);
    } else {
        groupDiv.classList.add('collapsed');
        if (chevron) chevron.classList.add('collapsed-icon');
        collapsedGenres.add(genreName);
    }
}

// --- Create Single Book Card ---
function createBookCard(book) {
    const theme = getGenreTheme(book.genre);
    const card = document.createElement('article');
    card.className = `book-card theme-${theme}`;
    
    card.innerHTML = `
        <div class="book-meta">
            <h3 class="book-title" title="${book.title}">${book.title}</h3>
            <span class="book-date" title="Compilation Date">${formatDate(book.date)}</span>
        </div>
        <p class="book-subtitle" title="${book.summary || ''}">${book.summary || 'No summary description provided.'}</p>
        
        <div class="asset-links">
            ${book.reader_path ? `
                <a href="${book.reader_path}" class="download-link read-book-btn" target="_blank" style="border-color: hsla(210, 85%, 65%, 0.3); background-color: hsla(210, 85%, 65%, 0.08); text-align: center; justify-content: center; font-weight: 700; letter-spacing: 0.5px;">
                    <span>📖 Read Online</span>
                </a>
            ` : `
                <div class="download-link" style="opacity: 0.5; cursor: not-allowed; text-align: center; justify-content: center;">
                    <span>📖 Read Online (Pending)</span>
                </div>
            `}
        </div>
    `;
    return card;
}

// --- Audiobook Player Overlay Logic ---
function openAudioPlayer(slug, lang = 'en') {
    const book = allBooks.find(b => b.slug === slug);
    if (!book) return;
    
    // Choose playlist based on language
    const tracks = (lang === 'th') ? book.tracks_thai : book.tracks;
    
    currentPlaylist = tracks || [];
    currentTrackIndex = -1;
    
    playerBookTitle.textContent = book.title + (lang === 'th' ? ' (Thai) 🇹🇭' : '');
    audioPlayerModal.classList.add('visible');
    
    renderPlayerPlaylist();
    
    if (currentPlaylist.length > 0) {
        playTrack(0);
    } else {
        playerCurrentTrackTitle.textContent = `No MP3 tracks found on Google Drive for language: ${lang}.`;
    }
}

function closeAudioPlayer() {
    mainAudioElement.pause();
    audioPlayerModal.classList.remove('visible');
}

function renderPlayerPlaylist() {
    playerPlaylistContainer.innerHTML = '';
    currentPlaylist.forEach((track, idx) => {
        const row = document.createElement('div');
        row.className = `playlist-track-item ${idx === currentTrackIndex ? 'active' : ''}`;
        row.style.display = 'flex';
        row.style.justifyContent = 'space-between';
        row.style.alignItems = 'center';
        row.style.backgroundColor = 'rgba(0,0,0,0.2)';
        row.style.border = '1px solid var(--border-glass)';
        row.style.borderRadius = 'var(--radius-sm)';
        row.style.padding = '8px 12px';
        row.style.cursor = 'pointer';
        row.style.fontSize = '0.82rem';
        row.style.transition = 'all 0.2s ease';
        
        if (idx === currentTrackIndex) {
            row.style.backgroundColor = 'rgba(21, 101, 192, 0.15)';
            row.style.borderColor = 'var(--secondary)';
            row.style.color = 'var(--secondary)';
            row.style.fontWeight = '600';
        }
        
        row.innerHTML = `
            <span>${track.title}</span>
            <span class="track-play-indicator" style="font-size: 0.72rem; margin-left: 8px; display: ${idx === currentTrackIndex ? 'inline-block' : 'none'};">🔊 Playing</span>
        `;
        
        row.addEventListener('mouseenter', () => {
            if (idx !== currentTrackIndex) {
                row.style.backgroundColor = 'rgba(255, 255, 255, 0.04)';
            }
        });
        row.addEventListener('mouseleave', () => {
            if (idx !== currentTrackIndex) {
                row.style.backgroundColor = 'rgba(0,0,0,0.2)';
            }
        });
        
        row.addEventListener('click', () => {
            playTrack(idx);
        });
        playerPlaylistContainer.appendChild(row);
    });
}

function playTrack(index) {
    if (index < 0 || index >= currentPlaylist.length) return;
    
    currentTrackIndex = index;
    const track = currentPlaylist[index];
    
    playerCurrentTrackTitle.textContent = track.title;
    
    // Set direct Google Drive download/stream URL for the track
    mainAudioElement.src = `https://docs.google.com/uc?export=download&id=${track.gdrive_id}`;
    mainAudioElement.load();
    
    // Set playback speed
    mainAudioElement.playbackRate = parseFloat(playerSpeedSelect.value);
    
    mainAudioElement.play().catch(err => {
        console.log('Playback start was blocked by browser or interrupted:', err);
    });
    
    renderPlayerPlaylist();
}

function toggleAudioPlayback() {
    if (mainAudioElement.paused) {
        mainAudioElement.play().catch(err => console.log('Playback resume failed:', err));
    } else {
        mainAudioElement.pause();
    }
}

function playPreviousTrack() {
    if (currentTrackIndex > 0) {
        playTrack(currentTrackIndex - 1);
    }
}

function playNextTrack() {
    if (currentTrackIndex < currentPlaylist.length - 1) {
        playTrack(currentTrackIndex + 1);
    } else {
        mainAudioElement.pause();
        mainAudioElement.currentTime = 0;
    }
}

function updatePlayerTime() {
    const cur = mainAudioElement.currentTime;
    const dur = mainAudioElement.duration || 0;
    
    playerTimeCurrent.textContent = formatTime(cur);
    
    if (dur > 0) {
        playerScrubber.value = (cur / dur) * 100;
    }
}

// Ensure duration changes are formatted nicely
function updatePlayerDuration() {
    const dur = mainAudioElement.duration || 0;
    playerTimeTotal.textContent = formatTime(dur);
}

// --- Utilities ---
function formatDate(dateStr) {
    if (!dateStr || dateStr.length !== 8) return dateStr;
    const year = dateStr.slice(0, 4);
    const month = dateStr.slice(4, 6);
    const day = dateStr.slice(6, 8);
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${months[parseInt(month, 10) - 1]} ${parseInt(day, 10)}, ${year}`;
}

function formatTime(secs) {
    const mins = Math.floor(secs / 60);
    const remainingSecs = Math.floor(secs % 60);
    return `${mins}:${remainingSecs < 10 ? '0' : ''}${remainingSecs}`;
}
