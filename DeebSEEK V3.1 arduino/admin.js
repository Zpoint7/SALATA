const Admin = (() => {
    function showView(name) {
        document.body.dataset.view = name;
        document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
        document.getElementById(name + 'View').classList.add('active');
    }
    async function backToMenu() {
        if (Competition.isRunning()) {
            if (!confirm('هل تريد إنهاء المباراة والعودة للقائمة؟ سيتم حفظ الماتش في السجل.')) return;
            await Competition.forceEndMatchSilent();
        }
        showView('menu');
    }
    async function startCompetition() {
        const ok = await Competition.init();
        if (!ok) return;
        showView('competition');
        Competition.start();
    }
    function openSettings() { showView('settings'); Settings.render(); }
    function openHistory() { showView('history'); History.render(); }

    let modalResolve = null;
    function showModal(title, bodyHTML, footerHTML) {
        document.getElementById('modalTitle').innerText = title;
        document.getElementById('modalBody').innerHTML = bodyHTML;
        document.getElementById('modalFooter').innerHTML = footerHTML;
        document.getElementById('modalOverlay').classList.add('active');
        return new Promise(r => { modalResolve = r; });
    }
    function closeModal(value) {
        document.getElementById('modalOverlay').classList.remove('active');
        if (modalResolve) { modalResolve(value); modalResolve = null; }
    }
    return { showView, backToMenu, startCompetition, openSettings, openHistory, showModal, closeModal };
})();

