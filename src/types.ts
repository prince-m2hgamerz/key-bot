// src/types.ts

export interface UserData {
    id: number;
    username: string | null;
    first_name: string | null;
    balance: number;
    referred_by: number | null;
    is_banned: boolean;
}

export interface KeyData {
    id: string;
    game: string;
    duration: string;
    content: string;
    used: boolean;
}

export interface PurchaseData {
    id: string;
    user_id: number;
    key_id: string;
    game: string;
    duration: string;
    price: number;
    timestamp: string;
}