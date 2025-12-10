// src/database.ts

import * as fs from 'fs';
import * as path from 'path';
import { Key, UserData, DBContent, PurchaseRecord } from './types';

// Vercel deployment uses process.env.DATABASE_PATH defined in vercel.json
const DB_FILE_PATH = path.join(process.cwd(), process.env.DATABASE_PATH || 'data/db.json');

class JSONDatabase {
    private data: DBContent;

    constructor() {
        this.data = this.loadData();
    }

    private loadData(): DBContent {
        try {
            if (!fs.existsSync(DB_FILE_PATH)) {
                // Initialize default structure if file does not exist
                const initialData: DBContent = { users: {}, keys: [] };
                fs.writeFileSync(DB_FILE_PATH, JSON.stringify(initialData, null, 2), 'utf8');
                return initialData;
            }
            const fileContent = fs.readFileSync(DB_FILE_PATH, 'utf8');
            return JSON.parse(fileContent);
        } catch (e) {
            console.error("Error loading/creating DB, returning default structure.", e);
            return { users: {}, keys: [] };
        }
    }

    public saveData(): void {
        fs.writeFileSync(DB_FILE_PATH, JSON.stringify(this.data, null, 2), 'utf8');
    }

    // --- User Methods ---
    getUser(id: number): UserData {
        if (!this.data.users[id]) {
            // Initialize new user with default values
            this.data.users[id] = { 
                id, 
                balance: 0, 
                purchaseHistory: [] 
            };
            this.saveData();
        }
        return this.data.users[id];
    }

    addBalance(id: number, amount: number) {
        const user = this.getUser(id); 
        user.balance += amount;
        this.saveData();
    }

    deductBalance(id: number, amount: number): boolean {
        const user = this.data.users[id];
        if (user && user.balance >= amount) {
            user.balance -= amount;
            this.saveData();
            return true;
        }
        return false;
    }

    logPurchase(userId: number, key: Key, price: number): void {
        const user = this.data.users[userId];
        if (user) {
            user.purchaseHistory.push({
                keyId: key.id,
                game: key.game,
                duration: key.duration,
                price: price,
                timestamp: Date.now()
            });
            this.saveData();
        }
    }

    // --- Key Methods ---
    addKey(game: string, duration: string, content: string) {
        this.data.keys.push({
            id: Math.random().toString(36).substr(2, 9),
            content,
            game,
            duration,
            used: false
        });
        this.saveData();
    }

    getAvailableKeyCount(game: string, duration: string): number {
        return this.data.keys.filter(k => k.game === game && k.duration === duration && !k.used).length;
    }

    fetchAndMarkKey(game: string, duration: string): Key | null {
        const keyIndex = this.data.keys.findIndex(k => k.game === game && k.duration === duration && !k.used);
        if (keyIndex > -1) {
            this.data.keys[keyIndex].used = true;
            this.saveData();
            return this.data.keys[keyIndex];
        }
        return null;
    }

    // --- Reporting ---
    getStockReport(): string {
        // ... (No change to stock report logic)
        const games = [...new Set(this.data.keys.map(k => k.game))];
        if (games.length === 0) return "No keys initialized.";

        let report = "Stock:\n";
        
        games.forEach(game => {
            report += `\n**${game}:**\n`;
            const durations = [...new Set(this.data.keys.filter(k => k.game === game).map(k => k.duration))];
            
            durations.forEach(dur => {
                const count = this.getAvailableKeyCount(game, dur);
                report += `-${dur}: ${count} keys\n`;
            });
        });
        return report;
    }
}

export const db = new JSONDatabase();
