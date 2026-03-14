import re

with open('apps/spotaether.html', 'r', encoding='utf-8') as f:
    html = f.read()

# 1. Insert CSS
css_patch = '''
        /* Action buttons & Comments */
        .action-icon-btn {
            background: none; border: none; font-size: 1.5rem; color: var(--text-secondary); cursor: pointer; transition: var(--transition);
        }
        .action-icon-btn:hover { color: var(--accent); transform: scale(1.1); }
        .action-icon-btn.liked { color: #ff4757; }
        
        .comments-panel {
            position: fixed; top: 0; right: -400px; width: 400px; height: 100vh;
            background: rgba(17, 17, 17, 0.98); backdrop-filter: blur(20px);
            border-left: 1px solid var(--border-color); z-index: 2000;
            transition: right 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94);
            display: flex; flex-direction: column; box-shadow: -10px 0 30px rgba(0,0,0,0.5);
        }
        .comments-panel.open { right: 0; }
        .comments-header {
            padding: 1.5rem; border-bottom: 1px solid var(--border-color);
            display: flex; justify-content: space-between; align-items: center; font-weight: 700;
        }
        .close-comments {
            background: none; border: none; color: var(--text-primary); font-size: 1.2rem; cursor: pointer;
        }
        .comments-list {
            flex: 1; padding: 1.5rem; overflow-y: auto; display: flex; flex-direction: column; gap: 1rem;
        }
        .comment-item {
            background: rgba(255,255,255,0.05); padding: 1rem; border-radius: 12px;
        }
        .comment-item-header {
            display: flex; justify-content: space-between; font-size: 0.8rem; color: var(--text-secondary); margin-bottom: 0.5rem;
        }
        .comment-text {
            color: var(--text-primary); font-size: 0.95rem; line-height: 1.4;
        }
        .comments-input-area {
            padding: 1.5rem; border-top: 1px solid var(--border-color); background: rgba(0,0,0,0.5);
            display: flex; gap: 0.5rem;
        }
        .comments-input-area input {
            flex: 1; background: rgba(255,255,255,0.05); border: 1px solid var(--border-color);
            border-radius: var(--button-radius); padding: 12px 15px; color: var(--text-primary);
        }
        .comments-input-area button {
            background: var(--accent); color: var(--bg-primary); border: none; padding: 0 1.5rem;
            border-radius: var(--button-radius); font-weight: 700; cursor: pointer;
        }
    </style>'''
html = html.replace('    </style>', css_patch)

# 2. Insert Player Bar Buttons
player_btns = '''            <div class="player-text">
                <div class="title" id="playerTitle">-</div>
                <div class="artist" id="playerArtist">-</div>
            </div>
            <button class="action-icon-btn" id="likeTrackBtn" onclick="toggleLikeCurrent()"></button>
            <button class="action-icon-btn" id="commentTrackBtn" onclick="toggleCommentsPanel()"></button>
        </div>'''
html = re.sub(r'            <div class="player-text">\s*<div class="title" id="playerTitle">-</div>\s*<div class="artist" id="playerArtist">-</div>\s*</div>\s*</div>', player_btns, html)

# 3. Insert Comments Overlay
overlay = '''    <!-- Comments Panel -->
    <div id="commentsPanel" class="comments-panel">
        <div class="comments-header">
            <span>Commentaires</span>
            <button class="close-comments" onclick="toggleCommentsPanel()"></button>
        </div>
        <div id="commentsList" class="comments-list">
            <div style="text-align:center; color: var(--text-secondary); margin-top: auto; margin-bottom: auto;">
                Lancez une musique pour voir les commentaires.
            </div>
        </div>
        <div class="comments-input-area">
            <input type="text" id="commentInput" placeholder="Ajouter un commentaire..." onkeypress="if(event.key === 'Enter') submitComment()">
            <button onclick="submitComment()">Envoyer</button>
        </div>
    </div>

    <!-- Message container -->'''
html = html.replace('    <!-- Message container -->', overlay)

# 4. Insert Global States
html = html.replace('<script>', '<script>\\n        const likedTracks = new Set();\\n        const trackComments = {};\\n')

# 5. Overwrite refreshCatalog
refresh_old = r'        async function refreshCatalog\(\) \{[\s\S]*?\} catch \(err\) \{[^}]*\}\s*\}'
refresh_new = '''        async function refreshCatalog() {
            try {
                const res = await fetch('https://discoveryprovider.audius.co/v1/tracks/trending?app_name=spotaether');
                const json = await res.json();
                const audiusData = Array.isArray(json.data) ? json.data : [];
                catalogTracks = audiusData.filter(t => t && t.id && t.title).map(t => ({
                    id: 'audius:' + t.id,
                    source: 'audius',
                    owner: t.user?.name || 'Audius Artist',
                    title: t.title,
                    artist: t.user?.name || 'Unknown Artist',
                    genre: t.genre || 'Various',
                    description: t.description || '',
                    type: 'single',
                    album: null,
                    trackNumber: null,
                    audioUrl: https://discoveryprovider.audius.co/v1/tracks//stream?app_name=spotaether,
                    coverUrl: t.artwork ? (t.artwork['480x480'] || t.artwork['150x150']) : '',
                    date: t.created_at ? new Date(t.created_at).toLocaleDateString() : '',
                    plays: t.play_count || 0,
                    likes: t.favorite_count || 0
                }));
                if (currentView === 'discover') renderDiscover();
            } catch (err) {
                console.error("Audius fetch error:", err);
            }
        }'''
html = re.sub(refresh_old, refresh_new, html)

