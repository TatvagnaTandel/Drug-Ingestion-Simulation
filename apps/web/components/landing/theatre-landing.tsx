import Link from "next/link";
import { ArrowDown, ArrowRight } from "lucide-react";
import TheatreNav from "../theatre-nav";
import "./theatre-landing.css";

const images = `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/images`;

export default function TheatreLanding() {
  return (
    <div className="theatre landing">
      <TheatreNav />
      <main id="main" tabIndex={-1} className="landing-layout">
        <figure className="landing-rotation">
          <picture>
            <source media="(prefers-reduced-motion: reduce)" srcSet={`${images}/manava-rotation-still.webp`} />
            <img src={`${images}/manava-rotation.webp`} width={576} height={1024} alt="Illustrated anatomy rotating to show the digestive tract from different angles" fetchPriority="high" />
          </picture>
        </figure>
        <section className="landing-intro" aria-labelledby="landing-title">
          <div>
            <h1 id="landing-title">A small dose.<br /><span>A whole journey.</span></h1>
            <p>See pharmacokinetics in motion. Follow an oral dose through the body, then explore how its concentration changes over time.</p>
            <div className="landing-actions">
              <Link href="/simulator" className="theatre-button theatre-primary">Open the simulator <ArrowRight size={17} aria-hidden="true" /></Link>
            </div>
          </div>
          <a href="#explore" className="landing-text-link landing-scroll">Inside the experience <ArrowDown size={15} aria-hidden="true" /></a>
        </section>
        <section id="explore" className="landing-details" aria-labelledby="explore-title">
          <h2 id="explore-title">Follow it.<br /><span>Understand it.</span></h2>
          <p>Trace absorption, circulation and clearance through a guided study, or inspect the organs in your own order.</p>
        </section>
      </main>
      <footer className="landing-footer">
        <span>Manava</span>
        <nav aria-label="Footer navigation">
          <Link href="/simulator/organ-lab">Organ Lab</Link>
          <Link href="/simulator#studies">Studies</Link>
          <Link href="/how-it-works">How it works</Link>
          <Link href="/signin">Account</Link>
          <Link href="/about">About</Link>
        </nav>
      </footer>
    </div>
  );
}
