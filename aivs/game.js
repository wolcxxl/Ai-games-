// --- КОНФИГУРАЦИЯ ---
const TILE_SIZE = 40;
const MAP_ROWS = 20;
const MAP_COLS = 30;

// --- НЕЙРОСЕТЬ ---
class NeuralNetwork {
    constructor(inputNodes, hiddenNodes, outputNodes) {
        // Инициализация случайных весов
        this.weights = Array(inputNodes * hiddenNodes).fill(0).map(() => Math.random() * 2 - 1);
    }
    
    predict(inputs) {
        // Упрощенная логика "предсказания" для демонстрации
        // В реальном обучении здесь должно быть перемножение матриц
        return [
            Math.random(), // Движение по X
            Math.random(), // Движение по Y
            Math.random(), // Стрельба
            Math.random()  // Вращение (если нужно)
        ]; 
    }
}

// --- СУЩНОСТИ ---
class Entity {
    constructor(x, y, isBot) {
        this.x = x;
        this.y = y;
        this.radius = 15; // Размер персонажа
        this.hp = 100;
        
        // Щит
        this.shield = 0;
        this.shieldTimer = 0;
        
        // Оружие - СТРОГО рукопашная на старте
        this.weapon = WeaponFactory.createMelee();
        
        this.isBot = isBot;
        this.color = isBot ? 'red' : 'blue';
        
        // Мозг бота
        this.brain = isBot ? new NeuralNetwork(5, 10, 4) : null;
        
        this.angle = 0;
        this.dead = false;
    }

    update(mapData, items, gameInstance) {
        if (this.dead) return;

        // Таймер щита
        if (this.shield > 0) {
            this.shieldTimer--;
            if (this.shieldTimer <= 0) this.shield = 0;
        }

        // --- ЛОГИКА ДВИЖЕНИЯ И AI ---
        let moveX = 0;
        let moveY = 0;
        let wantsToShoot = false;

        if (this.isBot) {
            // Входы нейросети: позиция, здоровье, есть ли патроны
            let inputs = [
                this.x / (MAP_COLS * TILE_SIZE), 
                this.y / (MAP_ROWS * TILE_SIZE), 
                this.hp / 100, 
                this.weapon.ammo > 0 ? 1 : 0,
                0 // Резерв
            ];
            
            let outputs = this.brain.predict(inputs);
            
            // Интерпретация выходов (0..1)
            // 0.5 - стоять, >0.5 идти вправо/вниз, <0.5 влево/вверх
            if (outputs[0] > 0.6) moveX = 2;
            else if (outputs[0] < 0.4) moveX = -2;
            
            if (outputs[1] > 0.6) moveY = 2;
            else if (outputs[1] < 0.4) moveY = -2;
            
            // Поворот бота в сторону движения (просто для визуализации)
            if (moveX !== 0 || moveY !== 0) {
                this.angle = Math.atan2(moveY, moveX);
            }

            // Стрельба (если уверенность > 0.8)
            if (outputs[2] > 0.8) wantsToShoot = true;

        } else {
            // Управление игрока (передаем управление из Game класса через флаги, если нужно, 
            // но в текущей архитектуре игрок управляется напрямую в game.update. 
            // Оставим пустым, так как игрок обрабатывается отдельно в Game.update)
        }

        // --- ФИЗИКА И СТОЛКНОВЕНИЯ СО СТЕНАМИ ---
        // Проверяем X
        if (moveX !== 0) {
            if (!gameInstance.checkWallCollision(this.x + moveX, this.y, this.radius)) {
                this.x += moveX;
            }
        }
        // Проверяем Y
        if (moveY !== 0) {
            if (!gameInstance.checkWallCollision(this.x, this.y + moveY, this.radius)) {
                this.y += moveY;
            }
        }

        // --- СТРЕЛЬБА ---
        if (wantsToShoot) {
            gameInstance.shoot(this);
        }

        // --- ПОДБОР ПРЕДМЕТОВ ---
        for (let i = 0; i < items.length; i++) {
            let item = items[i];
            if (!item.active) continue;
            
            let dist = Math.hypot(this.x - item.x, this.y - item.y);
            if (dist < this.radius + item.size) {
                this.pickUp(item);
            }
        }
    }

    pickUp(item) {
        item.active = false;
        switch(item.type) {
            case 'medkit': 
                this.hp = Math.min(100, this.hp + 50); 
                break;
            case 'shield': 
                this.shield = 200; 
                this.shieldTimer = 30 * 60; // 30 сек
                break;
            case 'pistol': 
                this.weapon = WeaponFactory.createPistol(); 
                break;
            case 'rifle': 
                this.weapon = WeaponFactory.createAssaultRifle(); 
                break;
            case 'bazooka': 
                this.weapon = WeaponFactory.createBazooka(); 
                break;
        }
    }

