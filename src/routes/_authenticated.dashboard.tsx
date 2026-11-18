import { useCallback, useEffect, useMemo, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Activity, Apple, ArrowDownRight, ArrowUpRight, ChevronDown, ChevronUp, CircleHelp, Clock3, Flame, Leaf, LoaderCircle, LogOut, Plus, Settings2, Sparkles, Trash2, Utensils, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { deleteMeal, getDashboard, logMeal, saveProfile } from "@/lib/diet.functions";
import { NUTRIENTS, computeTargets, emptyNutrients, remaining, type NutrientKey } from "@/lib/nutrition";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [
    { title: "Today — Nourish" },
    { name: "description", content: "Your personal daily food diary, nutrition targets, and meal insights." },
    { property: "og:title", content: "Today — Nourish" },
    { property: "og:description", content: "Your daily nutrition, meal log, and personalized targets." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: Dashboard,
});

type DashboardData = Awaited<ReturnType<typeof getDashboard>>;
type ProfileForm = {
  display_name: string | null; height_cm: number | null; weight_kg: number | null; age: number | null;
  sex: string | null; activity_level: string; goal: string; dietary_notes: string | null;
};
const initialProfile: ProfileForm = { display_name: null, height_cm: null, weight_kg: null, age: null, sex: null, activity_level: "moderate", goal: "maintain", dietary_notes: null };

function dayRange() {
  const now = new Date(); const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  return { dayStart: start.toISOString(), dayEnd: end.toISOString() };
}
function dateLabel() { return new Intl.DateTimeFormat("en", { weekday: "long", month: "long", day: "numeric" }).format(new Date()); }
function clockLabel(time: string) { return new Intl.DateTimeFormat("en", { hour: "numeric", minute: "2-digit" }).format(new Date(time)); }
function MacroBar({ label, eaten, target, unit = "g", tone }: { label: string; eaten: number; target: number; unit?: string; tone: string }) {
  const pct = target > 0 ? Math.min(100, Math.round((eaten / target) * 100)) : 0;
  return <div className="macro-row"><div className="macro-label"><span className={`macro-dot ${tone}`} />{label}<span className="macro-values">{Math.round(eaten)}<i> / {Math.round(target)} {unit}</i></span></div><div className="macro-track"><div className={`macro-fill ${tone}`} style={{ width: `${pct}%` }} /></div></div>;
}
function Ring({ value, target }: { value: number; target: number }) {
  const pct = target > 0 ? Math.min(100, Math.round(value / target * 100)) : 0;
  return <div className="calorie-ring" style={{ "--pct": `${pct}%` } as React.CSSProperties}><div className="ring-center"><Flame/><strong>{Math.max(0, Math.round(target - value)).toLocaleString()}</strong><span>kcal left</span></div></div>;
}

function Dashboard() {
  const navigate = useNavigate();
  const getData = useServerFn(getDashboard); const saveProfileFn = useServerFn(saveProfile);
  const logMealFn = useServerFn(logMeal); const deleteMealFn = useServerFn(deleteMeal);
  const [data, setData] = useState<DashboardData | null>(null);
  const [profile, setProfile] = useState<ProfileForm>(initialProfile);
  const [loading, setLoading] = useState(true);
  const [savingProfile, setSavingProfile] = useState(false);
  const [logging, setLogging] = useState(false);
  const [mealText, setMealText] = useState("");
  const [error, setError] = useState("");
  const [profileOpen, setProfileOpen] = useState(false);
  const [microOpen, setMicroOpen] = useState(false);
  const [expandedMeal, setExpandedMeal] = useState<string | null>(null);
  const [userName, setUserName] = useState("there");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await getData({ data: dayRange() });
      setData(result);
      if (result.profile) setProfile({
        display_name: result.profile.display_name ?? null,
        height_cm: result.profile.height_cm == null ? null : Number(result.profile.height_cm),
        weight_kg: result.profile.weight_kg == null ? null : Number(result.profile.weight_kg),
        age: result.profile.age, sex: result.profile.sex, activity_level: result.profile.activity_level,
        goal: result.profile.goal, dietary_notes: result.profile.dietary_notes,
      });
    } catch (e) { setError(e instanceof Error ? e.message : "Could not load your diary."); }
    finally { setLoading(false); }
  }, [getData]);

  useEffect(() => {
    void load();
    void supabase.auth.getUser().then(({ data: result }) => {
      const name = result.user?.user_metadata?.["full_name"] ?? result.user?.email?.split("@")[0];
      if (name) setUserName(name.split(" ")[0]);
    });
  }, [load]);

  const targets = data?.targets ?? emptyNutrients();
  const eaten = data?.eaten ?? emptyNutrients();
  const left = remaining(targets, eaten);
  const mealCount = data?.meals.length ?? 0;
  const isProfileComplete = Boolean(data?.targets);
  const macroKeys = useMemo(() => NUTRIENTS.filter((n) => ["protein_g", "carbs_g", "fat_g", "fiber_g"].includes(n.key)), []);

  const updateField = (key: keyof ProfileForm, value: string) => setProfile((p) => ({
    ...p, [key]: ["height_cm", "weight_kg", "age"].includes(key) ? (value ? Number(value) : null) : value || null,
  }));
  const saveProfileAction = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault(); setSavingProfile(true); setError("");
    try {
      if (!profile.height_cm || !profile.weight_kg || !profile.age || !profile.sex) throw new Error("Please complete each required field.");
      await saveProfileFn({ data: {
        display_name: profile.display_name, height_cm: profile.height_cm, weight_kg: profile.weight_kg,
        age: profile.age, sex: profile.sex as "male" | "female" | "other",
        activity_level: profile.activity_level as "sedentary" | "light" | "moderate" | "active" | "very_active",
        goal: profile.goal as "lose" | "maintain" | "gain", dietary_notes: profile.dietary_notes,
      } });
      setProfileOpen(false); await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Could not save profile."); }
    finally { setSavingProfile(false); }
  };

  const logMealAction = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault(); if (!mealText.trim()) return;
    setLogging(true); setError("");
    try {
      const result = await logMealFn({ data: { ...dayRange(), text: mealText.trim() } });
      if (result.error) throw new Error(result.error);
      setMealText(""); await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Could not log this meal."); }
    finally { setLogging(false); }
  };

  const removeMeal = async (id: string) => {
    try { await deleteMealFn({ data: { id } }); await load(); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not delete the meal."); }
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    await navigate({ to: "/", search: { next: "/dashboard" }, replace: true });
  };

  return (
    <main className="tracker-page">
      <header className="topbar"><div className="topbar-inner"><div className="brand"><span className="brand-mark"><Leaf/></span><span>nourish</span></div><div className="topbar-right"><span className="topbar-date">{dateLabel()}</span><Button type="button" variant="ghost" size="icon" title="Edit your nutrition profile" aria-label="Edit your nutrition profile" onClick={() => setProfileOpen(true)}><Settings2/></Button><Button type="button" variant="ghost" size="icon" title="Sign out" aria-label="Sign out" onClick={() => void signOut()}><LogOut/></Button><div className="avatar-mark">{userName.slice(0,1).toUpperCase()}</div></div></div></header>

      <div className="tracker-content">
        <div className="welcome-row"><div><p className="eyebrow">{dateLabel()}</p><h1>A good day to nourish, {userName}.</h1><p className="welcome-sub">Little by little, a picture of what keeps you well.</p></div><div className="day-chip"><span className="day-chip-dot"/><span>{mealCount} {mealCount === 1 ? "meal" : "meals"} today</span></div></div>

        {error && <div className="error-strip" role="alert"><span>{error}</span><Button type="button" variant="ghost" size="icon" aria-label="Dismiss" onClick={() => setError("")}><X/></Button></div>}
        {loading ? <div className="loading-line"><LoaderCircle className="animate-spin"/>Gathering today’s nourishment…</div> : <>
          {!isProfileComplete && <div className="profile-prompt"><div className="prompt-icon"><Activity/></div><div><strong>Make your daily targets yours</strong><p>Add a few details to set nutrition goals that fit your body and routine.</p></div><Button type="button" variant="outline" onClick={() => setProfileOpen(true)}>Set up profile<ArrowRightIcon/></Button></div>}

          <section className="overview-grid" aria-label="Today's nutrition overview">
            <article className="overview-panel calorie-panel"><div className="section-title"><div><p className="eyebrow">YOUR ENERGY</p><h2>Calories</h2></div><span className="kcal-label">kcal</span></div><div className="calorie-main"><Ring value={eaten.calories} target={targets.calories}/><div className="calorie-side"><span className="side-label">EATEN SO FAR</span><strong>{Math.round(eaten.calories).toLocaleString()}</strong><span className="side-divider"/><span className="side-label">DAILY TARGET</span><b>{targets.calories ? Math.round(targets.calories).toLocaleString() : "—"} <small>kcal</small></b><div className="calorie-note"><Sparkles/>A steady pace is all you need.</div></div></div><div className="energy-footer"><span><span className="key-dot eaten-dot"/>Eaten</span><span><span className="key-dot left-dot"/>Left in your day</span><b>{Math.max(0, Math.round(left.calories)).toLocaleString()} kcal</b></div></article>

            <article className="overview-panel macro-panel"><div className="section-title"><div><p className="eyebrow">THE BUILDING BLOCKS</p><h2>Your macros</h2></div><span className="round-icon"><Utensils/></span></div><div className="macro-list">{macroKeys.map(({ key, label }) => <MacroBar key={key} label={label} eaten={eaten[key as NutrientKey]} target={targets[key as NutrientKey]} tone={key === "protein_g" ? "protein" : key === "carbs_g" ? "carbs" : key === "fat_g" ? "fat" : "fiber"}/> )}</div><div className="macro-footer"><span>Balanced for your daily goal</span><span className="macro-foot-icon"><Leaf/></span></div></article>

            <article className="overview-panel focus-panel"><div className="section-title"><div><p className="eyebrow">YOUR NEXT STEP</p><h2>What’s still needed</h2></div><span className="round-icon focus-icon"><ArrowDownRight/></span></div><div className="focus-items">{[
              ["Protein", "protein_g", "protein"], ["Fiber", "fiber_g", "fiber"], ["Potassium", "potassium_mg", "mineral"], ["Vitamin C", "vitamin_c_mg", "mineral"],
            ].map(([label, key, tone]) => { const remain = Math.max(0, left[key as NutrientKey]); const unit = NUTRIENTS.find((n) => n.key === key)?.unit ?? ""; return <div className="focus-item" key={key}><span className={`focus-dot ${tone}`}/><span>{label}</span><b>{remain < 10 ? Math.round(remain * 10) / 10 : Math.round(remain)}<i> {unit} left</i></b></div>; })}</div><div className="focus-tip"><span className="tip-sparkle"><Sparkles/></span><span>{mealCount ? "Your next meal is a chance to fill the gaps." : "Your day is just getting started."}</span></div></article>
          </section>

          <section className="diary-grid">
            <div className="diary-main">
              <div className="section-heading"><div><p className="eyebrow">TODAY’S DIARY</p><h2>What have you enjoyed?</h2></div><span className="meal-count-label">{mealCount} logged</span></div>
              <div className="meal-compose"><div className="compose-heading"><span className="compose-icon"><Plus/></span><div><h3>Log a meal</h3><p>Just describe what you ate, in your own words.</p></div></div><form onSubmit={logMealAction}><Textarea value={mealText} onChange={(e) => setMealText(e.target.value)} placeholder="A bowl of oatmeal with banana, a spoonful of almond butter, and black coffee…" disabled={logging || !isProfileComplete} aria-label="Describe your meal"/><div className="compose-footer"><span>{!isProfileComplete ? "Set up your profile to start logging." : "Portions are helpful, but not required."}</span><Button type="submit" disabled={logging || !isProfileComplete || mealText.trim().length < 2}>{logging ? <><LoaderCircle className="animate-spin"/>Analyzing…</> : <><Sparkles/>Analyze & log</>}</Button></div></form></div>

              <div className="meal-list">{!mealCount ? <div className="empty-diary"><div className="empty-icon"><Apple/></div><h3>A fresh page</h3><p>Your meals will appear here as you add them.</p></div> : data?.meals.map((meal) => <article className="meal-entry" key={meal.id}><div className="meal-timeline"><span className="timeline-dot"/><span className="timeline-line"/></div><div className="meal-entry-content"><div className="meal-entry-top"><div className="meal-time"><Clock3/>{clockLabel(meal.logged_at)}</div><button type="button" className="meal-delete" aria-label={`Delete ${meal.summary ?? "meal"}`} title="Delete meal" onClick={() => void removeMeal(meal.id)}><Trash2/></button></div><button type="button" className="meal-summary-button" onClick={() => setExpandedMeal(expandedMeal === meal.id ? null : meal.id)}><span><strong>{meal.summary ?? meal.raw_text}</strong><small>{meal.items.map((item) => item.name).join(" · ") || meal.raw_text}</small></span>{expandedMeal === meal.id ? <ChevronUp/> : <ChevronDown/>}</button><div className="meal-calorie-row"><span><Flame/>{Math.round(meal.nutrients.calories).toLocaleString()} kcal</span><span>P {Math.round(meal.nutrients.protein_g)}g</span><span>C {Math.round(meal.nutrients.carbs_g)}g</span><span>F {Math.round(meal.nutrients.fat_g)}g</span></div>{expandedMeal === meal.id && <div className="meal-expanded"><div className="food-items">{meal.items.map((item,i) => <div key={`${item.name}-${i}`}><span>{item.name}<i>{item.quantity}</i></span><b>{item.calories} kcal</b></div>)}</div><div className="micronutrients"><h4>Micronutrients</h4><div className="micro-grid">{NUTRIENTS.filter((n) => n.group === "micro").map((n) => <span key={n.key}>{n.label}<b>{meal.nutrients[n.key].toLocaleString()} {n.unit}</b></span>)}</div></div>{meal.advice && <div className="meal-advice"><Sparkles/><p>{meal.advice}</p></div>}</div>}</div></article>)}</div>
            </div>
            <aside className="diary-aside"><div className="aside-section"><div className="aside-heading"><div><p className="eyebrow">THE DETAILS</p><h3>Micronutrients</h3></div><button className="text-icon-button" type="button" onClick={() => setMicroOpen((v) => !v)} aria-label={microOpen ? "Hide micronutrients" : "Show micronutrients"}>{microOpen ? <ChevronUp/> : <ChevronDown/>}</button></div>{microOpen ? <div className="micro-target-list">{NUTRIENTS.filter((n) => n.group === "micro").map((n) => <div key={n.key}><span>{n.label}</span><b>{Math.round(eaten[n.key] * 10) / 10}<i> / {targets[n.key] || "—"} {n.unit}</i></b></div>)}</div> : <div className="aside-note"><div className="mini-leaf"><Leaf/></div><p>Small things add up. Your vitamins and minerals are tallied with every meal.</p><button type="button" onClick={() => setMicroOpen(true)}>View all micronutrients<ArrowRightIcon/></button></div>}</div><div className="aside-section aside-profile"><div className="aside-heading"><div><p className="eyebrow">MADE FOR YOU</p><h3>Your daily guide</h3></div><span className="round-icon"><CircleHelp/></span></div><p className="profile-summary">{isProfileComplete ? "Targets use your current profile and activity level." : "Complete your profile to create nutrition targets that fit you."}</p><div className="guide-footer"><span><span className="key-dot target-dot"/>Daily target</span><Button variant="ghost" size="sm" onClick={() => setProfileOpen(true)}>{isProfileComplete ? "Edit profile" : "Set up"}<ArrowRightIcon/></Button></div></div><div className="gentle-note"><div className="note-icon"><Leaf/></div><p><strong>Food is more than numbers.</strong><br/>Use these estimates as a helpful guide, not a rulebook.</p></div></aside>
          </section>

          <section className="nutrient-footnote"><span className="footnote-icon"><CircleHelp/></span><div><strong>About these estimates</strong><p>Nutrition values are AI-estimated from your description and typical portion sizes. Actual amounts vary by ingredients and preparation.</p></div></section>
        </>}
      </div>

      {profileOpen && <div className="modal-backdrop" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) setProfileOpen(false); }}><section className="profile-modal" role="dialog" aria-modal="true" aria-labelledby="profile-title"><div className="modal-top"><div><p className="eyebrow">YOUR PERSONAL GUIDE</p><h2 id="profile-title">A little about you</h2><p>This helps make your daily targets personal.</p></div><Button type="button" variant="ghost" size="icon" aria-label="Close profile" onClick={() => setProfileOpen(false)}><X/></Button></div><form onSubmit={saveProfileAction} className="profile-form"><div className="form-grid"><label>Name<Input value={profile.display_name ?? ""} onChange={(e) => updateField("display_name", e.target.value)} placeholder="What should we call you?"/></label><label>Age<Input type="number" min="14" max="110" required value={profile.age ?? ""} onChange={(e) => updateField("age", e.target.value)} placeholder="Years"/></label><label>Height<Input type="number" min="100" max="250" required value={profile.height_cm ?? ""} onChange={(e) => updateField("height_cm", e.target.value)} placeholder="cm"/></label><label>Weight<Input type="number" min="30" max="350" required value={profile.weight_kg ?? ""} onChange={(e) => updateField("weight_kg", e.target.value)} placeholder="kg"/></label><label>Sex for estimates<select required value={profile.sex ?? ""} onChange={(e) => updateField("sex", e.target.value)}><option value="" disabled>Select one</option><option value="female">Female</option><option value="male">Male</option><option value="other">Another / prefer not to say</option></select></label><label>Usual activity<select value={profile.activity_level} onChange={(e) => updateField("activity_level", e.target.value)}><option value="sedentary">Mostly sitting</option><option value="light">Lightly active</option><option value="moderate">Moderately active</option><option value="active">Very active</option><option value="very_active">Extremely active</option></select></label><label>Daily goal<select value={profile.goal} onChange={(e) => updateField("goal", e.target.value)}><option value="lose">Gradual weight loss</option><option value="maintain">Maintain my weight</option><option value="gain">Gradual weight gain</option></select></label></div><label>Dietary notes <span>(optional)</span><Textarea value={profile.dietary_notes ?? ""} onChange={(e) => updateField("dietary_notes", e.target.value)} placeholder="Preferences, allergies, or foods you avoid"/></label>{isProfileComplete && profile.height_cm && profile.weight_kg && profile.age && profile.sex && <div className="target-preview"><span><Flame/>Estimated daily energy target</span><strong>{computeTargets({ height_cm: profile.height_cm, weight_kg: profile.weight_kg, age: profile.age, sex: profile.sex as "male" | "female" | "other", activity_level: profile.activity_level as "sedentary" | "light" | "moderate" | "active" | "very_active", goal: profile.goal as "lose" | "maintain" | "gain" }).calories.toLocaleString()} <small>kcal</small></strong></div>}<p className="form-disclaimer">Targets are general estimates, not medical advice. These details stay private to your account.</p>{error && <p role="alert" className="auth-message">{error}</p>}<div className="modal-actions"><Button type="button" variant="outline" onClick={() => setProfileOpen(false)}>Cancel</Button><Button type="submit" disabled={savingProfile}>{savingProfile ? "Saving…" : "Save my profile"}<ArrowRightIcon/></Button></div></form></section></div>}
    </main>
  );
}
function ArrowRightIcon() { return <ArrowUpRight className="button-arrow"/>; }
