// --- КОНФИГУРАЦИЯ ---
const TILE = 40;
const ROWS = 20;
const COLS = 30;

// --- ОРУЖИЕ ---
const Weapons = {
    Melee: { name: 'Melee', dmg: 10, ammo: Infinity },
    Pistol: { name: 'Pistol', dmg: 25, ammo: 12 },
    Rifle: { name: 'Rifle', dmg: 40, ammo: 30 },
    Bazooka: { name: 'Bazooka', dmg: 150, ammo: 5 }
};

// --- МОЗГ (NEURAL NETWORK) ---
class Brain {
    constructor(inN, hidN, outN) {
        this.inN = inN; this.hidN = hidN; this.outN = outN;
        this.w1 = new Float32Array(inN * hidN).map(() => Math.random() * 2 - 1);
        this.w2 = new Float32Array(hidN * outN).map(() => Math.random() * 2 - 1);
    }
    predict(inputs) {
        let h = new Float32Array(this.hidN);
        for (let i = 0; i < this.hidN; i++) {
            let s = 0; for (let j = 0; j < this.inN; j++) s += inputs[j] * this.w1[i * this.inN + j];
            h[i] = Math.tanh(s);
        }
        let out = new Float32Array(this.outN);
        for (let i = 0; i < this.outN; i++) {
            let s = 0; for (let j = 0; j < this.hidN; j++) s += h[j] * this.w2[i * this.hidN + j];
            out[i] = Math.tanh(s);
        }
        return out;
    }
    clone() {
        let b = new Brain(this.inN, this.hidN, this.outN);
        b.w1.set(this.w1); b.w2.set(this.w2);
        return b;
    }
    mutate(rate) {
        const m = v => Math.random() < rate ? v + (Math.random() * 2 - 1) * 0.5 : v;
        this.w1 = this.w1.map(m); this.w2 = this.w2.map(m);
    }
}

// --- СУЩНОСТЬ ---
class Entity {
    constructor(x, y, isBot, brain) {
        this.x = x; this.y = y; this.rad = 15; this.hp = 100; this.dead = false;
        this.isBot = isBot; this.color = isBot ? '#ff4444' : '#4488ff';
        this.angle = Math.random() * 6.28;
        this.weapon = { ...Weapons.Melee };
        this.brain = brain || (isBot ? new Brain(9, 14, 4) : null);
        this.fitness = 0;
        this.rays = [];
    }

    update(game) {
        if (this.dead) return;
        this.fitness += 0.05;
        this.rays = [];

        // ЗАЩИТА ОТ ОШИБКИ: Если карта не загрузилась, не делаем логику
        if (!game.mapData) return;

        let mx = 0, my = 0, shoot = false;

        if (this.isBot) {
            // Сенсоры (5 лучей)
            let inputs = [];
            for (let a of [-0.8, -0.4, 0, 0.4, 0.8]) {
                let d = 0, max = 200;
                let dx = Math.cos(this.angle + a), dy = Math.sin(this.angle + a);
                for (let k = 0; k < max; k += 10) {
                    let c = Math.floor((this.x + dx * k) / TILE);
                    let r = Math.floor((this.y + dy * k) / TILE);
                    // Проверка границ и стен
                    if (c < 0 || c >= COLS || r < 0 || r >= ROWS || game.mapData[r * COLS + c]) { d = k; break; }
                    d = max;
                }
                inputs.push(d / max);
                this.rays.push(d);
            }

            let ne = game.findNearest(this, game.entities.filter(e => e !== this && !e.dead));
            let ni = game.findNearest(this, game.items);
            
            inputs.push(ne ? Math.atan2(ne.y - this.y, ne.x - this.x) / 3.14 : 0);
            inputs.push(ne ? Math.min(300, Math.hypot(ne.x - this.x, ne.y - this.y)) / 300 : 1);
            inputs.push(ni ? Math.atan2(ni.y - this.y, ni.x - this.x) / 3.14 : 0);
            inputs.push(this.weapon.name !== 'Melee' ? 1 : 0);

            let out = this.brain.predict(inputs);
            let speed = out[0] * 3;
            this.angle += out[1] * 0.15;
            mx = Math.cos(this.angle) * speed;
            my = Math.sin(this.angle) * speed;
            if (out[2] > 0.5) shoot = true;

        } else if (game.mode === 'pve') {
            if (game.keys['w']) my = -3; if (game.keys['s']) my = 3;
            if (game.keys['a']) mx = -3; if (game.keys['d']) mx = 3;
        }

        if (mx || my) {
            if (!game.isWall(this.x + mx, this.y + my)) {
                this.x += mx; this.y += my; this.fitness += 0.01;
            } else {
                this.fitness -= 0.1;
            }
        }

        if (shoot || (game.mode === 'pve' && !this.isBot && game.mouseDown)) {
            if (this.weapon.name === 'Melee') {
                game.entities.forEach(e => {
                    if (e !== this && !e.dead && Math.hypot(e.x - this.x, e.y - this.y) < 45) {
                        e.takeDamage(10, this);
                    }
                });
            } else if (this.weapon.ammo > 0) {
                this.weapon.ammo--;
                game.projectiles.push({
                    x: this.x, y: this.y,
                    vx: Math.cos(this.angle) * 12, vy: Math.sin(this.angle) * 12,
                    dmg: this.weapon.dmg, type: this.weapon.name, owner: this
                });
                if (this.weapon.ammo <= 0) this.weapon = { ...Weapons.Melee };
            }
        }

        game.items.forEach(it => {
            if (it.active && Math.hypot(this.x - it.x, this.y - it.y) < this.rad + 10) {
                it.active = false; this.fitness += 50;
                if (it.type.includes('pistol')) this.weapon = { ...Weapons.Pistol };
                if (it.type.includes('rifle')) this.weapon = { ...Weapons.Rifle };
                if (it.type.includes('bazooka')) this.weapon = { ...Weapons.Bazooka };
                if (it.type.includes('medkit')) this.hp = Math.min(100, this.hp + 50);
            }
        });
    }

