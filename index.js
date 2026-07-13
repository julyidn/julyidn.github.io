/**
 * KONFIGURASI APLIKASI
 */
const CONFIG = {
    API_KEY: 'AIzaSyApCVwvjgWTZgyRPUaz_ymIpujS6afCjjw', 
    CHANNEL_ID: 'UCb6kJDbtnvyl8YtQmRnecfg',
    MAX_RESULTS: 50, 
    ITEMS_PER_PAGE: {
        regular: 3,
        shorts: 5,
        live: 3
    },
    BASE_URL: 'https://www.googleapis.com/youtube/v3/search',
    VIDEO_URL: 'https://www.googleapis.com/youtube/v3/videos',
    
    // Konfigurasi Sistem Cache
    CACHE_KEY: 'yt_gallery_cache',
    CACHE_DURATION: 1000 * 60 * 60 // 1 jam dalam milidetik
};

/**
 * REFERENSI ELEMEN DOM
 */
const DOM = {
    gallerySections: document.getElementById('gallery-sections'),
    videoGrid: document.getElementById('video-grid'),
    shortsGrid: document.getElementById('shorts-grid'),
    liveGrid: document.getElementById('live-grid'),
    loadingState: document.getElementById('loading-state'),
    errorState: document.getElementById('error-state'),
    retryBtn: document.getElementById('retry-btn'),
    backToTopBtn: document.getElementById('back-to-top'),
    refreshBtn: document.getElementById('refresh-btn'),
    searchInput: document.getElementById('search-input'),
    sortSelect: document.getElementById('sort-select')
};

/**
 * STATE MANAGEMENT
 */
const appState = {
    data: { regular: [], shorts: [], live: [] },
    displayCount: { 
        regular: CONFIG.ITEMS_PER_PAGE.regular, 
        shorts: CONFIG.ITEMS_PER_PAGE.shorts, 
        live: CONFIG.ITEMS_PER_PAGE.live 
    },
    nextPageToken: null 
};

const uiState = {
    showLoading: () => {
        DOM.loadingState.hidden = false;
        DOM.errorState.hidden = true;
        if (appState.data.regular.length === 0) DOM.gallerySections.hidden = true;
    },
    showError: () => {
        DOM.loadingState.hidden = true;
        DOM.errorState.hidden = false;
        DOM.gallerySections.hidden = true;
    },
    showSuccess: () => {
        DOM.loadingState.hidden = true;
        DOM.errorState.hidden = true;
        DOM.gallerySections.hidden = false;
    }
};

/**
 * FORMATTER BANTUAN
 */
