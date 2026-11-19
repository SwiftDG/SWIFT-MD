import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";

// Typo-tolerant course search: "get209", "GET-209", "thermodynamcs" all work.
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
  if (!query) return 0;
  if (code === query) return 100;
  if (code.startsWith(query)) return 80;

  const words = query.split(" ");
  const titleWords = title.split(" ");
  let score = 0;

  for (const word of words) {
    if (code.includes(word)) {
      score += 12;
    } else if (title.includes(word)) {
      score += word.length > 3 ? 10 : 4;
    } else if (word.length > 3) {
      const close = titleWords.some(
        (candidate) =>
          candidate.length > 3 &&
          editDistance(word, candidate) <= (word.length > 7 ? 2 : 1)
      );
      if (close) score += 7;
      else return 0;
    } else {
      return 0;
    }
  }

  return score;
}

export default function CourseFinder() {
  const navigate = useNavigate();
  const [courses, setCourses] = useState([]);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("loading");

  useEffect(() => {
    let active = true;
    supabase
      .from("courses")
      .select("id, code, title, level, department")
      .order("code", { ascending: true })
      .then(({ data, error }) => {
        if (!active) return;
        if (error) {
          setStatus("error");
          return;
        }
        setCourses(data || []);
        setStatus("ready");
      });
    return () => {
      active = false;
    };
  }, []);

  const levels = useMemo(
    () =>
      [...new Set(courses.map((course) => String(course.level)).filter(Boolean))].sort(),
    [courses]
  );

  const results = useMemo(() => {
    const cleaned = normalise(query);
    if (!cleaned) return [];
    return courses
      .map((course) => ({ course, score: scoreCourse(course, cleaned) }))
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score || a.course.code.localeCompare(b.course.code))
      .slice(0, 6)
      .map((item) => item.course);
  }, [courses, query]);

  function handleSubmit(event) {
    event.preventDefault();
    if (results[0]) navigate(`/course/${results[0].id}`);
  }

  const hasQuery = normalise(query).length > 0;

  return (
    <section className="course-finder" aria-labelledby="course-finder-title">
      <div className="course-finder-head">
        <h2 id="course-finder-title">What are you studying?</h2>
        <p>Type a course code or title. Spelling doesn&rsquo;t have to be perfect.</p>
      </div>

      <form className="course-finder-form" onSubmit={handleSubmit} role="search">
        <label htmlFor="course-finder-input" className="sr-only">
          Search courses
        </label>
        <input
          id="course-finder-input"
          type="search"
          autoComplete="off"
          spellCheck="false"
          placeholder="e.g. GET 209 or fluid mechanics"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <kbd aria-hidden="true">↵</kbd>
      </form>

      {hasQuery && (
        <ol className="course-finder-results" aria-live="polite">
          {results.length > 0 ? (
            results.map((course) => (
              <li key={course.id}>
                <button type="button" onClick={() => navigate(`/course/${course.id}`)}>
                  <span className="course-finder-code">{course.code}</span>
                  <span className="course-finder-title">{course.title}</span>
                  <span className="course-finder-level">{course.level}L</span>
                </button>
              </li>
            ))
          ) : (
            <li className="course-finder-empty">
              {status === "loading"
                ? "Loading courses…"
                : `Nothing matches “${query.trim()}” yet.`}
            </li>
          )}
        </ol>
      )}

      {status === "error" && (
        <p className="course-finder-empty">Courses couldn&rsquo;t load. Browse by level instead.</p>
      )}

      <nav className="course-finder-levels" aria-label="Browse by level">
        <span>Or browse</span>
        {(levels.length ? levels : ["100", "200", "300"]).map((level) => (
          <button key={level} type="button" onClick={() => navigate(`/level/${level}`)}>
            {level} Level
          </button>
        ))}
      </nav>
    </section>
  );
}
