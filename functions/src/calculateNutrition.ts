import {PersonalInfo, NutritionalGoal} from "./types";

const ACTIVITY_MULTIPLIERS: Record<string, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  very_active: 1.9,
};

/**
 * 生年月日から現在の年齢を計算する
 * @param {string} birthDate - 生年月日（YYYY-MM-DD形式）
 * @return {number} 年齢
 */
function calcAge(birthDate: string): number {
  const today = new Date();
  const birth = new Date(birthDate);
  let age = today.getFullYear() - birth.getFullYear();
  if (
    today.getMonth() < birth.getMonth() ||
    (today.getMonth() === birth.getMonth() && today.getDate() < birth.getDate())
  ) age--;
  return age;
}

export const calculateNutritionalGoal = (info: PersonalInfo): NutritionalGoal => {
  const age = calcAge(info.birthDate);
  // 1. BMR (Mifflin-St Jeor)
  let bmr = 10 * info.weight + 6.25 * info.height - 5 * age;
  bmr += info.sex === "male" ? 5 : -161;

  // 2. TDEE
  const tdee = bmr * (ACTIVITY_MULTIPLIERS[info.activityLevel] || 1.55);

  // 3. Target Calories based on Purpose
  let targetCalories = tdee;
  if (info.purpose === "lose_weight") targetCalories -= 500;
  if (info.purpose === "bulk_up") targetCalories += 500;

  targetCalories = Math.max(targetCalories, 1200);

  // 4. PFC Calculation
  const protein = info.weight * 2.0;
  const proteinCalories = protein * 4;

  const fatCalories = targetCalories * 0.25;
  const fat = fatCalories / 9;

  const carbCalories = targetCalories - proteinCalories - fatCalories;
  const carbs = Math.max(0, carbCalories / 4);

  return {
    targetCalories: Math.round(targetCalories),
    protein: Math.round(protein),
    fat: Math.round(fat),
    carbs: Math.round(carbs),
  };
};
