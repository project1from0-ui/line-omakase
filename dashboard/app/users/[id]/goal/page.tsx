"use client";

import { useState, useEffect, use } from "react";
import { doc, updateDoc, getDoc } from "firebase/firestore";
import { db } from "../../../../src/lib/firebase";
import { useRouter } from "next/navigation";
import { PersonalInfo } from "../../../../src/types";
import { calculateNutritionalGoal } from "../../../../src/lib/calculateNutrition";
import { useRequireAuth } from "../../../../src/hooks/useRequireAuth";
import Link from "next/link";

const defaultFormData: PersonalInfo = {
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
};

export default function GoalSettingPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const userId = resolvedParams.id;
  const router = useRouter();
  const { tenantId, ready } = useRequireAuth();

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [displayName, setDisplayName] = useState("");
  const [formData, setFormData] = useState<PersonalInfo>(defaultFormData);

  // Fetch existing personalInfo
  useEffect(() => {
    if (!ready || !tenantId) return;
    const fetchUser = async () => {
      const userRef = doc(db, `tenants/${tenantId}/users`, userId);
      const snap = await getDoc(userRef);
      if (snap.exists()) {
        const data = snap.data();
        setDisplayName(data.displayName || "");
        if (data.personalInfo) {
          setFormData(data.personalInfo as PersonalInfo);
        }
      }
      setLoading(false);
    };
    fetchUser();
  }, [ready, tenantId, userId]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: ["age", "height", "weight", "targetWeight"].includes(name) ? Number(value) : value,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tenantId) return;
    setIsSubmitting(true);

    try {
      const goal = calculateNutritionalGoal(formData);
      const userRef = doc(db, `tenants/${tenantId}/users`, userId);
      await updateDoc(userRef, {
        personalInfo: formData,
        nutritionalGoal: goal,
      });

      alert(`計算完了！\n目標カロリー: ${goal.targetCalories} kcal に設定しました。`);
      router.push(`/users/${userId}`);
    } catch (error) {
      console.error("保存エラー:", error);
      alert("保存に失敗しました。");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!ready || loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-slate-300 border-t-slate-600 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
          <Link href={`/users/${userId}`} className="text-slate-400 hover:text-slate-600 transition-colors">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
            </svg>
          </Link>
          <div>
            <h1 className="text-sm font-bold text-slate-800">目標栄養素の設定</h1>
            {displayName && <p className="text-[11px] text-slate-400">{displayName}</p>}
          </div>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-4 py-4">
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="bg-white rounded-xl border border-slate-100 p-4 space-y-4">
            <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">身体情報</h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">性別</label>
                <select name="sex" value={formData.sex} onChange={handleChange} className="w-full border rounded-md p-2 text-sm">
                  <option value="male">男性</option>
                  <option value="female">女性</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">年齢</label>
                <input type="number" name="age" value={formData.age} onChange={handleChange} required className="w-full border rounded-md p-2 text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">身長 (cm)</label>
                <input type="number" step="0.1" name="height" value={formData.height} onChange={handleChange} required className="w-full border rounded-md p-2 text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">現在の体重 (kg)</label>
                <input type="number" step="0.1" name="weight" value={formData.weight} onChange={handleChange} required className="w-full border rounded-md p-2 text-sm" />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-100 p-4 space-y-4">
            <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">目標</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">活動レベル</label>
                <select name="activityLevel" value={formData.activityLevel} onChange={handleChange} className="w-full border rounded-md p-2 text-sm">
                  <option value="sedentary">ほぼ運動しない (デスクワーク)</option>
                  <option value="light">軽い運動 (週1-3回)</option>
                  <option value="moderate">中程度の運動 (週3-5回)</option>
                  <option value="active">激しい運動 (週6-7回)</option>
                  <option value="very_active">非常に激しい運動/肉体労働</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">目的</label>
                <select name="purpose" value={formData.purpose} onChange={handleChange} className="w-full border rounded-md p-2 text-sm">
                  <option value="lose_weight">減量</option>
                  <option value="maintain">維持</option>
                  <option value="bulk_up">増量</option>
                </select>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">目標体重 (kg)</label>
              <input type="number" step="0.1" name="targetWeight" value={formData.targetWeight} onChange={handleChange} required className="w-full md:w-1/2 border rounded-md p-2 text-sm" />
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-100 p-4 space-y-4">
            <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">特記事項・医療情報</h2>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">アレルギー情報</label>
              <input type="text" name="allergies" value={formData.allergies} onChange={handleChange} placeholder="例: そば、甲殻類 (なしの場合は空欄)" className="w-full border rounded-md p-2 text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">既往歴 (高血圧、糖尿病、腎疾患など)</label>
              <textarea name="medicalHistory" value={formData.medicalHistory} onChange={handleChange} placeholder="医師からの指導がある場合は必ず記入" rows={2} className="w-full border rounded-md p-2 text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">服薬情報</label>
              <textarea name="medication" value={formData.medication} onChange={handleChange} rows={2} className="w-full border rounded-md p-2 text-sm" />
            </div>
          </div>

          <div className="flex justify-end gap-3">
            <button type="button" onClick={() => router.push(`/users/${userId}`)} className="px-5 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50 transition-colors">
              キャンセル
            </button>
            <button type="submit" disabled={isSubmitting} className="px-5 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:bg-blue-300 transition-colors whitespace-nowrap">
              {isSubmitting ? "保存中..." : "目標を保存"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
