require('dotenv').config();
const Parser = require('rss-parser');
const axios = require('axios');

const parser = new Parser();

const GENERAL_FEEDS = [
  { label: '国内ニュース', url: 'https://www.nhk.or.jp/rss/news/cat0.xml' },
  { label: '経済', url: 'https://www.nhk.or.jp/rss/news/cat4.xml' },
  { label: '株式・マーケット', url: 'https://feeds.jp.reuters.com/reuters/JPbusiness' },
  { label: '不動産', url: 'https://www.re-port.net/rss/news.rdf' },
  { label: 'スポーツ', url: 'https://www.nhk.or.jp/rss/news/cat6.xml' },
  { label: 'AI・テクノロジー', url: 'https://rss.itmedia.co.jp/rss/2.0/aiplus.xml' },
];

const FINANCE_FEEDS = [
  { label: '投資・株式', url: 'https://news.yahoo.co.jp/rss/topics/stock.xml' },
  { label: 'ビジネス・投資', url: 'https://toyokeizai.net/list/feed/rss' },
];

async function fetchItems(feeds) {
  const allItems = [];

  for (const feed of feeds) {
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

  allItems.sort((a, b) => b.date - a.date);
  return allItems;
}

async function fetchNews() {
  const items = await fetchItems(GENERAL_FEEDS);
  const top15 = items.slice(0, 15);

  let message = '【今日の注目ニュース TOP15】\n\n';
  top15.forEach((item, i) => {
    message += `${i + 1}. [${item.label}]\n${item.title}\n${item.link}\n\n`;
  });

  return message;
}

async function fetchFinanceNews() {
  const items = await fetchItems(FINANCE_FEEDS);
  const top10 = items.slice(0, 10);

  let message = '【金融・投資ニュース TOP10】\n\n';
  top10.forEach((item, i) => {
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
  const financeNews = await fetchFinanceNews();
  await sendLine(financeNews);
})();