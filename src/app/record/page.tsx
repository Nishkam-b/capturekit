import type { Metadata } from "next";
import { RecordFlow } from "@/components/record/record-flow";

export const metadata: Metadata = { title: "New recording" };

export default function RecordPage() {
  return <RecordFlow />;
}
