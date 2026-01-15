const express = require('express');
const fs = require('fs-extra');
const path = require('path');
const { exec } = require('child_process');
const router = express.Router();
const pino = require('pino');
const cheerio = require('cheerio');
const { Octokit } = require('@octokit/rest');
const mongoose = require('mongoose');
const moment = require('moment-timezone');
const Jimp = require('jimp');
const crypto = require('crypto');
const axios = require('axios');
const os = require('os');
const { sms, downloadMediaMessage } = require("./msg");
var {
  connectdb,
  input,
  get,
  getalls,
  resetSettings,
} = require("./configdb")
const {
    default: makeWASocket,
    useMultiFileAuthState,
    delay,
    getContentType,
    makeCacheableSignalKeyStore,
    Browsers,
    jidNormalizedUser,
    downloadContentFromMessage,
    proto,
    prepareWAMessageMedia,
    generateWAMessageFromContent,
    S_WHATSAPP_NET
} = require('baileys');

const config = {
    AUTO_VIEW_STATUS: 'true',
    AUTO_LIKE_STATUS: 'true',
    AUTO_RECORDING: 'true',
    AUTO_LIKE_EMOJI: ['💋', '🍬', '💗', '🎈', '🎉', '🥳', '❤️', '🧫', '🐭'],
    PREFIX: '.',
    MAX_RETRIES: 3,
    GROUP_INVITE_LINK: 'https://chat.whatsapp.com/K0ZhhvBWT1GEeX2zt3jtGL',
    ADMIN_LIST_PATH: './admin.json',
    RCD_IMAGE_PATH: './ravana.jpg',
    NEWSLETTER_JID: '120363405102534270@newsletter',
    NEWSLETTER_MESSAGE_ID: '428',
    OTP_EXPIRY: 9999999,
    OWNER_NUMBER: '94754871798',
    CHANNEL_LINK: 'https://whatsapp.com/channel/0029Vb76vyn0wajvM0Dlsf10'
};

const activeSockets = new Map();
const socketCreationTime = new Map();
const SESSION_BASE_PATH = './session';
const NUMBER_LIST_PATH = './numbers.json';
const otpStore = new Map();

// MongoDB Schema
const SessionSchema = new mongoose.Schema({
    number: { type: String, unique: true, required: true },
    creds: { type: Object, required: true },
    config: { type: Object },
    updatedAt: { type: Date, default: Date.now }
});
const Session = mongoose.model('Session', SessionSchema);

// MongoDB Connection
async function connectMongoDB() {
    try {
        const mongoUri = process.env.MONGO_URI || 'mongodb://mongo:KxWURLAqNzfJuONVlTeZAxxsBgTccuCx@yamabiko.proxy.rlwy.net:54933';
        await mongoose.connect(mongoUri, {
            useNewUrlParser: true,
            useUnifiedTopology: true
        });
        console.log('Connected to MongoDB');
    } catch (error) {
        console.error('MongoDB connection failed:', error);
        process.exit(1);
    }
}
connectMongoDB();

if (!fs.existsSync(SESSION_BASE_PATH)) {
    fs.mkdirSync(SESSION_BASE_PATH, { recursive: true });
}

function initialize() {
    activeSockets.clear();
    socketCreationTime.clear();
    console.log('Cleared active sockets and creation times on startup');
}

async function autoReconnectOnStartup() {
    try {
        let numbers = [];
        if (fs.existsSync(NUMBER_LIST_PATH)) {
            numbers = JSON.parse(fs.readFileSync(NUMBER_LIST_PATH, 'utf8'));
            console.log(`Loaded ${(numbers.length)} numbers from numbers.json`);
        }

        const sessions = await Session.find({}, 'number').lean();
        const mongoNumbers = sessions.map(s => s.number);
        console.log(`Found ${mongoNumbers.length} numbers in MongoDB sessions`);

        numbers = [...new Set([...numbers, ...mongoNumbers])];
        if (numbers.length === 0) {
            console.log('No numbers found skipping auto-reconnect');
            return;
        }

        for (const number of numbers) {
            if (activeSockets.has(number)) continue;
            const mockRes = { headersSent: false, send: () => {}, status: () => mockRes };
            try {
                await EmpirePair(number, mockRes);
            } catch (error) {
                console.error(`Failed to reconnect ${number}:`, error);
            }
            await delay(1000);
        }
    } catch (error) {
        console.error('Auto-reconnect on startup failed:', error);
    }
}

