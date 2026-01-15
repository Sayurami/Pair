const fs = require('fs');
const path = require('path');

// 1. සෙටින්ග්ස් සේව් කරන්න 'configs' නමින් ෆෝල්ඩර් එකක් හදාගන්නවා.
const configDir = path.join(__dirname, 'configs');
if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir);
}

// 2. බොට්ගේ මූලික සෙටින්ග්ස් (Default Settings) ටික මෙතැන තියෙනවා.
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

// 3. ඩේටාබේස් එක තියෙන තැන සොයාගන්නා ෆන්ක්ෂන් එක.
function getDbPath(dbName) {
    return path.join(configDir, dbName + '.json');
}

// 4. ඩේටාබේස් එක සම්බන්ධ කරන ෆන්ක්ෂන් එක (ෆයිල් එක නැත්නම් හදනවා).
async function connectdb(dbName) {
    const dbPath = getDbPath(dbName);
    if (!fs.existsSync(dbPath)) {
        fs.writeFileSync(dbPath, JSON.stringify(defaultConfigs, null, 2));
    }
}

// 5. අලුතින් ඩේටා ඇතුළත් කරන ෆන්ක්ෂන් එක.
async function input(key, value, dbName) {
    const dbPath = getDbPath(dbName);
    let data = {};
    if (fs.existsSync(dbPath)) {
        data = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
    }
    data[key] = value;
    fs.writeFileSync(dbPath, JSON.stringify(data, null, 2));
}

// 6. සේව් කරපු ඩේටා එකක් ආපසු ලබාගන්නා ෆන්ක්ෂන් එක.
async function get(key, dbName) {
    const dbPath = getDbPath(dbName);
    if (fs.existsSync(dbPath)) {
        const data = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
        return data[key] || null;
    }
    return null;
}

// 7. සියලුම සෙටින්ග්ස් ටික එකවර ලබාගැනීම.
async function getalls(dbName) {
    const dbPath = getDbPath(dbName);
    if (fs.existsSync(dbPath)) {
        return JSON.parse(fs.readFileSync(dbPath, 'utf8'));
    }
    return null;
}

// 8. සෙටින්ග්ස් තිබුණු විදියටම රීසෙට් (Reset) කිරීම.
async function resetSettings(dbName) {
    const dbPath = getDbPath(dbName);
    fs.writeFileSync(dbPath, JSON.stringify(defaultConfigs, null, 2));
}

// මේ ෆන්ක්ෂන් ටික වෙනත් ෆයිල් එකක පාවිච්චි කරන්න අවසර දෙනවා.
module.exports = {
    connectdb,
    input,
    get,
    getalls,
    resetSettings
};
