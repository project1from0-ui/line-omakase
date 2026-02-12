// functions/test-trigger.ts
// このスクリプトは、正しい署名を作ってローカルのWebhookを叩きます
import * as crypto from 'crypto';
import axios from 'axios';

// 設定項目
const PROJECT_ID = 'line-omakase'; // ★ここを更新しました
const REGION = 'asia-northeast1';
const FUNCTION_NAME = 'lineWebhook';
const SECRET = 'secret123'; // Firestoreに登録したテスト用シークレット

const url = `http://127.0.0.1:5001/${PROJECT_ID}/${REGION}/${FUNCTION_NAME}`;

// 送信するデータ (こんにちは！と話しかける)
const body = {
  destination: 'test-bot-id',
  events: [
    {
      type: 'message',
      replyToken: 'dummy_token',
      source: {
        userId: 'test-user-id',
        type: 'user'
      },
      timestamp: Date.now(),
      message: {
        type: 'text',
        id: '12345',
        text: 'こんにちは！君の仕事は何？'
      }
    }
  ]
};

// 署名の生成 (これが手動だと大変な部分です)
const bodyString = JSON.stringify(body);
const signature = crypto
  .createHmac('sha256', SECRET)
  .update(bodyString)
  .digest('base64');

console.log(`Sending request to ${url}...`);

// 送信実行
axios.post(url, body, {
  headers: {
    'Content-Type': 'application/json',
    'x-line-signature': signature
  }
})
.then(res => {
  console.log('Response Status:', res.status);
  console.log('Response Body:', res.data);
})
.catch(err => {
  console.error('Error:', err.response ? err.response.data : err.message);
});