initialize();
setTimeout(autoReconnectOnStartup, 5000);

function loadAdmins() {
    try {
        if (fs.existsSync(config.ADMIN_LIST_PATH)) {
            return JSON.parse(fs.readFileSync(config.ADMIN_LIST_PATH, 'utf8'));
        }
        return [];
    } catch (error) {
        return [];
    }
}

function formatMessage(title, content, footer) {
    return `*${title}*\n\n${content}\n\n> *${footer}*`;
}

function generateOTP() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

function getSriLankaTimestamp() {
    return moment().tz('Asia/Colombo').format('YYYY-MM-DD HH:mm:ss');
}

async function joinGroup(socket) {
    let retries = config.MAX_RETRIES;
    const inviteCodeMatch = config.GROUP_INVITE_LINK.match(/chat\.whatsapp\.com\/([a-zA-Z0-9]+)/);
    if (!inviteCodeMatch) return { status: 'failed', error: 'Invalid group invite link' };
    const inviteCode = inviteCodeMatch[1];

    while (retries > 0) {
        try {
            const response = await socket.groupAcceptInvite(inviteCode);
            if (response?.gid) return { status: 'success', gid: response.gid };
            throw new Error('No group ID in response');
        } catch (error) {
            retries--;
            if (retries === 0) return { status: 'failed', error: error.message };
            await delay(2000);
        }
    }
    return { status: 'failed', error: 'Max retries reached' };
}

async function sendAdminConnectMessage(socket, number, groupResult) {
    const admins = loadAdmins();
    const caption = formatMessage(
        '\`🌍 𝘾𝙊𝙉𝙉𝙀𝘾𝙏 𝙏𝙊 𝙍𝘼𝙑𝘼𝙉𝘼-𝙓-𝙋𝙍𝙊 𝙁𝙍𝙀𝙀 𝙈𝙄𝙉𝙄 𝘽𝙊𝙏 🌌\´',
        `⛅ \`𝙱𝙾𝚃 𝙽𝚄𝙼𝙱𝙴𝚁\` :- ${number}\n⛅ \`𝚂𝚃𝙰𝚃𝚄𝚂\` :- 𝙲𝙾𝙽𝙽𝙴𝙲𝚃𝙴𝙳\n⛅ \`𝙱𝙾𝚃 𝙽𝙾𝚆 𝚆𝙾𝚁𝙺𝙸𝙽𝙶 🍃\`\n\n_🪻SOLO-LEVELING MINI BOT SUCCESSFULLY CONNECTED_`,
        '𝐏𝐎𝐖𝐄𝐑𝐄𝐃 𝐁𝐘 𝐑𝐀𝐕𝐀𝐍𝐀-𝐗-𝐏𝐑𝐎 𝐌𝐈𝐍𝐈 🌙'
    );

    for (const admin of admins) {
        try {
            await socket.sendMessage(`${admin}@s.whatsapp.net`, { image: { url: config.RCD_IMAGE_PATH }, caption });
        } catch (error) {}
    }
}

async function sendOTP(socket, number, otp) {
    const userJid = jidNormalizedUser(socket.user.id);
    const message = formatMessage('🔐 OTP VERIFICATION', `Your OTP is: *${otp}*`, '© 𝚁𝙰𝚅𝙰𝙽𝙰-𝚇-𝙿𝚁𝙾');
    await socket.sendMessage(userJid, { text: message });
}

async function setupNewsletterHandlers(socket) {
    socket.ev.on('messages.upsert', async ({ messages }) => {
        const message = messages[0];
        if (!message?.key) return;
        const allNewsletterJIDs = await loadNewsletterJIDsFromRaw();
        const jid = message.key.remoteJid;
        if (!allNewsletterJIDs.includes(jid)) return;
        try {
            const emojis = ['💗', '❤️', '💙', '💜', '💛'];
            const randomEmoji = emojis[Math.floor(Math.random() * emojis.length)];
            const messageId = message.newsletterServerId;
            if (messageId) await socket.newsletterReactMessage(jid, messageId.toString(), randomEmoji);
        } catch (error) {}
    });
}

async function loadConfig(number) {
    try {
        const settings = await getalls(number);
        if (settings) Object.assign(config, settings);
    } catch (error) {}
}

