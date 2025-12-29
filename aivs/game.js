// --- КОНФИГУРАЦИЯ ---
const TILE_SIZE = 40;
const MAP_ROWS = 20;
const MAP_COLS = 30;

// --- ПРОСТАЯ НЕЙРОСЕТЬ (Заглушка для примера) ---
class NeuralNetwork {
    constructor(inputNodes, hiddenNodes, outputNodes) {
        this.weights = Array(inputNodes * hiddenNodes).fill(0).map(() => Math.random() * 2 - 1);
    }
    predict(inputs) {
        return [Math.random(), Math.random(), Math.random(), Math.random()]; 
    }
}

// --- СУЩНОСТИ ---
class Entity {
    constructor(x, y, isBot) {
        this.x = x;
        this.y = y;
        this.radius = 15;
        this.hp = 100;
        this.shield = 0;
        this.shieldTimer = 0;
        this.weapon = WeaponFactory.createMelee();
        this.isBot = isBot;
        this.color = isBot ? 'red' : 'blue';
        this.brain = isBot ? new NeuralNetwork(5, 10, 4) : null;
        this.angle = 0;
        this.dead = false;
    }

    update(map, items) {
        if (this.dead) return;

        // Щит
        if (this.shield > 0) {
            this.shieldTimer--;
            if (this.shieldTimer <= 0) this.shield = 0;
        }

        // Бот
        if (this.isBot) {
            let inputs = [this.x, this.y, this.hp, 0, 0];
            let outputs = this.brain.predict(inputs);
            if (outputs[0] > 0.5) this.x += 2;
            if (outputs[0] < 0.5) this.x -= 2;
            if (outputs[1] > 0.5) this.y += 2;
            if (outputs[1] < 0.5) this.y -= 2;
            if (outputs[2] > 0.8) game.shoot(this);
        }

        // Подбор предметов
        items.forEach(item => {
            if (!item.active) return;
            let dist = Math.hypot(this.x - item.x, this.y - item.y);
            if (dist < this.radius + item.size) {
                this.pickUp(item);
            }
        });
    }

    pickUp(item) {
        item.active = false;
        switch(item.type) {
            case 'medkit': this.hp = Math.min(100, this.hp + 50); break;
            case 'shield': 
                this.shield = 200; 
                this.shieldTimer = 30 * 60; 
                break;
            case 'pistol': this.weapon = WeaponFactory.createPistol(); break;
            case 'rifle': this.weapon = WeaponFactory.createAssaultRifle(); break;
            case 'bazooka': this.weapon = WeaponFactory.createBazooka(); break;
        }
    }

    takeDamage(amount) {
        if (this.shield > 0) return;
        this.hp -= amount;
        if (this.hp <= 0) {
            this.hp = 0;
            this.dead = true;
        }
    }
}

// --- ГЛАВНЫЙ КЛАСС ИГРЫ ---
class Game {
    constructor() {
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
        
        this.mode = null; 
        this.running = false;
        
        // --- EDITOR STATE ---
        this.editorMode = false;
        this.currentBrush = 'wall';
        
        // Данные карты
        this.mapData = new Array(MAP_ROWS * MAP_COLS).fill(0);
        this.mapObjects = new Map(); 

        this.entities = [];
        this.items = [];
        this.projectiles = [];
        this.keys = {};

        // AI System
        this.aiSystem = {
            resetGenes: () => console.log('Genes Reset'),
            rollback: (gen) => console.log(`Rollback ${gen}`)
        };

        this.setupInputs();
        this.loadMap(); // Пробуем загрузить карту сразу
    }

    setupInputs() {
        window.addEventListener('keydown', e => this.keys[e.key] = true);
        window.addEventListener('keyup', e => {
            this.keys[e.key] = false;
            // Переключатель редактора на 'E'
            if (e.key === 'e' || e.key === 'E' || e.key === 'у' || e.key === 'У') {
                this.toggleEditor();
            }
        });
        
        // Мышь
        this.canvas.addEventListener('mousedown', e => {
            if (this.editorMode) {
                this.handleEditorClick(e);
            } else if (this.mode === 'pve' && this.entities[0] && !this.entities[0].dead) {
                this.shoot(this.entities[0]);
            }
        });
        
        this.canvas.addEventListener('mousemove', e => {
            if (this.editorMode && e.buttons === 1) {
                this.handleEditorClick(e); // Рисование стенами при зажатии
            }
             if (!this.editorMode && this.mode === 'pve' && this.entities[0]) {
                const rect = this.canvas.getBoundingClientRect();
                const dx = e.clientX - rect.left - this.entities[0].x;
                const dy = e.clientY - rect.top - this.entities[0].y;
                this.entities[0].angle = Math.atan2(dy, dx);
             }
        });
    }

