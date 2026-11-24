"use client";

import { useEffect, useState } from "react";

export const DISCLAIMER_TEXT =
  "Educational simulator. Population-average estimate. Not medical or dosing advice.";

const preference = "anatomy-theatre-disclaimer-collapsed";

export default function Disclaimer() {
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    try { setCollapsed(localStorage.getItem(preference) === "yes"); } catch { /* Storage can be unavailable. */ }
  }, []);
  return (
    <footer className="theatre-footer-note">
      <p>{collapsed ? "Educational use only." : DISCLAIMER_TEXT}</p>
      <button type="button" className="theatre-disclaimer-toggle" aria-expanded={!collapsed} onClick={() => {
        const next = !collapsed;
        setCollapsed(next);
        try { localStorage.setItem(preference, next ? "yes" : "no"); } catch { /* The active page still updates. */ }
      }}>{collapsed ? "Show disclaimer" : "Collapse disclaimer"}</button>
    </footer>
  );
}
