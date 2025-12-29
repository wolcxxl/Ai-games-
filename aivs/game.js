// --- КОНФИГУРАЦИЯ ---
const TILE_SIZE = 40;
const MAP_ROWS = 20;
const MAP_COLS = 30;

// --- ПРОСТАЯ НЕЙРОСЕТЬ (Skeleton) ---
class NeuralNetwork {
    constructor(inputNodes, hiddenNodes, outputNodes) {
        // Здесь должна быть реализация весов и смещений
        // Для примера генерируем случайные веса
        this.weights = Array(inputNodes * hiddenNodes).fill(0).map(() => Math.random() * 2 - 1);
    }
    
    predict(inputs) {
        // Упрощенная логика: возвращаем случайные действия для демонстрации
        // В реальности здесь перемножение матриц
        return [Math.random(), Math.random(), Math.random(), Math.random()]; // Move X, Move Y, Shoot, Rotate
    }

    mutate() {
        // Логика мутации весов
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

    update(map, items, enemies) {
        if (this.dead) return;

        // Таймер щита
        if (this.shield > 0) {
            this.shieldTimer--;
            if (this.shieldTimer <= 0) this.shield = 0;
        }

        // Логика бота
        if (this.isBot) {
            let inputs = [this.x, this.y, this.hp, 0, 0]; // Упрощенные входы
            let outputs = this.brain.predict(inputs);
            
            // Интерпретация выходов нейросети
            if (outputs[0] > 0.5) this.x += 2;
            if (outputs[0] < 0.5) this.x -= 2;
            if (outputs[1] > 0.5) this.y += 2;
            if (outputs[1] < 0.5) this.y -= 2;
            
            // Стрельба
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
                this.shieldTimer = 30 * 60; // 30 сек * 60 fps
                break;
            case 'pistol': this.weapon = WeaponFactory.createPistol(); break;
            case 'rifle': this.weapon = WeaponFactory.createAssaultRifle(); break;
            case 'bazooka': this.weapon = WeaponFactory.createBazooka(); break;
        }
    }

    takeDamage(amount) {
        if (this.shield > 0) {
            // Щит поглощает урон
            return; 
        }
        this.hp -= amount;
        if (this.hp <= 0) {
            this.hp = 0;
            this.dead = true;
        }
    }
}

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
        this.currentBrush = 'wall'; // wall, floor, spawn_*, item_*
        
        // --- DATA ---
        // Стены: 0 - пусто, 1 - стена
        this.mapData = new Array(MAP_ROWS * MAP_COLS).fill(0);
        
        // Объекты редактора: {type: 'spawn_bot', col: 5, row: 5}
        // Используем Map для быстрого поиска по ключу "row_col" чтобы не накладывать объекты друг на друга
        this.mapObjects = new Map(); 

        this.entities = [];
        this.items = [];
        this.projectiles = [];

        this.keys = {};
        this.setupInputs();
        
