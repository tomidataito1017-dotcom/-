require('dotenv').config();
const Parser = require('rss-parser');
const axios = require('axios');

const parser = new Parser();

const FEEDS = [
  { label: '国内ニュース', url: 'https://www.nhk.or.jp/rss/news/cat0.xml' },
  { label: '経済', url: 'https://www.nhk.or.jp/rss/news/cat4.xml' },
];

async function fetchNews() {
  let message = '【今日のニュース】\n\n';
  for (const feed of FEEDS) {
    try {
      const result = await parser.parseURL(feed.url);
      message += `■ ${feed.label}\n`;
      result.items.slice(0, 3).forEach(item => {
        message += `・${item.title}\n${item.link}\n`;
      });
      message += '\n';
    } catch (e) {
      console.log(`スキップ: ${feed.label}`);
    }
  }
  return message;
}

async function sendLine(text) {
  await axios.post(
    'https://api.line.me/v2/bot/message/push',
    { to: process.env.LINE_USER_ID, messages: [{ type: 'text', text }] },
    { headers: { 'Authorization': `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}`, 'Content-Type': 'application/json' } }
  );
  console.log('送信成功！');
}

(async () => {
  console.log('=== ニュースLINE通知スクリプト 開始 ===');
  const news = await fetchNews();
  await sendLine(news);
})();