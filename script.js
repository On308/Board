/* =========================================================
   소설 백업 아카이브 - script.js (v2, 통합)
   ========================================================= */

// ---------- 상수 ----------
const DB_NAME = 'novel_archive_db';
const STORE_NAME = 'posts_store';
const DB_VERSION = 1;
const POSTS_PER_PAGE = 16;

// ---------- 전역 상태 ----------
let db = null;
let posts = [];
let currentView = 'list';
let currentPostId = null;
let currentPage = 1;

let selectedPostIds = new Set();

let searchQuery = '';
let selectedTag = '';
let sortOrder = 'newest';
let showFavOnly = false;              // ← 즐겨찾기 필터
let currentFontClass = 'font-nanum-gothic';
let currentLineHeightClass = 'leading-[2.0]';
let currentPaddingClass = 'px-6 md:px-12';
let currentHighlightKeyword = '';

/* =========================================================
   유틸리티
   ========================================================= */

function findPostById(id) {
    if (id === null || id === undefined) return null;
    return posts.find(p => String(p.id) === String(id)) || null;
}

function formatDate(date = new Date()) {
    const pad = (n) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function getCharCountInfo(str) {
    if (!str) return { withSpace: 0, withoutSpace: 0 };
    return {
        withSpace: str.length,
        withoutSpace: str.replace(/\s+/g, '').length
    };
}

function formatCharCountStr(str) {
    const info = getCharCountInfo(str);
    return `${info.withSpace.toLocaleString()}자 / ${info.withoutSpace.toLocaleString()}자`;
}

function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function getRandomAuthorId(prefix) {
    let randomNum = '';
    for (let i = 0; i < 6; i++) {
        randomNum += Math.floor(Math.random() * 10);
    }
    return `${prefix}-${randomNum}`;
}

function normalizePost(p) {
    return {
        ...p,
        id: Number(p.id),
        tags: Array.isArray(p.tags) ? p.tags : [],
        comments: Array.isArray(p.comments) ? p.comments.map(normalizeComment) : []
    };
}

function normalizeComment(c) {
    return {
        ...c,
        id: Number(c.id),
        replies: Array.isArray(c.replies) ? c.replies.map(r => ({ ...r, id: Number(r.id) })) : []
    };
}

/* =========================================================
   즐겨찾기
   ========================================================= */

function getFavs() {
    try {
        return JSON.parse(localStorage.getItem('novel_favs') || '[]').map(Number);
    } catch (e) {
        return [];
    }
}

function isFavorite(id) {
    return getFavs().includes(Number(id));
}

function toggleFavorite(id) {
    const favs = getFavs();
    const numId = Number(id);
    const idx = favs.indexOf(numId);
    if (idx === -1) favs.push(numId);
    else favs.splice(idx, 1);
    localStorage.setItem('novel_favs', JSON.stringify(favs));
    renderListView();
    return idx === -1;   // 새로 추가되었으면 true
}

function toggleCurrentFavorite() {
    if (currentPostId === null) return;
    const added = toggleFavorite(currentPostId);
    updateDetailFavButton();
    showToast(added ? '⭐ 즐겨찾기에 추가되었습니다.' : '즐겨찾기에서 제거되었습니다.');
}

function updateDetailFavButton() {
    const icon = document.getElementById('detail-fav-icon');
    if (!icon) return;
    const fav = isFavorite(currentPostId);
    icon.innerText = fav ? '★' : '☆';
    icon.style.color = fav ? '#e85d75' : '';
}

function toggleFavFilter() {
    showFavOnly = !showFavOnly;
    currentPage = 1;
    const btn = document.getElementById('fav-filter-btn');
    if (btn) btn.classList.toggle('active', showFavOnly);
    renderListView();
}

/* =========================================================
   진행률 (이어보기)
   ========================================================= */

function saveProgress() {
    if (currentView !== 'detail' || currentPostId === null) return;
    const article = document.getElementById('detail-content');
    if (!article) return;
    const rect = article.getBoundingClientRect();
    const total = article.offsetHeight - window.innerHeight;
    const progress = total > 0
        ? Math.max(0, Math.min(1, -rect.top / total))
        : 0;
    localStorage.setItem(`progress_${currentPostId}`, JSON.stringify({
        pct: progress,
        at: Date.now()
    }));
}

function getProgress(id) {
    try {
        const raw = localStorage.getItem(`progress_${id}`);
        if (!raw) return 0;
        return JSON.parse(raw).pct || 0;
    } catch (e) {
        return 0;
    }
}

function restoreProgress() {
    if (currentPostId === null) return;
    const pct = getProgress(currentPostId);
    if (pct <= 0.02) {
        window.scrollTo({ top: 0, behavior: 'smooth' });
        return;
    }
    setTimeout(() => {
        const article = document.getElementById('detail-content');
        if (!article) return;
        const total = article.offsetHeight - window.innerHeight;
        window.scrollTo({ top: Math.max(0, total * pct), behavior: 'smooth' });
    }, 100);
}

// 스크롤 시 자동 저장 (throttle)
let scrollSaveTimer;
window.addEventListener('scroll', () => {
    if (currentView !== 'detail') return;
    clearTimeout(scrollSaveTimer);
    scrollSaveTimer = setTimeout(saveProgress, 500);
});

/* =========================================================
   자동 저장 (에디터)
   ========================================================= */

let autosaveTimer;
function scheduleAutosave() {
    clearTimeout(autosaveTimer);
    autosaveTimer = setTimeout(() => {
        const title = document.getElementById('editor-title');
        const tags = document.getElementById('editor-tags');
        const content = document.getElementById('editor-content');
        const postId = document.getElementById('editor-post-id');
        if (!title || !content) return;
        if (!title.value.trim() && !content.value.trim()) return;
        localStorage.setItem('novel_draft', JSON.stringify({
            title: title.value,
            tags: tags ? tags.value : '',
            content: content.value,
            postId: postId ? postId.value : '',
            savedAt: Date.now()
        }));
    }, 3000);
}

function clearDraft() {
    if (confirm('임시저장된 초안을 삭제하시겠습니까?')) {
        localStorage.removeItem('novel_draft');
        showToast('임시저장이 삭제되었습니다.');
    }
}

function checkDraft(isNew) {
    const raw = localStorage.getItem('novel_draft');
    if (!raw) return false;
    let d;
    try {
        d = JSON.parse(raw);
    } catch (e) {
        localStorage.removeItem('novel_draft');
        return false;
    }
    // 24시간 지난 건 무시
    if (Date.now() - d.savedAt > 24 * 3600 * 1000) {
        localStorage.removeItem('novel_draft');
        return false;
    }
    // 새 글 작성인데 이전 draft가 "수정 중"이던 것이면 무시
    if (isNew && d.postId) return false;
    // 수정 모드인데 draft의 postId가 다르면 무시
    if (!isNew && String(d.postId) !== String(currentPostId)) return false;

    const when = new Date(d.savedAt).toLocaleString();
    if (confirm(`작성 중이던 글이 있습니다 (${when}).\n복구하시겠습니까?\n(취소 시 임시저장이 삭제됩니다.)`)) {
        document.getElementById('editor-title').value = d.title || '';
        document.getElementById('editor-tags').value = d.tags || '';
        document.getElementById('editor-content').value = d.content || '';
        updateLiveCharCount();
        return true;
    } else {
        localStorage.removeItem('novel_draft');
    }
    return false;
}

/* =========================================================
   태그 자동완성
   ========================================================= */

function updateTagSuggestions() {
    const allTags = new Set();
    posts.forEach(p => (p.tags || []).forEach(t => allTags.add(t)));
    const dl = document.getElementById('tag-suggestions');
    if (!dl) return;
    dl.innerHTML = '';
    Array.from(allTags).sort().forEach(t => {
        const opt = document.createElement('option');
        opt.value = t;
        dl.appendChild(opt);
    });
}

/* =========================================================
   IndexedDB
   ========================================================= */

function initDB() {
    return new Promise((resolve, reject) => {
        if (db) return resolve(db);
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onerror = (event) => {
            console.error("IndexedDB 열기 실패:", event.target.error);
            reject(event.target.error);
        };
        request.onsuccess = (event) => {
            db = event.target.result;
            resolve(db);
        };
        request.onupgradeneeded = (event) => {
            const database = event.target.result;
            if (!database.objectStoreNames.contains(STORE_NAME)) {
                database.createObjectStore(STORE_NAME);
            }
        };
    });
}

async function loadPostsFromDB() {
    const database = await initDB();
    return new Promise((resolve, reject) => {
        const transaction = database.transaction(STORE_NAME, 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.get('novel_posts_data');
        request.onsuccess = (event) => resolve(event.target.result);
        request.onerror = (event) => reject(event.target.error);
    });
}

async function savePostsToDB(data) {
    const database = await initDB();
    return new Promise((resolve, reject) => {
        const transaction = database.transaction(STORE_NAME, 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.put(data, 'novel_posts_data');
        request.onsuccess = () => resolve(true);
        request.onerror = (event) => {
            console.error("DB 저장 오류:", event.target.error);
            alert("대용량 데이터 저장 중 오류가 발생했습니다.");
            reject(event.target.error);
        };
    });
}

/* =========================================================
   초기 로딩
   ========================================================= */

async function loadPosts() {
    try {
        const savedData = await loadPostsFromDB();
        if (Array.isArray(savedData)) {
            posts = savedData.map(normalizePost);
        } else {
            posts = getInitialSamplePosts();
            await savePostsToDB(posts);
        }
    } catch (e) {
        console.error("Failed to load DB", e);
        posts = getInitialSamplePosts();
    }
}

async function savePosts() {
    await savePostsToDB(posts);
}

function initDarkMode() {
    const isDark = localStorage.getItem('novel_archive_dark') === 'true';
    document.documentElement.classList.toggle('dark', isDark);
}

function toggleDarkMode() {
    const isDark = document.documentElement.classList.toggle('dark');
    localStorage.setItem('novel_archive_dark', isDark);
    showToast(isDark ? '다크모드가 켜졌습니다.' : '라이트모드가 켜졌습니다.');
}

/* =========================================================
   샘플 데이터
   ========================================================= */

function getInitialSamplePosts() {
    const now = new Date();
    const pastDate = new Date(now.getTime() - 4 * 3600000);
    return [
        {
            id: 1,
            title: "샘플 텍스트 - 제1화",
            content: `[제 1화 본문 예시]\n\n본문은 백업용 텍스트 파일(.txt)을 업로드하여 언제든지 자동으로 등록하거나 수정하실 수 있습니다.`,
            tags: ["태그1", "태그2"],
            createdAt: formatDate(pastDate),
            updatedAt: null,
            comments: [
                {
                    id: 1000,
                    authorId: getRandomAuthorId('R'),
                    content: "첫 번째 댓글.",
                    createdAt: formatDate(new Date(pastDate.getTime() + 600000)),
                    replies: [
                        {
                            id: 2000,
                            authorId: getRandomAuthorId('RR'),
                            content: "답댓글.",
                            createdAt: formatDate(new Date(pastDate.getTime() + 1200000))
                        }
                    ]
                }
            ]
        }
    ];
}

async function resetToSampleData() {
    if (confirm("모든 데이터를 초기의 샘플 게시글 데이터로 리셋하시겠습니까?\n(현재 저장된 게시글이 변경됩니다.)")) {
        posts = getInitialSamplePosts();
        await savePostsToDB(posts);
        selectedPostIds.clear();
        currentPage = 1;
        navigateTo('list');
        showToast("리셋 완료");
    }
}

/* =========================================================
   뷰 네비게이션
   ========================================================= */

function openNewPostEditor() {
    saveScrollPosition();
    currentPostId = null;
    navigateTo('editor');
}

function navigateTo(viewName, postId = null) {
    if (currentView === 'detail' && viewName !== 'detail') {
        saveScrollPosition();
        saveProgress();
    }

    currentView = viewName;
    if (postId !== null && postId !== undefined) {
        currentPostId = Number(postId);
    }

    document.getElementById('view-list').classList.add('hidden');
    document.getElementById('view-detail').classList.add('hidden');
    document.getElementById('view-editor').classList.add('hidden');

    if (viewName === 'list') {
        document.getElementById('view-list').classList.remove('hidden');
        renderListView();
        window.scrollTo({ top: 0, behavior: 'smooth' });
    } else if (viewName === 'detail') {
        document.getElementById('view-detail').classList.remove('hidden');
        renderDetailView();
    } else if (viewName === 'editor') {
        document.getElementById('view-editor').classList.remove('hidden');
        renderEditorView();
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }
}

function saveScrollPosition() {
    if (currentPostId !== null) {
        localStorage.setItem(`novel_scroll_${currentPostId}`, window.scrollY);
    }
}

function showToast(message) {
    const toast = document.getElementById('toast');
    document.getElementById('toast-message').innerText = message;
    toast.classList.remove('opacity-0', 'pointer-events-none', 'translate-y-2');
    toast.classList.add('opacity-100', 'translate-y-0');
    clearTimeout(window.__toastTimer);
    window.__toastTimer = setTimeout(() => {
        toast.classList.remove('opacity-100', 'translate-y-0');
        toast.classList.add('opacity-0', 'pointer-events-none', 'translate-y-2');
    }, 2500);
}

/* =========================================================
   JSON 백업 / 복원
   ========================================================= */

function exportToJson() {
    if (posts.length === 0) {
        alert("다운로드할 게시글 데이터가 없습니다.");
        return;
    }
    const dataStr = JSON.stringify(posts, null, 2);
    const blob = new Blob([dataStr], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const a = document.createElement("a");
    a.href = url;
    a.download = `novel_archive_backup_${dateStr}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast("전체 데이터가 JSON 파일로 다운로드되었습니다.");
}

function importFromJson(event) {
    const file = event.target.files[0];
    if (!file) return;
    if (!file.name.endsWith('.json')) {
        alert('.json 확장자의 파일만 업로드할 수 있습니다.');
        event.target.value = '';
        return;
    }
    const reader = new FileReader();
    reader.onload = async function (e) {
        try {
            const importedData = JSON.parse(e.target.result);
            if (!Array.isArray(importedData)) {
                alert("올바른 게시글 데이터(JSON 배열) 형식이 아닙니다.");
                return;
            }
            if (confirm("기존 저장된 데이터를 덮어쓰고 가져온 JSON 데이터로 복원하시겠습니까?")) {
                posts = importedData.map(normalizePost);
                await savePostsToDB(posts);
                selectedPostIds.clear();
                currentPage = 1;
                renderListView();
                showToast("JSON 데이터 복원이 완료되었습니다.");
            }
        } catch (err) {
            alert("JSON 파일을 파싱하는 중 오류가 발생했습니다.");
        }
    };
    reader.readAsText(file, 'UTF-8');
    event.target.value = '';
}

/* =========================================================
   일괄 선택
   ========================================================= */

function toggleSelectPost(id, isChecked) {
    const numId = Number(id);
    if (isChecked) selectedPostIds.add(numId);
    else selectedPostIds.delete(numId);
    updateSelectionUI();
    updateMasterCheckboxState();
}

function toggleSelectAll(isChecked) {
    getCurrentPagePosts().forEach(post => {
        if (isChecked) selectedPostIds.add(Number(post.id));
        else selectedPostIds.delete(Number(post.id));
    });
    updateSelectionUI();
    renderListView();
}

function clearSelection() {
    selectedPostIds.clear();
    updateSelectionUI();
    renderListView();
}

async function deleteSelectedPosts() {
    if (selectedPostIds.size === 0) return;
    const count = selectedPostIds.size;
    if (confirm(`선택한 ${count}개의 게시글을 정말로 삭제하시겠습니까?\n삭제된 글은 복구할 수 없습니다.`)) {
        posts = posts.filter(p => !selectedPostIds.has(Number(p.id)));
        selectedPostIds.clear();
        await savePosts();
        showToast(`${count}개의 게시글이 일괄 삭제되었습니다.`);
        renderListView();
    }
}

function updateSelectionUI() {
    const count = selectedPostIds.size;
    const bar = document.getElementById('batch-action-bar');
    const countText = document.getElementById('selected-count-text');
    if (count > 0) {
        bar.classList.remove('hidden');
        countText.innerText = `${count}개 선택됨`;
    } else {
        bar.classList.add('hidden');
    }
}

async function promptBatchAddTag() {
    if (selectedPostIds.size === 0) return;
    const tagInput = prompt("추가할 태그를 입력해 주세요 (여러 개일 경우 쉼표로 구분):");
    if (!tagInput || !tagInput.trim()) return;
    const newTags = tagInput.split(',').map(t => t.trim()).filter(Boolean);
    if (newTags.length === 0) return;
    let modifiedCount = 0;
    posts.forEach(post => {
        if (selectedPostIds.has(Number(post.id))) {
            if (!post.tags) post.tags = [];
            let changed = false;
            newTags.forEach(tag => {
                if (!post.tags.includes(tag)) {
                    post.tags.push(tag);
                    changed = true;
                }
            });
            if (changed) modifiedCount++;
        }
    });
    if (modifiedCount > 0) {
        await savePosts();
        renderListView();
        showToast(`선택한 게시글 중 ${modifiedCount}개에 태그가 추가되었습니다.`);
    } else {
        showToast("이미 모든 선택된 게시글에 해당 태그가 존재합니다.");
    }
}

async function promptBatchRemoveTag() {
    if (selectedPostIds.size === 0) return;
    const tagInput = prompt("삭제할 태그 이름을 입력해 주세요:");
    if (!tagInput || !tagInput.trim()) return;
    const targetTag = tagInput.trim();
    let modifiedCount = 0;
    posts.forEach(post => {
        if (selectedPostIds.has(Number(post.id)) && post.tags && post.tags.includes(targetTag)) {
            post.tags = post.tags.filter(t => t !== targetTag);
            modifiedCount++;
        }
    });
    if (modifiedCount > 0) {
        await savePosts();
        renderListView();
        showToast(`선택한 게시글 중 ${modifiedCount}개에서 '#${targetTag}' 태그가 삭제되었습니다.`);
    } else {
        showToast(`선택한 게시글 중 '#${targetTag}' 태그를 가진 글이 없습니다.`);
    }
}

/* =========================================================
   필터 / 정렬 / 페이지
   ========================================================= */

function getTotalCommentCount(post) {
    let count = post.comments ? post.comments.length : 0;
    if (post.comments) {
        post.comments.forEach(c => {
            if (c.replies) count += c.replies.length;
        });
    }
    return count;
}

function getEpisodeNumber(title) {
    const m = String(title).match(/(\d+)\s*화/);
    return m ? parseInt(m[1], 10) : 999999;
}

function getFilteredAndSortedPosts() {
    let result = [...posts];

    if (searchQuery.trim() !== '') {
        const q = searchQuery.toLowerCase();
        result = result.filter(p =>
            p.title.toLowerCase().includes(q) || p.content.toLowerCase().includes(q)
        );
    }

    if (selectedTag) {
        result = result.filter(p => p.tags && p.tags.includes(selectedTag));
    }

    if (showFavOnly) {
        const favs = getFavs();
        result = result.filter(p => favs.includes(Number(p.id)));
    }

    result.sort((a, b) => {
        switch (sortOrder) {
            case 'newest': return new Date(b.createdAt) - new Date(a.createdAt);
            case 'oldest': return new Date(a.createdAt) - new Date(b.createdAt);
            case 'title': return a.title.localeCompare(b.title, 'ko');
            case 'updated': {
                const ta = new Date(a.updatedAt || a.createdAt);
                const tb = new Date(b.updatedAt || b.createdAt);
                return tb - ta;
            }
            case 'length': return getCharCountInfo(b.content).withSpace - getCharCountInfo(a.content).withSpace;
            case 'comments': return getTotalCommentCount(b) - getTotalCommentCount(a);
            case 'episode': return getEpisodeNumber(a.title) - getEpisodeNumber(b.title);
        }
        return 0;
    });

    return result;
}

function getCurrentPagePosts() {
    const filtered = getFilteredAndSortedPosts();
    const totalPages = Math.ceil(filtered.length / POSTS_PER_PAGE) || 1;
    const validPage = Math.min(currentPage, totalPages);
    const startIndex = (validPage - 1) * POSTS_PER_PAGE;
    return filtered.slice(startIndex, startIndex + POSTS_PER_PAGE);
}

function updateMasterCheckboxState() {
    const pagePosts = getCurrentPagePosts();
    const selectAllCheckbox = document.getElementById('select-all-checkbox');
    if (!selectAllCheckbox) return;
    const allChecked = pagePosts.length > 0 && pagePosts.every(p => selectedPostIds.has(Number(p.id)));
    const someChecked = pagePosts.some(p => selectedPostIds.has(Number(p.id)));
    if (allChecked) {
        selectAllCheckbox.checked = true;
        selectAllCheckbox.indeterminate = false;
    } else if (someChecked) {
        selectAllCheckbox.checked = false;
        selectAllCheckbox.indeterminate = true;
    } else {
        selectAllCheckbox.checked = false;
        selectAllCheckbox.indeterminate = false;
    }
}

/* =========================================================
   통계 대시보드
   ========================================================= */

function renderStats() {
    const elPosts = document.getElementById('stat-posts');
    const elChars = document.getElementById('stat-chars');
    const elToday = document.getElementById('stat-today');
    const elFavs = document.getElementById('stat-favs');
    if (!elPosts) return;

    elPosts.innerText = posts.length.toLocaleString();
    elChars.innerText = posts.reduce((s, p) => s + (p.content ? p.content.length : 0), 0).toLocaleString();
    const today = formatDate().slice(0, 10);
    elToday.innerText = posts.filter(p => (p.createdAt || '').startsWith(today)).length.toLocaleString();
    elFavs.innerText = getFavs().length.toLocaleString();
}

/* =========================================================
   리스트 뷰
   ========================================================= */

function renderListView() {
    populateTagOptions();
    renderStats();
    updateFavFilterButton();

    const filteredPosts = getFilteredAndSortedPosts();
    const totalPosts = filteredPosts.length;
    const totalPages = Math.ceil(totalPosts / POSTS_PER_PAGE) || 1;
    if (currentPage > totalPages) currentPage = totalPages;

    const startIndex = (currentPage - 1) * POSTS_PER_PAGE;
    const endIndex = Math.min(startIndex + POSTS_PER_PAGE, totalPosts);
    const pagePosts = filteredPosts.slice(startIndex, endIndex);

    const tbody = document.getElementById('posts-table-body');
    tbody.innerHTML = '';

    if (pagePosts.length === 0) {
        document.getElementById('empty-state').classList.remove('hidden');
    } else {
        document.getElementById('empty-state').classList.add('hidden');

        pagePosts.forEach((post) => {
            const tr = document.createElement('tr');
            tr.className = 'hover:bg-stone-50 dark:hover:bg-stone-700/40 cursor-pointer transition-colors';
            tr.onclick = () => navigateTo('detail', post.id);

            const commentCount = getTotalCommentCount(post);
            const tagsHtml = (post.tags && post.tags.length > 0)
                ? post.tags.map(t => `<span class="inline-block bg-stone-100 dark:bg-stone-700 text-stone-600 dark:text-stone-300 px-2 py-0.5 rounded text-[11px] font-medium mr-1">#${escapeHtml(t)}</span>`).join('')
                : '<span class="text-stone-400 dark:text-stone-500 text-xs">-</span>';

            const isChecked = selectedPostIds.has(Number(post.id));
            const fav = isFavorite(post.id);
            const pct = Math.round(getProgress(post.id) * 100);

            // 진행률 뱃지
            const progressHtml = pct > 1
                ? `<span class="inline-block bg-mint-100 dark:bg-mint-900 text-mint-700 dark:text-mint-200 px-1.5 py-0.5 rounded text-[10px] font-mono mr-1">${pct}%</span>`
                : '';

            // 즐겨찾기 별
            const favHtml = fav
                ? `<span class="text-blush-500 text-base mr-1" title="즐겨찾기">★</span>`
                : '';

            tr.innerHTML = `
                <td class="py-3.5 px-3 text-center" onclick="event.stopPropagation()">
                    <input type="checkbox" class="w-4 h-4 text-brand-600 rounded border-stone-300 focus:ring-brand-500 cursor-pointer"
                           value="${post.id}" ${isChecked ? 'checked' : ''}
                           onchange="toggleSelectPost(${post.id}, this.checked)">
                </td>
                <td class="py-3.5 px-4 text-center font-mono text-xs text-stone-400">#${post.id}</td>
                <td class="py-3.5 px-4 font-medium text-stone-900 dark:text-stone-100 hover:text-brand-600">
                    ${favHtml}${progressHtml}${escapeHtml(post.title)}
                </td>
                <td class="py-3.5 px-4 text-center">
                    <div class="flex flex-wrap justify-center gap-1">${tagsHtml}</div>
                </td>
                <td class="py-3.5 px-4 text-right font-mono text-xs text-stone-500 dark:text-stone-400">
                    ${getCharCountInfo(post.content).withSpace.toLocaleString()}자
                </td>
                <td class="py-3.5 px-4 text-center">
                    <span class="inline-flex items-center text-xs font-semibold px-2 py-0.5 rounded-full ${commentCount > 0 ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-200' : 'text-stone-400 dark:text-stone-500'}">
                        💬 ${commentCount}
                    </span>
                </td>
                <td class="py-3.5 px-4 text-center font-mono text-xs text-stone-500 dark:text-stone-400">
                    ${post.createdAt ? post.createdAt.slice(0, 10) : ''}
                </td>
            `;
            tbody.appendChild(tr);
        });
    }

    document.getElementById('total-count-text').innerText = totalPosts;
    document.getElementById('showing-range-text').innerText = totalPosts > 0 ? `${startIndex + 1}-${endIndex}` : '0-0';

    updateSelectionUI();
    updateMasterCheckboxState();
    renderPaginationButtons(totalPages);
}

function updateFavFilterButton() {
    const btn = document.getElementById('fav-filter-btn');
    if (!btn) return;
    btn.classList.toggle('active', showFavOnly);
}

function renderPaginationButtons(totalPages) {
    const container = document.getElementById('pagination-buttons');
    container.innerHTML = '';
    if (totalPages <= 1) return;

    const prevBtn = document.createElement('button');
    prevBtn.className = `px-3 py-1.5 text-xs font-medium rounded-lg border border-stone-300 dark:border-stone-600 text-stone-700 dark:text-stone-300 ${currentPage === 1 ? 'opacity-40 cursor-not-allowed' : 'hover:bg-stone-100 dark:hover:bg-stone-700'}`;
    prevBtn.innerText = '이전';
    prevBtn.disabled = currentPage === 1;
    prevBtn.onclick = () => { if (currentPage > 1) { currentPage--; renderListView(); } };
    container.appendChild(prevBtn);

    for (let i = 1; i <= totalPages; i++) {
        const pageBtn = document.createElement('button');
        const isActive = i === currentPage;
        pageBtn.className = `px-3 py-1.5 text-xs font-bold rounded-lg ${isActive ? 'bg-brand-600 text-white' : 'border border-stone-300 dark:border-stone-600 hover:bg-stone-100 dark:hover:bg-stone-700 text-stone-700 dark:text-stone-300'}`;
        pageBtn.innerText = i;
        pageBtn.onclick = () => { currentPage = i; renderListView(); };
        container.appendChild(pageBtn);
    }

    const nextBtn = document.createElement('button');
    nextBtn.className = `px-3 py-1.5 text-xs font-medium rounded-lg border border-stone-300 dark:border-stone-600 text-stone-700 dark:text-stone-300 ${currentPage === totalPages ? 'opacity-40 cursor-not-allowed' : 'hover:bg-stone-100 dark:hover:bg-stone-700'}`;
    nextBtn.innerText = '다음';
    nextBtn.disabled = currentPage === totalPages;
    nextBtn.onclick = () => { if (currentPage < totalPages) { currentPage++; renderListView(); } };
    container.appendChild(nextBtn);
}

function populateTagOptions() {
    const tagSet = new Set();
    posts.forEach(p => {
        if (p.tags && Array.isArray(p.tags)) p.tags.forEach(t => tagSet.add(t));
    });

    const tagSelect = document.getElementById('tag-select');
    tagSelect.innerHTML = '<option value="">모든 태그 전체보기</option>';

    const pillsContainer = document.getElementById('tag-pills-container');
    pillsContainer.innerHTML = '<span class="text-stone-500 dark:text-stone-400 font-medium mr-1">태그 필터:</span>';

    const makePillClass = (active) => `px-2 py-0.5 rounded-md font-medium text-xs transition ${
        active
            ? 'bg-brand-600 text-white'
            : 'bg-stone-100 dark:bg-stone-700 text-stone-600 dark:text-stone-300 hover:bg-stone-200 dark:hover:bg-stone-600'
    }`;

    const allPill = document.createElement('button');
    allPill.className = makePillClass(selectedTag === '');
    allPill.innerText = '전체';
    allPill.onclick = () => {
        selectedTag = '';
        tagSelect.value = '';
        currentPage = 1;
        renderListView();
    };
    pillsContainer.appendChild(allPill);

    tagSet.forEach(tag => {
        const opt = document.createElement('option');
        opt.value = tag;
        opt.innerText = `#${tag}`;
        if (tag === selectedTag) opt.selected = true;
        tagSelect.appendChild(opt);

        const pill = document.createElement('button');
        pill.className = makePillClass(selectedTag === tag);
        pill.innerText = `#${tag}`;
        pill.onclick = () => {
            selectedTag = tag;
            tagSelect.value = tag;
            currentPage = 1;
            renderListView();
        };
        pillsContainer.appendChild(pill);
    });
}

function handleSearchChange() {
    searchQuery = document.getElementById('search-input').value;
    currentPage = 1;
    renderListView();
}

function handleTagSelectChange() {
    selectedTag = document.getElementById('tag-select').value;
    currentPage = 1;
    renderListView();
}

function handleSortChange() {
    sortOrder = document.getElementById('sort-select').value;
    renderListView();
}

/* =========================================================
   상세 뷰
   ========================================================= */

function renderDetailView() {
    const post = findPostById(currentPostId);
    if (!post) {
        console.warn('[renderDetailView] 게시글을 찾을 수 없음. currentPostId:', currentPostId);
        alert("존재하지 않는 게시글입니다.");
        navigateTo('list');
        return;
    }

    document.getElementById('detail-post-id-badge').innerText = `#${post.id}`;
    document.getElementById('detail-title').innerText = post.title;
    document.getElementById('detail-date').innerText = `작성일: ${post.createdAt}`;

    const updatedWrapper = document.getElementById('detail-updated-wrapper');
    const updatedDateEl = document.getElementById('detail-updated-date');
    if (post.updatedAt) {
        updatedDateEl.innerText = `수정일: ${post.updatedAt}`;
        updatedWrapper.classList.remove('hidden');
    } else {
        updatedWrapper.classList.add('hidden');
    }

    document.getElementById('detail-char-count').innerText = `글자수: ${formatCharCountStr(post.content)}`;

    const totalComments = getTotalCommentCount(post);
    document.getElementById('detail-comment-count').innerText = `댓글: ${totalComments}개`;
    document.getElementById('detail-comment-header-count').innerText = `(${totalComments})`;

    const tagsContainer = document.getElementById('detail-tags-container');
    tagsContainer.innerHTML = '';
    if (post.tags && post.tags.length > 0) {
        post.tags.forEach(t => {
            const tagSpan = document.createElement('span');
            tagSpan.className = 'bg-stone-100 dark:bg-stone-700 text-stone-700 dark:text-stone-300 font-medium px-2 py-0.5 rounded text-xs';
            tagSpan.innerText = `#${t}`;
            tagsContainer.appendChild(tagSpan);
        });
    }

    // 즐겨찾기 버튼 상태 반영
    updateDetailFavButton();

    updateContentDisplay(post.content);
    updateAdjacentPostButtons();
    renderComments(post);

    // 진행률 복원
    restoreProgress();

    // 매치 초기화
    searchMatches = [];
    searchIndex = -1;
}

function updateContentDisplay(rawText) {
    const contentEl = document.getElementById('detail-content');
    contentEl.className = `novel-content text-stone-800 dark:text-stone-200 text-base ${currentFontClass} ${currentLineHeightClass} ${currentPaddingClass} tracking-normal min-h-[250px] py-4 transition-all`;

    let processedText = escapeHtml(rawText);
    if (currentHighlightKeyword.trim() !== '') {
        const escapedKeyword = currentHighlightKeyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(`(${escapedKeyword})`, 'gi');
        processedText = processedText.replace(regex, '<span class="keyword-highlight">$1</span>');
    }

    contentEl.innerHTML = processedText;
}

let searchMatches = [];
let searchIndex = -1;

function applyKeywordHighlight() {
    currentHighlightKeyword = document.getElementById('keyword-input').value.trim();
    const post = findPostById(currentPostId);
    if (!post) return;
    updateContentDisplay(post.content);

    // 매치 목록 재구성
    searchMatches = Array.from(document.querySelectorAll('.keyword-highlight'));
    searchIndex = -1;

    if (currentHighlightKeyword) {
        if (searchMatches.length > 0) {
            // 첫 매치로 이동
            nextMatch();
            showToast(`'${currentHighlightKeyword}' ${searchMatches.length}개 매치 발견`);
        } else {
            showToast(`'${currentHighlightKeyword}' 매치 없음`);
        }
    }
}

function nextMatch() {
    if (searchMatches.length === 0) {
        // 아직 강조가 안 되어 있으면 강조부터
        applyKeywordHighlight();
        return;
    }
    // 이전 활성 매치 해제
    if (searchIndex >= 0 && searchMatches[searchIndex]) {
        searchMatches[searchIndex].classList.remove('keyword-highlight-active');
    }
    searchIndex = (searchIndex + 1) % searchMatches.length;
    const el = searchMatches[searchIndex];
    if (el) {
        el.classList.add('keyword-highlight-active');
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
}

function clearKeywordHighlight() {
    document.getElementById('keyword-input').value = '';
    currentHighlightKeyword = '';
    searchMatches = [];
    searchIndex = -1;
    const post = findPostById(currentPostId);
    if (post) {
        updateContentDisplay(post.content);
        showToast('키워드 강조가 해제되었습니다.');
    }
}

function changeLineHeight(lhClass, btnEl) {
    currentLineHeightClass = lhClass;
    document.querySelectorAll('.lh-btn').forEach(b => {
        b.classList.remove('border-brand-600', 'text-brand-700', 'dark:text-brand-300', 'font-semibold', 'bg-brand-50', 'dark:bg-brand-950/50');
    });
    btnEl.classList.add('border-brand-600', 'text-brand-700', 'dark:text-brand-300', 'font-semibold', 'bg-brand-50', 'dark:bg-brand-950/50');
    const post = findPostById(currentPostId);
    if (post) updateContentDisplay(post.content);
}

function changePadding(pdClass, btnEl) {
    currentPaddingClass = pdClass;
    document.querySelectorAll('.pd-btn').forEach(b => {
        b.classList.remove('border-brand-600', 'text-brand-700', 'dark:text-brand-300', 'font-semibold', 'bg-brand-50', 'dark:bg-brand-950/50');
    });
    btnEl.classList.add('border-brand-600', 'text-brand-700', 'dark:text-brand-300', 'font-semibold', 'bg-brand-50', 'dark:bg-brand-950/50');
    const post = findPostById(currentPostId);
    if (post) updateContentDisplay(post.content);
}

function changeFontFamily(fontClass, btnEl) {
    currentFontClass = fontClass;
    document.querySelectorAll('.font-btn').forEach(b => {
        b.classList.remove('border-brand-600', 'text-brand-700', 'dark:text-brand-300', 'font-semibold', 'bg-brand-50', 'dark:bg-brand-950/50');
    });
    btnEl.classList.add('border-brand-600', 'text-brand-700', 'dark:text-brand-300', 'font-semibold', 'bg-brand-50', 'dark:bg-brand-950/50');
    const post = findPostById(currentPostId);
    if (post) updateContentDisplay(post.content);
}

function changeFontSize(sizeClass) {
    const contentEl = document.getElementById('detail-content');
    contentEl.classList.remove('text-sm', 'text-base', 'text-lg', 'text-xl');
    contentEl.classList.add(sizeClass);
}

function updateAdjacentPostButtons() {
    const filteredPosts = getFilteredAndSortedPosts();
    const currentIndex = filteredPosts.findIndex(p => String(p.id) === String(currentPostId));
    const btnPrev = document.getElementById('btn-prev-post');
    const btnNext = document.getElementById('btn-next-post');
    if (currentIndex > 0) {
        btnPrev.disabled = false;
        btnPrev.classList.remove('opacity-40', 'cursor-not-allowed');
    } else {
        btnPrev.disabled = true;
        btnPrev.classList.add('opacity-40', 'cursor-not-allowed');
    }
    if (currentIndex !== -1 && currentIndex < filteredPosts.length - 1) {
        btnNext.disabled = false;
        btnNext.classList.remove('opacity-40', 'cursor-not-allowed');
    } else {
        btnNext.disabled = true;
        btnNext.classList.add('opacity-40', 'cursor-not-allowed');
    }
}

function moveToAdjacentPost(direction) {
    saveProgress();
    const filteredPosts = getFilteredAndSortedPosts();
    const currentIndex = filteredPosts.findIndex(p => String(p.id) === String(currentPostId));
    if (currentIndex === -1) return;
    const targetIndex = direction === 'prev' ? currentIndex - 1 : currentIndex + 1;
    if (targetIndex >= 0 && targetIndex < filteredPosts.length) {
        currentPostId = Number(filteredPosts[targetIndex].id);
        renderDetailView();
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }
}

/* =========================================================
   댓글
   ========================================================= */

function renderComments(post) {
    const container = document.getElementById('comments-list-container');
    container.innerHTML = '';

    if (!post.comments || post.comments.length === 0) {
        container.innerHTML = `<div class="py-6 text-center text-stone-400 text-sm">등록된 댓글이 없습니다. 첫 번째 댓글을 남겨보세요!</div>`;
        return;
    }

    post.comments.forEach(comment => {
        if (!comment.authorId) comment.authorId = getRandomAuthorId('R');
        const commentEl = document.createElement('div');
        commentEl.className = 'pt-4 first:pt-0 space-y-3';
        commentEl.innerHTML = `
            <div class="flex items-start justify-between">
                <div class="space-y-1 w-full">
                    <div class="flex items-center space-x-2">
                        <span class="font-bold text-xs text-stone-800 dark:text-stone-200 font-mono">${comment.authorId}</span>
                        <span class="text-xs text-stone-400 font-mono">${comment.createdAt}</span>
                    </div>
                    <div class="text-sm text-stone-800 dark:text-stone-200 novel-content whitespace-pre-line leading-relaxed">${escapeHtml(comment.content)}</div>
                    <div class="flex justify-end space-x-2 pt-1">
                        <button onclick="toggleReplyBox(${comment.id})" class="text-xs font-medium text-brand-600 dark:text-brand-400 hover:text-brand-800 bg-brand-50 dark:bg-brand-950/50 px-2.5 py-1 rounded-md transition">답글 달기</button>
                        <button onclick="toggleEditCommentBox(${comment.id})" class="text-xs font-medium text-stone-600 dark:text-stone-300 hover:text-stone-800 bg-stone-100 dark:bg-stone-700 px-2.5 py-1 rounded-md transition">수정</button>
                        <button onclick="deleteComment(${comment.id})" class="text-xs font-medium text-red-600 dark:text-red-400 hover:text-red-800 bg-red-50 dark:bg-red-950/50 px-2.5 py-1 rounded-md transition">삭제</button>
                    </div>
                </div>
            </div>
            <div id="edit-comment-box-${comment.id}" class="hidden pt-2 space-y-2">
                <textarea id="edit-comment-input-${comment.id}" rows="15" class="w-full p-2.5 border border-stone-300 dark:border-stone-600 rounded-lg text-sm bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-100 focus:outline-none focus:ring-2 focus:ring-brand-500">${escapeHtml(comment.content)}</textarea>
                <div class="flex justify-end space-x-2">
                    <button onclick="toggleEditCommentBox(${comment.id})" class="px-3 py-1 border border-stone-300 dark:border-stone-600 rounded-md text-xs text-stone-600 dark:text-stone-300">취소</button>
                    <button onclick="submitEditComment(${comment.id})" class="px-3 py-1 bg-brand-600 text-white rounded-md text-xs font-medium">수정 완료</button>
                </div>
            </div>
            <div id="reply-box-${comment.id}" class="hidden pl-6 pt-2 space-y-2">
                <textarea id="reply-input-${comment.id}" rows="15" placeholder="답댓글을 작성하세요." class="w-full p-2.5 border border-stone-300 dark:border-stone-600 rounded-lg text-sm bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-100 focus:outline-none focus:ring-2 focus:ring-brand-500"></textarea>
                <div class="flex justify-end space-x-2">
                    <button onclick="toggleReplyBox(${comment.id})" class="px-3 py-1 border border-stone-300 dark:border-stone-600 rounded-md text-xs text-stone-600 dark:text-stone-300">취소</button>
                    <button onclick="submitReply(${comment.id})" class="px-3 py-1 bg-brand-600 text-white rounded-md text-xs font-medium">답댓글 등록</button>
                </div>
            </div>
            <div class="pl-6 space-y-2.5 border-l-2 border-stone-100 dark:border-stone-700 mt-2">
                ${(comment.replies || []).map(reply => {
                    if (!reply.authorId) reply.authorId = getRandomAuthorId('RR');
                    return `
                    <div class="bg-stone-50 dark:bg-stone-900/50 p-3 rounded-lg space-y-1">
                        <div class="flex items-center justify-between">
                            <div class="flex items-center space-x-2">
                                <span class="text-xs text-stone-400">↳</span>
                                <span class="font-bold text-xs text-stone-700 dark:text-stone-300 font-mono">${reply.authorId}</span>
                                <span class="text-xs text-stone-400 font-mono">${reply.createdAt}</span>
                            </div>
                            <div class="flex items-center space-x-1.5">
                                <button onclick="toggleEditReplyBox(${reply.id})" class="text-[11px] font-medium text-stone-500 dark:text-stone-400 hover:text-stone-800 dark:hover:text-white">수정</button>
                                <span class="text-stone-300 dark:text-stone-600 text-[10px]">•</span>
                                <button onclick="deleteReply(${comment.id},${reply.id})" class="text-[11px] font-medium text-red-500 dark:text-red-400">삭제</button>
                            </div>
                        </div>
                        <div class="text-sm text-stone-800 dark:text-stone-200 pl-4 whitespace-pre-line leading-relaxed">${escapeHtml(reply.content)}</div>
                        <div id="edit-reply-box-${reply.id}" class="hidden pt-2 space-y-2">
                            <textarea id="edit-reply-input-${reply.id}" rows="15" class="w-full p-2 border border-stone-300 dark:border-stone-600 rounded-lg text-xs bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-100 focus:outline-none focus:ring-2 focus:ring-brand-500">${escapeHtml(reply.content)}</textarea>
                            <div class="flex justify-end space-x-2">
                                <button onclick="toggleEditReplyBox(${reply.id})" class="px-2.5 py-1 border border-stone-300 dark:border-stone-600 rounded-md text-xs text-stone-600 dark:text-stone-300">취소</button>
                                <button onclick="submitEditReply(${comment.id},${reply.id})" class="px-2.5 py-1 bg-brand-600 text-white rounded-md text-xs font-medium">수정 완료</button>
                            </div>
                        </div>
                    </div>`;
                }).join('')}
            </div>
        `;
        container.appendChild(commentEl);
    });
}

function toggleReplyBox(commentId) {
    const box = document.getElementById(`reply-box-${commentId}`);
    if (box) box.classList.toggle('hidden');
}
function toggleEditCommentBox(commentId) {
    const box = document.getElementById(`edit-comment-box-${commentId}`);
    if (box) box.classList.toggle('hidden');
}
function toggleEditReplyBox(replyId) {
    const box = document.getElementById(`edit-reply-box-${replyId}`);
    if (box) box.classList.toggle('hidden');
}

async function submitMainComment() {
    const input = document.getElementById('main-comment-input');
    const content = input.value.trim();
    if (!content) return alert('댓글 내용을 입력해 주세요.');
    const post = findPostById(currentPostId);
    if (!post) return;
    if (!post.comments) post.comments = [];
    post.comments.push({
        id: Date.now(),
        authorId: getRandomAuthorId('R'),
        content,
        createdAt: formatDate(),
        replies: []
    });
    await savePosts();
    input.value = '';
    renderDetailView();
    showToast('댓글이 등록되었습니다.');
}

async function submitReply(commentId) {
    const input = document.getElementById(`reply-input-${commentId}`);
    const content = input.value.trim();
    if (!content) return alert('답댓글 내용을 입력해 주세요.');
    const post = findPostById(currentPostId);
    if (!post) return;
    const parentComment = post.comments.find(c => String(c.id) === String(commentId));
    if (!parentComment) return;
    if (!parentComment.replies) parentComment.replies = [];
    parentComment.replies.push({
        id: Date.now(),
        authorId: getRandomAuthorId('RR'),
        content,
        createdAt: formatDate()
    });
    await savePosts();
    renderDetailView();
    showToast('답댓글이 등록되었습니다.');
}

async function submitEditComment(commentId) {
    const input = document.getElementById(`edit-comment-input-${commentId}`);
    const content = input.value.trim();
    if (!content) return alert('수정할 댓글 내용을 입력해 주세요.');
    const post = findPostById(currentPostId);
    if (!post) return;
    const comment = post.comments.find(c => String(c.id) === String(commentId));
    if (comment) {
        comment.content = content;
        await savePosts();
        renderDetailView();
        showToast('댓글이 수정되었습니다.');
    }
}

async function deleteComment(commentId) {
    if (!confirm('이 댓글을 삭제하시겠습니까?')) return;
    const post = findPostById(currentPostId);
    if (!post) return;
    post.comments = post.comments.filter(c => String(c.id) !== String(commentId));
    await savePosts();
    renderDetailView();
    showToast('댓글이 삭제되었습니다.');
}

async function submitEditReply(commentId, replyId) {
    const input = document.getElementById(`edit-reply-input-${replyId}`);
    const content = input.value.trim();
    if (!content) return alert('수정할 답댓글 내용을 입력해 주세요.');
    const post = findPostById(currentPostId);
    if (!post) return;
    const comment = post.comments.find(c => String(c.id) === String(commentId));
    if (comment && comment.replies) {
        const reply = comment.replies.find(r => String(r.id) === String(replyId));
        if (reply) {
            reply.content = content;
            await savePosts();
            renderDetailView();
            showToast('답댓글이 수정되었습니다.');
        }
    }
}

async function deleteReply(commentId, replyId) {
    if (!confirm('이 답댓글을 삭제하시겠습니까?')) return;
    const post = findPostById(currentPostId);
    if (!post) return;
    const comment = post.comments.find(c => String(c.id) === String(commentId));
    if (comment && comment.replies) {
        comment.replies = comment.replies.filter(r => String(r.id) !== String(replyId));
        await savePosts();
        renderDetailView();
        showToast('답댓글이 삭제되었습니다.');
    }
}

/* =========================================================
   게시글 다운로드 / 삭제
   ========================================================= */

function downloadCurrentPostTxt() {
    const post = findPostById(currentPostId);
    if (!post) return;
    const info = getCharCountInfo(post.content);
    const textContent = `제목: ${post.title}\n작성일: ${post.createdAt}${post.updatedAt ? '\n수정일: ' + post.updatedAt : ''}\n태그: ${(post.tags || []).join(', ')}\n글자수: ${info.withSpace}자 / ${info.withoutSpace}자\n\n----------------------------------------\n\n${post.content}`;
    const blob = new Blob([textContent], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${post.title.replace(/[/\\?%*:|"<>]/g, '_')}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('.txt 파일 다운로드가 시작되었습니다.');
}

async function confirmDeleteCurrentPost() {
    if (!confirm("정말로 이 게시글을 삭제하시겠습니까? 삭제된 글은 복구할 수 없습니다.")) return;
    posts = posts.filter(p => String(p.id) !== String(currentPostId));
    selectedPostIds.delete(Number(currentPostId));
    await savePosts();
    showToast("게시글이 삭제되었습니다.");
    navigateTo('list');
}

/* =========================================================
   에디터
   ========================================================= */

function renderEditorView() {
    const postIdInput = document.getElementById('editor-post-id');
    const heading = document.getElementById('editor-heading');
    const titleInput = document.getElementById('editor-title');
    const tagsInput = document.getElementById('editor-tags');
    const contentInput = document.getElementById('editor-content');
    const fileInput = document.getElementById('txt-file-input');

    fileInput.value = '';

    // 태그 자동완성 갱신
    updateTagSuggestions();

    const editingPost = findPostById(currentPostId);
    const isNew = !editingPost;

    if (editingPost) {
        heading.innerText = "게시글 수정";
        postIdInput.value = editingPost.id;
        titleInput.value = editingPost.title;
        tagsInput.value = (editingPost.tags || []).join(', ');
        contentInput.value = editingPost.content;
    } else {
        heading.innerText = "새 소설/게시글 작성";
        postIdInput.value = "";
        titleInput.value = "";
        tagsInput.value = "";
        contentInput.value = "";
    }

    updateLiveCharCount();

    // 임시저장 확인 (새 글 / 수정 모두)
    checkDraft(isNew);
}

function updateLiveCharCount() {
    const content = document.getElementById('editor-content').value;
    const info = getCharCountInfo(content);
    document.getElementById('editor-live-char-count').innerText = `글자수: ${info.withSpace.toLocaleString()}자 / ${info.withoutSpace.toLocaleString()}자`;
}

function editCurrentPost() {
    saveScrollPosition();
    navigateTo('editor', currentPostId);
}

function cancelEditor() {
    if (currentPostId && findPostById(currentPostId)) {
        navigateTo('detail', currentPostId);
    } else {
        navigateTo('list');
    }
}

function handleFileUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    if (!file.name.endsWith('.txt')) {
        alert('.txt 확장자의 텍스트 파일만 첨부할 수 있습니다.');
        return;
    }
    const reader = new FileReader();
    reader.onload = function (e) {
        const textContent = e.target.result;
        document.getElementById('editor-title').value = file.name.replace(/\.txt$/i, '');
        document.getElementById('editor-content').value = textContent;
        updateLiveCharCount();
        scheduleAutosave();
        showToast(`.txt 파일 내용이 입력란에 자동 적용되었습니다.`);
    };
    reader.readAsText(file, 'UTF-8');
}

async function handleFormSubmit(event) {
    event.preventDefault();

    const editingId = document.getElementById('editor-post-id').value;
    const title = document.getElementById('editor-title').value.trim();
    const tagsRaw = document.getElementById('editor-tags').value.trim();
    const content = document.getElementById('editor-content').value;

    if (!title || !content) {
        alert("제목과 본문을 모두 입력해 주세요.");
        return;
    }

    const tags = tagsRaw ? tagsRaw.split(',').map(t => t.trim()).filter(Boolean) : [];

    // ---------- 수정 모드 ----------
    if (editingId) {
        const post = findPostById(editingId);
        if (!post) {
            alert("수정할 게시글을 찾을 수 없습니다.");
            navigateTo('list');
            return;
        }
        post.title = title;
        post.tags = tags;
        post.content = content;
        post.updatedAt = formatDate();

        await savePosts();
        localStorage.removeItem('novel_draft');   // 저장 성공 → 임시저장 삭제
        showToast("게시글이 수정되었습니다.");
        navigateTo('detail', post.id);
        return;
    }

    // ---------- 새 글 작성 ----------
    const existingIds = posts.map(p => Number(p.id)).filter(n => !isNaN(n));
    const newId = existingIds.length > 0 ? Math.max(...existingIds) + 1 : 1;

    const newPost = {
        id: newId,
        title,
        content,
        tags,
        createdAt: formatDate(),
        updatedAt: null,
        comments: []
    };

    posts.unshift(newPost);
    await savePosts();
    localStorage.removeItem('novel_draft');       // 저장 성공 → 임시저장 삭제

    showToast("새 게시글이 성공적으로 등록되었습니다.");
    navigateTo('detail', newId);
}

/* =========================================================
   부트스트랩
   ========================================================= */

async function initApp() {
    initDarkMode();
    await loadPosts();
    navigateTo('list');
}

window.addEventListener('DOMContentLoaded', initApp);