// ============ SETTINGS ============
const Settings = (() => {
    let currentTab = 'teams';
    function init() {
        document.querySelectorAll('.settings-tabs .tab').forEach(tab => {
            tab.addEventListener('click', () => {
                document.querySelectorAll('.settings-tabs .tab').forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                currentTab = tab.dataset.tab;
                render();
            });
        });
    }
    async function render() {
        const c = document.getElementById('settingsContent');
        if (currentTab === 'teams') await renderTeams(c);
        else if (currentTab === 'players') await renderPlayers(c);
        else if (currentTab === 'questions') await renderQuestions(c);
        else if (currentTab === 'match') await renderMatch(c);
        else if (currentTab === 'stats') await Stats.render(c);
        else if (currentTab === 'database') await renderDatabase(c);
    }

    async function renderTeams(c) {
        const teams = await DB.getAll('teams');
        c.innerHTML = `
            <div class="tab-actions"><button class="btn-primary" onclick="Settings.editTeam()">➕ إضافة فريق جديد</button></div>
            <div class="cards-grid">
                ${teams.length === 0 ? '<p class="empty-msg">لا توجد فرق بعد. أضف فريقك الأول!</p>' : ''}
                ${teams.map(t => `
                    <div class="card">
                        <div class="card-img-wrapper">
                            ${t.logo ? `<img src="${t.logo}" class="card-img">` : '<div class="card-img-placeholder">🏆</div>'}
                        </div>
                        <div class="card-body">
                            <h4>${escapeHTML(t.name)}</h4>
                            <div class="card-actions">
                                <button class="btn-small" onclick="Settings.editTeam('${t.id}')">✏️ تعديل</button>
                                <button class="btn-small danger" onclick="Settings.deleteTeam('${t.id}')">🗑 حذف</button>
                            </div>
                        </div>
                    </div>
                `).join('')}
            </div>`;
    }
    async function editTeam(id) {
        const team = id ? await DB.get('teams', id) : null;
        const html = `
            <div class="form-group"><label>اسم الفريق *</label><input type="text" id="teamName" class="input" value="${team ? escapeHTML(team.name) : ''}"></div>
            <div class="form-group"><label>شعار الفريق</label><input type="file" id="teamLogoFile" accept="image/*" class="input-file">
                <div id="teamLogoPreview" class="preview-box">${team?.logo ? `<img src="${team.logo}">` : '<span>لا يوجد شعار</span>'}</div>
                <input type="hidden" id="teamExistingLogo" value="${team?.logo || ''}">
            </div>`;
        Admin.showModal(team ? 'تعديل فريق' : 'إضافة فريق جديد', html,
            `<button class="btn-primary" onclick="Settings.saveTeam('${id || ''}')">💾 حفظ</button>
             <button class="btn-secondary" onclick="Admin.closeModal()">إلغاء</button>`);
        document.getElementById('teamLogoFile').addEventListener('change', async e => {
            if (e.target.files[0]) {
                const dataURL = await fileToDataURL(e.target.files[0]);
                document.getElementById('teamLogoPreview').innerHTML = `<img src="${dataURL}">`;
                document.getElementById('teamExistingLogo').value = dataURL;
            }
        });
    }
    async function saveTeam(id) {
        const name = document.getElementById('teamName').value.trim();
        if (!name) return alert('الرجاء إدخال اسم الفريق');
        const logo = document.getElementById('teamExistingLogo').value;
        await DB.put('teams', { id: id || 'team_' + Date.now(), name, logo });
        Admin.closeModal(); render();
    }
    async function deleteTeam(id) {
        if (!confirm('حذف هذا الفريق وكل لاعبيه؟')) return;
        const players = await DB.getAll('players');
        for (const p of players.filter(p => p.teamId === id)) await DB.del('players', p.id);
        await DB.del('teams', id); render();
    }

    async function renderPlayers(c) {
        const [players, teams] = await Promise.all([DB.getAll('players'), DB.getAll('teams')]);
        const teamMap = Object.fromEntries(teams.map(t => [t.id, t]));
        c.innerHTML = `
            <div class="tab-actions">
                <button class="btn-primary" onclick="Settings.editPlayer()" ${teams.length === 0 ? 'disabled' : ''}>➕ إضافة لاعب</button>
                ${teams.length === 0 ? '<span class="hint">أضف فرقاً أولاً</span>' : ''}
            </div>
            <table class="data-table">
                <thead><tr><th>الصورة</th><th>الاسم</th><th>الفريق</th><th>زر البازر</th><th>إجراءات</th></tr></thead>
                <tbody>
                    ${players.length === 0 ? '<tr><td colspan="5" class="empty-msg">لا يوجد لاعبون</td></tr>' : ''}
                    ${players.map(p => `
                        <tr>
                            <td>${p.img ? `<img src="${p.img}" class="table-img">` : '<div class="table-img placeholder">👤</div>'}</td>
                            <td>${escapeHTML(p.name)}</td>
                            <td>${escapeHTML(teamMap[p.teamId]?.name || '—')}</td>
                            <td><kbd>${escapeHTML(p.buzzerKey || '—')}</kbd></td>
                            <td>
                                <button class="btn-small" onclick="Settings.editPlayer('${p.id}')">✏️</button>
                                <button class="btn-small danger" onclick="Settings.deletePlayer('${p.id}')">🗑</button>
                            </td>
                        </tr>`).join('')}
                </tbody>
            </table>`;
    }
    async function editPlayer(id) {
        const [player, teams] = await Promise.all([id ? DB.get('players', id) : null, DB.getAll('teams')]);
        const html = `
            <div class="form-group"><label>اسم اللاعب *</label><input type="text" id="playerName" class="input" value="${player ? escapeHTML(player.name) : ''}"></div>
            <div class="form-group"><label>الفريق *</label>
                <select id="playerTeam" class="input">${teams.map(t => `<option value="${t.id}" ${player?.teamId === t.id ? 'selected' : ''}>${escapeHTML(t.name)}</option>`).join('')}</select>
            </div>
            <div class="form-group"><label>زر البازر (حرف/رقم واحد) *</label><input type="text" id="playerBuzzer" class="input" maxlength="1" value="${player?.buzzerKey || ''}" placeholder="مثال: 1"></div>
            <div class="form-group"><label>صورة اللاعب</label><input type="file" id="playerImgFile" accept="image/*" class="input-file">
                <div id="playerImgPreview" class="preview-box">${player?.img ? `<img src="${player.img}">` : '<span>لا توجد صورة</span>'}</div>
                <input type="hidden" id="playerExistingImg" value="${player?.img || ''}">
            </div>`;
        Admin.showModal(player ? 'تعديل لاعب' : 'إضافة لاعب', html,
            `<button class="btn-primary" onclick="Settings.savePlayer('${id || ''}')">💾 حفظ</button>
             <button class="btn-secondary" onclick="Admin.closeModal()">إلغاء</button>`);
        document.getElementById('playerImgFile').addEventListener('change', async e => {
            if (e.target.files[0]) {
                const dataURL = await fileToDataURL(e.target.files[0]);
                document.getElementById('playerImgPreview').innerHTML = `<img src="${dataURL}">`;
                document.getElementById('playerExistingImg').value = dataURL;
            }
        });
    }
    async function savePlayer(id) {
        const name = document.getElementById('playerName').value.trim();
        const teamId = document.getElementById('playerTeam').value;
        const buzzerKey = document.getElementById('playerBuzzer').value.trim();
        if (!name || !teamId || !buzzerKey) return alert('كل الحقول مطلوبة');
        const all = await DB.getAll('players');
        const dup = all.find(p => p.buzzerKey === buzzerKey && p.id !== id);
        if (dup) return alert(`زر "${buzzerKey}" مستخدم بالفعل بواسطة ${dup.name}`);
        const img = document.getElementById('playerExistingImg').value;
        await DB.put('players', { id: id || 'player_' + Date.now(), name, teamId, buzzerKey, img });
        Admin.closeModal(); render();
    }
    async function deletePlayer(id) {
        if (!confirm('حذف هذا اللاعب؟')) return;
        await DB.del('players', id); render();
    }

    async function renderQuestions(c) {
        const questions = await DB.getAll('questions');
        c.innerHTML = `
            <div class="tab-actions"><button class="btn-primary" onclick="Settings.editQuestion()">➕ إضافة سؤال</button></div>
            ${questions.length === 0 ? '<p class="empty-msg">لا توجد أسئلة</p>' : ''}
            <div class="questions-list">
                ${questions.map((q, i) => `
                    <div class="question-card">
                        <div class="q-header"><span class="q-num">سؤال ${i + 1}</span><span class="q-points">${q.points || 10} نقطة</span></div>
                        <p class="q-text">${escapeHTML(q.text)}</p>
                        <div class="q-options">
                            ${['optA','optB','optC','optD'].map(k => `<div class="q-opt ${q.correctAnswer === k ? 'correct' : ''}">${escapeHTML(q.options[k])}</div>`).join('')}
                        </div>
                        <div class="card-actions">
                            <button class="btn-small" onclick="Settings.editQuestion('${q.id}')">✏️ تعديل</button>
                            <button class="btn-small danger" onclick="Settings.deleteQuestion('${q.id}')">🗑 حذف</button>
                        </div>
                    </div>`).join('')}
            </div>`;
    }
    async function editQuestion(id) {
        const q = id ? await DB.get('questions', id) : null;
        const opt = (k, label) => `<div class="form-group"><label>${label} *</label><input type="text" id="q_${k}" class="input" value="${q ? escapeHTML(q.options[k]) : ''}"></div>`;
        const html = `
            <div class="form-group"><label>نص السؤال *</label><textarea id="qText" class="input" rows="2">${q ? escapeHTML(q.text) : ''}</textarea></div>
            ${opt('optA', 'الخيار أ')}${opt('optB', 'الخيار ب')}${opt('optC', 'الخيار ج')}${opt('optD', 'الخيار د')}
            <div class="form-group"><label>الإجابة الصحيحة *</label>
                <select id="qCorrect" class="input">
                    ${['optA','optB','optC','optD'].map(k => `<option value="${k}" ${q?.correctAnswer === k ? 'selected' : ''}>الخيار ${k.replace('opt','')}</option>`).join('')}
                </select>
            </div>
            <div class="form-group"><label>النقاط</label><input type="number" id="qPoints" class="input" value="${q?.points || 10}" min="1"></div>`;
        Admin.showModal(q ? 'تعديل سؤال' : 'إضافة سؤال', html,
            `<button class="btn-primary" onclick="Settings.saveQuestion('${id || ''}')">💾 حفظ</button>
             <button class="btn-secondary" onclick="Admin.closeModal()">إلغاء</button>`);
    }
    async function saveQuestion(id) {
        const text = document.getElementById('qText').value.trim();
        if (!text) return alert('نص السؤال مطلوب');
        const options = {};
        for (const k of ['optA','optB','optC','optD']) {
            options[k] = document.getElementById('q_' + k).value.trim();
            if (!options[k]) return alert('كل الخيارات مطلوبة');
        }
        const correctAnswer = document.getElementById('qCorrect').value;
        const points = parseInt(document.getElementById('qPoints').value) || 10;
        await DB.put('questions', { id: id || 'q_' + Date.now(), text, options, correctAnswer, points });
        Admin.closeModal(); render();
    }
    async function deleteQuestion(id) {
        if (!confirm('حذف هذا السؤال؟')) return;
        await DB.del('questions', id); render();
    }

    async function renderMatch(c) {
        const [teams, settings] = await Promise.all([DB.getAll('teams'), DB.getSettings()]);
        if (teams.length < 2) {
            c.innerHTML = '<p class="empty-msg">تحتاج فريقين على الأقل لبدء المباراة.</p>'; return;
        }
        c.innerHTML = `
            <div class="settings-form">
                <h3>🎮 إعدادات المباراة</h3>
                <div class="form-group"><label>الفريق الأول (يسار الشاشة)</label>
                    <select id="matchTeamA" class="input"><option value="">-- اختر فريق --</option>
                        ${teams.map(t => `<option value="${t.id}" ${settings.teamA === t.id ? 'selected' : ''}>${escapeHTML(t.name)}</option>`).join('')}
                    </select>
                </div>
                <div class="form-group"><label>الفريق الثاني (يمين الشاشة)</label>
                    <select id="matchTeamB" class="input"><option value="">-- اختر فريق --</option>
                        ${teams.map(t => `<option value="${t.id}" ${settings.teamB === t.id ? 'selected' : ''}>${escapeHTML(t.name)}</option>`).join('')}
                    </select>
                </div>
                <div class="form-group"><label>مدة السؤال (ثانية)</label><input type="number" id="matchTimer" class="input" value="${settings.timerSeconds || 20}" min="5" max="120"></div>
                <div class="form-group"><label>نقاط الإجابة الصحيحة (افتراضي للسؤال)</label><input type="number" id="matchPoints" class="input" value="${settings.pointsPerCorrect || 10}" min="1"></div>
                <button class="btn-primary" onclick="Settings.saveMatch()">💾 حفظ الإعدادات</button>
            </div>`;
    }
    async function saveMatch() {
        const teamA = document.getElementById('matchTeamA').value;
        const teamB = document.getElementById('matchTeamB').value;
        if (!teamA || !teamB) return alert('يجب اختيار الفريقين');
        if (teamA === teamB) return alert('لا يمكن اختيار نفس الفريق مرتين');
        await DB.saveSettings({
            timerSeconds: parseInt(document.getElementById('matchTimer').value) || 20,
            pointsPerCorrect: parseInt(document.getElementById('matchPoints').value) || 10,
            teamA, teamB
        });
        alert('✅ تم حفظ إعدادات المباراة');
    }

    async function renderDatabase(c) {
        const [teams, players, questions, matches] = await Promise.all([
            DB.getAll('teams'), DB.getAll('players'), DB.getAll('questions'), DB.getAll('matches')
        ]);
        c.innerHTML = `
            <div class="settings-form">
                <h3>💾 إدارة قاعدة البيانات</h3>
                <div class="stats-grid">
                    <div class="stat-box"><span class="stat-num">${teams.length}</span><span>فرق</span></div>
                    <div class="stat-box"><span class="stat-num">${players.length}</span><span>لاعبين</span></div>
                    <div class="stat-box"><span class="stat-num">${questions.length}</span><span>أسئلة</span></div>
                    <div class="stat-box"><span class="stat-num">${matches.length}</span><span>ماتشات</span></div>
                </div>
                <hr style="border-color:#1a3b75; margin: 20px 0;">
                <div class="db-actions">
                    <button class="btn-primary" onclick="Settings.exportDB()">📤 تصدير قاعدة البيانات (JSON)</button>
                    <button class="btn-primary" onclick="document.getElementById('importFile').click()">📥 استيراد قاعدة البيانات</button>
                    <input type="file" id="importFile" accept=".json" style="display:none" onchange="Settings.importDB(event)">
                    <button class="btn-danger" onclick="Settings.resetDB()">🗑 مسح كل البيانات وإعادة البدء</button>
                </div>
                <p class="hint" style="margin-top:20px">💡 نصيحة: استخدم "تصدير" بانتظام لحفظ نسخة احتياطية.</p>
            </div>`;
    }
    async function exportDB() {
        const data = await DB.exportAll();
        downloadJSON(data, `quizmaster-db-${new Date().toISOString().slice(0,10)}.json`);
    }
    async function importDB(e) {
        const file = e.target.files[0]; if (!file) return;
        if (!confirm('سيتم استبدال كل البيانات الحالية. متأكد؟')) return;
        try {
            const data = JSON.parse(await file.text());
            await DB.importAll(data);
            alert('✅ تم استيراد البيانات'); render();
        } catch (err) { alert('❌ خطأ: ' + err.message); }
    }
    async function resetDB() {
        if (!confirm('⚠️ سيتم مسح كل البيانات نهائياً. متأكد؟')) return;
        if (!confirm('تأكيد أخير: كل شيء سيُمسح!')) return;
        await DB.resetAll(); alert('✅ تم إعادة التعيين'); render();
    }

    return { init, render, editTeam, saveTeam, deleteTeam, editPlayer, savePlayer, deletePlayer, editQuestion, saveQuestion, deleteQuestion, saveMatch, exportDB, importDB, resetDB };
})();

