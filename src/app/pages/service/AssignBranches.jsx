import { useState } from "react";
import { useAuth } from "../../../auth/AuthProvider.jsx";
import { Modal } from "../../ui/index.jsx";
import { useAction, Feedback } from "../../ops.jsx";

/** Penugasan cabang (RPC set_member_branches). Dipakai di Karyawan & Kelola Tim. */
export default function AssignBranches({ person, initial, options, onClose, onSaved }) {
  const { api } = useAuth();
  const a = useAction();
  const [ids, setIds] = useState(() => new Set(initial ?? []));
  return (
    <Modal open title={`Cabang · ${person.full_name}`} onClose={onClose} footer={(
      <>
        <button type="button" className="d-btn d-btn--ghost" onClick={onClose}>Batal</button>
        <button type="button" className="d-btn d-btn--primary" disabled={a.busy}
          onClick={() => a.run(async () => { await api.rpc("set_member_branches", { p_profile: person.id, p_branches: [...ids] }); onSaved(); onClose(); })}>Simpan</button>
      </>
    )}>
      <div className="d-form">
        <p className="d-text d-muted">
          {person.role === "gm"
            ? "Tanpa centang = GM memegang semua cabang. Centang untuk membatasi GM ke cabang tertentu (dashboard, stok, pesanan ikut terbatas)."
            : "Cabang pertama yang dicentang menjadi cabang utama. Staff/Dokter wajib punya minimal satu cabang."}
        </p>
        <fieldset className="d-checks">
          <legend className="sr-only">Cabang</legend>
          {options.map((b) => (
            <label key={b.id} className="d-check">
              <input type="checkbox" checked={ids.has(b.id)}
                onChange={(e) => setIds((x) => { const n = new Set(x); e.target.checked ? n.add(b.id) : n.delete(b.id); return n; })} />
              {b.name}
            </label>
          ))}
        </fieldset>
        <Feedback a={a} />
      </div>
    </Modal>
  );
}
