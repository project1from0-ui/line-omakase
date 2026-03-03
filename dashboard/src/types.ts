// 1. Trainer
export interface Tenant {
  ownerId: string; // UID of the LINE user who owns this tenant
  lineChannelSecret: string; // used to verify LINE webhook signatures
  lineAccessToken: string; // used to call LINE Messaging API
  systemPrompt?: string; // used to specify the AI assistant's behavior
}

// 2. app user (LINE)
export type ActivityLevel = 'sedentary' | 'light' | 'moderate' | 'active' | 'very_active';
export type Purpose = 'lose_weight' | 'maintain' | 'bulk_up';

export interface PersonalInfo {
  sex: 'male' | 'female';
  age: number;
  height: number; // cm
  weight: number; // kg
  activityLevel: ActivityLevel;
  purpose: Purpose;
  targetWeight: number; // kg
  allergies: string;
  medicalHistory: string; // hypertension, diabetes, kidney diseases 等
  medication: string;
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
  personalInfo?: PersonalInfo; // user's personal information
  nutritionalGoal?: NutritionalGoal; // user's nutritional goals
}

// 3. chat message
export interface AppMessage {
  id?: string; // document ID from Firestore
  sender: "user" | "ai"; // who sent the message
  type: "text" | "image"; // message type
  content: string; // text content or image URL
  createdAt: Date; // timestamp of message creation
}