    takeDamage(dmg, attacker) {
        this.hp -= dmg;
        if (this.hp <= 0) {
            this.hp = 0; this.dead = true;
            if (attacker && attacker.isBot) attacker.fitness += 100;
        }
    }
}

// --- ИГРОВОЙ ДВИЖОК ---
class Game {
    constructor() {
        this.cvs = document.getElementById('gameCanvas');
        this.ctx = this.cvs.getContext('2d');
        this.cvs.width = COLS * TILE;
        this.cvs.height = ROWS * TILE;

        this.mapData = new Array(ROWS * COLS).fill(0);
        this.mapObjects = [];

        this.entities = []; this.items = []; this.projectiles = [];
        this.keys = {}; this.mouseDown = false;
        this.running = false; this.editorOpen = false;
        this.speed = 1; this.gen = 1; this.timer = 0;
        this.bestBrain = null;

        this.setupEvents();
        this.loadLocal(); // Здесь был баг, теперь исправлен
    }

    setupEvents() {
        window.onkeydown = e => {
            this.keys[e.key.toLowerCase()] = true;
            if (e.key === 'e' || e.key === 'E') this.toggleEditor();
            if (e.key === '1') this.speed = 1;
            if (e.key === '2') this.speed = 10;
            if (e.key === '3') this.speed = 100;
        };
        window.onkeyup = e => this.keys[e.key.toLowerCase()] = false;
        this.cvs.onmousedown = e => { this.mouseDown = true; if (this.editorOpen) this.clickEditor(e); };
        this.cvs.onmouseup = () => this.mouseDown = false;
        this.cvs.onmousemove = e => {
            if (this.editorOpen && e.buttons === 1) this.clickEditor(e);
            if (this.mode === 'pve' && this.entities[0] && !this.entities[0].isBot) {
                let r = this.cvs.getBoundingClientRect();
                this.entities[0].angle = Math.atan2(e.clientY - r.top - this.entities[0].y, e.clientX - r.left - this.entities[0].x);
            }
        };
    }

