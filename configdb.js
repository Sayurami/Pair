const fs = require('fs');
const path = require('path');
const os = require('os');

// Vercel වලදී ලියන්න අවසර තියෙන්නේ /tmp ෆෝල්ඩර් එකට විතරයි.
// ඒ නිසා අපි configDir එක /tmp වලට මාරු කරනවා.
const configDir = path.join(os.tmpdir(), 'configs');

if (!fs.existsSync(configDir)) {
    try {
        fs.mkdirSync(configDir, { recursive: true });
    } catch (err) {
        console.log("Folder creation skipped or failed:", err.message);
    }
}

const defaultConfigs = {
    ANTI_DELETE: 'off',
    ANTI_CALL: 'off',
    WORK_TYPE: 'public',
    AUTO_VIEW_STATUS: 'on',
    AUTO_REACT_STATUS: 'on',
    PRESENCE: 'available',
    AUTO_READ_MESSAGE: 'off',
    AUTO_LIKE_EMOJI: ['💋', '🍬', '🤟', '💓', '🎈', '🎉', '🥳', '❤️', '🍫', '🐭'],
    PREFIX: '.',
    BUTTON: 'on'
};

function getDbPath(dbName) {
    return path.join(configDir, dbName + '.json');
}

async function connectdb(dbName) {
    const dbPath = getDbPath(dbName);
    if (!fs.existsSync(dbPath)) {
        fs.writeFileSync(dbPath, JSON.stringify(defaultConfigs, null, 2));
    }
}

async function input(key, value, dbName) {
    const dbPath = getDbPath(dbName);
    let data = {};
    if (fs.existsSync(dbPath)) {
        data = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
    }
    data[key] = value;
    fs.writeFileSync(dbPath, JSON.stringify(data, null, 2));
}

async function get(key, dbName) {
    const dbPath = getDbPath(dbName);
    if (fs.existsSync(dbPath)) {
        const data = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
        return data[key] || null;
    }
    return null;
}

async function getalls(dbName) {
    const dbPath = getDbPath(dbName);
    if (fs.existsSync(dbPath)) {
        return JSON.parse(fs.readFileSync(dbPath, 'utf8'));
    }
    return null;
}

async function resetSettings(dbName) {
    const dbPath = getDbPath(dbName);
    fs.writeFileSync(dbPath, JSON.stringify(defaultConfigs, null, 2));
}

module.exports = {
    connectdb,
    input,
    get,
    getalls,
    resetSettings
};
