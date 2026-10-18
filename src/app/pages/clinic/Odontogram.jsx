import { useMemo, useState } from "react";
import { PERMANENT, DECIDUOUS, ALL_TEETH, CONDITIONS, CONDITION, SURFACES, isUpper, mesialRight, centerSurface, chartState } from "../../../lib/clinic.js";

// Geometri: kotak gigi 5 permukaan (atas, bawah, kiri, kanan, tengah).
const S = 30, G = 6, MID = 14, PAD = 10, LBL = 14;
const slotX = (i) => PAD + i * (S + G) + (i >= 8 ? MID : 0);
const W = slotX(15) + S + PAD;

/** Permukaan pada sisi kotak, mengikuti orientasi kuadran (mesial menghadap garis tengah). */
function sides(tooth) {
  const up = isUpper(tooth);
  const mr = mesialRight(tooth);
  return { top: up ? "V" : "L", bottom: up ? "L" : "V", left: mr ? "D" : "M", right: mr ? "M" : "D", center: centerSurface(tooth) };
}

function Tooth({ tooth, x, y, state, sel, onSurface, onTooth, editable, labelBelow }) {
  const sd = sides(tooth);
  const q = S / 4;
  const poly = {
    top: `0,0 ${S},0 ${S - q},${q} ${q},${q}`,
    bottom: `${q},${S - q} ${S - q},${S - q} ${S},${S} 0,${S}`,
    left: `0,0 ${q},${q} ${q},${S - q} 0,${S}`,
    right: `${S},0 ${S},${S} ${S - q},${S - q} ${S - q},${q}`,
    center: `${q},${q} ${S - q},${q} ${S - q},${S - q} ${q},${S - q}`,
  };
  const whole = state?.tooth;
  const selSet = sel?.surfaces ?? new Set();
  const label = `${tooth}${whole ? `, ${CONDITION[whole].label}` : ""}`;
  return (
    <g transform={`translate(${x},${y})`} className={`odo-tooth${whole ? ` odo-tooth--${whole}` : ""}${sel?.whole ? " is-whole" : ""}`}>
      <text x={S / 2} y={labelBelow ? S + LBL - 2 : -5} textAnchor="middle" className="odo-num"
        onClick={editable ? () => onTooth(tooth) : undefined} role={editable ? "button" : undefined} tabIndex={editable ? 0 : undefined}
        onKeyDown={editable ? (e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), onTooth(tooth)) : undefined}
        aria-label={editable ? `Pilih seluruh gigi ${label}` : undefined}>{tooth}</text>
      {Object.entries(poly).map(([side, pts]) => {
        const surf = sd[side];
        const cond = state?.surfaces?.[surf];
        return (
          <polygon key={side} points={pts}
            className={`odo-s${cond ? ` odo-s--${cond}` : ""}${selSet.has(surf) ? " is-sel" : ""}`}
            onClick={editable ? () => onSurface(tooth, surf) : undefined}>
            <title>{`${tooth} ${SURFACES[surf]}${cond ? ` · ${CONDITION[cond].label}` : ""}`}</title>
          </polygon>
        );
      })}
      {whole === "mis" && <path d={`M2,2 L${S - 2},${S - 2} M${S - 2},2 L2,${S - 2}`} className="odo-x" />}
      {whole && whole !== "mis" && <text x={S / 2} y={labelBelow ? -5 : S + LBL - 2} textAnchor="middle" className="odo-code">{whole.toUpperCase()}</text>}
    </g>
  );
}

/**
 * Odontogram FDI. `entries` = riwayat odontogram_entries pasien (status terkini dihitung dari entri terbaru).
 * Mode edit: pilih permukaan (klik bidang) atau seluruh gigi (klik nomor), lalu pilih kondisi.
 */
