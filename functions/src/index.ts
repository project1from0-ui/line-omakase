import {onRequest, onCall, HttpsError} from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import * as crypto from "crypto";
import axios from "axios";
import {GoogleGenerativeAI, Content, Part, SchemaType, Schema} from "@google/generative-ai";
import {Tenant, AppUser, AppMessage, NutritionData, PersonalInfo} from "./types";
import {onSchedule} from "firebase-functions/v2/scheduler";
import {calculateNutritionalGoal} from "./calculateNutrition";

// initialize Firebase Admin SDK
admin.initializeApp();
const db = admin.firestore();

// initialize Google Gemini API client
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

// ---------------------------------------------------------
// Platform-unified default system prompt
// ---------------------------------------------------------
const DEFAULT_SYSTEM_PROMPT = `あなたは「たべコーチ」のAI栄養コーチです。

【ペルソナ】
- 管理栄養士レベルの知識を持つ、親しみやすく頼れるコーチ
- 叱責ではなく「次にどうするか」を常に提案する前向きな姿勢
- ユーザーの小さな努力や良い選択を見逃さず褒める

【トーン】
- 敬語ベースだが堅すぎない（「〜ですね！」「〜しましょう！」）
- 絵文字は控えめに使用（1メッセージに1〜2個まで）
- 専門用語は避け、わかりやすい日本語で説明する

【指導方針】
- 食事報告があった場合: 栄養素を推定し、1日の目標に対する進捗を踏まえて具体的にアドバイスする
- カロリー超過時: 責めずに「次の食事で調整しましょう」と具体策を提示
- タンパク質不足時: 手軽に摂れる高タンパク食品を提案
- 目標未設定のユーザー: 一般的な成人目安（2000kcal, P60g, F55g, C300g）を参考に指導する

【トレーナーメッセージの取り扱い】
- チャット履歴に「[トレーナーからのメッセージ]」が含まれる場合がある
- トレーナーの指示や方針を尊重し、矛盾しない範囲で自分の指導に反映する
- トレーナーが具体的な食事指示を出している場合はそれに沿って指導する

【フォーマット規約】
- 食事に関する返答は「■ 栄養素」「■ 総合評価」「■ 次回の指示」「■ 理由」のセクションを含む
- 食事以外の質問には自然に会話する（雑談OK、ただし話題を食事・健康に戻すよう誘導）`;

// Gemini structured output schema
const nutritionResponseSchema: Schema = {
  type: SchemaType.OBJECT,
  properties: {
    replyText: {type: SchemaType.STRING, description: "LINEユーザーへの返信メッセージ。食事に関する場合は「■ 栄養素」「■ 総合評価」「■ 次回の指示」「■ 理由」のセクションを含む詳細な指導テキスト。食事以外の場合は自然な日本語の返答。"},
    calories: {type: SchemaType.NUMBER, description: "推定カロリー（kcal）。食事以外は0"},
    protein: {type: SchemaType.NUMBER, description: "タンパク質（g）。食事以外は0"},
    fat: {type: SchemaType.NUMBER, description: "脂質（g）。食事以外は0"},
    carbs: {type: SchemaType.NUMBER, description: "炭水化物（g）。食事以外は0"},
  },
  required: ["replyText", "calories", "protein", "fat", "carbs"],
};

// ---------------------------------------------------------
// Helper: obtain an image from LINE and return as base64
// ---------------------------------------------------------
const fetchImageAsBase64 = async (messageId: string, accessToken: string): Promise<string> => {
  const url = `https://api-data.line.me/v2/bot/message/${messageId}/content`;
  const response = await axios.get(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    responseType: "arraybuffer",
  });
  const base64Image = Buffer.from(response.data, "binary").toString("base64");
  return base64Image;
};

// ---------------------------------------------------------
// Helper: obtain chat history and format for Gemini
// ---------------------------------------------------------
const getChatHistory = async (botId: string, userId: string): Promise<Content[]> => {
  const historySnapshot = await db
    .collection(`tenants/${botId}/users/${userId}/messages`)
    .orderBy("createdAt", "desc")
    .limit(20)
    .get();

  const history: Content[] = [];
  // reverse to chronological order
  historySnapshot.docs.reverse().forEach((doc) => {
    const data = doc.data() as AppMessage;
    // Include trainer messages as user role with prefix
    const role = data.sender === "ai" ? "model" : "user";
    // represent image messages as text so AI retains meal context
    if (data.type === "image") {
      history.push({role, parts: [{text: "[食事画像を送信しました]"}]});
      return;
    }
    const content = data.sender === "trainer" ?
      `[トレーナーからのメッセージ] ${data.content}` :
      data.content;
    history.push({
      role: role,
      parts: [{text: content}],
    });
  });
  // clean up history to abide by Gemini's rule of the first message should be sent by user
  const cleanHistory: Content[] = [];
  let nextExpectedRole = "user";

  for (const item of history) {
    if (item.role === nextExpectedRole) {
      cleanHistory.push(item);
      nextExpectedRole = nextExpectedRole === "user" ? "model" : "user";
    } else {
      // if the role is not as expected, we skip this message to maintain the correct alternation
      console.warn(`Skipping message with role ${item.role} to maintain user-model alternation`);
    }
  }

  return cleanHistory;
};

