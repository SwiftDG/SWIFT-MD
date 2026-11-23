import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import AppShell from "../components/AppShell";
import CourseFinder from "../components/CourseFinder";

const quickActions = [
  {
    title: "Find a course",
    detail: "Browse your level and open course materials in one place.",
    action: "Open library",
    to: "/level/100",
  },
  {
    title: "Practice properly",
    detail: "Use curated MCQ and fill-in-the-blank banks where available.",
    action: "Open practice",
    to: "/practice",
  },
  {
    title: "Calculate your CGPA",
    detail: "Build from your first semester or continue from your current record.",
    action: "Open calculator",
    to: "/cgpa",
  },
];

function buildGreeting(user) {
  const username =
    user.user_metadata?.full_name || user.email?.split("@")[0] || "there";
  const hour = new Date().getHours();
  const period = hour < 12 ? "morning" : hour < 17 ? "afternoon" : "evening";
  return `Good ${period}, ${username}. Pick up where you left off.`;
}

export default function HomePage() {
  const navigate = useNavigate();
  const [greeting, setGreeting] = useState("");
  const [loading, setLoading] = useState(true);
  const initialized = useRef(false);

  useEffect(() => {
    const { data: listener } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (event === "INITIAL_SESSION") {
          if (!session) {
            navigate("/signin");
            return;
          }

          if (!initialized.current) {
            initialized.current = true;
            setGreeting(buildGreeting(session.user));
            setLoading(false);
          }
        }

        if (event === "SIGNED_OUT") {
          navigate("/signin");
        }
      }
    );

    return () => listener.subscription.unsubscribe();
  }, [navigate]);

  async function handleSignOut() {
    await supabase.auth.signOut();
    navigate("/");
  }

  if (loading) {
    return (
      <div className="swift-loading-screen">
        <span className="swift-loading-mark">S</span>
        <p>Preparing your study space...</p>
      </div>
    );
  }

  return (
    <AppShell onSignOut={handleSignOut} className="swift-home-shell">
      <div className="swift-home-page">
        <section className="swift-home-intro">
          <p className="swift-eyebrow">Swift for UNILAG Engineering</p>
          <h1>Study with a clearer system.</h1>
          <p className="swift-greeting">{greeting}</p>
        </section>

        <CourseFinder />

        <section className="swift-quick-actions">
          <div className="section-heading">
            <div>
              <p className="swift-eyebrow">Start here</p>
              <h2>Made for the work in front of you.</h2>
            </div>
            <p>
              Materials, curated practice, and academic tools without making
              you hunt through folders.
            </p>
          </div>

          <div className="quick-action-grid">
            {quickActions.map((item) => (
              <article key={item.title} className="quick-action">
                <h3>{item.title}</h3>
                <p>{item.detail}</p>
                <button type="button" onClick={() => navigate(item.to)}>
                  {item.action} <span aria-hidden="true">→</span>
                </button>
              </article>
            ))}
          </div>
        </section>
      </div>
    </AppShell>
  );
}
