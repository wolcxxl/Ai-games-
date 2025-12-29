class Weapon {
    constructor(name, damage, ammo, maxAmmo) {
        this.name = name;
        this.damage = damage;
        this.ammo = ammo;
        this.maxAmmo = maxAmmo;
    }

    // Возвращает true, если выстрел успешен
    fire() {
        if (this.name === 'Melee') return true; // Бесконечное
        
        if (this.ammo > 0) {
            this.ammo--;
            return true;
        }
        return false; // Патроны кончились
    }
}

class WeaponFactory {
    static createMelee() {
        return new Weapon('Melee', 10, Infinity, Infinity);
    }
    
    static createPistol() {
        return new Weapon('Pistol', 30, 12, 12);
    }
    
    static createAssaultRifle() {
        return new Weapon('Assault Rifle', 50, 30, 30);
    }
    
    static createBazooka() {
        // Базука наносит огромный урон и ломает стены (логика разрушения в game.js)
        return new Weapon('Bazooka', 200, 5, 5); 
    }
}

// Класс предметов на карте
class Item {
    constructor(type, x, y) {
        this.type = type; // 'medkit', 'shield', 'pistol', 'rifle', 'bazooka'
        this.x = x;
        this.y = y;
        this.size = 15;
        this.active = true;
    }
}