// ---------------------------------------------------------
// Helper: build personalized system instruction for Gemini
// ---------------------------------------------------------
const buildSystemInstruction = (tenantData: Tenant, userData: Partial<AppUser>, trendContext?: string): string => {
  const base = DEFAULT_SYSTEM_PROMPT + (tenantData.systemPrompt ? "\n\n【トレーナー追加指示】\n" + tenantData.systemPrompt : "");

  const info = userData.personalInfo;
  const goal = userData.nutritionalGoal;

  const purposeLabel: Record<string, string> = {
    lose_weight: "減量",
    maintain: "体重維持",
    bulk_up: "増量",
  };
  const activityLabel: Record<string, string> = {
    sedentary: "ほぼ運動しない",
    light: "軽い運動（週1-3回）",
    moderate: "中程度の運動（週3-5回）",
    active: "激しい運動（週6-7回）",
    very_active: "非常に激しい運動・肉体労働",
  };

  const age = info?.birthDate ?
    Math.floor((Date.now() - new Date(info.birthDate).getTime()) / (365.25 * 24 * 60 * 60 * 1000)) : null;

  const profileSection = info ? `\n【クライアント情報】
- 性別: ${info.sex === "male" ? "男性" : "女性"}${age !== null ? ` / 年齢: ${age}歳` : ""}
- 身長: ${info.height}cm / 体重: ${info.weight}kg / 目標体重: ${info.targetWeight}kg
- 活動レベル: ${activityLabel[info.activityLevel] || info.activityLevel}
- 運動内容: ${info.exerciseType || "未記入"}
- 目的: ${purposeLabel[info.purpose] || info.purpose}
- 平均睡眠: ${info.sleepHours}時間 / 食事回数: ${info.mealFrequency}回/日
${info.alcoholHabit ? `- 飲酒習慣: ${info.alcoholHabit}` : ""}
${info.supplements ? `- サプリメント: ${info.supplements}` : ""}
${info.foodPreferences ? `- 食の好み・苦手: ${info.foodPreferences}（好みに合った食事を提案すること）` : ""}
${info.allergies ? `- アレルギー: ${info.allergies}（この食材・成分を含む食事を勧めないこと）` : ""}
${info.medicalHistory ? `- 既往歴: ${info.medicalHistory}（指導内容に必ず考慮すること）` : ""}
${info.medication ? `- 服薬中: ${info.medication}（食事との相互作用に注意すること）` : ""}` :
    "\n\n【クライアント情報】\n個人情報が未登録です。一般的な栄養指導を行いつつ、「より正確なアドバイスのために個人情報の登録をおすすめします」と適宜案内してください。";

  const goalSection = goal ? `
【1日の栄養目標】
- 目標カロリー: ${goal.targetCalories}kcal
- タンパク質: ${goal.protein}g / 脂質: ${goal.fat}g / 炭水化物: ${goal.carbs}g
この目標値を基準に、今日の摂取状況を踏まえて具体的な指導をすること。` :
    "\n\n【1日の栄養目標】\n目標が未設定です。成人一般目安（2000kcal, P60g, F55g, C300g）を参考に指導してください。";

  const trendSection = trendContext ? `\n\n${trendContext}` : "";

  return base + profileSection + goalSection + trendSection +
    "\n\n重要: 返答は必ずJSONフォーマットで返してください。" +
    "replyTextには、食事に関するメッセージの場合は「■ 栄養素」「■ 総合評価」「■ 次回の指示」「■ 理由」のセクションを含む詳細な栄養指導テキストを書いてください。食事以外の場合は自然な日本語の返答を書いてください。" +
    "calories・protein・fat・carbsには食事から推定した栄養値（整数）を入れ、食事でない場合は0にしてください。";
};

// ---------------------------------------------------------
// Helper: save message to Firestore
// ---------------------------------------------------------

// 1. update user info (fetch LINE profile on first contact)
const updateUserProfile = async (botId: string, userId: string, accessToken: string) => {
  const usersRef = db.collection(`tenants/${botId}/users`).doc(userId);
  const existingDoc = await usersRef.get();

  const updateData: Partial<AppUser> = {
    lineUserId: userId,
    lastMessageAt: new Date(),
  };

  // Fetch LINE profile if user is new or has no displayName yet
  if (!existingDoc.exists || !existingDoc.data()?.pictureUrl) {
    try {
      const profileRes = await axios.get(`https://api.line.me/v2/bot/profile/${userId}`, {
        headers: {Authorization: `Bearer ${accessToken}`},
      });
      updateData.displayName = profileRes.data.displayName;
      if (profileRes.data.pictureUrl) {
        updateData.pictureUrl = profileRes.data.pictureUrl;
      }
    } catch (err) {
      console.warn(`Failed to fetch LINE profile for ${userId}:`, err);
      if (!existingDoc.exists) {
        updateData.displayName = "User " + userId.substring(0, 5);
      }
    }
  }

  await usersRef.set(updateData, {merge: true});
};

// 2. save message log
const saveMessage = async (botId: string, userId: string, message: AppMessage) => {
  const msgsRef = db.collection(`tenants/${botId}/users/${userId}/messages`);
  await msgsRef.add(message);
};

// ---------------------------------------------------------
// Helper: Send Reply via LINE Messaging API
// ---------------------------------------------------------
const replyToLine = async (replyToken: string, text: string, accessToken: string) => {
  // for local testing
  if (accessToken === "token123") {
    console.log("[Test] LINE reply skipped. Content:", text);
    return;
  }

  await axios.post("https://api.line.me/v2/bot/message/reply", {
    replyToken: replyToken,
    messages: [
      {
        type: "text",
        text: text,
      },
    ],
  }, {
    headers: {
      "Authorization": `Bearer ${accessToken}`,
    },
  });
};

// ---------------------------------------------------------
// Helper: Validate LINE Signature
// ---------------------------------------------------------
const validateSignature = (body: string, signature: string, secret: string): boolean => {
  const hash = crypto
    .createHmac("sha256", secret)
    .update(body)
    .digest("base64");
  return hash === signature;
};

