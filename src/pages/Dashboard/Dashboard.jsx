import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { createQuotaState } from "../../constants/quota";
import { fetchRuntimeProductConfig } from "../../services/runtimeProductConfig";
import AccountHeader from "../../components/layout/AccountHeader";

export const Dashboard = () => {
  const { user, userProfile, plan, promptsToday, lastPromptDate } = useAuth();
  const [productConfig, setProductConfig] = useState(null);
  useEffect(() => { let active = true; fetchRuntimeProductConfig(user).then((config) => { if (active) setProductConfig(config); }).catch((error) => console.error("Unable to load runtime product config", error)); return () => { active = false; }; }, [user]);
  const displayName = userProfile?.name || user?.displayName || "Creator";
  const userEmail = userProfile?.email || user?.email || "N/A";
  const photoURL = userProfile?.photoURL || user?.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName)}&background=102a43&color=fff`;
  const credits = Math.max(Number(userProfile?.credits || 0), 0);
  const isPro = plan === "pro";
  const quota = createQuotaState({ plan, promptsToday, lastPromptDate, imageAnalysesToday: userProfile?.imageAnalysesToday, lastImageAnalysisDate: userProfile?.lastImageAnalysisDate, imageAnalysesThisMonth: userProfile?.imageAnalysesThisMonth, lastImageAnalysisMonth: userProfile?.lastImageAnalysisMonth }, new Date(), productConfig);
  const referenceCoding = productConfig?.creditCosts?.referenceCoding || { creditCost: 5, maxReferences: 8 };
  const quotaPercent = quota.remaining === null ? 100 : Math.min(100, (quota.remaining / Math.max(1, quota.dailyLimit)) * 100);

  return <div className="workspace-page"><div className="mx-auto w-full max-w-6xl px-4 pb-10 pt-6 sm:px-6 lg:pt-10">
    <section className="workspace-hero"><div className="hero-kicker"><span className="status-pulse" />Private creative workspace</div><h1>See it. <span>Understand it.</span><br />Prompt it.</h1><p>Turn visual ideas and rough thinking into prompts that move your work forward.</p><Link to="/builder" className="primary-action">Start creating <span aria-hidden="true">→</span></Link></section>
    <div className="workspace-section-heading"><div><p className="eyebrow">Your workspace</p><h2>Choose a starting point</h2></div><span className="section-count">{isPro ? "Pro plan" : "Free plan"}</span></div>
    <section className="action-grid"><Link to="/builder" className="action-card action-card-cyan"><div className="action-icon">◎</div><div className="action-copy"><h3>Image <span>→</span> Prompt</h3><p>See what an image is trying to say, then turn it into a precise prompt.</p><span className="card-link">Open image studio <b>↗</b></span></div></Link><Link to="/reference-coding" className="action-card action-card-amber"><div className="action-icon">⌘</div><div className="action-copy"><div className="card-meta"><span>Reference coding</span><b>{referenceCoding.creditCost} credits</b></div><h3>Reference <span>→</span> Code Prompt</h3><p>Give AI your existing UI or files and get a coding-ready direction.</p><span className="card-link">Open reference studio <b>↗</b></span></div></Link></section>
    <section className="workspace-section-heading usage-heading"><div><p className="eyebrow">Signal</p><h2>Today at a glance</h2></div><Link to="/account#plans" className="text-link">Manage plan <span>→</span></Link></section>
    <AccountHeader displayName={displayName} email={userEmail} photoURL={photoURL} plan={plan} quota={quota} credits={credits} isPro={isPro} className="workspace-account-card" />
    <section className="insight-grid"><div className="insight-card"><div className="insight-top"><div><p className="eyebrow">Prompt energy</p><h3>{quota.remaining === null ? "Unlimited" : `${quota.remaining} left today`}</h3></div><span className="insight-icon">↗</span></div><div className="usage-track"><span style={{ width: `${quotaPercent}%` }} /></div><div className="insight-foot"><span>{quota.remaining === null ? "Pro creative flow" : `${quota.dailyLimit - quota.remaining} used`}</span><span>{quota.dailyLimit} daily limit</span></div>{!isPro && quota.remaining === 0 && <div className="inline-alert"><strong>Today's free prompts are used.</strong><Link to="/account#plans">See options →</Link></div>}</div><div className="insight-card compact-insight"><p className="eyebrow">Credits</p><h3>{credits}<span> available</span></h3><p>Purchased credits never expire and can power reference coding.</p><Link to="/account#plans" className="text-link">Get more credits <span>→</span></Link></div></section>
  </div></div>;
};
export default Dashboard;
