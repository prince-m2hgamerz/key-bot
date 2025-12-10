// src/database.ts

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { Key, UserData, PurchaseRecord } from './types';

// Initialize Supabase Client
const supabase: SupabaseClient = createClient(
    process.env.SUPABASE_URL || '',
    process.env.SUPABASE_ANON_KEY || ''
);

class SupabaseDatabase {

    // --- User Methods ---

    /**
     * Fetches a user or creates a new one if not found.
     */
    async getUser(id: number): Promise<UserData> {
        const { data, error } = await supabase
            .from('users')
            .select('*')
            .eq('id', id)
            .single();

        if (error && error.code === 'PGRST116') { // Not found
            const newUserData: UserData = { id, balance: 0 };
            const { data: newData, error: insertError } = await supabase
                .from('users')
                .insert([newUserData])
                .select()
                .single();
            
            if (insertError) throw insertError;
            return newData as UserData;
        }
        if (error) throw error;
        return data as UserData;
    }

    /**
     * Updates only the balance or referred_by field.
     */
    async updateUser(id: number, updates: Partial<UserData>): Promise<void> {
        const { error } = await supabase
            .from('users')
            .update(updates)
            .eq('id', id);
        if (error) throw error;
    }

    async addBalance(id: number, amount: number): Promise<void> {
        const user = await this.getUser(id);
        const newBalance = user.balance + amount;
        await this.updateUser(id, { balance: newBalance });
    }

    async deductBalance(id: number, amount: number): Promise<boolean> {
        const user = await this.getUser(id);
        if (user.balance >= amount) {
            const newBalance = user.balance - amount;
            await this.updateUser(id, { balance: newBalance });
            return true;
        }
        return false;
    }
    
    // --- Purchase History Methods ---

    async logPurchase(record: Omit<PurchaseRecord, 'id' | 'timestamp'>): Promise<void> {
        const { error } = await supabase
            .from('purchase_history')
            .insert([record]);
        if (error) throw error;
    }

    async getPurchaseHistory(userId: number, limit: number = 5): Promise<PurchaseRecord[]> {
        const { data, error } = await supabase
            .from('purchase_history')
            .select('*')
            .eq('user_id', userId)
            .order('timestamp', { ascending: false })
            .limit(limit);
        
        if (error) throw error;
        return data as PurchaseRecord[];
    }

    // --- Key Methods ---

    async addKey(game: string, duration: string, content: string): Promise<void> {
        const key: Key = {
            id: Math.random().toString(36).substr(2, 9),
            content,
            game,
            duration,
            used: false
        };
        const { error } = await supabase
            .from('keys')
            .insert([key]);
        if (error) throw error;
    }

    async getAvailableKeyCount(game: string, duration: string): Promise<number> {
        const { count, error } = await supabase
            .from('keys')
            .select('*', { count: 'exact', head: true })
            .eq('game', game)
            .eq('duration', duration)
            .eq('used', false);
        
        if (error) throw error;
        return count || 0;
    }

    async fetchAndMarkKey(game: string, duration: string): Promise<Key | null> {
        // 1. Fetch one unused key
        const { data: keyData, error: fetchError } = await supabase
            .from('keys')
            .select('*')
            .eq('game', game)
            .eq('duration', duration)
            .eq('used', false)
            .limit(1)
            .single();

        if (fetchError || !keyData) return null;

        // 2. Mark it as used
        const { error: updateError } = await supabase
            .from('keys')
            .update({ used: true })
            .eq('id', keyData.id);

        if (updateError) throw updateError;
        
        return keyData as Key;
    }

    // --- Reporting ---

    async getStockReport(): Promise<string> {
        const { data: keys, error } = await supabase
            .from('keys')
            .select('game, duration, used');
        
        if (error) throw error;

        const stockMap = new Map<string, number>();

        (keys as Pick<Key, 'game'|'duration'|'used'>[]).forEach(key => {
            if (!key.used) {
                const keyId = `${key.game}:${key.duration}`;
                stockMap.set(keyId, (stockMap.get(keyId) || 0) + 1);
            }
        });

        if (stockMap.size === 0) return "No keys initialized or all are used.";

        let report = "Stock:\n";
        
        for (const [keyId, count] of stockMap.entries()) {
            const [game, dur] = keyId.split(':');
            report += `\n**${game}** (${dur}): ${count} keys\n`;
        }
        return report;
    }
}

export const db = new SupabaseDatabase();