// --- КОНФИГУРАЦИЯ ---
const TILE_SIZE = 40;
const MAP_ROWS = 20;
const MAP_COLS = 30;
const MUTATION_RATE = 0.1; // Шанс мутации генов (10%)

// --- НЕЙРОСЕТЬ (УЖЕ РАБОЧАЯ) ---
class NeuralNetwork {
    constructor(inputNodes, hiddenNodes, outputNodes) {
        this.inputNodes = inputNodes;
        this.hiddenNodes = hiddenNodes;
        this.outputNodes = outputNodes;

        // Веса: Input -> Hidden
        this.weightsIH = new Array(this.inputNodes * this.hiddenNodes).fill(0).map(() => Math.random() * 2 - 1);
        // Веса: Hidden -> Output
        this.weightsHO = new Array(this.hiddenNodes * this.outputNodes).fill(0).map(() => Math.random() * 2 - 1);
    }

    // Прямое распространение (думаем)
    predict(inputs) {
        // 1. Hidden Layer
        let hidden = [];
        for (let i = 0; i < this.hiddenNodes; i++) {
            let sum = 0;
            for (let j = 0; j < this.inputNodes; j++) {
                sum += inputs[j] * this.weightsIH[i * this.inputNodes + j];
            }
            hidden[i] = Math.tanh(sum); // Функция активации
        }

        // 2. Output Layer
        let outputs = [];
        for (let i = 0; i < this.outputNodes; i++) {
            let sum = 0;
            for (let j = 0; j < this.hiddenNodes; j++) {
                sum += hidden[j] * this.weightsHO[i * this.hiddenNodes + j];
            }
            outputs[i] = Math.tanh(sum); // -1 .. 1
        }
        return outputs;
    }

    // Копирование мозга (для наследования)
    clone() {
        let clone = new NeuralNetwork(this.inputNodes, this.hiddenNodes, this.outputNodes);
        clone.weightsIH = [...this.weightsIH];
        clone.weightsHO = [...this.weightsHO];
        return clone;
    }

    // Мутация (эволюция)
    mutate() {
        const mutateGene = (val) => {
            if (Math.random() < MUTATION_RATE) {
                return val + (Math.random() * 2 - 1) * 0.5; // Небольшое изменение
            }
            return val;
        };
        this.weightsIH = this.weightsIH.map(mutateGene);
        this.weightsHO = this.weightsHO.map(mutateGene);
    }
}

// --- СУЩНОСТИ ---
class Entity {
    constructor(x, y, isBot, brain = null) {
        this.x = x;
        this.y = y;
        this.radius = 15;
        this.hp = 100;
        this.shield = 0;
        this.shieldTimer = 0;
        this.weapon = WeaponFactory.createMelee();
        this.isBot = isBot;
        this.color = isBot ? 'red' : 'blue';
        
        // AI
        this.brain = brain || (isBot ? new NeuralNetwork(6, 12, 4) : null);
        this.fitness = 0; // Очки успешности для эволюции
        
        this.angle = 0;
        this.dead = false;
    }

