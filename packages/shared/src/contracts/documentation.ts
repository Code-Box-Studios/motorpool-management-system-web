export type GuideBlock =
  | { kind: 'text'; text: string }
  | {
      kind: 'callout';
      tone: 'info' | 'warning' | 'success';
      title: string;
      text: string;
    }
  | {
      kind: 'steps';
      items: { title: string; text: string; expected?: string }[];
    }
  | { kind: 'checklist'; items: string[] }
  | { kind: 'code'; label: string; code: string; description?: string }
  | { kind: 'table'; headings: string[]; rows: string[][] }
  | { kind: 'faq'; items: { question: string; answer: string }[] }
  | { kind: 'link'; label: string; href: string };

export interface GuideSection {
  id: string;
  title: string;
  summary: string;
  blocks: GuideBlock[];
}

export interface DocumentationGuide {
  id: string;
  title: string;
  description: string;
  verifiedOn: string;
  sections: GuideSection[];
}
