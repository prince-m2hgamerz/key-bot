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
import { UserData } from '../src/types';

// The bot instance is initialized with the token from environment variables
const BOT_TOKEN = process.env.BOT_TOKEN || '';
const bot = new Telegraf(BOT_TOKEN);

// --- Middleware/Helper ---
const isAdmin = (id: number) => id === ADMIN_ID;

// --- COMMANDS (User Features) ---

bot.start(async (ctx) => {
    const userId = ctx.from.id;
    const user = await db.getUser(userId); // Ensure user is initialized

    const message = ctx.message.text;
    
    // Referral Check (Deep-linking: /start ref_123456)
    const match = message.match(/\/start ref_(\d+)/);
    
    if (match) {
        const referrerId = parseInt(match[1]);
        
        if (referrerId === userId) {
            return ctx.reply("You cannot refer yourself!", mainMenu);
        }

        // Only process referral if user is new AND has not been referred before
        if (user.referred_by === undefined || user.referred_by === null) { 
            
            // 1. Give bonus to referrer
            await db.addBalance(referrerId, REFERRAL_BONUS);
            
            // 2. Link the new user
            await db.updateUser(userId, { referred_by: referrerId });

            await ctx.replyWithMarkdown(`🎉 You were referred by user \`${referrerId}\`! User \`${referrerId}\` received a **${REFERRAL_BONUS}$** bonus.`, mainMenu);
            
            // Notify the referrer 
            ctx.telegram.sendMessage(referrerId, `🥳 Your referral (User ID: ${userId}) just joined! You received a **${REFERRAL_BONUS}$** bonus!`).catch(e => console.error("Could not notify referrer:", e));
            
            return;
        }
    }

    ctx.reply(`Welcome ${ctx.from.first_name}! Use the buttons below to manage keys.`, mainMenu);
});

bot.hears('📦 Key Stock', async (ctx) => {
    try {
        const stockMsg = await db.getStockReport();
        const timestamp = new Date().toLocaleTimeString();
        ctx.reply(`Check stock ${timestamp}\n${stockMsg}`, { parse_mode: 'Markdown' });
    } catch (e) {
        ctx.reply("❌ Error fetching stock data.");
        console.error(e);
    }
});

bot.hears('👤 Profile', async (ctx) => {
    try {
        const user = await db.getUser(ctx.from.id);
        ctx.reply(`🆔 ID: \`${user.id}\`\n💰 Balance: **${user.balance}$**\n🔗 Referred By: ${user.referred_by || 'None'}`, { parse_mode: 'Markdown' });
    } catch (e) {
        ctx.reply("❌ Error fetching profile data.");
        console.error(e);
    }
});

bot.hears('💰 Add Fund', (ctx) => {
    ctx.reply("To add funds, please contact the admin (ID: " + ADMIN_ID + ").");
});

bot.hears('🎁 Referral', async (ctx) => {
    // Requires a bot username for the link to work correctly
    if (!ctx.botInfo.username) return ctx.reply("Error: Bot username not set.");
    const userId = ctx.from.id;
    const referralLink = `https://t.me/${ctx.botInfo.username}?start=ref_${userId}`; 
    
    ctx.replyWithMarkdown(`🔗 **Your Personal Referral Link:**\n\n\`${referralLink}\`\n\nShare this link to earn a **${REFERRAL_BONUS}$** bonus every time a new user joins through it!`, mainMenu);
});

bot.hears('📄 History', async (ctx) => {
    try {
        const history = await db.getPurchaseHistory(ctx.from.id, 5); // Show last 5

        if (history.length === 0) {
            return ctx.reply("You have no key purchase history yet.");
        }

        let msg = "📄 **Your Last 5 Purchases:**\n\n";

        history.forEach((record, index) => {
            const date = new Date(record.timestamp || 0).toLocaleDateString();
            msg += `**${index + 1}. ${record.game}** (${record.duration})\n`;
            msg += `   Price: ${record.price}$\n`;
            msg += `   Date: ${date}\n\n`;
        });

        ctx.reply(msg, { parse_mode: 'Markdown' });
    } catch (e) {
        ctx.reply("❌ Error retrieving history.");
        console.error(e);
    }
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

    try {
        const user = await db.getUser(userId);
        const stock = await db.getAvailableKeyCount(game, duration);

        if (stock <= 0) {
            return ctx.answerCbQuery(`❌ Out of stock for ${game} ${duration}`, { show_alert: true });
        }
        if (user.balance < price) {
            return ctx.answerCbQuery(`❌ Insufficient funds. Price: ${price}$, Balance: ${user.balance}$`, { show_alert: true });
        }

        if (await db.deductBalance(userId, price)) {
            const key = await db.fetchAndMarkKey(game, duration);

            if (key) {
                // Log the transaction
                await db.logPurchase({
                    user_id: userId,
                    key_id: key.id,
                    game: key.game,
                    duration: key.duration,
                    price: price
                });

                await ctx.replyWithMarkdown(`✅ **Purchase Successful!**\n\nGame: ${game}\nDuration: ${duration}\n\nKey:\n\`${key.content}\``);
                ctx.answerCbQuery("Purchase successful!");
            } else {
                await db.addBalance(userId, price); // Refund in case of critical stock error
                ctx.answerCbQuery("Error fetching key. Refunded.");
            }
        }
    } catch (e) {
        ctx.answerCbQuery("A critical database error occurred.");
        console.error("Purchase error:", e);
    }
});


// --- ADMIN COMMANDS ---

// Command: /addkey <game> <duration> <key_content>
bot.command('addkey', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    const args = ctx.message.text.split(' ');
    if (args.length < 4) return ctx.reply("Usage: /addkey <game> <duration> <key_content>");

    try {
        await db.addKey(args[1], args[2], args[3]);
        ctx.reply(`✅ Added ${args[2]} key for ${args[1]}.`);
    } catch (e) {
        ctx.reply("❌ Error adding key to DB.");
        console.error(e);
    }
});

// Command: /addbalance <user_id> <amount>
bot.command('addbalance', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    const args = ctx.message.text.split(' ');
    if (args.length < 3) return ctx.reply("Usage: /addbalance <user_id> <amount>");

    const targetId = parseInt(args[1]);
    const amount = parseInt(args[2]);

    try {
        await db.addBalance(targetId, amount);
        ctx.reply(`✅ Added ${amount}$ to user ${targetId}`);
    } catch (e) {
        ctx.reply(`❌ Error updating balance for user ${targetId}.`);
        console.error(e);
    }
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
        // Use Node's built-in fetch if available, otherwise check dependencies
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
                    await db.addKey(game, duration, content); // Asynchronous DB call
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
        console.error("File download or DB insertion error:", error);
        ctx.reply("❌ Failed to process file content or database insertion failed.");
    }
});


// --- VERCEL HANDLER ---
// This exports the function that Vercel calls on every incoming Telegram message
export default async (req: VercelRequest, res: VercelResponse) => {
    // Only handle POST requests from Telegram
    if (req.method !== 'POST' || !req.body) {
         // Respond quickly to non-Telegram requests (e.g., browser checks)
        res.status(200).send('OK'); 
        return;
    }
    
    try {
        await bot.handleUpdate(req.body);
        res.status(200).send('OK');
    } catch (e) {
        console.error('Webhook Error:', e);
        // Important: Respond with 500 so Telegram retries the message, 
        // but only if it's a critical error (which the Telegraf error handling 
        // typically prevents). We will use 500 for general failure here.
        res.status(500).send('Error');
    }
};