"use client";

export const dynamic = "force-dynamic";

import { useState, useEffect, use } from "react";
import { doc, updateDoc, getDoc } from "firebase/firestore";
import { db } from "../../../../src/lib/firebase";
import { useRouter } from "next/navigation";
import { PersonalInfo } from "../../../../src/types";
import { calculateNutritionalGoal } from "../../../../src/lib/calculateNutrition";
import { useRequireAuth } from "../../../../src/hooks/useRequireAuth";
import { useToast } from "../../../../src/components/Toast";
import Link from "next/link";

const defaultFormData: PersonalInfo = {
  sex: "male",
  birthDate: "",
  height: 170,
  weight: 65,
  activityLevel: "moderate",
  exerciseType: "",
  purpose: "maintain",
  targetWeight: 65,
  sleepHours: 7,
  mealFrequency: 3,
  alcoholHabit: "",
  supplements: "",
  foodPreferences: "",
  allergies: "",
  medicalHistory: "",
  medication: "",
  consentGiven: false,
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-slate-100 p-4 space-y-4">
      <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{title}</h2>
      {children}
    </div>
  );
}

function Field({ label, children, note }: { label: string; children: React.ReactNode; note?: string }) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-700 mb-1">{label}</label>
      {children}
      {note && <p className="text-[11px] text-slate-400 mt-1">{note}</p>}
    </div>
  );
}

const inputCls = "w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent";
const textareaCls = `${inputCls} resize-none`;

