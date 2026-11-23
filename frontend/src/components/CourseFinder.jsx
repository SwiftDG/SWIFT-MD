import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { getPracticeCourses } from "../lib/practice";

const RECENT_KEY = "swift:recent-courses:v1";
const TYPE_ORDER = ["mcq", "german", "theory"];
const TYPE_LABELS = { mcq: "MCQ", german: "Fill-in", theory: "Theory" };
const LEVEL_NOTES = {
  100: "Sciences, maths and first engineering courses",
  200: "Core engineering and departmental courses",
  300: "Advanced departmental courses",
  400: "Final-year and specialist courses",
  500: "Final-year and specialist courses",
};

// Typo-tolerant matching: "get209", "GET-209", "thermodynamcs" all work.
function normalise(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/([a-z])(\d)/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim();
}

function editDistance(a, b) {
  if (Math.abs(a.length - b.length) > 2) return 3;
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    let previous = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const current = row[j];
      row[j] = Math.min(
        row[j] + 1,
        row[j - 1] + 1,
        previous + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
      previous = current;
    }
  }
  return row[b.length];
}

function scoreCourse(course, query) {
  const code = normalise(course.code);
  const title = normalise(course.title || "");
  if (code === query) return 100;
  if (code.startsWith(query)) return 80;

  const titleWords = title.split(" ");
  let score = 0;
  for (const word of query.split(" ")) {
    if (code.includes(word)) score += 12;
    else if (title.includes(word)) score += word.length > 3 ? 10 : 4;
    else if (
      word.length > 3 &&
      titleWords.some(
        (candidate) =>
          candidate.length > 3 &&
          editDistance(word, candidate) <= (word.length > 7 ? 2 : 1)
      )
    )
      score += 7;
    else return 0;
  }
  return score;
}

function readRecent() {
  try {
    const saved = JSON.parse(window.localStorage.getItem(RECENT_KEY));
    return Array.isArray(saved) ? saved : [];
  } catch {
    return [];
  }
}

function rememberCourse(id) {
  try {
    const next = [id, ...readRecent().filter((item) => item !== id)].slice(0, 6);
    window.localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    // Private browsing should never block opening a course.
  }
}

function Badges({ banks }) {
  if (!banks.length) {
    return <span className="home-badge is-muted">Practice coming soon</span>;
  }
  return banks.map((type) => (
    <span key={type} className="home-badge">
      {TYPE_LABELS[type] || type}
    </span>
  ));
}

