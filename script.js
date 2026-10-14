const DB_NAME = 'novel_archive_db';
const STORE_NAME = 'posts_store';
const DB_VERSION = 1;

let db = null;
let posts = [];
let currentView = 'list';
let currentPostId = null;
let currentPage = 1;
const postsPerPage = 16;

let selectedPostIds = new Set();

let searchQuery = '';
let selectedTag = '';
let sortOrder = 'newest';
let currentFontClass = 'font-nanum-gothic';
let currentLineHeightClass = 'leading-[2.0]';
let currentPaddingClass = 'px-6 md:px-12';
let currentHighlightKeyword = '';

// IndexedDB 초기화 및 연결 함수
function initDB() {
    return new Promise((resolve, reject) => {
        if (db) {
            resolve(db);
            return;
        }

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

// IndexedDB에서 데이터 불러오기
async function loadPostsFromDB() {
    try {
        const database = await initDB();
        return new Promise((resolve, reject) => {
            const transaction = database.transaction(STORE_NAME, 'readonly');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.get('novel_posts_data');

            request.onsuccess = (event) => {
                resolve(event.target.result);
            };

            request.onerror = (event) => {
                reject(event.target.error);
            };
        });
    } catch (e) {
        console.error("DB 로드 오류", e);
        return null;
    }
}

// IndexedDB에 데이터 저장하기
async function savePostsToDB(data) {
    try {
        const database = await initDB();
        return new Promise((resolve, reject) => {
            const transaction = database.transaction(STORE_NAME, 'readwrite');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.put(data, 'novel_posts_data');

            request.onsuccess = () => {
                resolve(true);
            };

            request.onerror = (event) => {
                console.error("DB 저장 오류:", event.target.error);
                alert("대용량 데이터 저장 중 오류가 발생했습니다.");
                reject(event.target.error);
            };
        });
    } catch (e) {
        console.error("DB 트랜잭션 오류", e);
    }
}

async function loadPosts() {
    try {
        const savedData = await loadPostsFromDB();
        if (savedData && Array.isArray(savedData)) {
            posts = savedData;
        } else {
            posts = getInitialSamplePosts();
            await savePostsToDB(posts);
        }
    } catch (e) {
        console.error("Failed to load DB", e);
        posts = getInitialSamplePosts();
    }
    renderApp();
}

async function savePosts() {
    await savePostsToDB(posts);
}

function initDarkMode() {
    const isDark = localStorage.getItem('novel_archive_dark') === 'true';
    if (isDark) {
        document.documentElement.classList.add('dark');
    } else {
        document.documentElement.classList.remove('dark');
    }
}

function toggleDarkMode() {
    const isDark = document.documentElement.classList.toggle('dark');
    localStorage.setItem('novel_archive_dark', isDark);
    showToast(isDark ? '다크모드가 켜졌습니다.' : '라이트모드가 켜졌습니다.');
}

function formatDate(date = new Date()) {
    const pad = (n) => String(n).padStart(2, '0');
    const year = date.getFullYear();
    const month = pad(date.getMonth() + 1);
    const day = pad(date.getDate());
    const hours = pad(date.getHours());
    const minutes = pad(date.getMinutes());
    const seconds = pad(date.getSeconds());
    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

function getCharCountInfo(str) {
    if (!str) return { withSpace: 0, withoutSpace: 0 };
    const withSpace = str.length;
    const withoutSpace = str.replace(/\s+/g, '').length;
    return { withSpace, withoutSpace };
}

function formatCharCountStr(str) {
    const info = getCharCountInfo(str);
    return `${info.withSpace.toLocaleString()}자 / ${info.withoutSpace.toLocaleString()}자`;
}

function escapeHtml(str) {
    if (!str) return '';
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function getInitialSamplePosts() {
    const samplePosts = [];
    const sampleTitles = [
        "샘플 텍스트 - 제1화"
    ];

    const sampleTagsList = [["태그1", "태그2"]];
    const now = new Date();

    for (let i = 0; i < sampleTitles.length; i++) {
        const pastDate = new Date(now.getTime() - (sampleTitles.length - i) * 3600000 * 4);
        const tagGroup = sampleTagsList[i % sampleTagsList.length];
        
        samplePosts.push({
            id: sampleTitles.length - i,
            title: sampleTitles[i],
            content: `[제 ${i + 1}화 본문 예시]\n\n본문은 백업용 텍스트 파일(.txt)을 업로드하여 언제든지 자동으로 등록하거나 수정하실 수 있습니다.`,
            tags: tagGroup,
            createdAt: formatDate(pastDate),
            updatedAt: null,
            comments: [
                {
                    id: 1000 + i,
                    authorId: getRandomAuthorId('R'),
                    content: "첫 번째 댓글.",
                    createdAt: formatDate(new Date(pastDate.getTime() + 600000)),
                    replies: [
                        {
                            id: 2000 + i,
                            authorId: getRandomAuthorId('RR'),
                            content: "답댓글.",
                            createdAt: formatDate(new Date(pastDate.getTime() + 1200000))
                        }
                    ]
                }
            ]
        });
    }

    return samplePosts;
}

async function resetToSampleData() {
    if (confirm("모든 데이터를 초기의 샘플 게시글 데이터로 리셋하시겠습니까?\n(현재 저장된 게시글이 변경됩니다.)")) {
        posts = getInitialSamplePosts();
        await savePostsToDB(posts);
        selectedPostIds.clear();
        currentPage = 1;
        renderApp();
        showToast("리셋 완료");
    }
}

function openNewPostEditor() {
    saveScrollPosition();
    currentPostId = null;
    navigateTo('editor');
}

function navigateTo(viewName, postId = null) {
    if (currentView === 'detail' && viewName !== 'detail') {
        saveScrollPosition();
    }

    currentView = viewName;
    if (postId !== null) {
        currentPostId = postId;
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

function restoreScrollPosition() {
    if (currentPostId !== null) {
        const savedPos = localStorage.getItem(`novel_scroll_${currentPostId}`);
        if (savedPos !== null) {
            setTimeout(() => {
                window.scrollTo({ top: parseInt(savedPos, 10), behavior: 'auto' });
            }, 50);
        } else {
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }
    }
}

function showToast(message) {
    const toast = document.getElementById('toast');
    document.getElementById('toast-message').innerText = message;
    toast.classList.remove('opacity-0', 'pointer-events-none', 'translate-y-2');
    toast.classList.add('opacity-100', 'translate-y-0');

    setTimeout(() => {
        toast.classList.remove('opacity-100', 'translate-y-0');
        toast.classList.add('opacity-0', 'pointer-events-none', 'translate-y-2');
    }, 2500);
}

function exportToJson() {
    if (posts.length === 0) {
        alert("다운로드할 게시글 데이터가 없습니다.");
        return;
    }

    const dataStr = JSON.stringify(posts, null, 2);
    const blob = new Blob([dataStr], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);

    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
    
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
        return;
    }

    const reader = new FileReader();
    reader.onload = async function(e) {
        try {
            const importedData = JSON.parse(e.target.result);

            if (!Array.isArray(importedData)) {
                alert("올바른 게시글 데이터(JSON 배열) 형식이 아닙니다.");
                return;
            }

            if (confirm("기존 저장된 데이터를 덮어쓰고 가져온 JSON 데이터로 복원하시겠습니까?")) {
                posts = importedData;
                await savePostsToDB(posts);
                selectedPostIds.clear();
                currentPage = 1;
                renderListView();
                showToast("JSON 데이터 복원이 완료되었습니다.");
            }
        } catch (err) {
            alert("JSON 파일을 파싱하는 중 오류가 발생했습니다. 올바른 백업 파일인지 확인해 주세요.");
        }
    };

    reader.readAsText(file, 'UTF-8');
    event.target.value = '';
}

function toggleSelectPost(id, isChecked) {
    if (isChecked) {
        selectedPostIds.add(id);
    } else {
        selectedPostIds.delete(id);
    }
    updateSelectionUI();
    updateMasterCheckboxState();
}

function toggleSelectAll(isChecked) {
    const pagePosts = getCurrentPagePosts();
    pagePosts.forEach(post => {
        if (isChecked) {
            selectedPostIds.add(post.id);
        } else {
            selectedPostIds.delete(post.id);
        }
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
        posts = posts.filter(p => !selectedPostIds.has(p.id));
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

    const newTags = tagInput.split(',').map(t => t.trim()).filter(t => t.length > 0);
    if (newTags.length === 0) return;

    let modifiedCount = 0;
    posts.forEach(post => {
        if (selectedPostIds.has(post.id)) {
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
        if (selectedPostIds.has(post.id) && post.tags && post.tags.includes(targetTag)) {
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

function getCurrentPagePosts() {
    const filteredPosts = getFilteredAndSortedPosts();
    const totalPosts = filteredPosts.length;
    const totalPages = Math.ceil(totalPosts / postsPerPage) || 1;
    const validPage = Math.min(currentPage, totalPages);
    
    const startIndex = (validPage - 1) * postsPerPage;
    const endIndex = Math.min(startIndex + postsPerPage, totalPosts);
    return filteredPosts.slice(startIndex, endIndex);
}

function updateMasterCheckboxState() {
    const pagePosts = getCurrentPagePosts();
    const selectAllCheckbox = document.getElementById('select-all-checkbox');
    if (!selectAllCheckbox) return;

    if (pagePosts.length > 0 && pagePosts.every(p => selectedPostIds.has(p.id))) {
        selectAllCheckbox.checked = true;
        selectAllCheckbox.indeterminate = false;
    } else if (pagePosts.some(p => selectedPostIds.has(p.id))) {
        selectAllCheckbox.checked = false;
        selectAllCheckbox.indeterminate = true;
    } else {
        selectAllCheckbox.checked = false;
        selectAllCheckbox.indeterminate = false;
    }
}

function getTotalCommentCount(post) {
    let count = post.comments ? post.comments.length : 0;
    if (post.comments) {
        post.comments.forEach(c => {
            if (c.replies) count += c.replies.length;
        });
    }
    return count;
}

function getFilteredAndSortedPosts() {
    let result = [...posts];

    if (searchQuery.trim() !== '') {
        const q = searchQuery.toLowerCase();
        result = result.filter(p => p.title.toLowerCase().includes(q) || p.content.toLowerCase().includes(q));
    }

    if (selectedTag) {
        result = result.filter(p => p.tags && p.tags.includes(selectedTag));
    }

    result.sort((a, b) => {
        if (sortOrder === 'newest') {
            return new Date(b.createdAt) - new Date(a.createdAt);
        } else if (sortOrder === 'oldest') {
            return new Date(a.createdAt) - new Date(b.createdAt);
        } else if (sortOrder === 'title') {
            return a.title.localeCompare(b.title, 'ko');
        } else if (sortOrder === 'updated') {
            const timeA = new Date(a.updatedAt || a.createdAt);
            const timeB = new Date(b.updatedAt || b.createdAt);
            return timeB - timeA;
        } else if (sortOrder === 'length') {
            return getCharCountInfo(b.content).withSpace - getCharCountInfo(a.content).withSpace;
        } else if (sortOrder === 'comments') {
            return getTotalCommentCount(b) - getTotalCommentCount(a);
        }
        return 0;
    });

    return result;
}

function renderListView() {
    populateTagOptions();

    const filteredPosts = getFilteredAndSortedPosts();
    const totalPosts = filteredPosts.length;
    const totalPages = Math.ceil(totalPosts / postsPerPage) || 1;

    if (currentPage > totalPages) currentPage = totalPages;

    const startIndex = (currentPage - 1) * postsPerPage;
    const endIndex = Math.min(startIndex + postsPerPage, totalPosts);
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
                ? post.tags.map(t => `<span class="inline-block bg-stone-100 dark:bg-stone-700 text-stone-600 dark:text-stone-300 px-2 py-0.5 rounded text-[11px] font-medium mr-1">#${t}</span>`).join('')
                : '<span class="text-stone-400 dark:text-stone-500 text-xs">-</span>';

            const isChecked = selectedPostIds.has(post.id);

            tr.innerHTML = `
                <td class="py-3.5 px-3 text-center" onclick="event.stopPropagation()">
                    <input type="checkbox" class="w-4 h-4 text-brand-600 rounded border-stone-300 focus:ring-brand-500 cursor-pointer" 
                           value="${post.id}" ${isChecked ? 'checked' : ''} 
                           onchange="toggleSelectPost(${post.id}, this.checked)">
                </td>
                <td class="py-3.5 px-4 text-center font-mono text-xs text-stone-400">#${post.id}</td>
                <td class="py-3.5 px-4 font-medium text-stone-900 dark:text-stone-100 hover:text-brand-600">
                    ${escapeHtml(post.title)}
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
        if (p.tags && Array.isArray(p.tags)) {
            p.tags.forEach(t => tagSet.add(t));
        }
    });

    const tagSelect = document.getElementById('tag-select');
    const currentSelected = selectedTag;
    tagSelect.innerHTML = '<option value="">모든 태그 전체보기</option>';

    const pillsContainer = document.getElementById('tag-pills-container');
    pillsContainer.innerHTML = '<span class="text-stone-500 dark:text-stone-400 font-medium mr-1">태그 필터:</span>';

    const allPill = document.createElement('button');
    allPill.className = `px-2 py-0.5 rounded-md font-medium text-xs transition ${selectedTag === '' ? 'bg-brand-600 text-white' : 'bg-stone-100 dark:bg-stone-700 text-stone-600 dark:text-stone-300 hover:bg-stone-200 dark:hover:bg-stone-600'}`;
    allPill.innerText = '전체';
    allPill.onclick = () => { selectedTag = ''; document.getElementById('tag-select').value = ''; currentPage = 1; renderListView(); };
    pillsContainer.appendChild(allPill);

    tagSet.forEach(tag => {
        const opt = document.createElement('option');
        opt.value = tag;
        opt.innerText = `#${tag}`;
        if (tag === currentSelected) opt.selected = true;
        tagSelect.appendChild(opt);

        const pill = document.createElement('button');
        pill.className = `px-2 py-0.5 rounded-md font-medium text-xs transition ${selectedTag === tag ? 'bg-brand-600 text-white' : 'bg-stone-100 dark:bg-stone-700 text-stone-600 dark:text-stone-300 hover:bg-stone-200 dark:hover:bg-stone-600'}`;
        pill.innerText = `#${tag}`;
        pill.onclick = () => {
            selectedTag = tag;
            document.getElementById('tag-select').value = tag;
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

function renderDetailView() {
    const post = posts.find(p => p.id === currentPostId);
    if (!post) {
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

    updateContentDisplay(post.content);
    updateAdjacentPostButtons();
    renderComments(post);
    restoreScrollPosition();
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

function applyKeywordHighlight() {
    const input = document.getElementById('keyword-input');
    currentHighlightKeyword = input.value.trim();
    const post = posts.find(p => p.id === currentPostId);
    if (post) {
        updateContentDisplay(post.content);
        if (currentHighlightKeyword) {
            showToast(`'${currentHighlightKeyword}' 키워드가 강조되었습니다.`);
        }
    }
}

function clearKeywordHighlight() {
    document.getElementById('keyword-input').value = '';
    currentHighlightKeyword = '';
    const post = posts.find(p => p.id === currentPostId);
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
    
    const post = posts.find(p => p.id === currentPostId);
    if (post) updateContentDisplay(post.content);
}

function changePadding(pdClass, btnEl) {
    currentPaddingClass = pdClass;
    document.querySelectorAll('.pd-btn').forEach(b => {
        b.classList.remove('border-brand-600', 'text-brand-700', 'dark:text-brand-300', 'font-semibold', 'bg-brand-50', 'dark:bg-brand-950/50');
    });
    btnEl.classList.add('border-brand-600', 'text-brand-700', 'dark:text-brand-300', 'font-semibold', 'bg-brand-50', 'dark:bg-brand-950/50');
    
    const post = posts.find(p => p.id === currentPostId);
    if (post) updateContentDisplay(post.content);
}

function updateAdjacentPostButtons() {
    const filteredPosts = getFilteredAndSortedPosts();
    const currentIndex = filteredPosts.findIndex(p => p.id === currentPostId);

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
    const filteredPosts = getFilteredAndSortedPosts();
    const currentIndex = filteredPosts.findIndex(p => p.id === currentPostId);
    if (currentIndex === -1) return;

    let targetIndex = direction === 'prev' ? currentIndex - 1 : currentIndex + 1;
    if (targetIndex >= 0 && targetIndex < filteredPosts.length) {
        saveScrollPosition();
        currentPostId = filteredPosts[targetIndex].id;
        renderDetailView();
    }
}

function changeFontFamily(fontClass, btnEl) {
    currentFontClass = fontClass;
    document.querySelectorAll('.font-btn').forEach(b => {
        b.classList.remove('border-brand-600', 'text-brand-700', 'dark:text-brand-300', 'font-semibold', 'bg-brand-50', 'dark:bg-brand-950/50');
    });
    btnEl.classList.add('border-brand-600', 'text-brand-700', 'dark:text-brand-300', 'font-semibold', 'bg-brand-50', 'dark:bg-brand-950/50');

    const post = posts.find(p => p.id === currentPostId);
    if (post) updateContentDisplay(post.content);
}

function changeFontSize(sizeClass) {
    const contentEl = document.getElementById('detail-content');
    contentEl.classList.remove('text-sm', 'text-base', 'text-lg', 'text-xl');
    contentEl.classList.add(sizeClass);
}

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
                        <button onclick="toggleReplyBox(${comment.id})" class="text-xs font-medium text-brand-600 dark:text-brand-400 hover:text-brand-800 bg-brand-50 dark:bg-brand-950/50 px-2.5 py-1 rounded-md transition">
                            답글 달기
                        </button>
                        <button onclick="toggleEditCommentBox(${comment.id})" class="text-xs font-medium text-stone-600 dark:text-stone-300 hover:text-stone-800 bg-stone-100 dark:bg-stone-700 px-2.5 py-1 rounded-md transition">
                            수정
                        </button>
                        <button onclick="deleteComment(${comment.id})" class="text-xs font-medium text-red-600 dark:text-red-400 hover:text-red-800 bg-red-50 dark:bg-red-950/50 px-2.5 py-1 rounded-md transition">
                            삭제
                        </button>
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
                    </div>
                `;}).join('')}
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

function getRandomAuthorId(prefix) {
    let randomNum = '';
    for (let i = 0; i < 6; i++) {
        randomNum += Math.floor(Math.random() * 10);
    }
    return `${prefix}-${randomNum}`;
}

async function submitMainComment() {
    const input = document.getElementById('main-comment-input');
    const content = input.value.trim();
    if (!content) {
        alert('댓글 내용을 입력해 주세요.');
        return;
    }

    const post = posts.find(p => p.id === currentPostId);
    if (!post) return;

    if (!post.comments) post.comments = [];

    const newComment = {
        id: Date.now(),
        authorId: getRandomAuthorId('R'),
        content: content,
        createdAt: formatDate(),
        replies: []
    };

    post.comments.push(newComment);
    await savePosts();

    input.value = '';
    renderDetailView();
    showToast('댓글이 등록되었습니다.');
}

async function submitReply(commentId) {
    const input = document.getElementById(`reply-input-${commentId}`);
    const content = input.value.trim();
    if (!content) {
        alert('답댓글 내용을 입력해 주세요.');
        return;
    }

    const post = posts.find(p => p.id === currentPostId);
    if (!post) return;

    const parentComment = post.comments.find(c => c.id === commentId);
    if (!parentComment) return;

    if (!parentComment.replies) parentComment.replies = [];

    parentComment.replies.push({
        id: Date.now(),
        authorId: getRandomAuthorId('RR'),
        content: content,
        createdAt: formatDate()
    });

    await savePosts();
    renderDetailView();
    showToast('답댓글이 등록되었습니다.');
}

async function submitEditComment(commentId) {
    const input = document.getElementById(`edit-comment-input-${commentId}`);
    const content = input.value.trim();
    if (!content) {
        alert('수정할 댓글 내용을 입력해 주세요.');
        return;
    }

    const post = posts.find(p => p.id === currentPostId);
    if (!post) return;

    const comment = post.comments.find(c => c.id === commentId);
    if (comment) {
        comment.content = content;
        await savePosts();
        renderDetailView();
        showToast('댓글이 수정되었습니다.');
    }
}

async function deleteComment(commentId) {
    if (!confirm('이 댓글을 삭제하시겠습니까?')) return;

    const post = posts.find(p => p.id === currentPostId);
    if (!post) return;

    post.comments = post.comments.filter(c => c.id !== commentId);
    await savePosts();
    renderDetailView();
    showToast('댓글이 삭제되었습니다.');
}

async function submitEditReply(commentId, replyId) {
    const input = document.getElementById(`edit-reply-input-${replyId}`);
    const content = input.value.trim();
    if (!content) {
        alert('수정할 답댓글 내용을 입력해 주세요.');
        return;
    }

    const post = posts.find(p => p.id === currentPostId);
    if (!post) return;

    const comment = post.comments.find(c => c.id === commentId);
    if (comment && comment.replies) {
        const reply = comment.replies.find(r => r.id === replyId);
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

    const post = posts.find(p => p.id === currentPostId);
    if (!post) return;

    const comment = post.comments.find(c => c.id === commentId);
    if (comment && comment.replies) {
        comment.replies = comment.replies.filter(r => r.id !== replyId);
        await savePosts();
        renderDetailView();
        showToast('답댓글이 삭제되었습니다.');
    }
}

function downloadCurrentPostTxt() {
    const post = posts.find(p => p.id === currentPostId);
    if (!post) return;

    const info = getCharCountInfo(post.content);
    const textContent = `제목: ${post.title}\n작성일: ${post.createdAt}${post.updatedAt ? '\n수정일: ' + post.updatedAt : ''}\n태그: ${(post.tags || []).join(', ')}\n글자수: ${info.withSpace}자 / ${info.withoutSpace}자\n\n----------------------------------------\n\n${post.content}`;

    const blob = new Blob([textContent], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    
    const cleanTitle = post.title.replace(/[/\\?%*:|"<>]/g, '_');
    a.download = `${cleanTitle}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    showToast('.txt 파일 다운로드가 시작되었습니다.');
}

async function confirmDeleteCurrentPost() {
    if (confirm("정말로 이 게시글을 삭제하시겠습니까? 삭제된 글은 복구할 수 없습니다.")) {
        posts = posts.filter(p => p.id !== currentPostId);
        selectedPostIds.delete(currentPostId);
        await savePosts();
        showToast("게시글이 삭제되었습니다.");
        navigateTo('list');
    }
}

function renderEditorView() {
    const postIdInput = document.getElementById('editor-post-id');
    const heading = document.getElementById('editor-heading');
    const titleInput = document.getElementById('editor-title');
    const tagsInput = document.getElementById('editor-tags');
    const contentInput = document.getElementById('editor-content');
    const fileInput = document.getElementById('txt-file-input');

    fileInput.value = '';

    if (currentPostId) {
        const post = posts.find(p => p.id === currentPostId);
        if (post) {
            heading.innerText = "게시글 수정";
            postIdInput.value = post.id;
            titleInput.value = post.title;
            tagsInput.value = (post.tags || []).join(', ');
            contentInput.value = post.content;
        }
    } else {
        heading.innerText = "새 소설/게시글 작성";
        postIdInput.value = "";
        titleInput.value = "";
        tagsInput.value = "";
        contentInput.value = "";
    }

    updateLiveCharCount();
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
    if (currentPostId) {
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
    reader.onload = function(e) {
        const textContent = e.target.result;
        const fileNameWithoutExt = file.name.replace(/\.txt$/i, '');
        document.getElementById('editor-title').value = fileNameWithoutExt;
        document.getElementById('editor-content').value = textContent;

        updateLiveCharCount();
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

    const tags = tagsRaw ? tagsRaw.split(',').map(t => t.trim()).filter(t => t.length > 0) : [];

    if (editingId) {
        const post = posts.find(p => p.id === parseInt(editingId, 10));
        if (post) {
            post.title = title;
            post.tags = tags;
            post.content = content;
            post.updatedAt = formatDate();
            await savePosts();
            showToast("게시글이 수정되었습니다.");
            navigateTo('detail', post.id);
        }
    } else {
        const newId = posts.length > 0 ? Math.max(...posts.map(p => p.id)) + 1 : 1;
        const newPost = {
            id: newId,
            title: title,
            content: content,
            tags: tags,
            createdAt: formatDate(),
            updatedAt: null,
            comments: []
        };

        posts.unshift(newPost);
        await savePosts();
        showToast("새 게시글이 성공적으로 등록되었습니다.");
        currentPostId = newPost.id;
        navigateTo('detail', newPost.id);
    }
}

function renderApp() {
    initDarkMode();
    loadPosts();
}

window.onload = function() {
    initDarkMode();
    loadPosts().then(() => {
        navigateTo('list');
    });
};