# 6. Overwrite handleSearch
search_old = r'        function handleSearch\(\) \{[\s\S]*?renderSearchResults\(results\);\s*\}'
search_new = '''        let searchTimeout;
        function handleSearch() {
            clearTimeout(searchTimeout);
            const query = document.getElementById('searchInput').value.toLowerCase();
            
            if (query.length < 2) {
                renderDiscover();
                return;
            }

            searchTimeout = setTimeout(async () => {
                const results = getAllTracks().filter(track => 
                    track.title.toLowerCase().includes(query) ||
                    track.artist.toLowerCase().includes(query)
                );
                
                renderSearchResults(results);

                try {
                    const res = await fetch(https://discoveryprovider.audius.co/v1/tracks/search?query=&app_name=spotaether);
                    const json = await res.json();
                    const audiusData = Array.isArray(json.data) ? json.data : [];
                    const audiusResults = audiusData.filter(t => t && t.id && t.title).map(t => ({
                        id: 'audius:' + t.id,
                        source: 'audius',
                        owner: t.user?.name || 'Audius Artist',
                        title: t.title,
                        artist: t.user?.name || 'Unknown Artist',
                        genre: t.genre || 'Various',
                        description: t.description || '',
                        type: 'single',
                        album: null,
                        trackNumber: null,
                        audioUrl: https://discoveryprovider.audius.co/v1/tracks//stream?app_name=spotaether,
                        coverUrl: t.artwork ? (t.artwork['480x480'] || t.artwork['150x150']) : '',
                        date: t.created_at ? new Date(t.created_at).toLocaleDateString() : '',
                        plays: t.play_count || 0,
                        likes: t.favorite_count || 0
                    }));
                    
                    const existingIds = new Set(results.map(r => String(r.id)));
                    let changed = false;
                    for (let tr of audiusResults) {
                        if (!existingIds.has(String(tr.id))) {
                            results.push(tr);
                            changed = true;
                            if (!catalogTracks.find(c => c.id === tr.id)) {
                                catalogTracks.push(tr);
                            }
                        }
                    }
                    if(changed) renderSearchResults(results);
                } catch(e) {
                    console.error("Audius search error:", e);
                }
            }, 500);
        }'''
html = re.sub(search_old, search_new, html)


# 7. Add like/comment functions
functions = '''
        // ==================== LIKES & COMMENTS ====================
        function toggleLikeCurrent() {
            if (!currentTrack) return;
            const btn = document.getElementById('likeTrackBtn');
            const trackId = String(currentTrack.id);
            if(likedTracks.has(trackId)) {
                likedTracks.delete(trackId);
                btn.classList.remove('liked');
                btn.textContent = '';
            } else {
                likedTracks.add(trackId);
                btn.classList.add('liked');
                btn.textContent = '';
            }
            renderDiscover(); // Refresh hearts globally
        }
        
        function updateLikeUI(trackId) {
            const btn = document.getElementById('likeTrackBtn');
            if(currentTrack && String(currentTrack.id) === String(trackId)) {
                if(likedTracks.has(String(trackId))) {
                    btn.classList.add('liked');
                    btn.textContent = '';
                } else {
                    btn.classList.remove('liked');
                    btn.textContent = '';
                }
            }
        }

        function toggleCommentsPanel() {
            const panel = document.getElementById('commentsPanel');
            panel.classList.toggle('open');
            if (panel.classList.contains('open') && currentTrack) {
                renderComments();
            }
        }
        
        function renderComments() {
            const list = document.getElementById('commentsList');
            if (!currentTrack) {
                list.innerHTML = <div style="text-align:center; color: var(--text-secondary); margin-top: auto; margin-bottom: auto;">Lancez une musique pour voir les commentaires.</div>;
                return;
            }
            
            const tid = String(currentTrack.id);
            const comments = trackComments[tid] || [];
            
            if (comments.length === 0) {
                list.innerHTML = <div style="text-align:center; color: var(--text-secondary); margin-top: auto; margin-bottom: auto;">Aucun commentaire. Soyez le premier !</div>;
                return;
            }
            
            list.innerHTML = comments.map(c => 
                <div class="comment-item">
                    <div class="comment-item-header">
                        <span style="font-weight:bold; color:var(--text-primary)"></span>
                        <span></span>
                    </div>
                    <div class="comment-text"></div>
                </div>
            ).join('');
            
            list.scrollTop = list.scrollHeight;
        }
        
        function submitComment() {
            const input = document.getElementById('commentInput');
            const text = input.value.trim();
            if(!text) return;
            if(!currentTrack) {
                showMessage("Jouez une musique d'abord !", true);
                return;
            }
            
            const tid = String(currentTrack.id);
            if(!trackComments[tid]) trackComments[tid] = [];
            
            trackComments[tid].push({
                user: currentUser.name || 'Visiteur',
                text: text,
                date: new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})
            });
            input.value = '';
            
            renderComments();
        }

        // ==================== LECTURE ===================='''
html = html.replace('        // ==================== LECTURE ====================', functions)


# 8. Update renderTracks to show proper heart
html = html.replace('<span> </span>', '<span> </span>')

# 9. Update playTrack to call updateLikeUI and renderComments
html = html.replace("if (track.source === 'audius') showMessage('Lecture via Audius.');", "if (track.source === 'audius') showMessage('Lecture via Audius Internet Archive.');\\n            updateLikeUI(track.id);\\n            renderComments();")


with open('apps/spotaether.html', 'w', encoding='utf-8') as f:
    f.write(html)

print("Patch applied!")
