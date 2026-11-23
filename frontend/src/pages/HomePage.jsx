import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import AppShell from "../components/AppShell";
import CourseFinder from "../components/CourseFinder";

function buildGreeting(user) {
  const fullName =
    user.user_metadata?.full_name || user.email?.split("@")[0] || "";
  const firstName = fullName.trim().split(/\s+/)[0];
  const hour = new Date().getHours();
  const period = hour < 12 ? "morning" : hour < 17 ? "afternoon" : "evening";
  return firstName ? `Good ${period}, ${firstName}.` : `Good ${period}.`;
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
        <CourseFinder greeting={greeting} />
      </div>
    </AppShell>
  );
}
