"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowUpRight } from "lucide-react";

export default function TheatreNav({ onSetup }: { onSetup?: () => void }) {
  const pathname = usePathname().replace(/\/$/, "") || "/";
  return (
    <header className="theatre-nav">
      <a href="#main" className="theatre-skip">Skip to content</a>
      <div className="theatre-nav-inner">
        <Link className="theatre-wordmark" href="/">
          <img className="theatre-emblem" src={`${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/images/manava-logo.webp`} alt="" width={35} height={35} />
          <span>Manava<small>Drug journey simulator</small></span>
        </Link>
        {pathname !== "/" && <>
          <nav aria-label="Main navigation">
            <Link href="/simulator" aria-current={pathname === "/simulator" ? "page" : undefined}>Simulator</Link>
            <Link href="/simulator/organ-lab" aria-current={pathname === "/simulator/organ-lab" ? "page" : undefined}>Organ Lab</Link>
            <Link href="/simulator#studies">Studies</Link>
            <Link href="/how-it-works" aria-current={pathname === "/how-it-works" ? "page" : undefined}>How it works</Link>
            <Link href="/about" aria-current={pathname === "/about" ? "page" : undefined}>About</Link>
          </nav>
          <div className="theatre-nav-actions">
            <Link href="/signin" className="theatre-account">Account <ArrowUpRight size={13} aria-hidden="true" /></Link>
            {onSetup ? <button type="button" className="theatre-button theatre-primary" onClick={onSetup}>Setup</button> : null}
          </div>
        </>}
      </div>
    </header>
  );
}