export default function GoalSettingPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const userId = resolvedParams.id;
  const router = useRouter();
  const { tenantId, ready } = useRequireAuth();
  const { showToast } = useToast();

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [displayName, setDisplayName] = useState("");
  const [formData, setFormData] = useState<PersonalInfo>(defaultFormData);

  useEffect(() => {
    if (!ready || !tenantId) return;
    const fetchUser = async () => {
      const snap = await getDoc(doc(db, `tenants/${tenantId}/users`, userId));
      if (snap.exists()) {
        const data = snap.data();
        setDisplayName(data.displayName || "");
        if (data.personalInfo) setFormData(data.personalInfo as PersonalInfo);
      }
      setLoading(false);
    };
    fetchUser();
  }, [ready, tenantId, userId]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === "checkbox"
        ? (e.target as HTMLInputElement).checked
        : ["height", "weight", "targetWeight", "sleepHours", "mealFrequency"].includes(name)
          ? Number(value)
          : value,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tenantId || !formData.consentGiven) return;
    setIsSubmitting(true);
    try {
      const goal = calculateNutritionalGoal(formData);
      await updateDoc(doc(db, `tenants/${tenantId}/users`, userId), {
        personalInfo: formData,
        nutritionalGoal: goal,
      });
      showToast(`目標カロリー: ${goal.targetCalories} kcal に設定しました`);
      router.push(`/users/${userId}`);
    } catch (error) {
      console.error("保存エラー:", error);
      showToast("保存に失敗しました", "error");
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
      <header className="bg-slate-900 sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
          <Link href={`/users/${userId}`} className="text-slate-400 hover:text-slate-200 transition-colors">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
            </svg>
          </Link>
          <div>
            <h1 className="text-sm font-bold text-white">目標・個人情報の設定</h1>
            {displayName && <p className="text-[11px] text-slate-400">{displayName}</p>}
          </div>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-4 py-4">
        <form onSubmit={handleSubmit} className="space-y-4">

          {/* 基本情報 */}
          <Section title="基本情報">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
              <Field label="性別">
                <select name="sex" value={formData.sex} onChange={handleChange} className={inputCls}>
                  <option value="male">男性</option>
                  <option value="female">女性</option>
                </select>
              </Field>
              <Field label="生年月日">
                <input type="date" name="birthDate" value={formData.birthDate} onChange={handleChange} required className={inputCls} />
              </Field>
              <Field label="身長 (cm)">
                <input type="number" step="0.1" name="height" value={formData.height} onChange={handleChange} required className={inputCls} />
              </Field>
              <Field label="現在の体重 (kg)">
                <input type="number" step="0.1" name="weight" value={formData.weight} onChange={handleChange} required className={inputCls} />
              </Field>
            </div>
          </Section>

          {/* 目標 */}
          <Section title="目標">
            <div className="grid grid-cols-1 gap-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
                <Field label="目的">
                  <select name="purpose" value={formData.purpose} onChange={handleChange} className={inputCls}>
                    <option value="lose_weight">減量</option>
                    <option value="maintain">体重維持</option>
                    <option value="bulk_up">増量</option>
                  </select>
                </Field>
                <Field label="目標体重 (kg)">
                  <input type="number" step="0.1" name="targetWeight" value={formData.targetWeight} onChange={handleChange} required className={inputCls} />
                </Field>
              </div>
              <Field label="活動レベル">
                <select name="activityLevel" value={formData.activityLevel} onChange={handleChange} className={inputCls}>
                  <option value="sedentary">ほぼ運動しない（デスクワーク中心）</option>
                  <option value="light">軽い運動（週1〜3回）</option>
                  <option value="moderate">中程度の運動（週3〜5回）</option>
                  <option value="active">激しい運動（週6〜7回）</option>
                  <option value="very_active">非常に激しい運動・肉体労働</option>
                </select>
              </Field>
              <Field label="運動の種類・内容" note="例：ジョギング週3回、筋トレ週2回">
                <input type="text" name="exerciseType" value={formData.exerciseType} onChange={handleChange} placeholder="例：ランニング、筋トレ、ヨガなど" className={inputCls} />
              </Field>
            </div>
          </Section>

          {/* 生活習慣 */}
          <Section title="生活習慣">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
              <Field label="平均睡眠時間 (時間)">
                <input type="number" step="0.5" min="1" max="14" name="sleepHours" value={formData.sleepHours} onChange={handleChange} className={inputCls} />
              </Field>
              <Field label="1日の食事回数">
                <input type="number" min="1" max="8" name="mealFrequency" value={formData.mealFrequency} onChange={handleChange} className={inputCls} />
              </Field>
            </div>
            <Field label="飲酒習慣" note="例：ほぼ毎日ビール1〜2缶、週末のみ、飲まない">
              <input type="text" name="alcoholHabit" value={formData.alcoholHabit} onChange={handleChange} placeholder="例：ほぼ毎日 / 週末のみ / 飲まない" className={inputCls} />
            </Field>
            <Field label="現在のサプリメント" note="例：プロテイン、ビタミンD、鉄分など">
              <input type="text" name="supplements" value={formData.supplements} onChange={handleChange} placeholder="なければ空欄" className={inputCls} />
            </Field>
          </Section>

          {/* 食の好み・制限 */}
          <Section title="食の好み・制限">
            <Field label="食の好み・苦手なもの" note="AIが食事提案の際に考慮します">
              <textarea name="foodPreferences" value={formData.foodPreferences} onChange={handleChange} rows={2} placeholder="例：魚が好き、生野菜が苦手、辛いものOK" className={textareaCls} />
            </Field>
            <Field label="アレルギー" note="必ずAIが除外します">
              <input type="text" name="allergies" value={formData.allergies} onChange={handleChange} placeholder="例：そば、甲殻類（なければ空欄）" className={inputCls} />
            </Field>
          </Section>

          {/* 医療情報 */}
          <Section title="医療情報">
            <Field label="既往歴" note="高血圧・糖尿病・腎疾患など。AIの指導内容に反映します">
              <textarea name="medicalHistory" value={formData.medicalHistory} onChange={handleChange} rows={2} placeholder="なければ空欄" className={textareaCls} />
            </Field>
            <Field label="服薬情報" note="食事との相互作用を考慮します">
              <textarea name="medication" value={formData.medication} onChange={handleChange} rows={2} placeholder="なければ空欄" className={textareaCls} />
            </Field>
          </Section>

          {/* 個人情報の取り扱い */}
          <div className="bg-slate-50 rounded-xl border border-slate-200 p-4 space-y-3">
            <h2 className="text-xs font-semibold text-slate-600">個人情報の取り扱いについて</h2>
            <p className="text-[11px] text-slate-500 leading-relaxed">
              入力いただいた個人情報（身体情報・医療情報・食事情報）は、AIによる栄養指導およびトレーナーによるサポートのみに利用します。第三者への提供は行いません。また、食事画像・テキストはAI解析のためGoogle Geminiに送信されます。
            </p>
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                name="consentGiven"
                checked={formData.consentGiven}
                onChange={handleChange}
                className="mt-0.5 w-4 h-4 accent-blue-600"
              />
              <span className="text-xs text-slate-700 font-medium">
                個人情報の取り扱いおよびGoogle Geminiへの送信に同意します
              </span>
            </label>
          </div>

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-3 pb-6">
            <button type="button" onClick={() => router.push(`/users/${userId}`)} className="px-5 py-2.5 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50 transition-colors">
              キャンセル
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !formData.consentGiven}
              className="px-5 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:bg-slate-200 disabled:text-slate-400 transition-colors"
            >
              {isSubmitting ? "保存中..." : "目標を保存"}
            </button>
          </div>

        </form>
      </div>
    </div>
  );
}