// ---------------------------------------------------------
// Helper: Get user trend context from recent daily summaries
// ---------------------------------------------------------
const getUserTrendContext = async (botId: string, userId: string): Promise<string> => {
  const summariesSnap = await db
    .collection(`tenants/${botId}/users/${userId}/dailySummaries`)
    .orderBy("date", "desc")
    .limit(7)
    .get();

  if (summariesSnap.empty) return "";

  const summaries = summariesSnap.docs.map((d) => d.data());
  const totalDays = summaries.length;
  const avgCalories = Math.round(summaries.reduce((s, d) => s + (d.totalCalories || 0), 0) / totalDays);
  const avgProtein = Math.round(summaries.reduce((s, d) => s + (d.totalProtein || 0), 0) / totalDays);
  const avgFat = Math.round(summaries.reduce((s, d) => s + (d.totalFat || 0), 0) / totalDays);
  const avgCarbs = Math.round(summaries.reduce((s, d) => s + (d.totalCarbs || 0), 0) / totalDays);

  // Determine calorie trend
  let trend = "横ばい";
  if (totalDays >= 3) {
    const recent = summaries.slice(0, Math.ceil(totalDays / 2));
    const older = summaries.slice(Math.ceil(totalDays / 2));
    const recentAvg = recent.reduce((s, d) => s + (d.totalCalories || 0), 0) / recent.length;
    const olderAvg = older.reduce((s, d) => s + (d.totalCalories || 0), 0) / older.length;
    if (recentAvg > olderAvg * 1.1) trend = "増加傾向";
    else if (recentAvg < olderAvg * 0.9) trend = "減少傾向";
  }

  return `【直近${totalDays}日間のトレンド】
- 報告日数: ${totalDays}日
- 平均カロリー: ${avgCalories}kcal / P: ${avgProtein}g / F: ${avgFat}g / C: ${avgCarbs}g
- カロリートレンド: ${trend}
この情報を踏まえて、過去の傾向を考慮した指導をしてください。`;
};

// ---------------------------------------------------------
// Main: Webhook Gateway
// ---------------------------------------------------------
export const lineWebhook = onRequest({region: "asia-northeast1", memory: "1GiB"}, async (req, res) => {
  // 1. restrict to POST method
  if (req.method !== "POST") {
    res.status(405).send("Method Not Allowed");
    return;
  }

  // 2. extract signature and body
  const signature = req.headers["x-line-signature"] as string;
  const body = req.body;
  // Bot's userId is in body.destination
  const botId = body.destination;

  if (!signature || !botId) {
    console.warn("Missing signature or bot ID");
    res.status(400).send("Bad Request");
    return;
  }

  try {
    // 3. fetch tenant info from Firestore
    const tenantDoc = await db.collection("tenants").doc(botId).get();

    if (!tenantDoc.exists) {
      console.error(`Tenant not found: ${botId}`);
      res.status(404).send("Bot Not Found");
      return;
    }

    const tenantData = tenantDoc.data() as Tenant;

    // 4. validate signature using raw request body bytes (not re-serialized JSON)
    const rawBody = (req as any).rawBody as Buffer | undefined;
    const rawBodyStr = rawBody ? rawBody.toString("utf8") : JSON.stringify(body);

    if (!validateSignature(rawBodyStr, signature, tenantData.lineChannelSecret)) {
      console.error("Invalid signature for bot:", botId);
      res.status(401).send("Invalid Signature");
      return;
    }

    // 5. process events
    const events = body.events;
    console.log(`Bot ${botId} received events:`, JSON.stringify(events));

    // process multiple events — allSettled ensures 200 even if one event fails
    const tasks = events.map(async (event: any) => {
      if (event.type !== "message") {
        console.log(`Unsupported event type: ${event.type}`);
        return;
      }

      const userId = event.source.userId;
      const replyToken = event.replyToken;
      const messageType = event.message.type;
      // update user profile and fetch current user data for personalization
      await updateUserProfile(botId, userId, tenantData.lineAccessToken);
      const userSnap = await db.collection(`tenants/${botId}/users`).doc(userId).get();
      const userData = (userSnap.data() || {}) as Partial<AppUser>;

      // Send onboarding LIFF link to first-time users without personalInfo
      const LIFF_ID = process.env.LIFF_ID || "";
      if (!userData.personalInfo && !userData.onboardingPromptSent && LIFF_ID) {
        try {
          const onboardingUrl = `https://liff.line.me/${LIFF_ID}/onboarding/${botId}/${userId}`;
          await axios.post("https://api.line.me/v2/bot/message/push", {
            to: userId,
            messages: [{
              type: "text",
              text: `ようこそ「たべコーチ」へ!\n\nより正確な食事指導のために、あなたの基本情報を登録しませんか？\n\n${onboardingUrl}\n\n登録なしでもすぐに食事の相談ができます!`,
            }],
          }, {
            headers: {"Authorization": `Bearer ${tenantData.lineAccessToken}`},
          });
          await db.collection(`tenants/${botId}/users`).doc(userId).update({
            onboardingPromptSent: true,
          });
        } catch (err) {
          console.warn("Failed to send onboarding link:", err);
        }
      }

      // branch for message types
      let userPromptParts: Part[] = [];
      let logContent = "";
      let logType: "text" | "image" = "text";

      if (messageType === "text") {
        const text = event.message.text;
        userPromptParts = [{text: text}];
        logContent = text;
        logType = "text";
        console.log(`Bot (${botId}) received TEXT: ${text}`);
      } else if (messageType === "image") {
        console.log(`Bot (${botId}) received IMAGE`);
        const imageBase64 = await fetchImageAsBase64(event.message.id, tenantData.lineAccessToken);
        userPromptParts = [
          {text: "この画像に写る食品を認識して栄養成分を推定したうえで、以下のフォーマットに沿って評価・指導を行ってください。食事指導フォーマット  \n■ 栄養素\n ・P (タンパク質) : [00]g [ ○ / △ / × ]\n ・F(脂質) : [00]g [ ○ / △ / × ]\n ・C (炭水化物) : [00]g [ ○ / △ / × ]\n ・推定 : [000] kcal\n\n■ 総合評価\n [例：脂質が完全にオーバーです / タンパク質が全く足りていません]\n\n■ 次回の指示\n [例：油を使わない「蒸し」か「茹で」のメインを選んでください]\n\n■ 理由\n [例：今の食事で摂りすぎた脂質を、1日の中で薄めてリセットするためです]"},
          {
            inlineData: {
              data: imageBase64,
              mimeType: "image/jpeg",
            },
          },
        ];
        logContent = "[Image data]"; // do not log actual image data
        logType = "image";
      } else {
        // unsupported type
        return;
      }

      // save user message
      await saveMessage(botId, userId, {
        sender: "user",
        type: logType,
        content: logContent,
        createdAt: new Date(),
      });

      // generate AI response based on chat history
      const [history, trendContext] = await Promise.all([
        getChatHistory(botId, userId),
        getUserTrendContext(botId, userId),
      ]);
      const model = genAI.getGenerativeModel({
        model: "gemini-2.5-flash-lite",
        systemInstruction: buildSystemInstruction(tenantData, userData, trendContext),
      });
      const chatSession = model.startChat({
        history: history,
        generationConfig: {
          maxOutputTokens: 1024,
          responseMimeType: "application/json",
          responseSchema: nutritionResponseSchema,
        },
      });

      console.log(`Bot (${botId}) context length: ${history.length} messages`);

      let parsed: {replyText: string; calories: number; protein: number; fat: number; carbs: number};
      try {
        const result = await chatSession.sendMessage(userPromptParts);
        parsed = JSON.parse(result.response.text());
      } catch (aiError) {
        console.error("Gemini API error:", aiError);
        await replyToLine(replyToken, "申し訳ありません、ただいまAIの応答に問題が発生しています。少し時間をおいてから再度お送りください。", tenantData.lineAccessToken);
        return;
      }

      // Validate nutrition values — reject unrealistic outputs from Gemini
      const isValidNutrition = (
        parsed.calories >= 0 && parsed.calories <= 3000 &&
        parsed.protein >= 0 && parsed.protein <= 200 &&
        parsed.fat >= 0 && parsed.fat <= 200 &&
        parsed.carbs >= 0 && parsed.carbs <= 500
      );

      const nutrition: NutritionData = isValidNutrition ?
        {calories: parsed.calories, protein: parsed.protein, fat: parsed.fat, carbs: parsed.carbs} :
        {calories: 0, protein: 0, fat: 0, carbs: 0};

      if (!isValidNutrition && (parsed.calories > 0 || parsed.protein > 0)) {
        console.warn(`Unrealistic nutrition values rejected: ${JSON.stringify(parsed)}`);
      }

      // save AI message with nutrition data (omit nutrition when no food detected)
      await saveMessage(botId, userId, {
        sender: "ai",
        type: "text",
        content: parsed.replyText,
        createdAt: new Date(),
        ...(nutrition.calories > 0 && {nutrition}),
      });

      // update lastMealReportAt and today's nutrition totals when food is detected
      if (nutrition.calories > 0) {
        const usersRef = db.collection(`tenants/${botId}/users`).doc(userId);
        const todayStr = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10); // YYYY-MM-DD (JST)
        const FieldValue = admin.firestore.FieldValue;

        await db.runTransaction(async (t) => {
          const snap = await t.get(usersRef);
          const isSameDay = snap.data()?.todayDate === todayStr;

          if (isSameDay) {
            // Same day: atomically increment
            t.update(usersRef, {
              lastMealReportAt: new Date(),
              todayCalories: FieldValue.increment(nutrition.calories),
              todayProtein: FieldValue.increment(nutrition.protein),
              todayFat: FieldValue.increment(nutrition.fat),
              todayCarbs: FieldValue.increment(nutrition.carbs),
            });
          } else {
            // New day: reset totals
            t.set(usersRef, {
              lastMealReportAt: new Date(),
              todayDate: todayStr,
              todayCalories: nutrition.calories,
              todayProtein: nutrition.protein,
              todayFat: nutrition.fat,
              todayCarbs: nutrition.carbs,
            }, {merge: true});
          }
        });
      }

      // reply via LINE with natural text only
      await replyToLine(replyToken, parsed.replyText, tenantData.lineAccessToken);
    });

    const results = await Promise.allSettled(tasks);
    results.forEach((r, i) => {
      if (r.status === "rejected") {
        console.error(`Event[${i}] failed:`, r.reason);
      }
    });

    // 6. always respond with 200 OK to prevent LINE retry
    res.status(200).send("OK");
  } catch (error) {
    console.error("System Error:", error);
    res.status(500).send("Internal Server Error");
  }
});

