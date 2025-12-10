// api/bot.ts

import { Telegraf } from 'telegraf';
import { VercelRequest, VercelResponse } from '@vercel/node';
import { db } from '../src/database';
import { 
    ADMIN_ID, 
    ADMIN_USERNAME, 
    PRICES, 
    REFERRAL_BONUS,
    mainMenu, 
    adminMenu, 
    gameSelectionKeyboard, 
    durationKeyboard 
} from '../src/config';
import { UserData } from '../src/types';

const BOT_TOKEN = process.env.BOT_TOKEN || '';
const bot = new Telegraf(BOT_TOKEN);

// --- Middleware/Helper ---
const isAdmin = (id: number) => id === ADMIN_ID;

/**
 * Escapes Markdown V2 characters in a string to prevent "Can't parse entities" errors.
 */
const escapeMarkdown = (text: string): string => {
    return text
        .replace(/_/g, '\\_')
        .replace(/\*/g, '\\*')
        .replace(/\[/g, '\\[')
        .replace(/\]/g, '\\]')
        .replace(/\(/g, '\\(')
        .replace(/\)/g, '\\)')
        .replace(/~/g, '\\~')
        .replace(/`/g, '\\`')
        .replace(/>/g, '\\>')
        .replace(/#/g, '\\#')
        .replace(/\+/g, '\\+')
        .replace(/-/g, '\\-')
        .replace(/=/g, '\\=')
        .replace(/\|/g, '\\|')
        .replace(/\{/g, '\\{')
        .replace(/\}/g, '\\}')
        .replace(/\./g, '\\.')
        .replace(/!/g, '\\!');
};


// --- COMMANDS (User Features) ---

bot.start(async (ctx) => {
    const userId = ctx.from.id;
    const user = await db.getUser(userId); 

    if (user.is_banned) {
        return ctx.reply("⛔ You have been banned from using this bot.");
    }
    
    // Referral Check (Logic remains the same)
    const message = ctx.message.text;
    const match = message.match(/\/start ref_(\d+)/);
    
    if (match) {
        // ... [Referral processing logic] ...
        const referrerId = parseInt(match[1]);
        if (referrerId !== userId && (user.referred_by === undefined || user.referred_by === null)) { 
            await db.addBalance(referrerId, REFERRAL_BONUS);
            await db.updateUser(userId, { referred_by: referrerId });

            await ctx.replyWithMarkdown(`🎉 You were referred by user \`${referrerId}\`! User \`${referrerId}\` received a **${REFERRAL_BONUS}$** bonus.`, mainMenu);
            
            ctx.telegram.sendMessage(referrerId, `🥳 Your referral (User ID: ${userId}) just joined! You received a **${REFERRAL_BONUS}$** bonus!`).catch(e => console.error("Could not notify referrer:", e));
            
            return;
        }
    }
    
    // Check if the user is the admin and set the correct menu
    const menu = isAdmin(userId) ? adminMenu : mainMenu;
    ctx.reply(`Welcome ${ctx.from.first_name}! Use the buttons below to manage keys.`, menu);
});

// --- NEW COMMAND: /admin (Switches to Admin Keyboard) ---
bot.command('admin', (ctx) => {
    if (isAdmin(ctx.from.id)) {
        ctx.reply("Switched to Admin Menu. Use the '/adminhelp' button for commands.", adminMenu);
    } else {
        ctx.reply("❌ Access denied.");
    }
});

// --- UPDATED: User Help Button Handler ---
bot.hears('❓ User Help', async (ctx) => {
    const user = await db.getUser(ctx.from.id);
    if (user.is_banned) return ctx.reply("⛔ Action denied. You are banned.");

    const helpMessage = `
**🤖 User Help & Information**

🔑 **Buy Key**: Browse available games and key durations.
📦 **Key Stock**: See the current count of all available keys.
📄 **History**: View your last 5 purchase records.
💰 **Add Fund**: Shows admin contact info for manual funding.
👤 **Profile**: View your ID, Balance, and Referral status.
🎁 **Referral**: Get your link to earn bonuses by inviting new users.

If you have technical issues, please contact the admin via the 'Add Fund' option.
    `;
    ctx.replyWithMarkdown(helpMessage, mainMenu);
});

bot.hears('📦 Key Stock', async (ctx) => {
    try {
        const user = await db.getUser(ctx.from.id);
        if (user.is_banned) return ctx.reply("⛔ Action denied. You are banned.");
        
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
        const banStatus = user.is_banned ? '⛔ BANNED' : '✅ Active'; 
        ctx.reply(`🆔 ID: \`${user.id}\`\n💰 Balance: **${user.balance}$**\n🔗 Referred By: ${user.referred_by || 'None'}\n\nStatus: ${banStatus}`, { parse_mode: 'Markdown' });
    } catch (e) {
        ctx.reply("❌ Error fetching profile data.");
        console.error(e);
    }
});

// --- UPDATED FEATURE: Add Fund Message (No Change, already fixed) ---
bot.hears('💰 Add Fund', (ctx) => {
    const msg = `
**💰 Fund Addition**

To add funds to your account, please contact the administrator:

👤 **Username:** @${ADMIN_USERNAME}
🆔 **Chat ID:** \`${ADMIN_ID}\`

Send them the payment details, and they will manually update your balance using the Chat ID above.
    `;
    ctx.replyWithMarkdown(msg);
});

bot.hears('🎁 Referral', async (ctx) => {
    const user = await db.getUser(ctx.from.id);
    if (user.is_banned) return ctx.reply("⛔ Action denied. You are banned.");

    if (!ctx.botInfo.username) return ctx.reply("Error: Bot username not set.");
    const userId = ctx.from.id;
    const referralLink = `https://t.me/${ctx.botInfo.username}?start=ref_${userId}`; 
    
    ctx.replyWithMarkdown(`🔗 **Your Personal Referral Link:**\n\n\`${referralLink}\`\n\nShare this link to earn a **${REFERRAL_BONUS}$** bonus every time a new user joins through it!`, mainMenu);
});

bot.hears('📄 History', async (ctx) => {
    const user = await db.getUser(ctx.from.id);
    if (user.is_banned) return ctx.reply("⛔ Action denied. You are banned.");
    
    try {
        const history = await db.getPurchaseHistory(ctx.from.id, 5);

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

// --- BUY FLOW (No Functional Change, includes ban check) ---
bot.hears('🔑 Buy Key', async (ctx) => {
    const user = await db.getUser(ctx.from.id);
    if (user.is_banned) return ctx.reply("⛔ Action denied. You are banned.");
    ctx.reply("Select the Game:", gameSelectionKeyboard)
});

bot.action(/select_(.+)/, async (ctx) => {
    const user = await db.getUser(ctx.from!.id);
    if (user.is_banned) return ctx.answerCbQuery("⛔ Action denied. You are banned.", { show_alert: true });

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
        if (user.is_banned) return ctx.answerCbQuery("⛔ Purchase denied. You are banned.", { show_alert: true });

        // ... [Balance and Stock checks] ...
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
                await db.logPurchase({
                    user_id: userId,
                    key_id: key.id,
                    game: key.game,
                    duration: key.duration,
                    price: price
                });

                const safeKeyContent = escapeMarkdown(key.content);
                
                await ctx.replyWithMarkdown(`✅ **Purchase Successful!**\n\nGame: ${game}\nDuration: ${duration}\n\nKey:\n\`${safeKeyContent}\``);
                ctx.answerCbQuery("Purchase successful!");
            } else {
                await db.addBalance(userId, price); 
                ctx.answerCbQuery("Error fetching key. Refunded.");
            }
        }
    } catch (e) {
        ctx.answerCbQuery("A critical database error occurred.");
        console.error("Purchase error:", e);
    }
});


// --- ADMIN COMMANDS ---

// --- FIXED: Admin Help Command Handler (Only Admin Access) ---
bot.command('adminhelp', (ctx) => {
    if (!isAdmin(ctx.from.id)) {
        return ctx.reply("❌ Access denied. This command is for administrators only.");
    }
    
    const adminHelpMessage = `
👮 **ADMIN MENU COMMANDS**
-------------------------------
**Inventory Management:**
/addkey <game> <duration> <key\_content> - Add one key.
*Send a **.txt file*** (\`game|duration|key\`) - Bulk add keys.
/searchkey <key\_content> - Search DB for status of a specific key. 

**User Management:**
/addbalance <user\_id> <amount> - Add funds to a user.
/ban <user\_id> - Ban a user from using the bot.
/unban <user\_id> - Unban a previously banned user.
    `;
    ctx.replyWithMarkdown(adminHelpMessage, adminMenu);
});


// --- Key Search Command ---
bot.command('searchkey', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    const args = ctx.message.text.split(' ');
    if (args.length < 2) return ctx.reply("Usage: /searchkey <key_content>");

    const keyContent = args.slice(1).join(' ').trim();

    try {
        const key = await db.findKeyByContent(keyContent);

        if (key) {
            const status = key.used ? '🔴 USED' : '🟢 AVAILABLE';
            const safeKeyContent = escapeMarkdown(key.content);

            ctx.replyWithMarkdown(
                `🔎 **Key Found!**\n` +
                `ID: \`${key.id}\`\n` +
                `Content: \`${safeKeyContent}\`\n` + 
                `Game: ${key.game}\n` +
                `Duration: ${key.duration}\n` +
                `Status: **${status}**`
            );
        } else {
            const safeKeyContent = escapeMarkdown(keyContent);
            ctx.reply(`❌ Key content \`${safeKeyContent}\` not found in the database.`, { parse_mode: 'Markdown' });
        }
    } catch (e) {
        ctx.reply("❌ Error searching for key.");
        console.error(e);
    }
});


// --- Ban/Unban Commands ---
bot.command('ban', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    const args = ctx.message.text.split(' ');
    if (args.length < 2) return ctx.reply("Usage: /ban <user_id>");

    const targetId = parseInt(args[1]);

    try {
        await db.banUser(targetId, true);
        ctx.reply(`✅ User ID ${targetId} has been **BANNED** and cannot make purchases.`);
        ctx.telegram.sendMessage(targetId, "⛔ You have been banned from using this bot by the administrator.").catch(() => {});
    } catch (e) {
        ctx.reply(`❌ Error banning user ${targetId}.`);
        console.error(e);
    }
});

