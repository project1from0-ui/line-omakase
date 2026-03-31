"use client";

import { useState, useEffect, use } from "react";
import liff from "@line/liff";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "https://asia-northeast1-line-omakase.cloudfunctions.net";
const LIFF_ID = process.env.NEXT_PUBLIC_LIFF_ID || "";

type ActivityLevel = "sedentary" | "light" | "moderate" | "active" | "very_active";
type Purpose = "lose_weight" | "maintain" | "bulk_up";

interface PersonalInfoForm {
  sex: "male" | "female";
  birthDate: string;
  height: number;
  weight: number;
  activityLevel: ActivityLevel;
  exerciseType: string;
  purpose: Purpose;
  targetWeight: number;
  sleepHours: number;
  mealFrequency: number;
  alcoholHabit: string;
  supplements: string;
  foodPreferences: string;
  allergies: string;
  medicalHistory: string;
  medication: string;
  consentGiven: boolean;
}

const defaultFormData: PersonalInfoForm = {
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

const inputCls = "w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent";
const textareaCls = `${inputCls} resize-none`;

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

export default function OnboardingPage({ params }: { params: Promise<{ tenantId: string; userId: string }> }) {
  const { tenantId, userId } = use(params);
  const [formData, setFormData] = useState<PersonalInfoForm>(defaultFormData);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [accessToken, setAccessToken] = useState<string | null>(null);

  useEffect(() => {
    const init = async () => {
      try {
        if (!LIFF_ID) {
          setError("LIFF IDが設定されていません");
          setLoading(false);
          return;
        }

        await liff.init({ liffId: LIFF_ID });

        if (!liff.isLoggedIn()) {
          liff.login();
          return;
        }

        const token = liff.getAccessToken();
        if (!token) {
          setError("アクセストークンを取得できません");
          setLoading(false);
          return;
        }
        setAccessToken(token);
        setLoading(false);
      } catch (err) {
        console.error("LIFF init error:", err);
        setError("LIFFの初期化に失敗しました");
        setLoading(false);
      }
    };
    init();
  }, []);

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
    if (!accessToken || !formData.consentGiven || submitting) return;

    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch(`${API_BASE}/savePersonalInfo`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          tenantId,
          userId,
          personalInfo: formData,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "保存に失敗しました");
      }

      setSuccess(true);
    } catch (err: any) {
      setError(err.message || "保存に失敗しました");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-slate-300 border-t-slate-600 rounded-full animate-spin" />
          <span className="text-sm text-slate-400">読み込み中...</span>
        </div>
      </div>
    );
  }

  if (error && !formData.birthDate) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
        <div className="text-center">
          <p className="text-red-500 text-sm">{error}</p>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
        <div className="bg-white rounded-2xl border border-slate-100 p-8 text-center max-w-sm w-full">
          <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-emerald-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
            </svg>
          </div>
          <h2 className="text-lg font-bold text-slate-800 mb-2">登録完了!</h2>
          <p className="text-sm text-slate-500 mb-4">
            あなたの情報をもとに、パーソナライズされた食事指導を開始します。
          </p>
          <p className="text-xs text-slate-400">
            LINEのトーク画面に戻って、食事の写真やテキストを送ってみましょう!
          </p>
          <button
            onClick={() => liff.closeWindow()}
            className="mt-6 px-6 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
          >
            閉じる
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-slate-900 sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center flex-shrink-0">
            <span className="text-white text-xs font-bold">た</span>
          </div>
          <div>
            <h1 className="text-sm font-bold text-white">たべコーチ - 初回登録</h1>
            <p className="text-[10px] text-slate-400 mt-0.5">あなたの情報を教えてください</p>
          </div>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-4 py-4">
        <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 mb-4">
          <p className="text-xs text-blue-700 leading-relaxed">
            入力いただいた情報をもとに、AIがあなた専用の栄養目標を自動計算し、パーソナライズされた食事指導を行います。
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
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

          <Section title="食の好み・制限">
            <Field label="食の好み・苦手なもの" note="AIが食事提案の際に考慮します">
              <textarea name="foodPreferences" value={formData.foodPreferences} onChange={handleChange} rows={2} placeholder="例：魚が好き、生野菜が苦手、辛いものOK" className={textareaCls} />
            </Field>
            <Field label="アレルギー" note="必ずAIが除外します">
              <input type="text" name="allergies" value={formData.allergies} onChange={handleChange} placeholder="例：そば、甲殻類（なければ空欄）" className={inputCls} />
            </Field>
          </Section>

          <Section title="医療情報">
            <Field label="既往歴" note="高血圧・糖尿病・腎疾患など。AIの指導内容に反映します">
              <textarea name="medicalHistory" value={formData.medicalHistory} onChange={handleChange} rows={2} placeholder="なければ空欄" className={textareaCls} />
            </Field>
            <Field label="服薬情報" note="食事との相互作用を考慮します">
              <textarea name="medication" value={formData.medication} onChange={handleChange} rows={2} placeholder="なければ空欄" className={textareaCls} />
            </Field>
          </Section>

          <div className="bg-slate-50 rounded-xl border border-slate-200 p-4 space-y-3">
            <h2 className="text-xs font-semibold text-slate-600">個人情報の取り扱いについて</h2>
            <p className="text-[11px] text-slate-500 leading-relaxed">
              入力いただいた個人情報（身体情報・医療情報・食事情報）は、AIによる栄養指導のみに利用します。第三者への提供は行いません。また、食事画像・テキストはAI解析のためGoogle Geminiに送信されます。
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

          {error && (
            <div className="bg-red-50 border border-red-100 rounded-xl p-3">
              <p className="text-xs text-red-600">{error}</p>
            </div>
          )}

          <div className="pb-6">
            <button
              type="submit"
              disabled={submitting || !formData.consentGiven || !formData.birthDate}
              className="w-full px-5 py-3 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 disabled:bg-slate-200 disabled:text-slate-400 transition-colors"
            >
              {submitting ? "登録中..." : "登録して食事指導を開始"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
