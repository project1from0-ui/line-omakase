import {onRequest} from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import * as crypto from "crypto";
import axios from "axios";
import {GoogleGenerativeAI, Content, Part} from "@google/generative-ai";
import {Tenant, AppUser, AppMessage} from "./types"; // importing type definitions

// initialize Firebase Admin SDK
admin.initializeApp();
const db = admin.firestore();

// initialize Google Gemini API client
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

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
    if (data.type !== "text") return; // skip non-text messages
    const role = data.sender === "user" ? "user" : "model";
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
// Helper: save message to Firestore
// ---------------------------------------------------------

// 1. update user info
const updateUserProfile = async (botId:string, userId:string) => {
  const usersRef = db.collection(`tenants/${botId}/users`).doc(userId);
  const userData: AppUser = {
    lineUserId: userId,
    displayName: "User " + userId.substring(0, 5),
    lastMessageAt: new Date(),
  };
  await usersRef.set(userData, {merge: true});
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

    // 4. validate signature
    const rawBody = JSON.stringify(body);

    if (!validateSignature(rawBody, signature, tenantData.lineChannelSecret)) {
      console.error("Invalid signature for bot:", botId);
      res.status(401).send("Invalid Signature");
      return;
    }

    // 5. process events
    const events = body.events;
    console.log(`Bot ${botId} received events:`, JSON.stringify(events));

    // process multiple events parallely
    const tasks = events.map(async (event: any) => {
      if (event.type !== "message") {
        console.log(`Unsupported event type: ${event.type} or message type: ${event.message.type}`);
        return;
      }

      const userId = event.source.userId;
      const replyToken = event.replyToken;
      const messageType = event.message.type;
      // update user profile
      await updateUserProfile(botId, userId);

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
        systemInstruction: tenantData.systemPrompt,
      });
      const chatSession = model.startChat({
        history: history,
        generationConfig: {
          maxOutputTokens: 1024,
        },
      });

      console.log(`Bot (${botId}) context length: ${history.length} messages`);

      const result = await chatSession.sendMessage(userPromptParts);
      const aiResponse = result.response.text();

      // save AI message
      await saveMessage(botId, userId, {
        sender: "ai",
        type: "text",
        content: aiResponse,
        createdAt: new Date(),
      });

      // reply via LINE Messaging API
      await replyToLine(replyToken, aiResponse, tenantData.lineAccessToken);
    });

    await Promise.all(tasks);

    // 6. respond with 200 OK so as not to retry
    res.status(200).send("OK");
  } catch (error) {
    console.error("System Error:", error);
    res.status(500).send("Internal Server Error");
  }
});
