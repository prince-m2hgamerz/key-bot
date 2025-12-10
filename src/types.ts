// src/types.ts

export interface Key {
    id: string;
    content: string;
    game: string;
    duration: string;
    used: boolean;
}

export interface PurchaseRecord {
    keyId: string;
    game: string;
    duration: string;
    price: number;
    timestamp: number;
}

export interface UserData {
    id: number;
    balance: number;
    username?: string;
    purchaseHistory: PurchaseRecord[];
    referredBy?: number; // Added for referral tracking
}

export interface DBContent {
    users: Record<number, UserData>;
    keys: Key[];
}