    // --- ИСПРАВЛЕННАЯ ЗАГРУЗКА ---
    loadLocal() {
        try {
            let d = localStorage.getItem('battleMap');
            if (d) {
                let p = JSON.parse(d);
                // Проверяем оба формата (старый walls, новый w)
                this.mapData = p.w || p.walls; 
                this.mapObjects = p.o || p.objects || [];

                // Если загрузился "старый" формат Map (массив пар), сбрасываем объекты
                if (Array.isArray(this.mapObjects) && this.mapObjects.length > 0 && Array.isArray(this.mapObjects[0])) {
                    console.log("Старый формат обнаружен, сброс объектов");
                    this.mapObjects = [];
                }
            }
        } catch (e) { console.log('Ошибка загрузки сохранения'); }

        // Если карта сломана или не загрузилась — создаем чистую
        if (!this.mapData || this.mapData.length !== ROWS * COLS) {
            this.mapData = new Array(ROWS * COLS).fill(0);
            this.mapObjects = [];
        }
    }

    saveLocal() { 
        localStorage.setItem('battleMap', JSON.stringify({ w: this.mapData, o: this.mapObjects })); 
    }

    // --- РЕДАКТОР ---
    clickEditor(e) {
        let r = this.cvs.getBoundingClientRect();
        let c = Math.floor((e.clientX - r.left) / TILE);
        let row = Math.floor((e.clientY - r.top) / TILE);
        if (c < 0 || c >= COLS || row < 0 || row >= ROWS) return;

        let idx = row * COLS + c;
        this.mapObjects = this.mapObjects.filter(o => !(o.c === c && o.r === row));

        if (this.brush === 'wall') this.mapData[idx] = 1;
        else if (this.brush === 'floor') this.mapData[idx] = 0;
        else {
            this.mapData[idx] = 0;
            this.mapObjects.push({ type: this.brush, c: c, r: row });
        }
        this.saveLocal();
        this.draw();
    }

    clearMap() { 
        this.mapData.fill(0); this.mapObjects = []; 
        this.saveLocal(); this.draw(); 
    }

    saveToFile() {
        let b = new Blob([JSON.stringify({ w: this.mapData, o: this.mapObjects })], { type: 'text/json' });
        let a = document.createElement('a');
        a.href = URL.createObjectURL(b); a.download = 'map.json'; a.click();
    }
    loadFromFile(inp) {
        let f = inp.files[0];
        if (!f) return;
        let r = new FileReader();
        r.onload = e => {
            try {
                let p = JSON.parse(e.target.result);
                this.mapData = p.w || p.walls;
                this.mapObjects = p.o || p.objects || [];
                // Проверка на целостность
                if (!this.mapData || this.mapData.length !== ROWS*COLS) throw new Error();
                
                this.saveLocal(); 
                this.draw();
                alert("Карта загружена!");
            } catch (err) { alert("Ошибка: неверный формат файла"); }
        };
        r.readAsText(f);
    }

    // --- ЛОГИКА ---
    start(mode) {
        this.mode = mode;
        this.toggleUI('game');
        if (mode === 'training' && this.entities.length === 0) {
            this.entities = Array(10).fill(0).map(() => new Entity(0, 0, true));
            this.evolve();
        } else {
            this.resetLevel();
        }
        this.running = true;
        this.loop();
    }

    stop() { this.running = false; this.toggleUI('menu'); }
    restartLevel() { this.resetLevel(); this.toggleUI('game'); this.running = true; this.loop(); }
    resetGenes() { this.gen = 1; this.bestBrain = null; alert("Гены сброшены"); }

    resetLevel() {
        this.projectiles = []; this.timer = 60 * 60;
        this.items = this.mapObjects.filter(o => o.type.startsWith('item_')).map(o => ({ type: o.type, x: o.c * TILE + 20, y: o.r * TILE + 20, active: true }));

        let ps = this.mapObjects.filter(o => o.type === 'spawn_player');
        let bs = this.mapObjects.filter(o => o.type === 'spawn_bot');
        if (ps.length === 0) ps.push({ c: 2, r: 2 });
        if (bs.length === 0) bs.push({ c: 5, r: 5 });

        if (this.mode === 'pve') {
            this.entities = [new Entity(ps[0].c * TILE + 20, ps[0].r * TILE + 20, false)];
            for (let i = 0; i < 9; i++) {
                let s = bs[i % bs.length];
                this.entities.push(new Entity(s.c * TILE + 20, s.r * TILE + 20, true, this.bestBrain ? this.bestBrain.clone() : null));
            }
        }
    }

