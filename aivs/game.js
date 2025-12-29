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

// --- ГЛАВНЫЙ КЛАСС ИГРЫ ---
class Game {
    constructor() {
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
        
        this.mode = null; // 'training' or 'pve'
        this.running = false;
        this.editorMode = false;

        // Карта: 0 - пол, 1 - стена
        this.mapData = new Array(MAP_ROWS * MAP_COLS).fill(0);
        
        // Сущности
        this.entities = [];
        this.items = [];
        this.projectiles = [];

        // Управление игрока
        this.keys = {};
        this.setupInputs();

        // AI System
        this.aiSystem = {
            generation: 0,
            resetGenes: () => console.log('Genes Reset'),
            rollback: (gen) => console.log(`Rollback ${gen}`)
        };
    }

    setupInputs() {
        window.addEventListener('keydown', e => this.keys[e.key] = true);
        window.addEventListener('keyup', e => {
            this.keys[e.key] = false;
            if (e.key === 'e' || e.key === 'E') this.toggleEditor();
        });
        
        // Редактор карты мышкой
        this.canvas.addEventListener('mousedown', e => {
            if (this.editorMode) {
                const rect = this.canvas.getBoundingClientRect();
                const col = Math.floor((e.clientX - rect.left) / TILE_SIZE);
                const row = Math.floor((e.clientY - rect.top) / TILE_SIZE);
                const idx = row * MAP_COLS + col;
                if (idx >= 0 && idx < this.mapData.length) {
                    this.mapData[idx] = this.mapData[idx] === 1 ? 0 : 1;
                }
            } else if (this.mode === 'pve' && !this.entities[0].dead) {
                this.shoot(this.entities[0]); // Игрок стреляет
            }
        });

        // Движение мыши для игрока
        this.canvas.addEventListener('mousemove', e => {
             if (this.mode === 'pve' && this.entities[0]) {
                const rect = this.canvas.getBoundingClientRect();
                const dx = e.clientX - rect.left - this.entities[0].x;
                const dy = e.clientY - rect.top - this.entities[0].y;
                this.entities[0].angle = Math.atan2(dy, dx);
             }
        });
    }

    toggleEditor() {
        this.editorMode = !this.editorMode;
        console.log("Editor Mode:", this.editorMode);
    }

    start(mode) {
        this.mode = mode;
        this.running = true;
        this.entities = [];
        this.items = [];
        this.projectiles = [];
        
        // Генерация спавна (упрощено)
        // 0 - Игрок, 1-9 - Боты
        for (let i = 0; i < 10; i++) {
            let isBot = (mode === 'training') ? true : (i !== 0);
            this.entities.push(new Entity(100 + i * 50, 100 + i * 50, isBot));
        }

        // Генерация оружия и предметов
        for (let i=0; i<5; i++) {
            this.items.push(new Item('medkit', Math.random()*800, Math.random()*600));
            this.items.push(new Item('pistol', Math.random()*800, Math.random()*600));
            this.items.push(new Item('bazooka', Math.random()*800, Math.random()*600));
        }

        document.getElementById('main-menu').style.display = 'none';
        document.getElementById('hud').style.display = 'block';
        
        this.loop();
    }

    shoot(shooter) {
        if (shooter.weapon.fire()) {
            // Создаем пулю
            this.projectiles.push({
                x: shooter.x,
                y: shooter.y,
                vx: Math.cos(shooter.angle) * 10,
                vy: Math.sin(shooter.angle) * 10,
                damage: shooter.weapon.damage,
                isBazooka: shooter.weapon.name === 'Bazooka',
                owner: shooter
            });

            // Если патроны кончились - ломаем оружие (возврат к Melee)
            if (shooter.weapon.ammo <= 0 && shooter.weapon.name !== 'Melee') {
                shooter.weapon = WeaponFactory.createMelee();
            }
        }
    }

