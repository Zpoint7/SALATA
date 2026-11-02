// ============================================
// Arduino Web Serial Connection (FIXED)
// ============================================

const Arduino = (() => {
    let port = null;
    let reader = null;
    let keepReading = false;
    let buffer = '';
    let connected = false;

    const supported = 'serial' in navigator;

    async function connect() {
        if (!supported) {
            alert('⚠️ متصفحك لا يدعم Web Serial API.\nاستخدم Google Chrome أو Microsoft Edge.');
            return false;
        }

        if (connected) {
            await disconnect();
            return false;
        }

        try {
            port = await navigator.serial.requestPort();
            await port.open({ baudRate: 9600 });
            connected = true;
            keepReading = true;
            buffer = '';
            updateUI(true);
            readLoop();
            console.log('✅ Arduino connected');
            return true;
        } catch (err) {
            if (err.name !== 'NotFoundError') {
                console.error('Arduino connect failed:', err);
                alert('فشل الاتصال بالأردوينو: ' + err.message);
            }
            connected = false;
            updateUI(false);
            return false;
        }
    }

    async function readLoop() {
        const decoder = new TextDecoder();
        while (keepReading && port && port.readable) {
            reader = port.readable.getReader();
            try {
                while (keepReading) {
                    const { value, done } = await reader.read();
                    if (done) break;
                    if (value) {
                        buffer += decoder.decode(value, { stream: true });
                        let nl;
                        while ((nl = buffer.indexOf('\n')) >= 0) {
                            const line = buffer.slice(0, nl).replace(/\r/g, '').trim();
                            buffer = buffer.slice(nl + 1);
                            if (line) handleLine(line);
                        }
                        if (buffer.length > 300) buffer = '';
                    }
                }
            } catch (err) {
                console.error('Arduino read error:', err);
            } finally {
                try { reader.releaseLock(); } catch (e) {}
                reader = null;
            }
        }
    }

    function handleLine(line) {
        if (line === 'READY') {
            console.log('🟢 Arduino READY');
            return;
        }

        // B1 → B8
        const m = line.match(/^B([1-8])$/);
        if (m) {
            console.log('🔘 Arduino Button Pressed:', m[1]); // ← لوج جديد للتشخيص

            if (document.body.dataset.view !== 'competition') {
                console.warn('⚠️ انت مش في شاشة المسابقة. روح ابدأ المسابقة الأول.');
                return;
            }

            // ✅ الحل: بنستخدم typeof مش window.Competition
            if (typeof Competition !== 'undefined' && Competition.playerPressed) {
                Competition.playerPressed(m[1]);
            } else {
                console.error('❌ Competition.playerPressed غير موجود!');
            }
            return;
        }

        console.log('Arduino:', line);
    }

    async function disconnect() {
        keepReading = false;
        try { if (reader) await reader.cancel(); } catch (e) {}
        try { if (port) await port.close(); } catch (e) {}
        port = null;
        reader = null;
        connected = false;
        buffer = '';
        updateUI(false);
        console.log('🔌 Arduino disconnected');
    }

    function updateUI(isConnected) {
        const dot = document.getElementById('arduinoDot');
        const text = document.getElementById('arduinoText');
        const btn = document.getElementById('arduinoBtn');
        const badge = document.getElementById('arduinoBadge');

        if (dot) dot.className = 'status-dot ' + (isConnected ? 'online' : 'offline');
        if (text) text.innerText = 'الأردوينو: ' + (isConnected ? 'متصل ✅' : 'غير متصل');
        if (btn) btn.innerText = isConnected ? '🔌 قطع الاتصال' : '🔌 اتصال الأردوينو';
        if (badge) badge.style.display = isConnected ? 'inline-flex' : 'none';
    }

    if (supported) {
        navigator.serial.addEventListener('disconnect', (e) => {
            if (port && e.target === port) {
                connected = false;
                keepReading = false;
                port = null;
                updateUI(false);
                alert('⚠️ تم فصل كابل الأردوينو — أوصله واضغط "اتصال" تاني');
            }
        });
    }

    return { connect, disconnect, supported };
})();