export default function CourseFinder({ greeting }) {
  const navigate = useNavigate();
  const inputRef = useRef(null);
  const [courses, setCourses] = useState([]);
  const [materialCounts, setMaterialCounts] = useState({});
  const [banksByCode, setBanksByCode] = useState({});
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [status, setStatus] = useState("loading");
  const [recentIds] = useState(readRecent);

  useEffect(() => {
    let active = true;

    supabase
      .from("courses")
      .select("id, code, title, level")
      .order("code", { ascending: true })
      .then(({ data, error }) => {
        if (!active) return;
        if (error) setStatus("error");
        else {
          setCourses(data || []);
          setStatus("ready");
        }
      });

    supabase
      .from("materials")
      .select("course_code")
      .then(({ data }) => {
        if (!active || !data) return;
        const counts = {};
        for (const row of data) counts[row.course_code] = (counts[row.course_code] || 0) + 1;
        setMaterialCounts(counts);
      });

    getPracticeCourses()
      .then((catalog) => {
        if (!active) return;
        const byCode = {};
        for (const course of catalog || []) {
          byCode[course.code] = TYPE_ORDER.filter((type) =>
            (course.banks || []).some((bank) => bank.type === type)
          );
        }
        setBanksByCode(byCode);
      })
      .catch(() => {});

    return () => {
      active = false;
    };
  }, []);

  const enriched = useMemo(
    () =>
      courses.map((course) => ({
        ...course,
        materialCount: materialCounts[course.code] || 0,
        banks: banksByCode[course.code] || [],
      })),
    [courses, materialCounts, banksByCode]
  );

  const results = useMemo(() => {
    const cleaned = normalise(query);
    if (!cleaned) return [];
    return enriched
      .map((course) => ({ course, score: scoreCourse(course, cleaned) }))
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score || a.course.code.localeCompare(b.course.code))
      .slice(0, 6)
      .map((item) => item.course);
  }, [enriched, query]);

  const recent = useMemo(
    () => recentIds.map((id) => enriched.find((course) => course.id === id)).filter(Boolean).slice(0, 3),
    [recentIds, enriched]
  );

  // With no history yet, suggest the best-stocked courses instead.
  const cards = useMemo(() => {
    if (recent.length) return recent;
    return [...enriched]
      .sort((a, b) => b.banks.length - a.banks.length || b.materialCount - a.materialCount)
      .slice(0, 3);
  }, [recent, enriched]);

  const ready = useMemo(() => {
    const levels = new Set(cards.map((course) => course.level));
    const full = enriched.filter((course) => course.banks.length === TYPE_ORDER.length);
    const nearby = full.filter((course) => levels.has(course.level));
    return [...nearby, ...full.filter((course) => !levels.has(course.level))].slice(0, 5);
  }, [enriched, cards]);

  const levels = useMemo(
    () => [...new Set(courses.map((course) => Number(course.level)).filter(Boolean))].sort((a, b) => a - b),
    [courses]
  );

  function openCourse(course) {
    rememberCourse(course.id);
    navigate(`/course/${course.id}`);
  }

  function handleKeyDown(event) {
    if (event.key === "Escape") {
      setQuery("");
      return;
    }
    if (!results.length) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((index) => (index + 1) % results.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) => (index - 1 + results.length) % results.length);
    }
  }

  function handleSubmit(event) {
    event.preventDefault();
    if (results.length) openCourse(results[Math.min(activeIndex, results.length - 1)]);
  }

  const hasQuery = normalise(query).length > 0;

  return (
    <div className="home-dash">
      <section className="home-hero" aria-labelledby="home-hero-title">
        <p className="home-hero-greeting">{greeting}</p>
        <h1 id="home-hero-title">What are you studying?</h1>

        <form className="home-search" role="search" onSubmit={handleSubmit}>
          <label htmlFor="home-search-input" className="sr-only">
            Search courses
          </label>
          <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <circle cx="11" cy="11" r="7" />
            <path d="M20 20l-3.5-3.5" />
          </svg>
          <input
            id="home-search-input"
            ref={inputRef}
            type="search"
            autoComplete="off"
            spellCheck="false"
            placeholder="Course code or title"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setActiveIndex(0);
            }}
            onKeyDown={handleKeyDown}
            aria-controls="home-search-results"
          />
          <button type="submit">Find course</button>

          {hasQuery && (
            <div className="home-results" id="home-search-results" aria-live="polite">
              {results.length > 0 ? (
                <ol>
                  {results.map((course, index) => (
                    <li key={course.id}>
                      <button
                        type="button"
                        className={index === activeIndex ? "is-active" : ""}
                        onClick={() => openCourse(course)}
                        onMouseEnter={() => setActiveIndex(index)}
                      >
                        <span className="home-results-code">{course.code}</span>
                        <span className="home-results-title">{course.title}</span>
                        <span className="home-results-meta">
                          {course.materialCount > 0 && `${course.materialCount} materials`}
                        </span>
                      </button>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="home-results-empty">
                  {status === "loading"
                    ? "Loading courses…"
                    : `No course matches “${query.trim()}”. Try the course code, like GET 209.`}
                </p>
              )}
            </div>
          )}
        </form>
        <p className="home-hero-hint">Try GET 209 or &ldquo;fluid mechanics&rdquo;. Spelling doesn&rsquo;t have to be perfect.</p>
      </section>

      <div className="home-columns">
        <div className="home-main">
          <section aria-labelledby="home-cards-title">
            <h2 id="home-cards-title" className="home-section-title">
              {recent.length ? "Continue studying" : "Popular courses"}
            </h2>
            <div className="home-card-grid">
              {cards.map((course) => (
                <button key={course.id} type="button" className="home-card" onClick={() => openCourse(course)}>
                  <span className="home-card-top">
                    <span className="home-card-code">{course.code}</span>
                    <span className="home-card-level">{course.level} Level</span>
                  </span>
                  <span className="home-card-title">{course.title}</span>
                  <span className="home-card-badges">
                    <Badges banks={course.banks} />
                  </span>
                  <span className="home-card-count">
                    {course.materialCount} {course.materialCount === 1 ? "material" : "materials"}
                  </span>
                </button>
              ))}
              {status === "loading" && !cards.length && <p className="home-note">Loading courses…</p>}
              {status === "error" && <p className="home-note">Courses didn&rsquo;t load. Refresh the page or browse a level below.</p>}
            </div>
          </section>

          <section aria-labelledby="home-levels-title">
            <h2 id="home-levels-title" className="home-section-title">Browse by level</h2>
            <div className="home-level-grid">
              {(levels.length ? levels : [100, 200, 300]).map((level, index) => (
                <button
                  key={level}
                  type="button"
                  className={`home-level home-level-${Math.min(index, 2)}`}
                  onClick={() => navigate(`/level/${level}`)}
                >
                  <span className="home-level-name">{level} Level</span>
                  <span className="home-level-note">{LEVEL_NOTES[level] || "Courses at this level"}</span>
                </button>
              ))}
            </div>
          </section>
        </div>

        <aside className="home-aside" aria-labelledby="home-ready-title">
          <h2 id="home-ready-title" className="home-section-title">Ready to practise</h2>
          <p className="home-aside-note">Courses with MCQ, fill-in and theory questions.</p>
          <ul>
            {ready.map((course) => (
              <li key={course.id}>
                <button type="button" onClick={() => navigate(`/test/${encodeURIComponent(course.code)}`)}>
                  <span>
                    <strong>{course.code}</strong> {course.title}
                  </span>
                  <span className="home-aside-start">Start</span>
                </button>
              </li>
            ))}
          </ul>
          <button type="button" className="home-aside-all" onClick={() => navigate("/practice")}>
            All practice
          </button>
        </aside>
      </div>
    </div>
  );
}