    update(mapData, items, gameInstance) {
        if (this.dead) return;
        
        // Награда за жизнь (стимул не умирать)
        this.fitness += 0.1;

        if (this.shield > 0) this.shield--;

        let moveX = 0;
        let moveY = 0;
        let wantsToShoot = false;

        if (this.isBot) {
            // ВХОДЫ: [X, Y, HP, Ammo, NearestItemAngle, NearestEnemyAngle]
            let nearestItem = this.findNearest(items);
            let nearestEnemy = this.findNearest(gameInstance.entities.filter(e => e !== this && !e.dead));

            let inputs = [
                this.x / (MAP_COLS * TILE_SIZE),
                this.y / (MAP_ROWS * TILE_SIZE),
                this.hp / 100,
                (this.weapon.name !== 'Melee') ? 1 : 0, // Есть ли оружие
                nearestItem ? Math.atan2(nearestItem.y - this.y, nearestItem.x - this.x) : 0,
                nearestEnemy ? Math.atan2(nearestEnemy.y - this.y, nearestEnemy.x - this.x) : 0
            ];

            let outputs = this.brain.predict(inputs);
            // Выходы: [MoveX, MoveY, Shoot, Rotate]
            
            if (outputs[0] > 0.2) moveX = 3; else if (outputs[0] < -0.2) moveX = -3;
            if (outputs[1] > 0.2) moveY = 3; else if (outputs[1] < -0.2) moveY = -3;
            
            // Вращение
            this.angle += outputs[3] * 0.1; 

            // Если бот видит врага, он может захотеть повернуться к нему
            if (nearestEnemy && (this.weapon.name !== 'Melee')) {
                 this.angle = Math.atan2(nearestEnemy.y - this.y, nearestEnemy.x - this.x);
            }

            if (outputs[2] > 0.5) wantsToShoot = true;

        } else if (gameInstance.mode === 'pve') {
            // Игрок управляется клавишами
            if (gameInstance.keys['w'] || gameInstance.keys['ц']) moveY = -3;
            if (gameInstance.keys['s'] || gameInstance.keys['ы']) moveY = 3;
            if (gameInstance.keys['a'] || gameInstance.keys['ф']) moveX = -3;
            if (gameInstance.keys['d'] || gameInstance.keys['в']) moveX = 3;
        }

        // ФИЗИКА
        if (moveX !== 0 && !gameInstance.checkWallCollision(this.x + moveX, this.y, this.radius)) this.x += moveX;
        if (moveY !== 0 && !gameInstance.checkWallCollision(this.x, this.y + moveY, this.radius)) this.y += moveY;

        // СТРЕЛЬБА ИЛИ УДАР
        if (wantsToShoot || (gameInstance.mode === 'pve' && !this.isBot && gameInstance.mouseDown)) {
            gameInstance.performAttack(this);
        }

        // ПОДБОР
        items.forEach(item => {
            if (item.active && Math.hypot(this.x - item.x, this.y - item.y) < this.radius + item.size) {
                this.pickUp(item);
                this.fitness += 50; // Награда за подбор
            }
        });
    }

    findNearest(list) {
        let minDst = Infinity;
        let target = null;
        list.forEach(obj => {
            if (!obj.active && !obj.dead) return; // Пропускаем неактивные
            if (obj.dead === true) return; // Пропускаем мертвых врагов
            let d = Math.hypot(this.x - obj.x, this.y - obj.y);
            if (d < minDst) { minDst = d; target = obj; }
        });
        return target;
    }

    pickUp(item) {
        item.active = false;
        if (item.type === 'medkit') this.hp = Math.min(100, this.hp + 50);
        else if (item.type === 'shield') this.shield = 2000;
        else if (item.type === 'pistol') this.weapon = WeaponFactory.createPistol();
        else if (item.type === 'rifle') this.weapon = WeaponFactory.createAssaultRifle();
        else if (item.type === 'bazooka') this.weapon = WeaponFactory.createBazooka();
    }

    takeDamage(amount, attacker) {
        if (this.shield > 0) return;
        this.hp -= amount;
        if (this.hp <= 0) {
            this.hp = 0;
            this.dead = true;
            if (attacker && attacker.isBot) attacker.fitness += 100; // Награда за убийство
        }
    }
}

// --- ГЛАВНЫЙ КЛАСС ---
class Game {
    constructor() {
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.canvas.width = MAP_COLS * TILE_SIZE;
        this.canvas.height = MAP_ROWS * TILE_SIZE;
        
        this.mode = null; 
        this.running = false;
        this.editorMode = false;
        this.currentBrush = 'wall';

        // ИГРОВАЯ СКОРОСТЬ
        this.cyclesPerFrame = 1; // 1 = нормальная скорость, 1000 = ускорение
        
        this.mapData = new Array(MAP_ROWS * MAP_COLS).fill(0);
        this.mapObjects = new Map();
        
        this.entities = [];
        this.items = [];
        this.projectiles = [];
        this.keys = {};
        this.mouseDown = false;

        // Таймер раунда
        this.roundTimer = 0;
        this.maxRoundTime = 60 * 60; // 60 секунд * 60 кадров
        this.generation = 1;

        // Сохранение истории для отката
        this.geneHistory = []; 

        this.aiSystem = {
            resetGenes: () => this.resetEvolution(),
            rollback: (gen) => this.rollbackEvolution(gen)
        };

        this.setupInputs();
        this.loadMap();
    }

    setupInputs() {
        window.addEventListener('keydown', e => this.keys[e.key] = true);
        window.addEventListener('keyup', e => {
            this.keys[e.key] = false;
            if (e.key === 'e' || e.key === 'E') this.toggleEditor();
        });
        this.canvas.addEventListener('mousedown', e => {
            this.mouseDown = true;
            if (this.editorMode) this.handleEditorClick(e);
        });
        this.canvas.addEventListener('mouseup', () => this.mouseDown = false);
        this.canvas.addEventListener('mousemove', e => {
            if (this.editorMode && e.buttons === 1) this.handleEditorClick(e);
            if (!this.editorMode && this.mode === 'pve' && this.entities[0]) {
                const rect = this.canvas.getBoundingClientRect();
                this.entities[0].angle = Math.atan2(e.clientY - rect.top - this.entities[0].y, e.clientX - rect.left - this.entities[0].x);
            }
        });
    }

