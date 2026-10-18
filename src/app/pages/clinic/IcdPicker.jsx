import { useEffect, useId, useRef, useState } from "react";
import { useAuth } from "../../../auth/AuthProvider.jsx";

/** Combobox pencarian kode ICD-10 / ICD-9-CM (kode, nama resmi, atau label Indonesia). */
export default function IcdPicker({ system, label, onPick, disabled }) {
  const { api } = useAuth();
  const id = useId();
  const [q, setQ] = useState("");
  const [rows, setRows] = useState([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const blurT = useRef(null);
  const show = () => { clearTimeout(blurT.current); setOpen(true); };
  useEffect(() => () => clearTimeout(blurT.current), []);
  useEffect(() => {
    let live = true;
    const t = setTimeout(() => api.searchIcd(system, q).then((r) => live && (setRows(r), setActive(0))).catch(() => live && setRows([])), 120);
    return () => { live = false; clearTimeout(t); };
  }, [api, system, q]);
  // onPick boleh mengembalikan false (mis. nomor gigi salah) agar pencarian tidak dikosongkan.
  const pick = (r) => { if (onPick(r) !== false) { setQ(""); setOpen(false); } };
  return (
    <div className="icd">
      <label htmlFor={id} className="d-switch__label">{label}</label>
      <input id={id} type="search" role="combobox" aria-expanded={open} aria-controls={`${id}-l`} aria-autocomplete="list"
        aria-activedescendant={open && rows[active] ? `${id}-${active}` : undefined} disabled={disabled}
        placeholder={system === "icd10" ? "Cari: K04, abses, pulpitis…" : "Cari: 23.2, tambal, scaling…"}
        value={q} onChange={(e) => { setQ(e.target.value); show(); }} onFocus={show} onBlur={() => { blurT.current = setTimeout(() => setOpen(false), 150); }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") { e.preventDefault(); show(); setActive((a) => Math.min(a + 1, rows.length - 1)); }
          if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
          if (e.key === "Enter" && open && rows[active]) { e.preventDefault(); pick(rows[active]); }
          if (e.key === "Escape") setOpen(false);
        }} />
      {open && rows.length > 0 && (
        <ul id={`${id}-l`} role="listbox" className="icd-list">
          {rows.map((r, i) => (
            <li key={r.code} id={`${id}-${i}`} role="option" aria-selected={i === active} className={i === active ? "is-active" : undefined}
              onMouseDown={(e) => { e.preventDefault(); pick(r); }} onMouseEnter={() => setActive(i)}>
              <span className="d-mono icd-code">{r.code}</span>
              <span className="icd-text"><span>{r.label ?? r.display}</span><span className="d-muted">{r.display}</span></span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