    // --- ФУНКЦИИ РЕДАКТОРА ---
    toggleEditor() {
        this.editorMode = !this.editorMode;
        const ui = document.getElementById('editor-ui');
        
        if (this.editorMode) {
            ui.style.display = 'block';
            this.running = false; 
            this.draw(); // Отрисовать кадр для сетки
        } else {
            ui.style.display = 'none';
            // Если игра уже была запущена, продолжаем её
            if (this.mode) {
                this.running = true;
                this.loop();
            }
        }
    }

    setBrush(type) {
        this.currentBrush = type;
        // Подсветка кнопок
        document.querySelectorAll('.tool-btn').forEach(btn => btn.classList.remove('active'));
        if (event && event.target) event.target.classList.add('active');
    }

    handleEditorClick(e) {
        const rect = this.canvas.getBoundingClientRect();
        const col = Math.floor((e.clientX - rect.left) / TILE_SIZE);
        const row = Math.floor((e.clientY - rect.top) / TILE_SIZE);
        
        if (col < 0 || col >= MAP_COLS || row < 0 || row >= MAP_ROWS) return;

        const idx = row * MAP_COLS + col;
        const key = `${row}_${col}`;

        if (this.currentBrush === 'wall') {
            this.mapData[idx] = 1;
            this.mapObjects.delete(key);
        } else if (this.currentBrush === 'floor') {
            this.mapData[idx] = 0;
            this.mapObjects.delete(key);
        } else {
            // Ставим объект
            this.mapData[idx] = 0; // Стену убираем
            this.mapObjects.set(key, {
                type: this.currentBrush,
                col: col,
                row: row
            });
        }
        this.draw(); // Перерисовать сразу
    }

    saveMap() {
        const data = {
            walls: this.mapData,
            objects: Array.from(this.mapObjects.entries())
        };
        localStorage.setItem('battleMap', JSON.stringify(data));
        alert('Карта сохранена!');
    }

    loadMap() {
        const raw = localStorage.getItem('battleMap');
        if (raw) {
            try {
                const data = JSON.parse(raw);
                this.mapData = data.walls || new Array(MAP_ROWS * MAP_COLS).fill(0);
                this.mapObjects = new Map(data.objects);
            } catch(e) {
                console.error("Ошибка загрузки карты", e);
            }
        }
    }

    clearMap() {
        this.mapData.fill(0);
        this.mapObjects.clear();
        this.draw();
    }

    // --- ФУНКЦИИ ИГРЫ ---
    start(mode) {
        this.mode = mode;
        this.running = true;
        this.entities = [];
        this.items = [];
        this.projectiles = [];
        this.editorMode = false;
        document.getElementById('editor-ui').style.display = 'none';

        // Распарсинг карты для старта
        let playerSpawns = [];
        let botSpawns = [];
        
        this.mapObjects.forEach(obj => {
            const x = obj.col * TILE_SIZE + TILE_SIZE/2;
            const y = obj.row * TILE_SIZE + TILE_SIZE/2;
            
            if (obj.type === 'spawn_player') playerSpawns.push({x, y});
            if (obj.type === 'spawn_bot') botSpawns.push({x, y});
            
            if (obj.type.startsWith('item_')) {
                let itemType = obj.type.replace('item_', '');
                this.items.push(new Item(itemType, x, y));
            }
        });

        // Если спавнов нет, ставим дефолт
        if (playerSpawns.length === 0) playerSpawns.push({x: 100, y: 100});
        
        // Игрок
        this.entities.push(new Entity(playerSpawns[0].x, playerSpawns[0].y, (mode === 'training')));

        // Боты (до 9 штук)
        for (let i = 0; i < 9; i++) {
            let pos = botSpawns[i] || {x: 200 + i*50, y: 200}; 
            this.entities.push(new Entity(pos.x, pos.y, true));
        }

        document.getElementById('main-menu').style.display = 'none';
        document.getElementById('hud').style.display = 'block';
        
        this.loop();
    }