// ============ STATS ============
const Stats = (() => {
    async function render(c) {
        const [teams, players] = await Promise.all([DB.getAll('teams'), DB.getAll('players')]);
        if (teams.length === 0) {
            c.innerHTML = '<p class="empty-msg">لا توجد فرق بعد. أضف فرقاً أولاً.</p>'; return;
        }
        c.innerHTML = `
            <div class="settings-form" style="max-width:100%">
                <h3>📊 البيانات والإحصائيات</h3>
                <p class="hint">اختر فريقاً لعرض لاعبيه، ثم اضغط على لاعب لعرض ملفه الشخصي وإحصائياته الكاملة.</p>
                <div class="stats-tree">
                    ${teams.map(t => {
                        const teamPlayers = players.filter(p => p.teamId === t.id);
                        return `
                            <div class="stats-team" id="stats-team-${t.id}">
                                <div class="stats-team-header" onclick="Stats.toggleTeam('${t.id}')">
                                    ${t.logo ? `<img src="${t.logo}">` : '<span style="font-size:2rem">🏆</span>'}
                                    <span>${escapeHTML(t.name)}</span>
                                    <span style="color:#4da6ff;font-size:0.9rem">${teamPlayers.length} لاعب</span>
                                    <span class="toggle-icon">▼</span>
                                </div>
                                <div class="stats-team-players" id="team-players-${t.id}" style="display:none">
                                    ${teamPlayers.length === 0 ? '<p class="hint">لا يوجد لاعبون</p>' : ''}
                                    ${teamPlayers.map(p => `
                                        <div class="stats-player-item" onclick="Stats.showPlayer('${p.id}')">
                                            ${p.img ? `<img src="${p.img}">` : '<span style="font-size:1.5rem">👤</span>'}
                                            <span>${escapeHTML(p.name)}</span>
                                            <span style="color:#cda052;font-size:0.85rem">اضغط لعرض الملف</span>
                                        </div>`).join('')}
                                </div>
                            </div>`;
                    }).join('')}
                </div>
            </div>`;
    }

    function toggleTeam(teamId) {
        const el = document.getElementById('stats-team-' + teamId);
        const body = document.getElementById('team-players-' + teamId);
        if (!el || !body) return;
        const expanded = el.classList.toggle('expanded');
        body.style.display = expanded ? 'flex' : 'none';
    }

    async function showPlayer(playerId) {
        const player = await DB.get('players', playerId);
        if (!player) return;
        const team = await DB.get('teams', player.teamId);
        const matches = await DB.getAll('matches');

        let totalPoints = 0, totalCorrect = 0, totalWrong = 0;
        const history = [];

        for (const match of matches) {
            let mPoints = 0, mCorrect = 0, mWrong = 0;
            let participated = false;
            for (const e of match.events || []) {
                if (e.data && e.data.playerId === playerId) {
                    participated = true;
                    if (e.type === 'correct') { mPoints += (e.data.points || 0); mCorrect++; }
                    if (e.type === 'wrong') { mWrong++; }
                }
            }
            if (participated) {
                totalPoints += mPoints;
                totalCorrect += mCorrect;
                totalWrong += mWrong;
                history.push({ date: match.date, points: mPoints, correct: mCorrect, wrong: mWrong });
            }
        }
        history.sort((a, b) => new Date(b.date) - new Date(a.date));

        const html = `
            <div class="player-profile">
                <div class="pp-header">
                    ${player.img ? `<img src="${player.img}">` : '<div style="width:100px;height:100px;border-radius:50%;background:#020b1a;display:flex;align-items:center;justify-content:center;font-size:3rem">👤</div>'}
                    <div>
                        <div class="pp-name">${escapeHTML(player.name)}</div>
                        <div class="pp-team">${escapeHTML(team?.name || '—')}</div>
                    </div>
                </div>
                <div class="pp-stats">
                    <div class="pp-stat-card">
                        <div class="pp-stat-num gold">${totalPoints}</div>
                        <div class="pp-stat-label">إجمالي النقاط</div>
                    </div>
                    <div class="pp-stat-card">
                        <div class="pp-stat-num green">${totalCorrect}</div>
                        <div class="pp-stat-label">إجابات صحيحة</div>
                    </div>
                    <div class="pp-stat-card">
                        <div class="pp-stat-num red">${totalWrong}</div>
                        <div class="pp-stat-label">إجابات خاطئة</div>
                    </div>
                </div>
                <div class="pp-history-title">📜 سجل المباريات (${history.length})</div>
                <div class="pp-history">
                    ${history.length === 0 ? '<p class="hint">لم يشارك في أي مباراة بعد</p>' : ''}
                    ${history.map(h => `
                        <div class="pp-match-item">
                            <span class="pm-date">${new Date(h.date).toLocaleString('ar-EG')}</span>
                            <div class="pm-stats">
                                <span class="pm-points">⭐ ${h.points}</span>
                                <span class="pm-correct">✅ ${h.correct}</span>
                                <span class="pm-wrong">❌ ${h.wrong}</span>
                            </div>
                        </div>`).join('')}
                </div>
            </div>`;
        Admin.showModal('ملف اللاعب', html, '<button class="btn-secondary" onclick="Admin.closeModal()">إغلاق</button>');
    }

    return { render, toggleTeam, showPlayer };
})();

