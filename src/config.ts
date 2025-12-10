// src/config.ts

import { Markup } from 'telegraf';
import * as dotenv from 'dotenv';
dotenv.config();

export const REFERRAL_BONUS = 50; // $50 bonus for the referrer

export const ADMIN_ID = parseInt(process.env.ADMIN_ID || '0');

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
    ['💰 Add Fund', '👤 Profile', '🎁 Referral']
]).resize();

export const gameSelectionKeyboard = Markup.inlineKeyboard([
    [Markup.button.callback('8 Ball Pool (8BP)', 'select_8BP')],
    [Markup.button.callback('Carrom', 'select_Carrom')],
    [Markup.button.callback('PUBG', 'select_PUBG')]
]);

export const durationKeyboard = (game: string) => Markup.inlineKeyboard([
    [Markup.button.callback(`1 Day (${PRICES['1-day']}$)`, `buy_${game}_1-day`)],
    [Markup.button.callback(`3 Day (${PRICES['3-day']}$)`, `buy_${game}_3-day`)],
    [Markup.button.callback(`7 Day (${PRICES['7-day']}$)`, `buy_${game}_7-day`)],
    [Markup.button.callback(`14 Day (${PRICES['14-day']}$)`, `buy_${game}_14-day`)],
    [Markup.button.callback(`30 Day (${PRICES['30-day']}$)`, `buy_${game}_30-day`)],
]);