// ---------------------------------------------------------
// Callable: Setup tenant — auto-fetch bot info and set webhook
// ---------------------------------------------------------
export const setupTenant = onCall({region: "asia-northeast1"}, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Authentication required");
  }

  const {channelSecret, channelAccessToken} = request.data as {channelSecret: string; channelAccessToken: string};
  if (!channelSecret?.trim() || !channelAccessToken?.trim()) {
    throw new HttpsError("invalid-argument", "channelSecret and channelAccessToken are required");
  }

  // 1. Verify token and get bot info from LINE API
  let botUserId: string;
  let basicId: string;
  try {
    const botInfoRes = await axios.get("https://api.line.me/v2/bot/info", {
      headers: {Authorization: `Bearer ${channelAccessToken}`},
    });
    botUserId = botInfoRes.data.userId;
    basicId = botInfoRes.data.basicId;
  } catch {
    throw new HttpsError("invalid-argument", "Channel Access Token が無効です。LINE Developers コンソールで確認してください。");
  }

  // 2. Check if already registered by another trainer
  const existingTenant = await db.collection("tenants").doc(botUserId).get();
  if (existingTenant.exists && existingTenant.data()?.ownerId !== request.auth.uid) {
    throw new HttpsError("already-exists", "このBotはすでに別のアカウントで登録されています。");
  }

  // 3. Auto-set webhook URL
  const webhookUrl = "https://asia-northeast1-line-omakase.cloudfunctions.net/lineWebhook";
  try {
    await axios.put("https://api.line.me/v2/bot/channel/webhook/endpoint",
      {webhook_endpoint: webhookUrl},
      {headers: {Authorization: `Bearer ${channelAccessToken}`}},
    );
  } catch {
    // Non-fatal: webhook URL setting may require additional permissions
    console.warn("Failed to auto-set webhook URL, trainer must set it manually");
  }

  // 4. Create or update tenant
  await db.collection("tenants").doc(botUserId).set({
    ownerId: request.auth.uid,
    lineChannelSecret: channelSecret.trim(),
    lineAccessToken: channelAccessToken.trim(),
    basicId,
  }, {merge: true});

  return {botUserId, basicId};
});

