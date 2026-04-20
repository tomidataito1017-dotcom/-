/**
 * ニュースLINE自動通知スクリプト
 *
 * 【実行方法】
 *   1. 依存パッケージのインストール:
 *        npm install
 *
 *   2. .env ファイルにトークンを設定:
 *        LINE_CHANNEL_ACCESS_TOKEN=your_channel_access_token
 *
 *   3. 手動実行:
 *        node index.js
 *
 *   4. 毎朝自動実行（例: 毎朝7時）:
 *        Windows タスクスケジューラ、またはcronで設定
 *        cron式: 0 7 * * *
 */

import dotenv from 'dotenv';
import RSSParser from 'rss-parser';
import https from 'https';
import Anthropic from '@anthropic-ai/sdk';

dotenv.config();

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ────────────────────────────────────────────
// 設定
// ────────────────────────────────────────────

const RSS_FEEDS = [
  { name: 'NHK経済',             url: 'https://www.nhk.or.jp/rss/news/cat4.xml' },
  { name: 'NHK主要',             url: 'https://www.nhk.or.jp/rss/news/cat0.xml' },
  { name: 'NHK国際',             url: 'https://www.nhk.or.jp/rss/news/cat6.xml' },
  { name: 'NHK社会',             url: 'https://www.nhk.or.jp/rss/news/cat3.xml' },
  { name: '日本経済新聞',         url: 'https://www.nikkei.com/rss/index.xml' },
  { name: '東洋経済オンライン',   url: 'https://toyokeizai.net/list/feed/rss' },
  { name: 'ダイヤモンドオンライン', url: 'https://diamond.jp/feed/top' },
  { name: 'BBC News Japan',       url: 'https://feeds.bbci.co.uk/japanese/rss.xml' },
  { name: 'Reuters Japan',        url: 'https://feeds.reuters.com/reuters/JPTopNews' },
];

// 各フィードから取得する最大件数（フィルタ前）
const ARTICLES_PER_FEED = 20;

// カテゴリ定義: { label, keywords, max }
const CATEGORIES = [
  {
    label: '不動産・住宅',
    max: 2,
    keywords: ['不動産', '住宅', 'マンション', '土地', '賃貸', 'ハウスメーカー',
               '積水', '大和', '住友', 'パナソニック', '一条'],
  },
  {
    label: '金融・株価',
    max: 2,
    keywords: ['金融', '銀行', '融資', 'ローン', '株価', '株式',
               '日経平均', '上場', '決算'],
  },
  {
    label: 'AI・テクノロジー',
    max: 2,
    keywords: ['AI', '人工知能', 'ChatGPT', 'Claude', '生成AI'],
  },
  {
    label: '企業動向',
    max: 2,
    keywords: ['企業', 'M&A', '買収', '合併', '倒産', '上場'],
  },
  {
    label: '国内・海外の話題',
    max: 2,
    keywords: ['首相', '大統領', '政府', '国会', '選挙', '外交', '戦争', '紛争',
               '地震', '災害', '事件', '事故', '逮捕', '判決', 'サミット',
               'トランプ', 'ウクライナ', '中国', '北朝鮮', 'アメリカ', '韓国'],
  },
];

// 合計目標件数
const TOTAL_TARGET = 10;

const LINE_MESSAGING_USER_ID = 'Uab90819c5f88daa12b218a3b0116dd26';
const LINE_MESSAGING_MAX_CHARS = 5000;

// ────────────────────────────────────────────
// RSSフィード取得
// ────────────────────────────────────────────

async function fetchFeed(feedConfig) {
  const parser = new RSSParser({
    timeout: 10000,
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; NewsBot/1.0)' },
  });

  try {
    const feed = await parser.parseURL(feedConfig.url);
    const items = (feed.items || []).slice(0, ARTICLES_PER_FEED);

    return items.map((item) => ({
      title: item.title?.trim() || '（タイトルなし）',
      url:   item.link?.trim()  || '',
    }));
  } catch (err) {
    console.warn(`[WARN] フィード取得スキップ: ${feedConfig.name} - ${err.message}`);
    return [];
  }
}

async function collectArticles() {
  const results = await Promise.allSettled(RSS_FEEDS.map(fetchFeed));
  const articles = [];
  const seen = new Set();

  for (const result of results) {
    if (result.status !== 'fulfilled') continue;
    for (const a of result.value) {
      // URL重複排除
      if (seen.has(a.url)) continue;
      seen.add(a.url);
      articles.push(a);
    }
  }

  console.log(`[INFO] 合計 ${articles.length} 件の記事を取得しました（重複除去後）。`);
  return articles;
}

// ────────────────────────────────────────────
// キーワードフィルタリング & カテゴリ分類
// ────────────────────────────────────────────

/**
 * Claudeを使って、カテゴリにマッチした記事のうち注目度が高い上位 max 件を選ぶ。
 * API呼び出しに失敗した場合は先着順にフォールバック。
 */