    takeDamage(amount) {
        if (this.shield > 0) return; // Щит полностью блокирует урон
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
        
        // Размеры канваса под карту
        this.canvas.width = MAP_COLS * TILE_SIZE;
        this.canvas.height = MAP_ROWS * TILE_SIZE;
        
        this.mode = null; 
        this.running = false;
        
        // Редактор
        this.editorMode = false;
        this.currentBrush = 'wall';
        
        // Данные
        this.mapData = new Array(MAP_ROWS * MAP_COLS).fill(0);
        this.mapObjects = new Map(); 

        this.entities = [];
        this.items = [];
        this.projectiles = [];
        this.keys = {};
        
        // Таймер для спавна бонусов
        this.bonusSpawnTimer = 0;
        this.nextBonusTime = 300; // ~5 секунд (60 fps * 5)

        this.aiSystem = {
            resetGenes: () => console.log('Genes Reset'),
            rollback: (gen) => console.log(`Rollback ${gen}`)
        };

        this.setupInputs();
        this.loadMap();
    }

    setupInputs() {
        window.addEventListener('keydown', e => this.keys[e.key] = true);
        window.addEventListener('keyup', e => {
            this.keys[e.key] = false;
            if (e.key === 'e' || e.key === 'E' || e.key === 'у' || e.key === 'У') {
                this.toggleEditor();
            }
        });
        
        this.canvas.addEventListener('mousedown', e => {
            if (this.editorMode) {
                this.handleEditorClick(e);
            } else if (this.mode === 'pve' && this.entities[0] && !this.entities[0].dead) {
                this.shoot(this.entities[0]);
            }
        });
        
        this.canvas.addEventListener('mousemove', e => {
            if (this.editorMode && e.buttons === 1) {
                this.handleEditorClick(e);
            }
             if (!this.editorMode && this.mode === 'pve' && this.entities[0]) {
                const rect = this.canvas.getBoundingClientRect();
                const dx = e.clientX - rect.left - this.entities[0].x;
                const dy = e.clientY - rect.top - this.entities[0].y;
                this.entities[0].angle = Math.atan2(dy, dx);
             }
        });
    }

    // --- ПРОВЕРКА КОЛЛИЗИЙ (ЧТОБЫ НЕ ПРЫГАТЬ В СТЕНЫ) ---
    checkWallCollision(x, y, radius) {
        // Проверяем 4 точки вокруг персонажа (верх, низ, лево, право)
        const checkPoints = [
            {x: x + radius, y: y},
            {x: x - radius, y: y},
            {x: x, y: y + radius},
            {x: x, y: y - radius}
        ];

        for (let p of checkPoints) {
            let col = Math.floor(p.x / TILE_SIZE);
            let row = Math.floor(p.y / TILE_SIZE);
            
            // Выход за границы карты
            if (col < 0 || col >= MAP_COLS || row < 0 || row >= MAP_ROWS) return true;
            
            // Попадание в стену
            let idx = row * MAP_COLS + col;
            if (this.mapData[idx] === 1) return true;
        }
        return false;
    }