    update() {
        // Логика игрока (движение)
        if (this.mode === 'pve' && !this.entities[0].isBot) {
            const player = this.entities[0];
            if (this.keys['w']) player.y -= 3;
            if (this.keys['s']) player.y += 3;
            if (this.keys['a']) player.x -= 3;
            if (this.keys['d']) player.x += 3;
            
            // Обновление HUD
            document.getElementById('hp-val').innerText = player.hp;
            document.getElementById('gun-val').innerText = player.weapon.name + ` (${player.weapon.ammo})`;
        }

        // Обновление пуль
        for (let i = this.projectiles.length - 1; i >= 0; i--) {
            let p = this.projectiles[i];
            p.x += p.vx;
            p.y += p.vy;
            
            // Проверка стен
            let col = Math.floor(p.x / TILE_SIZE);
            let row = Math.floor(p.y / TILE_SIZE);
            let idx = row * MAP_COLS + col;
            
            if (this.mapData[idx] === 1) {
                if (p.isBazooka) {
                    this.mapData[idx] = 0; // Ломаем стену
                }
                this.projectiles.splice(i, 1);
                continue;
            }

            // Проверка попаданий в врагов
            this.entities.forEach(ent => {
                if (ent === p.owner || ent.dead) return;
                let dist = Math.hypot(ent.x - p.x, ent.y - p.y);
                if (dist < ent.radius) {
                    ent.takeDamage(p.damage);
                    this.projectiles.splice(i, 1);
                }
            });
        }

        // Обновление сущностей
        this.entities.forEach(ent => ent.update(this.mapData, this.items));
    }

    draw() {
        this.ctx.fillStyle = '#222';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        // Рисуем карту
        for (let r = 0; r < MAP_ROWS; r++) {
            for (let c = 0; c < MAP_COLS; c++) {
                if (this.mapData[r * MAP_COLS + c] === 1) {
                    this.ctx.fillStyle = '#666';
                    this.ctx.fillRect(c * TILE_SIZE, r * TILE_SIZE, TILE_SIZE, TILE_SIZE);
                }
            }
        }
        
        // Рисуем сетку редактора если включен
        if (this.editorMode) {
            this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
            for (let r = 0; r < MAP_ROWS; r++) {
                for (let c = 0; c < MAP_COLS; c++) {
                    this.ctx.strokeRect(c * TILE_SIZE, r * TILE_SIZE, TILE_SIZE, TILE_SIZE);
                }
            }
            this.ctx.fillStyle = 'yellow';
            this.ctx.font = '20px Arial';
            this.ctx.fillText("EDITOR MODE: Click to add/remove walls", 20, 30);
        }

        // Рисуем предметы
        this.items.forEach(item => {
            if (!item.active) return;
            this.ctx.fillStyle = item.type === 'medkit' ? 'green' : 'gold';
            this.ctx.beginPath();
            this.ctx.arc(item.x, item.y, 8, 0, Math.PI*2);
            this.ctx.fill();
            // Текст над предметом (для отладки)
            this.ctx.fillStyle = 'white';
            this.ctx.font = '10px Arial';
            this.ctx.fillText(item.type[0].toUpperCase(), item.x-3, item.y+3);
        });

        // Рисуем сущности
        this.entities.forEach(ent => {
            if (ent.dead) return;
            
            // Тело
            this.ctx.fillStyle = ent.color;
            this.ctx.beginPath();
            this.ctx.arc(ent.x, ent.y, ent.radius, 0, Math.PI * 2);
            this.ctx.fill();

            // Щит
            if (ent.shield > 0) {
                this.ctx.strokeStyle = 'cyan';
                this.ctx.lineWidth = 2;
                this.ctx.beginPath();
                this.ctx.arc(ent.x, ent.y, ent.radius + 5, 0, Math.PI * 2);
                this.ctx.stroke();
            }

            // Оружие (линия направления)
            this.ctx.strokeStyle = 'white';
            this.ctx.lineWidth = 3;
            this.ctx.beginPath();
            this.ctx.moveTo(ent.x, ent.y);
            this.ctx.lineTo(ent.x + Math.cos(ent.angle) * 25, ent.y + Math.sin(ent.angle) * 25);
            this.ctx.stroke();
            
            // HP Bar
            this.ctx.fillStyle = 'red';
            this.ctx.fillRect(ent.x - 15, ent.y - 25, 30, 5);
            this.ctx.fillStyle = '#0f0';
            this.ctx.fillRect(ent.x - 15, ent.y - 25, 30 * (ent.hp / 100), 5);
        });

        // Рисуем пули
        this.ctx.fillStyle = 'yellow';
        this.projectiles.forEach(p => {
            this.ctx.beginPath();
            this.ctx.arc(p.x, p.y, 3, 0, Math.PI*2);
            this.ctx.fill();
        });
    }

    loop() {
        if (!this.running) return;
        this.update();
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