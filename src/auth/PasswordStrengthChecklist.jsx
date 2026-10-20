import React from "react";
import { checkPasswordCriteria } from "./passwordRules.js";

export { checkPasswordCriteria };

export default function PasswordStrengthChecklist({ password = "" }) {
  const {
    hasMinLength,
    hasUpperCase,
    hasLowerCase,
    hasNumber,
    hasSymbol
  } = checkPasswordCriteria(password);

  const criteria = [
    { id: "length", label: "Minimal 8 karakter", met: hasMinLength },
    { id: "upper", label: "Huruf besar", met: hasUpperCase },
    { id: "lower", label: "Huruf kecil", met: hasLowerCase },
    { id: "number", label: "Angka", met: hasNumber },
    { id: "symbol", label: "Simbol (~!@#$%^&*)", met: hasSymbol }
  ];

  return (
    <div style={{ marginTop: "0.75rem", marginBottom: "1rem" }}>
      <p
        style={{
          fontSize: "0.82rem",
          fontWeight: 600,
          color: "var(--color-ink-muted, #64748b)",
          marginBottom: "0.5rem"
        }}
      >
        Harus berisi kombinasi dari
      </p>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: "0.45rem 1rem"
        }}
      >
        {criteria.map((item) => (
          <div
            key={item.id}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.45rem",
              fontSize: "0.8rem",
              color: item.met
                ? "var(--color-ink, #0f172a)"
                : "var(--color-ink-muted, #94a3b8)",
              fontWeight: item.met ? 500 : 400,
              transition: "color 0.2s ease"
            }}
          >
            <span
              aria-hidden="true"
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                width: "14px",
                height: "14px",
                borderRadius: "50%",
                border: item.met
                  ? "1.5px solid var(--color-accent, #059669)"
                  : "1.5px solid #cbd5e1",
                background: item.met
                  ? "var(--color-accent, #059669)"
                  : "transparent",
                color: "#ffffff",
                fontSize: "9px",
                fontWeight: 700,
                transition: "all 0.2s ease",
                flexShrink: 0
              }}
            >
              {item.met && (
                <svg
                  width="8"
                  height="8"
                  viewBox="0 0 12 12"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <polyline points="2 6 5 9 10 3" />
                </svg>
              )}
            </span>
            <span>{item.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
