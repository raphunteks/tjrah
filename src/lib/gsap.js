import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { ScrollToPlugin } from "gsap/ScrollToPlugin";
import { Flip } from "gsap/Flip";
import { useGSAP } from "@gsap/react";

gsap.registerPlugin(useGSAP, ScrollTrigger, ScrollToPlugin, Flip);
gsap.defaults({ ease: "expo.out", duration: 0.6 });

// Satu sumber kebenaran untuk preferensi gerak.
export const MOTION_OK = "(prefers-reduced-motion: no-preference)";
export const MOTION_REDUCED = "(prefers-reduced-motion: reduce)";

export function prefersReducedMotion() {
  return typeof window !== "undefined" && window.matchMedia(MOTION_REDUCED).matches;
}

export function scrollToY(y) {
  gsap.to(window, { duration: prefersReducedMotion() ? 0 : 0.9, ease: "power3.inOut", scrollTo: { y, autoKill: true } });
}

export function scrollToId(id) {
  const el = document.getElementById(id);
  if (!el) return;
  const reduce = prefersReducedMotion();
  gsap.to(window, {
    duration: reduce ? 0 : 0.9,
    ease: "power3.inOut",
    scrollTo: { y: el, offsetY: 72, autoKill: true },
    onComplete: () => {
      el.setAttribute("tabindex", "-1");
      el.focus({ preventScroll: true });
    },
  });
}

export { gsap, ScrollTrigger, Flip, useGSAP };
