import { PersonalInfo, NutritionalGoal } from "../types";

const ACTIVITY_MULTIPLIERS = {
  sedentary: 1.2,      // 運動ほぼなし
  light: 1.375,        // 週1-3回の軽い運動
  moderate: 1.55,      // 週3-5回の中程度の運動
  active: 1.725,       // 週6-7回の激しい運動
  very_active: 1.9,    // 毎日激しい運動＋肉体労働
};

export const calculateNutritionalGoal = (info: PersonalInfo): NutritionalGoal => {
  // 1. BMR (Mifflin-St Jeor)
  let bmr = 10 * info.weight + 6.25 * info.height - 5 * info.age;
  bmr += info.sex === 'male' ? 5 : -161;

  // 2. TDEE
  const tdee = bmr * ACTIVITY_MULTIPLIERS[info.activityLevel];

  // 3. Target Calories based on Purpose
  let targetCalories = tdee;
  if (info.purpose === 'lose_weight') targetCalories -= 500;
  if (info.purpose === 'bulk_up') targetCalories += 500;

  // 安全のための最低カロリー制限 (基礎代謝を下回らないようにする等)
  targetCalories = Math.max(targetCalories, 1200);

  // 4. PFC Calculation
  const protein = info.weight * 2.0; // 体重 x 2g
  const proteinCalories = protein * 4;

  const fatCalories = targetCalories * 0.25; // 総カロリーの25%
  const fat = fatCalories / 9;

  const carbCalories = targetCalories - proteinCalories - fatCalories;
  const carbs = Math.max(0, carbCalories / 4); // マイナスにならないようガード

  return {
    targetCalories: Math.round(targetCalories),
    protein: Math.round(protein),
    fat: Math.round(fat),
    carbs: Math.round(carbs),
  };
};