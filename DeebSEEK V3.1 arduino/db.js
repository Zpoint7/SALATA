const DB = (() => {
    const NAME = 'quizmaster';
    const VERSION = 1;
    const STORES = ['teams', 'players', 'questions', 'matches', 'settings'];
    let db = null;

    async function open() {
        return new Promise((resolve, reject) => {
            const req = indexedDB.open(NAME, VERSION);
            req.onupgradeneeded = e => {
                const d = e.target.result;
                STORES.forEach(s => {
                    if (!d.objectStoreNames.contains(s)) d.createObjectStore(s, { keyPath: 'id' });
                });
            };
            req.onsuccess = () => { db = req.result; resolve(); };
            req.onerror = () => reject(req.error);
        });
    }
    const store = (name, mode = 'readonly') => db.transaction(name, mode).objectStore(name);
    const reqP = req => new Promise((res, rej) => { req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error); });
    const getAll = name => reqP(store(name).getAll());
    const get = (name, key) => reqP(store(name).get(key));
    const put = (name, val) => reqP(store(name, 'readwrite').put(val));
    const del = (name, key) => reqP(store(name, 'readwrite').delete(key));
    const clear = name => reqP(store(name, 'readwrite').clear());

    async function getSettings() {
        return (await get('settings', 'match')) || { id: 'match', timerSeconds: 20, pointsPerCorrect: 10, teamA: null, teamB: null };
    }
    async function saveSettings(s) { s.id = 'match'; return put('settings', s); }

    async function seedIfEmpty() {
        const teams = await getAll('teams');
        if (teams.length > 0) return;
        if (!window.gameData) return;
        const teamIds = Object.keys(gameData.teams);
        for (const id of teamIds) {
            const t = gameData.teams[id];
            await put('teams', { id, name: t.name, logo: t.logo });
        }
        for (const [id, p] of Object.entries(gameData.players)) {
            await put('players', { id, name: p.name, teamId: p.team, img: p.img, buzzerKey: id });
        }
        for (let i = 0; i < gameData.questions.length; i++) {
            const q = gameData.questions[i];
            await put('questions', {
                id: 'q' + (i + 1), text: q.text,
                options: { optA: q.optA, optB: q.optB, optC: q.optC, optD: q.optD },
                correctAnswer: q.correctAnswer, points: 10
            });
        }
        await saveSettings({ timerSeconds: 20, pointsPerCorrect: 10, teamA: teamIds[0] || null, teamB: teamIds[1] || null });
    }

    async function exportAll() {
        return {
            version: VERSION, exportedAt: new Date().toISOString(),
            teams: await getAll('teams'), players: await getAll('players'),
            questions: await getAll('questions'), matches: await getAll('matches'),
            settings: await getAll('settings')
        };
    }
    async function importAll(data) {
        for (const s of STORES) await clear(s);
        for (const t of data.teams || []) await put('teams', t);
        for (const p of data.players || []) await put('players', p);
        for (const q of data.questions || []) await put('questions', q);
        for (const m of data.matches || []) await put('matches', m);
        for (const st of data.settings || []) await put('settings', st);
    }
    async function resetAll() { for (const s of STORES) await clear(s); await seedIfEmpty(); }

    return { open, getAll, get, put, del, clear, getSettings, saveSettings, seedIfEmpty, exportAll, importAll, resetAll };
})();

function fileToDataURL(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}
function downloadJSON(data, filename) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    a.click(); URL.revokeObjectURL(url);
}
function escapeHTML(str) {
    const div = document.createElement('div');
    div.innerText = str || '';
    return div.innerHTML;
}