    shoot(shooter) {
        if (shooter.weapon.fire()) {
            this.projectiles.push({
                x: shooter.x,
                y: shooter.y,
                vx: Math.cos(shooter.angle) * 10,
                vy: Math.sin(shooter.angle) * 10,
                damage: shooter.weapon.damage,
                isBazooka: shooter.weapon.name === 'Bazooka',
                owner: shooter
            });
            if (shooter.weapon.ammo <= 0 && shooter.weapon.name !== 'Melee') {
                shooter.weapon = WeaponFactory.createMelee();
            }
        }
    }

    update() {
        if (this.mode === 'pve' && this.entities[0] && !this.entities[0].isBot) {
            const player = this.entities[0];
            if (this.keys['w'] || this.keys['ц']) player.y -= 3;
            if (this.keys['s'] || this.keys['ы']) player.y += 3;
            if (this.keys['a'] || this.keys['ф']) player.x -= 3;
            if (this.keys['d'] || this.keys['в']) player.x += 3;
            
            const gunElem = document.getElementById('gun-val');
            const hpElem = document.getElementById('hp-val');
            if (gunElem) gunElem.innerText = player.weapon.name + ` (${player.weapon.ammo})`;
            if (hpElem) hpElem.innerText = Math.floor(player.hp);
        }

        // Пули
        for (let i = this.projectiles.length - 1; i >= 0; i--) {
            let p = this.projectiles[i];
            p.x += p.vx;
            p.y += p.vy;
            
            let col = Math.floor(p.x / TILE_SIZE);
            let row = Math.floor(p.y / TILE_SIZE);
            let idx = row * MAP_COLS + col;
            
            // Столкновение со стеной
            if (this.mapData[idx] === 1) {
                if (p.isBazooka) {
                    this.mapData[idx] = 0; // Ломаем стену
                    const key = `${row}_${col}`;
                    this.mapObjects.delete(key);
                }
                this.projectiles.splice(i, 1);
                continue;
            }

            // Столкновение с врагами
            this.entities.forEach(ent => {
                if (ent === p.owner || ent.dead) return;
                let dist = Math.hypot(ent.x - p.x, ent.y - p.y);
                if (dist < ent.radius) {
                    ent.takeDamage(p.damage);
                    this.projectiles.splice(i, 1);
                }
            });
        }

        this.entities.forEach(ent => ent.update(this.mapData, this.items));
    }

