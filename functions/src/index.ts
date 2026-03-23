import {onRequest, onCall, HttpsError} from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import * as crypto from "crypto";
import axios from "axios";
import {GoogleGenerativeAI, Content, Part, SchemaType, Schema} from "@google/generative-ai";
import {Tenant, AppUser, AppMessage, NutritionData} from "./types";
import {onSchedule} from "firebase-functions/v2/scheduler";

// initialize Firebase Admin SDK
admin.initializeApp();
const db = admin.firestore();

// initialize Google Gemini API client
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

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
    .limit(10)
    .get();

  const history: Content[] = [];
  // reverse to chronological order
  historySnapshot.docs.reverse().forEach((doc) => {
    const data = doc.data() as AppMessage;
    if (data.sender === "trainer") return; // skip trainer messages
    const role = data.sender === "user" ? "user" : "model";
    // represent image messages as text so AI retains meal context
    if (data.type === "image") {
      history.push({role, parts: [{text: "[食事画像を送信しました]"}]});
      return;
    }
    history.push({
      role: role,
      parts: [{text: data.content}],
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
const buildSystemInstruction = (tenantData: Tenant, userData: Partial<AppUser>): string => {
  const base = tenantData.systemPrompt || "";

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

  const profileSection = info ? `
【クライアント情報】
- 性別: ${info.sex === "male" ? "男性" : "女性"}
- 年齢: ${info.age}歳 / 身長: ${info.height}cm / 体重: ${info.weight}kg / 目標体重: ${info.targetWeight}kg
- 活動レベル: ${activityLabel[info.activityLevel] || info.activityLevel}
- 目的: ${purposeLabel[info.purpose] || info.purpose}
${info.allergies ? `- アレルギー: ${info.allergies}（この食材・成分を含む食事を勧めないこと）` : ""}
${info.medicalHistory ? `- 既往歴: ${info.medicalHistory}（指導内容に必ず考慮すること）` : ""}
${info.medication ? `- 服薬中: ${info.medication}（食事との相互作用に注意すること）` : ""}` : "";

  const goalSection = goal ? `
【1日の栄養目標】
- 目標カロリー: ${goal.targetCalories}kcal
- タンパク質: ${goal.protein}g / 脂質: ${goal.fat}g / 炭水化物: ${goal.carbs}g
この目標値を基準に、今日の摂取状況を踏まえて具体的な指導をすること。` : "";

  return base + profileSection + goalSection +
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
      const history = await getChatHistory(botId, userId);
      const model = genAI.getGenerativeModel({
        model: "gemini-2.5-flash-lite",
        systemInstruction: buildSystemInstruction(tenantData, userData),
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
        const todayStr = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
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
  const webhookUrl = "https://linewebhook-vajlecj5sq-an.a.run.app";
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
    const usersSnap = await db.collection(`tenants/${tenantId}/users`).get();

    const unreported: string[] = [];
    for (const userDoc of usersSnap.docs) {
      const data = userDoc.data();
      const lastReport = data.lastMealReportAt?.toDate();
      if (!lastReport || lastReport < twelveHoursAgo) {
        unreported.push(data.displayName || userDoc.id);
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
