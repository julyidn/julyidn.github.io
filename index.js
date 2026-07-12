/**
 * KONFIGURASI APLIKASI
 */
const CONFIG = {
    API_KEY: 'AIzaSyApCVwvjgWTZgyRPUaz_ymIpujS6afCjjw', 
    CHANNEL_ID: 'UCb6kJDbtnvyl8YtQmRnecfg',
    MAX_RESULTS: 50, 
    BASE_URL: 'https://www.googleapis.com/youtube/v3/search',
    VIDEO_URL: 'https://www.googleapis.com/youtube/v3/videos'
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
    backToTopBtn: document.getElementById('back-to-top')
};

/**
 * STATE MANAGEMENT
 */
const uiState = {
    showLoading: () => {
        DOM.loadingState.removeAttribute('hidden');
        DOM.errorState.setAttribute('hidden', '');
        DOM.gallerySections.setAttribute('hidden', '');
    },
    showError: () => {
        DOM.loadingState.setAttribute('hidden', '');
        DOM.errorState.removeAttribute('hidden');
        DOM.gallerySections.setAttribute('hidden', '');
    },
    showSuccess: () => {
        DOM.loadingState.setAttribute('hidden', '');
        DOM.errorState.setAttribute('hidden', '');
        DOM.gallerySections.removeAttribute('hidden');
    }
};

/**
 * UTILITAS (FORMATTER)
 */
function formatDate(isoDateString) {
    const date = new Date(isoDateString);
    const options = { day: '2-digit', month: 'short', year: 'numeric' };
    return date.toLocaleDateString('id-ID', options);
}

function formatNumber(num) {
    if (!num) return '0';
    if (num >= 1000000) return (num / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
    return num;
}

/**
 * API FETCH LOGIC (Mengambil Daftar Video + Statistik Views & Likes)
 */
async function fetchYouTubeVideos() {
    const searchUrl = `${CONFIG.BASE_URL}?key=${CONFIG.API_KEY}&channelId=${CONFIG.CHANNEL_ID}&part=snippet,id&order=date&maxResults=${CONFIG.MAX_RESULTS}`;

    try {
        // 1. Ambil list video berdasarkan Channel ID
        const response = await fetch(searchUrl);
        if (!response.ok) throw new Error(`HTTP Error: ${response.status}`);
        const data = await response.json();
        
        // Filter hanya video
        let videos = data.items.filter(item => item.id.kind === 'youtube#video');

        // 2. Ambil statistik (View & Like) untuk video tersebut
        if (videos.length > 0) {
            const videoIds = videos.map(video => video.id.videoId).join(',');
            const statsUrl = `${CONFIG.VIDEO_URL}?key=${CONFIG.API_KEY}&id=${videoIds}&part=statistics`;
            
            const statsResponse = await fetch(statsUrl);
            const statsData = await statsResponse.json();

            // Mapping statistik ke array videos
            const statsMap = {};
            statsData.items.forEach(item => {
                statsMap[item.id] = item.statistics;
            });

            videos = videos.map(video => ({
                ...video,
                statistics: statsMap[video.id.videoId] || { viewCount: 0, likeCount: 0 }
            }));
        }

        return videos;

    } catch (error) {
        console.error("Gagal mengambil data dari YouTube API:", error);
        throw error;
    }
}

/**
 * DOM RENDERING LOGIC
 */
function generateCardHTML(video) {
    const videoId = video.id.videoId;
    const { title, publishedAt, thumbnails } = video.snippet;
    const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
    const thumbnailUrl = thumbnails.high ? thumbnails.high.url : thumbnails.medium.url;
    
    const views = formatNumber(video.statistics.viewCount);
    const likes = formatNumber(video.statistics.likeCount);

    return `
        <article class="video-card">
            <a href="${videoUrl}" target="_blank" rel="noopener noreferrer" class="video-link">
                <img src="${thumbnailUrl}" alt="${title}" loading="lazy">
                <div class="card-content">
                    <h2 title="${title}">${title}</h2>
                    <div class="card-footer-info">
                        <span class="video-meta-tag">DROP: ${formatDate(publishedAt)}</span>
                        <div class="video-stats">
                            <span title="${video.statistics.viewCount} views">👁️ ${views}</span>
                            <span title="${video.statistics.likeCount} likes">👍 ${likes}</span>
                        </div>
                    </div>
                </div>
            </a>
        </article>
    `;
}

function renderCategory(videos, gridElement) {
    if (videos.length === 0) {
        gridElement.innerHTML = `
            <div style="grid-column: 1/-1; background: #fff; padding: 2rem; border: var(--border-thick); box-shadow: var(--shadow-flat); text-align: center;">
                <p style="font-weight: 700; font-family: var(--font-heading); font-size: 1.2rem;">NO DATA YET IN THIS SECTOR.</p>
            </div>
        `;
        return;
    }
    gridElement.innerHTML = videos.map(generateCardHTML).join('');
}

/**
 * PEMISAHAN KATEGORI & INISIALISASI
 */
async function initGallery() {
    uiState.showLoading();
    
    try {
        const videos = await fetchYouTubeVideos();
        
        const liveVideos = [];
        const shorts = [];
        const regularVideos = [];

        videos.forEach(video => {
            const isLive = video.snippet.liveBroadcastContent === 'live' || video.snippet.liveBroadcastContent === 'upcoming' || video.snippet.liveBroadcastContent === 'completed';
            const title = video.snippet.title.toLowerCase();
            const desc = video.snippet.description.toLowerCase();
            
            const isShorts = title.includes('#shorts') || desc.includes('#shorts');

            if (isLive) {
                liveVideos.push(video);
            } else if (isShorts) {
                shorts.push(video);
            } else {
                regularVideos.push(video);
            }
        });

        renderCategory(regularVideos, DOM.videoGrid);
        renderCategory(shorts, DOM.shortsGrid);
        renderCategory(liveVideos, DOM.liveGrid);

        uiState.showSuccess();
    } catch (error) {
        uiState.showError();
    }
}

/**
 * BACK TO TOP LOGIC
 */
function handleScroll() {
    if (window.scrollY > 400) {
        DOM.backToTopBtn.classList.add('visible');
    } else {
        DOM.backToTopBtn.classList.remove('visible');
    }
}

DOM.backToTopBtn.addEventListener('click', () => {
    window.scrollTo({
        top: 0,
        behavior: 'smooth'
    });
});

// Event Listeners
document.addEventListener('DOMContentLoaded', initGallery);
window.addEventListener('scroll', handleScroll);
DOM.retryBtn.addEventListener('click', initGallery);