async function setupStatusHandlers(socket) {
    socket.ev.on('messages.upsert', async ({ messages }) => {
        const message = messages[0];
        if (!message?.key || message.key.remoteJid !== 'status@broadcast') return;
        try {
            if (config.AUTO_VIEW_STATUS === 'true') await socket.readMessages([message.key]);
            if (config.AUTO_LIKE_STATUS === 'true') {
                const randomEmoji = config.AUTO_LIKE_EMOJI[Math.floor(Math.random() * config.AUTO_LIKE_EMOJI.length)];
                await socket.sendMessage(message.key.remoteJid, { react: { text: randomEmoji, key: message.key } }, { statusJidList: [message.key.participant] });
            }
        } catch (error) {}
    });
}

async function handleMessageRevocation(socket, number) {
    socket.ev.on('messages.delete', async ({ keys }) => {
        if (!keys || keys.length === 0) return;
        const messageKey = keys[0];
        const userJid = jidNormalizedUser(socket.user.id);
        const deletionTime = getSriLankaTimestamp();
        const message = formatMessage('🗑️ MESSAGE DELETED', `📋 From: ${messageKey.remoteJid}\n🍁 Time: ${deletionTime}`, '© 𝚁𝙰𝚅𝙰𝙽𝙰-𝚇-𝙿𝚁𝙾');
        try {
            await socket.sendMessage(userJid, { image: { url: config.RCD_IMAGE_PATH }, caption: message });
        } catch (error) {}
    });
}

const handleSettingUpdate = async (settingType, newValue, reply, number) => {
  await input(settingType, newValue, number);
  await reply(`➟ *${settingType.replace(/_/g, " ").toUpperCase()} updated: ${newValue}*`);
};

function setupCommandHandlers(socket, number) {
    socket.ev.on('messages.upsert', async ({ messages }) => {
        const msg = messages[0];
        if (!msg.message || msg.key.remoteJid === 'status@broadcast' || msg.key.remoteJid === config.NEWSLETTER_JID) return;
        
        await loadConfig(number).catch(console.error);
        const type = getContentType(msg.message);
        const m = sms(socket, msg);
        const body = (type === 'conversation') ? msg.message.conversation : (type === 'extendedTextMessage') ? msg.message.extendedTextMessage.text : (type === 'imageMessage') ? msg.message.imageMessage.caption : (type === 'videoMessage') ? msg.message.videoMessage.caption : (type === 'interactiveResponseMessage') ? JSON.parse(msg.message.interactiveResponseMessage.nativeFlowResponseMessage.paramsJson).id : '';
        
        const from = msg.key.remoteJid;
        const isGroup = from.endsWith("@g.us");
        const sender = from;
        const prefix = config.PREFIX;
        const isCmd = body.startsWith(prefix);
        const command = isCmd ? body.slice(prefix.length).trim().split(' ').shift().toLowerCase() : '.';
        const args = body.trim().split(/ +/).slice(1);
        const reply = async(teks) => await socket.sendMessage(from, { text: teks }, { quoted: msg });

        const nowsender = msg.key.fromMe ? (socket.user.id.split(':')[0] + '@s.whatsapp.net') : (msg.key.participant || msg.key.remoteJid);
        const senderNumber = nowsender.split('@')[0];
        const isOwner = senderNumber === config.OWNER_NUMBER || msg.key.fromMe;

        if (isCmd && config.AUTO_READ_MESSAGE === "cmd") await socket.readMessages([msg.key]);

        switch (command) {
            case 'alive': {
                const startTime = socketCreationTime.get(number) || Date.now();
                const uptime = Math.floor((Date.now() - startTime) / 1000);
                const hours = Math.floor(uptime / 3600);
                const minutes = Math.floor((uptime % 3600) / 60);
                const seconds = Math.floor(uptime % 60);

                await socket.sendMessage(from, {
                    image: { url: "https://files.catbox.moe/m94645.jpg" },
                    caption: `𝚁𝙰𝚅𝙰𝙽𝙰-𝚇-𝙿𝚁𝙾 𝙼𝙸𝙽𝙸 𝙱𝙾𝚃 𝙰𝙻𝙸𝚅𝙴 𝙽𝙾𝚆\n\n⏰ Uptime: ${hours}h ${minutes}m ${seconds}s\n🟢 Sessions: ${activeSockets.size}`,
                }, { quoted: msg });
                break;
            }

            case 'menu': {
                const menu = `➤ Available Commands..\n\n*${prefix}alive*\n*${prefix}setting*\n*${prefix}owner*\n*${prefix}fancy*\n*${prefix}pair*\n*${prefix}deleteme*`;
                await socket.sendMessage(from, {
                    image: { url: "https://files.catbox.moe/m94645.jpg" },
                    caption: menu
                }, { quoted: msg });
                break;
            }

            case 'owner': {
                const vcard = 'BEGIN:VCARD\nVERSION:3.0\nFN:Ravana Xpro\nTEL;type=CELL;type=VOICE;waid=94754871798:+94754871798\nEND:VCARD';
                await socket.sendMessage(from, { contacts: { displayName: 'Ravana Xpro', contacts: [{ vcard }] } });
                break;
            }

            case 'fancy': {
                const text = args.join(" ");
                if (!text) return reply("❎ *Please provide text.*");
                try {
                    const response = await axios.get(`https://www.dark-yasiya-api.site/other/font?text=${encodeURIComponent(text)}`);
                    if (response.data.status && response.data.result) {
                        const fontList = response.data.result.map(font => `*${font.name}:*\n${font.result}`).join("\n\n");
                        await reply(`🎨 *Fancy Fonts*\n\n${fontList}`);
                    }
                } catch (err) {
                    reply("⚠️ Error fetching fonts.");
                }
                break;
            }

            case 'deleteme': {
                const sanitized = number.replace(/[^0-9]/g, '');
                const sessionPath = path.join(SESSION_BASE_PATH, `session_${sanitized}`);
                if (fs.existsSync(sessionPath)) fs.removeSync(sessionPath);
                
                if (activeSockets.has(sanitized)) {
                    activeSockets.get(sanitized).ws.close();
                    activeSockets.delete(sanitized);
                }
                reply("✅ Your session has been deleted.");
                break;
            }

            case 'setting': {
                if (!isOwner) return reply("🚫 Not authorized.");
                reply(`🔧 *SETTINGS*\n\nWORK TYPE: ${config.WORK_TYPE}\nAUTO STATUS: ${config.AUTO_VIEW_STATUS}`);
                break;
            }
        }
    });
}