// ---------------------------------------------------------
// Callable: Send push message from trainer to a LINE user
// ---------------------------------------------------------
export const sendPushMessage = onCall({region: "asia-northeast1"}, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Authentication required");
  }

  const {lineUserId, message} = request.data as {lineUserId: string; message: string};
  if (!lineUserId || !message || typeof message !== "string" || message.trim() === "") {
    throw new HttpsError("invalid-argument", "lineUserId and message are required");
  }

  const uid = request.auth.uid;
  const tenantsSnap = await db.collection("tenants").where("ownerId", "==", uid).get();
  if (tenantsSnap.empty) {
    throw new HttpsError("not-found", "No tenant found for this user");
  }

  const tenantDoc = tenantsSnap.docs[0];
  const tenantId = tenantDoc.id;
  const tenantData = tenantDoc.data() as Tenant;

  // Verify lineUserId belongs to this trainer's tenant
  const userDoc = await db.collection(`tenants/${tenantId}/users`).doc(lineUserId).get();
  if (!userDoc.exists) {
    throw new HttpsError("not-found", "User not found in your tenant");
  }

  // Send push message via LINE API
  await axios.post("https://api.line.me/v2/bot/message/push", {
    to: lineUserId,
    messages: [{type: "text", text: message.trim()}],
  }, {
    headers: {"Authorization": `Bearer ${tenantData.lineAccessToken}`},
  });

  // Save to Firestore as trainer message
  await db.collection(`tenants/${tenantId}/users/${lineUserId}/messages`).add({
    sender: "trainer",
    type: "text",
    content: message.trim(),
    createdAt: new Date(),
  });

  return {success: true};
});

// ---------------------------------------------------------
// Callable: Refresh all user profiles for a tenant
// ---------------------------------------------------------
export const refreshUserProfiles = onCall({region: "asia-northeast1"}, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Authentication required");
  }

  const uid = request.auth.uid;

  // Find tenant owned by this user
  const tenantsSnap = await db.collection("tenants").where("ownerId", "==", uid).get();
  if (tenantsSnap.empty) {
    throw new HttpsError("not-found", "No tenant found for this user");
  }

  const tenantDoc = tenantsSnap.docs[0];
  const tenantId = tenantDoc.id;
  const tenantData = tenantDoc.data() as Tenant;

  // Get all users
  const usersSnap = await db.collection(`tenants/${tenantId}/users`).get();
  let updated = 0;

  for (const userDoc of usersSnap.docs) {
    const userId = userDoc.id;
    try {
      const profileRes = await axios.get(`https://api.line.me/v2/bot/profile/${userId}`, {
        headers: {Authorization: `Bearer ${tenantData.lineAccessToken}`},
      });
      await userDoc.ref.update({
        displayName: profileRes.data.displayName,
        ...(profileRes.data.pictureUrl && {pictureUrl: profileRes.data.pictureUrl}),
      });
      updated++;
    } catch (err) {
      console.warn(`Failed to fetch profile for ${userId}:`, err);
    }
  }

  return {updated, total: usersSnap.size};
});

// ---------------------------------------------------------
// Scheduled: Check for unreported users and create notifications
// Runs every day at 21:00 JST (12:00 UTC)
// ---------------------------------------------------------
export const checkUnreportedUsers = onSchedule({
  schedule: "0 12 * * *",
  region: "asia-northeast1",
  timeZone: "Asia/Tokyo",
}, async () => {
  const tenantsSnap = await db.collection("tenants").get();
  const twelveHoursAgo = new Date(Date.now() - 12 * 60 * 60 * 1000);

  for (const tenantDoc of tenantsSnap.docs) {
    const tenantId = tenantDoc.id;
    const tenantData = tenantDoc.data() as Tenant;
    const accessToken = tenantData.lineAccessToken;
    const reminderText = tenantData.reminderMessage?.trim() ||
      "今日の食事はまだ報告されていません🍽 写真やテキストで教えてくださいね！";
    const usersSnap = await db.collection(`tenants/${tenantId}/users`).get();

    const unreported: string[] = [];
    for (const userDoc of usersSnap.docs) {
      const data = userDoc.data();
      const lastReport = data.lastMealReportAt?.toDate();
      if (!lastReport || lastReport < twelveHoursAgo) {
        unreported.push(data.displayName || userDoc.id);

        // Send LINE push reminder
        try {
          await axios.post("https://api.line.me/v2/bot/message/push", {
            to: userDoc.id,
            messages: [{type: "text", text: reminderText}],
          }, {
            headers: {"Authorization": `Bearer ${accessToken}`},
          });

          // Save to chat history
          await db.collection(`tenants/${tenantId}/users/${userDoc.id}/messages`).add({
            sender: "ai",
            type: "text",
            content: reminderText,
            createdAt: new Date(),
          });
        } catch (err) {
          console.error(`Failed to send reminder to ${userDoc.id} in tenant ${tenantId}:`, err);
        }
      }
    }

    if (unreported.length > 0) {
      await db.collection(`tenants/${tenantId}/notifications`).add({
        type: "unreported_users",
        message: `${unreported.length}名が12時間以上食事報告していません: ${unreported.slice(0, 5).join(", ")}${unreported.length > 5 ? ` 他${unreported.length - 5}名` : ""}`,
        userCount: unreported.length,
        createdAt: new Date(),
        read: false,
      });
    }
  }

  console.log(`Checked ${tenantsSnap.size} tenants for unreported users`);
});

