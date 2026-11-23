import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { getPracticeCourses } from "../lib/practice";

const RECENT_KEY = "swift:recent-courses:v1";
const EXAMPLES = ["GET 209", "fluid mechanics", "chemistry", "PHY 102"];
const TYPE_LABELS = { mcq: "MCQ", german: "Fill-in", theory: "Theory" };

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
    const next = [id, ...readRecent().filter((item) => item !== id)].slice(0, 4);
    window.localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    // Private browsing should never block opening a course.
  }
}

function CourseRow({ course, active, onOpen, onHover }) {
  const banks = course.banks || [];
  return (
    <li>
      <button
        type="button"
        className={`finder-row ${active ? "is-active" : ""}`}
        onClick={() => onOpen(course)}
        onMouseEnter={onHover}
      >
        <span className="finder-code">{course.code}</span>
        <span className="finder-title">{course.title}</span>
        <span className="finder-meta">
          {course.materialCount > 0 && (
            <span>
              {course.materialCount} {course.materialCount === 1 ? "material" : "materials"}
            </span>
          )}
          {banks.length > 0 && (
            <span className="finder-banks" aria-label="Practice available">
              {banks.map((type) => (
                <span key={type}>{TYPE_LABELS[type] || type}</span>
              ))}
            </span>
          )}
        </span>
      </button>
    </li>
  );
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
          byCode[course.code] = [
            ...new Set((course.banks || []).map((bank) => bank.type)),
          ].sort((a, b) => Object.keys(TYPE_LABELS).indexOf(a) - Object.keys(TYPE_LABELS).indexOf(b));
        }
        setBanksByCode(byCode);
      })
      .catch(() => {});

    function focusOnSlash(event) {
      if (event.key === "/" && document.activeElement !== inputRef.current) {
        event.preventDefault();
        inputRef.current?.focus();
      }
    }
    window.addEventListener("keydown", focusOnSlash);

    return () => {
      active = false;
      window.removeEventListener("keydown", focusOnSlash);
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
    () => recentIds.map((id) => enriched.find((course) => course.id === id)).filter(Boolean),
    [recentIds, enriched]
  );

  const levels = useMemo(
    () => [...new Set(courses.map((course) => String(course.level)).filter(Boolean))].sort(),
    [courses]
  );

  function openCourse(course) {
    rememberCourse(course.id);
    navigate(`/course/${course.id}`);
  }

  function handleKeyDown(event) {
    if (!results.length) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((index) => (index + 1) % results.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) => (index - 1 + results.length) % results.length);
    } else if (event.key === "Enter") {
      event.preventDefault();
      openCourse(results[Math.min(activeIndex, results.length - 1)]);
    } else if (event.key === "Escape") {
      setQuery("");
    }
  }

  const hasQuery = normalise(query).length > 0;

  return (
    <section className="finder" aria-labelledby="finder-label">
      {greeting && <p className="finder-greeting">{greeting}</p>}

      <label id="finder-label" htmlFor="finder-input" className="sr-only">
        What are you studying?
      </label>
      <div className="finder-field">
        <input
          id="finder-input"
          ref={inputRef}
          type="search"
          autoComplete="off"
          spellCheck="false"
          placeholder="What are you studying?"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setActiveIndex(0);
          }}
          onKeyDown={handleKeyDown}
          aria-controls="finder-results"
        />
      </div>
      <p className="finder-hint">
        A course code or title. Spelling doesn&rsquo;t have to be perfect.
      </p>

      {hasQuery ? (
        <div className="finder-panel" id="finder-results" aria-live="polite">
          {results.length > 0 ? (
            <ol className="finder-list">
              {results.map((course, index) => (
                <CourseRow
                  key={course.id}
                  course={course}
                  active={index === activeIndex}
                  onOpen={openCourse}
                  onHover={() => setActiveIndex(index)}
                />
              ))}
            </ol>
          ) : (
            <p className="finder-empty">
              {status === "loading"
                ? "Loading courses…"
                : `No course matches “${query.trim()}”. Try the course code, like GET 209.`}
            </p>
          )}
        </div>
      ) : (
        <div className="finder-panel finder-start">
          {recent.length > 0 && (
            <div className="finder-group">
              <h2>Jump back in</h2>
              <ol className="finder-list">
                {recent.map((course) => (
                  <CourseRow key={course.id} course={course} onOpen={openCourse} />
                ))}
              </ol>
            </div>
          )}

          <div className="finder-group finder-try">
            <h2>Try</h2>
            <div className="finder-chips">
              {EXAMPLES.map((example) => (
                <button
                  key={example}
                  type="button"
                  onClick={() => {
                    setQuery(example);
                    setActiveIndex(0);
                    inputRef.current?.focus();
                  }}
                >
                  {example}
                </button>
              ))}
            </div>
          </div>

          <div className="finder-group finder-try">
            <h2>Browse a level</h2>
            <div className="finder-chips">
              {(levels.length ? levels : ["100", "200", "300"]).map((level) => (
                <button key={level} type="button" onClick={() => navigate(`/level/${level}`)}>
                  {level} Level
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {status === "error" && (
        <p className="finder-empty">Courses didn&rsquo;t load. Browse a level instead.</p>
      )}
    </section>
  );
}
