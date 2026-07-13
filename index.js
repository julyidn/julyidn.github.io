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
    refreshBtn: document.getElementById('refresh-btn') // Elemen baru
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
    }
};

const uiState = {
    showLoading: () => {
        DOM.loadingState.hidden = false;
        DOM.errorState.hidden = true;
        DOM.gallerySections.hidden = true;
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
 * PENGAMBILAN DATA API DENGAN CACHING
 */
async function fetchYouTubeVideos() {
    // 1. Cek Cache
    const cachedData = localStorage.getItem(CONFIG.CACHE_KEY);
    if (cachedData) {
        const parsed = JSON.parse(cachedData);
        if (Date.now() - parsed.timestamp < CONFIG.CACHE_DURATION) {
            return parsed.data;
        }
    }

    // 2. Fetch API jika cache kosong/kedaluwarsa
    const res = await fetch(`${CONFIG.BASE_URL}?key=${CONFIG.API_KEY}&channelId=${CONFIG.CHANNEL_ID}&part=snippet,id&order=date&maxResults=${CONFIG.MAX_RESULTS}`);
    if (!res.ok) throw new Error('API Request Failed');
    const data = await res.json();
    
    let videos = data.items.filter(item => item.id.kind === 'youtube#video');

    if (videos.length > 0) {
        const videoIds = videos.map(v => v.id.videoId).join(',');
        const statsRes = await fetch(`${CONFIG.VIDEO_URL}?key=${CONFIG.API_KEY}&id=${videoIds}&part=statistics`);
        const statsData = await statsRes.json();
        
        const statsMap = {};
        statsData.items.forEach(item => { statsMap[item.id] = item.statistics; });

        videos = videos.map(video => ({
            ...video,
            statistics: statsMap[video.id.videoId] || { viewCount: 0, likeCount: 0, commentCount: 0 }
        }));
    }

    // 3. Simpan ke LocalStorage
    localStorage.setItem(CONFIG.CACHE_KEY, JSON.stringify({
        timestamp: Date.now(),
        data: videos
    }));

    return videos;
}

/**
 * RENDERING UI & LOGIKA LOAD MORE
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
                            <span>👁️ ${views}</span>
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
    const videos = appState.data[categoryKey];
    const currentLimit = appState.displayCount[categoryKey];
    const videosToDisplay = videos.slice(0, currentLimit);
    
    if (videos.length === 0) {
        gridElement.innerHTML = `<div style="grid-column: 1/-1; text-align: center; padding: 2rem;"><p>NO DATA YET.</p></div>`;
        return;
    }
    
    gridElement.innerHTML = videosToDisplay.map(generateCardHTML).join('');

    let container = gridElement.nextElementSibling;
    if (container && container.classList.contains('load-more-container')) container.remove();

    if (currentLimit < videos.length) {
        const btnContainer = document.createElement('div');
        btnContainer.className = 'load-more-container';
        const btn = document.createElement('button');
        btn.className = 'load-more-btn';
        btn.innerText = 'TAMPILKAN LEBIH BANYAK';
        btn.onclick = () => {
            appState.displayCount[categoryKey] += CONFIG.ITEMS_PER_PAGE[categoryKey];
            renderCategory(categoryKey, gridElement);
        };
        btnContainer.appendChild(btn);
        gridElement.parentNode.insertBefore(btnContainer, gridElement.nextSibling);
    }
}

/**
 * FUNGSI REFRESH DATA MANUAL
 */
function forceRefreshData() {
    // 1. Hapus cache di LocalStorage
    localStorage.removeItem(CONFIG.CACHE_KEY);
    
    // 2. Reset tampilan batas item per halaman
    appState.displayCount = { 
        regular: CONFIG.ITEMS_PER_PAGE.regular, 
        shorts: CONFIG.ITEMS_PER_PAGE.shorts, 
        live: CONFIG.ITEMS_PER_PAGE.live 
    };
    
    // 3. Panggil ulang fungsi fetch/inisialisasi
    initGallery();
}

/**
 * INISIALISASI
 */
async function initGallery() {
    uiState.showLoading();
    try {
        const videos = await fetchYouTubeVideos();
        
        appState.data = { regular: [], shorts: [], live: [] };
        
        videos.forEach(video => {
            const isLive = ['live', 'upcoming', 'completed'].includes(video.snippet.liveBroadcastContent);
            const isShorts = video.snippet.title.toLowerCase().includes('#shorts') || video.snippet.description.toLowerCase().includes('#shorts');

            if (isLive) appState.data.live.push(video);
            else if (isShorts) appState.data.shorts.push(video);
            else appState.data.regular.push(video);
        });

        renderCategory('regular', DOM.videoGrid);
        renderCategory('shorts', DOM.shortsGrid);
        renderCategory('live', DOM.liveGrid);

        uiState.showSuccess();
    } catch (error) {
        uiState.showError();
    }
}

// Event Listeners
document.addEventListener('DOMContentLoaded', initGallery);
window.addEventListener('scroll', () => {
    DOM.backToTopBtn.classList.toggle('visible', window.scrollY > 400);
});
DOM.backToTopBtn.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
DOM.retryBtn.addEventListener('click', initGallery);

// Event Listener untuk Tombol Refresh
if (DOM.refreshBtn) {
    DOM.refreshBtn.addEventListener('click', forceRefreshData);
}