function formatDate(isoDateString) {
    return new Date(isoDateString).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatNumber(num) {
    if (!num) return '0';
    if (num >= 1000000) return (num / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
    return num;
}

/**
 * MANAJEMEN CACHE
 */
function saveToCache() {
    localStorage.setItem(CONFIG.CACHE_KEY, JSON.stringify({
        timestamp: Date.now(),
        data: appState.data,
        nextPageToken: appState.nextPageToken
    }));
}

function loadFromCache() {
    const cachedData = localStorage.getItem(CONFIG.CACHE_KEY);
    if (cachedData) {
        const parsed = JSON.parse(cachedData);
        if (Date.now() - parsed.timestamp < CONFIG.CACHE_DURATION) {
            appState.data = parsed.data;
            appState.nextPageToken = parsed.nextPageToken;
            return true;
        }
    }
    return false;
}

/**
 * PENGAMBILAN DATA API DENGAN PAGINATION (NEXT PAGE TOKEN)
 */
async function fetchAndCategorizeVideos(pageToken = '') {
    const pageTokenParam = pageToken ? `&pageToken=${pageToken}` : '';
    const res = await fetch(`${CONFIG.BASE_URL}?key=${CONFIG.API_KEY}&channelId=${CONFIG.CHANNEL_ID}&part=snippet,id&order=date&maxResults=${CONFIG.MAX_RESULTS}${pageTokenParam}`);
    
    if (!res.ok) throw new Error('API Request Failed');
    const data = await res.json();
    
    // Simpan token halaman berikutnya
    appState.nextPageToken = data.nextPageToken || null;

    let videos = data.items.filter(item => item.id.kind === 'youtube#video');

    if (videos.length > 0) {
        const videoIds = videos.map(v => v.id.videoId).join(',');
        const statsRes = await fetch(`${CONFIG.VIDEO_URL}?key=${CONFIG.API_KEY}&id=${videoIds}&part=statistics`);
        const statsData = await statsRes.json();
        
        const statsMap = {};
        statsData.items.forEach(item => { statsMap[item.id] = item.statistics; });

        // Kategorisasi data baru dan masukkan ke state aplikasi
        videos.forEach(video => {
            video.statistics = statsMap[video.id.videoId] || { viewCount: 0, likeCount: 0, commentCount: 0 };
            
            const isLive = ['live', 'upcoming', 'completed'].includes(video.snippet.liveBroadcastContent);
            const isShorts = video.snippet.title.toLowerCase().includes('#shorts') || video.snippet.description.toLowerCase().includes('#shorts');

            if (isLive) appState.data.live.push(video);
            else if (isShorts) appState.data.shorts.push(video);
            else appState.data.regular.push(video);
        });
    }

    // Perbarui cache dengan data terkini
    saveToCache();
}

/**
 * RENDERING UI DENGAN DUKUNGAN INPUT PENCARIAN & FILTER DROPDOWN
 */
function generateCardHTML(video) {
    const { title, publishedAt, thumbnails } = video.snippet;
    const views = formatNumber(video.statistics.viewCount);
    const likes = formatNumber(video.statistics.likeCount);
    const comments = formatNumber(video.statistics.commentCount);

    return `
        <article class="video-card">
            <a href="https://www.youtube.com/watch?v=${video.id.videoId}" target="_blank" class="video-link">
                <img src="${thumbnails.high ? thumbnails.high.url : thumbnails.medium.url}" alt="${title}" loading="lazy">
                <div class="card-content">
                    <h2 title="${title}">${title}</h2>
                    <div class="card-footer-info">
                        <span class="video-meta-tag">DROP: ${formatDate(publishedAt)}</span>
                        <div class="video-stats">
                            <span>👁 ${views}</span>
                            <span>👍 ${likes}</span>
                            <span>💬 ${comments}</span>
                        </div>
                    </div>
                </div>
            </a>
        </article>
    `;
}

function renderCategory(categoryKey, gridElement) {
    // Gandakan array data agar manipulasi filter/sort tidak merusak data dasar asal
    let videos = [...appState.data[categoryKey]];

    // 1. Logika Fitur Pencarian (Search Bar)
    const searchQuery = DOM.searchInput.value.toLowerCase().trim();
    if (searchQuery) {
        videos = videos.filter(video => 
            video.snippet.title.toLowerCase().includes(searchQuery) ||
            video.snippet.description.toLowerCase().includes(searchQuery)
        );
    }

    // 2. Logika Filter & Sorting Dropdown
    const sortValue = DOM.sortSelect.value;
    videos.sort((a, b) => {
        if (sortValue === 'popular') {
            return parseInt(b.statistics.viewCount || 0) - parseInt(a.statistics.viewCount || 0);
        } else if (sortValue === 'liked') {
            return parseInt(b.statistics.likeCount || 0) - parseInt(a.statistics.likeCount || 0);
        } else if (sortValue === 'oldest') {
            return new Date(a.snippet.publishedAt) - new Date(b.snippet.publishedAt);
        } else { // 'newest'
            return new Date(b.snippet.publishedAt) - new Date(a.snippet.publishedAt);
        }
    });

    const currentLimit = appState.displayCount[categoryKey];
    const videosToDisplay = videos.slice(0, currentLimit);
    
    // Tampilkan pesan kosong jika tidak ada arsip video yang cocok
    if (videos.length === 0) {
        gridElement.innerHTML = `<div style="grid-column: 1/-1; text-align: center; padding: 2rem; font-weight: bold;"><p>TIDAK ADA KONTEN YANG COCOK.</p></div>`;
        let container = gridElement.nextElementSibling;
        if (container && container.classList.contains('load-more-container')) container.remove();
        return;
    }
    
    gridElement.innerHTML = videosToDisplay.map(generateCardHTML).join('');

    // Hapus tombol load more lama sebelum menggambar elemen baru
    let container = gridElement.nextElementSibling;
    if (container && container.classList.contains('load-more-container')) container.remove();

    // Sediakan tombol Load More jika limit tampilan lokal belum habis atau server masih memegang page token
    if (currentLimit < videos.length || appState.nextPageToken) {
        const btnContainer = document.createElement('div');
        btnContainer.className = 'load-more-container';
        const btn = document.createElement('button');
        btn.className = 'load-more-btn';
        btn.innerText = 'TAMPILKAN LEBIH BANYAK';
        
        btn.onclick = async () => {
            appState.displayCount[categoryKey] += CONFIG.ITEMS_PER_PAGE[categoryKey];
            
            // Lakukan pemanggilan data baru ke server jika data terfilter lokal habis tetapi token halaman API aktif
            if (appState.displayCount[categoryKey] > videos.length && appState.nextPageToken) {
                btn.innerText = 'MEMUAT DARI SERVER...';
                btn.disabled = true;
                try {
                    await fetchAndCategorizeVideos(appState.nextPageToken);
                } catch (error) {
                    console.error("Gagal mengambil data halaman berikutnya:", error);
                    alert("Gagal memuat video baru dari server. Silakan coba lagi.");
                    appState.displayCount[categoryKey] -= CONFIG.ITEMS_PER_PAGE[categoryKey]; // Rollback
                    btn.innerText = 'TAMPILKAN LEBIH BANYAK';
                    btn.disabled = false;
                    return;
                }
            }
            renderCategory(categoryKey, gridElement);
        };
        
        btnContainer.appendChild(btn);
        gridElement.parentNode.insertBefore(btnContainer, gridElement.nextSibling);
    }
}

/**
 * FUNGSI BANTUAN RENDER SEMUA GRID
 */
function renderAllCategories() {
    renderCategory('regular', DOM.videoGrid);
    renderCategory('shorts', DOM.shortsGrid);
    renderCategory('live', DOM.liveGrid);
}

/**
 * FUNGSI REFRESH DATA MANUAL
 */
function forceRefreshData() {
    localStorage.removeItem(CONFIG.CACHE_KEY);
    
    appState.data = { regular: [], shorts: [], live: [] };
    appState.nextPageToken = null;
    appState.displayCount = { 
        regular: CONFIG.ITEMS_PER_PAGE.regular, 
        shorts: CONFIG.ITEMS_PER_PAGE.shorts, 
        live: CONFIG.ITEMS_PER_PAGE.live 
    };
    
    if (DOM.searchInput) DOM.searchInput.value = '';
    if (DOM.sortSelect) DOM.sortSelect.value = 'newest';
    
    initGallery();
}

/**
 * INISIALISASI UTAMA
 */
async function initGallery() {
    uiState.showLoading();
    try {
        if (!loadFromCache()) {
            await fetchAndCategorizeVideos('');
        }
        
        renderAllCategories();
        uiState.showSuccess();
    } catch (error) {
        console.error(error);
        uiState.showError();
    }
}

// Pasang Event Listeners untuk Interaksi Pengguna (Search & Dropdown)
if (DOM.searchInput) DOM.searchInput.addEventListener('input', renderAllCategories);
if (DOM.sortSelect) DOM.sortSelect.addEventListener('change', renderAllCategories);

// Event Listeners Global Aplikasi
document.addEventListener('DOMContentLoaded', initGallery);
window.addEventListener('scroll', () => {
    DOM.backToTopBtn.classList.toggle('visible', window.scrollY > 400);
});
if (DOM.backToTopBtn) DOM.backToTopBtn.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
if (DOM.retryBtn) DOM.retryBtn.addEventListener('click', forceRefreshData);
if (DOM.refreshBtn) DOM.refreshBtn.addEventListener('click', forceRefreshData);