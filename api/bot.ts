// api/bot.ts

import { Telegraf } from 'telegraf';
import { VercelRequest, VercelResponse } from '@vercel/node';
import { db } from '../src/database';
import { 
    ADMIN_ID, 
    PRICES, 
    REFERRAL_BONUS,
    mainMenu, 
    gameSelectionKeyboard, 
    durationKeyboard 
} from '../src/config';

// The bot instance is initialized with the token from environment variables
const BOT_TOKEN = process.env.BOT_TOKEN || '';
const bot = new Telegraf(BOT_TOKEN);

// --- Middleware/Helper ---
const isAdmin = (id: number) => id === ADMIN_ID;

// --- COMMANDS (User Features) ---

bot.start(async (ctx) => {
    const userId = ctx.from.id;
    const user = db.getUser(userId); // Ensure user is initialized

    const message = ctx.message.text;
    
    // Referral Check (Deep-linking: /start ref_123456)
    const match = message.match(/\/start ref_(\d+)/);
    
    if (match) {
        const referrerId = parseInt(match[1]);
        
        if (referrerId === userId) {
            return ctx.reply("You cannot refer yourself!", mainMenu);
        }

        // Only process referral if user is new AND has not been referred before
        if (user.referredBy === undefined) { 
            const referrer = db.getUser(referrerId);
            
            // 1. Give bonus to referrer
            db.addBalance(referrerId, REFERRAL_BONUS);
            
            // 2. Link the new user
            user.referredBy = referrerId; 
            db.saveData();

            await ctx.replyWithMarkdown(`🎉 You were referred by user \`${referrerId}\`! User \`${referrerId}\` received a **${REFERRAL_BONUS}$** bonus.`, mainMenu);
            
            // Notify the referrer (non-critical, won't stop the main response)
            ctx.telegram.sendMessage(referrerId, `🥳 Your referral (User ID: ${userId}) just joined! You received a **${REFERRAL_BONUS}$** bonus!`).catch(e => console.error("Could not notify referrer:", e));
            
            return;
        }
    }

    ctx.reply(`Welcome ${ctx.from.first_name}! Use the buttons below to manage keys.`, mainMenu);
});

bot.hears('📦 Key Stock', (ctx) => {
    const stockMsg = db.getStockReport();
    const timestamp = new Date().toLocaleTimeString();
    ctx.reply(`Check stock ${timestamp}\n${stockMsg}`, { parse_mode: 'Markdown' });
});

bot.hears('👤 Profile', (ctx) => {
    const user = db.getUser(ctx.from.id);
    ctx.reply(`🆔 ID: \`${user.id}\`\n💰 Balance: **${user.balance}$**\n🔗 Referred By: ${user.referredBy || 'None'}`, { parse_mode: 'Markdown' });
});

bot.hears('💰 Add Fund', (ctx) => {
    ctx.reply("To add funds, please contact the admin (ID: " + ADMIN_ID + ").");
});

bot.hears('🎁 Referral', (ctx) => {
    const userId = ctx.from.id;
    // NOTE: ctx.botInfo.username is ONLY available if the bot is privacy mode disabled or public.
    const referralLink = `https://t.me/YourBotUsername?start=ref_${userId}`; 
    
    ctx.replyWithMarkdown(`🔗 **Your Personal Referral Link:**\n\n\`${referralLink}\`\n\nShare this link to earn a **${REFERRAL_BONUS}$** bonus every time a new user joins through it!`, mainMenu);
});

bot.hears('📄 History', (ctx) => {
    const user = db.getUser(ctx.from.id);
    const history = user.purchaseHistory.slice(-5).reverse(); // Show last 5, newest first

    if (history.length === 0) {
        return ctx.reply("You have no key purchase history yet.");
    }

    let msg = "📄 **Your Last 5 Purchases:**\n\n";

    history.forEach((record, index) => {
        const date = new Date(record.timestamp).toLocaleDateString();
        msg += `**${index + 1}. ${record.game}** (${record.duration})\n`;
        msg += `   Price: ${record.price}$\n`;
        msg += `   Date: ${date}\n\n`;
    });

    ctx.reply(msg, { parse_mode: 'Markdown' });
});