    evolve() {
        let old = this.entities.filter(e => e.isBot).sort((a, b) => b.fitness - a.fitness);
        if (old[0]) this.bestBrain = old[0].brain.clone();
        this.gen++;

        let bs = this.mapObjects.filter(o => o.type === 'spawn_bot');
        if (bs.length === 0) bs.push({ c: 5, r: 5 });

        let news = [];
        for (let i = 0; i < 10; i++) {
            let par = old.length ? (Math.random() < 0.7 ? old[0] : (old[1] || old[0])) : null;
            let br = par ? par.brain.clone() : new Brain(9, 14, 4);
            if (par) br.mutate(0.15);
            let s = bs[i % bs.length];
            news.push(new Entity(s.c * TILE + 20, s.r * TILE + 20, true, br));
        }
        this.entities = news;
        this.resetLevel();
    }

    update() {
        if (Math.random() < 0.005) {
            let r = Math.floor(Math.random() * ROWS), c = Math.floor(Math.random() * COLS);
            if (!this.mapData[r * COLS + c])
                this.items.push({ type: ['item_medkit', 'item_pistol'][Math.floor(Math.random() * 2)], x: c * TILE + 20, y: r * TILE + 20, active: true });
        }

        if (this.mode === 'training') {
            this.timer--;
            let alive = this.entities.filter(e => !e.dead).length;
            if (this.timer <= 0 || alive <= 1) this.evolve();
        } else {
            let pAlive = this.entities.find(e => !e.isBot && !e.dead);
            let bAlive = this.entities.filter(e => e.isBot && !e.dead).length;
            if (!pAlive) this.endGame("ПОРАЖЕНИЕ");
            else if (bAlive === 0) this.endGame("ПОБЕДА!");
        }

        for (let i = this.projectiles.length - 1; i >= 0; i--) {
            let p = this.projectiles[i];
            p.x += p.vx; p.y += p.vy;
            if (this.isWall(p.x, p.y)) {
                if (p.type === 'Bazooka') {
                    let c = Math.floor(p.x / TILE), r = Math.floor(p.y / TILE);
                    if (c >= 0 && c < COLS && r >= 0 && r < ROWS) {
                        this.mapData[r * COLS + c] = 0;
                        this.mapObjects = this.mapObjects.filter(o => !(o.c === c && o.r === r));
                    }
                }
                this.projectiles.splice(i, 1); continue;
            }
            let hit = false;
            this.entities.forEach(e => {
                if (e !== p.owner && !e.dead && Math.hypot(e.x - p.x, e.y - p.y) < e.rad + 5) {
                    e.takeDamage(p.dmg, p.owner); hit = true;
                }
            });
            if (hit) this.projectiles.splice(i, 1);
        }

        this.entities.forEach(e => e.update(this));

        if (this.mode === 'pve' && this.entities[0]) {
            document.getElementById('hp-val').innerText = Math.floor(this.entities[0].hp);
            document.getElementById('gun-val').innerText = this.entities[0].weapon.name;
        }
        document.getElementById('enemies-val').innerText = this.entities.filter(e => e.isBot && !e.dead).length;
        document.getElementById('gen-val').innerText = this.gen;
    }

