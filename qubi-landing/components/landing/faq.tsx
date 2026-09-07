"use client";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";

const items = [
  { q: "When is Qubi launching?", a: "Qubi opens for early access in Q1 2026. Sign up now to get an invite within 48 hours of launch." },
  { q: "Is it available on mobile?", a: "Yes — native iOS and Android apps are in development. The web app works on all modern browsers now." },
  { q: "Can I import from Notion or Todoist?", a: "Absolutely. One-click importers for Notion, Todoist, Todo.txt, and iCal are built in." },
  { q: "Will there be a free tier?", a: "Yes. The core focus engine is free forever; premium adds AI scheduling and advanced analytics." },
  { q: "Is my data private?", a: "We encrypt data at rest and in transit. We never sell your information, and you can export everything anytime." },
];

export default function Faq() {
  return (
    <section className="mx-auto max-w-2xl px-6 py-20">
      <h2 className="mb-10 text-center text-3xl font-bold text-white">Frequently Asked Questions</h2>
      <Accordion className="w-full">
        {items.map((item) => (
          <AccordionItem key={item.q} value={item.q}>
            <AccordionTrigger className="text-left text-sm text-white hover:text-blue-300">{item.q}</AccordionTrigger>
            <AccordionContent className="text-sm leading-relaxed text-zinc-400">{item.a}</AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </section>
  );
}