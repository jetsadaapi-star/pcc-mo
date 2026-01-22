/**
 * LINE Bot Client
 * Configuration สำหรับ LINE Messaging API SDK
 */

const line = require('@line/bot-sdk');

// LINE SDK Configuration
const config = {
    channelSecret: process.env.LINE_CHANNEL_SECRET,
    channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN
};

// Create LINE Client
const client = new line.messagingApi.MessagingApiClient({
    channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN
});

// Middleware สำหรับ verify LINE signature
const middleware = line.middleware(config);

/**
 * ส่งข้อความตอบกลับ
 * @param {string} replyToken 
 * @param {string} text 
 */
async function replyText(replyToken, text) {
    try {
        await client.replyMessage({
            replyToken,
            messages: [{ type: 'text', text }]
        });
    } catch (err) {
        console.error('Error replying message:', err);
    }
}

/**
 * Push ข้อความไปยัง group หรือ user
 * @param {string} to - userId หรือ groupId
 * @param {string} text 
 */
async function pushText(to, text) {
    try {
        await client.pushMessage({
            to,
            messages: [{ type: 'text', text }]
        });
    } catch (err) {
        console.error('Error pushing message:', err);
    }
}

module.exports = {
    client,
    middleware,
    replyText,
    pushText,
    config
};