async function selectTopByAttention(categoryLabel, candidates, max) {
  if (candidates.length <= max) return candidates;

  const list = candidates
    .map((a, i) => `${i + 1}. ${a.title}`)
    .join('\n');

  try {
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 256,
      messages: [
        {
          role: 'user',
          content:
            `以下は「${categoryLabel}」カテゴリのニュース記事タイトル一覧です。\n` +
            `社会的・経済的インパクト、速報性、読者への影響度を考慮して、` +
            `最も注目度が高い ${max} 件の番号を昇順カンマ区切りで返してください（例: 2,5）。\n` +
            `番号のみ返し、説明は不要です。\n\n${list}`,
        },
      ],
    });

    const text = response.content[0]?.text?.trim() || '';
    const indices = text
      .split(',')
      .map((s) => parseInt(s.trim(), 10) - 1)
      .filter((i) => i >= 0 && i < candidates.length);

    if (indices.length > 0) {
      return indices.slice(0, max).map((i) => candidates[i]);
    }
  } catch (err) {
    console.warn(`[WARN] Claude注目度評価スキップ (${categoryLabel}): ${err.message}`);
  }

  // フォールバック: 先着順
  return candidates.slice(0, max);
}

async function categorize(articles) {
  const usedUrls = new Set();
  const result = {};

  // 第1パス: 各カテゴリで注目度上位 max 件を選択
  for (const category of CATEGORIES) {
    const matched = articles.filter(
      (a) => !usedUrls.has(a.url) && category.keywords.some((kw) => a.title.includes(kw))
    );

    if (matched.length === 0) continue;

    const selected = await selectTopByAttention(category.label, matched, category.max);
    result[category.label] = selected;
    selected.forEach((a) => usedUrls.add(a.url));
  }

  // 第2パス: 合計が TOTAL_TARGET に満たない場合、未使用記事で補完
  const currentTotal = Object.values(result).reduce((sum, arr) => sum + arr.length, 0);
  const shortage = TOTAL_TARGET - currentTotal;

  if (shortage > 0) {
    const unused = articles.filter((a) => !usedUrls.has(a.url)).slice(0, shortage);
    if (unused.length > 0) {
      result['その他'] = unused;
    }
  }

  return result;
}

// ────────────────────────────────────────────
// メッセージ組み立て
// ────────────────────────────────────────────

function buildMessage(categorized) {
  const today = new Date().toLocaleDateString('ja-JP', {
    year: 'numeric', month: 'long', day: 'numeric',
  });

  // 表示順: 定義済みカテゴリ → 補完分（その他）
  const orderedLabels = [...CATEGORIES.map((c) => c.label), 'その他'];

  const sections = orderedLabels
    .filter((label) => categorized[label]?.length > 0)
    .map((label) => {
      const items = categorized[label]
        .map((a) => `・${a.title}\n${a.url}`)
        .join('\n\n');
      return `■ ${label}\n${items}`;
    });

  if (sections.length === 0) {
    return `【今日の注目ニュース】${today}\n\n該当するキーワードのニュースはありませんでした。`;
  }

  return `【今日の注目ニュース】${today}\n\n${sections.join('\n\n')}`;
}

// ────────────────────────────────────────────
// LINE Messaging API 送信
// ────────────────────────────────────────────

function truncateForLine(message, maxChars) {
  if (message.length <= maxChars) return message;

  const suffix = '\n\n…（文字数制限により省略）';
  return message.slice(0, maxChars - suffix.length) + suffix;
}

function sendLineMessage(text) {
  return new Promise((resolve, reject) => {
    const truncated = truncateForLine(text, LINE_MESSAGING_MAX_CHARS);
    const body = JSON.stringify({
      to: LINE_MESSAGING_USER_ID,
      messages: [{ type: 'text', text: truncated }],
    });

    const options = {
      hostname: 'api.line.me',
      path:     '/v2/bot/message/push',
      method:   'POST',
      headers: {
        'Content-Type':   'application/json',
        'Authorization':  `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}`,
        'Content-Length': Buffer.byteLength(body),
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode === 200) {
          resolve(data);
        } else {
          reject(new Error(`LINE Messaging API エラー: HTTP ${res.statusCode} - ${data}`));
        }
      });
    });

    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// ────────────────────────────────────────────
// 環境変数チェック
// ────────────────────────────────────────────

function validateEnv() {
  if (!process.env.LINE_CHANNEL_ACCESS_TOKEN) {
    throw new Error('.env に LINE_CHANNEL_ACCESS_TOKEN が設定されていません。');
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error('.env に ANTHROPIC_API_KEY が設定されていません。');
  }
}

// ────────────────────────────────────────────
// メイン処理
// ────────────────────────────────────────────

async function main() {
  console.log('=== ニュースLINE通知スクリプト 開始 ===');

  try {
    validateEnv();

    // 1. RSSフィード取得
    console.log('[1/2] RSSフィードを取得中...');
    const articles = await collectArticles();

    // 2. カテゴリ分類 & メッセージ組み立て
    const categorized = await categorize(articles);
    const totalMatched = Object.values(categorized).reduce((sum, arr) => sum + arr.length, 0);
    console.log(`[INFO] キーワードマッチ: ${totalMatched} 件`);

    const message = buildMessage(categorized);
    console.log('\n--- 送信メッセージ ---');
    console.log(message);
    console.log('----------------------\n');

    // 3. LINE Messaging API 送信
    console.log('[2/2] LINE Messaging API に送信中...');
    await sendLineMessage(message);
    console.log('[INFO] LINEメッセージを送信しました！');

  } catch (err) {
    console.error(`[ERROR] ${err.message}`);
    process.exit(1);
  }

  console.log('=== 完了 ===');
}

main();
