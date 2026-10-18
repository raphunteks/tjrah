import { useEffect, useMemo, useRef, useState } from "react";
import { useBP } from "./BlueprintData.jsx";
import { gsap, useGSAP, scrollToId, prefersReducedMotion } from "../lib/gsap.js";
import { SECTIONS } from "./sections.js";

const buildItems = ({ NODES, MODULE_LIST, ROLES, FLOWS, PILLARS }) => [
  ...SECTIONS.map((s) => ({ key: `s-${s.id}`, group: "Bagian", label: s.label, meta: `Bab ${s.bab}`, target: s.id })),
  ...NODES.map((n) => ({ key: `n-${n.id}`, group: "Topologi", label: n.title, meta: n.layer, target: "topologi", node: n.id })),
  ...MODULE_LIST.map((m) => ({ key: `m-${m.id}`, group: "Modul", label: m.name, meta: m.id, target: `modul-${m.id}` })),
  ...ROLES.map((r) => ({ key: `r-${r.id}`, group: "Peran", label: r.name, meta: r.level, target: "peran", role: r.id })),
  ...FLOWS.map((f) => ({ key: `f-${f.id}`, group: "Alur", label: f.title, meta: f.code, target: "alur" })),
  ...PILLARS.map((p) => ({ key: `p-${p.id}`, group: "Pilar", label: p.name, meta: p.code, target: "pilar" })),
];

export default function CommandPalette({ open, onOpen, onClose, onPickNode, onPickRole }) {
  const root = useRef(null);
  const panel = useRef(null);
  const input = useRef(null);
  const returnFocus = useRef(null);
  const bp = useBP();
  const ITEMS = useMemo(() => buildItems(bp), [bp]);
  const [q, setQ] = useState("");
  const [idx, setIdx] = useState(0);

  const results = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return ITEMS;
    return ITEMS.filter((it) => `${it.label} ${it.meta} ${it.group}`.toLowerCase().includes(term));
  }, [q, ITEMS]);

  // Shortcut global ⌘K / Ctrl+K.
  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        open ? onClose() : onOpen();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onOpen, onClose]);

  useEffect(() => {
    if (open) {
      returnFocus.current = document.activeElement;
      setQ("");
      setIdx(0);
      document.documentElement.classList.add("is-locked");
      requestAnimationFrame(() => input.current?.focus());
    } else {
      document.documentElement.classList.remove("is-locked");
      returnFocus.current?.focus?.();
    }
  }, [open]);

  useGSAP(
    () => {
      if (!open || prefersReducedMotion()) return;
      gsap.fromTo(root.current, { opacity: 0 }, { opacity: 1, duration: 0.18, ease: "power1.out" });
      gsap.fromTo(panel.current, { y: -8, opacity: 0 }, { y: 0, opacity: 1, duration: 0.28 });
    },
    { dependencies: [open], scope: root }
  );

  if (!open) return null;

  const pick = (it) => {
    onClose();
    if (it.node) onPickNode(it.node);
    if (it.role) onPickRole(it.role);
    requestAnimationFrame(() => scrollToId(it.target));
  };

  const onKeyDown = (e) => {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setIdx((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && results[idx]) {
      e.preventDefault();
      pick(results[idx]);
    } else if (e.key === "Tab") {
      e.preventDefault(); // fokus tetap di dalam dialog
    }
  };

  let lastGroup = null;

  return (
    <div className="palette" ref={root} onMouseDown={(e) => e.target === root.current && onClose()}>
      <div
        className="palette__panel"
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label="Cari bagian blueprint"
        onKeyDown={onKeyDown}
      >
        <div className="palette__search">
          <span className="palette__prompt" aria-hidden="true">&gt;</span>
          <input
            ref={input}
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setIdx(0);
            }}
            placeholder="Ketik: topologi, 9router, klinik…"
            aria-label="Kata kunci"
            aria-controls="palette-list"
            aria-activedescendant={results[idx] ? `opt-${results[idx].key}` : undefined}
          />
          <kbd>Esc</kbd>
        </div>
        <ul className="palette__list" id="palette-list" role="listbox">
          {results.length === 0 && <li className="palette__empty">Tidak ada yang cocok dengan “{q}”. Coba nama modul atau layer.</li>}
          {results.map((it, i) => {
            const head = it.group !== lastGroup ? it.group : null;
            lastGroup = it.group;
            return (
              <li key={it.key} role="presentation">
                {head && <p className="palette__group">{head}</p>}
                <button
                  type="button"
                  id={`opt-${it.key}`}
                  role="option"
                  aria-selected={i === idx}
                  className={`palette__item${i === idx ? " is-selected" : ""}`}
                  onMouseEnter={() => setIdx(i)}
                  onClick={() => pick(it)}
                  tabIndex={-1}
                >
                  <span>{it.label}</span>
                  <span className="palette__meta">{it.meta}</span>
                </button>
              </li>
            );
          })}
        </ul>
        <p className="palette__foot">
          <span><kbd>↑</kbd> <kbd>↓</kbd> pilih</span>
          <span><kbd>Enter</kbd> buka</span>
        </p>
      </div>
    </div>
  );
}