bot.command('unban', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    const args = ctx.message.text.split(' ');
    if (args.length < 2) return ctx.reply("Usage: /unban <user_id>");

    const targetId = parseInt(args[1]);

    try {
        await db.banUser(targetId, false);
        ctx.reply(`✅ User ID ${targetId} has been **UNBANNED** and can resume bot usage.`);
        ctx.telegram.sendMessage(targetId, "✅ You have been unbanned by the administrator.").catch(() => {});
    } catch (e) {
        ctx.reply(`❌ Error unbanning user ${targetId}.`);
        console.error(e);
    }
});


// --- Existing Admin Commands ---
bot.command('addkey', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    const parts = ctx.message.text.split(' ');
    if (parts.length < 4) return ctx.reply("Usage: /addkey <game> <duration> <key_content>");

    const game = parts[1];
    const duration = parts[2];
    const content = parts.slice(3).join(' '); 

    try {
        await db.addKey(game, duration, content);
        const safeContent = escapeMarkdown(content);
        
        ctx.replyWithMarkdown(`✅ Added **${duration}** key for **${game}**.\nContent: \`${safeContent}\``);
    } catch (e) {
        ctx.reply("❌ Error adding key to DB.");
        console.error(e);
    }
});

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
                    await db.addKey(game, duration, content); 
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
export default async (req: VercelRequest, res: VercelResponse) => {
    if (req.method !== 'POST' || !req.body) {
        res.status(200).send('OK'); 
        return;
    }
    
    try {
        await bot.handleUpdate(req.body);
        res.status(200).send('OK');
    } catch (e) {
        console.error('Webhook Error:', e);
        res.status(500).send('Error');
    }
};