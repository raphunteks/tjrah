import { createContext, useCallback, useContext, useEffect, useState } from "react";

// Helper untuk mempertahankan query parameter bahasa (?lang=in_ID / ?lang=en_US)
function withPreservedLang(target) {
  if (typeof window === "undefined" || !target) return target;
  try {
    const currentParams = new URLSearchParams(window.location.search);
    const currentLang = currentParams.get("lang");
    if (!currentLang) return target;

    const [pathname, searchAndHash = ""] = target.split("?");
    const [searchStr, hashStr = ""] = searchAndHash.split("#");
    const targetParams = new URLSearchParams(searchStr);

    if (!targetParams.has("lang")) {
      targetParams.set("lang", currentLang);
    }

    const newSearch = targetParams.toString();
    const queryPart = newSearch ? `?${newSearch}` : "";
    const hashPart = hashStr ? `#${hashStr}` : "";
    return `${pathname}${queryPart}${hashPart}`;
  } catch {
    return target;
  }
}

// Router ringan berbasis History API (tanpa dependensi).
const Ctx = createContext({ path: "/", navigate: () => {} });

export function RouterProvider({ children }) {
  const [path, setPath] = useState(() => window.location.pathname);
  useEffect(() => {
    const onPop = () => setPath(window.location.pathname);
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  const navigate = useCallback((to, { replace = false } = {}) => {
    const targetUrl = withPreservedLang(to);
    const targetPath = targetUrl.split("?")[0].split("#")[0];
    const currentFull = window.location.pathname + window.location.search;

    if (targetUrl === currentFull) return;

    window.history[replace ? "replaceState" : "pushState"]({}, "", targetUrl);
    setPath(targetPath);
    window.scrollTo(0, 0);
  }, []);
  return <Ctx.Provider value={{ path, navigate }}>{children}</Ctx.Provider>;
}

export const useRouter = () => useContext(Ctx);

export function Link({ to, children, onClick, ...rest }) {
  const { navigate } = useRouter();
  const href = withPreservedLang(to);
  return (
    <a
      href={href}
      onClick={(e) => {
        onClick?.(e);
        if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
        e.preventDefault();
        navigate(to);
      }}
      {...rest}
    >
      {children}
    </a>
  );
}

