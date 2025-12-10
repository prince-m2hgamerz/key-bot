// src/database.ts

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { UserData, KeyData, PurchaseData } from './types';

// Use SUPABASE_ANON_KEY as requested
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY; 

// The critical environment check
if (!supabaseUrl || !supabaseKey) {
    // THROW ERROR HERE: This is where the execution stops if variables are missing on Vercel
    throw new Error("SUPABASE_URL and SUPABASE_ANON_KEY environment variables must be set.");
}

// Declare Supabase client with the required types
const supabase: SupabaseClient = createClient(
    supabaseUrl,
    supabaseKey
);

interface Game {
    name: string;
}

export const db = {
    // --- User Management ---
    
    // ... (rest of the functions: getUser, addUser, addBalance, etc. remain unchanged) ...

    async getUser(id: number): Promise<UserData> {
        let { data, error } = await supabase
            .from('users')
            .select('*')
            .eq('id', id)
            .single();

        if (error && error.code === 'PGRST116') { // No rows found
            return await db.addUser(id);
        }
        if (error) {
            console.error('Error fetching user:', error);
            throw new Error('Database error fetching user.');
        }
        return data as UserData;
    },

    async addUser(id: number): Promise<UserData> {
        const newUser: Partial<UserData> = { id, balance: 0, is_banned: false };
        const { data, error } = await supabase
            .from('users')
            .insert(newUser)
            .select()
            .single();

        if (error) {
            console.error('Error adding user:', error);
            throw new Error('Database error adding user.');
        }
        return data as UserData;
    },

    async updateUser(id: number, updates: Partial<UserData>): Promise<void> {
        const { error } = await supabase
            .from('users')
            .update(updates)
            .eq('id', id);

        if (error) {
            console.error('Error updating user:', error);
            throw new Error('Database error updating user.');
        }
    },

    async addBalance(id: number, amount: number): Promise<void> {
        const user = await db.getUser(id);
        const newBalance = user.balance + amount;

        const { error } = await supabase
            .from('users')
            .update({ balance: newBalance })
            .eq('id', id);

        if (error) {
            console.error('Error adding balance:', error);
            throw new Error('Database error adding balance.');
        }
    },

    async deductBalance(id: number, amount: number): Promise<boolean> {
        const user = await db.getUser(id);
        if (user.balance < amount) return false;

        const newBalance = user.balance - amount;
        
        const { error } = await supabase
            .from('users')
            .update({ balance: newBalance })
            .eq('id', id);

        if (error) {
            console.error('Error deducting balance:', error);
            throw new Error('Database error deducting balance.');
        }
        return true;
    },

    async banUser(id: number, is_banned: boolean): Promise<void> {
        const { error } = await supabase
            .from('users')
            .update({ is_banned })
            .eq('id', id);

        if (error) {
            console.error('Error setting ban status:', error);
            throw new Error('Database error setting ban status.');
        }
    },

    // --- Key Management ---
    
    async addKey(game: string, duration: string, content: string): Promise<void> {
        const { error } = await supabase
            .from('keys')
            .insert({ game, duration, content });
        
        if (error) {
            console.error('Error adding key:', error);
            throw new Error('Database error adding key.');
        }
    },

    async getAvailableKeyCount(game: string, duration: string): Promise<number> {
        const { count, error } = await supabase
            .from('keys')
            .select('*', { count: 'exact', head: true })
            .eq('game', game)
            .eq('duration', duration)
            .eq('used', false);
        
        if (error) {
            console.error('Error counting keys:', error);
            return 0;
        }
        return count || 0;
    },

    async getStockReport(): Promise<string> {
        const { data, error } = await supabase
            .from('keys')
            .select('game, duration', { count: 'exact' })
            .eq('used', false);

        if (error) {
            console.error('Error fetching stock report:', error);
            return "Error retrieving stock data.";
        }

        const counts: Record<string, number> = {};
        if (data) {
            data.forEach(key => {
                const keyString = `${key.game} (${key.duration})`;
                counts[keyString] = (counts[keyString] || 0) + 1;
            });
        }

        let report = '📦 **Current Key Stock:**\n';
        for (const key in counts) {
            report += `\n- ${key}: \`${counts[key]}\``;
        }
        return report;
    },

    async fetchAndMarkKey(game: string, duration: string): Promise<KeyData | null> {
        // 1. Fetch one available key
        let { data: keys, error: fetchError } = await supabase
            .from('keys')
            .select('*')
            .eq('game', game)
            .eq('duration', duration)
            .eq('used', false)
            .limit(1);

        if (fetchError || !keys || keys.length === 0) {
            return null;
        }

        const key = keys[0];

        // 2. Mark the key as used
        const { error: updateError } = await supabase
            .from('keys')
            .update({ used: true })
            .eq('id', key.id);

        if (updateError) {
            console.error('Error marking key as used:', updateError);
            return null;
        }

        return key as KeyData;
    },

    async findKeyByContent(content: string): Promise<KeyData | null> {
        const { data, error } = await supabase
            .from('keys')
            .select('*')
            .eq('content', content)
            .single();

        if (error && error.code === 'PGRST116') return null; // Not found
        if (error) {
            console.error('Error searching key:', error);
            throw new Error('Database error searching key.');
        }
        return data as KeyData;
    },

    // --- Purchase History ---
    
    async logPurchase(purchase: Omit<PurchaseData, 'id' | 'timestamp'>): Promise<void> {
        const { error } = await supabase
            .from('purchases')
            .insert(purchase);

        if (error) {
            console.error('Error logging purchase:', error);
            throw new Error('Database error logging purchase.');
        }
    },

    async getPurchaseHistory(userId: number, limit: number = 5): Promise<PurchaseData[]> {
        const { data, error } = await supabase
            .from('purchases')
            .select('*')
            .eq('user_id', userId)
            .order('timestamp', { ascending: false })
            .limit(limit);

        if (error) {
            console.error('Error fetching history:', error);
            return [];
        }
        return data as PurchaseData[];
    },

    // --- Game Management Functions ---
    
    async addGame(name: string): Promise<boolean> {
        const { error } = await supabase.from('games').insert({ name });
        // Error code '23505' means duplicate key (game already exists)
        if (error && error.code !== '23505') { 
            console.error('Error adding game:', error);
            return false;
        }
        return !error || error.code === '23505';
    },

    async getGameList(): Promise<Game[]> {
        const { data, error } = await supabase.from('games').select('name');
        if (error) {
            console.error('Error fetching game list:', error);
            return [];
        }
        return (data as Game[]) || [];
    },
};