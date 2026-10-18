import { useEffect, useState } from "react";
import { useAuth } from "../../../auth/AuthProvider.jsx";
import { can } from "../../../lib/rbac.js";
import { PageHead, Panel, Loading, ErrorNote, Field, useAsync, Badge } from "../../ui/index.jsx";
import { useLive } from "../../ops.jsx";

function PlatformAI() {
  const { api } = useAuth();
  const s = useAsync(() => api.getSettings(), [api]);
  useLive(["platform_settings"], s.reload);
  const [ai, setAi] = useState(null);
  const [hermes, setHermes] = useState(null);
  const [saved, setSaved] = useState(null);
  const [err, setErr] = useState(null);
  useEffect(() => {
    if (s.data) {
      setAi({ ...s.data.ai_gateway, fallback: (s.data.ai_gateway?.fallback_chain ?? []).join(", ") });
      setHermes({ ...s.data.hermes });
    }
  }, [s.data]);
  if (s.loading || !ai) return <Loading />;
  if (s.error) return <ErrorNote error={s.error} onRetry={s.reload} />;

  const save = async () => {
    setErr(null);
    try {
      const { fallback, ...rest } = ai;
      await api.saveSetting("ai_gateway", { ...rest, timeout_ms: Number(rest.timeout_ms), fallback_chain: fallback.split(",").map((x) => x.trim()).filter(Boolean) });
      await api.saveSetting("hermes", { ...hermes, z_report_hour: Number(hermes.z_report_hour) });
      setSaved(new Date());
    } catch (e) {
      setErr(e.message);
    }
  };

  return (
    <div className="d-grid d-grid--2">
      <Panel title="9router · AI gateway" meta="Konfigurasi platform">
        <div className="d-form">
          <Field label="Base URL" id="ai-url" hint="127.0.0.1 hanya berlaku bila Edge Function satu host dengan 9router">
            <input id="ai-url" value={ai.base_url} onChange={(e) => setAi({ ...ai, base_url: e.target.value })} />
          </Field>
          <div className="d-form__row">
            <Field label="Model default" id="ai-model"><input id="ai-model" value={ai.default_model} onChange={(e) => setAi({ ...ai, default_model: e.target.value })} /></Field>
            <Field label="Timeout (ms)" id="ai-to"><input id="ai-to" type="number" value={ai.timeout_ms} onChange={(e) => setAi({ ...ai, timeout_ms: e.target.value })} /></Field>
          </div>
          <Field label="Urutan failover" id="ai-fb" hint="Pisahkan dengan koma"><input id="ai-fb" value={ai.fallback} onChange={(e) => setAi({ ...ai, fallback: e.target.value })} /></Field>
          <Field label="Nama secret API key" id="ai-secret" hint="Nilai key disimpan di Supabase secrets, tidak pernah di database">
            <input id="ai-secret" className="d-mono" value={ai.secret_name} onChange={(e) => setAi({ ...ai, secret_name: e.target.value })} />
          </Field>
        </div>
      </Panel>
      <Panel title="Hermes Agent" meta="WhatsApp & Discord">
        <div className="d-form">
          <Field label="Secret webhook URL" id="h-url"><input id="h-url" className="d-mono" value={hermes.webhook_url_secret} onChange={(e) => setHermes({ ...hermes, webhook_url_secret: e.target.value })} /></Field>
          <Field label="Secret token" id="h-tok"><input id="h-tok" className="d-mono" value={hermes.token_secret} onChange={(e) => setHermes({ ...hermes, token_secret: e.target.value })} /></Field>
          <Field label="Jam kirim Z-Report (0–23)" id="h-z"><input id="h-z" type="number" min="0" max="23" value={hermes.z_report_hour} onChange={(e) => setHermes({ ...hermes, z_report_hour: e.target.value })} /></Field>
          <label className="d-check">
            <input type="checkbox" checked={hermes.low_stock_alert} onChange={(e) => setHermes({ ...hermes, low_stock_alert: e.target.checked })} />
            <span>Kirim alert stok minimum ke WhatsApp GM</span>
          </label>
        </div>
        <div className="d-form__actions">
          {err && <p className="d-field__error" role="alert">{err}</p>}
          {saved && <p className="d-saved" role="status">Tersimpan {saved.toLocaleTimeString("id-ID")}</p>}
          <button type="button" className="d-btn d-btn--primary" onClick={save}>Simpan konfigurasi</button>
        </div>
      </Panel>
    </div>
  );
}