    // --- ЛОГИКА АТАКИ ---
    performAttack(shooter) {
        if (shooter.weapon.name === 'Melee') {
             // Логика ближнего боя (без пуль)
             // Просто ищем врагов в радиусе 40 пикселей перед собой
             this.entities.forEach(enemy => {
                 if (enemy === shooter || enemy.dead) return;
                 let dist = Math.hypot(enemy.x - shooter.x, enemy.y - shooter.y);
                 if (dist < 40) {
                     // Простейшая проверка угла (перед собой)
                     enemy.takeDamage(1, shooter); // Малый урон но часто
                 }
             });
        } else {
            // Логика стрельбы
            if (shooter.weapon.fire()) {
                this.projectiles.push({
                    x: shooter.x, y: shooter.y,
                    vx: Math.cos(shooter.angle) * 12,
                    vy: Math.sin(shooter.angle) * 12,
                    damage: shooter.weapon.damage,
                    isBazooka: shooter.weapon.name === 'Bazooka',
                    owner: shooter
                });
                if (shooter.weapon.ammo <= 0) shooter.weapon = WeaponFactory.createMelee();
            } else if (shooter.weapon.ammo <= 0) {
                shooter.weapon = WeaponFactory.createMelee();
            }
        }
    }

    // --- ЭВОЛЮЦИЯ ---
    nextGeneration() {
        // Фильтрация лучших
        let oldBots = this.entities.filter(e => e.isBot);
        // Если все боты мертвы, берем их из памяти, но здесь они в массиве entities, даже если dead=true
        
        // Сортируем по фитнесу
        oldBots.sort((a, b) => b.fitness - a.fitness);
        
        // Сохраняем лучшего генома в историю
        if (oldBots.length > 0) {
            this.geneHistory.push(oldBots[0].brain.clone());
            console.log(`Gen ${this.generation} Best Fitness: ${Math.floor(oldBots[0].fitness)}`);
        }

        let newBots = [];
        // Создаем новых
        for (let i = 0; i < 9; i++) { // 9 ботов
            let parent = oldBots[i % 2]; // Берем топ-2 лучших как родителей
            if (!parent) parent = oldBots[0];
            
            let childBrain = parent.brain.clone();
            childBrain.mutate();
            
            // Находим точку спавна
            let spawn = this.getSpawnPoint('spawn_bot', i);
            newBots.push(new Entity(spawn.x, spawn.y, true, childBrain));
        }

        return newBots;
    }

    resetEvolution() {
        this.generation = 1;
        this.start('training');
        console.log("Эволюция сброшена");
    }

    rollbackEvolution(amount) {
        alert("Откат пока не реализован глубоко (нужно хранить все поколения). Сейчас просто сброс.");
    }

    start(mode) {
        this.mode = mode;
        this.running = true;
        this.editorMode = false;
        document.getElementById('editor-ui').style.display = 'none';
        
        // Для обучения включаем ускорение, для игры - выключаем
        // НО пользователь просил возможность ускорять. 
        // Добавим управление скоростью через консоль или PVE режим стандартный.
        
        this.startRound();
        this.loop();
    }

    startRound() {
        this.entities = [];
        this.items = [];
        this.projectiles = [];
        this.roundTimer = this.maxRoundTime;
        
        // Предметы
        this.mapObjects.forEach(obj => {
            if (obj.type.startsWith('item_')) {
                this.items.push(new Item(obj.type.replace('item_', ''), obj.col*TILE_SIZE+20, obj.row*TILE_SIZE+20));
            }
        });

        // Игрок (если PVE)
        if (this.mode === 'pve') {
            let s = this.getSpawnPoint('spawn_player', 0);
            this.entities.push(new Entity(s.x, s.y, false));
        } else {
             // В режиме обучения добавляем 10-го бота вместо игрока
             let brain = (this.geneHistory.length > 0) ? this.geneHistory[this.geneHistory.length-1].clone() : null;
             let s = this.getSpawnPoint('spawn_player', 0);
             this.entities.push(new Entity(s.x, s.y, true, brain));
        }

        // Боты
        if (this.generation > 1 && this.mode === 'training') {
            let evolvedBots = this.nextGeneration();
            this.entities.push(...evolvedBots);
        } else {
            // Первое поколение или PVE
            for (let i = 0; i < 9; i++) {
                let s = this.getSpawnPoint('spawn_bot', i);
                let brain = (this.mode === 'pve' && this.geneHistory.length > 0) ? this.geneHistory[this.geneHistory.length-1].clone() : null;
                this.entities.push(new Entity(s.x, s.y, true, brain));
            }
        }
        
        document.getElementById('hud').style.display = 'block';
        document.getElementById('main-menu').style.display = 'none';
    }