// ---------------------------------------------------------
// Helper: Generate AI daily summary using Gemini
// ---------------------------------------------------------
const generateAiSummary = async (
  userData: Partial<AppUser>,
  meals: AppMessage[],
  totalCal: number,
  totalP: number,
  totalF: number,
  totalC: number,
): Promise<string> => {
  const info = userData.personalInfo;
  const goal = userData.nutritionalGoal;

  const mealDescriptions = meals.map((m, i) => {
    const n = m.nutrition;
    return `食事${i + 1}: ${m.content}${n ? ` (${n.calories}kcal, P:${n.protein}g, F:${n.fat}g, C:${n.carbs}g)` : ""}`;
  }).join("\n");

  const prompt = `あなたは栄養指導の専門家です。以下のクライアント情報と本日の食事記録を元に、パーソナライズされた1日の総評を日本語で書いてください。
200文字〜400文字程度で、具体的な改善点や良かった点を含めてください。

${info ? `【クライアント情報】
- 性別: ${info.sex === "male" ? "男性" : "女性"}
- 身長: ${info.height}cm / 体重: ${info.weight}kg / 目標体重: ${info.targetWeight}kg
- 目的: ${info.purpose === "lose_weight" ? "減量" : info.purpose === "maintain" ? "体重維持" : "増量"}
- 運動内容: ${info.exerciseType || "未記入"}
${info.allergies ? `- アレルギー: ${info.allergies}` : ""}
${info.medicalHistory ? `- 既往歴: ${info.medicalHistory}` : ""}` : ""}

${goal ? `【1日の栄養目標】
- カロリー: ${goal.targetCalories}kcal
- タンパク質: ${goal.protein}g / 脂質: ${goal.fat}g / 炭水化物: ${goal.carbs}g` : ""}

【本日の摂取合計】
- カロリー: ${Math.round(totalCal)}kcal / タンパク質: ${Math.round(totalP)}g / 脂質: ${Math.round(totalF)}g / 炭水化物: ${Math.round(totalC)}g

【食事内容】
${mealDescriptions || "記録なし"}

総評を書いてください:`;

  const model = genAI.getGenerativeModel({model: "gemini-2.5-flash-lite"});
  const result = await model.generateContent(prompt);
  return result.response.text();
};