        // Попробуем загрузить карту при старте
        this.loadMap();
    }

    setupInputs() {
        window.addEventListener('keydown', e => this.keys[e.key] = true);
        window.addEventListener('keyup', e => {
            this.keys[e.key] = false;
            if (e.key === 'e' || e.key === 'E') this.toggleEditor();
        });
        
        // ОБРАБОТКА КЛИКОВ (РЕДАКТОР)
        this.canvas.addEventListener('mousedown', e => {
            if (this.editorMode) {
                this.handleEditorClick(e);
            } else if (this.mode === 'pve' && !this.entities[0]?.dead) {
                this.shoot(this.entities[0]);
            }
        });
        
        // Рисование зажатой мышкой (только для стен)
        this.canvas.addEventListener('mousemove', e => {
            if (this.editorMode && e.buttons === 1) {
                this.handleEditorClick(e);
            }
             // ... логика поворота игрока ...
             if (!this.editorMode && this.mode === 'pve' && this.entities[0]) {
                const rect = this.canvas.getBoundingClientRect();
                const dx = e.clientX - rect.left - this.entities[0].x;
                const dy = e.clientY - rect.top - this.entities[0].y;
                this.entities[0].angle = Math.atan2(dy, dx);
             }
        });
    }

    setBrush(type) {
        this.currentBrush = type;
        console.log("Brush selected:", type);
        
        // Визуальное выделение кнопок
        document.querySelectorAll('.tool-btn').forEach(btn => btn.classList.remove('active'));
        // (В реальном проекте лучше добавить ID кнопкам, здесь упростим)
        event.target.classList.add('active');
    }

    handleEditorClick(e) {
        const rect = this.canvas.getBoundingClientRect();
        const col = Math.floor((e.clientX - rect.left) / TILE_SIZE);
        const row = Math.floor((e.clientY - rect.top) / TILE_SIZE);
        
        // Проверка границ
        if (col < 0 || col >= MAP_COLS || row < 0 || row >= MAP_ROWS) return;

        const idx = row * MAP_COLS + col;
        const key = `${row}_${col}`;

        if (this.currentBrush === 'wall') {
            this.mapData[idx] = 1;
            this.mapObjects.delete(key); // Удаляем объекты из стены
        } else if (this.currentBrush === 'floor') {
            this.mapData[idx] = 0;
            this.mapObjects.delete(key);
        } else {
            // Размещение объектов (спавны, предметы)
            this.mapData[idx] = 0; // Убираем стену если ставим предмет
            // Сохраняем объект
            this.mapObjects.set(key, {
                type: this.currentBrush,
                col: col,
                row: row
            });
        }
    }

    toggleEditor() {
        this.editorMode = !this.editorMode;
        const ui = document.getElementById('editor-ui');
        ui.style.display = this.editorMode ? 'block' : 'none';
        
        if (this.editorMode) {
            this.running = false; // Пауза игры при редактировании
            // Рисуем один кадр чтобы показать сетку
            this.draw(); 
        } else {
            // Если выходим из редактора во время игры - продолжаем
            if (this.mode) this.running = true;
            this.loop();
        }
    }

    saveMap() {
        const data = {
            walls: this.mapData,
            objects: Array.from(this.mapObjects.entries()) // Map нельзя просто так в JSON
        };
        localStorage.setItem('battleMap', JSON.stringify(data));
        alert('Карта сохранена!');
    }

    loadMap() {
        const raw = localStorage.getItem('battleMap');
        if (raw) {
            const data = JSON.parse(raw);
            this.mapData = data.walls;
            this.mapObjects = new Map(data.objects);
            console.log('Карта загружена');
        }
    }

    clearMap() {
        this.mapData.fill(0);
        this.mapObjects.clear();
        this.draw();
    }

    start(mode) {
        this.mode = mode;
        this.running = true;
        this.entities = [];
        this.items = [];
        this.projectiles = [];
        this.editorMode = false;
        document.getElementById('editor-ui').style.display = 'none';

        // --- ГЕНЕРАЦИЯ ПО КАРТЕ ---
        
        // 1. Собираем точки спавна из редактора
        let playerSpawns = [];
        let botSpawns = [];
        
        this.mapObjects.forEach(obj => {
            const x = obj.col * TILE_SIZE + TILE_SIZE/2;
            const y = obj.row * TILE_SIZE + TILE_SIZE/2;
            
            if (obj.type === 'spawn_player') playerSpawns.push({x, y});
            if (obj.type === 'spawn_bot') botSpawns.push({x, y});
            
            // Создаем предметы
            if (obj.type.startsWith('item_')) {
                let itemType = obj.type.replace('item_', '');
                // map keys to proper item names needed for Entity class
                if(itemType === 'rifle') itemType = 'rifle'; 
                this.items.push(new Item(itemType, x, y));
            }
        });

        // 2. Если точек спавна нет (новая игра), создаем дефолтные
        if (playerSpawns.length === 0) playerSpawns.push({x: 100, y: 100});
        
        // Создаем Игрока
        this.entities.push(new Entity(playerSpawns[0].x, playerSpawns[0].y, (mode === 'training')));

        // Создаем Ботов (добираем из botSpawns или рандомно если не хватило)
        for (let i = 0; i < 9; i++) {
            let pos = botSpawns[i] || {x: 200 + i*50, y: 200}; // fallback
            this.entities.push(new Entity(pos.x, pos.y, true));
        }

        document.getElementById('main-menu').style.display = 'none';
        document.getElementById('hud').style.display = 'block';
        this.loop();
    }

    // ... методы shoot и update (без изменений) ...
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
         // (Код update такой же как в прошлом ответе, скопируйте его сюда)
         // ...
         // Для полноты картины, вот минимальный update:
        if (this.mode === 'pve' && !this.entities[0].isBot) {
            const player = this.entities[0];
            if (this.keys['w']) player.y -= 3;
            if (this.keys['s']) player.y += 3;
            if (this.keys['a']) player.x -= 3;
            if (this.keys['d']) player.x += 3;
            document.getElementById('hp-val').innerText = player.hp;
            document.getElementById('gun-val').innerText = player.weapon.name + ` (${player.weapon.ammo})`;
        }
        
        for (let i = this.projectiles.length - 1; i >= 0; i--) {
            let p = this.projectiles[i];
            p.x += p.vx;
            p.y += p.vy;
            let col = Math.floor(p.x / TILE_SIZE);
            let row = Math.floor(p.y / TILE_SIZE);
            let idx = row * MAP_COLS + col;
            if (this.mapData[idx] === 1) {
                if (p.isBazooka) { this.mapData[idx] = 0; this.mapObjects.delete(`${row}_${col}`); } // Разрушение
                this.projectiles.splice(i, 1);
                continue;
            }
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
        // Очистка
        this.ctx.fillStyle = '#222';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        // 1. Рисуем стены
        for (let r = 0; r < MAP_ROWS; r++) {
            for (let c = 0; c < MAP_COLS; c++) {
                // Стена
                if (this.mapData[r * MAP_COLS + c] === 1) {
                    this.ctx.fillStyle = '#666';
                    this.ctx.fillRect(c * TILE_SIZE, r * TILE_SIZE, TILE_SIZE, TILE_SIZE);
                    this.ctx.strokeStyle = '#555';
                    this.ctx.strokeRect(c * TILE_SIZE, r * TILE_SIZE, TILE_SIZE, TILE_SIZE);
                }
            }
        }

        // 2. Рисуем сетку только в редакторе
        if (this.editorMode) {
            this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
            for (let r = 0; r <= MAP_ROWS; r++) {
                this.ctx.beginPath(); this.ctx.moveTo(0, r*TILE_SIZE); this.ctx.lineTo(MAP_COLS*TILE_SIZE, r*TILE_SIZE); this.ctx.stroke();
            }
            for (let c = 0; c <= MAP_COLS; c++) {
                this.ctx.beginPath(); this.ctx.moveTo(c*TILE_SIZE, 0); this.ctx.lineTo(c*TILE_SIZE, MAP_ROWS*TILE_SIZE); this.ctx.stroke();
            }

            // Рисуем объекты редактора (полупрозрачные иконки)
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
                    this.ctx.fillStyle = 'gold';
                    let label = '?';
                    if(obj.type.includes('pistol')) label = '🔫';
                    if(obj.type.includes('rifle')) label = '🖊️';
                    if(obj.type.includes('bazooka')) label = '🚀';
                    if(obj.type.includes('medkit')) label = '➕';
                    if(obj.type.includes('shield')) label = '🛡️';
                    this.ctx.fillText(label, cx, cy);
                }
            });
        }

        // 3. Рисуем игровые предметы (только если игра идет)
        if (!this.editorMode) {
            this.items.forEach(item => {
                if (!item.active) return;
                this.ctx.fillStyle = item.type === 'medkit' ? 'green' : 'gold';
                this.ctx.beginPath(); this.ctx.arc(item.x, item.y, 8, 0, Math.PI*2); this.ctx.fill();
                // Текст
                this.ctx.font = '10px Arial'; this.ctx.fillStyle = 'white';
                this.ctx.fillText(item.type.substring(0,2).toUpperCase(), item.x-5, item.y+3);
            });

            // Сущности и пули (из старого draw)
            this.entities.forEach(ent => {
                 if (ent.dead) return;
                 this.ctx.fillStyle = ent.color;
                 this.ctx.beginPath(); this.ctx.arc(ent.x, ent.y, ent.radius, 0, Math.PI * 2); this.ctx.fill();
                 if (ent.shield > 0) {
                    this.ctx.strokeStyle = 'cyan'; this.ctx.lineWidth = 2; this.ctx.beginPath();
                    this.ctx.arc(ent.x, ent.y, ent.radius + 5, 0, Math.PI * 2); this.ctx.stroke();
                 }
                 this.ctx.strokeStyle = 'white'; this.ctx.lineWidth = 3;
                 this.ctx.beginPath(); this.ctx.moveTo(ent.x, ent.y);
                 this.ctx.lineTo(ent.x + Math.cos(ent.angle) * 25, ent.y + Math.sin(ent.angle) * 25); this.ctx.stroke();
                 this.ctx.fillStyle = 'red'; this.ctx.fillRect(ent.x - 15, ent.y - 25, 30, 5);
                 this.ctx.fillStyle = '#0f0'; this.ctx.fillRect(ent.x - 15, ent.y - 25, 30 * (ent.hp / 100), 5);
            });

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

// Глобальные функции для кнопок HTML
function startGame(mode) {
    game.start(mode);
}

function stopGame() {
    game.running = false;
    document.getElementById('main-menu').style.display = 'block';
    document.getElementById('hud').style.display = 'none';
}