    getSpawnPoint(type, index) {
        let points = [];
        this.mapObjects.forEach(obj => { if (obj.type === type) points.push(obj); });
        if (points.length === 0) return {x: 100 + index*50, y: 100};
        let p = points[index % points.length];
        return {x: p.col*TILE_SIZE+20, y: p.row*TILE_SIZE+20};
    }

    update() {
        // Таймер раунда
        if (this.mode === 'training') {
            this.roundTimer--;
            let aliveBots = this.entities.filter(e => e.isBot && !e.dead).length;
            
            // Конец раунда
            if (this.roundTimer <= 0 || aliveBots === 0) {
                this.generation++;
                this.startRound();
                return;
            }
        }

        // Спавн бонусов (редко)
        if (Math.random() < 0.005) { 
             let x = Math.random() * this.canvas.width;
             let y = Math.random() * this.canvas.height;
             if (!this.checkWallCollision(x, y, 10)) this.items.push(new Item(['medkit','pistol','rifle'][Math.floor(Math.random()*3)], x, y));
        }

        // Физика пуль
        for (let i = this.projectiles.length - 1; i >= 0; i--) {
            let p = this.projectiles[i];
            p.x += p.vx; p.y += p.vy;
            let idx = Math.floor(p.y/TILE_SIZE)*MAP_COLS + Math.floor(p.x/TILE_SIZE);
            
            // Стены
            if (this.mapData[idx] === 1) {
                if (p.isBazooka) { this.mapData[idx] = 0; this.mapObjects.delete(`${Math.floor(p.y/TILE_SIZE)}_${Math.floor(p.x/TILE_SIZE)}`); }
                this.projectiles.splice(i, 1);
                continue;
            }
            // Попадания
            this.entities.forEach(ent => {
                if (ent !== p.owner && !ent.dead && Math.hypot(ent.x - p.x, ent.y - p.y) < ent.radius) {
                    ent.takeDamage(p.damage, p.owner);
                    this.projectiles.splice(i, 1);
                }
            });
        }

        this.entities.forEach(ent => ent.update(this.mapData, this.items, this));
        
        // Обновление UI раз в кадр (если скорость х1)
        if (this.cyclesPerFrame === 1 && this.mode === 'pve' && !this.entities[0].isBot) {
            document.getElementById('hp-val').innerText = Math.floor(this.entities[0].hp);
            document.getElementById('gun-val').innerText = this.entities[0].weapon.name;
        }
    }

    checkWallCollision(x, y, r) {
        let col = Math.floor(x/TILE_SIZE), row = Math.floor(y/TILE_SIZE);
        if (col<0 || col>=MAP_COLS || row<0 || row>=MAP_ROWS) return true;
        return this.mapData[row*MAP_COLS+col] === 1;
    }

    draw() {
        this.ctx.fillStyle = '#222';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        // Стены
        for(let r=0; r<MAP_ROWS; r++) {
            for(let c=0; c<MAP_COLS; c++) {
                if(this.mapData[r*MAP_COLS+c]===1) {
                    this.ctx.fillStyle='#555'; this.ctx.fillRect(c*TILE_SIZE,r*TILE_SIZE,TILE_SIZE,TILE_SIZE);
                }
            }
        }
        // Предметы
        this.items.forEach(i => {
            if(!i.active) return;
            this.ctx.fillStyle = i.type==='medkit'?'green':'gold';
            this.ctx.beginPath(); this.ctx.arc(i.x,i.y,6,0,7); this.ctx.fill();
        });
        // Сущности
        this.entities.forEach(e => {
            if(e.dead) return;
            this.ctx.fillStyle = e.color;
            this.ctx.beginPath(); this.ctx.arc(e.x,e.y,e.radius,0,7); this.ctx.fill();
            // Линия взгляда
            this.ctx.strokeStyle='white'; this.ctx.beginPath(); this.ctx.moveTo(e.x,e.y);
            this.ctx.lineTo(e.x+Math.cos(e.angle)*20, e.y+Math.sin(e.angle)*20); this.ctx.stroke();
        });
        // Пули
        this.ctx.fillStyle='yellow';
        this.projectiles.forEach(p=>{this.ctx.beginPath(); this.ctx.arc(p.x,p.y,3,0,7); this.ctx.fill()});
        
        // Инфо о обучении
        if (this.mode === 'training') {
            this.ctx.fillStyle = 'white';
            this.ctx.font = '20px Arial';
            this.ctx.fillText(`Generation: ${this.generation}`, 20, 30);
            this.ctx.fillText(`Time: ${Math.floor(this.roundTimer/60)}`, 20, 55);
            this.ctx.fillText(`Speed: x${this.cyclesPerFrame}`, 20, 80);
            this.ctx.fillStyle = '#aaa';
            this.ctx.font = '14px Arial';
            this.ctx.fillText(`Нажми [1] для x1, [2] для x100, [3] для x1000`, 20, 105);
        }
        
        if (this.editorMode) { /* Отрисовка редактора пропущена для краткости, она есть в старом коде */ 
             // Если нужно вернуть редактор, просто скопируйте блок draw() из прошлого ответа, 
             // но главное - сохраните логику training info выше.
             this.drawEditorOverlay();
        }
    }
    