export default function Odontogram({ entries, editable = false, onApply, busy = false }) {
  const state = useMemo(() => chartState(entries ?? []), [entries]);
  const [sel, setSel] = useState({}); // { [tooth]: { surfaces:Set, whole:boolean } }
  const selected = Object.entries(sel).filter(([, v]) => v.whole || v.surfaces.size);
  const hasWhole = selected.some(([, v]) => v.whole);
  const hasSurf = selected.some(([, v]) => v.surfaces.size);

  const toggleSurface = (t, s) => setSel((cur) => {
    const v = cur[t] ?? { surfaces: new Set(), whole: false };
    const next = new Set(v.surfaces);
    next.has(s) ? next.delete(s) : next.add(s);
    return { ...cur, [t]: { surfaces: next, whole: false } };
  });
  const toggleTooth = (t) => setSel((cur) => ({ ...cur, [t]: { surfaces: new Set(), whole: !cur[t]?.whole } }));
  const apply = async (code) => {
    const items = selected.map(([t, v]) => ({ tooth: Number(t), surfaces: v.whole ? [] : [...v.surfaces], condition: code }));
    await onApply?.(items);
    setSel({});
  };

  // Label gigi sulung atas di bawah gigi & sulung bawah di atas gigi → beri ruang dua label di garis tengah.
  const pu = LBL + 4, du = pu + S + 12, dl = du + S + 2 * LBL + 14, pl = dl + S + 12;
  const rowY = { pu, du, dl, pl };
  const H = rowY.pl + S + LBL + 6;
  const row = (teeth, y, offset, below) => teeth.map((t, i) => (
    <Tooth key={t} tooth={t} x={slotX(i + offset)} y={y} state={state[t]} sel={sel[t]} labelBelow={below}
      onSurface={toggleSurface} onTooth={toggleTooth} editable={editable} />
  ));

  return (
    <div className={`odo${editable ? " odo--edit" : ""}`}>
      <div className="odo-scroll">
        <svg viewBox={`0 0 ${W} ${H}`} className="odo-svg" role="group" aria-label="Odontogram FDI: rahang atas di atas, kanan pasien di kiri layar">
          <line x1={slotX(8) - MID / 2 - G / 2} x2={slotX(8) - MID / 2 - G / 2} y1={4} y2={H - 4} className="odo-mid" />
          <line x1={PAD} x2={W - PAD} y1={(rowY.du + S + rowY.dl) / 2} y2={(rowY.du + S + rowY.dl) / 2} className="odo-mid" />
          {row(PERMANENT.upper, rowY.pu, 0, false)}
          {row(DECIDUOUS.upper, rowY.du, 3, true)}
          {row(DECIDUOUS.lower, rowY.dl, 3, false)}
          {row(PERMANENT.lower, rowY.pl, 0, true)}
        </svg>
      </div>

      {editable && <KeyboardPick onPick={(t, surfaces) => setSel((cur) => ({ ...cur, [t]: surfaces.length ? { surfaces: new Set(surfaces), whole: false } : { surfaces: new Set(), whole: true } }))} />}
      {editable && (
        <div className="odo-tools" aria-live="polite">
          {selected.length === 0 ? (
            <p className="d-text d-muted">Klik bidang gigi untuk memilih permukaan, atau klik nomor gigi untuk seluruh gigi.</p>
          ) : (
            <>
              <p className="d-text"><strong>Dipilih:</strong> {selected.map(([t, v]) => (v.whole ? `${t} (seluruh)` : `${t} ${[...v.surfaces].join("")}`)).join(", ")}
                <button type="button" className="d-btn d-btn--ghost d-btn--sm odo-clear" onClick={() => setSel({})}>Kosongkan</button></p>
              {hasWhole && hasSurf && <p className="d-field__error">Pilih permukaan ATAU seluruh gigi, jangan dicampur.</p>}
              <div className="d-chips">
                {CONDITIONS.filter((c) => (hasWhole ? c.level === "tooth" || c.code === "sou" : c.level === "surface")).map((c) => (
                  <button key={c.code} type="button" className={`d-chip odo-chip odo-chip--${c.code}`} disabled={busy || (hasWhole && hasSurf)} onClick={() => apply(c.code)}>
                    <span className="odo-swatch" aria-hidden="true" />{c.label}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      <ul className="odo-legend" aria-label="Keterangan">
        {CONDITIONS.filter((c) => c.code !== "sou").map((c) => (
          <li key={c.code}><span className={`odo-swatch odo-chip--${c.code}`} aria-hidden="true" /><span className="d-mono">{c.code}</span> {c.label}</li>
        ))}
      </ul>
    </div>
  );
}

/** Alternatif keyboard/pembaca layar untuk memilih gigi & permukaan tanpa klik bidang SVG. */
function KeyboardPick({ onPick }) {
  const [t, setT] = useState(36);
  const [surf, setSurf] = useState([]);
  const sd = sides(Number(t));
  const opts = [sd.center, "M", "D", "V", "L"];
  return (
    <details className="odo-kb">
      <summary>Pilih lewat formulir</summary>
      <div className="odo-kb__row">
        <label className="d-switch"><span className="d-switch__label">Gigi</span>
          <select value={t} onChange={(e) => { setT(Number(e.target.value)); setSurf([]); }}>
            {ALL_TEETH.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
        <fieldset className="d-checks">
          <legend className="d-switch__label">Permukaan (kosong = seluruh gigi)</legend>
          {opts.map((o) => (
            <label key={o} className="d-check">
              <input type="checkbox" checked={surf.includes(o)} onChange={(e) => setSurf((x) => (e.target.checked ? [...x, o] : x.filter((y) => y !== o)))} />
              {o} · {SURFACES[o]}
            </label>
          ))}
        </fieldset>
        <button type="button" className="d-btn d-btn--ghost d-btn--sm" onClick={() => { onPick(Number(t), surf); setSurf([]); }}>Tambahkan ke pilihan</button>
      </div>
    </details>
  );
}