// --- BUY FLOW ---
bot.hears('🔑 Buy Key', (ctx) => ctx.reply("Select the Game:", gameSelectionKeyboard));

bot.action(/select_(.+)/, async (ctx) => {
    const game = ctx.match[1];
    await ctx.editMessageText(`Selected Game: **${game}**\nNow select duration:`, {
        parse_mode: 'Markdown',
        ...durationKeyboard(game)
    });
});

bot.action(/buy_(.+)_(.+)/, async (ctx) => {
    if (!ctx.from) return ctx.answerCbQuery("Error: User context missing.");
    
    const game = ctx.match[1];
    const duration = ctx.match[2];
    const price = PRICES[duration];
    const userId = ctx.from.id;
    const user = db.getUser(userId);

    const stock = db.getAvailableKeyCount(game, duration);
    if (stock <= 0) {
        return ctx.answerCbQuery(`❌ Out of stock for ${game} ${duration}`, { show_alert: true });
    }
    if (user.balance < price) {
        return ctx.answerCbQuery(`❌ Insufficient funds. Price: ${price}$, Balance: ${user.balance}$`, { show_alert: true });
    }

    if (db.deductBalance(userId, price)) {
        const key = db.fetchAndMarkKey(game, duration);
        if (key) {
            db.logPurchase(userId, key, price); // Log the transaction
            await ctx.replyWithMarkdown(`✅ **Purchase Successful!**\n\nGame: ${game}\nDuration: ${duration}\n\nKey:\n\`${key.content}\``);
            ctx.answerCbQuery("Purchase successful!");
        } else {
            db.addBalance(userId, price); // Refund in case of critical stock error
            ctx.answerCbQuery("Error fetching key. Refunded.");
        }
    }
});


// --- ADMIN COMMANDS ---

// Command: /addkey <game> <duration> <key_content>
bot.command('addkey', (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    const args = ctx.message.text.split(' ');
    if (args.length < 4) return ctx.reply("Usage: /addkey <game> <duration> <key_content>");

    db.addKey(args[1], args[2], args[3]);
    ctx.reply(`✅ Added ${args[2]} key for ${args[1]}.`);
});

// Command: /addbalance <user_id> <amount>
bot.command('addbalance', (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    const args = ctx.message.text.split(' ');
    if (args.length < 3) return ctx.reply("Usage: /addbalance <user_id> <amount>");

    const targetId = parseInt(args[1]);
    const amount = parseInt(args[2]);

    db.addBalance(targetId, amount);
    ctx.reply(`✅ Added ${amount}$ to user ${targetId}`);
});

// Handler for Bulk Key Upload (.txt file)
bot.on('document', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;

    const document = ctx.message.document;
    if (document.mime_type !== 'text/plain') {
        return ctx.reply("❌ Only plain text (.txt) files are supported for bulk upload.");
    }

    const fileId = document.file_id;
    const fileLink = await ctx.telegram.getFileLink(fileId);

    try {
        const response = await fetch(fileLink.href);
        const textContent = await response.text();
        const lines = textContent.split('\n').filter(line => line.trim() !== '');
        
        let keysAdded = 0;
        let errors = 0;

        for (const line of lines) {
            const parts = line.split('|').map(p => p.trim());
            if (parts.length === 3) {
                const [game, duration, content] = parts;
                if (content.length > 5) {
                    db.addKey(game, duration, content);
                    keysAdded++;
                } else {
                    errors++;
                }
            } else {
                errors++;
            }
        }

        ctx.reply(`✅ **Bulk Upload Complete!**\n\nKeys Added: ${keysAdded}\nFailed lines: ${errors}\n\n*Format: game|duration|key_content*`, { parse_mode: 'Markdown' });

    } catch (error) {
        console.error("File download error:", error);
        ctx.reply("❌ Failed to process file content. Check console logs.");
    }
});


// --- VERCEL HANDLER ---
// This exports the function that Vercel calls on every incoming Telegram message
export default async (req: VercelRequest, res: VercelResponse) => {
    try {
        await bot.handleUpdate(req.body);
        res.status(200).send('OK');
    } catch (e) {
        console.error('Webhook Error:', e);
        res.status(500).send('Error');
    }
};