// ============ HISTORY ============
const History = (() => {
    async function render() {
        const c = document.getElementById('historyContent');
        const matches = await DB.getAll('matches');
        matches.sort((a, b) => new Date(b.date) - new Date(a.date));
        if (matches.length === 0) {
            c.innerHTML = '<p class="empty-msg">لا توجد مباريات مسجلة بعد.</p>'; return;
        }
        c.innerHTML = `
            <div class="matches-list">
                ${matches.map(m => `
                    <div class="match-card" onclick="History.showMatch('${m.id}')">
                        <div class="match-header">
                            <span class="match-date">${new Date(m.date).toLocaleString('ar-EG')}</span>
                            <span class="match-duration">⏱ ${formatDuration(m.duration)}</span>
                        </div>
                        <div class="match-teams">
                            <div class="mt ${m.winner === m.teamA.id ? 'winner' : ''}">
                                ${m.teamA.logo ? `<img src="${m.teamA.logo}">` : '🏆'}
                                <span>${escapeHTML(m.teamA.name)}</span>
                            </div>
                            <div class="match-score">${m.finalScores[m.teamA.id]} - ${m.finalScores[m.teamB.id]}</div>
                            <div class="mt ${m.winner === m.teamB.id ? 'winner' : ''}">
                                ${m.teamB.logo ? `<img src="${m.teamB.logo}">` : '🏆'}
                                <span>${escapeHTML(m.teamB.name)}</span>
                            </div>
                        </div>
                    </div>`).join('')}
            </div>`;
    }
    function formatDuration(sec) { return `${Math.floor(sec / 60)}د ${sec % 60}ث`; }
    async function showMatch(id) {
        const m = await DB.get('matches', id);
        if (!m) return;
        const eventsHTML = m.events.map(e => {
            const time = new Date(e.timestamp).toLocaleTimeString('ar-EG');
            switch (e.type) {
                case 'question_start': return `<div class="ev q-start">❓ [${time}] بدأ السؤال: "${escapeHTML(e.data.questionText)}"</div>`;
                case 'buzz': return `<div class="ev buzz">🔔 [${time}] ${escapeHTML(e.data.playerName)} (${escapeHTML(e.data.teamName)}) ضغط البازر</div>`;
                case 'correct': return `<div class="ev correct">✅ [${time}] ${escapeHTML(e.data.playerName)} أجاب صحيح! +${e.data.points} نقاط</div>`;
                case 'wrong': return `<div class="ev wrong">❌ [${time}] ${escapeHTML(e.data.playerName)} أجاب خطأ</div>`;
                case 'timeout': return `<div class="ev timeout">⏰ [${time}] انتهى وقت السؤال</div>`;
                case 'reveal': return `<div class="ev reveal">🎯 [${time}] تم كشف الإجابة الصحيحة</div>`;
                case 'question_end': return `<div class="ev q-end">📌 [${time}] انتهى السؤال</div>`;
                default: return `<div class="ev">[${time}] ${e.type}</div>`;
            }
        }).join('');
        const html = `
            <div class="match-details">
                <div class="md-teams">
                    <div><strong>${escapeHTML(m.teamA.name)}</strong>: ${m.finalScores[m.teamA.id]}</div>
                    <div><strong>${escapeHTML(m.teamB.name)}</strong>: ${m.finalScores[m.teamB.id]}</div>
                </div>
                <h4>📝 الأحداث (${m.events.length}):</h4>
                <div class="events-log">${eventsHTML}</div>
            </div>`;
        Admin.showModal('تفاصيل المباراة', html, '<button class="btn-secondary" onclick="Admin.closeModal()">إغلاق</button>');
    }
    return { render, showMatch };
})();