/**
 * Helper Evaluasi 5 Kriteria Kekuatan Kata Sandi:
 * 1. Minimal 8 karakter
 * 2. Huruf besar (A-Z)
 * 3. Huruf kecil (a-z)
 * 4. Angka (0-9)
 * 5. Simbol (~!@#$%^&*)
 */
export function checkPasswordCriteria(password = "") {
  const pwd = String(password || "");
  const hasMinLength = pwd.length >= 8;
  const hasUpperCase = /[A-Z]/.test(pwd);
  const hasLowerCase = /[a-z]/.test(pwd);
  const hasNumber = /[0-9]/.test(pwd);
  const hasSymbol = /[~!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(pwd);

  const isValid = hasMinLength && hasUpperCase && hasLowerCase && hasNumber && hasSymbol;

  return {
    hasMinLength,
    hasUpperCase,
    hasLowerCase,
    hasNumber,
    hasSymbol,
    isValid
  };
}

export function isStrongPassword(password = "") {
  return checkPasswordCriteria(password).isValid;
}