    draw() {
        this.ctx.fillStyle = '#222'; this.ctx.fillRect(0, 0, this.cvs.width, this.cvs.height);

        for (let i = 0; i < this.mapData.length; i++) {
            if (this.mapData[i]) {
                let c = i % COLS, r = Math.floor(i / COLS);
                this.ctx.fillStyle = '#666'; this.ctx.fillRect(c * TILE, r * TILE, TILE, TILE);
                this.ctx.strokeStyle = '#333'; this.ctx.strokeRect(c * TILE, r * TILE, TILE, TILE);
            }
        }

        this.items.forEach(i => {
            if (!i.active) return;
            this.ctx.fillStyle = i.type.includes('medkit') ? '#0f0' : '#fd0';
            this.ctx.beginPath(); this.ctx.arc(i.x, i.y, 8, 0, 7); this.ctx.fill();
            this.ctx.fillStyle = 'black'; this.ctx.font = '10px Arial'; this.ctx.textAlign = 'center';
            let ic = i.type.includes('pistol') ? '🔫' : i.type.includes('rifle') ? '🖊️' : i.type.includes('bazooka') ? '🚀' : '✚';
            this.ctx.fillText(ic, i.x, i.y + 4);
        });

        this.entities.forEach(e => {
            if (e.dead) return;
            if (this.mode === 'training' && this.speed === 1) {
                this.ctx.strokeStyle = 'rgba(255,255,0,0.2)';
                e.rays.forEach((dist, idx) => {
                    let a = e.angle + [-0.8, -0.4, 0, 0.4, 0.8][idx];
                    this.ctx.beginPath(); this.ctx.moveTo(e.x, e.y);
                    this.ctx.lineTo(e.x + Math.cos(a) * dist, e.y + Math.sin(a) * dist);
                    this.ctx.stroke();
                });
            }
            this.ctx.save(); this.ctx.translate(e.x, e.y); this.ctx.rotate(e.angle);
            this.ctx.fillStyle = e.color; this.ctx.beginPath(); this.ctx.arc(0, 0, e.rad, 0, 7); this.ctx.fill();
            this.ctx.fillStyle = 'white'; this.ctx.fillRect(0, -3, 22, 6);
            this.ctx.restore();
            this.ctx.fillStyle = 'red'; this.ctx.fillRect(e.x - 12, e.y - 25, 24, 4);
            this.ctx.fillStyle = '#0f0'; this.ctx.fillRect(e.x - 12, e.y - 25, 24 * (e.hp / 100), 4);
        });

        this.ctx.fillStyle = '#ff0';
        this.projectiles.forEach(p => { this.ctx.beginPath(); this.ctx.arc(p.x, p.y, 4, 0, 7); this.ctx.fill(); });

        if (this.editorOpen) {
            this.ctx.strokeStyle = 'rgba(255,255,255,0.1)';
            for (let r = 0; r <= ROWS; r++) { this.ctx.beginPath(); this.ctx.moveTo(0, r * TILE); this.ctx.lineTo(COLS * TILE, r * TILE); this.ctx.stroke(); }
            for (let c = 0; c <= COLS; c++) { this.ctx.beginPath(); this.ctx.moveTo(c * TILE, 0); this.ctx.lineTo(c * TILE, ROWS * TILE); this.ctx.stroke(); }
            this.mapObjects.forEach(o => {
                this.ctx.fillStyle = 'white'; this.ctx.font = '16px Arial'; this.ctx.textAlign = 'center';
                let txt = '?';
                if (o.type.includes('spawn')) txt = o.type.includes('bot') ? 'B' : 'P';
                else if (o.type.includes('pistol')) txt = '🔫';
                else if (o.type.includes('medkit')) txt = '✚';
                this.ctx.fillText(txt, o.c * TILE + 20, o.r * TILE + 25);
            });
        }
    }

    loop() {
        if (!this.running && !this.editorOpen) return;
        if (this.running) {
            let n = this.speed;
            while (n--) this.update();
        }
        this.draw();
        requestAnimationFrame(() => this.loop());
    }

    isWall(x, y) {
        let c = Math.floor(x / TILE), r = Math.floor(y / TILE);
        return c < 0 || c >= COLS || r < 0 || r >= ROWS || this.mapData[r * COLS + c];
    }
    findNearest(me, list) {
        let min = Infinity, t = null;
        list.forEach(o => {
            if (o.dead || !o.active) return;
            let d = (me.x - o.x) ** 2 + (me.y - o.y) ** 2;
            if (d < min) { min = d; t = o; }
        });
        return t;
    }

    toggleUI(mode) {
        document.getElementById('main-menu').style.display = mode === 'menu' ? 'block' : 'none';
        document.getElementById('hud').style.display = mode === 'game' ? 'block' : 'none';
        document.getElementById('victory-modal').style.display = 'none';
    }
    endGame(msg) {
        this.running = false;
        document.getElementById('victory-modal').style.display = 'block';
        document.getElementById('victory-title').innerText = msg;
        document.getElementById('victory-title').style.color = msg.includes('ПОБЕДА') ? 'gold' : 'red';
    }
    toggleEditor() {
        this.editorOpen = !this.editorOpen;
        document.getElementById('editor-ui').style.display = this.editorOpen ? 'block' : 'none';
        if (this.editorOpen) { this.running = false; this.draw(); }
        else if (this.mode !== 'menu') { this.running = true; this.loop(); }
    }
    setBrush(b) { this.brush = b; document.querySelectorAll('.tool-btn').forEach(x => x.classList.remove('active')); event.target.classList.add('active'); }
}

const game = new Game();