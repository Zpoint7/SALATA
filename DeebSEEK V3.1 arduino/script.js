const Competition = (() => {
    const S = {
        teamA: null, teamB: null,
        players: {}, buzzerMap: {},
        questions: [], currentQ: 0,
        scores: {}, settings: {},
        activePlayer: null,
        isLocked: false, isTyping: false, textRevealed: false,
        isTimerRunning: false, timerInterval: null, timeLeft: 20,
        matchStartTime: null, matchTimerInterval: null,
        events: [], running: false,
        wrongPlayers: new Set(),
        lockedTeams: new Set(),
        awaitingNext: false,
        allQuestionsDone: false,
        currentMatchId: null
    };

    let revealTimeout = null;

    const sounds = {
        buzzer: new Audio('sounds/buzzer.mp3'),
        correct: new Audio('sounds/correct.mp3'),
        wrong: new Audio('sounds/wrong.mp3'),
        applause: new Audio('sounds/applause.mp3'),
        tick: new Audio('sounds/tick.mp3')
    };
    const play = name => { try { sounds[name].currentTime = 0; sounds[name].play().catch(()=>{}); } catch(e){} };

    const els = {
        question: () => document.getElementById('questionText'),
        opts: () => ({
            optA: document.getElementById('optA'),
            optB: document.getElementById('optB'),
            optC: document.getElementById('optC'),
            optD: document.getElementById('optD')
        }),
        timerContainer: () => document.getElementById('timerContainer'),
        timerText: () => document.getElementById('timerText'),
        timerCircle: () => document.getElementById('timerCircle'),
        flash: () => document.getElementById('flashOverlay'),
        particles: () => document.getElementById('particles-container'),
        scene: () => document.getElementById('cameraScene')
    };

    const getTeamName = teamId => teamId === S.teamA?.id ? S.teamA.name : (teamId === S.teamB?.id ? S.teamB.name : '');

    async function init() {
        const settings = await DB.getSettings();
        if (!settings.teamA || !settings.teamB) {
            alert('⚠️ الرجاء اختيار الفريقين من الإعدادات أولاً');
            Admin.openSettings(); return false;
        }
        const allTeams = await DB.getAll('teams');
        const teamA = allTeams.find(t => t.id === settings.teamA);
        const teamB = allTeams.find(t => t.id === settings.teamB);
        if (!teamA || !teamB) { alert('الفريقان غير موجودين'); return false; }

        const allPlayers = await DB.getAll('players');
        const players = {}, buzzerMap = {};
        allPlayers.forEach(p => {
            if (p.teamId === teamA.id || p.teamId === teamB.id) {
                players[p.id] = p;
                if (p.buzzerKey) buzzerMap[p.buzzerKey] = p.id;
            }
        });
        const questions = await DB.getAll('questions');
        if (questions.length === 0) { alert('لا توجد أسئلة. أضف أسئلة أولاً.'); return false; }

        Object.assign(S, {
            teamA, teamB, players, buzzerMap, questions,
            currentQ: 0,
            scores: { [teamA.id]: 0, [teamB.id]: 0 },
            settings: { timerSeconds: settings.timerSeconds || 20, pointsPerCorrect: settings.pointsPerCorrect || 10 },
            events: [], running: true,
            activePlayer: null, isLocked: false, isTyping: false,
            textRevealed: false, isTimerRunning: false,
            timeLeft: settings.timerSeconds || 20,
            wrongPlayers: new Set(), lockedTeams: new Set(),
            awaitingNext: false, allQuestionsDone: false, currentMatchId: null
        });

        document.getElementById('logoLeft').src = teamA.logo || '';
        document.getElementById('nameLeftTeam').innerText = teamA.name;
        document.getElementById('scoreLeft').innerText = '0';
        document.getElementById('logoRight').src = teamB.logo || '';
        document.getElementById('nameRightTeam').innerText = teamB.name;
        document.getElementById('scoreRight').innerText = '0';
        document.getElementById('questionCounter').innerText = `سؤال 1 / ${questions.length}`;
        document.getElementById('matchTimer').innerText = '00:00';

        document.body.classList.remove('buzzed-left', 'buzzed-right', 'cinematic-mode', 'cinematic-zoom');
        document.getElementById('logoLeft').classList.remove('glowing');
        document.getElementById('logoRight').classList.remove('glowing');
        clearBoard();
        resetTimerVisuals();

        S.matchStartTime = Date.now();
        logEvent('match_start', { teamA: teamA.name, teamB: teamB.name });
        return true;
    }

    function start() {
        if (S.matchTimerInterval) clearInterval(S.matchTimerInterval);
        S.matchTimerInterval = setInterval(() => {
            if (!S.matchStartTime) return;
            const elapsed = Math.floor((Date.now() - S.matchStartTime) / 1000);
            document.getElementById('matchTimer').innerText = formatTime(elapsed);
        }, 1000);
        enterWaitingState();
    }

    const isRunning = () => S.running;
    const formatTime = sec => `${String(Math.floor(sec / 60)).padStart(2,'0')}:${String(sec % 60).padStart(2,'0')}`;

    function logEvent(type, data) { S.events.push({ type, data: data || {}, timestamp: Date.now() }); }

    // ============ WAITING STATE ============
    function enterWaitingState() {
        clearInterval(S.timerInterval);
        if (revealTimeout) { clearTimeout(revealTimeout); revealTimeout = null; }
        S.isTimerRunning = false;
        S.isLocked = false;
        S.activePlayer = null;
        S.isTyping = false;
        S.textRevealed = false;
        S.awaitingNext = false;
        S.wrongPlayers = new Set();
        S.lockedTeams = new Set();
        S.timeLeft = S.settings.timerSeconds;

        resetLayout();
        document.body.classList.remove('cinematic-mode', 'cinematic-zoom');

        const qbox = els.question();
        qbox.classList.add('show-box', 'waiting-state');
        qbox.innerHTML = '<span class="waiting-text">🎯 اضغط مسطرة لبدء السؤال</span>';

        Object.values(els.opts()).forEach(el => {
            el.innerText = '';
            el.classList.remove('show-opt', 'correct-glow', 'animating-opt');
        });

        resetTimerVisuals();
        document.getElementById('questionCounter').innerText =
            `سؤال ${Math.min(S.currentQ + 1, S.questions.length)} / ${S.questions.length}`;
    }

    function showAllQuestionsDoneMessage() {
        resetLayout();
        document.body.classList.remove('cinematic-mode', 'cinematic-zoom');

        const qbox = els.question();
        qbox.classList.add('show-box', 'waiting-state');
        qbox.innerHTML = '<span class="waiting-text">🏆 انتهت الأسئلة! اضغط مسطرة لإعلان الفائز</span>';

        Object.values(els.opts()).forEach(el => {
            el.innerText = '';
            el.classList.remove('show-opt', 'correct-glow', 'animating-opt');
        });

        resetTimerVisuals();
        els.timerText().innerText = '✓';
        els.timerCircle().style.strokeDashoffset = 628;
        els.timerText().style.color = '#ffd700';
        els.timerText().style.textShadow = '0 0 30px #ffd700';
    }

    // ============ QUESTION ============
    async function startQuestionRound() {
        if (S.isTyping || S.textRevealed) return;
        if (S.currentQ >= S.questions.length) { showAllQuestionsDoneMessage(); return; }

        const qbox = els.question();
        qbox.classList.remove('waiting-state');
        qbox.innerHTML = '';
        S.isTyping = true;

        const q = S.questions[S.currentQ];
        logEvent('question_start', { questionId: q.id, questionText: q.text, options: q.options, correctAnswer: q.correctAnswer });
        document.getElementById('questionCounter').innerText = `سؤال ${S.currentQ + 1} / ${S.questions.length}`;

        document.body.classList.add('cinematic-mode', 'cinematic-zoom');
        await sleep(300);
        qbox.classList.add('show-box');
        await sleep(200);
        await typeWriter(qbox, q.text, 10);

        const optMap = ['optA', 'optB', 'optC', 'optD'];
        for (let i = 0; i < optMap.length; i++) {
            const k = optMap[i];
            const el = els.opts()[k];
            el.classList.add('show-opt');
            await typeWriter(el, q.options[k], 8);
            if (i < optMap.length - 1) await sleep(150);
        }

        S.textRevealed = true;
        S.isTyping = false;
        startTimerLogic();
    }

    const sleep = ms => new Promise(r => setTimeout(r, ms));
    async function typeWriter(el, text, speed) {
        el.innerText = '';
        for (let i = 0; i < text.length; i++) {
            el.innerText += text.charAt(i);
            await sleep(speed);
        }
    }

    // ============ TIMER ============
    function startTimerLogic() {
        S.isTimerRunning = true;
        updateTimer();
        bounce();
        S.timerInterval = setInterval(() => {
            S.timeLeft--;
            updateTimer();
            bounce();
            if (S.timeLeft <= 5 && S.timeLeft > 0) {
                play('tick');
                els.timerContainer().classList.add('danger-mode');
                els.timerCircle().classList.add('danger-mode');
            } else if (S.timeLeft <= 0) {
                clearInterval(S.timerInterval);
                S.isTimerRunning = false;
                els.timerContainer().classList.remove('danger-mode');
                els.timerCircle().classList.remove('danger-mode');
                resetTimerVisualsToRed();
                logEvent('timeout', {});
                // Timeout → reveal correct, wait for manual next
                revealCorrectAndWait();
            }
        }, 1000);
    }

    function updateTimer() {
        els.timerText().innerText = S.timeLeft;
        const total = S.settings.timerSeconds;
        const offset = 628 - (S.timeLeft / total) * 628;
        els.timerCircle().style.strokeDashoffset = offset;
        let color = '#4da6ff';
        if (S.timeLeft <= total * 0.75 && S.timeLeft > total * 0.5) color = '#00ced1';
        else if (S.timeLeft <= total * 0.5 && S.timeLeft > total * 0.25) color = '#ffcc00';
        else if (S.timeLeft <= total * 0.25 && S.timeLeft > 0) color = '#ff6600';
        else if (S.timeLeft === 0) color = '#ff0000';
        if (S.timeLeft > 0) {
            els.timerCircle().style.stroke = color;
            els.timerCircle().style.filter = `drop-shadow(0 0 15px ${color})`;
            els.timerText().style.color = '#ffffff';
            els.timerText().style.textShadow = `0 0 20px ${color}`;
        }
    }
    function bounce() { const t = els.timerText(); t.classList.remove('bounce'); void t.offsetWidth; t.classList.add('bounce'); }
    function resetTimerVisualsToRed() {
        els.timerCircle().style.stroke = '#ff0000';
        els.timerCircle().style.filter = 'drop-shadow(0 0 20px #ff0000)';
        els.timerText().style.color = '#ff0000';
        els.timerText().style.textShadow = '0 0 25px #ff0000';
    }
    function resetTimerVisuals() {
        els.timerText().innerText = S.settings.timerSeconds || 20;
        els.timerText().style.color = '#fff';
        els.timerText().style.textShadow = '0 0 20px #4da6ff';
        els.timerCircle().style.stroke = '#4da6ff';
        els.timerCircle().style.filter = 'drop-shadow(0 0 10px #4da6ff)';
        els.timerCircle().style.strokeDashoffset = 0;
        els.timerContainer().classList.remove('danger-mode');
        els.timerCircle().classList.remove('danger-mode');
    }

    // ============ BUZZER ============
    function playerPressed(key) {
        if (!S.textRevealed) return;
        if (S.activePlayer) return;
        if (S.isLocked) return;
        if (!S.isTimerRunning && !S.awaitingNext) return;

        const playerId = S.buzzerMap[key];
        if (!playerId) return;
        const player = S.players[playerId];
        if (!player) return;
        if (S.wrongPlayers.has(player.id)) return;
        if (S.lockedTeams.has(player.teamId)) return;

        S.activePlayer = player;
        S.isLocked = true;
        if (S.isTimerRunning) {
            clearInterval(S.timerInterval);
            S.isTimerRunning = false;
        }
        els.timerContainer().classList.remove('danger-mode');
        els.timerCircle().classList.remove('danger-mode');

        play('buzzer');
        cameraShake();
        flash('rgba(255,255,255,0.2)');

        const isTeamA = player.teamId === S.teamA.id;
        const side = isTeamA ? 'left' : 'right';
        document.body.classList.add('buzzed-' + side);
        const logo = document.getElementById('logo' + (isTeamA ? 'Left' : 'Right'));
        const img = document.getElementById('img' + (isTeamA ? 'Left' : 'Right'));
        const name = document.getElementById('name' + (isTeamA ? 'Left' : 'Right'));
        logo.classList.add('glowing');
        img.src = player.img || '';
        name.innerText = player.name;

        logEvent('buzz', {
            playerId: player.id, playerName: player.name,
            teamId: player.teamId, teamName: getTeamName(player.teamId)
        });
        createExplosion('logo' + (isTeamA ? 'Left' : 'Right'), '#4da6ff');
    }

    // ============ ANSWERS ============
    function correctAnswer() {
        if (!S.activePlayer || !S.isLocked) return;
        const q = S.questions[S.currentQ];
        const correctEl = els.opts()[q.correctAnswer];
        if (correctEl) correctEl.classList.add('correct-glow');

        flash('rgba(0,255,0,0.3)');
        play('correct');
        setTimeout(() => play('applause'), 600);

        const teamId = S.activePlayer.teamId;
        const points = q.points || S.settings.pointsPerCorrect;
        S.scores[teamId] += points;

        const isA = teamId === S.teamA.id;
        const scoreId = isA ? 'scoreLeft' : 'scoreRight';
        const boxId = isA ? 'scoreBoxLeft' : 'scoreBoxRight';
        const flyerId = isA ? 'flyerLeft' : 'flyerRight';
        document.getElementById(scoreId).innerText = S.scores[teamId];
        const flyer = document.getElementById(flyerId);
        const box = document.getElementById(boxId);
        flyer.innerText = '+' + points;
        flyer.classList.add('fly-up-animation');
        box.classList.add('shake-animation');
        scoreParticles(box);

        logEvent('correct', {
            playerId: S.activePlayer.id, playerName: S.activePlayer.name,
            teamId: teamId, teamName: getTeamName(teamId), points
        });

        revealTimeout = setTimeout(() => {
            flyer.classList.remove('fly-up-animation');
            box.classList.remove('shake-animation');
            advanceToNext();
        }, 5000);
    }

    function wrongAnswer() {
        if (!S.activePlayer || !S.isLocked) return;
        flash('rgba(255,0,0,0.4)');
        play('wrong');

        const wrongPlayer = S.activePlayer;
        S.wrongPlayers.add(wrongPlayer.id);
        S.lockedTeams.add(wrongPlayer.teamId);

        logEvent('wrong', {
            playerId: wrongPlayer.id, playerName: wrongPlayer.name,
            teamId: wrongPlayer.teamId, teamName: getTeamName(wrongPlayer.teamId), points: 0
        });

        const otherTeamId = wrongPlayer.teamId === S.teamA.id ? S.teamB.id : S.teamA.id;
        const otherTeamLocked = S.lockedTeams.has(otherTeamId);

        setTimeout(() => {
            resetLayout();
            S.activePlayer = null;
            S.isLocked = false;

            if (!otherTeamLocked && S.timeLeft > 0) {
                resumeTimerAfterWrong();
            } else {
                revealCorrectAndWait();
            }
        }, 1500);
    }

    function resumeTimerAfterWrong() {
        S.isTimerRunning = true;
        S.isLocked = false;
        S.timerInterval = setInterval(() => {
            S.timeLeft--;
            updateTimer();
            bounce();
            if (S.timeLeft <= 5 && S.timeLeft > 0) {
                play('tick');
                els.timerContainer().classList.add('danger-mode');
                els.timerCircle().classList.add('danger-mode');
            } else if (S.timeLeft <= 0) {
                clearInterval(S.timerInterval);
                S.isTimerRunning = false;
                els.timerContainer().classList.remove('danger-mode');
                els.timerCircle().classList.remove('danger-mode');
                resetTimerVisualsToRed();
                logEvent('timeout', {});
                revealCorrectAndWait();
            }
        }, 1000);
    }

    function revealCorrectAndWait() {
        clearInterval(S.timerInterval);
        S.isTimerRunning = false;
        S.textRevealed = false;
        S.awaitingNext = true;
        els.timerContainer().classList.remove('danger-mode');
        els.timerCircle().classList.remove('danger-mode');

        const q = S.questions[S.currentQ];
        const correctEl = els.opts()[q.correctAnswer];
        if (correctEl) correctEl.classList.add('correct-glow');

        logEvent('reveal', { questionId: q.id, correctAnswer: q.correctAnswer });
    }

    function advanceToNext() {
        if (revealTimeout) { clearTimeout(revealTimeout); revealTimeout = null; }
        logEvent('question_end', {});

        S.activePlayer = null;
        S.isLocked = false;
        S.textRevealed = false;
        S.isTyping = false;
        S.awaitingNext = false;
        S.wrongPlayers = new Set();
        S.lockedTeams = new Set();
        S.currentQ++;

        if (S.currentQ >= S.questions.length) {
            S.allQuestionsDone = true;
            finishMatch();
            showAllQuestionsDoneMessage();
            return;
        }
        enterWaitingState();
    }

    function clearBoard() {
        els.question().innerText = '';
        els.question().classList.remove('show-box', 'waiting-state');
        Object.values(els.opts()).forEach(el => {
            el.innerText = '';
            el.classList.remove('show-opt', 'correct-glow', 'animating-opt');
        });
    }
    function resetLayout() {
        document.body.classList.remove('buzzed-left', 'buzzed-right', 'cinematic-zoom');
        document.getElementById('logoLeft').classList.remove('glowing');
        document.getElementById('logoRight').classList.remove('glowing');
        Object.values(els.opts()).forEach(el => el.classList.remove('correct-glow', 'animating-opt'));
    }

    function resetRound() {
        if (revealTimeout) { clearTimeout(revealTimeout); revealTimeout = null; }
        clearInterval(S.timerInterval);
        S.isTimerRunning = false; S.isLocked = false; S.activePlayer = null;
        S.isTyping = false; S.textRevealed = false; S.timeLeft = S.settings.timerSeconds;
        S.wrongPlayers = new Set(); S.lockedTeams = new Set();
        S.awaitingNext = false;
        resetLayout();
        clearBoard();
        resetTimerVisuals();
        document.body.classList.remove('cinematic-mode', 'cinematic-zoom');
        setTimeout(() => {
            if (S.running && S.currentQ < S.questions.length && !S.allQuestionsDone) {
                startQuestionRound();
            }
        }, 300);
    }

    function nextQuestion() {
        if (S.allQuestionsDone) { showWinnerReveal(); return; }
        if (S.awaitingNext) { advanceToNext(); return; }
        if (revealTimeout) { clearTimeout(revealTimeout); revealTimeout = null; }
        if (S.currentQ >= S.questions.length - 1) {
            advanceToNext();
            return;
        }
        S.currentQ++;
        resetForNextQuestion();
    }

    function resetForNextQuestion() {
        clearInterval(S.timerInterval);
        S.isTimerRunning = false; S.isLocked = false; S.activePlayer = null;
        S.isTyping = false; S.textRevealed = false; S.awaitingNext = false;
        S.timeLeft = S.settings.timerSeconds;
        S.wrongPlayers = new Set(); S.lockedTeams = new Set();
        resetLayout();
        clearBoard();
        enterWaitingState();
    }

    function handleSpace() {
        if (!S.running) return;
        if (S.allQuestionsDone) { showWinnerReveal(); return; }
        if (S.awaitingNext) { advanceToNext(); return; }
        if (!S.isTyping && !S.textRevealed && !S.activePlayer && !S.isLocked) {
            startQuestionRound();
        }
    }

    // ============ MATCH END ============
    async function finishMatch() {
        if (!S.running) return null;
        if (S.matchTimerInterval) clearInterval(S.matchTimerInterval);
        const duration = Math.floor((Date.now() - S.matchStartTime) / 1000);
        const aId = S.teamA.id, bId = S.teamB.id;
        let winner = 'tie';
        if (S.scores[aId] > S.scores[bId]) winner = aId;
        else if (S.scores[bId] > S.scores[aId]) winner = bId;

        const match = {
            id: 'match_' + Date.now(),
            date: new Date().toISOString(),
            duration,
            teamA: S.teamA, teamB: S.teamB,
            finalScores: { ...S.scores },
            winner,
            questions: S.questions.map(q => ({ id: q.id, text: q.text, correctAnswer: q.correctAnswer, points: q.points })),
            events: S.events
        };
        try { await DB.put('matches', match); S.currentMatchId = match.id; }
        catch (e) { console.error('Save failed', e); }
        return match;
    }

    async function forceEndMatch() {
        if (!S.running) return;
        if (!confirm('هل تريد إنهاء المباراة وحفظ النتائج في السجل؟')) return;
        S.allQuestionsDone = true;
        await finishMatch();
        showWinnerReveal();
    }

    async function forceEndMatchSilent() {
        if (!S.running) return;
        S.allQuestionsDone = true;
        await finishMatch();
        S.running = false;
    }

    function showWinnerReveal() {
        const aId = S.teamA.id, bId = S.teamB.id;
        let winnerTeam, winnerId, winnerScore;

        if (S.scores[aId] > S.scores[bId]) { winnerTeam = S.teamA; winnerId = aId; winnerScore = S.scores[aId]; }
        else if (S.scores[bId] > S.scores[aId]) { winnerTeam = S.teamB; winnerId = bId; winnerScore = S.scores[bId]; }
        else {
            // Tie
            document.querySelector('.winner-title').innerText = '🤝 تعادل 🤝';
            document.getElementById('winnerMain').classList.add('tie');
            document.getElementById('winnerLogo').src = S.teamA.logo || '';
            document.getElementById('winnerName').innerText = `${S.teamA.name} & ${S.teamB.name}`;
            document.getElementById('winnerScore').innerText = `${S.scores[aId]} - ${S.scores[bId]}`;
            document.querySelector('.winner-players-title').innerText = '⭐ نجوم الفريقين ⭐';

            const playerStats = computePlayerStats();
            const allPlayers = Object.values(S.players);
            document.getElementById('winnerPlayers').innerHTML = allPlayers.map((p, i) => {
                const stats = playerStats[p.id] || { points: 0, correct: 0, wrong: 0 };
                const teamName = getTeamName(p.teamId);
                return `
                    <div class="winner-player-card" style="animation-delay:${i * 0.1}s">
                        ${p.img ? `<img src="${p.img}" alt="${p.name}">` : '<div style="width:120px;height:120px;border-radius:50%;background:#020b1a;display:flex;align-items:center;justify-content:center;font-size:3rem;border:3px solid #4da6ff">👤</div>'}
                        <div class="wp-name">${escapeHTML(p.name)}<br><small style="color:#cda052;font-size:0.8rem">${escapeHTML(teamName)}</small></div>
                        <div class="wp-stats">
                            <span>⭐ ${stats.points}</span>
                            <span>✅ ${stats.correct}</span>
                            <span>❌ ${stats.wrong}</span>
                        </div>
                    </div>`;
            }).join('');

            play('applause');
            Admin.showView('winner');
            setTimeout(() => { for (let i = 0; i < 5; i++) setTimeout(() => createExplosion('winnerLogo', ['#ffd700','#4da6ff','#cda052','#00ff66','#ff66cc'][i]), i * 300); }, 300);
            S.running = false;
            return;
        }

        document.querySelector('.winner-title').innerText = '🏆 الفائز 🏆';
        document.getElementById('winnerMain').classList.remove('tie');
        document.getElementById('winnerLogo').src = winnerTeam.logo || '';
        document.getElementById('winnerName').innerText = winnerTeam.name;
        document.getElementById('winnerScore').innerText = winnerScore;
        document.querySelector('.winner-players-title').innerText = '⭐ نجوم الفريق ⭐';

        const playerStats = computePlayerStats();
        const winnerPlayers = Object.values(S.players).filter(p => p.teamId === winnerId);
        document.getElementById('winnerPlayers').innerHTML = winnerPlayers.map((p, i) => {
            const stats = playerStats[p.id] || { points: 0, correct: 0, wrong: 0 };
            return `
                <div class="winner-player-card" style="animation-delay:${i * 0.15}s">
                    ${p.img ? `<img src="${p.img}" alt="${p.name}">` : '<div style="width:120px;height:120px;border-radius:50%;background:#020b1a;display:flex;align-items:center;justify-content:center;font-size:3rem;border:3px solid #4da6ff">👤</div>'}
                    <div class="wp-name">${escapeHTML(p.name)}</div>
                    <div class="wp-stats">
                        <span>⭐ ${stats.points}</span>
                        <span>✅ ${stats.correct}</span>
                        <span>❌ ${stats.wrong}</span>
                    </div>
                </div>`;
        }).join('');

        play('applause');
        Admin.showView('winner');
        setTimeout(() => {
            for (let i = 0; i < 5; i++) {
                setTimeout(() => createExplosion('winnerLogo', ['#ffd700','#4da6ff','#cda052','#00ff66','#ff66cc'][i]), i * 300);
            }
        }, 300);
        S.running = false;
    }

    function computePlayerStats() {
        const stats = {};
        S.events.forEach(e => {
            const pid = e.data?.playerId;
            if (!pid) return;
            if (!stats[pid]) stats[pid] = { points: 0, correct: 0, wrong: 0 };
            if (e.type === 'correct') { stats[pid].points += (e.data.points || 0); stats[pid].correct++; }
            else if (e.type === 'wrong') { stats[pid].wrong++; }
        });
        return stats;
    }

    // ============ EFFECTS ============
    function flash(color) {
        const f = els.flash();
        f.style.backgroundColor = color;
        f.style.opacity = '1';
        setTimeout(() => { f.style.opacity = '0'; }, 400);
    }
    function cameraShake() {
        const s = els.scene();
        s.classList.add('shake');
        setTimeout(() => s.classList.remove('shake'), 500);
    }
    function createExplosion(id, color) {
        const target = document.getElementById(id);
        if (!target) return;
        const rect = target.getBoundingClientRect();
        const cx = rect.left + rect.width / 2, cy = rect.top + rect.height / 2;
        const cont = els.particles();
        for (let i = 0; i < 3; i++) {
            setTimeout(() => {
                const rip = document.createElement('div');
                rip.className = 'ripple-effect';
                rip.style.left = cx + 'px'; rip.style.top = cy + 'px';
                rip.style.borderColor = color;
                cont.appendChild(rip);
                setTimeout(() => rip.remove(), 900);
            }, i * 150);
        }
        for (let i = 0; i < 50; i++) {
            const p = document.createElement('div');
            p.className = 'particle';
            const size = Math.random() * 14 + 6;
            p.style.width = size + 'px'; p.style.height = size + 'px';
            p.style.backgroundColor = color;
            p.style.boxShadow = `0 0 ${Math.random() * 20 + 8}px ${color}`;
            p.style.left = cx + 'px'; p.style.top = cy + 'px';
            const angle = Math.random() * Math.PI * 2;
            const dist = Math.random() * 250 + 80;
            const dx = Math.cos(angle) * dist, dy = Math.sin(angle) * dist;
            p.animate([
                { transform: 'translate(-50%, -50%) scale(1)', opacity: 1 },
                { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(0)`, opacity: 0 }
            ], { duration: Math.random() * 800 + 500, easing: 'cubic-bezier(0.25, 1, 0.5, 1)' });
            cont.appendChild(p);
            setTimeout(() => p.remove(), 1300);
        }
    }
    function scoreParticles(el) {
        const rect = el.getBoundingClientRect();
        const x = rect.left + rect.width / 2, y = rect.top + rect.height / 2;
        const cont = els.particles();
        for (let i = 0; i < 20; i++) {
            const p = document.createElement('div');
            p.className = 'particle';
            const size = Math.random() * 8 + 3;
            p.style.width = size + 'px'; p.style.height = size + 'px';
            p.style.backgroundColor = '#ffd700'; p.style.boxShadow = '0 0 10px #ffd700';
            p.style.left = x + 'px'; p.style.top = y + 'px';
            const angle = Math.random() * Math.PI * 2;
            const dist = Math.random() * 100 + 30;
            p.animate([
                { transform: 'translate(-50%, -50%)', opacity: 1 },
                { transform: `translate(calc(-50% + ${Math.cos(angle) * dist}px), calc(-50% + ${Math.sin(angle) * dist}px))`, opacity: 0 }
            ], { duration: 1000, easing: 'ease-out' });
            cont.appendChild(p);
            setTimeout(() => p.remove(), 1000);
        }
    }

    return {
        init, start, isRunning, playerPressed, correctAnswer, wrongAnswer,
        resetRound, nextQuestion, handleSpace,
        forceEndMatch, forceEndMatchSilent
    };
})();

// ============ AMBIENT PARTICLES ============
(function ambientParticles() {
    const cont = document.getElementById('ambient-particles');
    if (!cont) return;
    setInterval(() => {
        const p = document.createElement('div');
        p.className = 'ambient-dust';
        p.style.left = Math.random() * 100 + 'vw';
        p.style.top = '105vh';
        const size = Math.random() * 4 + 2;
        p.style.width = size + 'px'; p.style.height = size + 'px';
        const colors = ['#fff', '#ffd700', '#4da6ff', '#cda052'];
        p.style.background = colors[Math.floor(Math.random() * colors.length)];
        cont.appendChild(p);
        const dur = Math.random() * 10000 + 8000;
        const drift = (Math.random() - 0.5) * 200;
        p.animate([
            { transform: 'translateY(0) translateX(0)', opacity: 0 },
            { opacity: Math.random() * 0.5 + 0.1, offset: 0.15 },
            { opacity: Math.random() * 0.5 + 0.1, offset: 0.85 },
            { transform: `translateY(-110vh) translateX(${drift}px)`, opacity: 0 }
        ], { duration: dur, easing: 'linear' });
        setTimeout(() => p.remove(), dur);
    }, 300);
})();

// ============ IDLE ANIMATIONS ============
setInterval(() => {
    if (document.body.dataset.view !== 'competition') return;
    const opts = document.querySelectorAll('.option.show-opt');
    if (!opts.length) return;
    opts.forEach((opt, i) => {
        setTimeout(() => {
            opt.classList.add('animating-opt');
            setTimeout(() => opt.classList.remove('animating-opt'), 600);
        }, i * 400);
    });
}, 8000);

// ============ KEYBOARD / ARDUINO ============
document.addEventListener('keydown', (e) => {
    const tag = e.target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    if (document.body.dataset.view !== 'competition') return;
    const key = e.key.toLowerCase();

    if (key === ' ') {
        e.preventDefault();
        Competition.handleSpace();
    }
    else if (['1','2','3','4','5','6','7','8'].includes(key)) Competition.playerPressed(key);
    else if (key === 'c' || key === 'ؤ') Competition.correctAnswer();
    else if (key === 'x' || key === 'ء') Competition.wrongAnswer();
    else if (key === 'r' || key === 'ق') Competition.resetRound();
    else if (e.key === 'ArrowRight') Competition.nextQuestion();
});

// ============ INIT ============
window.addEventListener('load', async () => {
    const loading = document.getElementById('loadingOverlay');
    try {
        await DB.open();
        await DB.seedIfEmpty();
        Settings.init();
        loading.style.display = 'none';
    } catch (err) {
        console.error('DB Init failed:', err);
        loading.innerHTML = `<p style="color:#f66;text-align:center">فشل تحميل قاعدة البيانات<br>${err.message}<br><small>جرّب تشغيل الموقع عبر Live Server</small></p>`;
    }
});