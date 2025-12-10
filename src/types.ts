// src/types.ts

export interface Key {
    id: string;
    content: string;
    game: string;
    duration: string;
    used: boolean;
}

export interface PurchaseRecord {
    id?: number;
    user_id: number;
    key_id: string;
    game: string;
    duration: string;
    price: number;
    timestamp?: string; // Supabase returns a string
}

export interface UserData {
    id: number;
    balance: number;
    username?: string;
    referred_by?: number;
    is_banned: boolean; // <--- NEW FIELD
}