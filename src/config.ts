// src/config.ts

import { Markup } from 'telegraf';
import * as dotenv from 'dotenv';
dotenv.config();

export const REFERRAL_BONUS = 50; 

export const ADMIN_ID = parseInt(process.env.ADMIN_ID || '0');
export const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin_user'; 

export const PRICES: Record<string, number> = {
    '1-day': 100,
    '3-day': 250,
    '7-day': 500,
    '14-day': 900,
    '30-day': 1800
};

// Keyboards
export const mainMenu = Markup.keyboard([
    ['🔑 Buy Key', '📦 Key Stock', '📄 History'],
    ['💰 Add Fund', '👤 Profile', '🎁 Referral'],
    ['❓ User Help'] 
]).resize();

export const adminMenu = Markup.keyboard([
    ['🔑 Buy Key', '📦 Key Stock', '📄 History'],
    ['💰 Add Fund', '👤 Profile', '🎁 Referral'],
    ['/adminhelp', '/games'] 
]).resize();

// Dynamic Game Selection Keyboard Function (Receives list from DB)
export const gameSelectionKeyboard = (gameList: { name: string }[]) => {
    const buttons = gameList.map(game => 
        [Markup.button.callback(game.name, `select_${game.name}`)]
    );
    return Markup.inlineKeyboard(buttons);
};

export const durationKeyboard = (game: string) => Markup.inlineKeyboard([
    [Markup.button.callback(`1 Day (${PRICES['1-day']}$)`, `buy_${game}_1-day`)],
    [Markup.button.callback(`3 Day (${PRICES['3-day']}$)`, `buy_${game}_3-day`)],
    [Markup.button.callback(`7 Day (${PRICES['7-day']}$)`, `buy_${game}_7-day`)],
    [Markup.button.callback(`14 Day (${PRICES['14-day']}$)`, `buy_${game}_14-day`)],
    [Markup.button.callback(`30 Day (${PRICES['30-day']}$)`, `buy_${game}_30-day`)],
]);