// ---------------------------------------------------------
// Scheduled: Send daily nutrition summary to users who reported
// Runs every hour; processes tenants whose summaryTime matches current JST hour
// ---------------------------------------------------------
export const sendDailySummary = onSchedule({
  schedule: "0 * * * *",
  region: "asia-northeast1",
  timeZone: "Asia/Tokyo",
}, async () => {
  // Current JST hour as "HH:00"
  const nowJST = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const currentHour = String(nowJST.getUTCHours()).padStart(2, "0") + ":00";
  // Target date: if summaryTime is "00:00", we summarize the previous day
  const targetDate = new Date(nowJST);
  if (currentHour === "00:00") {
    targetDate.setUTCDate(targetDate.getUTCDate() - 1);
  }
  const todayStr = targetDate.toISOString().slice(0, 10); // YYYY-MM-DD

  const LIFF_ID = process.env.LIFF_ID || "";

  const tenantsSnap = await db.collection("tenants").get();
  let sentCount = 0;

  for (const tenantDoc of tenantsSnap.docs) {
    const tenantId = tenantDoc.id;
    const tenantData = tenantDoc.data() as Tenant;

    // Check if this tenant's summaryTime matches the current hour
    const tenantSummaryTime = tenantData.summaryTime || "00:00";
    if (tenantSummaryTime !== currentHour) continue;

    const accessToken = tenantData.lineAccessToken;
    const usersSnap = await db.collection(`tenants/${tenantId}/users`).get();

    for (const userDoc of usersSnap.docs) {
      const data = userDoc.data() as Partial<AppUser>;

      // Only send to users who reported on the target date
      if (data.todayDate !== todayStr || !data.todayCalories) continue;
      // Only send to users with personalInfo set
      if (!data.personalInfo) continue;

      const totalCal = data.todayCalories || 0;
      const totalP = data.todayProtein || 0;
      const totalF = data.todayFat || 0;
      const totalC = data.todayCarbs || 0;
      const goal = data.nutritionalGoal;

      // Fetch today's meal messages (with nutrition data)
      const messagesSnap = await db
        .collection(`tenants/${tenantId}/users/${userDoc.id}/messages`)
        .where("sender", "==", "user")
        .orderBy("createdAt", "asc")
        .get();

      const todayMeals = messagesSnap.docs
        .filter((d) => {
          const created = d.data().createdAt?.toDate?.() || new Date(d.data().createdAt);
          const dateStr = new Date(created.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
          return dateStr === todayStr;
        })
        .map((d) => d.data() as AppMessage);

      // Generate AI summary
      let aiSummary: string;
      try {
        aiSummary = await generateAiSummary(data, todayMeals, totalCal, totalP, totalF, totalC);
      } catch (aiErr) {
        console.error(`AI summary generation failed for ${userDoc.id}:`, aiErr);
        aiSummary = "本日の総評を生成できませんでした。明日も頑張りましょう！";
      }

      // Save to dailySummaries collection
      const summaryDoc = {
        date: todayStr,
        totalCalories: Math.round(totalCal),
        totalProtein: Math.round(totalP),
        totalFat: Math.round(totalF),
        totalCarbs: Math.round(totalC),
        mealCount: todayMeals.filter((m) => {
          // Count messages that had nutrition responses (from AI side)
          return true;
        }).length,
        summary: aiSummary,
        goalSnapshot: goal ? {
          targetCalories: goal.targetCalories,
          protein: goal.protein,
          fat: goal.fat,
          carbs: goal.carbs,
        } : null,
        createdAt: new Date(),
      };

      await db
        .collection(`tenants/${tenantId}/users/${userDoc.id}/dailySummaries`)
        .doc(todayStr)
        .set(summaryDoc);

      // Build LINE message
      const calPct = goal ? Math.round((totalCal / goal.targetCalories) * 100) : 0;
      const pLine = goal ? `${Math.round(totalP)} / ${goal.protein}g` : `${Math.round(totalP)}g`;
      const fLine = goal ? `${Math.round(totalF)} / ${goal.fat}g` : `${Math.round(totalF)}g`;
      const cLine = goal ? `${Math.round(totalC)} / ${goal.carbs}g` : `${Math.round(totalC)}g`;
      const calLine = goal ?
        `${Math.round(totalCal).toLocaleString()} / ${goal.targetCalories.toLocaleString()} kcal（${calPct}%）` :
        `${Math.round(totalCal).toLocaleString()} kcal`;

      let summaryText = "📊 本日の食事レポート\n\n" +
        `🔥 カロリー: ${calLine}\n` +
        `🥩 P: ${pLine} 🧈 F: ${fLine} 🍚 C: ${cLine}\n\n` +
        `■ 総評\n${aiSummary}`;

      if (LIFF_ID) {
        summaryText += `\n\n📖 過去の記録はこちら\nhttps://liff.line.me/${LIFF_ID}/diary/${tenantId}/${userDoc.id}`;
      }

      try {
        await axios.post("https://api.line.me/v2/bot/message/push", {
          to: userDoc.id,
          messages: [{type: "text", text: summaryText}],
        }, {
          headers: {"Authorization": `Bearer ${accessToken}`},
        });

        await db.collection(`tenants/${tenantId}/users/${userDoc.id}/messages`).add({
          sender: "ai",
          type: "text",
          content: summaryText,
          createdAt: new Date(),
        });

        sentCount++;
      } catch (err) {
        console.error(`Failed to send daily summary to ${userDoc.id} in tenant ${tenantId}:`, err);
      }
    }
  }

  console.log(`[${currentHour}] Sent daily summaries to ${sentCount} users across ${tenantsSnap.size} tenants`);
});

// ---------------------------------------------------------
// HTTP: Save personal info from LIFF onboarding form
// ---------------------------------------------------------
export const savePersonalInfo = onRequest({region: "asia-northeast1"}, async (req, res) => {
  // CORS
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.set("Access-Control-Allow-Headers", "Authorization, Content-Type");
  if (req.method === "OPTIONS") {
    res.status(204).send("");
    return;
  }

  if (req.method !== "POST") {
    res.status(405).send("Method Not Allowed");
    return;
  }

  const {tenantId, userId, personalInfo} = req.body as {
    tenantId: string;
    userId: string;
    personalInfo: PersonalInfo;
  };

  if (!tenantId || !userId || !personalInfo) {
    res.status(400).json({error: "tenantId, userId, and personalInfo are required"});
    return;
  }

  // Verify LIFF access token
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({error: "Authorization header required"});
    return;
  }

  const accessToken = authHeader.split("Bearer ")[1];
  try {
    const verifyRes = await axios.get(
      `https://api.line.me/oauth2/v2.1/verify?access_token=${encodeURIComponent(accessToken)}`,
    );
    if (verifyRes.data.expires_in <= 0) {
      res.status(401).json({error: "Token expired"});
      return;
    }
    const profileRes = await axios.get("https://api.line.me/v2/profile", {
      headers: {Authorization: `Bearer ${accessToken}`},
    });
    if (profileRes.data.userId !== userId) {
      res.status(403).json({error: "User mismatch"});
      return;
    }
  } catch {
    res.status(401).json({error: "Invalid access token"});
    return;
  }

  // Validate required fields
  if (!personalInfo.sex || !personalInfo.birthDate || !personalInfo.height || !personalInfo.weight || !personalInfo.consentGiven) {
    res.status(400).json({error: "Missing required personal info fields"});
    return;
  }

  // Calculate nutritional goal
  const nutritionalGoal = calculateNutritionalGoal(personalInfo);

  // Save to Firestore
  await db.collection(`tenants/${tenantId}/users`).doc(userId).set({
    personalInfo,
    nutritionalGoal,
  }, {merge: true});

  res.status(200).json({success: true, nutritionalGoal});
});

// ---------------------------------------------------------
// HTTP: Get daily summaries for LIFF diary page
// ---------------------------------------------------------
export const getDailySummaries = onRequest({region: "asia-northeast1"}, async (req, res) => {
  // CORS
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.set("Access-Control-Allow-Headers", "Authorization, Content-Type");
  if (req.method === "OPTIONS") {
    res.status(204).send("");
    return;
  }

  if (req.method !== "GET") {
    res.status(405).send("Method Not Allowed");
    return;
  }

  const tenantId = req.query.tenantId as string;
  const userId = req.query.userId as string;
  const limit = parseInt(req.query.limit as string) || 30;

  if (!tenantId || !userId) {
    res.status(400).json({error: "tenantId and userId are required"});
    return;
  }

  // Verify LIFF access token
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({error: "Authorization header required"});
    return;
  }

  const accessToken = authHeader.split("Bearer ")[1];
  try {
    const verifyRes = await axios.get(
      `https://api.line.me/oauth2/v2.1/verify?access_token=${encodeURIComponent(accessToken)}`,
    );
    if (verifyRes.data.expires_in <= 0) {
      res.status(401).json({error: "Token expired"});
      return;
    }
    // Get user profile to verify identity
    const profileRes = await axios.get("https://api.line.me/v2/profile", {
      headers: {Authorization: `Bearer ${accessToken}`},
    });
    if (profileRes.data.userId !== userId) {
      res.status(403).json({error: "User mismatch"});
      return;
    }
  } catch {
    res.status(401).json({error: "Invalid access token"});
    return;
  }

  // Fetch daily summaries
  const summariesSnap = await db
    .collection(`tenants/${tenantId}/users/${userId}/dailySummaries`)
    .orderBy("date", "desc")
    .limit(limit)
    .get();

  const summaries = summariesSnap.docs.map((doc) => ({
    ...doc.data(),
    createdAt: doc.data().createdAt?.toDate?.().toISOString() || null,
  }));

  res.status(200).json({summaries});
});