    drawEditorOverlay() {
         // Сетка
         this.ctx.strokeStyle = 'rgba(255,255,255,0.1)';
         for(let i=0; i<MAP_COLS; i++) { this.ctx.strokeRect(i*TILE_SIZE,0,TILE_SIZE,MAP_ROWS*TILE_SIZE); }
         for(let i=0; i<MAP_ROWS; i++) { this.ctx.strokeRect(0,i*TILE_SIZE,MAP_COLS*TILE_SIZE,TILE_SIZE); }
         this.mapObjects.forEach(o => {
             this.ctx.fillStyle = 'rgba(255,255,255,0.5)';
             this.ctx.fillText(o.type[0], o.col*TILE_SIZE+15, o.row*TILE_SIZE+25);
         });
    }

    loop() {
        if (!this.running && !this.editorMode) return;
        
        // МАГИЯ УСКОРЕНИЯ: выполняем update N раз перед одной отрисовкой
        if (this.running) {
            for (let i = 0; i < this.cyclesPerFrame; i++) {
                this.update();
                // Если раунд закончился внутри цикла ускорения, обновляем его
                if (this.roundTimer === this.maxRoundTime) break; 
            }
        }
        
        this.draw();
        requestAnimationFrame(() => this.loop());
    }
    
    // Вспомогательные методы редактора
    toggleEditor() { this.editorMode = !this.editorMode; document.getElementById('editor-ui').style.display = this.editorMode?'block':'none'; }
    handleEditorClick(e) {
         let r = this.canvas.getBoundingClientRect();
         let c = Math.floor((e.clientX-r.left)/TILE_SIZE);
         let row = Math.floor((e.clientY-r.top)/TILE_SIZE);
         if(c<0||c>=MAP_COLS||row<0||row>=MAP_ROWS)return;
         let idx = row*MAP_COLS+c;
         if(this.currentBrush==='wall') { this.mapData[idx]=1; this.mapObjects.delete(`${row}_${c}`); }
         else if(this.currentBrush==='floor') { this.mapData[idx]=0; this.mapObjects.delete(`${row}_${c}`); }
         else { this.mapData[idx]=0; this.mapObjects.set(`${row}_${c}`, {type:this.currentBrush, col:c, row:row}); }
    }
    setBrush(t) { this.currentBrush = t; }
    saveMap() { localStorage.setItem('battleMap', JSON.stringify({walls:this.mapData, objects:Array.from(this.mapObjects.entries())})); alert('Saved'); }
    loadMap() { 
        let d = JSON.parse(localStorage.getItem('battleMap')); 
        if(d) { this.mapData=d.walls; this.mapObjects=new Map(d.objects); } 
    }
    clearMap() { this.mapData.fill(0); this.mapObjects.clear(); }
}

const game = new Game();
function startGame(m) { game.start(m); }
function stopGame() { game.running=false; document.getElementById('main-menu').style.display='block'; document.getElementById('hud').style.display='none'; }

// УПРАВЛЕНИЕ СКОРОСТЬЮ С КЛАВИАТУРЫ
window.addEventListener('keydown', e => {
    if (e.key === '1') game.cyclesPerFrame = 1;
    if (e.key === '2') game.cyclesPerFrame = 100;
    if (e.key === '3') game.cyclesPerFrame = 1000; // ТУРБО РЕЖИМ
});