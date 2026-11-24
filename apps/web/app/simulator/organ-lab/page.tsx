import type { Metadata } from "next";
import Simulator from "@/components/organ-lab/simulator";
import "./organ-lab.css";

export const metadata: Metadata = {
  title: "Organ Lab — Manava",
  description: "Compare illustrative organ profiles and clearance scenarios in an educational oral pharmacokinetics model.",
};

export default function OrganLabPage() {
  return <Simulator />;
}
