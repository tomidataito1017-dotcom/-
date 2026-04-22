require('dotenv').config();
const Parser = require('rss-parser');
const axios = require('axios');

const parser = new Parser();

const FEEDS = [
  { label: '国内ニュース', url: 'https://www.nhk.or.jp/rss/news/cat0.xml' },
  { label: '経済', url: 'https://www.nhk.or.jp/rss/news/cat4.xml' },
  { label: '株式・マーケット', url: 'https://feeds.jp.reuters.com/reuters/JPbusiness' },
  { label: '不動産', url: 'https://www.re-port.net/rss/news.rdf' },
  { label: 'スポーツ', url: 'https://www.nhk.or.jp/rss/news/cat6.xml' },
  { label: 'AI・テクノロジー', url: 'https://rss.itmedia.co.jp/rss/2.0/aiplus.xml' },
];

async function fetchNews() {
  let message = '【今日のニュース】\n\n';
  for (const feed of FEEDS) {
    try {
      const result = await parser.parseURL(feed.url);
      message += `■ ${feed.label}\n`;
      result.items.slice(0, 2).forEach(item => {
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
  const userId = process.env.LINE_USER_ID;
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;

  const response = await axios.post(
    'https://api.line.me/v2/bot/message/push',
    { to: userId, messages: [{ type: 'text', text }] },
    { headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' } }
  );
  console.log('送信成功！');
}

(async () => {
  console.log('=== ニュースLINE通知スクリプト 開始 ===');
  const news = await fetchNews();
  await sendLine(news);
})();