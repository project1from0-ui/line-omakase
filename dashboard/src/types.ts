// 1. Trainer
export interface Tenant {
  ownerId: string; // UID of the LINE user who owns this tenant
  lineChannelSecret: string; // used to verify LINE webhook signatures
  lineAccessToken: string; // used to call LINE Messaging API
  systemPrompt?: string; // used to specify the AI assistant's behavior
  basicId?: string; // LINE bot's basic ID (@xxx) for friend add URL
}

// 2. app user (LINE)
export type ActivityLevel = 'sedentary' | 'light' | 'moderate' | 'active' | 'very_active';
export type Purpose = 'lose_weight' | 'maintain' | 'bulk_up';

export interface PersonalInfo {
  sex: 'male' | 'female';
  birthDate: string; // YYYY-MM-DD
  height: number; // cm
  weight: number; // kg
  activityLevel: ActivityLevel;
  exerciseType: string; // 運動の種類・内容
  purpose: Purpose;
  targetWeight: number; // kg
  sleepHours: number; // 平均睡眠時間
  mealFrequency: number; // 1日の食事回数
  alcoholHabit: string; // 飲酒習慣
  supplements: string; // サプリメント
  foodPreferences: string; // 食の好み・苦手
  allergies: string;
  medicalHistory: string;
  medication: string;
  consentGiven: boolean;
}

export interface NutritionalGoal {
  targetCalories: number;
  protein: number; // g
  fat: number; // g
  carbs: number; // g
}

export interface AppUser {
  lineUserId: string; // user ID from LINE
  displayName: string; // used to show the user's name
  pictureUrl?: string; // URL of the user's profile picture
  lastMessageAt: Date; // timestamp of the last message sent by the user
  lastMealReportAt?: Date; // timestamp of the last meal report
  personalInfo?: PersonalInfo; // user's personal information
  nutritionalGoal?: NutritionalGoal; // user's nutritional goals
  todayDate?: string; // YYYY-MM-DD
  todayCalories?: number;
  todayProtein?: number;
  todayFat?: number;
  todayCarbs?: number;
}

// 3. chat message
export interface NutritionData {
  calories: number; // kcal
  protein: number; // g
  fat: number; // g
  carbs: number; // g
}

export interface AppMessage {
  id?: string; // document ID from Firestore
  sender: "user" | "ai" | "trainer"; // who sent the message
  type: "text" | "image"; // message type
  content: string; // text content or image URL
  createdAt: Date; // timestamp of message creation
  nutrition?: NutritionData; // AI-extracted nutrition data (only when food is detected)
}