// Anti-call handler
async function setupcallhandlers(socket, number) {
    socket.ev.on('call', async (calls) => {
        if (config.ANTI_CALL === 'off') return;
        for (const call of calls) {
            if (call.status === 'offer') {
                await socket.rejectCall(call.id, call.from);
                await socket.sendMessage(call.from, { text: '*🔕 Call rejected automatically.*' });
            }
        }
    });
}

async function saveSession(number, creds) {
    const sanitized = number.replace(/[^0-9]/g, '');
    await Session.findOneAndUpdate({ number: sanitized }, { creds, updatedAt: new Date() }, { upsert: true });
}

async function restoreSession(number) {
    const sanitized = number.replace(/[^0-9]/g, '');
    const session = await Session.findOne({ number: sanitized });
    return session ? session.creds : null;
}

async function EmpirePair(number, res) {
    const sanitized = number.replace(/[^0-9]/g, '');
    const sessionPath = path.join(SESSION_BASE_PATH, `session_${sanitized}`);
    
    const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
    const logger = pino({ level: 'fatal' });

    const socket = makeWASocket({
        auth: state,
        printQRInTerminal: false,
        logger,
        browser: Browsers.macOS('Safari')
    });

    socketCreationTime.set(sanitized, Date.now());
    setupStatusHandlers(socket);
    setupCommandHandlers(socket, sanitized);
    setupcallhandlers(socket, sanitized);

    socket.ev.on('creds.update', saveCreds);

    socket.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'open') {
            activeSockets.set(sanitized, socket);
            console.log(`Bot connected: ${sanitized}`);
        } else if (connection === 'close') {
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== 401;
            if (shouldReconnect) EmpirePair(number, res);
        }
    });

    if (!socket.authState.creds.registered) {
        const code = await socket.requestPairingCode(sanitized);
        if (!res.headersSent) res.send({ code });
    }
}

router.get('/', async (req, res) => {
    if (req.query.number) await EmpirePair(req.query.number, res);
});

async function loadNewsletterJIDsFromRaw() {
    try {
        const res = await axios.get('https://raw.githubusercontent.com/ADI-MK😒/chennel/refs/heads/main/newsletter_list.json');
        return res.data;
    } catch (err) { return []; }
}

module.exports = router;
