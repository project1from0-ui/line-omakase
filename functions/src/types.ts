// 1. Trainer
export interface Tenant {
  ownerId: string; // UID of the LINE user who owns this tenant
  lineChannelSecret: string; // used to verify LINE webhook signatures
  lineAccessToken: string; // used to call LINE Messaging API
  systemPrompt?: string; // used to specify the AI assistant's behavior
}

// 2. app user (LINE)
export interface AppUser {
  lineUserId: string; // user ID from LINE
  displayName: string; // used to show the user's name
  pictureUrl?: string; // URL of the user's profile picture
  lastMessageAt: Date; // timestamp of the last message sent by the user
}

// 3. chat message
export interface AppMessage {
  id?: string; // document ID from Firestore
  sender: "user" | "ai"; // who sent the message
  type: "text" | "image"; // message type
  content: string; // text content or image URL
  createdAt: Date; // timestamp of message creation
}