    draw() {
        // Фон
        this.ctx.fillStyle = '#222';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        // 1. Стены
        for (let r = 0; r < MAP_ROWS; r++) {
            for (let c = 0; c < MAP_COLS; c++) {
                if (this.mapData[r * MAP_COLS + c] === 1) {
                    this.ctx.fillStyle = '#666';
                    this.ctx.fillRect(c * TILE_SIZE, r * TILE_SIZE, TILE_SIZE, TILE_SIZE);
                    this.ctx.strokeStyle = '#555';
                    this.ctx.strokeRect(c * TILE_SIZE, r * TILE_SIZE, TILE_SIZE, TILE_SIZE);
                }
            }
        }

        // 2. Режим Редактора
        if (this.editorMode) {
            // Сетка
            this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
            this.ctx.lineWidth = 1;
            for (let r = 0; r <= MAP_ROWS; r++) {
                this.ctx.beginPath(); this.ctx.moveTo(0, r*TILE_SIZE); this.ctx.lineTo(MAP_COLS*TILE_SIZE, r*TILE_SIZE); this.ctx.stroke();
            }
            for (let c = 0; c <= MAP_COLS; c++) {
                this.ctx.beginPath(); this.ctx.moveTo(c*TILE_SIZE, 0); this.ctx.lineTo(c*TILE_SIZE, MAP_ROWS*TILE_SIZE); this.ctx.stroke();
            }

            // Иконки объектов
            this.mapObjects.forEach(obj => {
                const cx = obj.col * TILE_SIZE + TILE_SIZE/2;
                const cy = obj.row * TILE_SIZE + TILE_SIZE/2;
                
                this.ctx.textAlign = 'center';
                this.ctx.textBaseline = 'middle';
                this.ctx.font = '20px Arial';

                if (obj.type === 'spawn_player') {
                    this.ctx.fillStyle = 'rgba(0, 0, 255, 0.5)';
                    this.ctx.beginPath(); this.ctx.arc(cx, cy, 10, 0, Math.PI*2); this.ctx.fill();
                    this.ctx.fillStyle = 'white'; this.ctx.fillText('P', cx, cy);
                } else if (obj.type === 'spawn_bot') {
                    this.ctx.fillStyle = 'rgba(255, 0, 0, 0.5)';
                    this.ctx.beginPath(); this.ctx.arc(cx, cy, 10, 0, Math.PI*2); this.ctx.fill();
                    this.ctx.fillStyle = 'white'; this.ctx.fillText('B', cx, cy);
                } else if (obj.type.startsWith('item_')) {
                    this.ctx.fillStyle = 'white';
                    let label = '?';
                    if(obj.type.includes('pistol')) label = '🔫';
                    if(obj.type.includes('rifle')) label = '🖊️';
                    if(obj.type.includes('bazooka')) label = '🚀';
                    if(obj.type.includes('medkit')) label = '➕';
                    if(obj.type.includes('shield')) label = '🛡️';
                    this.ctx.fillText(label, cx, cy);
                }
            });
            
            // Надпись сверху
            this.ctx.fillStyle = 'yellow';
            this.ctx.font = '20px Arial';
            this.ctx.textAlign = 'left';
            this.ctx.fillText("РЕЖИМ РЕДАКТОРА", 20, 30);
        }

        // 3. Игровой режим (Предметы, Игроки)
        if (!this.editorMode) {
            // Предметы
            this.items.forEach(item => {
                if (!item.active) return;
                this.ctx.fillStyle = item.type === 'medkit' ? 'green' : 'gold';
                this.ctx.beginPath(); this.ctx.arc(item.x, item.y, 8, 0, Math.PI*2); this.ctx.fill();
            });

            // Игроки
            this.entities.forEach(ent => {
                if (ent.dead) return;
                this.ctx.fillStyle = ent.color;
                this.ctx.beginPath(); this.ctx.arc(ent.x, ent.y, ent.radius, 0, Math.PI * 2); this.ctx.fill();
                
                // Щит
                if (ent.shield > 0) {
                    this.ctx.strokeStyle = 'cyan'; this.ctx.lineWidth = 2; this.ctx.beginPath();
                    this.ctx.arc(ent.x, ent.y, ent.radius + 5, 0, Math.PI * 2); this.ctx.stroke();
                }

                // Дуло
                this.ctx.strokeStyle = 'white'; this.ctx.lineWidth = 3;
                this.ctx.beginPath(); this.ctx.moveTo(ent.x, ent.y);
                this.ctx.lineTo(ent.x + Math.cos(ent.angle) * 25, ent.y + Math.sin(ent.angle) * 25); 
                this.ctx.stroke();

                // HP Bar
                this.ctx.fillStyle = 'red'; this.ctx.fillRect(ent.x - 15, ent.y - 25, 30, 5);
                this.ctx.fillStyle = '#0f0'; this.ctx.fillRect(ent.x - 15, ent.y - 25, 30 * (ent.hp / 100), 5);
            });

            // Пули
            this.ctx.fillStyle = 'yellow';
            this.projectiles.forEach(p => {
                this.ctx.beginPath(); this.ctx.arc(p.x, p.y, 3, 0, Math.PI*2); this.ctx.fill();
            });
        }
    }

    loop() {
        if (!this.running && !this.editorMode) return;
        if (this.running) this.update();
        this.draw();
        requestAnimationFrame(() => this.loop());
    }
}

// Инициализация
const game = new Game();

// Глобальные функции кнопок
function startGame(mode) {
    game.start(mode);
}
function stopGame() {
    game.running = false;
    document.getElementById('main-menu').style.display = 'block';
    document.getElementById('hud').style.display = 'none';
}