function TenantIntegration() {
  const { api, role, tenantId } = useAuth();
  const editable = role === "superadmin" && can(role, 1, "u");
  const r = useAsync(() => (tenantId ? api.getIntegration(tenantId) : Promise.resolve(null)), [api, tenantId]);
  useLive(["tenant_integrations"], r.reload);
  const [row, setRow] = useState(null);
  const [saved, setSaved] = useState(null);
  useEffect(() => setRow(r.data ?? (tenantId ? { tenant_id: tenantId, hermes_enabled: false, ai_enabled: false, whatsapp_owner: "", whatsapp_gm: "", discord_alert_channel: "#alert-sistem", discord_report_channel: "#laporan-harian" } : null)), [r.data, tenantId]);

  if (!tenantId) return <Panel title="Integrasi tenant"><p className="d-text d-muted">Pilih tenant di bilah atas untuk mengatur integrasinya.</p></Panel>;
  if (r.loading || !row) return <Loading />;
  if (r.error) return <ErrorNote error={r.error} onRetry={r.reload} />;
  const set = (k) => (e) => setRow({ ...row, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value });

  return (
    <Panel title="Integrasi tenant" meta={editable ? "Dapat diubah" : "Hanya baca (Owner: R pada fitur 1)"}>
      <fieldset className="d-form" disabled={!editable}>
        <div className="d-form__row">
          <label className="d-check"><input type="checkbox" checked={row.hermes_enabled} onChange={set("hermes_enabled")} /><span>Hermes Agent aktif</span></label>
          <label className="d-check"><input type="checkbox" checked={row.ai_enabled} onChange={set("ai_enabled")} /><span>Fitur AI (9router) aktif</span></label>
        </div>
        <div className="d-form__row">
          <Field label="WhatsApp Owner" id="i-wo"><input id="i-wo" value={row.whatsapp_owner ?? ""} onChange={set("whatsapp_owner")} /></Field>
          <Field label="WhatsApp GM" id="i-wg"><input id="i-wg" value={row.whatsapp_gm ?? ""} onChange={set("whatsapp_gm")} /></Field>
        </div>
        <div className="d-form__row">
          <Field label="Discord alert" id="i-da"><input id="i-da" className="d-mono" value={row.discord_alert_channel ?? ""} onChange={set("discord_alert_channel")} /></Field>
          <Field label="Discord laporan" id="i-dr"><input id="i-dr" className="d-mono" value={row.discord_report_channel ?? ""} onChange={set("discord_report_channel")} /></Field>
        </div>
      </fieldset>
      {editable && (
        <div className="d-form__actions">
          {saved && <p className="d-saved" role="status">Tersimpan {saved.toLocaleTimeString("id-ID")}</p>}
          <button type="button" className="d-btn d-btn--primary" onClick={async () => { await api.saveIntegration(row); setSaved(new Date()); }}>Simpan integrasi</button>
        </div>
      )}
    </Panel>
  );
}

export default function Integrations() {
  const { role } = useAuth();
  return (
    <>
      <PageHead
        eyebrow={`Fitur 1 · ${role === "superadmin" ? "CRUD" : "Hanya baca"}`}
        title="9router & Hermes"
        desc={<>Konfigurasi non-rahasia tersimpan di database. API key dan token disimpan sebagai secret Edge Function <Badge>tidak terlihat di browser</Badge></>}
      />
      {role === "superadmin" && <PlatformAI />}
      <TenantIntegration />
    </>
  );
}
