// dashboard/src/app/users/[id]/goal/page.tsx
"use client";

import { useState, use } from "react";
import { doc, updateDoc } from "firebase/firestore";
import { db } from "../../../../src/lib/firebase";
import { useRouter } from "next/navigation";
import { PersonalInfo, ActivityLevel, Purpose } from "../../../../src/types";
import { calculateNutritionalGoal } from "../../../../src/lib/calculateNutrition";

// Next.js 15+ の params は Promise として扱う必要があります
export default function GoalSettingPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const userId = resolvedParams.id;
  const router = useRouter();
  
  const BOT_ID = "Uf6b83d5863bf2547760bf6e86bcd658a";

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState<PersonalInfo>({
    sex: "male",
    age: 30,
    height: 170,
    weight: 65,
    activityLevel: "moderate",
    purpose: "maintain",
    targetWeight: 65,
    allergies: "",
    medicalHistory: "",
    medication: "",
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      // 数値フィールドは number にキャストする
      [name]: ["age", "height", "weight", "targetWeight"].includes(name) ? Number(value) : value,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      // 1. 先ほど作った関数でカロリーとPFCを自動計算
      const goal = calculateNutritionalGoal(formData);

      // 2. Firestoreの該当ユーザードキュメントを更新
      const userRef = doc(db, `tenants/${BOT_ID}/users`, userId);
      await updateDoc(userRef, {
        personalInfo: formData,
        nutritionalGoal: goal,
      });

      alert(`計算完了！\n目標カロリー: ${goal.targetCalories} kcal に設定しました。`);
      
      // 3. ダッシュボード一覧へ戻る
      router.push("/");
    } catch (error) {
      console.error("保存エラー:", error);
      alert("保存に失敗しました。");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 py-10 px-4">
      <div className="max-w-2xl mx-auto bg-white rounded-xl shadow p-8">
        <h1 className="text-2xl font-bold mb-6 text-gray-800">
          目標栄養素の設定 <span className="text-sm font-normal text-gray-500 ml-2">ID: {userId}</span>
        </h1>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* 身体情報セクション */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">性別</label>
              <select name="sex" value={formData.sex} onChange={handleChange} className="w-full border rounded-md p-2">
                <option value="male">男性</option>
                <option value="female">女性</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">年齢</label>
              <input type="number" name="age" value={formData.age} onChange={handleChange} required className="w-full border rounded-md p-2" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">身長 (cm)</label>
              <input type="number" step="0.1" name="height" value={formData.height} onChange={handleChange} required className="w-full border rounded-md p-2" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">現在の体重 (kg)</label>
              <input type="number" step="0.1" name="weight" value={formData.weight} onChange={handleChange} required className="w-full border rounded-md p-2" />
            </div>
          </div>

          {/* ライフスタイル・目的セクション */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">活動レベル</label>
              <select name="activityLevel" value={formData.activityLevel} onChange={handleChange} className="w-full border rounded-md p-2">
                <option value="sedentary">ほぼ運動しない (デスクワーク)</option>
                <option value="light">軽い運動 (週1-3回)</option>
                <option value="moderate">中程度の運動 (週3-5回)</option>
                <option value="active">激しい運動 (週6-7回)</option>
                <option value="very_active">非常に激しい運動/肉体労働</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">目的</label>
              <select name="purpose" value={formData.purpose} onChange={handleChange} className="w-full border rounded-md p-2">
                <option value="lose_weight">減量</option>
                <option value="maintain">維持</option>
                <option value="bulk_up">増量</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">目標体重 (kg)</label>
            <input type="number" step="0.1" name="targetWeight" value={formData.targetWeight} onChange={handleChange} required className="w-full border md:w-1/2 rounded-md p-2" />
          </div>

          <hr className="my-6" />

          {/* 医療・アレルギー情報セクション (リスク管理) */}
          <div className="space-y-4">
            <h3 className="text-lg font-medium text-gray-800">特記事項・医療情報</h3>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">アレルギー情報</label>
              <input type="text" name="allergies" value={formData.allergies} onChange={handleChange} placeholder="例: そば、甲殻類 (なしの場合は空欄)" className="w-full border rounded-md p-2" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">既往歴 (高血圧、糖尿病、腎疾患など)</label>
              <textarea name="medicalHistory" value={formData.medicalHistory} onChange={handleChange} placeholder="医師からの指導がある場合は必ず記入" rows={2} className="w-full border rounded-md p-2"></textarea>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">服薬情報</label>
              <textarea name="medication" value={formData.medication} onChange={handleChange} rows={2} className="w-full border rounded-md p-2"></textarea>
            </div>
          </div>

          <div className="flex justify-end gap-4 pt-4">
            <button type="button" onClick={() => router.push("/")} className="px-6 py-2 border rounded-lg text-gray-600 hover:bg-gray-100">
              キャンセル
            </button>
            <button type="submit" disabled={isSubmitting} className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-blue-300">
              {isSubmitting ? "保存中..." : "計算して目標を保存"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}