    // --- ЛОГИКА СТРЕЛЬБЫ ---
    shoot(shooter) {
        // 1. Пробуем выстрелить (уменьшаем патроны внутри weapon.fire())
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

            // 2. Если патроны кончились ПОСЛЕ выстрела
            if (shooter.weapon.ammo <= 0 && shooter.weapon.name !== 'Melee') {
                shooter.weapon = WeaponFactory.createMelee(); // Возвращаем кулаки
            }
        } else {
            // Если патронов нет, но оружие почему-то не сменилось (страховка)
            if (shooter.weapon.name !== 'Melee') {
                shooter.weapon = WeaponFactory.createMelee();
            }
        }
    }

    // --- СПАВН СЛУЧАЙНЫХ БОНУСОВ ---
    spawnRandomBonus() {
        // Список возможных бонусов
        const types = ['medkit', 'shield', 'pistol', 'rifle', 'bazooka'];
        const randomType = types[Math.floor(Math.random() * types.length)];
        
        // Ищем случайное свободное место
        let attempts = 0;
        while (attempts < 50) {
            let c = Math.floor(Math.random() * MAP_COLS);
            let r = Math.floor(Math.random() * MAP_ROWS);
            let idx = r * MAP_COLS + c;
            
            // Если это не стена
            if (this.mapData[idx] === 0) {
                let x = c * TILE_SIZE + TILE_SIZE / 2;
                let y = r * TILE_SIZE + TILE_SIZE / 2;
                this.items.push(new Item(randomType, x, y));
                break;
            }
            attempts++;
        }
    }

    update() {
        // Управление Игрока (движение с коллизией)
        if (this.mode === 'pve' && this.entities[0] && !this.entities[0].isBot) {
            const player = this.entities[0];
            let dx = 0;
            let dy = 0;

            if (this.keys['w'] || this.keys['ц']) dy = -3;
            if (this.keys['s'] || this.keys['ы']) dy = 3;
            if (this.keys['a'] || this.keys['ф']) dx = -3;
            if (this.keys['d'] || this.keys['в']) dx = 3;

            // Применяем коллизию для игрока
            if (dx !== 0 && !this.checkWallCollision(player.x + dx, player.y, player.radius)) player.x += dx;
            if (dy !== 0 && !this.checkWallCollision(player.x, player.y + dy, player.radius)) player.y += dy;
            
            const gunElem = document.getElementById('gun-val');
            const hpElem = document.getElementById('hp-val');
            if (gunElem) gunElem.innerText = player.weapon.name + ` (${player.weapon.ammo === Infinity ? 'Inf' : player.weapon.ammo})`;
            if (hpElem) hpElem.innerText = Math.floor(player.hp);
        }

        // Логика спавна бонусов (раз в 5-10 секунд)
        this.bonusSpawnTimer++;
        if (this.bonusSpawnTimer > this.nextBonusTime) {
            this.spawnRandomBonus();
            this.bonusSpawnTimer = 0;
            // Случайное время следующего спавна: от 300 (5 сек) до 600 (10 сек) кадров
            this.nextBonusTime = 300 + Math.random() * 300;
        }

        // Обновление пуль
        for (let i = this.projectiles.length - 1; i >= 0; i--) {
            let p = this.projectiles[i];
            p.x += p.vx;
            p.y += p.vy;
            
            // Проверка выхода за карту
            if (p.x < 0 || p.x > this.canvas.width || p.y < 0 || p.y > this.canvas.height) {
                this.projectiles.splice(i, 1);
                continue;
            }

            let col = Math.floor(p.x / TILE_SIZE);
            let row = Math.floor(p.y / TILE_SIZE);
            let idx = row * MAP_COLS + col;
            
            // Стена
            if (this.mapData[idx] === 1) {
                if (p.isBazooka) {
                    this.mapData[idx] = 0; // Ломаем
                    const key = `${row}_${col}`;
                    this.mapObjects.delete(key);
                }
                this.projectiles.splice(i, 1);
                continue;
            }

            // Попадание в сущностей
            this.entities.forEach(ent => {
                if (ent === p.owner || ent.dead) return;
                let dist = Math.hypot(ent.x - p.x, ent.y - p.y);
                if (dist < ent.radius) {
                    ent.takeDamage(p.damage);
                    this.projectiles.splice(i, 1);
                }
            });
        }

        // Обновление всех сущностей (ботов)
        // Передаем this (instance игры), чтобы боты могли вызывать shoot и checkWallCollision
        this.entities.forEach(ent => ent.update(this.mapData, this.items, this));
    }

    // --- ОСТАЛЬНОЕ БЕЗ ИЗМЕНЕНИЙ (DRAW, EDITOR и т.д.) ---
    
    toggleEditor() {
        this.editorMode = !this.editorMode;
        const ui = document.getElementById('editor-ui');
        if (this.editorMode) {
            ui.style.display = 'block';
            this.running = false; 
            this.draw(); 
        } else {
            ui.style.display = 'none';
            if (this.mode) {
                this.running = true;
                this.loop();
            }
        }
    }

    setBrush(type) {
        this.currentBrush = type;
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
            this.mapData[idx] = 0; 
            this.mapObjects.set(key, { type: this.currentBrush, col: col, row: row });
        }
        this.draw(); 
    }

    saveMap() {
        const data = { walls: this.mapData, objects: Array.from(this.mapObjects.entries()) };
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
            } catch(e) { console.error(e); }
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

        let playerSpawns = [];
        let botSpawns = [];
        
        this.mapObjects.forEach(obj => {
            const x = obj.col * TILE_SIZE + TILE_SIZE/2;
            const y = obj.row * TILE_SIZE + TILE_SIZE/2;
            
            if (obj.type === 'spawn_player') playerSpawns.push({x, y});
            if (obj.type === 'spawn_bot') botSpawns.push({x, y});
            
            // Начальная расстановка бонусов (которые нарисованы в редакторе)
            if (obj.type.startsWith('item_')) {
                let itemType = obj.type.replace('item_', '');
                this.items.push(new Item(itemType, x, y));
            }
        });

        if (playerSpawns.length === 0) playerSpawns.push({x: 100, y: 100});
        this.entities.push(new Entity(playerSpawns[0].x, playerSpawns[0].y, (mode === 'training')));

        for (let i = 0; i < 9; i++) {
            let pos = botSpawns[i] || {x: 200 + i*50, y: 200}; 
            this.entities.push(new Entity(pos.x, pos.y, true));
        }

        document.getElementById('main-menu').style.display = 'none';
        document.getElementById('hud').style.display = 'block';
        
        this.loop();
    }

    draw() {
        this.ctx.fillStyle = '#222';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        // Стены
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

        if (this.editorMode) {
            this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
            for (let r = 0; r <= MAP_ROWS; r++) {
                this.ctx.beginPath(); this.ctx.moveTo(0, r*TILE_SIZE); this.ctx.lineTo(MAP_COLS*TILE_SIZE, r*TILE_SIZE); this.ctx.stroke();
            }
            for (let c = 0; c <= MAP_COLS; c++) {
                this.ctx.beginPath(); this.ctx.moveTo(c*TILE_SIZE, 0); this.ctx.lineTo(c*TILE_SIZE, MAP_ROWS*TILE_SIZE); this.ctx.stroke();
            }

            this.mapObjects.forEach(obj => {
                const cx = obj.col * TILE_SIZE + TILE_SIZE/2;
                const cy = obj.row * TILE_SIZE + TILE_SIZE/2;
                this.ctx.textAlign = 'center'; this.ctx.textBaseline = 'middle'; this.ctx.font = '20px Arial';

                if (obj.type === 'spawn_player') {
                    this.ctx.fillStyle = 'rgba(0, 0, 255, 0.5)'; this.ctx.beginPath(); this.ctx.arc(cx, cy, 10, 0, Math.PI*2); this.ctx.fill(); this.ctx.fillStyle = 'white'; this.ctx.fillText('P', cx, cy);
                } else if (obj.type === 'spawn_bot') {
                    this.ctx.fillStyle = 'rgba(255, 0, 0, 0.5)'; this.ctx.beginPath(); this.ctx.arc(cx, cy, 10, 0, Math.PI*2); this.ctx.fill(); this.ctx.fillStyle = 'white'; this.ctx.fillText('B', cx, cy);
                } else if (obj.type.startsWith('item_')) {
                    this.ctx.fillStyle = 'white';
                    let label = '?';
                    if(obj.type.includes('pistol')) label = '🔫'; if(obj.type.includes('rifle')) label = '🖊️'; if(obj.type.includes('bazooka')) label = '🚀'; if(obj.type.includes('medkit')) label = '➕'; if(obj.type.includes('shield')) label = '🛡️';
                    this.ctx.fillText(label, cx, cy);
                }
            });
            this.ctx.fillStyle = 'yellow'; this.ctx.font = '20px Arial'; this.ctx.textAlign = 'left'; this.ctx.fillText("РЕЖИМ РЕДАКТОРА", 20, 30);
        }

        if (!this.editorMode) {
            this.items.forEach(item => {
                if (!item.active) return;
                this.ctx.fillStyle = item.type === 'medkit' ? 'green' : 'gold';
                this.ctx.beginPath(); this.ctx.arc(item.x, item.y, 8, 0, Math.PI*2); this.ctx.fill();
                // Для наглядности можно добавить иконки
                this.ctx.fillStyle = 'black'; this.ctx.font = '10px Arial'; this.ctx.textAlign='center';
                this.ctx.fillText(item.type[0].toUpperCase(), item.x, item.y+3);
            });

            this.entities.forEach(ent => {
                if (ent.dead) return;
                this.ctx.fillStyle = ent.color;
                this.ctx.beginPath(); this.ctx.arc(ent.x, ent.y, ent.radius, 0, Math.PI * 2); this.ctx.fill();
                
                if (ent.shield > 0) {
                    this.ctx.strokeStyle = 'cyan'; this.ctx.lineWidth = 2; this.ctx.beginPath(); this.ctx.arc(ent.x, ent.y, ent.radius + 5, 0, Math.PI * 2); this.ctx.stroke();
                }

                this.ctx.strokeStyle = 'white'; this.ctx.lineWidth = 3;
                this.ctx.beginPath(); this.ctx.moveTo(ent.x, ent.y);
                this.ctx.lineTo(ent.x + Math.cos(ent.angle) * 25, ent.y + Math.sin(ent.angle) * 25); 
                this.ctx.stroke();

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

// Глобальные функции
function startGame(mode) { game.start(mode); }
function stopGame() { 
    game.running = false; 
    document.getElementById('main-menu').style.display = 'block'; 
    document.getElementById('hud').style.display = 'none'; 
}