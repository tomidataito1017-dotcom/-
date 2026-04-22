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
  const allItems = [];

  for (const feed of FEEDS) {
    try {
      const result = await parser.parseURL(feed.url);
      result.items.slice(0, 5).forEach(item => {
        allItems.push({
          label: feed.label,
          title: item.title,
          link: item.link,
          date: item.pubDate ? new Date(item.pubDate) : new Date(0),
        });
      });
    } catch (e) {
      console.log(`スキップ: ${feed.label}`);
    }
  }

  // 新しい順（注目度＝新しさ）に並べて上位15件
  allItems.sort((a, b) => b.date - a.date);
  const top15 = allItems.slice(0, 15);

  let message = '【今日の注目ニュース TOP15】\n\n';
  top15.forEach((item, i) => {
    message += `${i + 1}. [${item.label}]\n${item.title}\n${item.link}\n\n`;
  });

  return message;
}

async function sendLine(text) {
  const userId = process.env.LINE_USER_ID;
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;

  await axios.post(
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