// ---------------------------------------------------------
// Scheduled: Proactive lunch check-in (14:00 JST daily)
// ---------------------------------------------------------
export const proactiveCheckIn = onSchedule({
  schedule: "0 5 * * *", // 14:00 JST = 05:00 UTC
  region: "asia-northeast1",
  timeZone: "Asia/Tokyo",
}, async () => {
  const tenantsSnap = await db.collection("tenants").get();
  let sentCount = 0;

  for (const tenantDoc of tenantsSnap.docs) {
    const tenantId = tenantDoc.id;
    const tenantData = tenantDoc.data() as Tenant;

    // Check if proactive check-in is enabled
    const isB2C = tenantData.tenantType === "b2c";
    const enabled = tenantData.proactiveCheckInEnabled ?? isB2C;
    if (!enabled) continue;

    const accessToken = tenantData.lineAccessToken;
    const todayStr = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const usersSnap = await db.collection(`tenants/${tenantId}/users`).get();

    for (const userDoc of usersSnap.docs) {
      const data = userDoc.data() as Partial<AppUser>;

      // Skip users who already reported today
      if (data.todayDate === todayStr && data.todayCalories && data.todayCalories > 0) continue;

      const goal = data.nutritionalGoal;
      let message = "お昼ごはんは食べましたか？写真やテキストで教えてくださいね!";

      if (goal) {
        const todayCal = data.todayDate === todayStr ? (data.todayCalories || 0) : 0;
        const remaining = goal.targetCalories - todayCal;
        if (remaining > 0) {
          message = `お昼ごはんは食べましたか？今日の残りカロリーは約${Math.round(remaining)}kcalです。写真やテキストで教えてくださいね!`;
        }
      }

      try {
        await axios.post("https://api.line.me/v2/bot/message/push", {
          to: userDoc.id,
          messages: [{type: "text", text: message}],
        }, {
          headers: {"Authorization": `Bearer ${accessToken}`},
        });

        await db.collection(`tenants/${tenantId}/users/${userDoc.id}/messages`).add({
          sender: "ai",
          type: "text",
          content: message,
          createdAt: new Date(),
        });

        sentCount++;
      } catch (err) {
        console.error(`Failed to send check-in to ${userDoc.id}:`, err);
      }
    }
  }

  console.log(`Proactive check-in sent to ${sentCount} users`);
});

// ---------------------------------------------------------
// Scheduled: Detect nutrition patterns (06:00 JST daily)
// ---------------------------------------------------------
export const detectPatterns = onSchedule({
  schedule: "0 21 * * *", // 06:00 JST = 21:00 UTC (previous day)
  region: "asia-northeast1",
  timeZone: "Asia/Tokyo",
}, async () => {
  const tenantsSnap = await db.collection("tenants").get();
  let alertCount = 0;

  for (const tenantDoc of tenantsSnap.docs) {
    const tenantId = tenantDoc.id;
    const usersSnap = await db.collection(`tenants/${tenantId}/users`).get();

    for (const userDoc of usersSnap.docs) {
      const userData = userDoc.data() as Partial<AppUser>;
      const goal = userData.nutritionalGoal;
      if (!goal) continue;

      // Get last 7 days of summaries
      const summariesSnap = await db
        .collection(`tenants/${tenantId}/users/${userDoc.id}/dailySummaries`)
        .orderBy("date", "desc")
        .limit(7)
        .get();

      if (summariesSnap.size < 3) continue;

      const summaries = summariesSnap.docs.map((d) => d.data());

      // Check calorie overage (>115% for 3+ days)
      const overDays = summaries.filter(
        (s) => s.totalCalories > goal.targetCalories * 1.15
      ).length;

      if (overDays >= 3) {
        await db.collection(`tenants/${tenantId}/notifications`).add({
          type: "pattern_alert",
          message: `${userData.displayName || userDoc.id}さんが直近7日のうち${overDays}日でカロリーを15%以上超過しています`,
          userId: userDoc.id,
          createdAt: new Date(),
          read: false,
        });
        alertCount++;
      }

      // Check protein deficiency (<70% for 3+ days)
      const lowProteinDays = summaries.filter(
        (s) => s.totalProtein < goal.protein * 0.7
      ).length;

      if (lowProteinDays >= 3) {
        await db.collection(`tenants/${tenantId}/notifications`).add({
          type: "pattern_alert",
          message: `${userData.displayName || userDoc.id}さんが直近7日のうち${lowProteinDays}日でタンパク質が目標の70%未満です`,
          userId: userDoc.id,
          createdAt: new Date(),
          read: false,
        });
        alertCount++;
      }
    }
  }

  console.log(`Pattern detection complete: ${alertCount} alerts generated`);
});

// ---------------------------------------------------------
// HTTP: LINE Login → Firebase Custom Token 発行
// LINEアクセストークンを検証し、Firebase Custom Tokenを返す
// ---------------------------------------------------------
export const lineLoginAuth = onRequest({region: "asia-northeast1"}, async (req, res) => {
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.set("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") {
    res.status(204).send("");
    return;
  }
  if (req.method !== "POST") {
    res.status(405).send("Method Not Allowed");
    return;
  }

  const {accessToken} = req.body as {accessToken: string};
  if (!accessToken) {
    res.status(400).json({error: "accessToken is required"});
    return;
  }

  try {
    // LINE APIでプロフィール取得（トークン検証を兼ねる）
    const profileRes = await axios.get("https://api.line.me/v2/profile", {
      headers: {Authorization: `Bearer ${accessToken}`},
    });
    const {userId, displayName, pictureUrl} = profileRes.data;

    // LINE userId を UID として Firebase Custom Token を発行
    const customToken = await admin.auth().createCustomToken(userId);

    res.status(200).json({customToken, displayName, pictureUrl});
  } catch (err) {
    console.error("lineLoginAuth error:", err);
    res.status(401).json({error: "Invalid LINE access token"});
  }
});
